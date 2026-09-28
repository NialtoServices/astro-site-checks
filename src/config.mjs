import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A site's options for the checks, read from `astroSiteChecks` in its package.json so there is no extra
 * config file to keep. A site that sets nothing, or has no package.json, gets the defaults.
 */
export async function readConfig(siteDirectory) {
  const manifest = await readFile(join(siteDirectory, 'package.json'), 'utf-8').then(JSON.parse, () => ({}))
  const ungovernedPaths = manifest.astroSiteChecks?.headers?.ungovernedPaths ?? []

  const isPathList = Array.isArray(ungovernedPaths) && ungovernedPaths.every((path) => typeof path === 'string')
  if (!isPathList) {
    throw new Error('astroSiteChecks.headers.ungovernedPaths in package.json must be a list of path prefixes')
  }

  return { headers: { ungovernedPaths } }
}
