# Tab Sense Chrome Extension

## Summary

- Build a Chrome Manifest V3 extension named **Tab Sense** using WXT, React, TypeScript, pnpm, and Vitest.
- This plan is the first repository file. No implementation, configuration, or test files are created before it.
- Deliver source code, automated tests, an unpacked production build, and a distributable ZIP. Chrome Web Store submission is excluded.

## Implementation Changes

- Extend provider configuration into named, saved provider profiles:
  - Every profile has a stable ID, user-defined name, protocol (`OpenAI`, `Anthropic`, `Gemini`, or `OpenAI-compatible`), Base URL, API key, refreshed model list, and selected model.
  - OpenAI, Anthropic, and Gemini profiles accept custom Base URLs in addition to their official defaults; endpoint paths are appended according to the selected protocol.
  - Display saved profiles in a selector and persist the active profile and each profile's selected model for quick switching.
  - Label the OpenAI protocol variants as **OpenAI Responses** and **OpenAI Completions** so their request formats are clear, while preserving user-defined profile names and migrating only legacy built-in names.
  - Support creating, updating, selecting, and deleting profiles while never returning stored API keys to extension pages.
  - Start new installations with no saved provider profiles, require users to add every provider explicitly, show a clear empty state in settings, and allow the final saved profile to be deleted.
- Make operation state background-owned and observable so reopening the popup during a running operation keeps all conflicting mutation actions, especially **Group Tabs with AI**, disabled.
- Show the same localized in-progress message immediately when a popup action starts and when a reopened popup discovers that background operation, replacing it only after the final result is available.
- Keep the popup compact by rendering the deduplicate-before-grouping state as a small badge inside the **Group Tabs with AI** button instead of a separate notice, and present **Ungroup All Tabs** and **Undo Last Action** as smaller, visually subdued secondary controls.
- Let the popup height follow its visible content instead of enforcing a fixed minimum height, so no unused area remains below the settings and shortcut links.
- Add a single-level, persisted undo record for the latest completed mutating action:
  - Undo AI grouping by restoring each affected tab's previous group assignment.
  - Undo duplicate closing by recreating the closed tabs at their recorded window positions and restoring surviving group membership where possible.
  - Clear or replace the undo record when a newer mutating action succeeds; validate tab and window state before restoration and report partial failures.
- Add an **Ungroup All Tabs** action for the current window and capture its tab-group snapshot so that action can also be undone.
- Prefer existing Chrome tab groups during AI grouping:
  - Send the current window's existing group IDs, titles, and a bounded set of sanitized member-tab summaries as matching context.
  - Require the provider to assign eligible ungrouped tabs to a suitable existing group before proposing a new group.
  - Allow one or more tabs to join an existing group, but continue requiring at least two tabs before creating a new group.
  - Validate every returned existing group ID, merge repeated assignments to the same existing group, preserve its title, color, and collapsed state, and fall back to a new group only when the target group disappeared and at least two tabs remain.

- Create an English/Chinese localized popup with:
  - **Close Duplicate Tabs** and **Group Tabs with AI** actions.
  - Inline progress, combined workflow results, errors, settings access, and shortcut status.
  - Default shortcuts `Alt+Shift+D` and `Alt+Shift+G`, with guidance for changing them in Chrome.
- Create a localized options page supporting:
  - Independent named profiles using OpenAI, Anthropic, Gemini, or OpenAI-compatible protocols.
  - A global **Close duplicate tabs before AI grouping** toggle, disabled by default.
  - Profile-specific API keys, models, and refreshed model lists stored independently in `chrome.storage.local`.
  - Saved keys displayed only as a saved-state indicator with an empty replacement field.
  - Explicit model loading using the API key; key or Base URL changes invalidate the current model selection.
  - A model connectivity test button enabled only after an API key and model are saved; run one bounded generation request through the selected protocol, report success or sanitized failure inline, and never mutate browser tabs.
  - Custom Base URLs for every protocol using HTTPS or loopback HTTP on `localhost`, `127.0.0.1`, or `::1`; reject credentials, query strings, fragments, and other HTTP hosts.
  - A compact, responsive settings layout that keeps the provider selector, shortcut-settings entry, workflow preference, and primary actions visible without unnecessary page scrolling on common desktop viewports.
  - Top-align the API-key and model field rows so the saved-key indicator never shifts the model selector or connectivity-test button below the adjacent API-key controls.
  - Fixed toast feedback for save, model refresh, connectivity-test, profile, and validation results so messages remain visible regardless of the current scroll position.
