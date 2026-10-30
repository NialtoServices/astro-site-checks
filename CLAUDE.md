# CLAUDE.md

A public npm package of post-build checks for Astro sites. Its README ships to npm as the package's documentation.

## Hard rules

- **Keep the package generic.** Never write the names or domains of the sites that use it, or any other personal or
  identifying information, into the repository: code, comments, tests, fixtures, the README, commit messages and pull
  requests. Fixtures and examples use generic component names and reserved placeholders such as `example.com`.
- **Explain a change by what it does, never by who needed it.** Describe the general shape of the problem it handles,
  not where it came up: a commit says "count server island routes as served", not "fix the false failure a site
  reported".

## Releasing

- **The owner cuts releases.** Don't tag or publish unless asked.
- **Releases publish from CI, never from a workstation.** Bump `version` in `package.json`, commit it as
  `Release <version>`, tag that commit `v<version>` and push the tag. The `publish` job in `.github/workflows/ci.yml`
  stages it on npm once `verify` passes, and it is installable only after the owner approves it.

## Verify before finishing

```bash
pnpm format:check
pnpm test
```
