import { describe, expect, it, vi } from 'vitest';

import { RuntimeController } from './controller';
import type { RuntimeControllerDependencies } from './controller';
import type { PublicSettings } from '../providers/types';

const settings: PublicSettings = {
  activeProfileId: 'openai-default',
  deduplicateBeforeGrouping: false,
  profiles: [
    {
      baseUrl: 'https://api.openai.com/v1',
      hasApiKey: true,
      id: 'openai-default',
      modelId: 'model-1',
      models: [],
      name: 'OpenAI',
      providerId: 'openai',
    },
  ],
};

function dependencies(): RuntimeControllerDependencies {
  return {
    closeDuplicates: vi.fn(async () => ({
      closedTabCount: 1,
      duplicateUrlCount: 1,
      pinnedDuplicatesRetained: 0,
    })),
    createProviderProfile: vi.fn(async () => settings),
    deleteProviderProfile: vi.fn(async () => settings),
    getCurrentWindowId: vi.fn(async () => 42),
    getSettings: vi.fn(async () => settings),
    getUndoStatus: vi.fn(async () => ({ available: false as const })),
    groupTabs: vi.fn(async () => ({
      duplicateResult: undefined,
      groupCount: 1,
      groupedTabCount: 2,
      ok: true as const,
    })),
    refreshModels: vi.fn(async () => settings),
    saveModel: vi.fn(async () => settings),
    saveProviderProfile: vi.fn(async () => settings),
    saveWorkflowPreference: vi.fn(async () => settings),
    setActiveProviderProfile: vi.fn(async () => settings),
    testProviderModel: vi.fn(async () => ({ connected: true as const })),
    undoLastAction: vi.fn(async () => ({ failedTabCount: 0, restoredTabCount: 2 })),
    ungroupAll: vi.fn(async () => ({ groupCount: 2, ungroupedTabCount: 4 })),
  };
}

describe('RuntimeController', () => {
  it('routes named provider profile and model messages', async () => {
    const deps = dependencies();
    const controller = new RuntimeController(deps);

    await expect(controller.handle({ type: 'get-settings' })).resolves.toEqual({
      data: settings,
      ok: true,
    });
    await controller.handle({
      name: 'Work OpenAI',
      providerId: 'openai',
      type: 'create-provider-profile',
    });
    await controller.handle({ profileId: 'profile-1', type: 'set-active-provider-profile' });
    await controller.handle({
      baseUrl: 'https://gateway.example/v1',
      name: 'Gateway',
      profileId: 'profile-1',
      providerId: 'openai',
      type: 'save-provider-profile',
    });
    await controller.handle({ modelId: 'model-1', profileId: 'profile-1', type: 'save-model' });
    await expect(
      controller.handle({ profileId: 'profile-1', type: 'test-provider-model' }),
    ).resolves.toEqual({ data: { connected: true }, ok: true });
    await controller.handle({ profileId: 'profile-1', type: 'delete-provider-profile' });

    expect(deps.createProviderProfile).toHaveBeenCalledWith('Work OpenAI', 'openai');
    expect(deps.setActiveProviderProfile).toHaveBeenCalledWith('profile-1');
    expect(deps.saveProviderProfile).toHaveBeenCalledWith({
      baseUrl: 'https://gateway.example/v1',
      name: 'Gateway',
      profileId: 'profile-1',
      providerId: 'openai',
    });
    expect(deps.saveModel).toHaveBeenCalledWith('profile-1', 'model-1');
    expect(deps.testProviderModel).toHaveBeenCalledWith('profile-1');
    expect(deps.deleteProviderProfile).toHaveBeenCalledWith('profile-1');
  });

  it('reports a running AI task after a popup is reopened and rejects overlap', async () => {
    const deps = dependencies();
    let release: (() => void) | undefined;
    vi.mocked(deps.groupTabs).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              duplicateResult: undefined,
              groupCount: 1,
              groupedTabCount: 2,
              ok: true,
            });
        }),
    );
    const controller = new RuntimeController(deps);

    const first = controller.handle({ type: 'group-tabs' }, 7);
    await expect(controller.handle({ type: 'get-operation-status' })).resolves.toEqual({
      data: {
        busy: true,
        operation: 'group-tabs',
        undo: { available: false },
      },
      ok: true,
    });
    await expect(controller.handle({ type: 'ungroup-all' }, 7)).resolves.toEqual({
      code: 'busy',
      error: 'Another tab operation is already running',
      ok: false,
    });
    release?.();
    await first;

    await expect(controller.handle({ type: 'get-operation-status' })).resolves.toEqual({
      data: { busy: false, undo: { available: false } },
      ok: true,
    });
  });

  it('routes ungroup-all and undo through the operation lock', async () => {
    const deps = dependencies();
    vi.mocked(deps.getUndoStatus).mockResolvedValue({
      available: true,
      kind: 'ungroup-all',
    });
    const controller = new RuntimeController(deps);

    await expect(controller.handle({ type: 'ungroup-all' }, 7)).resolves.toEqual({
      data: { groupCount: 2, ungroupedTabCount: 4 },
      ok: true,
    });
    await expect(controller.handle({ type: 'undo-last-action' })).resolves.toEqual({
      data: { failedTabCount: 0, restoredTabCount: 2 },
      ok: true,
    });

    expect(deps.ungroupAll).toHaveBeenCalledWith(7);
    expect(deps.undoLastAction).toHaveBeenCalledOnce();
  });

  it('uses the last focused normal window when no window is supplied', async () => {
    const deps = dependencies();
    const controller = new RuntimeController(deps);

    await controller.handle({ type: 'group-tabs' });

    expect(deps.getCurrentWindowId).toHaveBeenCalledOnce();
    expect(deps.groupTabs).toHaveBeenCalledWith(42);
  });
});
