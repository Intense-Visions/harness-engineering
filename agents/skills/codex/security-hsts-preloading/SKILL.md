# HSTS and Preloading

> Tell the browser "never connect to this domain over HTTP, ever" -- and make it permanent
> by embedding the directive in every browser's shipped preload list

## When to Use

- Deploying HTTPS for a new domain and need to prevent HTTP downgrade attacks
- Configuring security headers for production web applications
- Evaluating whether to submit a domain to the HSTS preload list
- Auditing existing HSTS configuration for correctness
- Understanding SSL stripping attacks and how HSTS prevents them

## Threat Context

SSL stripping attacks (first demonstrated by Moxie Marlinspike at Black Hat 2009)
intercept the initial HTTP request before the redirect to HTTPS and maintain a plaintext
connection with the victim while establishing HTTPS with the server. The attacker proxies
all traffic, rewriting HTTPS links to HTTP. The victim sees a working website with no
browser warning because the connection was never upgraded to HTTPS in the first place.
Tools like sslstrip automate this attack entirely. On public Wi-Fi networks, SSL stripping
is trivial to execute with ARP spoofing. HSTS eliminates this by telling the browser to
never attempt HTTP for the domain after the first successful HTTPS visit. The browser
internally rewrites any `http://` URL to `https://` before sending the request. HSTS
preloading eliminates even the first-visit vulnerability by shipping the directive in the
browser itself -- the browser knows to use HTTPS before it has ever visited the domain.

## Instructions

1. **Set the HSTS header on all HTTPS responses.**
   `Strict-Transport-Security: max-age=31536000; includeSubDomains`. The `max-age=31536000`
   directive means the browser will remember the HSTS policy for 1 year (31,536,000
   seconds). `includeSubDomains` applies the directive to all subdomains, not just the
   apex domain. After receiving this header over a valid HTTPS connection, the browser
   will refuse to connect to the domain over HTTP for the specified duration, automatically
   upgrading any HTTP URL to HTTPS internally.

2. **Redirect HTTP to HTTPS first.** HSTS only works if the browser receives it over a
   valid HTTPS connection. Set up an HTTP-to-HTTPS 301 (permanent) redirect on all HTTP
   endpoints. The HSTS header must be sent on the HTTPS response -- it is ignored on HTTP
   responses per RFC 6797. The redirect ensures users who type `http://` are upgraded,
   and the HSTS header ensures they stay upgraded.

3. **Ramp up max-age gradually.** Start with a short max-age (5 minutes = 300 seconds)
   while testing. Verify no mixed content issues, no broken subdomains, no HTTP-only
   internal tools that would be affected. Increase to 1 week (604800), then 1 month
   (2592000), then 1 year (31536000). If HSTS is deployed with a 1-year max-age and
   HTTPS breaks (certificate expired, misconfiguration), the domain is inaccessible for
   up to 1 year for users who cached the directive. There is no way to revoke an HSTS
   directive from the server side once cached.

