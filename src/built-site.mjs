/**
 * A built Astro site as the checks need to see it: which files the client directory holds, which
 * paths those serve, and which internal links a page carries.
 *
 * Every check reads the site through these, so the link check and the redirect check cannot drift
 * apart over what "this path resolves" means.
 */
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Where `astro build` writes the files a site serves, relative to the site's root. */
export const DEFAULT_CLIENT_DIRECTORY = 'dist/client'

const HREF_PATTERN = /href="([^"]+)"/g

/** Every file under a directory, at any depth. */
export async function collectBuiltFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? collectBuiltFiles(path) : [path]
    })
  )

  return files.flat()
}

/** A built file's path as it would appear in an href, so `…/index.html` reads as its directory. */
export function servedPathOf(directory, file) {
  return `/${relative(directory, file)}`.replace(/index\.html$/, '')
}

/** Every path the built site can serve, as it would appear in an href. */
export async function collectServablePaths(directory) {
  const servablePaths = new Set()
  for (const file of await collectBuiltFiles(directory)) {
    const path = `/${relative(directory, file)}`
    servablePaths.add(path)

    if (path.endsWith('/index.html')) servablePaths.add(path.replace(/index\.html$/, ''))
  }

  return servablePaths
}

/**
 * Whether a path resolves against the built site, allowing for the trailing slash
 * `trailingSlash: 'always'` adds and for a directory's `index.html`.
 */
export function isServable(servablePaths, path) {
  if (servablePaths.has(path)) return true

  return servablePaths.has(`${path}/`) || servablePaths.has(`${path}/index.html`)
}

/**
 * Every root-relative href in a page, reduced to a path, with fragments and query strings dropped.
 *
 * `mailto:`, `tel:`, in-page fragments and links to other hosts are out of scope: their targets are not
 * ours to guarantee. A protocol-relative href (`//host/path`) names another host despite its leading
 * slash. Absolute links back to the site's own host are skipped too, because the head's canonical and
 * pagination tags are absolute on purpose; an absolute link in body copy therefore goes unchecked, which
 * is why internal links are authored root-relative.
 */
export function extractInternalPaths(html) {
  const paths = []
  for (const [, href] of html.matchAll(HREF_PATTERN)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue

    paths.push(href.replace(/[#?].*$/, ''))
  }

  return paths
}
