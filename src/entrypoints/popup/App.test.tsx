import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { PopupApp } from './App';
import type { RuntimeResponse } from '../../background/messages';
import type { PublicSettings } from '../../providers/types';
import type { Translator } from '../../ui/i18n';
import type { UiClient } from '../../ui/runtime-client';

const popupStyles = readFileSync(resolve('src/entrypoints/popup/style.css'), 'utf8');

const translations: Record<string, string> = {
  closeDuplicates: 'Close Duplicate Tabs',
  closedTabsResult: 'Closed $1 duplicate tabs.',
  configureAi: 'Configure AI',
  deduplicateFirstBadge: 'Deduplicate first',
  errorPrefix: 'Error: $1',
  groupTabs: 'Group Tabs with AI',
  groupedTabsResult: 'Grouped $1 tabs into $2 groups.',
  loading: 'Loading…',
  noShortcut: 'Not assigned',
  operationInProgress: '$1 is in progress.',
  operationNameGroupTabs: 'AI grouping',
  openSettings: 'Settings',
  restoredTabsResult: 'Restored $1 tabs; $2 failed.',
  secondaryTabActions: 'More tab actions',
  shortcuts: 'Shortcuts',
  title: 'Tab Sense',
  undoLastAction: 'Undo Last Action',
  ungroupAll: 'Ungroup All Tabs',
  ungroupedTabsResult: 'Ungrouped $1 tabs from $2 groups.',
};

const t: Translator = (key, substitutions) => {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions ?? ''];
  return values.reduce(
    (message, value, index) => message.replace(`$${index + 1}`, String(value)),
    translations[key] ?? key,
  );
};

function settings(ready: boolean, deduplicateBeforeGrouping = false): PublicSettings {
  return {
    activeProfileId: 'openai-default',
    deduplicateBeforeGrouping,
    profiles: [
      {
        baseUrl: 'https://api.openai.com/v1',
        hasApiKey: ready,
        id: 'openai-default',
        modelId: ready ? 'model-1' : '',
        models: ready ? [{ displayName: 'Model One', id: 'model-1' }] : [],
        name: 'OpenAI',
        providerId: 'openai',
      },
    ],
  };
}

function client(publicSettings: PublicSettings, running = false): UiClient {
  let undoAvailable = false;
  return {
    getCommands: vi.fn(async () => [
      { name: 'close-duplicate-tabs', shortcut: 'Alt+Shift+D' },
      { name: 'group-tabs-with-ai', shortcut: 'Alt+Shift+G' },
    ]),
    openOptions: vi.fn(async () => undefined),
    openShortcutSettings: vi.fn(async () => undefined),
    request: vi.fn(async (request): Promise<RuntimeResponse> => {
      if (request.type === 'get-settings') {
        return { data: publicSettings, ok: true };
      }
      if (request.type === 'get-operation-status') {
        return {
          data: running
            ? {
                busy: true,
                operation: 'group-tabs',
                undo: { available: false },
              }
            : {
                busy: false,
                undo: undoAvailable
                  ? { available: true, kind: 'group-tabs' }
                  : { available: false },
              },
          ok: true,
        };
      }
      if (request.type === 'group-tabs') {
        undoAvailable = true;
        return {
          data: {
            duplicateResult: {
              closedTabCount: 1,
              duplicateUrlCount: 1,
              pinnedDuplicatesRetained: 0,
            },
            groupCount: 2,
            groupedTabCount: 4,
            ok: true,
          },
          ok: true,
        };
      }
      if (request.type === 'ungroup-all') {
        undoAvailable = true;
        return { data: { groupCount: 2, ungroupedTabCount: 4 }, ok: true };
      }
      if (request.type === 'undo-last-action') {
        undoAvailable = false;
        return { data: { failedTabCount: 0, restoredTabCount: 4 }, ok: true };
      }
      undoAvailable = true;
      return {
        data: { closedTabCount: 2, duplicateUrlCount: 1, pinnedDuplicatesRetained: 0 },
        ok: true,
      };
    }),
    requestProviderPermission: vi.fn(async () => true),
  };
}

