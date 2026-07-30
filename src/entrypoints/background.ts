import { browser } from 'wxt/browser';

import { createRuntimeDependencies } from '../background/app-service';
import { RuntimeController } from '../background/controller';
import type { RuntimeRequest, RuntimeResponse } from '../background/messages';
import { formatNotificationMessage } from '../background/notification';
import {
  guidedTourStateClient,
  initializeGuidedTourOnInstall,
} from '../ui/guided-tour-state';

function localize(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key as never, substitutions) || key;
}

async function notify(response: RuntimeResponse): Promise<void> {
  await browser.notifications.create({
    iconUrl: browser.runtime.getURL('/icon/128.png' as never),
    message: formatNotificationMessage(response, localize),
    title: response.ok ? localize('extensionName') : localize('notificationErrorTitle'),
    type: 'basic',
  });
}

export default defineBackground(() => {
  const controller = new RuntimeController(createRuntimeDependencies());

  browser.runtime.onInstalled.addListener((details) => {
    void initializeGuidedTourOnInstall(details, guidedTourStateClient).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void controller
      .handle(message as RuntimeRequest, sender.tab?.windowId)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          error: error instanceof Error ? error.message : 'Unknown error',
          ok: false,
        } satisfies RuntimeResponse),
      );
    return true;
  });

  browser.commands.onCommand.addListener((command, tab) => {
    const request: RuntimeRequest | undefined =
      command === 'close-duplicate-tabs'
        ? { type: 'close-duplicates' }
        : command === 'group-tabs-with-ai'
          ? { type: 'group-tabs' }
          : undefined;
    if (!request) {
      return;
    }

    void controller
      .handle(request, tab?.windowId)
      .then(notify)
      .catch((error: unknown) =>
        notify({ error: error instanceof Error ? error.message : 'Unknown error', ok: false }),
      );
  });
});
