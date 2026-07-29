import { OperationBusyError, OperationLock } from './operation-lock';
import type {
  OperationKind,
  RuntimeRequest,
  RuntimeResponse,
  ProviderConnectionTestResult,
  UndoStatus,
} from './messages';
import type {
  AiGroupingWorkflowResult,
  DuplicateExecutionResult,
  UndoExecutionResult,
  UngroupAllResult,
} from '../core/types';
import type { ProviderId, PublicSettings } from '../providers/types';

export interface RuntimeControllerDependencies {
  closeDuplicates(windowId: number): Promise<DuplicateExecutionResult>;
  createProviderProfile(name: string, providerId: ProviderId): Promise<PublicSettings>;
  deleteProviderProfile(profileId: string): Promise<PublicSettings>;
  getCurrentWindowId(): Promise<number>;
  getSettings(): Promise<PublicSettings>;
  getUndoStatus(): Promise<UndoStatus>;
  groupTabs(windowId: number): Promise<AiGroupingWorkflowResult>;
  refreshModels(input: {
    apiKey?: string;
    baseUrl: string;
    profileId: string;
  }): Promise<PublicSettings>;
  saveModel(profileId: string, modelId: string): Promise<PublicSettings>;
  saveProviderProfile(input: {
    baseUrl: string;
    name: string;
    profileId: string;
    providerId: ProviderId;
  }): Promise<PublicSettings>;
  saveWorkflowPreference(enabled: boolean): Promise<PublicSettings>;
  setActiveProviderProfile(profileId: string): Promise<PublicSettings>;
  testProviderModel(profileId: string): Promise<ProviderConnectionTestResult>;
  undoLastAction(): Promise<UndoExecutionResult>;
  ungroupAll(windowId: number): Promise<UngroupAllResult>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export class RuntimeController {
  private readonly lock = new OperationLock();
  private operation: OperationKind | undefined;

  constructor(private readonly dependencies: RuntimeControllerDependencies) {}

  private runOperation<T>(operation: OperationKind, task: () => Promise<T>): Promise<T> {
    return this.lock.run(async () => {
      this.operation = operation;
      try {
        return await task();
      } finally {
        this.operation = undefined;
      }
    });
  }

  async handle(request: RuntimeRequest, suppliedWindowId?: number): Promise<RuntimeResponse> {
    try {
      switch (request.type) {
        case 'get-settings':
          return { data: await this.dependencies.getSettings(), ok: true };
        case 'get-operation-status':
          return {
            data: {
              busy: this.lock.busy,
              ...(this.operation ? { operation: this.operation } : {}),
              undo: await this.dependencies.getUndoStatus(),
            },
            ok: true,
          };
        case 'create-provider-profile':
          return {
            data: await this.dependencies.createProviderProfile(request.name, request.providerId),
            ok: true,
          };
        case 'delete-provider-profile':
          return {
            data: await this.dependencies.deleteProviderProfile(request.profileId),
            ok: true,
          };
        case 'set-active-provider-profile':
          return {
            data: await this.dependencies.setActiveProviderProfile(request.profileId),
            ok: true,
          };
        case 'save-provider-profile':
          return {
            data: await this.dependencies.saveProviderProfile({
              baseUrl: request.baseUrl,
              name: request.name,
              profileId: request.profileId,
              providerId: request.providerId,
            }),
            ok: true,
          };
        case 'save-workflow-preference':
          return {
            data: await this.dependencies.saveWorkflowPreference(request.enabled),
            ok: true,
          };
        case 'refresh-models':
          return {
            data: await this.dependencies.refreshModels({
              apiKey: request.apiKey,
              baseUrl: request.baseUrl,
              profileId: request.profileId,
            }),
            ok: true,
          };
        case 'save-model':
          return {
            data: await this.dependencies.saveModel(request.profileId, request.modelId),
            ok: true,
          };
        case 'test-provider-model':
          return {
            data: await this.dependencies.testProviderModel(request.profileId),
            ok: true,
          };
        case 'close-duplicates': {
          const windowId = suppliedWindowId ?? (await this.dependencies.getCurrentWindowId());
          const result = await this.runOperation('close-duplicates', () =>
            this.dependencies.closeDuplicates(windowId),
          );
          return { data: result, ok: true };
        }
        case 'group-tabs': {
          const windowId = suppliedWindowId ?? (await this.dependencies.getCurrentWindowId());
          const result = await this.runOperation('group-tabs', () =>
            this.dependencies.groupTabs(windowId),
          );
          return result.ok
            ? { data: result, ok: true }
            : { data: result, error: result.error, ok: false };
        }
        case 'ungroup-all': {
          const windowId = suppliedWindowId ?? (await this.dependencies.getCurrentWindowId());
          return {
            data: await this.runOperation('ungroup-all', () =>
              this.dependencies.ungroupAll(windowId),
            ),
            ok: true,
          };
        }
        case 'undo-last-action':
          return {
            data: await this.runOperation('undo-last-action', () =>
              this.dependencies.undoLastAction(),
            ),
            ok: true,
          };
      }
    } catch (error) {
      if (error instanceof OperationBusyError) {
        return { code: 'busy', error: error.message, ok: false };
      }
      return { error: errorMessage(error), ok: false };
    }
  }
}
