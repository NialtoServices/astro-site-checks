/**
 * Checks the built pages against the shipped Content-Security-Policy.
 *
 * A report-only policy tells nobody anything until real traffic hits it, and the origins a page loads
 * change as components are added. This closes the gap for the ones the build can see: anything the
 * markup itself fetches is compared to the policy, so a new external script fails a check here rather
 * than a browser console after launch. Origins the GTM container injects at runtime are invisible to
 * this and remain the reason the policy stays report-only.
 */

const POLICY_HEADERS = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']

/**
 * The directives of the site's policy in a `_headers` file: the enforced header when it ships, since that
 * is the one a browser applies, else the report-only one. A header name inside a comment is not a header.
 */
export function parsePolicy(headers) {
  for (const headerName of POLICY_HEADERS) {
    const match = headers.match(new RegExp(`^\\s*${headerName}: (.*)$`, 'm'))
    if (!match) continue

    const directives = new Map()
    for (const part of match[1].split(';')) {
      const [name, ...values] = part.trim().split(/\s+/)
      if (name) directives.set(name, values)
    }

    return directives
  }

  return undefined
}

/** Every externally loaded resource in a page, as `{ kind, origin }`. Links are not loads. */
export function extractLoadedOrigins(html) {
  const loaded = []
  for (const match of html.matchAll(/<(script|img|iframe)\b[^>]*?\ssrc="(https?:\/\/[^"]+)"/g)) {
    loaded.push({ kind: match[1], origin: new URL(match[2]).origin })
  }

  for (const match of html.matchAll(/<link\b[^>]*?\srel="(stylesheet|preload)"[^>]*?\shref="(https?:\/\/[^"]+)"/g)) {
    loaded.push({ kind: match[1] === 'stylesheet' ? 'style' : 'preload', origin: new URL(match[2]).origin })
  }

  return loaded
}

const DIRECTIVE_FOR_KIND = {
  script: 'script-src',
  img: 'img-src',
  iframe: 'frame-src',
  style: 'style-src',
  preload: 'default-src'
}

/** Whether a policy source covers an origin. A source may name a host wildcard: `https://*.a.com`. */
export function originAllowedBy(source, origin) {
  if (source === '*' || source === origin) return true

  const wildcard = source.match(/^(https?:\/\/)\*\.(.+)$/)
  if (!wildcard) return false

  const [, scheme, domain] = wildcard

  return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(`.${domain}`)
}

/**
 * Origins a page loads that its policy does not allow, falling back to `default-src` the way a
 * browser does when a directive is absent.
 */
export function findPolicyViolations(html, policy) {
  const violations = []
  for (const { kind, origin } of extractLoadedOrigins(html)) {
    const directive = DIRECTIVE_FOR_KIND[kind] ?? 'default-src'
    const allowed = policy.get(directive) ?? policy.get('default-src') ?? []
    if (allowed.some((source) => originAllowedBy(source, origin))) continue

    violations.push({ kind, origin, directive })
  }

  return violations
}
