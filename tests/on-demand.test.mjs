import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectOnDemandRoutes, isOnDemand } from '../src/on-demand.mjs'
import { segment } from './arbitraries.mjs'

async function siteWithPages(pages) {
  const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
  for (const [path, contents] of Object.entries(pages)) {
    const file = join(siteDirectory, 'src', 'pages', path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, contents)
  }

  return siteDirectory
}

const ON_DEMAND = '---\nexport const prerender = false\n---\n'

describe('collectOnDemandRoutes', () => {
  it('matches a page rendered on demand, with or without its trailing slash', async () => {
    const routes = await collectOnDemandRoutes(await siteWithPages({ 'feedback.astro': ON_DEMAND }))

    expect(isOnDemand(routes, '/feedback/')).toBe(true)
    expect(isOnDemand(routes, '/feedback')).toBe(true)
    expect(isOnDemand(routes, '/feedback/extra/')).toBe(false)
  })

  it('matches dynamic and rest parameters, and index files as their directory', async () => {
    const routes = await collectOnDemandRoutes(
      await siteWithPages({
        'tickets/[id].astro': ON_DEMAND,
        'files/[...path].ts': 'export const prerender = false\n',
        'account/index.astro': ON_DEMAND
      })
    )

    expect(isOnDemand(routes, '/tickets/123/')).toBe(true)
    expect(isOnDemand(routes, '/files/a/b.pdf')).toBe(true)
    expect(isOnDemand(routes, '/account/')).toBe(true)
    expect(isOnDemand(routes, '/tickets/')).toBe(false)
  })

  it('ignores prerendered pages and a site with no src/pages', async () => {
    const routes = await collectOnDemandRoutes(await siteWithPages({ 'about.astro': '---\n---\n<h1>About</h1>' }))

    expect(isOnDemand(routes, '/about/')).toBe(false)
    expect(await collectOnDemandRoutes(join(tmpdir(), 'no-such-site'))).toEqual([])
  })
})

describe('properties', () => {
  /** A page's route segments, each either fixed or a `[param]`, with a value for every param. */
  const route = fc.array(
    fc.oneof(
      segment.map((name) => ({ file: name, url: fc.constant(name) })),
      segment.map((name) => ({ file: `[${name}]`, url: segment }))
    ),
    { minLength: 1, maxLength: 3 }
  )
  const scenario = route.chain((parts) =>
    fc.tuple(fc.constant(parts.map(({ file }) => file)), fc.tuple(...parts.map(({ url }) => url)), fc.boolean())
  )

  it("matches an on-demand page's URL in either spelling, and nothing a segment deeper", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ([fileSegments, urlSegments, asIndex]) => {
        const file = asIndex ? `${fileSegments.join('/')}/index.astro` : `${fileSegments.join('/')}.astro`
        const routes = await collectOnDemandRoutes(await siteWithPages({ [file]: ON_DEMAND }))
        const url = `/${urlSegments.join('/')}`

        expect(isOnDemand(routes, `${url}/`)).toBe(true)
        expect(isOnDemand(routes, url)).toBe(true)
        expect(isOnDemand(routes, `${url}/deeper/`)).toBe(false)
      }),
      { numRuns: 25 }
    )
  })
})
