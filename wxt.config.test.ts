import { describe, expect, it } from 'vitest';

import config from './wxt.config';

describe('extension manifest', () => {
  it('allows users to enable the extension in incognito mode', () => {
    expect(config.manifest).toMatchObject({ incognito: 'spanning' });
  });
});
