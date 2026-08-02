import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const FIREFOX_OUTPUT_DIRECTORY = 'output/firefox-mv2';

function findJavaScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findJavaScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('Firefox release build', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['build:firefox'], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe',
    });
  }, 30_000);

  it('does not include string evaluation', () => {
    for (const path of findJavaScriptFiles(FIREFOX_OUTPUT_DIRECTORY)) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\b(?:new\s+)?Function\s*\(/u);
    }
  });

  it('does not assign dynamic values to innerHTML', () => {
    for (const path of findJavaScriptFiles(FIREFOX_OUTPUT_DIRECTORY)) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(
        /\.innerHTML\s*=\s*[$A-Z_a-z]/u,
      );
    }
  });
});
