# Firefox and Microsoft Edge Store Submission Guide

Last verified: August 2, 2026

This document contains copy-ready metadata, privacy disclosures, permission
justifications, and review notes for publishing Tab Sense to Mozilla Add-ons
(AMO) and Microsoft Edge Add-ons. Recheck store forms before each release,
because marketplace fields and policies can change.

## Shared product information

- Extension name: `Tab Sense`
- Homepage: <https://github.com/tenfyzhong/tab-sense>
- Support website: <https://github.com/tenfyzhong/tab-sense/issues>
- Privacy policy: <https://github.com/tenfyzhong/tab-sense/blob/main/PRIVACY.md>
- License: `MIT`
- License URL: <https://github.com/tenfyzhong/tab-sense/blob/main/LICENSE>
- Supported languages: English and Simplified Chinese
- Remote code: No remotely hosted code is loaded or executed.
- Analytics or advertising: None
- Developer backend: None

The license URL becomes valid after the MIT License change is merged into
`main`.

## Firefox Add-ons submission

### Compatibility and distribution

- Platform: Firefox desktop
- Minimum version: Firefox 142
- Firefox for Android: Not supported because the required tab-group extension
  APIs are unavailable.
- Experimental: No
- Recommended category: Tabs
- Requires payment, non-free services, or additional software: AI grouping
  requires a user-configured third-party or local AI provider. Provider fees
  may apply. Duplicate cleanup, ungrouping, and undo do not require AI.
- License: MIT License
- Privacy policy: Yes; Tab Sense transmits limited data to a provider selected
  and invoked by the user.

### English summary

```text
Close duplicate tabs and organize ungrouped tabs by topic with your chosen AI provider. Supports custom endpoints, undo, shortcuts, and locally stored credentials.
```

### English description

```text
Tab Sense is a privacy-conscious tab management extension that helps you clean up duplicate tabs and organize ungrouped tabs by topic using an AI provider of your choice.

Key features:

- Close duplicate tabs in the current window with one click.
- Always protect pinned tabs from automatic closure.
- Keep the active duplicate tab, or the leftmost one when no duplicate is active.
- Organize ungrouped, unpinned tabs into meaningful topic-based groups with AI.
- Reuse suitable existing tab groups before creating new ones.
- Support OpenAI, Anthropic, Google Gemini, and OpenAI-compatible APIs.
- Configure custom API endpoints, including local AI services.
- Create and switch between multiple AI provider profiles.
- Load available models and test a selected model before using it.
- Optionally remove duplicate tabs before AI grouping.
- Undo the most recent duplicate cleanup, AI grouping, or ungroup-all operation.
- Remove all tabs from their groups in the current window.
- Use keyboard shortcuts for quick access.
- Follow a built-in guided tour when using the extension for the first time.
- Use the interface in English or Simplified Chinese.

Keyboard shortcuts:

- Alt+Shift+D: Close duplicate tabs
- Alt+Shift+G: Group tabs with AI

AI grouping is entirely optional. Tab Sense does not operate a backend server or proxy your requests. Your API key is stored in Firefox local extension storage, and requests are sent directly from the extension to the AI provider you configure.

When you start AI grouping, Tab Sense sends the selected provider limited tab metadata: tab titles and URLs with query parameters and fragments removed. It does not send page bodies, cookies, form data, or browsing history outside the tabs being organized.

Tab Sense contains no advertising, analytics, tracking, content scripts, or remotely hosted code. Your information is not sent to or collected by the extension author.

Requires Firefox 142 or later on desktop. Firefox for Android is not currently supported because it does not provide the tab-group extension APIs required by Tab Sense.
```

### Simplified Chinese summary

```text
一键关闭重复标签页，并通过您自行配置的 AI 服务商按主题整理未分组标签页。支持撤销、快捷键和本地保存服务商配置。
```

### Simplified Chinese description

