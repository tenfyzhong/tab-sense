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
  - Support creating, updating, selecting, and deleting profiles while never returning stored API keys to extension pages.
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
  - Custom Base URLs for every protocol using HTTPS or loopback HTTP on `localhost`, `127.0.0.1`, or `::1`; reject credentials, query strings, fragments, and other HTTP hosts.
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
  - Gemini: paginate `/v1beta/models`, retain models supporting `generateContent`, and call `generateContent`.
  - OpenAI-compatible: append `/models` and `/chat/completions` to the configured API root and use Bearer authentication.
  - Require JSON-only output, accept raw or fenced JSON, validate before mutation, make no automatic billable retry, and sanitize authentication, rate-limit, network, and malformed-response errors.
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
- Test per-profile storage isolation, preference persistence and defaulting, key redaction, English and Simplified Chinese UI states, model refresh, disabled actions, shortcut routing, inline status, and notifications.
- Test that the popup shell does not impose a fixed minimum height after compact actions are rendered.
- Test named profile creation, protocol-specific custom Base URLs, active-profile/model persistence, profile switching and deletion, and migration from the initial per-protocol settings shape.
- Test popup reopening against a running background operation, undo record replacement and persistence, grouping undo, duplicate-tab recreation, partial restore failures, and ungroup-all with undo.
- Finish with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm zip`, then manually load the unpacked build in Chrome and verify both popup actions, both shortcuts, settings, notifications, preprocessing modes, and tab-group behavior.

## Assumptions and Acceptance

- Support Chrome 116 and later; UI defaults to English and switches to Simplified Chinese through Chrome localization.
- All repository documentation, including `PLAN.md`, `README.md`, and `PRIVACY.md`, is written only in English. Chinese text appears only in localization resources.
- Document that API keys are stored locally but are not protected by an encrypted vault, and that AI grouping sends titles and redacted URLs directly to the selected provider.
- The repository initially had no commits or remote. Recheck the remote and run `git pull` before implementation only if one has been configured. Any requested commits must use `git commit -s`.
