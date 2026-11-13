# semantic-release-gitmoji-config

[![npm version](https://img.shields.io/npm/v/semantic-release-gitmoji-config?logo=npm)](https://www.npmjs.com/package/semantic-release-gitmoji-config)
[![npm downloads](https://img.shields.io/npm/dm/semantic-release-gitmoji-config?logo=npm)](https://www.npmjs.com/package/semantic-release-gitmoji-config)
[![Quality](https://github.com/teopartesi/semantic-release-gitmoji-config/actions/workflows/ci.yml/badge.svg)](https://github.com/teopartesi/semantic-release-gitmoji-config/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/semantic-release-gitmoji-config)](LICENSE)

A shareable [semantic-release](https://semantic-release.gitbook.io/) configuration that understands the complete official [Gitmoji](https://gitmoji.dev/) catalog as Unicode emoji or shortcodes, while remaining compatible with Conventional Commits.

It analyzes commits, calculates the next version, generates a grouped `CHANGELOG.md`, commits that changelog, and creates a GitHub release.

📦 [View the package on npm](https://www.npmjs.com/package/semantic-release-gitmoji-config)

## 📋 Requirements

- Node.js `^22.14.0 || >=24.10.0`
- semantic-release `^25`
- A GitHub repository

## 📦 Installation

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

## ✍️ Supported commit messages

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

### 🧭 Version rules

| Commit                                                      | Release                  |
| ----------------------------------------------------------- | ------------------------ |
| `💥`, `:boom:`, `type!:`, or a `BREAKING CHANGE(S)` footer  | Major                    |
| `✨`, `:sparkles:`, or `feat:`                              | Minor                    |
| Gitmojis with an official `patch` value, `fix:`, or `perf:` | Patch                    |
| Any other official Gitmoji                                  | Patch                    |
| Other Conventional Commit types such as `docs:` or `chore:` | No release by themselves |

The last rule for Gitmojis is an intentional policy of this preset: Gitmojis whose official catalog entry has no SemVer value still trigger a patch. This means intentions such as `🚀 Deploy stuff` and `💚 Fix CI Build` are never silently lost.

Conventional Commit types that do not trigger a version are still included in the changelog when another commit causes a release.

## 📝 Release notes and changelog

Gitmoji commits are grouped using their official intention. Conventional Commits have emoji-prefixed sections such as `✨ Features`, `🐛 Bug Fixes`, `📝 Documentation`, and `💚 Continuous Integration`. These sections remain separate from Gitmoji intentions.

Breaking-change notes appear first under `💥 BREAKING CHANGES`. Other sections are sorted alphabetically by their label, ignoring the emoji. Commits within each section are sorted by their original scope and then subject.

For example, a changelog can contain the following entries (commit links omitted here):

```markdown
# 📝 Changelog

## 🔖 [2.0.0](https://github.com/owner/repo/compare/v1.0.0...v2.0.0) (2026-11-13)

### 💥 BREAKING CHANGES

- **🌐 api:** Migrate clients to the `/v2` endpoint.

### 🐛 Bug Fixes

- **🌐 api:** Reject malformed requests.

### 🚀 Deploy stuff

- Deploy the application.

### ✨ Features

- **🌐 api:** Add the `/v2` endpoint.

### 💚 Fix CI Build

- **💚 workflow:** Fix the release workflow.
```

Every release level uses the same version heading, with its date and comparison link when a previous release exists. The changelog plugin adds `# 📝 Changelog` when it next writes the file. Existing release entries are preserved without reformatting.

Automatic commits matching `chore(release): <version> [skip ci]` or `chore(release): 🔖 <version> [skip ci]` are omitted from the notes. Manual maintenance such as `chore(release): Recover incomplete release` remains visible.

### 🏷️ Scope emojis

The preset decorates these common scopes in release notes:

| Emoji | Scopes                        |
| ----- | ----------------------------- |
| 🌐    | `api`                         |
| 🔐    | `auth`, `security`            |
| ⚙️    | `core`, `config`              |
| 📦    | `deps`, `deps-dev`, `npm`     |
| 📝    | `docs`, `readme`              |
| 💚    | `ci`, `workflow`, `workflows` |
| ✅    | `test`, `tests`               |
| 🏗️    | `build`                       |
| 💄    | `ui`, `ux`                    |
| 🎨    | `format`, `style`             |
| 🔖    | `release`                     |
| 🤖    | `dependabot`                  |

Scope matching is case-insensitive and preserves the original spelling: `fix(API): ...` is displayed with `🌐 API`. Unknown scopes and scopes that already contain an emoji are preserved, and `*` is hidden. This fixed table only affects display; commit parsing and version rules are unchanged.

### 🔌 Plugins and configuration

The shared preset runs these plugins:

1. `@semantic-release/commit-analyzer`
2. `@semantic-release/release-notes-generator`
3. `@semantic-release/changelog`
4. `@semantic-release/git`
5. `@semantic-release/github`

It writes `CHANGELOG.md`, commits it with `chore(release): 🔖 <version> [skip ci]`, creates a `v<version>` tag, and publishes a GitHub release. It deliberately does **not** include `@semantic-release/npm`, so adopting the preset does not publish the consumer project to npm.

The preset leaves `branches` and `tagFormat` at semantic-release defaults. Those defaults include both `main` and `master` and produce `v<version>` tags. Either option can be overridden in the consuming repository.

### 🌿 Branches and pull requests

Opening a pull request does not publish a release or change the changelog. When a branch such as `develop` is merged into `main`, semantic-release collects all commits reachable from `main` since the previous release tag. A normal merge, including a `--no-ff` merge, preserves the branch commits; a rebase merge also preserves their individual messages, with new hashes.

All recognized Gitmoji and Conventional Commit messages from that history are included in the next release notes. The merge message itself and unsupported messages such as `Bump publint from ...` are omitted. The highest applicable release level across the collected commits determines the next version.

A squash merge replaces the branch history with one commit on `main`. Only that final commit is analyzed, so preserving every original entry requires a normal merge or rebase merge. Keep `fetch-depth: 0` in the release checkout so both the full history and release tags are available. `develop` does not need to be configured as a release branch for its commits to be included after merging into `main`.

## 🛠️ Developing this preset

Install the locked dependencies and run all local checks:

```bash
npm ci
npm run format:check
npm test
npm run lint:package
npm run pack:dry
```

The test suite calls the real commit analyzer and release-notes generator. It checks every Gitmoji from the installed official catalog in both Unicode and shortcode form, Conventional Commits, breaking changes, scope decoration, variation selectors, section ordering, links, and automatic release-commit filtering. An integration test creates a temporary Git repository, merges a multi-commit `develop` branch, and checks that future releases preserve existing changelog entries.

Use the dry run to inspect this repository's next release without publishing anything:

```bash
npm run release:dry
```

## 🚀 Publishing this preset

This repository has a separate internal `release.config.mjs`. It extends the public preset, adds `@semantic-release/npm` before `@semantic-release/git`, and commits the npm-updated `package.json` and `package-lock.json` together with `CHANGELOG.md`.

The release workflow runs on pushes to `main` or manually and only publishes from `main`. It validates the package and token authentication first, then creates both the npm and GitHub releases.

The CI workflow also runs a `Verify release tokens` job on pull requests from this repository, excluding Dependabot. It checks GitHub repository access and runs `npm whoami` using the `NPM_TOKEN` secret through `NODE_AUTH_TOKEN`. Fork and Dependabot pull requests skip this job because Actions secrets are unavailable. These read-only checks validate authentication; they do not guarantee publication permissions, npm 2FA requirements, or permission to push through branch protection. To require this check before merging eligible pull requests, add it to the repository's required status checks.

For the first npm publication, add a granular npm access token as the `NPM_TOKEN` GitHub Actions secret. Once the package exists on npm, configure a trusted publisher in the npm package settings with:

- Provider: GitHub Actions
- Organization or user: `teopartesi`
- Repository: `semantic-release-gitmoji-config`
- Workflow filename: `release.yml`

After trusted publishing is configured, adapt the token verification job and its reusable workflow secret requirement for OIDC before removing the `NPM_TOKEN` secret and revoking the bootstrap token. The current authentication check requires `NPM_TOKEN`; it does not validate trusted publishing. The release job grants `id-token: write`, and npm automatically attaches provenance for this public package.

Do not change the version manually. semantic-release updates it during publication based on the commit history.

## 📄 License

[MIT](LICENSE)
