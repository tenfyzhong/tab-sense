import { describe, expect, it } from 'vitest';

import { formatNotificationMessage } from './notification';
import type { Translator } from '../ui/i18n';

const t: Translator = (key, substitutions) => {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions ?? ''];
  const messages: Record<string, string> = {
    notificationDuplicatesClosed: 'Closed $1 duplicates.',
    notificationOperationComplete: 'Complete.',
    notificationTabsGrouped: 'Grouped $1 tabs into $2 groups.',
  };
  return values.reduce(
    (message, value, index) => message.replace(`$${index + 1}`, String(value)),
    messages[key] ?? key,
  );
};

describe('formatNotificationMessage', () => {
  it('formats standalone duplicate cleanup', () => {
    expect(
      formatNotificationMessage(
        {
          data: { closedTabCount: 3, duplicateUrlCount: 2, pinnedDuplicatesRetained: 0 },
          ok: true,
        },
        t,
      ),
    ).toBe('Closed 3 duplicates.');
  });

  it('combines preprocessing and AI grouping summaries', () => {
    expect(
      formatNotificationMessage(
        {
          data: {
            duplicateResult: {
              closedTabCount: 1,
              duplicateUrlCount: 1,
              pinnedDuplicatesRetained: 0,
            },
            groupCount: 2,
            groupedTabCount: 5,
            ok: true,
          },
          ok: true,
        },
        t,
      ),
    ).toBe('Closed 1 duplicates. Grouped 5 tabs into 2 groups.');
  });

  it('uses the sanitized operation error directly', () => {
    expect(formatNotificationMessage({ error: 'Provider unavailable', ok: false }, t)).toBe(
      'Provider unavailable',
    );
  });
});
