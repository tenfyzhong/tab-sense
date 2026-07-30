# Tab Sense

Tab Sense is a Chrome extension that closes duplicate tabs and organizes ungrouped tabs with an AI provider selected by the user.

## Features

- Close tabs whose complete URLs are exactly equal in the current window.
- Protect every pinned tab from automatic closure.
- Keep the active duplicate, or otherwise the leftmost duplicate, when no pinned copy exists.
- Group ungrouped, unpinned tabs by topic with OpenAI Responses, Anthropic, Google Gemini, or an OpenAI Completions-compatible API.
- Create multiple named provider profiles, switch between them, and retain each profile's protocol, Base URL, API key, model list, and selected model.
- Start with no preconfigured providers; every provider profile is added explicitly by the user and the final profile can be deleted.
- Use an official endpoint or a custom API Base URL with every supported protocol.
- Load the models available to an API key and select a model independently for each saved profile.
- Test a saved model with one bounded generation request before using it for tab grouping.
- Use a compact responsive settings page with fixed toast feedback and shortcut configuration in the page header.
- Open settings from the popup's accessible top-right gear button; shortcut configuration stays on the settings page.
- Guide new installations with a localized six-step spotlight overlay across the existing popup and settings page, including a real first-provider action and persisted cross-page progress.
- Optionally close duplicate tabs before AI grouping. This option is disabled by default; when enabled, AI grouping stops if duplicate cleanup fails.
- Keep mutation buttons disabled while a background tab operation is running, including after the popup is closed and reopened.
- Show localized progress feedback immediately after an action starts and consistently when a popup is reopened during that operation.
- Show the deduplicate-first preference as a compact badge inside the AI action and keep ungroup/undo controls visually secondary.
- Prefer adding ungrouped tabs to suitable existing groups before creating new groups, reducing unnecessary group proliferation.
- Undo the most recent duplicate cleanup, AI grouping, or ungroup-all operation during the current browser session.
- Remove every tab from its group in the current window with **Ungroup All Tabs**.
- Run duplicate cleanup with `Alt+Shift+D` and AI grouping with `Alt+Shift+G`.
- Optionally enable the extension in Chrome Incognito windows.
- Use the interface in English or Simplified Chinese according to the Chrome UI language.

## Requirements

- Google Chrome 116 or later
- Node.js 22 or later for development
- pnpm 10

## Install an Unpacked Build

1. Run `pnpm install`.
2. Run `pnpm build`.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose `output/chrome-mv3`.

The production ZIP can be generated with `pnpm zip`.

To use Tab Sense in Incognito windows, open its details page from `chrome://extensions`
and enable **Allow in Incognito**. Chrome requires this access to be granted explicitly.

## Configure AI Grouping

1. Open the Tab Sense settings page with the gear button in the top-right corner of the extension popup.
2. Select an existing provider profile or choose **Add provider** to create the first one.
3. Give the profile a descriptive name and choose its protocol.
4. Keep the official API Base URL or enter a custom API root, such as `https://api.example.com/v1`.
5. Enter an API key.
6. Select **Refresh models** and grant Chrome access to the configured provider host when prompted.
7. Choose one of the returned models. The selection is saved with that profile.
8. Select **Test model** to verify the saved key, endpoint, and selected model.
9. Optionally enable **Close duplicate tabs before AI grouping**.

Chrome shortcut configuration is available from the button in the settings-page header.

