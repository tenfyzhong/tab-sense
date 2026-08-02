# Tab Sense Privacy Notice

Last updated: August 2, 2026

## Overview

Tab Sense manages tabs locally in Google Chrome, Microsoft Edge, and Mozilla Firefox and can send limited tab metadata directly to an AI provider selected and configured by the user. Tab Sense does not operate a backend service.

## Data Stored Locally

Tab Sense stores the following values in the WebExtension `storage.local` area:

- Named AI provider profiles and the selected active profile
- The protocol, API Base URL, selected model, and model list for each profile
- Provider API keys, stored separately by profile
- The preference that controls whether duplicate tabs are closed before AI grouping

This data is not synchronized by Tab Sense. API keys are not displayed again after storage and are not written to application logs. Extension local storage is not an encrypted credential vault. Anyone with sufficient access to the browser profile or extension debugging tools may be able to inspect it.

Removing the extension deletes its extension storage. Provider credentials can also be replaced from the settings page.

Tab Sense stores one short-lived undo record in the WebExtension `storage.session` area. Depending on the latest action, this record may contain tab IDs, group metadata, and the URLs, positions, and window IDs of duplicate tabs closed by that action. It is used only to undo the latest tab mutation and is cleared after undo, when replaced by a newer successful mutation, or when the browser clears extension session storage.

## Data Sent to AI Providers

AI grouping sends the following information directly from the extension to the provider selected by the user:

- The numeric browser tab IDs used to validate and apply the provider response
- Included tab titles, each limited to 200 characters
- Included tab URLs, each limited to 500 characters after removing query parameters and fragments
- The IDs and titles of up to 50 existing groups in the current window; titles are limited to 100 characters
- Sanitized IDs, titles, and URLs for up to five member tabs per existing group, used as context for deciding whether an ungrouped tab belongs there
- Instructions requesting topic-based tab groups

Pinned and already-grouped tabs are excluded from reassignment. Limited metadata from existing grouped tabs is sent only as matching context so the provider can prefer a suitable current group over creating another one. Page contents, cookies, form data, and browsing history outside the current tab collection are not sent.

The selected provider receives the request under the user's own account and API key. Its processing, retention, billing, and privacy practices are governed by that provider's terms and policies. Users should review those policies before enabling AI grouping.

## Network and Custom Providers

Tab Sense requests browser host access only when the user configures a provider and refreshes its models. OpenAI, Anthropic, Gemini, and OpenAI-compatible profiles can all use custom API Base URLs. Remote endpoints must use HTTPS. Plain HTTP is accepted only for loopback addresses used by local services: `localhost`, `127.0.0.1`, and `::1`.

Tab Sense does not proxy provider requests. API keys and sanitized tab metadata travel directly from the extension to the configured endpoint.

## Permissions

- `tabs`: reads tab URLs, titles, grouping state, pin state, and window membership; closes duplicate tabs and creates groups.
- `tabGroups`: creates groups, removes tabs from groups, and restores group metadata during undo.
- `storage`: stores settings, provider credentials, and the latest session-scoped undo record locally.
- `notifications`: reports shortcut results and errors.
- Optional provider host access: lists models and sends grouping requests only after the user grants access to the selected provider host.

Tab Sense does not inject content scripts or execute remotely hosted code.

The Firefox package declares transmission of authentication information, browsing activity, and website content because the user-provided API key, sanitized tab URLs, and tab titles are sent directly to the provider selected and invoked by the user. These declarations do not grant Tab Sense access to any additional data.

## Private Window Access

Supported browsers require users to grant Incognito or Private Browsing access explicitly from the extension's details page. When that access is enabled, Tab Sense uses the same provider profiles, API keys, and preferences as the regular browser context. Tab operations remain limited to the current window, but running AI grouping in a private window sends the tab metadata described above to the selected provider.

## Data Sharing, Analytics, and Advertising

Tab Sense does not sell user data, run analytics, display advertising, or share data with the extension author. Data is disclosed only to the AI endpoint explicitly configured and invoked by the user.

## Changes

Material changes to this notice should accompany a new extension release and an update to this document.

## Contact

Questions and security reports should be filed through the repository's issue tracker.
