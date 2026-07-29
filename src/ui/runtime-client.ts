import { browser } from 'wxt/browser';

import type { RuntimeRequest, RuntimeResponse } from '../background/messages';
import { getProviderOriginPattern } from '../providers/adapters';
import type { ProviderId } from '../providers/types';

export interface CommandInfo {
  name?: string;
  shortcut?: string;
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
  openShortcutSettings: async () => {
    await browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
  },
  request: (request) => browser.runtime.sendMessage(request) as Promise<RuntimeResponse>,
  requestProviderPermission: (input) =>
    browser.permissions.request({ origins: [getProviderOriginPattern(input)] }),
};
