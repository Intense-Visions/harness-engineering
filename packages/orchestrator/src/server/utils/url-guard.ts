import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_HOSTNAME_RE = /^(localhost|.*\.local)$/i;
const PRIVATE_IPV4_RE =
  /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0)$/;
const LOOPBACK_IPV6_RE = /^(::1|::ffff:127\.\d+\.\d+\.\d+|::ffff:0:127\.\d+\.\d+\.\d+)$/i;

/**
 * Literal-only check: does this hostname *spell* a private/loopback target?
 *
 * This is a string match, not a network decision. It cannot see through a
 * public name that resolves to a private address, so it is only ever safe as
 * a cheap pre-filter in front of `guardOutboundHost`. Callers deciding whether
 * to open an outbound connection MUST use `guardOutboundHost`.
 */
export function isPrivateHost(hostname: string): boolean {
  return (
    PRIVATE_HOSTNAME_RE.test(hostname) ||
    PRIVATE_IPV4_RE.test(hostname) ||
    LOOPBACK_IPV6_RE.test(hostname)
  );
}

/**
 * IPv4 ranges we refuse to open a connection to, as CIDR strings.
 *
 * Beyond the loopback/RFC-1918/link-local set the old regex covered, this also
 * refuses RFC-6598 CGNAT (which doubles as a Kubernetes pod/service CIDR and as
 * Alibaba Cloud's metadata endpoint at 100.100.100.200), the IETF protocol
 * assignments block (Oracle Cloud's legacy metadata address lives at
 * 192.0.0.192), the benchmarking block, multicast, and the reserved 240/4 range
 * that ends in the broadcast address. None is a legitimate webhook receiver,
 * and each has been used as an SSRF target.
 */
const PRIVATE_IPV4_CIDRS = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // RFC-1918
  '100.64.0.0/10', // RFC-6598 CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local, incl. cloud metadata
  '172.16.0.0/12', // RFC-1918
  '192.0.0.0/24', // RFC-6890 protocol assignments
  '192.168.0.0/16', // RFC-1918
  '198.18.0.0/15', // RFC-2544 benchmarking
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, incl. 255.255.255.255 broadcast
] as const;

function toUint32(a: number, b: number, c: number, d: number): number {
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = PRIVATE_IPV4_CIDRS.map(
  (cidr) => {
    const [network = '', bits = '0'] = cidr.split('/');
    const [a = 0, b = 0, c = 0, d = 0] = network.split('.').map(Number);
    const mask = (0xffffffff << (32 - Number(bits))) >>> 0;
    return [(toUint32(a, b, c, d) & mask) >>> 0, mask] as const;
  }
);

function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  const value = toUint32(a, b, c, d);
  return PRIVATE_IPV4_RANGES.some(([base, mask]) => (value & mask) >>> 0 === base);
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.');
  if (octets.length !== 4) return false;
  const parts = octets.map((o) => Number(o));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c, d] = parts as [number, number, number, number];
  return isPrivateIpv4Octets(a, b, c, d);
}

