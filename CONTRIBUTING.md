# Contributing to Tab Sense

## Prerequisites

- Node.js 22 or later
- pnpm 10 (use the version declared in `package.json` when possible)

## Set Up the Project

1. Clone the repository and enter its directory.
2. Install dependencies with `pnpm install`.
3. Start development mode for your target browser.

| Browser | Manifest | Development command |
| --- | --- | --- |
| Google Chrome 116+ | MV3 | `pnpm dev` |
| Microsoft Edge 116+ | MV3 | `pnpm dev:edge` |
| Mozilla Firefox 142+ | MV2 | `pnpm dev:firefox` |

To create an unpacked production build, use the corresponding command and load the output directory from the browser's extension development page.

| Browser | Build command | Build directory |
| --- | --- | --- |
| Google Chrome | `pnpm build:chrome` | `output/chrome-mv3` |
| Microsoft Edge | `pnpm build:edge` | `output/edge-mv3` |
| Mozilla Firefox | `pnpm build:firefox` | `output/firefox-mv2` |

## Development Commands

```text
pnpm dev         Start WXT development mode for Chrome
pnpm dev:edge    Start WXT development mode for Edge
pnpm dev:firefox Start WXT development mode for Firefox
pnpm test        Run the Vitest suite
pnpm test:watch  Run Vitest in watch mode
pnpm typecheck   Run TypeScript validation
pnpm lint        Run ESLint
pnpm build       Build the unpacked Chrome extension
pnpm build:all   Build Chrome, Edge, and Firefox extensions
pnpm zip         Create the distributable Chrome ZIP
pnpm zip:all     Create Chrome, Edge, and Firefox ZIPs
```

## Testing and Pull Requests

Behavior changes follow test-driven development: add a failing reusable test, implement the minimum behavior, and then run the full verification suite.

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Pull requests run `pnpm test` automatically when they are opened, reopened, or updated with new commits. The workflow uses Node.js 22, the pnpm version declared in `package.json`, a frozen lockfile install, and read-only repository permissions.

## Project Structure

- `src/background` contains runtime routing, workflow locking, and provider orchestration.
- `src/core` contains duplicate planning, grouping validation, provider-profile storage, undo storage, and browser tab operations.
- `src/providers` contains provider-specific HTTP adapters.
- `src/entrypoints` contains the background entrypoint, popup, and settings page.
- `public/_locales` contains English and Simplified Chinese interface messages.

## Packaging

`pnpm zip:all` generates separate Chrome, Edge, and Firefox archives because the Firefox manifest and permission model differ from Chromium.

The generated packages use these paths:

| Browser | Package command | Archive |
| --- | --- | --- |
| Google Chrome | `pnpm zip:chrome` | `output/tab-sense-<version>-chrome.zip` |
| Microsoft Edge | `pnpm zip:edge` | `output/tab-sense-<version>-edge.zip` |
| Mozilla Firefox | `pnpm zip:firefox` | `output/tab-sense-<version>-firefox.zip` |

## Automated GitHub Releases

Pushing a Git tag starts `.github/workflows/release.yml`. The workflow installs the pnpm version declared in `package.json` on Node.js 22, runs linting, type checking, and tests, temporarily sets the package version from the tag, creates and verifies separate Chrome, Edge, and Firefox ZIPs, and publishes all three as GitHub Release assets with generated release notes. It then submits the Firefox and Edge packages to their browser stores. The temporary version change exists only in the workflow checkout and is not committed to the repository.

The tag is the source of truth for release versions, so the development version in `package.json` does not need to be updated before a release. Tags must use `MAJOR.MINOR.PATCH`, with an optional leading `v`; each numeric component must be no greater than 65535. For example:

```bash
git tag v0.1.2
git push origin v0.1.2
```

Rerunning the workflow for an existing release replaces the ZIP assets. Publishing the GitHub Release uses the repository-provided `GITHUB_TOKEN`. Firefox and Edge store submission requires the repository variables and secrets referenced by the workflow; see [STORE_SUBMISSION_GUIDE.md](STORE_SUBMISSION_GUIDE.md) for the store metadata and submission details.
