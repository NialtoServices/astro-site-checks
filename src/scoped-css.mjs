/**
 * Finds scoped CSS rules that can never match the element they target.
 *
 * Astro scopes a component's styles by appending `[data-astro-cid-…]` to each compound selector, and that
 * attribute only lands on elements the component renders itself. So a component that styles a child
 * component's root element by class (passing `<Child class='x'>` and styling `.x` from the parent) compiles
 * to a selector requiring a scope the element does not carry, and the rule silently does nothing. There is
 * no build error and no console warning, and the un-styled default usually looks deliberate, so one of
 * these can ship and sit unnoticed for months.
 *
 * A rule is reported when its class appears in the built HTML but never alongside the scope the rule
 * demands. A class that never appears at all is left alone: it is either applied at runtime (`.is-active`,
 * `.is-open`) or belongs to a component nothing renders, and neither is this check's business.
 */

const SCOPED_SELECTOR_PATTERN = /\.([A-Za-z0-9_-]+)\[data-astro-cid-([a-z0-9]+)\]/g
const ELEMENT_PATTERN = /<[a-z][a-z0-9-]*\s[^>]*>/gi
const CLASS_ATTRIBUTE_PATTERN = /\sclass="([^"]*)"/i
const SCOPE_ATTRIBUTE_PATTERN = /data-astro-cid-([a-z0-9]+)/g
const STYLE_BLOCK_PATTERN = /<style[^>]*>([\s\S]*?)<\/style>/gi

/** Every scope each class is rendered with, so a rule's demand can be checked against reality. */
function indexRenderedClasses(markup, scopesByClass) {
  for (const element of markup.match(ELEMENT_PATTERN) ?? []) {
    const classMatch = element.match(CLASS_ATTRIBUTE_PATTERN)
    if (!classMatch) continue

    const scopes = Array.from(element.matchAll(SCOPE_ATTRIBUTE_PATTERN), (match) => match[1])
    for (const className of classMatch[1].split(/\s+/).filter(Boolean)) {
      const known = scopesByClass.get(className) ?? new Set()
      for (const scope of scopes) known.add(scope)

      scopesByClass.set(className, known)
    }
  }
}

/** The contents of every inline `<style>` block in a page. */
export function extractStyleBlocks(markup) {
  return Array.from(markup.matchAll(STYLE_BLOCK_PATTERN), (match) => match[1])
}

/**
 * Scoped rules whose class renders somewhere in the built pages but never with the scope the rule
 * demands, keyed by selector, with the scopes the class does render with and every source the rule was
 * declared in.
 */
export function findUnmatchedScopedRules(pages, styleSheets) {
  const scopesByClass = new Map()
  for (const { markup } of pages) indexRenderedClasses(markup, scopesByClass)

  const unmatched = new Map()
  for (const { source, css } of styleSheets) {
    for (const [selector, className, scope] of css.matchAll(SCOPED_SELECTOR_PATTERN)) {
      const rendered = scopesByClass.get(className)
      if (!rendered || rendered.has(scope)) continue

      const existing = unmatched.get(selector)
      if (existing) {
        existing.sources.add(source)
        continue
      }

      unmatched.set(selector, { className, scope, rendered, sources: new Set([source]) })
    }
  }

  return unmatched
}
