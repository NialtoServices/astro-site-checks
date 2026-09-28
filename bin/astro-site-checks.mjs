#!/usr/bin/env node
import { resolve } from 'node:path'
import { DEFAULT_CLIENT_DIRECTORY } from '../src/built-site.mjs'
import { checkHeaders, checkLinks, checkRedirects, checkScopedCSS } from '../src/index.mjs'

const CHECKS = { links: checkLinks, redirects: checkRedirects, 'css-scope': checkScopedCSS, headers: checkHeaders }

const USAGE = `Usage: astro-site-checks <${Object.keys(CHECKS).join('|')}> [--dir <built client directory>]

Runs one post-build check against the built site (default: ${DEFAULT_CLIENT_DIRECTORY}). Run after astro build.`

const [name, ...options] = process.argv.slice(2)

if (name === '--help' || name === '-h') {
  console.log(USAGE)
  process.exit(0)
}

const check = CHECKS[name]
if (!check) {
  console.error(USAGE)
  process.exit(2)
}

const directoryIndex = options.indexOf('--dir')
const directory = directoryIndex === -1 ? DEFAULT_CLIENT_DIRECTORY : options[directoryIndex + 1]
if (!directory || directory.startsWith('--')) {
  console.error(USAGE)
  process.exit(2)
}

// A site's own mistake, such as an unreadable package.json, is reported as its message: a stack trace
// would read as a fault in this package.
try {
  const passed = await check({ clientDirectory: resolve(directory), siteDirectory: process.cwd(), report: console })
  process.exit(passed ? 0 : 1)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
