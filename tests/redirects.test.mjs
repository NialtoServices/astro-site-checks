import { describe, expect, it } from 'vitest'
import {
  findBrokenTargets,
  findMissingSpellings,
  findRedirectChains,
  findShadowedSources,
  parseRedirects
} from '../src/redirects.mjs'

const servablePaths = new Set(['/contact-us/', '/contact-us/index.html', '/sitemap-index.xml'])

describe('findBrokenTargets', () => {
  it('reports a target the build does not serve', () => {
    const redirects = new Map([
      ['/contact', '/contact-us/'],
      ['/sitemap.xml', '/sitemap-index.xml'],
      ['/old-page/', '/a-page-nobody-wrote/']
    ])

    expect(findBrokenTargets(redirects, servablePaths)).toEqual([
      { source: '/old-page/', target: '/a-page-nobody-wrote/' }
    ])
  })

  it('leaves a target on another host alone', () => {
    const redirects = new Map([['/elsewhere/', 'https://example.com/']])

    expect(findBrokenTargets(redirects, servablePaths)).toEqual([])
  })
})

describe('findShadowedSources', () => {
  it('reports a rule whose source the build serves as a page', () => {
    const redirects = new Map([
      ['/contact', '/contact-us/'],
      ['/contact-us/', '/contact-us/']
    ])

    expect(findShadowedSources(redirects, servablePaths)).toEqual([{ source: '/contact-us/', target: '/contact-us/' }])
  })
})

describe('findRedirectChains', () => {
  it('reports a rule landing on the source of another rule', () => {
    const redirects = new Map([
      ['/first/', '/second/'],
      ['/second/', '/contact-us/']
    ])

    expect(findRedirectChains(redirects)).toEqual([
      { source: '/first/', target: '/second/', eventualTarget: '/contact-us/' }
    ])
  })

  it('accepts rules that all land on a page in one hop', () => {
    const redirects = new Map([
      ['/first/', '/contact-us/'],
      ['/second/', '/contact-us/']
    ])

    expect(findRedirectChains(redirects)).toEqual([])
  })
})

describe('findMissingSpellings', () => {
  it('reports a page rule whose other trailing-slash spelling has no rule of its own', () => {
    const redirects = new Map([
      ['/old-services/', '/services/'],
      ['/contact', '/contact-us/']
    ])

    expect(findMissingSpellings(redirects)).toEqual([
      {
        source: '/old-services/',
        missing: '/old-services',
        target: '/services/'
      },
      { source: '/contact', missing: '/contact/', target: '/contact-us/' }
    ])
  })

  it('accepts a page rule carried in both spellings to the same page', () => {
    const redirects = new Map([
      ['/contact', '/contact-us/'],
      ['/contact/', '/contact-us/']
    ])

    expect(findMissingSpellings(redirects)).toEqual([])
  })

  it('reports both spellings that lead to different pages', () => {
    const redirects = new Map([
      ['/contact', '/contact-us/'],
      ['/contact/', '/about-us/']
    ])

    expect(findMissingSpellings(redirects)).toEqual([
      { source: '/contact', missing: '/contact/', target: '/contact-us/' },
      { source: '/contact/', missing: '/contact', target: '/about-us/' }
    ])
  })

  it('leaves file rules alone, since nobody requests a file with a trailing slash', () => {
    expect(findMissingSpellings(new Map([['/sitemap.xml', '/sitemap-index.xml']]))).toEqual([])
  })
})

describe('parseRedirects', () => {
  it('reads the redirect lines, skipping comments and blanks', () => {
    const redirects = parseRedirects('# comment\n\n/b/ /c/ 301\n/contact /contact-us/ 301\n')

    expect([...redirects]).toEqual([
      ['/b/', '/c/'],
      ['/contact', '/contact-us/']
    ])
  })
})

describe('rules with a placeholder or an external target', () => {
  it('skips each fault only on the side it cannot evaluate', () => {
    const redirects = parseRedirects(
      ['/blog/* /news/:splat 301', '/team/:name /people/:name 301', '/old https://elsewhere.example/ 301'].join('\n')
    )

    expect(findBrokenTargets(redirects, new Set())).toEqual([])
    expect(findShadowedSources(redirects, new Set())).toEqual([])
    expect(findRedirectChains(redirects)).toEqual([])
    expect(findMissingSpellings(redirects)).toEqual([
      { source: '/old', missing: '/old/', target: 'https://elsewhere.example/' }
    ])
  })

  it('checks the concrete target of a placeholder source', () => {
    const redirects = parseRedirects('/old-work/* /work/ 301')

    expect(findBrokenTargets(redirects, new Set())).toEqual([{ source: '/old-work/*', target: '/work/' }])
  })

  it('finds a chain that starts at a placeholder source', () => {
    const redirects = parseRedirects(['/old/* /mid/ 301', '/mid/ /new/ 301'].join('\n'))

    expect(findRedirectChains(redirects)).toEqual([{ source: '/old/*', target: '/mid/', eventualTarget: '/new/' }])
  })

  it('reports a shadowed source whose target is on another host', () => {
    const redirects = parseRedirects('/shop/ https://shop.example/ 301')

    expect(findShadowedSources(redirects, new Set(['/shop/', '/shop/index.html']))).toEqual([
      { source: '/shop/', target: 'https://shop.example/' }
    ])
  })
})