```text
Tab Sense 是一款注重隐私的 Firefox 标签页管理扩展，可帮助您清理重复标签页，并使用自己选择的 AI 服务商按主题组织未分组标签页。

主要功能：

- 一键关闭当前窗口中 URL 完全相同的重复标签页。
- 始终保护固定标签页，避免被自动关闭。
- 优先保留当前活动的重复标签页；如果没有活动副本，则保留最靠左的标签页。
- 使用 AI 按主题整理未分组、未固定的标签页。
- 优先复用合适的已有标签组，减少不必要的新分组。
- 支持 OpenAI、Anthropic、Google Gemini 和 OpenAI 兼容接口。
- 支持自定义 API 地址和运行在本机的 AI 服务。
- 支持创建和切换多个 AI 服务商配置。
- 可以加载模型列表，并在正式分组前测试所选模型。
- 可选择在 AI 分组前清理重复标签页。
- 支持撤销最近一次重复页清理、AI 分组或全部解除分组操作。
- 可一键解除当前窗口中的全部标签页分组。
- 提供新用户引导、键盘快捷键、简体中文和英文界面。

快捷键：

- Alt+Shift+D：关闭重复标签页
- Alt+Shift+G：使用 AI 整理标签页

AI 分组完全可选。Tab Sense 不运营后端服务器，也不会代理 AI 请求。API 密钥仅保存在 Firefox 的扩展本地存储中，请求会直接发送到用户配置的 AI 服务商。

当用户主动执行 AI 分组时，Tab Sense 会向所选服务商发送有限的标签页信息，包括标签页标题以及移除查询参数和片段后的 URL。扩展不会发送网页正文、Cookie、表单内容或当前标签页集合之外的浏览历史。

Tab Sense 不包含广告、分析、用户跟踪、内容脚本或远程托管代码，也不会将用户信息发送给扩展作者。

需要 Firefox 桌面版 142 或更高版本。由于 Firefox for Android 不提供 Tab Sense 所需的标签组扩展接口，目前不支持 Android。
```

### Firefox data collection declarations

The Firefox manifest declares these required data collection permissions:

| Manifest value | Data handled | Purpose |
| --- | --- | --- |
| `authenticationInfo` | User-provided AI API keys | Authenticate requests sent directly to the provider selected by the user. |
| `browsingActivity` | Titles and sanitized URLs of tabs involved in grouping | Identify duplicates and provide the context required for user-initiated AI grouping. |
| `websiteContent` | Tab titles and existing group titles | Provide limited topic context to the selected AI provider. Page bodies are not read. |

### Firefox permission explanations

#### `tabs`

```text
Required to read tab URLs, titles, active state, pinned state, group membership, position, and window membership. Tab Sense uses this information to identify exact duplicate tabs, protect pinned tabs, close duplicates, organize eligible tabs into groups, and restore tabs during undo operations.
```

#### `tabGroups`

```text
Required to create and manage Firefox tab groups, reuse suitable existing groups, remove tabs from groups, update group metadata, and restore group state during undo operations.
```

#### `storage`

```text
Required to store settings, user-created AI provider profiles, API endpoints, selected models, API keys, guided-tour progress, and the latest session-scoped undo record. This information remains in Firefox extension storage and is not synchronized or sent to the extension developer.
```

#### `notifications`

```text
Required to notify the user about the results or failures of tab operations started through keyboard shortcuts when the extension popup is not open.
```

#### Optional provider host access

```text
Optional host access is requested only after the user configures an AI provider and grants access to that provider's host. It is used to list models, test the selected model, and send user-initiated grouping requests directly to the configured provider. Remote providers must use HTTPS. Plain HTTP is accepted only for loopback services on the user's own device.
```

### Firefox source code submission

The release package contains bundled and minified code, so upload the matching
source archive generated by WXT for every submitted version.

Build requirements:

```text
Node.js 22 or later
pnpm 10.30.3
```

Reproducible build commands:

```text
pnpm install --frozen-lockfile
pnpm build:firefox
```

Expected unpacked output:

```text
output/firefox-mv2
```

Release archives:

```text
pnpm zip:firefox
```

WXT generates both the Firefox extension ZIP and a matching sources ZIP in
`output/`.

Primary third-party library sources:

- React and React DOM: <https://github.com/facebook/react>
- Zod: <https://github.com/colinhacks/zod>
- WXT and the WXT React module: <https://github.com/wxt-dev/wxt>

### Firefox Notes for Reviewers

```text
Tab Sense manages tabs in the current Firefox window. Duplicate cleanup, ungroup-all, and undo can be tested without an external account.

AI grouping is optional and requires the reviewer to configure an AI provider profile with a reviewer-owned API key or a local compatible endpoint. Open the extension popup, select the settings button, add a provider, enter the provider protocol, API Base URL, and API key, refresh the model list, select a model, and optionally test the model. Return to the popup and select Group Tabs with AI.

When AI grouping is invoked, the extension sends the selected provider the API key, tab IDs, tab titles, sanitized tab URLs with query strings and fragments removed, existing group IDs and titles, and limited sanitized summaries of existing group members. Requests are sent directly to the provider selected by the user. The developer operates no backend service.

The extension contains no content scripts, analytics, advertising, tracking, or remotely hosted code. API responses are parsed and validated as data and are never executed as code.

Build requirements and commands:
- Node.js 22 or later
- pnpm 10.30.3
- pnpm install --frozen-lockfile
- pnpm build:firefox

The built extension is written to output/firefox-mv2.
```