4. **Submit to the HSTS preload list.** Once max-age is at least 1 year,
   `includeSubDomains` is set, and a `preload` directive is added
   (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`), submit
   the domain at hstspreload.org. Once accepted, every Chrome, Firefox, Safari, and Edge
   browser ships with the directive baked in at build time. The first-visit vulnerability
   is eliminated entirely. This is the strongest transport security guarantee available.

5. **Ensure all subdomains support HTTPS before adding `includeSubDomains`.** If any
   subdomain serves HTTP-only content (legacy internal tools, staging environments,
   development servers, marketing landing pages on a subdomain), `includeSubDomains` will
   break it. Audit all subdomains -- including those managed by other teams, third-party
   services using CNAME records, and forgotten legacy systems -- before enabling
   `includeSubDomains`.

6. **Understand preload list removal is slow.** Removing a domain from the preload list
   requires: removing the `preload` directive from the header, submitting a removal
   request at hstspreload.org, waiting for browser vendors to process it (weeks to
   months), and then waiting for all users to update their browsers. Full removal can take
   6-12 months. This is intentional -- preloading is a commitment, not a toggle.

## Details

### SSL Stripping Attack Flow

1. Victim connects to `http://bank.com` (typed without `https://` or clicked a link)
2. Attacker on the same network intercepts the HTTP request (via ARP spoofing, rogue AP)
3. Attacker connects to `https://bank.com` on behalf of the victim
4. Attacker proxies all traffic, rewriting `https://` links in responses to `http://`
5. Victim sees a fully functional bank website served over HTTP
6. Attacker captures all credentials, session tokens, and financial data in plaintext

The victim has no browser warning because the connection was HTTP from the start. HSTS
defeats this because the browser knows (from a previous visit or the preload list) that
bank.com must use HTTPS and refuses to send any HTTP request.

### HSTS Preload List Mechanics

The preload list is maintained as a JSON file in the Chromium source code
(`net/http/transport_security_state_static.json`). Firefox, Safari, and Edge consume the
same list. Submission requirements: the `preload` directive in the HSTS header,
`includeSubDomains` directive, max-age of at least 31536000 (1 year), valid HTTPS on the
apex domain (not just `www`), and valid HTTPS on all subdomains. The list is checked at
browser build time and shipped with each browser release, not fetched at runtime.

### Common Deployment Mistakes

- Mixed content: loading images, scripts, or stylesheets over HTTP from an HTTPS page
  (browsers block or warn, degrading user experience)
- Redirect loops: HTTP redirects to HTTPS which redirects back to HTTP
- Subdomains without HTTPS: `internal.example.com` only serves HTTP, but
  `includeSubDomains` forces HTTPS
- HSTS header on HTTP responses: ignored by spec, but confusing during debugging
- Setting `max-age=0` accidentally: disables HSTS, removing protection

### Testing HSTS Configuration

Before deploying HSTS to production, verify the configuration thoroughly. Use
`curl -sI https://example.com | grep -i strict` to check the header is present and
correctly formatted. Use the Qualys SSL Labs test (ssllabs.com/ssltest) which reports
HSTS status, max-age, and preload eligibility. Use hstspreload.org to check whether the
domain meets all preload requirements. Test from multiple clients and browsers: some
proxies strip security headers, and some CDN configurations do not forward them. Verify
that the header is not sent on HTTP responses (it should only appear on HTTPS). Test
subdomain coverage by checking HTTPS on every subdomain you can discover.

### Interaction with Other Security Headers

HSTS works with `Content-Security-Policy: upgrade-insecure-requests` which automatically
rewrites HTTP sub-resource URLs to HTTPS within the page. Together they ensure that both
navigation and sub-resource loading use HTTPS. HSTS also interacts with
`Referrer-Policy`: HTTPS-to-HTTP transitions strip the referrer header, which HSTS
prevents by ensuring all connections are HTTPS. The combination of HSTS, CSP
upgrade-insecure-requests, and proper referrer policy creates a comprehensive transport
security posture.

## Anti-Patterns

1. **HSTS without testing subdomains.** Enabling `includeSubDomains` when
   `legacy.example.com` only serves HTTP breaks that subdomain for the HSTS max-age
   duration. Users cannot bypass this -- the browser refuses to connect. Audit all
   subdomains first, including those managed by other teams.

2. **max-age of 0 in production.** `max-age=0` disables HSTS for any browser that
   receives it. If an attacker can force the browser to receive this header (via MITM on
   the first request before HSTS is cached), HSTS protection is removed for that user.
   Never set max-age to 0 in production.

3. **Preloading before readiness.** Submitting to the preload list before all subdomains
   support HTTPS, before the team understands the commitment, or before testing with a
   long max-age. Preload removal takes months and requires browser updates to propagate.
   Treat preloading as irreversible for practical purposes.

4. **HSTS on HTTP responses.** The `Strict-Transport-Security` header on an HTTP response
   is ignored per RFC 6797 Section 7.2. If browsers honored it on HTTP, an attacker could
   inject this header on an HTTP response to DoS a domain by forcing HTTPS on a domain
   that does not support it. Browsers correctly ignore it on HTTP, but its presence
   indicates a misconfiguration.

5. **Relying only on HTTP-to-HTTPS redirects.** Redirects alone do not prevent SSL
   stripping. The first request is still HTTP and interceptable. The redirect itself
   travels over HTTP and can be modified by the attacker. HSTS ensures subsequent requests
   are HTTPS without relying on a redirect. Preloading ensures even the first request is
   HTTPS.
