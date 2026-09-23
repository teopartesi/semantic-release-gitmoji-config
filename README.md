# semantic-release-gitmoji-config

A shareable [semantic-release](https://semantic-release.gitbook.io/) configuration that understands the complete official [Gitmoji](https://gitmoji.dev/) catalog as Unicode emoji or shortcodes, while remaining compatible with Conventional Commits.

It analyzes commits, calculates the next version, generates a grouped `CHANGELOG.md`, commits that changelog, and creates a GitHub release.

## Requirements

- Node.js `^22.14.0 || >=24.10.0`
- semantic-release `^25`
- A GitHub repository

## Installation

Install semantic-release and this preset as development dependencies:

```bash
npm install --save-dev semantic-release semantic-release-gitmoji-config
```

Create a `.releaserc.json` file:

```json
{
  "extends": ["semantic-release-gitmoji-config"]
}
```

Then run semantic-release from CI with a complete Git history:

```bash
npx semantic-release
```

A minimal GitHub Actions workflow looks like this:

```yaml
name: Release

on:
  push:
    branches:
      - main

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Because the preset commits `CHANGELOG.md` back to the release branch, the repository rules must allow the GitHub Actions token to push that release commit.

## Supported commit messages

The parser accepts Gitmoji, Conventional Commits, and hybrid histories:

```text
💄 Restyle the navigation
🐛 (api): Fix response parsing
:lipstick: Add hover states
:green_heart: Fix the release workflow
🚀 Deploy the application

feat: Add project filters
fix(contact): Validate the email address
perf!: Remove the legacy rendering path
```

A hybrid message follows its leading type. For example, `💄 feat: Restyle the page` is classified as `💄`, while `fix: ✨ Add a guarded feature` is classified as `fix`.

Unicode variation selectors are normalized, so forms such as `⚡` and `⚡️` are equivalent. Merge commits and messages with neither a known Gitmoji nor a valid Conventional Commit type are omitted from release notes.

### Version rules

| Commit                                                      | Release                  |
| ----------------------------------------------------------- | ------------------------ |
| `💥`, `:boom:`, `type!:`, or a `BREAKING CHANGE(S)` footer  | Major                    |
| `✨`, `:sparkles:`, or `feat:`                              | Minor                    |
| Gitmojis with an official `patch` value, `fix:`, or `perf:` | Patch                    |
| Any other official Gitmoji                                  | Patch                    |
| Other Conventional Commit types such as `docs:` or `chore:` | No release by themselves |

The last rule for Gitmojis is an intentional policy of this preset: Gitmojis whose official catalog entry has no SemVer value still trigger a patch. This means intentions such as `🚀 Deploy stuff` and `💚 Fix CI Build` are never silently lost.

Conventional Commit types that do not trigger a version are still included in the changelog when another commit causes a release.

## Release notes and changelog

Gitmoji commits are grouped using their official intention. For example:

```markdown
## 🚀 Deploy stuff

- Deploy the application

## 💚 Fix CI Build

- Fix the release workflow
```

Conventional Commits use familiar sections such as `Features`, `Bug Fixes`, `Documentation`, and `Continuous Integration`.

The shared preset runs these plugins:

1. `@semantic-release/commit-analyzer`
2. `@semantic-release/release-notes-generator`
3. `@semantic-release/changelog`
4. `@semantic-release/git`
5. `@semantic-release/github`

It writes `CHANGELOG.md`, commits it with `[skip ci]`, creates a `v<version>` tag, and publishes a GitHub release. It deliberately does **not** include `@semantic-release/npm`, so adopting the preset does not publish the consumer project to npm.

The preset leaves `branches` and `tagFormat` at semantic-release defaults. Those defaults include both `main` and `master` and produce `v<version>` tags. Either option can be overridden in the consuming repository.

## Developing this preset

Install the locked dependencies and run all local checks:

```bash
npm ci
npm run format:check
npm test
npm run lint:package
npm run pack:dry
```

The test suite calls the real commit analyzer and release-notes generator. It checks every Gitmoji from the installed official catalog in both Unicode and shortcode form, Conventional Commits, breaking changes, scopes, variation selectors, release-note grouping, and merge exclusion.

Use the dry run to inspect this repository's next release without publishing anything:

```bash
npm run release:dry
```

## Publishing this preset

This repository has a separate internal `release.config.mjs`. It extends the public preset, adds `@semantic-release/npm` before `@semantic-release/git`, and commits the npm-updated `package.json` and `package-lock.json` together with `CHANGELOG.md`.

The release workflow is manual and only publishes from `main`. It validates the package first, then creates both the npm and GitHub releases.

For the first npm publication, add a granular npm access token as the `NPM_TOKEN` GitHub Actions secret. Once the package exists on npm, configure a trusted publisher in the npm package settings with:

- Provider: GitHub Actions
- Organization or user: `teopartesi`
- Repository: `semantic-release-gitmoji-config`
- Workflow filename: `release.yml`

After trusted publishing is configured, remove the `NPM_TOKEN` secret and revoke the bootstrap token. The workflow grants `id-token: write`, and npm automatically attaches provenance for this public package.

Do not change the version manually. semantic-release updates it during publication based on the commit history.

## License

[MIT](LICENSE)
