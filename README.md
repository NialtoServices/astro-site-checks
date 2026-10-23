# @nialto-services/astro-site-checks

Post-build checks for Astro sites. Each one reads the built site in `dist/client` and fails when something is
wrong that the build itself never complains about: a link to a page that does not exist, a redirect that has
stopped working, a scoped style rule that can never apply, or a page loading from an origin the site's
Content-Security-Policy does not allow.

They are written for sites deployed to Cloudflare: the `redirects` and `headers` checks read the `_redirects`
and `_headers` files Cloudflare serves.

## Install

```sh
pnpm add -D @nialto-services/astro-site-checks
```

Then add a script for each check to the site's `package.json`:

```json
"lint:links": "astro-site-checks links",
"lint:redirects": "astro-site-checks redirects",
"lint:css-scope": "astro-site-checks css-scope",
"lint:headers": "astro-site-checks headers"
```

Every check reads the built site, so run it after `astro build`. Each one checks `dist/client` by default;
pass `--dir <path>` to check another directory.

## The checks

### `links`

Fails when a root-relative link in any built page points at a path the build does not serve. Each broken
target is listed once, with up to five of the pages that link to it.

A link to the source of a redirect is a warning rather than a failure: it resolves, but through a 301, so it
is worth linking straight to the destination.

A page that renders on demand (a file in `src/pages` exporting `prerender = false`) counts as served, since
the build writes no file for it.

A link to a server island (`/_server-islands/<name>/`, which Astro adds to a page using `server:defer`)
counts as served when the server build declares an island of that name, so a link to an island that no
longer exists still fails. The query string Astro adds to these links changes every build and is not
compared. The names are read from the server island manifest Astro writes into `dist/server`, next to the
checked directory. That file is internal build output, so if a page links to an island and no manifest can
be read, the check fails saying so, rather than reporting every island as broken.

Links to other hosts, including protocol-relative ones (`//cdn.example.com/…`), `mailto:` and `tel:` links,
in-page anchors and absolute links back to the site's own host are not checked.

### `redirects`

Checks every rule in the built `_redirects` for four faults:

- a target the build does not serve;
- a source the build serves as a real page, so the rule can never fire;
- a target that is itself the source of another rule, which makes a chain;
- a page rule without its other trailing-slash spelling pointing at the same target. Cloudflare matches a
  rule's source exactly, so without both spellings one of them lands on a 404.

A target served by a page that renders on demand counts as served, and a rule that only adds or removes the
trailing slash on a page's own URL is not asked for its other spelling.

A placeholder (`:name`, `*`) or a target on another host is skipped only by the faults that would have to
resolve it: a placeholder rule's concrete target is still checked, and so is the source of a rule pointing at
another host. A site with no `_redirects` passes.

### `css-scope`

Fails when a scoped style rule can never match the element it targets. Astro scopes a component's styles to
the elements that component renders, so styling a child component's root element by class compiles to a rule
that silently does nothing. A class that never appears in the built pages is left alone, since it is either
added at runtime or belongs to a component nothing renders.

### `headers`

Fails when a built page loads a script, image, frame, stylesheet or preloaded file from an origin the site's
Content-Security-Policy does not allow. The enforced `Content-Security-Policy` header is read if the site ships
one, otherwise `Content-Security-Policy-Report-Only`.

A site whose built `_headers` has no policy fails this check, since there is nothing to check its pages
against. Origins a tag manager injects while the page runs cannot be seen by a check of the built files.

## Configuration

A site sets options under `astroSiteChecks` in its `package.json`. There is one:

```json
"astroSiteChecks": {
  "headers": {
    "ungovernedPaths": ["mockups/"]
  }
}
```

`headers.ungovernedPaths` lists path prefixes, relative to the built site, whose pages the policy does not
govern: pages a site serves but did not author, such as design mock-ups reproduced as they were delivered.
The `headers` check skips them.

## Exit codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| 0    | The check passed.                      |
| 1    | The check failed; the output says why. |
| 2    | Unknown or missing check name.         |

## Licence

MIT
