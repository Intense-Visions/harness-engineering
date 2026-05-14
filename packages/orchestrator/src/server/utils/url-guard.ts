const PRIVATE_HOSTNAME_RE = /^(localhost|.*\.local)$/i;
const PRIVATE_IPV4_RE =
  /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0)$/;
const LOOPBACK_IPV6_RE = /^(::1|::ffff:127\.\d+\.\d+\.\d+|::ffff:0:127\.\d+\.\d+\.\d+)$/i;

export function isPrivateHost(hostname: string): boolean {
  return (
    PRIVATE_HOSTNAME_RE.test(hostname) ||
    PRIVATE_IPV4_RE.test(hostname) ||
    LOOPBACK_IPV6_RE.test(hostname)
  );
}