## Microsoft Edge Add-ons submission

### Properties

- Extension name: `Tab Sense`
- Mature content: No
- Privacy information accessed, collected, or transmitted: Yes
- Privacy policy URL:
  <https://github.com/tenfyzhong/tab-sense/blob/main/PRIVACY.md>
- Suggested category: Productivity, or the closest tab-management category
  offered by Partner Center.

### English (United States) listing

#### Extension name

```text
Tab Sense
```

The name is read from the manifest. Change the manifest and upload a new
package if the name must be changed.

#### Short description

```text
Close duplicate tabs and organize ungrouped tabs with your chosen AI provider.
```

The short description is read from the localized manifest message. Change
`public/_locales/en/messages.json` and upload a new package to edit it.

#### Description

```text
Tab Sense is a privacy-conscious tab management extension for Microsoft Edge. It helps you remove duplicate tabs and organize ungrouped tabs by topic using an AI provider of your choice.

Key features:

- Close tabs with identical URLs in the current window.
- Always protect pinned tabs from automatic closure.
- Keep the active duplicate tab, or the leftmost duplicate when none is active.
- Organize ungrouped and unpinned tabs into topic-based groups with AI.
- Prefer suitable existing tab groups before creating new ones.
- Support OpenAI, Anthropic, Google Gemini, and OpenAI-compatible APIs.
- Configure custom API endpoints, including AI services running locally on your device.
- Create and switch between multiple AI provider profiles.
- Load available models and select a model independently for each provider profile.
- Test the configured API key, endpoint, and model before using AI grouping.
- Optionally close duplicate tabs before AI grouping.
- Undo the most recent duplicate cleanup, AI grouping, or ungroup-all operation.
- Remove all tabs from their groups in the current window.
- Use a guided tour, keyboard shortcuts, and an interface available in English and Simplified Chinese.

Keyboard shortcuts:

- Alt+Shift+D: Close duplicate tabs
- Alt+Shift+G: Group tabs with AI

AI grouping is entirely optional. Duplicate cleanup, ungrouping, and undo functionality can be used without configuring an AI provider.

Tab Sense does not operate a backend server or proxy AI requests. API keys are stored only in Microsoft Edge local extension storage. The extension connects directly to the provider configured by the user only when the user refreshes a model list, tests a model, or starts AI grouping.

When AI grouping is started, Tab Sense sends limited tab metadata to the selected provider. This includes tab titles and URLs after query parameters and fragments have been removed. The extension does not read page bodies, cookies, form data, personal communications, or browsing history outside the tabs being organized.

Tab Sense contains no advertising, analytics, user tracking, content scripts, or remotely hosted code. User data is not sent to or collected by the extension developer.
```

#### Search terms

```text
tab manager, duplicate tabs, tab groups, AI grouping, browser organization, OpenAI, Anthropic, Gemini
```

### Chinese (China) listing

#### Extension name

```text
Tab Sense
```

#### Short description

```text
关闭重复标签页，并使用您选择的 AI 服务商整理未分组标签页。
```

The short description is read from
`public/_locales/zh_CN/messages.json`. Upload a new package after changing the
localized manifest message.

#### Description

