/**
 * Fails when a rule in the built `_redirects` can no longer do its job: a target the build does not serve,
 * a source the build serves as a real page (so the rule can never fire), a target that is itself another
 * rule's source (a chain), or a page rule carried in only one trailing-slash spelling.
 *
 * A site with nothing to redirect has no `_redirects`, which passes.
 */
import { join } from 'node:path'
import { collectServablePaths } from '../built-site.mjs'
import {
  findBrokenTargets,
  findMissingSpellings,
  findRedirectChains,
  findShadowedSources,
  parseRedirects
} from '../redirects.mjs'
import { readOptionalFile, requireBuiltSite } from './built.mjs'

function reportFaults(report, heading, faults, describe, remedy) {
  if (faults.length === 0) return false

  report.error(`\n${heading} (${faults.length}):\n`)
  for (const fault of faults) report.error(`  ${describe(fault)}`)
  report.error(`\n${remedy}\n`)

  return true
}

export async function checkRedirects({ clientDirectory, report }) {
  if (!(await requireBuiltSite(clientDirectory, report))) return false

  const text = await readOptionalFile(join(clientDirectory, '_redirects'))
  if (text === undefined) {
    report.log('No _redirects in the built site: nothing to check.')
    return true
  }

  const redirects = parseRedirects(text)
  const servablePaths = await collectServablePaths(clientDirectory)

  const failures = [
    reportFaults(
      report,
      'Redirects pointing at a path the build does not serve',
      findBrokenTargets(redirects, servablePaths),
      ({ source, target }) => `${source} -> ${target}`,
      'Point the rule at a page that exists, or drop it if the destination has gone for good.'
    ),
    reportFaults(
      report,
      'Redirects whose source the build serves as a page, so the rule can never fire',
      findShadowedSources(redirects, servablePaths),
      ({ source, target }) => `${source} -> ${target}  (a page is built at ${source})`,
      'Either remove the rule or stop building the page.'
    ),
    reportFaults(
      report,
      'Redirect chains',
      findRedirectChains(redirects),
      ({ source, target, eventualTarget }) => `${source} -> ${target} -> ${eventualTarget}`,
      'Flatten the chain: point the first rule straight at the page the second one reaches.'
    ),
    reportFaults(
      report,
      'Redirects missing their other trailing-slash spelling',
      findMissingSpellings(redirects),
      ({ source, missing, target }) => `${source} -> ${target}  (add ${missing} -> ${target})`,
      'Cloudflare matches a source exactly, so give every page rule both spellings, pointing at the same page.'
    )
  ]
  if (failures.some(Boolean)) return false

  report.log(`Redirects OK: ${redirects.size} rules checked, every target resolves in one hop.`)
  return true
}
