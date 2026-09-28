/**
 * The rules in a Cloudflare `_redirects` file, and the four ways a rule stops doing its job, as pure
 * functions over the parsed rules and the paths the build serves.
 *
 * A redirect usually carries an inbound link a previous site earned, so a rule that fails loses that link
 * silently: nothing in the build errors, and the only symptom is a 404 a crawler finds months later.
 */
import { isServable } from './built-site.mjs'

/** `source target status` lines, comments and blanks skipped, as a source → target map. */
export function parseRedirects(text) {
  const redirects = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const [source, target] = trimmed.split(/\s+/)
    redirects.set(source, target)
  }

  return redirects
}

/**
 * Whether one side of a rule is a concrete path on this site. A placeholder (`:name`, `*`) matches many
 * URLs and a target on another host is not ours to resolve, so each fault is checked only on the side it
 * reads: a placeholder source can still have a broken target, and an external target can still have a
 * shadowed source.
 */
function isConcretePath(path) {
  return Boolean(path?.startsWith('/')) && !/[:*]/.test(path)
}

/**
 * Rules whose target the build does not serve.
 *
 * A 301 to a missing page is worse than no rule at all: a crawler follows it, finds nothing, and drops the
 * old URL without gaining a replacement.
 */
export function findBrokenTargets(redirects, servablePaths) {
  const broken = []
  for (const [source, target] of redirects) {
    if (!isConcretePath(target)) continue
    if (isServable(servablePaths, target)) continue

    broken.push({ source, target })
  }

  return broken
}

/**
 * Rules whose source the build serves as a real page, so the rule can never fire.
 *
 * A static asset wins over a redirect rule, which makes the rule invisible rather than broken: it usually
 * means a page was rebuilt under a URL that had been retired, and the two intentions now contradict each
 * other.
 */
export function findShadowedSources(redirects, servablePaths) {
  const shadowed = []
  for (const [source, target] of redirects) {
    if (!isConcretePath(source)) continue
    if (!isServable(servablePaths, source)) continue

    shadowed.push({ source, target })
  }

  return shadowed
}

/**
 * Rules whose target is itself the source of another rule.
 *
 * Cloudflare applies one rule per request rather than resolving a chain itself, so a chain costs the
 * visitor a second round trip and hands a search engine a hop's worth of dilution on a link that used to
 * arrive in one.
 */
export function findRedirectChains(redirects) {
  const chains = []
  for (const [source, target] of redirects) {
    if (!isConcretePath(target)) continue
    if (!redirects.has(target)) continue

    chains.push({ source, target, eventualTarget: redirects.get(target) })
  }

  return chains
}

/**
 * Page rules whose other trailing-slash spelling does not lead to the same page.
 *
 * Cloudflare matches a rule's source exactly, and only redirects between the two spellings when a page is
 * built at one of them, which a retired URL never is. A previous site usually answered both, so a backlink
 * or bookmark in the spelling without a rule lands on a 404. A file's path is left alone: nothing requests
 * `/sitemap.xml/`.
 */
export function findMissingSpellings(redirects) {
  const missing = []
  for (const [source, target] of redirects) {
    if (!isConcretePath(source)) continue

    const lastSegment = source.replace(/\/$/, '').split('/').pop() ?? ''
    if (source === '/' || lastSegment.includes('.')) continue

    const otherSpelling = source.endsWith('/') ? source.slice(0, -1) : `${source}/`
    if (redirects.get(otherSpelling) === target) continue

    missing.push({ source, missing: otherSpelling, target })
  }

  return missing
}
