/**
 * Fails when a built page loads an origin the site's Content-Security-Policy does not allow, or when the
 * site ships no policy at all.
 *
 * A report-only policy lets the browser load a disallowed resource anyway, so a new third-party include
 * goes unnoticed until the policy is enforced and it breaks. This closes that gap for everything the markup
 * itself fetches. Origins a tag manager injects at runtime remain invisible to a static check.
 */
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { collectBuiltFiles, servedPathOf } from '../built-site.mjs'
import { readConfig } from '../config.mjs'
import { findPolicyViolations, parsePolicy } from '../csp.mjs'
import { readOptionalFile, requireBuiltSite } from './built.mjs'

export async function checkHeaders({ clientDirectory, siteDirectory, report }) {
  if (!(await requireBuiltSite(clientDirectory, report))) return false

  const { ungovernedPaths } = (await readConfig(siteDirectory)).headers
  const policy = parsePolicy((await readOptionalFile(join(clientDirectory, '_headers'))) ?? '')
  if (!policy) {
    report.error(
      'No Content-Security-Policy in the built _headers. Every site ships one: add a ' +
        'Content-Security-Policy-Report-Only header for /* to public/_headers.'
    )
    return false
  }

  const pages = (await collectBuiltFiles(clientDirectory)).filter((file) => {
    if (!file.endsWith('.html')) return false

    const route = relative(clientDirectory, file)
    return !ungovernedPaths.some((prefix) => route.startsWith(prefix))
  })

  const problems = []
  for (const page of pages) {
    for (const violation of findPolicyViolations(await readFile(page, 'utf-8'), policy)) {
      problems.push({ page: servedPathOf(clientDirectory, page), ...violation })
    }
  }

  if (problems.length > 0) {
    report.error(`\nResources loaded from an origin the Content-Security-Policy does not allow (${problems.length}):\n`)
    for (const problem of problems) {
      report.error(`  ${problem.origin} (<${problem.kind}>, needs ${problem.directive})`)
      report.error(`      loaded by ${problem.page}`)
    }
    report.error('')
    return false
  }

  report.log(`Content-Security-Policy OK: checked ${pages.length} pages, every loaded origin is allowed.`)
  return true
}
