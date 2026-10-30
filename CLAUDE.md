# CLAUDE.md

A public npm package of post-build checks for Astro sites. Its README ships to npm as the package's documentation.

## Hard rules

- **Fixtures and examples use generic component names**, such as `RecentPosts`, never one taken from a site using the
  package.

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
