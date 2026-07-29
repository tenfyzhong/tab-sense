import { describe, expect, it } from 'vitest';

import { OperationBusyError, OperationLock } from './operation-lock';

describe('OperationLock', () => {
  it('rejects overlapping operations and releases after completion', async () => {
    const lock = new OperationLock();
    let release: (() => void) | undefined;
    const first = lock.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    expect(lock.busy).toBe(true);
    await expect(lock.run(async () => undefined)).rejects.toBeInstanceOf(OperationBusyError);

    release?.();
    await first;
    expect(lock.busy).toBe(false);
    await expect(lock.run(async () => 'done')).resolves.toBe('done');
  });
});
