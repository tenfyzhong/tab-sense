import { describe, expect, it } from 'vitest';

import {
  deterministicGroupColor,
  parseGroupingPlan,
  sanitizeTabForAi,
  validateGroupingPlan,
} from './grouping';

describe('sanitizeTabForAi', () => {
  it('removes query and fragment while retaining the origin and path', () => {
    const result = sanitizeTabForAi({
      active: false,
      groupId: -1,
      id: 7,
      index: 0,
      pinned: false,
      title: `  ${'A'.repeat(250)}  `,
      url: `https://example.com/${'p'.repeat(600)}?token=secret#section`,
    });

    expect(result.id).toBe(7);
    expect(result.title).toHaveLength(200);
    expect(result.url).not.toContain('token');
    expect(result.url).not.toContain('#');
    expect(result.url.length).toBeLessThanOrEqual(500);
  });
});

describe('parseGroupingPlan', () => {
  it('accepts raw and fenced JSON', () => {
    const expected = { groups: [{ existingGroupId: 7, name: 'Work', tabIds: [1, 2] }] };

    expect(parseGroupingPlan(JSON.stringify(expected))).toEqual(expected);
    expect(parseGroupingPlan(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``)).toEqual(expected);
  });

  it('extracts a schema-valid JSON object from provider commentary', () => {
    const expected = { groups: [{ name: 'Work', tabIds: [1, 2] }] };
    const response = [
      '<think>I should organize these tabs by topic.</think>',
      'Here is the result:',
      '```json',
      JSON.stringify(expected),
      '```',
    ].join('\n');

    expect(parseGroupingPlan(response)).toEqual(expected);
    expect(
      parseGroupingPlan(`<think>Keep the groups concise.</think>\n${JSON.stringify(expected)}`),
    ).toEqual(expected);
  });

  it('rejects malformed JSON shapes', () => {
    expect(() => parseGroupingPlan('{"groups":"invalid"}')).toThrow('Invalid grouping response');
  });
});

describe('validateGroupingPlan', () => {
  it('drops singleton groups and merges matching normalized names', () => {
    const groups = validateGroupingPlan(
      {
        groups: [
          { name: ' Work ', tabIds: [1] },
          { name: 'Work', tabIds: [2] },
          { name: 'Solo', tabIds: [3] },
        ],
      },
      new Set([1, 2, 3, 4]),
    );

    expect(groups).toEqual([{ name: 'Work', tabIds: [1, 2] }]);
  });

  it('rejects unknown and repeated tab IDs', () => {
    expect(() =>
      validateGroupingPlan({ groups: [{ name: 'Work', tabIds: [1, 9] }] }, new Set([1, 2])),
    ).toThrow('unknown tab ID');

    expect(() =>
      validateGroupingPlan(
        {
          groups: [
            { name: 'Work', tabIds: [1, 2] },
            { name: 'Other', tabIds: [2, 3] },
          ],
        },
        new Set([1, 2, 3]),
      ),
    ).toThrow('repeated tab ID');
  });

  it('keeps singleton assignments to existing groups and merges by existing group ID', () => {
    const groups = validateGroupingPlan(
      {
        groups: [
          { existingGroupId: 7, name: 'Work', tabIds: [1] },
          { existingGroupId: 7, name: 'Work references', tabIds: [2] },
          { name: 'New singleton', tabIds: [3] },
        ],
      },
      new Set([1, 2, 3]),
      new Set([7]),
    );

    expect(groups).toEqual([{ existingGroupId: 7, name: 'Work', tabIds: [1, 2] }]);
  });

  it('rejects unknown existing group IDs', () => {
    expect(() =>
      validateGroupingPlan(
        { groups: [{ existingGroupId: 99, name: 'Missing', tabIds: [1] }] },
        new Set([1]),
        new Set([7]),
      ),
    ).toThrow('unknown existing group ID');
  });
});

describe('deterministicGroupColor', () => {
  it('returns a stable Chrome group color', () => {
    const allowed = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

    expect(deterministicGroupColor('Work')).toBe(deterministicGroupColor('Work'));
    expect(allowed).toContain(deterministicGroupColor('Work'));
  });
});
