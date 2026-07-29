import type {
  AiGroupingWorkflowResult,
  DuplicateExecutionResult,
  TabOperationUndoRecord,
  UndoExecutionResult,
  UngroupAllResult,
} from '../core/types';
import type { ProviderId, PublicSettings } from '../providers/types';

export type OperationKind =
  | 'close-duplicates'
  | 'group-tabs'
  | 'undo-last-action'
  | 'ungroup-all';

export type UndoStatus =
  | { available: false }
  | { available: true; kind: TabOperationUndoRecord['kind'] };

export interface OperationStatus {
  busy: boolean;
  operation?: OperationKind;
  undo: UndoStatus;
}

export type RuntimeRequest =
  | { type: 'get-settings' }
  | { type: 'get-operation-status' }
  | { name: string; providerId: ProviderId; type: 'create-provider-profile' }
  | { profileId: string; type: 'delete-provider-profile' }
  | { profileId: string; type: 'set-active-provider-profile' }
  | {
      baseUrl: string;
      name: string;
      profileId: string;
      providerId: ProviderId;
      type: 'save-provider-profile';
    }
  | { enabled: boolean; type: 'save-workflow-preference' }
  | {
      apiKey?: string;
      baseUrl: string;
      profileId: string;
      type: 'refresh-models';
    }
  | { modelId: string; profileId: string; type: 'save-model' }
  | { type: 'close-duplicates' }
  | { type: 'group-tabs' }
  | { type: 'undo-last-action' }
  | { type: 'ungroup-all' };

export type RuntimeData =
  | PublicSettings
  | DuplicateExecutionResult
  | AiGroupingWorkflowResult
  | OperationStatus
  | UndoExecutionResult
  | UngroupAllResult;

export type RuntimeResponse =
  | { data: RuntimeData; ok: true }
  | { code?: 'busy'; data?: RuntimeData; error: string; ok: false };
