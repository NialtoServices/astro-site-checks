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
    const match = headers.match(new RegExp(`^\\s*${headerName}: (.*)$`, 'mi'))
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

/** An attribute's value on one element, or `undefined` when it is absent. */
function attributeOf(element, name) {
  return element.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1]
}

/** What a `<link>` loads, judged by its `rel` tokens and, for a preload, what it preloads. */
const PRELOAD_KIND_FOR_AS = { font: 'font', style: 'style', script: 'script', image: 'img' }

/** Every externally loaded resource in a page, as `{ kind, origin }`. Links are not loads. */
export function extractLoadedOrigins(html) {
  const loaded = []
  for (const match of html.matchAll(/<(script|img|iframe)\b[^>]*?\ssrc="(https?:\/\/[^"]+)"/g)) {
    loaded.push({ kind: match[1], origin: new URL(match[2]).origin })
  }

  // Attributes are read from the whole element, since a `<link>` carries `rel`, `href` and `as` in
  // whatever order its author wrote them.
  for (const [element] of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = attributeOf(element, 'href')
    if (!href || !/^https?:\/\//i.test(href)) continue

    const relations = (attributeOf(element, 'rel') ?? '').toLowerCase().split(/\s+/)
    if (relations.includes('stylesheet')) {
      loaded.push({ kind: 'style', origin: new URL(href).origin })
    } else if (relations.includes('preload')) {
      const preloaded = (attributeOf(element, 'as') ?? '').toLowerCase()
      loaded.push({ kind: PRELOAD_KIND_FOR_AS[preloaded] ?? 'preload', origin: new URL(href).origin })
    }
  }

  return loaded
}

const DIRECTIVE_FOR_KIND = {
  script: 'script-src',
  img: 'img-src',
  iframe: 'frame-src',
  style: 'style-src',
  font: 'font-src',
  preload: 'default-src'
}

/**
 * Whether a policy source covers an origin. A source may be a scheme (`https:`), a host with or without a
 * scheme, a host wildcard (`*.a.com`, which covers subdomains and not the domain itself), and may carry a
 * path, which does not narrow the origin it allows.
 */
export function originAllowedBy(source, origin) {
  if (source === '*' || source === origin) return true

  const { protocol, host } = new URL(origin)
  if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return source.toLowerCase() === protocol

  const parts = source.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/]+)/i)
  if (!parts) return false

  const [, scheme, sourceHost] = parts
  if (scheme && `${scheme.toLowerCase()}:` !== protocol) return false
  if (!sourceHost.startsWith('*.')) return sourceHost.toLowerCase() === host

  return host.endsWith(sourceHost.slice(1).toLowerCase())
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
