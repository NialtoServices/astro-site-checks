/**
 * Generators for the property tests: URL paths shaped the way a built Astro site writes them.
 *
 * Segments are lowercase slugs without dots, so a generated page path can never read as a file. `index` is
 * left out because Astro treats a page file of that name as its directory, which would make the generated
 * URL and the route it came from disagree.
 */
import fc from 'fast-check'

export const segment = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,11}$/).filter((value) => value !== 'index')

export const segments = fc.array(segment, { minLength: 1, maxLength: 3 })

/** A page's URL without its trailing slash, such as `/services/repairs`. */
export const barePagePath = segments.map((parts) => `/${parts.join('/')}`)

/** A page's URL in either trailing-slash spelling. */
export const pagePath = fc.tuple(barePagePath, fc.boolean()).map(([path, slash]) => (slash ? `${path}/` : path))

/** A file the build serves as it is, such as `/downloads/brochure.pdf`. */
export const filePath = fc
  .tuple(fc.array(segment, { maxLength: 2 }), segment, fc.constantFrom('xml', 'pdf', 'txt', 'ico', 'webmanifest'))
  .map(([directories, name, extension]) => `/${[...directories, `${name}.${extension}`].join('/')}`)

/** Text with no line break, for comments and query strings. */
export const lineOfText = fc.string({ maxLength: 20 }).filter((value) => !/[\r\n]/.test(value))
