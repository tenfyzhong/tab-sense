import { defineConfig } from 'wxt';

const providerOrigins = [
  'https://*/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
  'http://[::1]/*',
];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'output',
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: ({ browser, manifestVersion }) => ({
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    incognito: 'spanning',
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: {
                required: ['authenticationInfo', 'browsingActivity', 'websiteContent'],
              },
              id: 'tab-sense@tenfyzhong.github.io',
              strict_min_version: '139.0',
            },
          },
        }
      : { minimum_chrome_version: '116' }),
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    permissions: ['tabs', 'tabGroups', 'storage', 'notifications'],
    ...(manifestVersion === 2
      ? { optional_permissions: providerOrigins }
      : { optional_host_permissions: providerOrigins }),
    commands: {
      'close-duplicate-tabs': {
        suggested_key: {
          default: 'Alt+Shift+D',
          mac: 'Alt+Shift+D',
        },
        description: '__MSG_commandCloseDuplicates__',
      },
      'group-tabs-with-ai': {
        suggested_key: {
          default: 'Alt+Shift+G',
          mac: 'Alt+Shift+G',
        },
        description: '__MSG_commandGroupTabs__',
      },
    },
  }),
});
