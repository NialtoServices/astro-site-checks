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

  it('exits 1 for a failing check, and honours --dir', async () => {
    const siteDirectory = await mkdtemp(join(tmpdir(), 'site-checks-'))
    await mkdir(join(siteDirectory, 'out'), { recursive: true })
    await writeFile(join(siteDirectory, 'out', 'index.html'), '<a href="/missing/">x</a>')

    expect((await runCommand(['links', '--dir', 'out'], siteDirectory)).code).toBe(1)
  })
})
