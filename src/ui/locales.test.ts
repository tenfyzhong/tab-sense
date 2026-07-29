import { describe, expect, it } from 'vitest';

import english from '../../public/_locales/en/messages.json';
import simplifiedChinese from '../../public/_locales/zh_CN/messages.json';

describe('localization resources', () => {
  it('keeps English and Simplified Chinese message keys in sync', () => {
    expect(Object.keys(simplifiedChinese).sort()).toEqual(Object.keys(english).sort());
  });

  it('contains the manifest, workflow, result, and notification messages', () => {
    for (const key of [
      'extensionName',
      'extensionDescription',
      'closeDuplicatesBeforeGrouping',
      'closedTabsResult',
      'groupedTabsResult',
      'notificationDuplicatesClosed',
      'notificationTabsGrouped',
    ]) {
      expect(english).toHaveProperty(key);
      expect(simplifiedChinese).toHaveProperty(key);
    }
  });
});
