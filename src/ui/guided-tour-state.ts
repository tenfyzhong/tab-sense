import { browser } from 'wxt/browser';

const GUIDED_TOUR_STORAGE_KEY = 'tabSenseGuidedTourStep';

export const GUIDED_TOUR_STEPS = [
  'popup-close-duplicates',
  'popup-group-tabs',
  'popup-settings',
  'options-add-provider',
  'options-configure-provider',
  'options-shortcuts',
  'complete',
] as const;

export type GuidedTourStep = (typeof GUIDED_TOUR_STEPS)[number];

export interface GuidedTourStateClient {
  loadStep(): Promise<GuidedTourStep | undefined>;
  saveStep(step: GuidedTourStep): Promise<void>;
}

function isGuidedTourStep(value: unknown): value is GuidedTourStep {
  return GUIDED_TOUR_STEPS.includes(value as GuidedTourStep);
}

export const guidedTourStateClient: GuidedTourStateClient = {
  loadStep: async () => {
    const stored = await browser.storage.local.get(GUIDED_TOUR_STORAGE_KEY);
    const step = stored[GUIDED_TOUR_STORAGE_KEY];
    return isGuidedTourStep(step) ? step : undefined;
  },
  saveStep: async (step) => {
    await browser.storage.local.set({ [GUIDED_TOUR_STORAGE_KEY]: step });
  },
};

export async function initializeGuidedTourOnInstall(
  details: { reason: string },
  client: GuidedTourStateClient = guidedTourStateClient,
): Promise<void> {
  if (details.reason === 'install') {
    await client.saveStep('popup-close-duplicates');
  }
}
