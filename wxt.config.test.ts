import { describe, expect, it } from 'vitest';
import type { ConfigEnv, TargetBrowser, UserManifest } from 'wxt';

import config from './wxt.config';

const PROVIDER_ORIGINS = [
  'https://*/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
  'http://[::1]/*',
];

async function manifestFor(
  browser: TargetBrowser,
  manifestVersion: 2 | 3,
): Promise<UserManifest> {
  const manifest = config.manifest;
  const env: ConfigEnv = {
    browser,
    command: 'build',
    manifestVersion,
    mode: 'production',
  };

  return typeof manifest === 'function' ? manifest(env) : await manifest ?? {};
}

describe('extension manifest', () => {
  it('disables module preload for extension pages', async () => {
    const viteConfig = await config.vite?.({
      browser: 'chrome',
      command: 'build',
      manifestVersion: 3,
      mode: 'production',
    });

    expect(viteConfig?.build?.modulePreload).toBe(false);
  });

  it('targets the supported desktop browsers', () => {
    expect(config.targetBrowsers).toEqual(['chrome', 'edge', 'firefox']);
  });

  it('builds a Chromium MV3 manifest for Edge', async () => {
    const manifest = await manifestFor('edge', 3);

    expect(manifest).toMatchObject({
      incognito: 'spanning',
      minimum_chrome_version: '116',
      optional_host_permissions: PROVIDER_ORIGINS,
      permissions: ['tabs', 'tabGroups', 'storage', 'notifications'],
    });
    expect(manifest).not.toHaveProperty('browser_specific_settings');
    expect(manifest).not.toHaveProperty('optional_permissions');
  });

  it('builds a Firefox 142 MV2 manifest with provider permissions', async () => {
    const manifest = await manifestFor('firefox', 2);

    expect(manifest).toMatchObject({
      browser_specific_settings: {
        gecko: {
          data_collection_permissions: {
            required: ['authenticationInfo', 'browsingActivity', 'websiteContent'],
          },
          id: 'tab-sense@tenfyzhong.github.io',
          strict_min_version: '142.0',
        },
      },
      incognito: 'spanning',
      optional_permissions: PROVIDER_ORIGINS,
      permissions: ['tabs', 'tabGroups', 'storage', 'notifications'],
    });
    expect(manifest).not.toHaveProperty('minimum_chrome_version');
    expect(manifest).not.toHaveProperty('optional_host_permissions');
  });
});
