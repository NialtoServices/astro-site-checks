import { describe, expect, it } from 'vitest'
import { extractLoadedOrigins, findPolicyViolations, originAllowedBy, parsePolicy } from '../src/csp.mjs'

const HEADERS = [
  '/*',
  "  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://*.googletagmanager.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.googletagmanager.com"
].join('\n')

describe('checking a page against the policy', () => {
  const policy = parsePolicy(HEADERS)

  it('reads the resources a page loads, and ignores ordinary links', () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js"></script>
      <a href="https://www.linkedin.com/company/x/">LinkedIn</a>
      <iframe src="https://challenges.cloudflare.com/turnstile/"></iframe>`

    expect(extractLoadedOrigins(html)).toEqual([
      { kind: 'script', origin: 'https://www.googletagmanager.com' },
      { kind: 'iframe', origin: 'https://challenges.cloudflare.com' }
    ])
  })

  it('passes the origins the policy allows', () => {
    const html = `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>
      <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe>`

    expect(findPolicyViolations(html, policy)).toEqual([])
  })

  it('matches a host wildcard against any of its subdomains, and nothing above them', () => {
    expect(originAllowedBy('https://*.google-analytics.com', 'https://region1.google-analytics.com')).toBe(true)
    expect(originAllowedBy('https://*.google-analytics.com', 'https://google-analytics.com')).toBe(false)
    expect(originAllowedBy('https://*.google-analytics.com', 'https://region1.google-analytics.com.evil.test')).toBe(
      false
    )
    expect(originAllowedBy('https://*.google-analytics.com', 'http://region1.google-analytics.com')).toBe(false)
  })

  it('catches a script origin the policy does not allow', () => {
    const html = '<script src="https://cdn.example.com/widget.js"></script>'

    expect(findPolicyViolations(html, policy)).toEqual([
      { kind: 'script', origin: 'https://cdn.example.com', directive: 'script-src' }
    ])
  })

  it('falls back to default-src for a kind with no directive of its own, and names the missing directive', () => {
    expect(findPolicyViolations('<img src="https://images.example.com/a.png">', policy)).toEqual([
      { kind: 'img', origin: 'https://images.example.com', directive: 'img-src' }
    ])
  })
})

describe('parsePolicy', () => {
  it('ignores the header name in a comment', () => {
    const headers = [
      '# Rename to Content-Security-Policy once clean',
      '/*',
      "  Content-Security-Policy-Report-Only: default-src 'self'"
    ].join('\n')

    expect(parsePolicy(headers)?.get('default-src')).toEqual(["'self'"])
  })

  it('prefers the enforced policy when both ship', () => {
    const headers = [
      '/*',
      "  Content-Security-Policy-Report-Only: default-src 'self' https://report.example",
      "  Content-Security-Policy: default-src 'self'"
    ].join('\n')

    expect(parsePolicy(headers)?.get('default-src')).toEqual(["'self'"])
  })

  it('returns nothing when no policy ships', () => {
    expect(parsePolicy('/*\n  X-Content-Type-Options: nosniff')).toBeUndefined()
  })
})

describe('policy source forms sites write', () => {
  it('accepts a scheme source for any origin on that scheme', () => {
    expect(originAllowedBy('https:', 'https://images.example.com')).toBe(true)
    expect(originAllowedBy('https:', 'http://images.example.com')).toBe(false)
  })

  it('accepts a host written without a scheme, including a wildcard host', () => {
    expect(originAllowedBy('challenges.cloudflare.com', 'https://challenges.cloudflare.com')).toBe(true)
    expect(originAllowedBy('*.google-analytics.com', 'https://region1.google-analytics.com')).toBe(true)
    expect(originAllowedBy('challenges.cloudflare.com', 'https://evil.example')).toBe(false)
  })

  it('accepts a source that carries a path', () => {
    expect(originAllowedBy('https://fonts.gstatic.com/', 'https://fonts.gstatic.com')).toBe(true)
    expect(originAllowedBy('https://cdn.example.com/lib/', 'https://cdn.example.com')).toBe(true)
  })

  it('reads a header name in any case', () => {
    expect(parsePolicy("/*\n  content-security-policy-report-only: default-src 'self'")?.get('default-src')).toEqual([
      "'self'"
    ])
  })
})

describe('link elements', () => {
  it('reads a stylesheet whose href comes before its rel', () => {
    expect(extractLoadedOrigins('<link href="https://evil.example/a.css" rel="stylesheet">')).toEqual([
      { kind: 'style', origin: 'https://evil.example' }
    ])
  })

  it('reads rel as a list of tokens', () => {
    expect(extractLoadedOrigins('<link rel="alternate stylesheet" href="https://cdn.example.com/b.css">')).toEqual([
      { kind: 'style', origin: 'https://cdn.example.com' }
    ])
  })

  it('judges a preloaded font by font-src', () => {
    const policy = parsePolicy(
      "/*\n  Content-Security-Policy-Report-Only: default-src 'self'; font-src https://fonts.gstatic.com"
    )
    const html = '<link rel="preload" as="font" href="https://fonts.gstatic.com/s/a.woff2" crossorigin>'

    expect(findPolicyViolations(html, policy)).toEqual([])
  })
})
