import { describe, expect, it, vi } from 'vitest';

import {
  initializeGuidedTourOnInstall,
  type GuidedTourStateClient,
} from './guided-tour-state';

function client(): GuidedTourStateClient {
  return {
    loadStep: vi.fn(async () => undefined),
    saveStep: vi.fn(async () => undefined),
  };
}

describe('guided tour state', () => {
  it('starts the popup tour for a new installation', async () => {
    const stateClient = client();

    await initializeGuidedTourOnInstall({ reason: 'install' }, stateClient);

    expect(stateClient.saveStep).toHaveBeenCalledWith('popup-close-duplicates');
  });

  it('does not restart the tour after an extension update', async () => {
    const stateClient = client();

    await initializeGuidedTourOnInstall({ reason: 'update' }, stateClient);

    expect(stateClient.saveStep).not.toHaveBeenCalled();
  });
});
