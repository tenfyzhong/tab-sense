import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');

describe('browser release packaging', () => {
  it.each(['chrome', 'edge', 'firefox'])('defines and runs the %s ZIP build', (browser) => {
    expect(packageJson.scripts[`zip:${browser}`]).toBe(`wxt zip -b ${browser}`);
    expect(releaseWorkflow).toContain(`pnpm zip:${browser}`);
    expect(releaseWorkflow).toContain(`tab-sense-\${tag_version}-${browser}.zip`);
  });

  it('publishes every browser archive in the GitHub release', () => {
    expect(releaseWorkflow).toContain('"${release_archives[@]}"');
  });
});
