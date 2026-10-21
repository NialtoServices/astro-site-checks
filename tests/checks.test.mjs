import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkHeaders, checkLinks, checkRedirects, checkScopedCSS } from '../src/index.mjs'

/** A built site on disk: `files` maps paths under dist/client to their contents. */
async function builtSite(files) {
  const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
  const clientDirectory = join(siteDirectory, 'dist', 'client')
  await mkdir(clientDirectory, { recursive: true })
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(clientDirectory, path)), { recursive: true })
    await writeFile(join(clientDirectory, path), contents)
  }

  return { siteDirectory, clientDirectory }
}

/** Captures what a check reports, so a test can read its verdict and its words. */
function recorder() {
  const lines = { log: [], warn: [], error: [] }
  return {
    lines,
    report: {
      log: (message) => lines.log.push(message),
      warn: (message) => lines.warn.push(message),
      error: (message) => lines.error.push(message)
    }
  }
}

describe('checkLinks', () => {
  it('fails on a link to a page that was never built, naming the page that links to it', async () => {
    const site = await builtSite({ 'index.html': '<a href="/missing/">x</a>' })
    const { lines, report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(false)
    expect(lines.error.join('\n')).toContain('/missing/')
  })

  it('passes a link through a redirect, with a warning naming its destination', async () => {
    const site = await builtSite({
      'index.html': '<a href="/old/">x</a>',
      'new/index.html': 'new',
      _redirects: '/old/ /new/ 301'
    })
    const { lines, report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(true)
    expect(lines.warn.join('\n')).toContain('/old/ -> /new/')
  })
})

describe('checkRedirects', () => {
  it('passes, and says so, when the site has no _redirects', async () => {
    const site = await builtSite({ 'index.html': 'home' })
    const { lines, report } = recorder()

    expect(await checkRedirects({ ...site, report })).toBe(true)
    expect(lines.log.join('\n')).toContain('No _redirects')
  })

  it('fails a rule missing its other trailing-slash spelling', async () => {
    const site = await builtSite({ 'new/index.html': 'new', _redirects: '/old/ /new/ 301' })
    const { report } = recorder()

    expect(await checkRedirects({ ...site, report })).toBe(false)
  })
})

describe('checkScopedCSS', () => {
  it('fails a scoped rule whose class renders only under another scope', async () => {
    const site = await builtSite({
      'index.html': '<div class="card" data-astro-cid-child1></div>',
      '_astro/a.css': '.card[data-astro-cid-parent1]{color:red}'
    })
    const { report } = recorder()

    expect(await checkScopedCSS({ ...site, report })).toBe(false)
  })
})

describe('checkHeaders', () => {
  it('fails, naming the fix, when no policy ships', async () => {
    const site = await builtSite({ 'index.html': 'home', _headers: '/*\n  X-Content-Type-Options: nosniff' })
    const { lines, report } = recorder()

    expect(await checkHeaders({ ...site, report })).toBe(false)
    expect(lines.error.join('\n')).toContain('Content-Security-Policy-Report-Only')
  })

  it('fails a page loading an origin the policy does not allow', async () => {
    const site = await builtSite({
      'index.html': '<script src="https://evil.example/a.js"></script>',
      _headers: "/*\n  Content-Security-Policy-Report-Only: default-src 'self'"
    })
    const { report } = recorder()

    expect(await checkHeaders({ ...site, report })).toBe(false)
  })

  it('leaves pages under an ungoverned path alone', async () => {
    const site = await builtSite({
      'mockups/index.html': '<script src="https://cdn.example/a.js"></script>',
      _headers: "/*\n  Content-Security-Policy-Report-Only: default-src 'self'",
      '../../package.json': JSON.stringify({ astroSiteChecks: { headers: { ungovernedPaths: ['mockups/'] } } })
    })
    const { report } = recorder()

    expect(await checkHeaders({ ...site, report })).toBe(true)
  })
})

describe('a site that has not been built', () => {
  it.each([checkLinks, checkRedirects, checkScopedCSS, checkHeaders])('%o fails naming astro build', async (check) => {
    const { lines, report } = recorder()

    expect(await check({ siteDirectory: tmpdir(), clientDirectory: join(tmpdir(), 'no-such-dist'), report })).toBe(
      false
    )
    expect(lines.error.join('\n')).toContain('astro build')
  })
})

describe('pages rendered on demand', () => {
  it('count as served for links and redirect targets', async () => {
    const site = await builtSite({
      'index.html': '<a href="/feedback/">Leave feedback</a>',
      _redirects: '/feedback /feedback/ 301',
      '../../src/pages/feedback.astro': '---\nexport const prerender = false\n---\n'
    })
    const { report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(true)
    expect(await checkRedirects({ ...site, report })).toBe(true)
  })
})

describe('server islands', () => {
  const ISLAND_PAGE =
    '<link rel="preload" as="fetch" href="/_server-islands/RecentPosts/?e=abc&amp;p=def">' +
    '<script>fetch("/_server-islands/RecentPosts/?e=abc&p=def")</script>'
  const MANIFEST_PATH = '../server/chunks/_virtual_astro_server-island-manifest_abc123.mjs'

  function manifestDeclaring(names) {
    const entries = names.map((name) => `["${name}", () => import("../chunks/${name}_a1.mjs")]`)
    return `var serverIslandMap = /* @__PURE__ */ new Map([${entries.join(', ')}]);\nexport { serverIslandMap };\n`
  }

  it('count as served when the server build declares them, whatever their query string', async () => {
    const site = await builtSite({ 'index.html': ISLAND_PAGE, [MANIFEST_PATH]: manifestDeclaring(['RecentPosts']) })
    const { report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(true)
  })

  it('fail as broken when the server build has no island of that name', async () => {
    const site = await builtSite({ 'index.html': ISLAND_PAGE, [MANIFEST_PATH]: manifestDeclaring(['LatestNews']) })
    const { lines, report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(false)
    expect(lines.error.join('\n')).toContain('Broken internal links (1)')
    expect(lines.error.join('\n')).toContain('/_server-islands/RecentPosts/')
  })

  it('fail, saying the manifest could not be read, rather than calling the island broken', async () => {
    const site = await builtSite({ 'index.html': ISLAND_PAGE })
    const { lines, report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(false)
    expect(lines.error.join('\n')).toContain('Server island links that could not be checked (1)')
    expect(lines.error.join('\n')).toContain('No server island manifest could be read')
    expect(lines.error.join('\n')).not.toContain('Broken internal links')
  })

  it('leave a site with no islands, and no server build, exactly as it was', async () => {
    const site = await builtSite({ 'index.html': '<a href="/about/">About</a>', 'about/index.html': 'about' })
    const { lines, report } = recorder()

    expect(await checkLinks({ ...site, report })).toBe(true)
    expect(lines).toEqual({
      log: ['Internal links OK: checked 2 pages, every internal link resolves.'],
      warn: [],
      error: []
    })
  })
})
