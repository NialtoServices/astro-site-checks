import { describe, expect, it } from 'vitest'
import { extractInternalPaths, isServable, servedPathOf } from '../src/built-site.mjs'

const servablePaths = new Set(['/about-us/', '/about-us/index.html', '/sitemap-index.xml', '/favicon.ico'])

describe('isServable', () => {
  it('resolves a page with or without its trailing slash', () => {
    expect(isServable(servablePaths, '/about-us/')).toBe(true)
    expect(isServable(servablePaths, '/about-us')).toBe(true)
    expect(isServable(servablePaths, '/about-us/index.html')).toBe(true)
  })

  it('resolves a file that is not a page', () => {
    expect(isServable(servablePaths, '/sitemap-index.xml')).toBe(true)
    expect(isServable(servablePaths, '/favicon.ico')).toBe(true)
  })

  it('rejects a path the build does not hold', () => {
    expect(isServable(servablePaths, '/about/')).toBe(false)
    expect(isServable(servablePaths, '/sitemap.xml')).toBe(false)
  })
})

describe('servedPathOf', () => {
  it('reads a directory index as the directory itself', () => {
    expect(servedPathOf('dist/client', 'dist/client/about-us/index.html')).toBe('/about-us/')
    expect(servedPathOf('dist/client', 'dist/client/index.html')).toBe('/')
    expect(servedPathOf('dist/client', 'dist/client/404.html')).toBe('/404.html')
  })
})

describe('extractInternalPaths', () => {
  it('keeps root-relative links and drops fragments and query strings', () => {
    const paths = extractInternalPaths('<a href="/about-us/">a</a><a href="/contact-us/?x=1#form">b</a>')

    expect(paths).toEqual(['/about-us/', '/contact-us/'])
  })

  it('ignores other hosts, in-page anchors, and mailto and tel links', () => {
    const html =
      '<a href="https://example.com/x/">a</a><a href="#contact-form">b</a>' +
      '<a href="mailto:hello@example.com">c</a><a href="tel:+441234567890">d</a>'

    expect(extractInternalPaths(html)).toEqual([])
  })

  it('ignores absolute links back to the site, which the head writes on purpose', () => {
    const html = '<link rel="canonical" href="https://example.com/about-us/" />'

    expect(extractInternalPaths(html)).toEqual([])
  })

  it('treats a protocol-relative href as another host, not an internal path', () => {
    const html = '<script src="//cdn.example.com/a.js"></script><a href="//example.com/about/">About</a>'

    expect(extractInternalPaths(html)).toEqual([])
  })
})
