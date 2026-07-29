import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

import { clearUndoRecord, loadUndoRecord, saveUndoRecord } from './undo-store';

describe('undo record storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('persists only the latest undo record and clears it after use', async () => {
    await saveUndoRecord({
      assignments: [{ groupId: 7, tabId: 1 }],
      closedTabs: [],
      groups: [],
      kind: 'group-tabs',
      windowId: 42,
    });
    await saveUndoRecord({
      assignments: [{ groupId: 5, tabId: 2 }],
      groups: [{ collapsed: false, color: 'blue', id: 5, title: 'Work' }],
      kind: 'ungroup-all',
      windowId: 42,
    });

    await expect(loadUndoRecord()).resolves.toMatchObject({
      kind: 'ungroup-all',
      windowId: 42,
    });
    await clearUndoRecord();
    await expect(loadUndoRecord()).resolves.toBeUndefined();
  });
});