describe('PopupApp', () => {
  it('lets the popup shell shrink to its visible content', async () => {
    render(<PopupApp client={client(settings(true))} t={t} />);

    await screen.findByRole('main');
    const shellRule = popupStyles.match(/\.popup-shell\s*\{([^}]*)\}/)?.[1];
    expect(shellRule).toBeDefined();
    expect(shellRule).not.toMatch(/min-height\s*:/);
  });

  it('disables AI grouping until the active provider profile is configured', async () => {
    render(<PopupApp client={client(settings(false))} t={t} />);

    expect(await screen.findByRole('button', { name: 'Group Tabs with AI' })).toBeDisabled();
    expect(screen.getByText('Configure AI')).toBeInTheDocument();
  });

  it('keeps AI grouping disabled when the popup reopens during a background task', async () => {
    render(<PopupApp client={client(settings(true), true)} t={t} />);

    expect(await screen.findByText('AI grouping is in progress.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group Tabs with AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close Duplicate Tabs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ungroup All Tabs' })).toBeDisabled();
  });

  it('runs AI grouping and enables undo after completion', async () => {
    const uiClient = client(settings(true, true));
    render(<PopupApp client={uiClient} t={t} />);

    const groupButton = await screen.findByRole('button', { name: 'Group Tabs with AI' });
    expect(within(groupButton).getByText('Deduplicate first')).toHaveClass('workflow-badge');
    expect(screen.queryByText('Duplicate tabs will be closed first.')).not.toBeInTheDocument();
    fireEvent.click(groupButton);

    expect(await screen.findByText(/Grouped 4 tabs into 2 groups/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo Last Action' })).toBeEnabled();
    });
  });

  it('renders ungroup and undo as compact low-emphasis actions', async () => {
    render(<PopupApp client={client(settings(true))} t={t} />);

    await screen.findByRole('button', { name: 'Group Tabs with AI' });
    const secondaryActions = screen.getByRole('group', { name: 'More tab actions' });
    expect(within(secondaryActions).getByRole('button', { name: 'Ungroup All Tabs' })).toHaveClass(
      'compact-button',
    );
    expect(within(secondaryActions).getByRole('button', { name: 'Undo Last Action' })).toHaveClass(
      'compact-button',
    );
  });

  it('shows AI grouping progress immediately while the background request is pending', async () => {
    const uiClient = client(settings(true));
    const fallbackRequest = vi.mocked(uiClient.request).getMockImplementation();
    let resolveGrouping: ((response: RuntimeResponse) => void) | undefined;
    const pendingGrouping = new Promise<RuntimeResponse>((resolve) => {
      resolveGrouping = resolve;
    });
    vi.mocked(uiClient.request).mockImplementation((request) =>
      request.type === 'group-tabs'
        ? pendingGrouping
        : (fallbackRequest?.(request) ?? Promise.reject(new Error('Missing mock response'))),
    );
    render(<PopupApp client={uiClient} t={t} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Group Tabs with AI' }));

    expect(await screen.findByText('AI grouping is in progress.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group Tabs with AI' })).toBeDisabled();

    resolveGrouping?.({
      data: {
        duplicateResult: undefined,
        groupCount: 1,
        groupedTabCount: 2,
        ok: true,
      },
      ok: true,
    });
    expect(await screen.findByText('Grouped 2 tabs into 1 groups.')).toBeInTheDocument();
  });

  it('runs duplicate removal, ungroup-all, and undo actions', async () => {
    const uiClient = client(settings(true));
    render(<PopupApp client={uiClient} t={t} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Close Duplicate Tabs' }));
    expect(await screen.findByText('Closed 2 duplicate tabs.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ungroup All Tabs' }));
    expect(await screen.findByText('Ungrouped 4 tabs from 2 groups.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo Last Action' }));
    expect(await screen.findByText('Restored 4 tabs; 0 failed.')).toBeInTheDocument();
    expect(uiClient.request).toHaveBeenCalledWith({ type: 'undo-last-action' });
  });
});