- Keep the popup navigation minimal: expose settings as an accessible gear icon in the top-right corner and remove the shortcut-settings entry from the popup.
- Duplicate removal operates on the captured current normal window:
  - Compare complete, non-empty URL strings exactly; query strings and fragments remain significant.
  - Include already-grouped tabs in duplicate detection.
  - Never close pinned tabs. If a duplicate set has pinned tabs, close only its unpinned members; otherwise retain its active member or, if none is active, its leftmost member.
  - Report closed counts and pinned duplicates that remain.
- AI grouping operates directly without preview:
  - When the preprocessing toggle is enabled, run duplicate removal first under the same operation lock, then re-query tabs before contacting the AI provider.
  - If duplicate removal fails, stop the workflow, make no AI request, and report the preprocessing failure.
  - If preprocessing succeeds or finds no duplicates, continue with the updated tab collection and include both deduplication and grouping results in the final status.
  - Include only current-window tabs that are ungrouped, unpinned, and have valid IDs.
  - Send only the tab ID, title limited to 200 characters, and URL limited to 500 characters after removing query and fragment.
  - Ask for topic-based JSON groups using the current UI language for concise group names.
  - Validate `{ groups: [{ name, tabIds }] }` locally: reject unknown or repeated IDs, leave omitted or singleton tabs ungrouped, and only create groups containing at least two still-eligible tabs.
  - Create expanded groups with deterministic colors. If application fails partway, ungroup every tab changed by that operation.
- Serialize standalone duplicate closing and complete AI workflows through one background-operation lock.
- Use `tabs`, `tabGroups`, `storage`, and `notifications` permissions; disable incognito operation. Request provider host access at configuration time using optional host permissions.
- Route API access through provider adapters:
  - OpenAI: list `/v1/models`, generate through `/v1/responses`.
  - Anthropic: paginate `/v1/models`, generate through `/v1/messages`.
  - Treat custom Anthropic Base URLs like the official Anthropic SDK: append `/v1` before `models` and `messages`, while accepting legacy saved Base URLs that already end in `/v1` without duplicating the version segment.
  - If an Anthropic-compatible service returns `404` for its Models API, retry model discovery once through the sibling OpenAI-format `/models` catalog using Bearer authentication; continue to use Anthropic Messages for grouping.
  - Gemini: paginate `/v1beta/models`, retain models supporting `generateContent`, and call `generateContent`.
  - OpenAI-compatible: append `/models` and `/chat/completions` to the configured API root and use Bearer authentication.
  - Require JSON-only output, accept raw or fenced JSON, validate before mutation, make no automatic billable retry, and sanitize authentication, rate-limit, network, and malformed-response errors.
- Automate tagged GitHub releases:
  - Trigger a release workflow whenever a tag is pushed.
  - Derive the release version from the tag, with an optional leading `v`, and temporarily apply it to `package.json` before packaging.
  - Install the pinned pnpm version on Node.js 22, run linting, type checking, and the full test suite, then build and integrity-check the Chrome ZIP.
  - Create a GitHub Release with generated notes and the ZIP attached, or replace the ZIP safely when a release workflow is rerun for the same tag.
  - Grant only repository-content write permission to the workflow and authenticate with the built-in `GITHUB_TOKEN`.
- Run pull-request tests in GitHub Actions:
  - Trigger for pull-request creation, reopening, and new commits through the standard `pull_request` event.
  - Check out the pull-request revision with read-only repository-content permission, install the pinned pnpm version on Node.js 22, restore the pnpm cache, and install dependencies from the lockfile.
  - Run `pnpm test` as the required verification command without granting write permissions or exposing secrets.
- Use system notifications for shortcut results and errors; popup-triggered actions report inline. Add original extension icons at required Chrome sizes.

## Interfaces and Data Flow

