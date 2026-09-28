/**
 * Fails when an internal link in the built site points at a page that does not exist.
 *
 * Content work is exactly when dangling links creep in: pages cross-reference each other, slugs get
 * renamed, and a link to a page that never gets written is invisible until a visitor hits it.
 *
 * A link to a redirect *source* is a warning rather than a failure. It resolves, so nobody lands on a 404,
 * but the visitor pays a needless 301, so it is worth linking straight to the destination.
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
import { parseRedirects } from '../redirects.mjs'
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

export async function checkLinks({ clientDirectory, report }) {
  if (!(await requireBuiltSite(clientDirectory, report))) return false

  const redirects = parseRedirects((await readOptionalFile(join(clientDirectory, '_redirects'))) ?? '')
  const servablePaths = await collectServablePaths(clientDirectory)
  const pages = (await collectBuiltFiles(clientDirectory)).filter((file) => file.endsWith('.html'))

  const broken = []
  const redirected = []
  for (const page of pages) {
    const html = await readFile(page, 'utf-8')
    const from = servedPathOf(clientDirectory, page)

    for (const path of extractInternalPaths(html)) {
      if (redirects.has(path)) {
        redirected.push({ from, path })
        continue
      }

      if (isServable(servablePaths, path)) continue

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

  if (broken.length > 0) {
    const grouped = groupByPath(broken)
    report.error(`\nBroken internal links (${grouped.size}):\n`)
    listFindings(
      grouped,
      () => '',
      (line) => report.error(line)
    )
    report.error('')
    return false
  }

  report.log(
    `Internal links OK: checked ${pages.length} pages, every internal link resolves` +
      `${redirected.length > 0 ? `, ${redirected.length} through a redirect` : ''}.`
  )
  return true
}
