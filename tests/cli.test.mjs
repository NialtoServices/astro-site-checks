import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const COMMAND = new URL('../bin/astro-site-checks.mjs', import.meta.url).pathname

async function runCommand(argumentsList, cwd) {
  try {
    const { stdout, stderr } = await run('node', [COMMAND, ...argumentsList], { cwd })
    return { code: 0, output: stdout + stderr }
  } catch (error) {
    return { code: error.code, output: error.stdout + error.stderr }
  }
}

describe('astro-site-checks', () => {
  it('exits 2 and prints usage for an unknown check', async () => {
    const result = await runCommand(['spelling'], tmpdir())

    expect(result.code).toBe(2)
    expect(result.output).toContain('links')
  })

  it('exits 0 for a passing check, reading dist/client from the working directory', async () => {
    const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
    await mkdir(join(siteDirectory, 'dist', 'client'), { recursive: true })
    await writeFile(join(siteDirectory, 'dist', 'client', 'index.html'), '<a href="/">home</a>')

    expect((await runCommand(['links'], siteDirectory)).code).toBe(0)
  })

  it('exits 2 with the usage, not a stack trace, when --dir has no value', async () => {
    const result = await runCommand(['links', '--dir'], tmpdir())

    expect(result.code).toBe(2)
    expect(result.output).toContain('Usage')
    expect(result.output).not.toMatch(/^\s+at /m)
  })

  it.each([
    [
      'an option of the wrong type',
      JSON.stringify({ astroSiteChecks: { headers: { ungovernedPaths: 'mockups/' } } }),
      'astroSiteChecks.headers.ungovernedPaths'
    ],
    ['a package.json that is not valid JSON', '{ "name": ', 'package.json']
  ])('exits 1 naming the problem, not a stack trace, for %s', async (_, manifest, named) => {
    const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
    await mkdir(join(siteDirectory, 'dist', 'client'), { recursive: true })
    await writeFile(
      join(siteDirectory, 'dist', 'client', '_headers'),
      "/*\n  Content-Security-Policy-Report-Only: default-src 'self'"
    )
    await writeFile(join(siteDirectory, 'package.json'), manifest)

    const result = await runCommand(['headers'], siteDirectory)

    expect(result.code).toBe(1)
    expect(result.output).toContain(named)
    expect(result.output).not.toMatch(/^\s+at /m)
  })

  it('exits 1 for a failing check, and honours --dir', async () => {
    const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
    await mkdir(join(siteDirectory, 'out'), { recursive: true })
    await writeFile(join(siteDirectory, 'out', 'index.html'), '<a href="/missing/">x</a>')

    expect((await runCommand(['links', '--dir', 'out'], siteDirectory)).code).toBe(1)
  })
})
