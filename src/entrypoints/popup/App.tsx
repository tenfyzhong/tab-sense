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
import { GuidedTour } from '../../ui/GuidedTour';
import {
  guidedTourStateClient,
  type GuidedTourStateClient,
  type GuidedTourStep,
} from '../../ui/guided-tour-state';
import { translate, type Translator } from '../../ui/i18n';
import { runtimeClient, type CommandInfo, type UiClient } from '../../ui/runtime-client';

interface PopupAppProps {
  client?: UiClient;
  t?: Translator;
  tourClient?: GuidedTourStateClient;
}

const OPERATION_MESSAGE_KEYS: Record<OperationKind, string> = {
  'close-duplicates': 'operationNameCloseDuplicates',
  'group-tabs': 'operationNameGroupTabs',
  'undo-last-action': 'operationNameUndo',
  'ungroup-all': 'operationNameUngroupAll',
};

export function PopupApp({
  client = runtimeClient,
  t = translate,
  tourClient = guidedTourStateClient,
}: PopupAppProps) {
  const [settings, setSettings] = useState<PublicSettings>();
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [operationStatus, setOperationStatus] = useState<OperationStatus>();
  const [localBusy, setLocalBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [tourStep, setTourStep] = useState<GuidedTourStep>();

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
    let active = true;
    void tourClient.loadStep().then((step) => {
      if (active) {
        setTourStep(step);
      }
    });
    return () => {
      active = false;
    };
  }, [tourClient]);

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

  async function moveTour(nextStep: GuidedTourStep): Promise<void> {
    await tourClient.saveStep(nextStep);
    setTourStep(nextStep);
  }

  async function finishTour(): Promise<void> {
    await moveTour('complete');
  }

  async function openSettings(): Promise<void> {
    if (tourStep === 'popup-settings') {
      await moveTour('options-add-provider');
    }
    await client.openOptions();
  }

  if (!settings) {
    return <main className="popup-shell">{status || t('loading')}</main>;
  }

  const popupTour =
    tourStep === 'popup-close-duplicates'
      ? {
          body: t('tourCloseDuplicatesBody'),
          nextLabel: t('tourNext'),
          onNext: () => moveTour('popup-group-tabs'),
          step: 1,
          title: t('tourCloseDuplicatesTitle'),
        }
      : tourStep === 'popup-group-tabs'
        ? {
            body: t('tourGroupTabsBody'),
            nextLabel: t('tourNext'),
            onNext: () => moveTour('popup-settings'),
            step: 2,
            title: t('tourGroupTabsTitle'),
          }
        : tourStep === 'popup-settings'
          ? {
              body: t('tourSettingsBody'),
              nextLabel: t('tourOpenSettings'),
              onNext: openSettings,
              step: 3,
              title: t('tourSettingsTitle'),
            }
          : undefined;

  return (
    <main className={`popup-shell${popupTour ? ' guided-tour-active' : ''}`}>
      <header className="popup-header">
        <div className="popup-identity">
          <div className="brand-mark" aria-hidden="true">
            T
          </div>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('popupSubtitle')}</p>
          </div>
        </div>
        <button
          aria-label={t('openSettings')}
          className={`settings-icon-button${tourStep === 'popup-settings' ? ' guided-tour-target' : ''}`}
          onClick={() => void openSettings()}
          title={t('openSettings')}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
            <path d="m19.4 15 .1 2.3-2.2 2.2-2.3-.1-1.6 1.6h-2.8L9 19.4l-2.3.1-2.2-2.2.1-2.3L3 13.4v-2.8L4.6 9l-.1-2.3 2.2-2.2L9 4.6 10.6 3h2.8L15 4.6l2.3-.1 2.2 2.2-.1 2.3 1.6 1.6v2.8L19.4 15Z" />
          </svg>
        </button>
      </header>

      <section className="action-stack" aria-label={t('tabActions')}>
        <button
          aria-label={t('closeDuplicates')}
          className={`action-button secondary${tourStep === 'popup-close-duplicates' ? ' guided-tour-target' : ''}`}
          disabled={busy}
          onClick={() => void run('close-duplicates')}
        >
          <span>{t('closeDuplicates')}</span>
          <kbd>{shortcutByCommand.get('close-duplicate-tabs') ?? t('noShortcut')}</kbd>
        </button>
        <button
          aria-label={t('groupTabs')}
          className={`action-button primary${tourStep === 'popup-group-tabs' ? ' guided-tour-target' : ''}`}
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

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
      {popupTour && (
        <GuidedTour
          body={popupTour.body}
          className="popup-guided-tour"
          nextLabel={popupTour.nextLabel}
          onNext={popupTour.onNext}
          onSkip={finishTour}
          skipLabel={t('tourSkip')}
          stepLabel={t('tourStepLabel', [String(popupTour.step), '6'])}
          title={popupTour.title}
        />
      )}
    </main>
  );
}
