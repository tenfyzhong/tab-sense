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
      'noProviders',
      'testModel',
      'modelTestInProgress',
      'modelTestSuccess',
    ]) {
      expect(english).toHaveProperty(key);
      expect(simplifiedChinese).toHaveProperty(key);
    }
  });

  it('names the OpenAI protocols after the API format they use', () => {
    expect(english.providerOpenai.message).toBe('OpenAI Responses');
    expect(english.providerOpenaiCompatible.message).toBe('OpenAI Completions');
    expect(simplifiedChinese.providerOpenai.message).toBe('OpenAI Responses');
    expect(simplifiedChinese.providerOpenaiCompatible.message).toBe('OpenAI Completions');
  });
});
