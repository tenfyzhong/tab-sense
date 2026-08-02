import { describe, expect, it, vi } from 'vitest';

import { openShortcutSettingsForBrowser } from './runtime-client';

function shortcutSettingsApi() {
  return {
    commands: {
      openShortcutSettings: vi.fn(async () => undefined),
    },
    tabs: {
      create: vi.fn(async () => undefined),
    },
  };
}

describe('browser shortcut settings', () => {
  it('uses the Firefox shortcut settings API', async () => {
    const api = shortcutSettingsApi();

    await openShortcutSettingsForBrowser('firefox', api);

    expect(api.commands.openShortcutSettings).toHaveBeenCalledOnce();
    expect(api.tabs.create).not.toHaveBeenCalled();
  });

  it('opens the Edge shortcut settings page', async () => {
    const api = shortcutSettingsApi();

    await openShortcutSettingsForBrowser('edge', api);

    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'edge://extensions/shortcuts' });
    expect(api.commands.openShortcutSettings).not.toHaveBeenCalled();
  });

  it('keeps the Chrome shortcut settings page', async () => {
    const api = shortcutSettingsApi();

    await openShortcutSettingsForBrowser('chrome', api);

    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  });
});
