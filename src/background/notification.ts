import type { RuntimeResponse } from './messages';
import type { Translator } from '../ui/i18n';
import { isDuplicateResult, isGroupingResult } from '../ui/guards';

export function formatNotificationMessage(response: RuntimeResponse, t: Translator): string {
  if (!response.ok) {
    return response.error;
  }
  if (isDuplicateResult(response.data)) {
    return t('notificationDuplicatesClosed', String(response.data.closedTabCount));
  }
  if (isGroupingResult(response.data) && response.data.ok) {
    const grouped = t('notificationTabsGrouped', [
      String(response.data.groupedTabCount),
      String(response.data.groupCount),
    ]);
    if (response.data.duplicateResult) {
      return `${t(
        'notificationDuplicatesClosed',
        String(response.data.duplicateResult.closedTabCount),
      )} ${grouped}`;
    }
    return grouped;
  }
  return t('notificationOperationComplete');
}
