/**
 * Server islands (`<Component server:defer>`) a site's build can render. A prerendered page fetches each
 * island from `/_server-islands/<name>/`, a route Astro injects and renders on demand, so neither the
 * client build nor `src/pages` holds anything for it.
 *
 * The names come from the server island manifest Astro writes into the server build. That chunk is
 * internal build output rather than a public API, so a manifest this cannot read is reported as such,
 * never guessed around.
 */
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { collectBuiltFiles } from './built-site.mjs'

const SERVER_ISLAND_PATH_PATTERN = /^\/_server-islands\/([^/]+)\/?$/
const MANIFEST_FILE_PATTERN = /server-island-manifest.*\.m?js$/
const MANIFEST_MAP_PATTERN = /serverIslandMap\s*=\s*(?:\/\*.*?\*\/\s*)?new Map\(/
const EMPTY_MANIFEST_MAP_PATTERN = /serverIslandMap\s*=\s*(?:\/\*.*?\*\/\s*)?new Map\(\s*(?:\[\s*\])?\s*\)/
const MANIFEST_ENTRY_PATTERN = /\[\s*(["'])([^"']+)\1\s*,\s*\(\)\s*=>\s*import\(/g

/** Where Astro writes the server build: beside the client build, in `dist/server`. */
export function serverDirectoryOf(clientDirectory) {
  return join(clientDirectory, '..', 'server')
}

/** The island a path asks the server for, or `undefined` when the path is not a server island route. */
export function serverIslandNameOf(path) {
  return SERVER_ISLAND_PATH_PATTERN.exec(path)?.[1]
}

/** The island names one manifest chunk declares, or `undefined` when its shape is not one this reads. */
function readManifestNames(source) {
  if (!MANIFEST_MAP_PATTERN.test(source)) return undefined

  const names = Array.from(source.matchAll(MANIFEST_ENTRY_PATTERN), ([, , name]) => name)

  // An island map with no entries this recognises is only trustworthy when it is literally empty: any
  // other content means the entry format has changed, and every island would read as missing.
  if (names.length === 0 && !EMPTY_MANIFEST_MAP_PATTERN.test(source)) return undefined

  return names
}

/**
 * Every server island name the server build declares, or `undefined` when the build holds no manifest
 * this can read: no server build, no manifest chunk, or a chunk whose format has changed.
 */
export async function collectServerIslands(serverDirectory) {
  const files = await collectBuiltFiles(serverDirectory).catch(() => [])
  const manifests = files.filter((file) => MANIFEST_FILE_PATTERN.test(basename(file)))

  let islands
  for (const manifest of manifests) {
    const names = readManifestNames(await readFile(manifest, 'utf-8'))
    if (names === undefined) continue

    islands ??= new Set()
    for (const name of names) islands.add(name)
  }

  return islands
}