- Define `ProviderId`, redacted provider settings, locally stored credentials, `ModelOption`, sanitized tab input, `GroupingPlan`, workflow preferences, and discriminated `OperationResult` types.
- Store `deduplicateBeforeGrouping: boolean` as a global workflow preference with a default of `false`.
- Define an `AiProviderAdapter` contract with `listModels()` and `groupTabs()` methods.
- Use typed runtime messages for settings reads and updates, model refresh, duplicate closing, AI grouping, and operation status. Background responses must never expose stored API keys.
- Add typed runtime messages for provider-profile CRUD and selection, persistent operation-state reads, undo availability/execution, and ungroup-all execution.
- Implement AI grouping as one background orchestration transaction: optional deduplication, fresh tab query, provider request, validation, grouping, and combined result reporting.
- The service worker owns tab mutation, provider requests, concurrency control, notifications, stale-tab checks, and rollback. Popup and options pages remain presentation layers.
- No external public API, backend, content script, remote executable code, analytics, or credential synchronization is introduced.

## Test Plan

- Follow TDD for every behavior: add and run a failing reusable test before its production implementation.
- Unit-test exact URL comparison, active/leftmost retention, pinned protection, grouped tabs, missing URLs, and result summaries.
- Test the preprocessing preference when disabled and enabled, including:
  - Disabled workflows never invoke duplicate removal.
  - Enabled workflows remove duplicates before constructing the AI input.
  - Tabs are re-queried after successful preprocessing.
  - Preprocessing failure prevents the provider request.
  - Popup and shortcut paths obey the same setting and return combined summaries.
- Unit-test URL redaction, prompt construction, JSON extraction, response validation, singleton handling, stale tabs, deterministic colors, concurrency, and rollback.
- Test existing-group context construction, existing-group priority instructions, valid and invalid existing group IDs, singleton reuse, merging repeated existing-group assignments, stale-group fallback, metadata preservation, and undo of tabs added to an existing group.
- Mock HTTP and test every provider's authentication, pagination, model normalization, generation parsing, custom Base URL validation, optional permissions, and sanitized errors without real credentials.
- Test bounded connectivity requests for every provider protocol, including endpoint, authentication, selected model, output limits, success, and sanitized failure behavior.
- Test Anthropic endpoint construction for both SDK-style Base URLs without `/v1` and legacy Base URLs that already include `/v1`.
- Test the bounded Anthropic-model-discovery fallback on `404`, including sibling URL derivation, Bearer authentication, model normalization, and no fallback for other provider errors.
- Test per-profile storage isolation, preference persistence and defaulting, key redaction, English and Simplified Chinese UI states, model refresh, disabled actions, shortcut routing, inline status, and notifications.
- Test that model connectivity is disabled until both key and model are saved, then routes through the background and reports progress, success, or failure without tab mutations.
- Test fixed options-page toast feedback, the high-position shortcut-settings entry, compact responsive layout hooks, and popup navigation containing only an accessible top-right settings icon.
- Test API-key and model field alignment when the saved-key indicator is present.
- Validate the release workflow syntax, tag filter, least-privilege permissions, version guard, verification commands, ZIP integrity check, and GitHub Release upload path.
- Validate the pull-request workflow syntax, event trigger, read-only permissions, pinned toolchain setup, frozen dependency install, and `pnpm test` command.
- Test that the popup shell does not impose a fixed minimum height after compact actions are rendered.
- Test named profile creation, protocol-specific custom Base URLs, active-profile/model persistence, profile switching and deletion, and migration from the initial per-protocol settings shape.
- Test empty initial provider storage, first-profile creation and selection, deleting the final profile, and the settings-page empty state.
- Test the OpenAI Responses and OpenAI Completions protocol labels plus migration of legacy built-in profile names without changing custom names.
- Test popup reopening against a running background operation, undo record replacement and persistence, grouping undo, duplicate-tab recreation, partial restore failures, and ungroup-all with undo.
- Finish with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm zip`, then manually load the unpacked build in Chrome and verify both popup actions, both shortcuts, settings, notifications, preprocessing modes, and tab-group behavior.

## Assumptions and Acceptance

- Support Chrome 116 and later; UI defaults to English and switches to Simplified Chinese through Chrome localization.
- Publish this initial accumulated feature set as package version `0.1.0`; keep tag examples and generated artifact names aligned with that version.
- All repository documentation, including `PLAN.md`, `README.md`, and `PRIVACY.md`, is written only in English. Chinese text appears only in localization resources.
- Document that API keys are stored locally but are not protected by an encrypted vault, and that AI grouping sends titles and redacted URLs directly to the selected provider.
- The repository initially had no commits or remote. Recheck the remote and run `git pull` before implementation only if one has been configured. Any requested commits must use `git commit -s`.
