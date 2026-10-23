# CLAUDE.md

## Maintaining this file

This file carries what the codebase **cannot** tell you — constraints, rationale, gotchas, business rules — and is not
a description of the code. Derivable content here is worse than no content at all, because the file reads as ground
truth and so misleads the moment it drifts.

- **The codebase wins.** Where this file and the code disagree, the code is right and the line is stale. Verify against
  the source before acting on anything that reads like a fact about the current implementation, and fix or delete the
  line once you find the drift.
- **Before adding anything, ask whether a session could work it out** with `ls`, `cat`, `grep`, or the package
  manifest. If it could, don't add it: no directory layouts, dependency lists, component rosters, frontmatter or type
  enumerations, function signatures, or standard commands.
- **Do add** what the code can't explain: why something is the way it is, what breaks if it changes, prohibitions, copy
  and business rules, and non-obvious build or environment steps.
- **Prefer a pointer to a copy.** Name the file that holds the detail rather than restating it, so there is one source
  of truth and nothing to keep in sync.
- **Record constraints, not progress.** This file is not a changelog.

## Keep the package generic

This is a public package, and its README ships to npm. Never write the names or domains of the sites that use it, or any
other personal or identifying information, into the repository. That applies to code, comments, tests, fixtures, the
README, commit messages and pull requests. Fixtures and examples use generic component names and reserved placeholders
such as `example.com`.

Explain a change by what it does and the general shape of the problem it handles, never by who needed it or where it
came up. A commit says "count server island routes as served", not "fix the false failure a site reported".

## Releasing

Releases publish from CI, never from a workstation: bump `version` in `package.json`, commit it as `Release <version>`,
tag that commit `v<version>` and push the tag. The `publish` job in `.github/workflows/ci.yml` runs only after `verify`
passes for the tag, and refuses a tag that doesn't match the version. It stages the release through npm trusted
publishing, which needs no npm token and attaches provenance.

The trusted publisher on npmjs.com names this repository and `ci.yml`, so renaming the workflow file stops releases
until the publisher is updated to match. It allows staging only, so a plain `npm publish` from CI is refused. A staged
release isn't installable until the owner approves it on npmjs.com (Staged Packages) or with
`npm stage approve <stage-id>`, both behind two-factor authentication. The owner cuts releases; don't tag or publish
unless asked.
