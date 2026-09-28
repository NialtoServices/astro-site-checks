/** Fails when a scoped CSS rule in the built site can never match the element it targets. */
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { collectBuiltFiles, servedPathOf } from '../built-site.mjs'
import { extractStyleBlocks, findUnmatchedScopedRules } from '../scoped-css.mjs'
import { requireBuiltSite } from './built.mjs'

const SOURCES_LISTED_PER_RULE = 3

export async function checkScopedCSS({ clientDirectory, report }) {
  if (!(await requireBuiltSite(clientDirectory, report))) return false

  const files = await collectBuiltFiles(clientDirectory)
  const pages = []
  const styleSheets = []
  for (const file of files.filter((path) => path.endsWith('.html'))) {
    const markup = await readFile(file, 'utf-8')
    const source = servedPathOf(clientDirectory, file)

    pages.push({ source, markup })
    for (const css of extractStyleBlocks(markup)) styleSheets.push({ source, css })
  }

  for (const file of files.filter((path) => path.endsWith('.css'))) {
    styleSheets.push({ source: relative(clientDirectory, file), css: await readFile(file, 'utf-8') })
  }

  const unmatched = findUnmatchedScopedRules(pages, styleSheets)
  if (unmatched.size > 0) {
    report.error(`\nScoped rules that can never match the element they target (${unmatched.size}):\n`)
    for (const [selector, rule] of unmatched) {
      report.error(`  ${selector}`)
      report.error(`      .${rule.className} only ever renders with: ${Array.from(rule.rendered).join(', ')}`)
      report.error(`      declared in ${Array.from(rule.sources).slice(0, SOURCES_LISTED_PER_RULE).join(', ')}`)
    }
    report.error(
      '\nA component cannot style an element it does not render. Pass a prop, or declare a custom\n' +
        'property on an element it does own and let it inherit down.\n'
    )
    return false
  }

  report.log(
    `Scoped CSS OK: checked ${styleSheets.length} stylesheets against ${pages.length} pages, every rule can match.`
  )
  return true
}
