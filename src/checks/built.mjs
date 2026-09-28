import { readFile, stat } from 'node:fs/promises'

/** Whether the site has been built, reporting how to fix it when it has not. */
export async function requireBuiltSite(clientDirectory, report) {
  const found = await stat(clientDirectory).then(
    (entry) => entry.isDirectory(),
    () => false
  )
  if (found) return true

  report.error(`No built site at ${clientDirectory}. Run \`astro build\` first.`)
  return false
}

/** A built file's contents, or `undefined` when the build did not produce it. */
export function readOptionalFile(path) {
  return readFile(path, 'utf-8').catch(() => undefined)
}
