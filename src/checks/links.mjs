/**
 * Fails when an internal link in the built site points at a page that does not exist.
 *
 * Content work is exactly when dangling links creep in: pages cross-reference each other, slugs get
 * renamed, and a link to a page that never gets written is invisible until a visitor hits it.
 *
 * A link to a redirect *source* is a warning rather than a failure. It resolves, so nobody lands on a 404,
 * but the visitor pays a needless 301, so it is worth linking straight to the destination.
 *
 * A link to a server island is checked against the islands the server build declares. When the build
 * holds no manifest this can read, those links are reported as unchecked and the check fails, rather
 * than calling every island broken or letting a stale one through.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  collectBuiltFiles,
  collectServablePaths,
  extractInternalPaths,
  isServable,
  servedPathOf
} from '../built-site.mjs'
import { collectOnDemandRoutes, isOnDemand } from '../on-demand.mjs'
import { parseRedirects } from '../redirects.mjs'
import { collectServerIslands, serverDirectoryOf, serverIslandNameOf } from '../server-islands.mjs'
import { readOptionalFile, requireBuiltSite } from './built.mjs'

const SOURCES_LISTED_PER_LINK = 5

/** Pages that link to each path, so a repeated mistake reads as one entry with its sources. */
function groupByPath(findings) {
  const grouped = new Map()
  for (const { from, path } of findings) {
    const sources = grouped.get(path) ?? new Set()
    sources.add(from)
    grouped.set(path, sources)
  }

  return grouped
}

/**
 * A link in shared chrome appears on every page, and a list that long buries the other findings, so each
 * one names a handful of pages and counts the rest.
 */
function listFindings(grouped, describeTarget, write) {
  for (const [path, sources] of grouped) {
    write(`  ${path}${describeTarget(path)}`)

    const named = Array.from(sources).slice(0, SOURCES_LISTED_PER_LINK)
    for (const source of named) write(`      linked from ${source}`)

    const remaining = sources.size - named.length
    if (remaining > 0) write(`      …and ${remaining} more page${remaining === 1 ? '' : 's'}`)
  }
}

export async function checkLinks({ clientDirectory, siteDirectory, report }) {
  if (!(await requireBuiltSite(clientDirectory, report))) return false

  const redirects = parseRedirects((await readOptionalFile(join(clientDirectory, '_redirects'))) ?? '')
  const servablePaths = await collectServablePaths(clientDirectory)
  const onDemandRoutes = await collectOnDemandRoutes(siteDirectory)
  const serverDirectory = serverDirectoryOf(clientDirectory)
  const serverIslands = await collectServerIslands(serverDirectory)
  const pages = (await collectBuiltFiles(clientDirectory)).filter((file) => file.endsWith('.html'))

  const broken = []
  const redirected = []
  const unchecked = []
  for (const page of pages) {
    const html = await readFile(page, 'utf-8')
    const from = servedPathOf(clientDirectory, page)

    for (const path of extractInternalPaths(html)) {
      if (redirects.has(path)) {
        redirected.push({ from, path })
        continue
      }

      const island = serverIslandNameOf(path)
      if (island !== undefined) {
        if (serverIslands === undefined) unchecked.push({ from, path })
        else if (!serverIslands.has(island)) broken.push({ from, path })
        continue
      }

      if (isServable(servablePaths, path) || isOnDemand(onDemandRoutes, path)) continue

      broken.push({ from, path })
    }
  }

  if (redirected.length > 0) {
    const grouped = groupByPath(redirected)
    report.warn(`\nInternal links pointing at a redirect source (${grouped.size}):\n`)
    listFindings(
      grouped,
      (path) => ` -> ${redirects.get(path)}`,
      (line) => report.warn(line)
    )
    report.warn('\nThese resolve, but through a 301. Link straight to the destination.\n')
  }

  if (unchecked.length > 0) {
    const grouped = groupByPath(unchecked)
    report.error(`\nServer island links that could not be checked (${grouped.size}):\n`)
    listFindings(
      grouped,
      () => '',
      (line) => report.error(line)
    )
    report.error(
      `\nNo server island manifest could be read from ${serverDirectory}. Astro writes one into its server ` +
        'build, which this check expects beside the client build. If it is there, its format has changed ' +
        'and this package needs updating to read it.\n'
    )
  }

  if (broken.length > 0) {
    const grouped = groupByPath(broken)
    report.error(`\nBroken internal links (${grouped.size}):\n`)
    listFindings(
      grouped,
      () => '',
      (line) => report.error(line)
    )
    report.error('')
  }

  if (unchecked.length > 0 || broken.length > 0) return false

  report.log(
    `Internal links OK: checked ${pages.length} pages, every internal link resolves` +
      `${redirected.length > 0 ? `, ${redirected.length} through a redirect` : ''}.`
  )
  return true
}
