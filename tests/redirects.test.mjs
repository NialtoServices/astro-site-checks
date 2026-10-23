import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  findBrokenTargets,
  findMissingSpellings,
  findRedirectChains,
  findShadowedSources,
  parseRedirects
} from '../src/redirects.mjs'
import { barePagePath, lineOfText, pagePath } from './arbitraries.mjs'

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
  it('leaves a rule alone when its target is its own other spelling', () => {
    expect(findMissingSpellings(new Map([['/feedback', '/feedback/']]))).toEqual([])
  })

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

describe('properties', () => {
  /** The paths a build that wrote these pages serves, as `collectServablePaths` reads them. */
  function servablePathsFor(bareBuiltPaths) {
    return new Set(bareBuiltPaths.flatMap((path) => [`${path}/`, `${path}/index.html`]))
  }

  /** Rules with distinct sources, as a `_redirects` file can hold them. */
  const rules = fc.uniqueArray(fc.tuple(pagePath, pagePath), { selector: ([source]) => source, maxLength: 8 })

  it('reads back every rule, whatever comments, blank lines, spacing and line endings surround it', () => {
    const indent = fc.constantFrom('', ' ', '\t')
    const gap = fc.constantFrom(' ', '  ', '\t', ' \t ')
    const filler = fc.oneof(
      fc.constant(''),
      lineOfText.map((text) => `# ${text}`)
    )
    const writtenRule = ([source, target]) =>
      fc
        .tuple(indent, gap, gap, fc.array(filler, { maxLength: 2 }))
        .map(([before, firstGap, secondGap, lines]) => [
          ...lines,
          `${before}${source}${firstGap}${target}${secondGap}301`
        ])
    const file = rules.chain((generated) =>
      fc.tuple(fc.constant(generated), fc.tuple(...generated.map(writtenRule)), fc.constantFrom('\n', '\r\n'))
    )

    fc.assert(
      fc.property(file, ([generated, written, lineEnding]) => {
        expect([...parseRedirects(written.flat().join(lineEnding))]).toEqual(generated)
      })
    )
  })

  it('reports a target exactly when the build does not serve it, in either spelling', () => {
    const scenario = fc.uniqueArray(fc.tuple(barePagePath, fc.boolean(), fc.boolean()), {
      selector: ([path]) => path,
      minLength: 1,
      maxLength: 8
    })

    fc.assert(
      fc.property(scenario, (pages) => {
        const servablePaths = servablePathsFor(pages.filter(([, built]) => built).map(([path]) => path))
        const redirects = new Map(
          pages.map(([path, , slash], index) => [`/retired-${index}/`, slash ? `${path}/` : path])
        )
        const broken = pages.filter(([, built]) => !built).map(([path, , slash]) => (slash ? `${path}/` : path))

        expect(findBrokenTargets(redirects, servablePaths).map(({ target }) => target)).toEqual(broken)
      })
    )
  })

  it('never reports a placeholder or another host as a broken target', () => {
    const target = fc.oneof(
      barePagePath.map((path) => `${path}/:splat`),
      barePagePath.map((path) => `${path}/*`),
      barePagePath.map((path) => `https://elsewhere.example${path}/`)
    )

    fc.assert(
      fc.property(fc.array(target, { maxLength: 8 }), (targets) => {
        const redirects = new Map(targets.map((value, index) => [`/retired-${index}/`, value]))

        expect(findBrokenTargets(redirects, new Set())).toEqual([])
      })
    )
  })

  it('reports a source exactly when the build serves a page there', () => {
    const scenario = fc.uniqueArray(fc.tuple(barePagePath, fc.boolean(), fc.boolean()), {
      selector: ([path]) => path,
      maxLength: 8
    })

    fc.assert(
      fc.property(scenario, (pages) => {
        const servablePaths = servablePathsFor(pages.filter(([, built]) => built).map(([path]) => path))
        const redirects = new Map(pages.map(([path, , slash]) => [slash ? `${path}/` : path, '/destination/']))
        const shadowed = pages.filter(([, built]) => built).map(([path, , slash]) => (slash ? `${path}/` : path))

        expect(findShadowedSources(redirects, servablePaths).map(({ source }) => source)).toEqual(shadowed)
      })
    )
  })

  /** Rules from under `/old` to under `/new`, so no target can be another rule's source. */
  const oneHopRules = fc.uniqueArray(fc.tuple(barePagePath, barePagePath), {
    selector: ([source]) => source,
    minLength: 2,
    maxLength: 8
  })

  it("finds no chain when no target is another rule's source", () => {
    fc.assert(
      fc.property(oneHopRules, (generated) => {
        const redirects = new Map(generated.map(([source, target]) => [`/old${source}/`, `/new${target}/`]))

        expect(findRedirectChains(redirects)).toEqual([])
      })
    )
  })

  it("finds exactly the hop added by pointing one rule at another's source", () => {
    const scenario = oneHopRules.chain((generated) =>
      fc.tuple(
        fc.constant(generated),
        fc.integer({ min: 0, max: generated.length - 1 }),
        fc.integer({ min: 1, max: generated.length - 1 })
      )
    )

    fc.assert(
      fc.property(scenario, ([generated, first, offset]) => {
        const redirects = new Map(generated.map(([source, target]) => [`/old${source}/`, `/new${target}/`]))
        const [source] = generated[first]
        const [middle, final] = generated[(first + offset) % generated.length]
        redirects.set(`/old${source}/`, `/old${middle}/`)

        expect(findRedirectChains(redirects)).toEqual([
          { source: `/old${source}/`, target: `/old${middle}/`, eventualTarget: `/new${final}/` }
        ])
      })
    )
  })

  /** Page rules carried in both trailing-slash spellings, each pair pointing at one page. */
  const pairedRules = fc.uniqueArray(fc.tuple(barePagePath, pagePath), {
    selector: ([source]) => source,
    minLength: 1,
    maxLength: 8
  })

  function bothSpellings(generated) {
    return new Map(
      generated.flatMap(([source, target]) => [
        [source, target],
        [`${source}/`, target]
      ])
    )
  }

  it('asks for no spelling when every page rule carries both', () => {
    fc.assert(
      fc.property(pairedRules, (generated) => {
        expect(findMissingSpellings(bothSpellings(generated))).toEqual([])
      })
    )
  })

  it('asks for exactly the spelling dropped from a rule carried in both', () => {
    const scenario = pairedRules.chain((generated) =>
      fc.tuple(fc.constant(generated), fc.integer({ min: 0, max: generated.length - 1 }), fc.boolean())
    )

    fc.assert(
      fc.property(scenario, ([generated, index, dropSlashed]) => {
        const [source, target] = generated[index]
        const kept = dropSlashed ? source : `${source}/`
        const dropped = dropSlashed ? `${source}/` : source
        fc.pre(target !== dropped)

        const redirects = bothSpellings(generated)
        redirects.delete(dropped)

        expect(findMissingSpellings(redirects)).toEqual([{ source: kept, missing: dropped, target }])
      })
    )
  })
})
