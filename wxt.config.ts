import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'output',
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    minimum_chrome_version: '116',
    incognito: 'not_allowed',
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
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'http://[::1]/*',
    ],
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
  },
});