```text
Tab Sense 是一款专注于标签页整理的 Microsoft Edge 扩展，可帮助您快速清理重复标签页，并使用自己选择的 AI 服务商按主题组织未分组标签页。

主要功能：

- 一键关闭当前窗口中 URL 完全相同的重复标签页。
- 始终保护固定标签页，避免被自动关闭。
- 如果存在重复页面，优先保留当前活动标签页；否则保留最靠左的标签页。
- 使用 AI 按主题整理未分组、未固定的标签页。
- 优先将标签页加入合适的已有分组，减少不必要的新分组。
- 支持 OpenAI、Anthropic、Google Gemini 和 OpenAI 兼容接口。
- 支持自定义 API 地址、本地 AI 服务和多个服务商配置。
- 可以加载服务商提供的模型列表，并单独为每个配置选择模型。
- 支持在正式分组前测试 API 密钥、服务地址和所选模型。
- 可选择在 AI 分组前自动清理重复标签页。
- 支持撤销最近一次重复页清理、AI 分组或全部解除分组操作。
- 可一键解除当前窗口中的全部标签页分组。
- 提供新用户引导、键盘快捷键以及简体中文和英文界面。

快捷键：

- Alt+Shift+D：关闭重复标签页
- Alt+Shift+G：使用 AI 整理标签页

AI 分组完全可选。关闭重复标签页、解除分组和撤销等基础功能无需配置 AI 服务商。

Tab Sense 不运营后端服务器，也不会代理 AI 请求。用户填写的 API 密钥仅保存在 Microsoft Edge 的扩展本地存储中。只有当用户主动执行模型刷新、模型测试或 AI 分组时，扩展才会直接连接到用户配置的服务商。

执行 AI 分组时，扩展会向所选服务商发送有限的标签页信息，包括标签页标题以及移除查询参数和片段后的 URL。扩展不会读取网页正文、Cookie、表单内容、聊天消息或当前标签页集合之外的浏览历史。

Tab Sense 不包含广告、分析、用户跟踪、内容脚本或远程托管代码，也不会将用户数据发送给扩展作者。
```

#### Search terms

```text
标签页, 标签管理, 重复标签页, 标签页分组, AI 分组, 浏览器整理, OpenAI, Anthropic, Gemini
```

### Edge listing assets

- Extension logo: `public/icon/128.png`
- Logo requirements: square image, minimum `128 x 128`; Microsoft recommends
  `300 x 300`.
- Small promotional tile: optional, `440 x 280`.
- Large promotional tile: optional, `1400 x 560`.
- Screenshots: optional, maximum 6; use `640 x 480` or `1280 x 800`.
- YouTube video URL: optional.

Recommended screenshots:

1. Main extension popup and primary tab actions.
2. AI provider settings page.
3. Model selection and connection test.
4. Resulting Microsoft Edge tab groups.
5. Guided tour or undo functionality.

### Edge Privacy: Single Purpose Description

```text
Tab Sense helps users manage tabs in Microsoft Edge by removing exact duplicate tabs and organizing ungrouped tabs into topic-based groups. AI grouping is optional and runs only when the user configures and explicitly invokes an AI provider.
```

### Edge Privacy: Permission justifications

#### `tabs`

```text
Required to read tab URLs, titles, active state, pinned state, group membership, position, and window membership. Tab Sense uses this information to identify exact duplicate tabs, protect pinned tabs, close duplicates, organize eligible tabs into groups, and restore tabs during undo operations.
```

#### `tabGroups`

```text
Required to create and manage Microsoft Edge tab groups, reuse suitable existing groups, remove tabs from groups, update group metadata, and restore group state when the user performs an undo operation.
```

#### `storage`

```text
Required to store extension settings, user-created AI provider profiles, API endpoints, selected models, API keys, guided-tour progress, and the latest session-scoped undo record. This information remains in Microsoft Edge extension storage and is not synchronized or sent to the extension developer.
```

#### `notifications`

```text
Required to notify the user about the results or failures of tab operations started through keyboard shortcuts when the extension popup is not open.
```

#### Optional `https://*/*`

```text
Optional host access is used only after the user configures an AI provider and grants access to that provider's host. It allows Tab Sense to list models, test the selected model, and send user-initiated grouping requests directly to the configured provider. Remote providers must use HTTPS.
```

#### Optional loopback host permissions

Use this explanation for `http://localhost/*`, `http://127.0.0.1/*`, and
`http://[::1]/*`:

```text
Optional loopback host access allows users to connect Tab Sense to an AI service running locally on their own device. Access is requested only for the user-configured host and is used for model discovery, connection testing, and user-initiated grouping requests.
```

### Edge Privacy: Remote code

Select:

```text
No, I am not using remote code.
```

If a justification field appears, use:

```text
Tab Sense does not load or execute remotely hosted code. All executable JavaScript is included in the extension package. Network requests retrieve model metadata and JSON or text responses from AI APIs configured by the user. These responses are treated strictly as data, validated, and never executed as code.
```

Calling an AI API is not remote code execution. Provider responses are parsed
and validated as data.

### Edge Privacy: Data usage selections

Select only these data types:

