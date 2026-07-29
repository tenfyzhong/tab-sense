import { browser } from 'wxt/browser';

import type { TabOperationUndoRecord } from './types';

const UNDO_KEY = 'tabSenseLastUndo';

export async function loadUndoRecord(): Promise<TabOperationUndoRecord | undefined> {
  const stored = await browser.storage.session.get(UNDO_KEY);
  return stored[UNDO_KEY] as TabOperationUndoRecord | undefined;
}

export async function saveUndoRecord(record: TabOperationUndoRecord): Promise<void> {
  await browser.storage.session.set({ [UNDO_KEY]: record });
}

export async function clearUndoRecord(): Promise<void> {
  await browser.storage.session.remove(UNDO_KEY);
}
