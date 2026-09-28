import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.mjs'

async function siteWith(manifest) {
  const directory = await mkdtemp(join(tmpdir(), 'site-checks-'))
  if (manifest) await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))

  return directory
}

describe('readConfig', () => {
  it('reads the options a site sets under astroSiteChecks', async () => {
    const directory = await siteWith({ astroSiteChecks: { headers: { ungovernedPaths: ['mockups/'] } } })

    expect(await readConfig(directory)).toEqual({ headers: { ungovernedPaths: ['mockups/'] } })
  })

  it('falls back to the defaults when the site sets nothing, or has no package.json', async () => {
    const defaults = { headers: { ungovernedPaths: [] } }

    expect(await readConfig(await siteWith({ name: 'site' }))).toEqual(defaults)
    expect(await readConfig(await siteWith(undefined))).toEqual(defaults)
  })

  it('refuses an option that is not a list of path prefixes, naming it', async () => {
    const directory = await siteWith({ astroSiteChecks: { headers: { ungovernedPaths: 'mockups/' } } })

    await expect(readConfig(directory)).rejects.toThrow('astroSiteChecks.headers.ungovernedPaths')
  })
})
