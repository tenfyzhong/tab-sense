import type { OperationStatus } from '../background/messages';
import type {
  AiGroupingWorkflowResult,
  DuplicateExecutionResult,
  UndoExecutionResult,
  UngroupAllResult,
} from '../core/types';
import type { PublicSettings } from '../providers/types';

export function isPublicSettings(value: unknown): value is PublicSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    'activeProfileId' in value &&
    'profiles' in value &&
    Array.isArray(value.profiles)
  );
}

export function isDuplicateResult(value: unknown): value is DuplicateExecutionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'closedTabCount' in value &&
    typeof value.closedTabCount === 'number'
  );
}

export function isGroupingResult(value: unknown): value is AiGroupingWorkflowResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

export function isOperationStatus(value: unknown): value is OperationStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'busy' in value &&
    typeof value.busy === 'boolean' &&
    'undo' in value
  );
}

export function isUndoResult(value: unknown): value is UndoExecutionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'restoredTabCount' in value &&
    typeof value.restoredTabCount === 'number'
  );
}

export function isUngroupAllResult(value: unknown): value is UngroupAllResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ungroupedTabCount' in value &&
    typeof value.ungroupedTabCount === 'number'
  );
}
