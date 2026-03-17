# Publishing Guide for @ayme-dev/test

This repository (`ayme-test`) uses two release paths:
- a manual-only `release-please` workflow kept ready for stable releases
- a continuous beta publish workflow for experimentation on `main`

## Release Model

- Package manager: `pnpm`
- Registry: `npm`
- Package name: `@ayme-dev/test`
- Versioning: SemVer while remaining pre-1.0

Pre-1.0 behavior configured in `release-please-config.json`:
- `fix` commits -> patch bump (`0.y.z` -> `0.y.z+1`)
- `feat` commits -> minor bump (`0.y.z` -> `0.(y+1).0`)
- breaking changes (`!` or `BREAKING CHANGE:`) -> minor bump while `<1.0.0`

## One-Time npm Setup

1. Create/login to an npm account.
2. Ensure access to the `ayme-dev` npm organization for scoped publishes.
3. Verify org access:

```bash
npm org ls ayme-dev
```

## Conventional Commits

Use commit messages in this format:

```text
<type>(optional-scope): <description>
```

Examples:

```text
feat(playwright): add retry-aware fixture setup
fix(reporter): prevent duplicate summary rows
docs: update usage for pom-universal exports
feat!: redesign reporter API
```

Breaking change trailers are also supported:

```text
feat: redesign reporter API

BREAKING CHANGE: reporter options were renamed
```

## Local Enforcement (Husky + Commitlint)

Configured files:
- `.commitlintrc.cjs`
- `.husky/commit-msg`

Install dependencies once:

```bash
pnpm install
```

This runs `prepare` and installs Git hooks locally.

## CI Enforcement

Workflow: `.github/workflows/ci.yml`

- Pull requests run a `commitlint` job across commits in the PR range.
- Hooks can be bypassed locally, so CI remains the source of truth.

## Stable Releases (release-please)

Workflow: `.github/workflows/release-please.yml`

How it works:
1. Maintainers trigger the workflow manually with `workflow_dispatch`.
2. release-please opens/updates a release PR with:
   - version updates
   - `CHANGELOG.md` updates
3. Merging that release PR creates a GitHub release/tag.
4. In the same workflow run, npm publish executes when `release_created == true`.

Config files:
- `release-please-config.json`
- `.release-please-manifest.json`

## Required GitHub Settings

1. Repository secret: `NPM_TOKEN`
- Create an npm automation token in npm account settings.
- Add it as a repository secret in GitHub.

2. Repository Actions setting:
- Ensure GitHub Actions is allowed to create pull requests.

Optional:
- If needed in your org policy, create `RELEASE_PLEASE_TOKEN` and wire it into the workflow.

## Publishing Channels

Stable releases:
- handled by the manual `release-please` workflow
- published with npm's `latest` tag

Beta/pre-release channel:
- handled by `.github/workflows/beta-release.yml`
- runs after the `CI` workflow completes successfully for `main`
- can also be triggered manually with `workflow_dispatch`
- computes a unique version from the current base version in `package.json`
- publishes to npm with the `beta` dist-tag
- publishes the exact commit SHA that passed CI

Version shape for betas:
- if `package.json` is `0.1.0-beta.0`, workflow publishes versions like `0.1.0-beta.<run_number>.<run_attempt>`
- this keeps prerelease versions unique without committing version bumps back to git

## Maintainer Quick Checks

Before merging important changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

To inspect recent commit message validity locally:

```bash
pnpm exec commitlint --from HEAD~10 --to HEAD --verbose
```

## Troubleshooting

- `403 Forbidden`: verify the npm token in `NPM_TOKEN` belongs to an account with publish rights for `@ayme-dev/test`.
- `402 Payment Required`: ensure publish is public for this scoped package.
- Package not found after publish: check [npm package page](https://www.npmjs.com/package/@ayme-dev/test).
