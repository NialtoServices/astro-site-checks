import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectServablePaths, extractInternalPaths, isServable, servedPathOf } from '../src/built-site.mjs'
import { barePagePath, filePath, lineOfText, pagePath } from './arbitraries.mjs'

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

describe('properties', () => {
  it('serves every built page and file at the path a link would use, and nothing it did not build', async () => {
    const build = fc.record({
      pages: fc.uniqueArray(barePagePath, { maxLength: 6 }),
      files: fc.uniqueArray(filePath, { maxLength: 6 })
    })

    await fc.assert(
      fc.asyncProperty(build, async ({ pages, files }) => {
        const directory = await mkdtemp(join(tmpdir(), 'site-checks-'))
        const pageFiles = pages.map((page) => join(directory, page, 'index.html'))
        for (const file of [...pageFiles, ...files.map((path) => join(directory, path))]) {
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, '')
        }

        const servablePaths = await collectServablePaths(directory)
        for (const [index, page] of pages.entries()) {
          expect(servedPathOf(directory, pageFiles[index])).toBe(`${page}/`)
          expect(isServable(servablePaths, `${page}/`)).toBe(true)
          expect(isServable(servablePaths, page)).toBe(true)
        }
        for (const file of files) expect(isServable(servablePaths, file)).toBe(true)

        // Generated segments are lowercase, so an uppercase one names a path no build here wrote.
        expect(isServable(servablePaths, '/Unbuilt/')).toBe(false)
      }),
      { numRuns: 25 }
    )
  })

  it("keeps a root-relative link's path, whatever query string or fragment follows it", () => {
    const suffix = fc.tuple(
      fc.option(lineOfText.map((text) => `?${text}`)),
      fc.option(lineOfText.map((text) => `#${text}`))
    )
    const attributeSafe = (text) => !text.includes('"')

    fc.assert(
      fc.property(fc.oneof(pagePath, filePath), suffix, (path, [query, fragment]) => {
        const href = `${path}${query ?? ''}${fragment ?? ''}`
        fc.pre(attributeSafe(href))

        expect(extractInternalPaths(`<a href="${href}">link</a>`)).toEqual([path])
      })
    )
  })

  it('drops every link that leaves the site or stays on the page', () => {
    const external = fc.oneof(
      pagePath.map((path) => `https://elsewhere.example${path}`),
      pagePath.map((path) => `//cdn.example${path}`),
      fc.constant('mailto:hello@example.com'),
      fc.constant('tel:+441234567890'),
      pagePath.map((path) => `#${path.slice(1)}`)
    )

    fc.assert(
      fc.property(fc.array(external, { maxLength: 5 }), (hrefs) => {
        const html = hrefs.map((href) => `<a href="${href}">link</a>`).join('')

        expect(extractInternalPaths(html)).toEqual([])
      })
    )
  })
})