/** The v4 address embedded in two IPv6 hextets, e.g. 0x7f00,0x0001 -> 127.0.0.1. */
function isPrivateEmbeddedIpv4(hi: number, lo: number): boolean {
  return isPrivateIpv4Octets((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff);
}

/** One `:`-separated group: a hex hextet, or a trailing dotted quad worth two. */
function parseIpv6Group(group: string): number[] | null {
  if (group.includes('.')) {
    const octets = group.split('.').map(Number);
    if (octets.length !== 4) return null;
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const [a, b, c, d] = octets as [number, number, number, number];
    return [(a << 8) | b, (c << 8) | d];
  }
  if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  return [Number.parseInt(group, 16)];
}

function parseIpv6Segment(segment: string): number[] | null {
  if (segment === '') return [];
  const out: number[] = [];
  for (const group of segment.split(':')) {
    const parsed = parseIpv6Group(group);
    if (parsed === null) return null;
    out.push(...parsed);
  }
  return out;
}

/**
 * Expand an IPv6 address to its eight 16-bit groups, or null if unparseable.
 *
 * Full expansion rather than prefix matching, because neither an abbreviated
 * group nor an embedded-IPv4 form is the prefix it looks like: `fc0::1` has a
 * leading group of 0x0fc0 (outside fc00::/7, so a `startsWith('fc')` would
 * wrongly block it), while `::ffff:7f00:1` and `::ffff:127.0.0.1` are the same
 * address written two ways and must classify identically.
 */
function expandIpv6(ip: string): number[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = parseIpv6Segment(halves[0] ?? '');
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = parseIpv6Segment(halves[1] ?? '');
  if (tail === null) return null;
  const gap = 8 - head.length - tail.length;
  if (gap < 0) return null;
  return [...head, ...(Array(gap).fill(0) as number[]), ...tail];
}

/**
 * The two hextets holding an embedded IPv4 address, or null if this address
 * does not embed one.
 *
 * Covers v4-mapped (`::ffff:a.b.c.d`, and equivalently `::ffff:7f00:1`),
 * v4-compatible (`::a.b.c.d`, which also subsumes `::` and `::1`),
 * v4-translated (`::ffff:0:a.b.c.d`), NAT64 (`64:ff9b::/96`) and 6to4
 * (`2002::/16`). NAT64 matters wherever the host sits behind a NAT64 gateway —
 * IPv6-only cloud subnets — where `64:ff9b::a9fe:a9fe` translates to the
 * 169.254.169.254 metadata address.
 */
function embeddedIpv4Hextets(h: readonly number[]): readonly [number, number] | null {
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0] = h;
  const topFourZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0;
  if (topFourZero && h4 === 0 && (h5 === 0xffff || h5 === 0)) return [h6, h7];
  if (topFourZero && h4 === 0xffff && h5 === 0) return [h6, h7];
  if (h0 === 0x0064 && h1 === 0xff9b) return [h6, h7];
  if (h0 === 0x2002) return [h1, h2];
  return null;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = (ip.replace(/^\[|\]$/g, '').split('%')[0] ?? '').toLowerCase();
  const h = expandIpv6(normalized);
  if (h === null) return false;
  const embedded = embeddedIpv4Hextets(h);
  if (embedded !== null) return isPrivateEmbeddedIpv4(embedded[0], embedded[1]);
  const h0 = h[0] ?? 0;
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * Is this *resolved address* one we refuse to open a connection to?
 *
 * Covers the IPv4 loopback/private/CGNAT/link-local/multicast/reserved ranges
 * and the IPv6 unspecified, loopback, unique-local, link-local and multicast
 * ranges. Every IPv6 form that embeds an IPv4 address — v4-mapped (in either
 * dotted or hex spelling), v4-compatible, v4-translated, NAT64 and 6to4 — is
 * unwrapped and classified as IPv4, so a mapped spelling cannot smuggle a
 * private v4 address past the v6 branch.
 */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  if (bare.includes(':')) return isPrivateIpv6(bare);
  return isPrivateIpv4(bare);
}

export type HostGuardReason = 'private-literal' | 'private-address' | 'dns-failure';

export interface HostGuardVerdict {
  blocked: boolean;
  reason?: HostGuardReason;
  detail?: string;
}

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: HostLookup = (hostname) => lookup(hostname, { all: true });

/**
 * Decide whether an outbound request to `hostname` is allowed to leave.
 *
 * Three stages: the literal pre-filter (`isPrivateHost`, no network), an
 * IP-literal fast path, then DNS resolution — because a perfectly ordinary
 * public hostname can carry an A record pointing at loopback or at
 * 169.254.169.254, and a string match will never see it. Every resolved address
 * must be public; one private address in the set blocks the whole host, which
 * also closes the A/AAAA mismatch where the guard checks one family and the
 * connector picks the other.
 *
 * Resolution failure blocks, and so does an empty address list. A host that
 * will not resolve cannot be delivered to anyway, so failing closed costs no
 * legitimate traffic, and the distinct `dns-failure` reason keeps a resolver
 * outage diagnosable rather than indistinguishable from an attack.
 *
 * `detail` may carry a resolved internal address or a raw resolver error. It is
 * for server-side logs and the dead-letter record — do not put it in an HTTP
 * response body, where it would become an internal-network oracle.
 *
 * KNOWN RESIDUAL RISK: this resolves the name, but the connection that follows
 * resolves it a second time. A record that changes between the two (DNS
 * rebinding with a short TTL) can still land on a private address. Closing that
 * requires pinning the resolved IP at connect time via a custom dispatcher.
 */
export async function guardOutboundHost(
  hostname: string,
  opts?: { lookup?: HostLookup | undefined }
): Promise<HostGuardVerdict> {
  if (isPrivateHost(hostname)) {
    return { blocked: true, reason: 'private-literal', detail: hostname };
  }
  // An IP literal needs no resolution. `URL.hostname` hands back IPv6 literals
  // bracketed, which `dns.lookup` rejects — without this branch every
  // IPv6-literal target would be refused as a DNS failure.
  const bareLiteral = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bareLiteral) !== 0) {
    return isPrivateAddress(bareLiteral)
      ? { blocked: true, reason: 'private-literal', detail: bareLiteral }
      : { blocked: false };
  }
  const resolve = opts?.lookup ?? defaultLookup;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolve(hostname);
  } catch (err) {
    return {
      blocked: true,
      reason: 'dns-failure',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (addresses.length === 0) {
    return { blocked: true, reason: 'dns-failure', detail: 'no addresses resolved' };
  }
  const offending = addresses.find((a) => isPrivateAddress(a.address));
  if (offending) {
    return { blocked: true, reason: 'private-address', detail: offending.address };
  }
  return { blocked: false };
}
