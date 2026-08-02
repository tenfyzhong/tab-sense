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

  it('submits Firefox and Edge updates to their browser stores', () => {
    expect(releaseWorkflow).toContain('FIREFOX_EXTENSION_ID: ${{ vars.FIREFOX_EXTENSION_ID }}');
    expect(releaseWorkflow).toContain('FIREFOX_JWT_ISSUER: ${{ secrets.FIREFOX_JWT_ISSUER }}');
    expect(releaseWorkflow).toContain('FIREFOX_JWT_SECRET: ${{ secrets.FIREFOX_JWT_SECRET }}');
    expect(releaseWorkflow).toContain('EDGE_PRODUCT_ID: ${{ vars.EDGE_PRODUCT_ID }}');
    expect(releaseWorkflow).toContain('EDGE_CLIENT_ID: ${{ secrets.EDGE_CLIENT_ID }}');
    expect(releaseWorkflow).toContain('EDGE_API_KEY: ${{ secrets.EDGE_API_KEY }}');
    expect(releaseWorkflow).toContain('pnpm exec wxt submit');
    expect(releaseWorkflow).toContain(
      '--firefox-zip "output/tab-sense-${tag_version}-firefox.zip"',
    );
    expect(releaseWorkflow).toContain(
      '--firefox-sources-zip "output/tab-sense-${tag_version}-sources.zip"',
    );
    expect(releaseWorkflow).toContain('--firefox-channel listed');
    expect(releaseWorkflow).toContain('--firefox-compatibility firefox');
    expect(releaseWorkflow).toContain(
      '--edge-zip "output/tab-sense-${tag_version}-edge.zip"',
    );
  });

  it('verifies the Firefox source archive before submission', () => {
    expect(releaseWorkflow).toContain(
      'firefox_sources="output/tab-sense-${tag_version}-sources.zip"',
    );
    expect(releaseWorkflow).toContain('unzip -t "$firefox_sources"');
  });
});
