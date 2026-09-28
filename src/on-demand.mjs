/**
 * Routes a site renders on demand (`export const prerender = false`). The build writes no file for them,
 * so without this a link or redirect to one looks broken. Read from `src/pages` because the Cloudflare
 * adapter leaves no route list in the built output.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const PAGE_EXTENSION_PATTERN = /\.(astro|ts|js|mjs)$/
const ON_DEMAND_PATTERN = /export\s+const\s+prerender\s*=\s*false/

async function collectPageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return collectPageFiles(path)

      return PAGE_EXTENSION_PATTERN.test(entry.name) ? [path] : []
    })
  )

  return files.flat()
}

/** A page file's route as a pattern matching its path with or without a trailing slash. */
function routePattern(pagesDirectory, file) {
  const route = relative(pagesDirectory, file)
    .replace(PAGE_EXTENSION_PATTERN, '')
    .replace(/(^|\/)index$/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.*'
      if (/^\[.+\]$/.test(segment)) return '[^/]+'

      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')

  return new RegExp(`^/${route}${route ? '/?' : ''}$`)
}

/** A pattern for every page under the site's `src/pages` that renders on demand. */
export async function collectOnDemandRoutes(siteDirectory) {
  const pagesDirectory = join(siteDirectory, 'src', 'pages')
  const routes = []
  for (const file of await collectPageFiles(pagesDirectory)) {
    if (ON_DEMAND_PATTERN.test(await readFile(file, 'utf-8'))) routes.push(routePattern(pagesDirectory, file))
  }

  return routes
}

/** Whether a path is served by a page rendered on demand. */
export function isOnDemand(routes, path) {
  return routes.some((route) => route.test(path))
}
