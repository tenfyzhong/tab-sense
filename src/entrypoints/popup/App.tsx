import { useEffect, useMemo, useState } from 'react';

import type { OperationKind, OperationStatus, RuntimeResponse } from '../../background/messages';
import type { PublicSettings } from '../../providers/types';
import {
  isDuplicateResult,
  isGroupingResult,
  isOperationStatus,
  isPublicSettings,
  isUndoResult,
  isUngroupAllResult,
} from '../../ui/guards';
import { translate, type Translator } from '../../ui/i18n';
import { runtimeClient, type CommandInfo, type UiClient } from '../../ui/runtime-client';

interface PopupAppProps {
  client?: UiClient;
  t?: Translator;
}

const OPERATION_MESSAGE_KEYS: Record<OperationKind, string> = {
  'close-duplicates': 'operationNameCloseDuplicates',
  'group-tabs': 'operationNameGroupTabs',
  'undo-last-action': 'operationNameUndo',
  'ungroup-all': 'operationNameUngroupAll',
};

export function PopupApp({ client = runtimeClient, t = translate }: PopupAppProps) {
  const [settings, setSettings] = useState<PublicSettings>();
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [operationStatus, setOperationStatus] = useState<OperationStatus>();
  const [localBusy, setLocalBusy] = useState(false);
  const [status, setStatus] = useState('');

  function progressMessage(current: OperationStatus): string {
    const key = current.operation ? OPERATION_MESSAGE_KEYS[current.operation] : 'operationNameTabs';
    return t('operationInProgress', t(key));
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.request({ type: 'get-settings' }),
      client.request({ type: 'get-operation-status' }),
      client.getCommands(),
    ])
      .then(([settingsResponse, operationResponse, loadedCommands]) => {
        if (!active) {
          return;
        }
        if (settingsResponse.ok && isPublicSettings(settingsResponse.data)) {
          setSettings(settingsResponse.data);
        } else if (!settingsResponse.ok) {
          setStatus(t('errorPrefix', settingsResponse.error));
        }
        if (operationResponse.ok && isOperationStatus(operationResponse.data)) {
          setOperationStatus(operationResponse.data);
          if (operationResponse.data.busy) {
            setStatus(progressMessage(operationResponse.data));
          }
        }
        setCommands(loadedCommands);
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(t('errorPrefix', error instanceof Error ? error.message : 'Unknown error'));
        }
      });
    return () => {
      active = false;
    };
  }, [client, t]);

  useEffect(() => {
    if (!operationStatus?.busy) {
      return;
    }
    const interval = globalThis.setInterval(() => {
      void client.request({ type: 'get-operation-status' }).then((response) => {
        if (response.ok && isOperationStatus(response.data)) {
          setOperationStatus(response.data);
          if (response.data.busy) {
            setStatus(progressMessage(response.data));
          } else {
            setStatus(t('operationComplete'));
          }
        }
      });
    }, 500);
    return () => globalThis.clearInterval(interval);
  }, [client, operationStatus?.busy]);

  const activeProfile = settings?.profiles.find(
    (profile) => profile.id === settings.activeProfileId,
  );
  const aiReady = Boolean(activeProfile?.hasApiKey && activeProfile.modelId);
  const busy = localBusy || Boolean(operationStatus?.busy);
  const undoAvailable = operationStatus?.undo.available ?? false;
  const shortcutByCommand = useMemo(
    () => new Map(commands.map((command) => [command.name, command.shortcut || t('noShortcut')])),
    [commands, t],
  );

  function describeResponse(response: RuntimeResponse): string {
    if (!response.ok) {
      return t('errorPrefix', response.error);
    }
    if (isDuplicateResult(response.data)) {
      return t('closedTabsResult', String(response.data.closedTabCount));
    }
    if (isGroupingResult(response.data) && response.data.ok) {
      const messages: string[] = [];
      if (response.data.duplicateResult) {
        messages.push(t('closedTabsResult', String(response.data.duplicateResult.closedTabCount)));
      }
      messages.push(
        t('groupedTabsResult', [
          String(response.data.groupedTabCount),
          String(response.data.groupCount),
        ]),
      );
      return messages.join(' ');
    }
    if (isUngroupAllResult(response.data)) {
      return t('ungroupedTabsResult', [
        String(response.data.ungroupedTabCount),
        String(response.data.groupCount),
      ]);
    }
    if (isUndoResult(response.data)) {
      return t('restoredTabsResult', [
        String(response.data.restoredTabCount),
        String(response.data.failedTabCount),
      ]);
    }
    return t('operationComplete');
  }

  async function refreshOperationStatus(): Promise<void> {
    const response = await client.request({ type: 'get-operation-status' });
    if (response.ok && isOperationStatus(response.data)) {
      setOperationStatus(response.data);
    }
  }

  async function run(
    type: 'close-duplicates' | 'group-tabs' | 'undo-last-action' | 'ungroup-all',
  ): Promise<void> {
    setLocalBusy(true);
    setStatus(t('operationInProgress', t(OPERATION_MESSAGE_KEYS[type])));
    let message: string;
    try {
      message = describeResponse(await client.request({ type }));
    } catch (error) {
      message = t('errorPrefix', error instanceof Error ? error.message : 'Unknown error');
    }
    try {
      await refreshOperationStatus();
    } catch {
      // The operation result remains useful if status refresh fails.
    } finally {
      setLocalBusy(false);
      setStatus(message);
    }
  }

  if (!settings) {
    return <main className="popup-shell">{status || t('loading')}</main>;
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="brand-mark" aria-hidden="true">
          T
        </div>
        <div>
          <h1>{t('title')}</h1>
          <p>{t('popupSubtitle')}</p>
        </div>
      </header>

      <section className="action-stack" aria-label={t('tabActions')}>
        <button
          aria-label={t('closeDuplicates')}
          className="action-button secondary"
          disabled={busy}
          onClick={() => void run('close-duplicates')}
        >
          <span>{t('closeDuplicates')}</span>
          <kbd>{shortcutByCommand.get('close-duplicate-tabs') ?? t('noShortcut')}</kbd>
        </button>
        <button
          aria-label={t('groupTabs')}
          className="action-button primary"
          disabled={busy || !aiReady}
          onClick={() => void run('group-tabs')}
        >
          <span className="action-copy">
            <span>{t('groupTabs')}</span>
            {settings.deduplicateBeforeGrouping && (
              <small className="workflow-badge">{t('deduplicateFirstBadge')}</small>
            )}
          </span>
          <kbd>{shortcutByCommand.get('group-tabs-with-ai') ?? t('noShortcut')}</kbd>
        </button>
      </section>

      <div aria-label={t('secondaryTabActions')} className="compact-actions" role="group">
        <button
          aria-label={t('ungroupAll')}
          className="compact-button"
          disabled={busy}
          onClick={() => void run('ungroup-all')}
        >
          <span>{t('ungroupAll')}</span>
        </button>
        <button
          aria-label={t('undoLastAction')}
          className="compact-button"
          disabled={busy || !undoAvailable}
          onClick={() => void run('undo-last-action')}
        >
          <span>{t('undoLastAction')}</span>
        </button>
      </div>

      {!aiReady && (
        <button className="text-button" onClick={() => void client.openOptions()}>
          {t('configureAi')}
        </button>
      )}
      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}

      <footer>
        <button className="text-button" onClick={() => void client.openOptions()}>
          {t('openSettings')}
        </button>
        <button className="text-button" onClick={() => void client.openShortcutSettings()}>
          {t('shortcuts')}
        </button>
      </footer>
    </main>
  );
}