Remote endpoints for every protocol must use HTTPS. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1` so local model servers and gateways can be used safely. The Base URL must include the provider's API version path when required, such as `/v1` for OpenAI or `/v1beta` for Gemini. Anthropic follows the official SDK convention and automatically appends `/v1`; legacy Base URLs already ending in `/v1` remain supported.

If an Anthropic-compatible endpoint does not expose `/v1/models`, Tab Sense retries model discovery once through the sibling OpenAI-format `/models` endpoint with Bearer authentication. AI grouping continues to use the Anthropic Messages protocol.

The model connectivity test sends a short `Reply with OK.` prompt with a maximum output of 16 tokens. The provider may charge for this request.

OpenAI Responses and OpenAI Completions model APIs can return models that do not generate text because their model-list responses do not expose a universal generation-capability field. If such a model is selected, Tab Sense reports the provider error without changing tab groups.

## Tab Behavior

Duplicate cleanup compares complete URL strings. Query strings and fragments are significant. Existing Chrome tab groups participate in duplicate detection.

Pinned tabs are never closed. If a duplicate URL has at least one pinned tab, all matching unpinned tabs are closed and the pinned tabs remain. Otherwise, the active matching tab is retained; if none is active, the leftmost matching tab is retained.

AI grouping mutates only ungrouped and unpinned tabs in the current window. To find a suitable destination, Tab Sense provides the AI with the IDs and titles of up to 50 existing groups and sanitized summaries for up to five member tabs per group. A single ungrouped tab may join an existing group. A new group is created only when no existing group is suitable and at least two tabs belong together. Reused groups retain their existing title, color, and collapsed state. New groups are expanded and receive deterministic Chrome group colors.

After AI grouping succeeds, all tab groups keep their relative order and move ahead of standalone unpinned tabs. Pinned tabs remain at the front of the window.

Tab Sense keeps one undo record for the latest mutating action. A newer successful duplicate cleanup, AI grouping, or ungroup-all operation replaces the previous record. Undoing AI grouping removes only tabs that still belong to groups created by that operation, so subsequent manual moves are preserved. Undoing duplicate cleanup recreates the closed URLs and attempts to restore their positions and group membership; Chrome may reject restoration of restricted URLs or windows that no longer exist. **Ungroup All Tabs** affects only the current window and can be undone while its record remains available.

## Privacy and Security

Provider profiles and API keys are stored only in `chrome.storage.local`; they are not synchronized and API keys are never returned to the popup or settings UI after storage. Chrome extension local storage is not an encrypted credential vault.

The latest undo snapshot is stored in `chrome.storage.session` and is cleared when it is used, replaced, the extension session ends, or Chrome clears extension session storage. A duplicate-cleanup snapshot contains the URLs and positions of tabs closed by that operation so they can be recreated.

AI grouping sends only the following data directly from the extension to the selected provider:

- The numeric tab IDs used to map the result back to Chrome
- Up to 200 characters of each included tab title
- Up to 500 characters of each included URL after removing its query string and fragment
- Existing group IDs and up to 100 characters of each existing group title
- Sanitized summaries for up to five member tabs in each of up to 50 existing groups, used only as matching context

Tab Sense has no backend, analytics, advertising, or content scripts. See [PRIVACY.md](PRIVACY.md) for the full privacy disclosure.

When Incognito access is enabled, provider profiles and API keys are shared with the regular
browser context. Actions run in an Incognito window may send the tab metadata described above
to the selected AI provider.

## Development

```text
pnpm dev        Start WXT development mode
pnpm test       Run the Vitest suite
pnpm typecheck  Run TypeScript validation
pnpm lint       Run ESLint
pnpm build      Build the unpacked Chrome extension
pnpm zip        Create the distributable Chrome ZIP
```

Behavior changes follow test-driven development: add a failing reusable test, implement the minimum behavior, and then run the full verification suite.

Pull requests run `pnpm test` automatically when they are opened, reopened, or updated with new commits. The workflow uses Node.js 22, the pnpm version declared in `package.json`, a frozen lockfile install, and read-only repository permissions.

## Project Structure

- `src/background` contains runtime routing, workflow locking, and provider orchestration.
- `src/core` contains duplicate planning, grouping validation, provider-profile storage, undo storage, and Chrome tab operations.
- `src/providers` contains provider-specific HTTP adapters.
- `src/entrypoints` contains the Manifest V3 service worker, popup, and settings page.
- `public/_locales` contains English and Simplified Chinese interface messages.

## Packaging

The source repository and generated ZIP are the intended deliverables. Chrome Web Store submission and store listing assets are outside the current scope.

## Automated GitHub Releases

Pushing a Git tag starts `.github/workflows/release.yml`. The workflow installs the pnpm version declared in `package.json` on Node.js 22, runs linting, type checking, and tests, creates the Chrome ZIP, verifies the archive, and publishes it as a GitHub Release asset with generated release notes.

The tag must match the `package.json` version, with an optional leading `v`. For example, version `0.1.2` accepts either `v0.1.2` or `0.1.2`:

```bash
git tag v0.1.2
git push origin v0.1.2
```

Rerunning the workflow for an existing release replaces the ZIP asset. The workflow uses the repository-provided `GITHUB_TOKEN`; no additional release secret is required.
