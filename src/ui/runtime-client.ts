import { browser } from 'wxt/browser';

import type { RuntimeRequest, RuntimeResponse } from '../background/messages';
import { getProviderOriginPattern } from '../providers/adapters';
import type { ProviderId } from '../providers/types';

export interface CommandInfo {
  name?: string;
  shortcut?: string;
}

interface ShortcutSettingsApi {
  commands: {
    getAll?: () => Promise<unknown>;
    openShortcutSettings?: () => Promise<void>;
  };
  tabs: {
    create(properties: { url: string }): Promise<unknown>;
  };
}

export async function openShortcutSettingsForBrowser(
  targetBrowser: string,
  api: ShortcutSettingsApi,
): Promise<void> {
  if (targetBrowser === 'firefox') {
    if (!api.commands.openShortcutSettings) {
      throw new Error('Firefox shortcut settings are unavailable');
    }
    await api.commands.openShortcutSettings();
    return;
  }

  const scheme = targetBrowser === 'edge' ? 'edge' : 'chrome';
  await api.tabs.create({ url: `${scheme}://extensions/shortcuts` });
}

export interface UiClient {
  getCommands(): Promise<CommandInfo[]>;
  openOptions(): Promise<void>;
  openShortcutSettings(): Promise<void>;
  request(request: RuntimeRequest): Promise<RuntimeResponse>;
  requestProviderPermission(input: { baseUrl?: string; providerId: ProviderId }): Promise<boolean>;
}

export const runtimeClient: UiClient = {
  getCommands: () => browser.commands.getAll(),
  openOptions: () => browser.runtime.openOptionsPage(),
  openShortcutSettings: () => openShortcutSettingsForBrowser(import.meta.env.BROWSER, browser),
  request: (request) => browser.runtime.sendMessage(request) as Promise<RuntimeResponse>,
  requestProviderPermission: (input) =>
    browser.permissions.request({ origins: [getProviderOriginPattern(input)] }),
};