| Partner Center data type | Select | Reason |
| --- | --- | --- |
| Authentication information | Yes | The user enters an AI provider API key. |
| Web history | Yes | Tab Sense handles titles and URLs for tabs in the current window. |
| Website content | Yes | Tab and group titles provide limited topic context for AI grouping. |
| Personally identifiable information | No | No names, email addresses, street addresses, ages, or identification numbers are collected. |
| Health information | No | No medical or health records are collected. |
| Financial and payment information | No | No transaction, card, credit, or payment history is collected. |
| Personal communications | No | Messages, emails, and chat content are not read. |
| Location | No | IP addresses, GPS coordinates, and location data are not collected. |
| User activity | No | Clicks, mouse movement, scrolling, and keystrokes are not monitored or logged. |

#### Authentication information explanation

```text
Tab Sense handles API keys entered by the user to authenticate requests to the AI provider selected by that user. API keys are stored in Microsoft Edge local extension storage, are not synchronized or logged, and are never sent to the extension developer. They are transmitted only to the configured provider when required for a user-initiated request.
```

#### Web history explanation

```text
Tab Sense processes the titles and URLs of tabs in the current window to identify exact duplicates and organize eligible tabs. During AI grouping, included URLs are limited to 500 characters and have query parameters and fragments removed before being sent directly to the provider selected by the user.
```

#### Website content explanation

```text
Tab Sense processes tab titles and existing tab-group titles as grouping context. It does not read page bodies, form data, cookies, images, messages, or other page content. Limited titles and sanitized URLs are sent only when the user explicitly starts AI grouping.
```

### Edge Privacy: Data usage certifications

Select all three certification checkboxes. They certify that:

1. User data is not sold or transferred outside approved use cases.
2. User data is not used or transferred for purposes unrelated to the
   extension's single purpose.
3. User data is not used for creditworthiness or lending decisions.

Sending limited data to an AI provider selected and explicitly invoked by the
user is necessary to provide the optional AI grouping feature. Tab Sense has
no advertising, analytics, data brokerage, or developer-operated backend.

### Edge Privacy: Privacy policy

Use:

```text
https://github.com/tenfyzhong/tab-sense/blob/main/PRIVACY.md
```

If Partner Center asks whether the extension accesses, collects, or transmits
personal information, select `Yes`. Do not select `No`, because Tab Sense
handles API keys, tab titles, and URLs, and transmits limited data when the
user explicitly invokes an AI provider.

### Edge Notes for certification

```text
Tab Sense manages tabs in the current Microsoft Edge window. Duplicate cleanup, ungroup-all, and undo can be tested without an external account.

AI grouping is optional and requires the reviewer to configure an AI provider profile with a reviewer-owned API key or a local compatible endpoint. Open the extension popup, select the settings button, add a provider, enter the provider protocol, API Base URL, and API key, refresh the model list, select a model, and optionally test the model. Return to the popup and select Group Tabs with AI.

When AI grouping is invoked, the extension sends the selected provider the API key, tab IDs, tab titles, sanitized tab URLs with query strings and fragments removed, existing group IDs and titles, and limited sanitized summaries of existing group members. Requests are sent directly to the provider selected by the user. The developer operates no backend service.

The extension contains no content scripts, analytics, advertising, tracking, or remotely hosted code. API responses are parsed and validated as data and are never executed as code.
```

## Pre-submission checklist

### Firefox

- Build and ZIP the release with `pnpm zip:firefox`.
- Upload the generated Firefox ZIP.
- Upload the matching sources ZIP because the release uses bundled/minified
  output.
- Select Firefox desktop only.
- Select the MIT License.
- Enable the privacy policy field and provide the policy URL.
- Paste the reviewer notes and build instructions.
- Verify the manifest declares Firefox 142 and the required data collection
  permissions.
- Run Mozilla `addons-linter` with warnings treated as errors.

### Microsoft Edge

- Build and ZIP the release with `pnpm zip:edge`.
- Verify the extension package is Manifest V3.
- Complete both English (United States) and Chinese (China) listings.
- Upload a logo for each listing language.
- Confirm the English and Chinese descriptions contain at least 250
  characters and no more than 10,000 characters.
- Select `Yes` for handling privacy information.
- Select Authentication information, Web history, and Website content.
- Select all three data-use certifications.
- Select `No` for remote code.
- Provide permission justifications and the privacy policy URL.
- Paste certification testing notes.

## Official references

- Firefox submission fields:
  <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>
- Firefox source code submission:
  <https://extensionworkshop.com/documentation/publish/source-code-submission/>
- Firefox add-on policies:
  <https://extensionworkshop.com/documentation/publish/add-on-policies/>
- Firefox built-in data consent:
  <https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/>
- Microsoft Edge submission and Privacy fields:
  <https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension>
- Microsoft Edge Add-ons developer policies:
  <https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies>
