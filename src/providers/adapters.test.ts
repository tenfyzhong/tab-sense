import { describe, expect, it, vi } from 'vitest';

import {
  getProviderOriginPattern,
  listProviderModels,
  normalizeCompatibleBaseUrl,
  requestProviderGrouping,
  testProviderConnection,
} from './adapters';
import type { ProviderConnection, ProviderFetch, ProviderId } from './types';
import { parseGroupingPlan, validateGroupingPlan } from '../core/grouping';
import type { ExistingGroupContext, SanitizedTab } from '../core/types';
import { runAiGroupingWorkflow } from '../core/workflow';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('normalizeCompatibleBaseUrl', () => {
  it('allows HTTPS and loopback HTTP API roots', () => {
    expect(normalizeCompatibleBaseUrl('https://ai.example.com/v1/')).toBe(
      'https://ai.example.com/v1',
    );
    expect(normalizeCompatibleBaseUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1',
    );
    expect(normalizeCompatibleBaseUrl('http://127.0.0.1:8080/v1')).toBe(
      'http://127.0.0.1:8080/v1',
    );
  });

  it('rejects insecure remote URLs and embedded secrets', () => {
    expect(() => normalizeCompatibleBaseUrl('http://ai.example.com/v1')).toThrow('HTTPS');
    expect(() => normalizeCompatibleBaseUrl('https://user:pass@ai.example.com/v1')).toThrow(
      'credentials',
    );
    expect(() => normalizeCompatibleBaseUrl('https://ai.example.com/v1?key=secret')).toThrow(
      'query',
    );
  });
});

describe('getProviderOriginPattern', () => {
  it('uses configured origins for every protocol and strips ports and paths', () => {
    expect(getProviderOriginPattern({ providerId: 'openai' })).toBe('https://api.openai.com/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://openai.gateway.example/v1',
        providerId: 'openai',
      }),
    ).toBe('https://openai.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://anthropic.gateway.example/v1',
        providerId: 'anthropic',
      }),
    ).toBe('https://anthropic.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'https://gemini.gateway.example/v1beta',
        providerId: 'gemini',
      }),
    ).toBe('https://gemini.gateway.example/*');
    expect(
      getProviderOriginPattern({
        baseUrl: 'http://localhost:11434/v1',
        providerId: 'openai-compatible',
      }),
    ).toBe('http://localhost/*');
  });
});

describe('listProviderModels', () => {
  it('loads and sorts OpenAI models with bearer authentication', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'z-model' }, { id: 'a-model' }] }),
    );

    const models = await listProviderModels(
      {
        apiKey: 'openai-secret',
        baseUrl: 'https://openai.gateway.example/v1',
        modelId: '',
        providerId: 'openai',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['a-model', 'z-model']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openai.gateway.example/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer openai-secret' }),
      }),
    );
  });

  it('reads context limits advertised by OpenAI-compatible model catalogs', async () => {
    const models = await listProviderModels(
      {
        apiKey: 'secret',
        baseUrl: 'https://gateway.example/v1',
        modelId: '',
        providerId: 'openai-compatible',
      },
      vi.fn(async () => jsonResponse({
        data: [
          {
            id: 'openrouter-model',
            context_length: 32768,
            top_provider: { context_length: 8192, max_completion_tokens: 2048 },
          },
          { id: 'vllm-model', max_model_len: 4096 },
          { id: 'unreported-model', max_model_len: -1, context_length: 'unknown' },
        ],
      })),
    );

    expect(models).toEqual([
      {
        displayName: 'openrouter-model',
        id: 'openrouter-model',
        maxInputTokens: 8192,
        maxOutputTokens: 2048,
      },
      { displayName: 'unreported-model', id: 'unreported-model' },
      { displayName: 'vllm-model', id: 'vllm-model', maxInputTokens: 4096 },
    ]);
  });

  it('paginates Anthropic models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ display_name: 'Claude B', id: 'claude-b', max_input_tokens: 8192, max_tokens: 512 }],
          has_more: true,
          last_id: 'claude-b',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ display_name: 'Claude A', id: 'claude-a' }],
          has_more: false,
        }),
      );

    const models = await listProviderModels(
      {
        apiKey: 'anthropic-secret',
        baseUrl: 'https://anthropic.gateway.example/v1',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['claude-a', 'claude-b']);
    expect(models[1]).toMatchObject({ maxInputTokens: 8192, maxOutputTokens: 512 });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('after_id=claude-b');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://anthropic.gateway.example/v1/models');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'anthropic-secret',
        }),
      }),
    );
  });

  it('adds the Anthropic API version to SDK-style Base URLs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [], has_more: false }));

    await listProviderModels(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/models?limit=1000',
      expect.any(Object),
    );
  });

  it('falls back to a sibling OpenAI model catalog when Anthropic discovery is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }],
          object: 'list',
        }),
      );

    const models = await listProviderModels(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: '',
        providerId: 'anthropic',
      },
      fetchMock,
    );

    expect(models.map((model) => model.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.deepseek.com/anthropic/v1/models?limit=1000',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'deepseek-secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer deepseek-secret' }),
      }),
    );
  });

  it('does not fall back from Anthropic authentication errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));

    await expect(
      listProviderModels(
        {
          apiKey: 'rejected-secret',
          baseUrl: 'https://api.deepseek.com/anthropic',
          modelId: '',
          providerId: 'anthropic',
        },
        fetchMock,
      ),
    ).rejects.toThrow('API key was rejected');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('paginates Gemini models and retains generateContent support only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              displayName: 'Gemini Chat',
              inputTokenLimit: 8192,
              name: 'models/gemini-chat',
              outputTokenLimit: 512,
              supportedGenerationMethods: ['generateContent'],
            },
            {
              displayName: 'Embedding',
              name: 'models/embed',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
          nextPageToken: 'next-page',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ models: [] }));

    const models = await listProviderModels(
      {
        apiKey: 'gemini-secret',
        baseUrl: 'https://gemini.gateway.example/v1beta',
        modelId: '',
        providerId: 'gemini',
      },
      fetchMock,
    );

    expect(models).toEqual([{
      displayName: 'Gemini Chat',
      id: 'gemini-chat',
      maxInputTokens: 8192,
      maxOutputTokens: 512,
    }]);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('pageToken=next-page');
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'https://gemini.gateway.example/v1beta/models',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-secret' }),
      }),
    );
  });

  it('sanitizes authentication and rate-limit errors', async () => {
    const connection: ProviderConnection = {
      apiKey: 'never-show-this',
      modelId: '',
      providerId: 'openai',
    };

    await expect(
      listProviderModels(connection, vi.fn(async () => jsonResponse({ secret: 'body' }, 401))),
    ).rejects.toThrow('API key was rejected');
    await expect(
      listProviderModels(connection, vi.fn(async () => jsonResponse({}, 429))),
    ).rejects.toThrow('rate limit');
  });
});

describe('requestProviderGrouping', () => {
  const responseByProvider: Record<ProviderId, unknown> = {
    anthropic: { content: [{ text: '{"groups":[]}', type: 'text' }] },
    gemini: {
      candidates: [{ content: { parts: [{ text: '{"groups":[]}' }] } }],
    },
    openai: {
      output: [{ content: [{ text: '{"groups":[]}', type: 'output_text' }] }],
    },
    'openai-compatible': {
      choices: [{ message: { content: '{"groups":[]}' } }],
    },
  };

  for (const providerId of Object.keys(responseByProvider) as ProviderId[]) {
    it(`extracts grouping JSON from ${providerId}`, async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        expect(input).toBeDefined();
        return jsonResponse(responseByProvider[providerId]);
      });
      const connection: ProviderConnection = {
        apiKey: 'secret',
        baseUrl: `https://${providerId}.gateway.example/v1`,
        modelId: 'model-1',
        providerId,
      };

      const response = await requestProviderGrouping(
        connection,
        [
          { id: 1, title: 'One', url: 'https://one.example/' },
          { id: 2, title: 'Two', url: 'https://two.example/' },
        ],
        [{ id: 7, tabs: [], title: 'Existing Work' }],
        'en',
        fetchMock,
      );

      expect(response).toBe('{"groups":[]}');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        `https://${providerId}.gateway.example/v1/`,
      );
    });

    it(`groups ${providerId} tabs in large batches within the 128,000-token default budget`, async () => {
      const tabs = Array.from({ length: 90 }, (_, index) => ({
        id: index + 1,
        title: '标签🌍"\\'.repeat(35),
        url: `https://one.example/${index}/${'path'.repeat(65)}`,
      }));
      const receivedTabs: SanitizedTab[] = [];
      const batchSizes: number[] = [];
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const system = body.input?.[0].content ?? body.system ??
          body.systemInstruction?.parts[0].text ?? body.messages[0].content;
        const user = body.input?.[1].content ?? body.contents?.[0].parts[0].text ??
          body.messages.at(-1).content;
        const output = body.max_output_tokens ?? body.max_tokens ??
          body.generationConfig?.maxOutputTokens;
        expect(output).toBeGreaterThan(0);
        expect(new TextEncoder().encode(system + user).length + output).toBeLessThanOrEqual(128_000);
        const batch = JSON.parse(user).tabs as SanitizedTab[];
        batchSizes.push(batch.length);
        receivedTabs.push(...batch);
        return jsonResponse(responseByProvider[providerId]);
      });

      await requestProviderGrouping(
        {
          apiKey: 'secret',
          baseUrl: 'https://gateway.example/v1',
          modelId: 'model-1',
          providerId,
        },
        tabs,
        [],
        'zh-CN',
        fetchMock,
      );

      expect(batchSizes).toEqual([80, 10]);
      expect(receivedTabs.map((tab) => tab.id)).toEqual(tabs.map((tab) => tab.id));
    });
  }

  it('compacts long metadata to fit a smaller window and merges validated batch proposals', async () => {
    const tabs = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: '中文🌍\u0000'.repeat(180),
      url: `https://project.example/${index}/${'x'.repeat(700)}`,
    }));
    const existingGroups = Array.from({ length: 50 }, (_, index) => ({
      id: index + 100,
      tabs: [{
        id: index + 200,
        title: '示例🌍'.repeat(100),
        url: index === 49 ? 'https://project.example/old' : `https://other.example/${index}`,
      }],
      title: index === 49 ? 'Project' : '其他🌍'.repeat(100),
    }));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const [system, user] = body.messages.map(({ content }: { content: string }) => content);
      expect(new TextEncoder().encode(system + user).length + body.max_tokens).toBeLessThanOrEqual(2048);
      const batch = JSON.parse(user) as { tabs: SanitizedTab[]; existingGroups: ExistingGroupContext[] };
      expect(batch.tabs.length).toBeGreaterThanOrEqual(2);
      expect(batch.existingGroups.map(({ id }) => id)).toContain(149);
      expect(batch.existingGroups.map(({ id }) => id)).not.toContain(148);
      const ids = batch.tabs.map(({ id, title, url }) => {
        expect(title).not.toContain('\uFFFD');
        expect(url).toMatch(/^https:\/\/project\.example\//u);
        return id;
      });
      const response = {
        groups: [
          { existingGroupId: 148, name: 'Unrelated', tabIds: ids },
          { existingGroupId: 149, name: 'Project', tabIds: [ids[0], 12, 777] },
          { name: 'Shared topic', tabIds: ids.slice(1) },
        ],
      };
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(response) } }] });
    });

    const response = await requestProviderGrouping(
      {
        apiKey: 'secret',
        baseUrl: 'https://gateway.example/v1',
        contextWindowTokens: 2048,
        modelId: 'model-1',
        providerId: 'openai-compatible',
      },
      tabs,
      existingGroups,
      'en',
      fetchMock,
    );

    const plan = parseGroupingPlan(response);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(plan.groups.flatMap(({ tabIds }) => tabIds)).not.toContain(777);
    expect(validateGroupingPlan(
      plan,
      new Set(tabs.map(({ id }) => id)),
      new Set(existingGroups.map(({ id }) => id)),
    )).toEqual([
      { existingGroupId: 149, name: 'Project', tabIds: [1, 3, 5, 7, 9, 11, 12] },
      { name: 'Shared topic', tabIds: [2, 4, 6, 8, 10] },
    ]);
  });

  it('does not apply groups when a later batch fails', async () => {
    const tabs = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: '规划🌍'.repeat(70),
      url: `https://project.example/${index}/${'path'.repeat(90)}`,
    }));
    const fetchMock = vi.fn(async () => jsonResponse({}, 503)).mockResolvedValueOnce(jsonResponse({
      output_text: '{"groups":[{"name":"Project","tabIds":[1,2]}]}',
    }));
    const connection: ProviderConnection = {
      apiKey: 'secret',
      maxInputTokens: 4096,
      modelId: 'model-1',
      providerId: 'openai',
    };
    const applyGroups = vi.fn();

    await expect(runAiGroupingWorkflow(
      { deduplicateBeforeGrouping: false, locale: 'en', windowId: 1 },
      {
        applyGroups,
        closeDuplicates: vi.fn(),
        listEligibleTabs: async () => tabs.map((tab, index) => ({
          ...tab, active: false, groupId: -1, index, pinned: false,
        })),
        listExistingGroups: async () => [],
        requestGrouping: (candidates, groups, locale) =>
          requestProviderGrouping(connection, candidates, groups, locale, fetchMock),
      },
    )).resolves.toEqual({
      error: 'The provider is temporarily unavailable',
      ok: false,
      stage: 'provider',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(applyGroups).not.toHaveBeenCalled();
  });

  it('honors provider-advertised input and output limits', async () => {
    const tabs = Array.from({ length: 24 }, (_, index) => ({
      id: index + 1,
      title: '示例🌍'.repeat(50),
      url: `https://project.example/${index}`,
    }));
    const fetchMock = vi.fn<ProviderFetch>(async () =>
      jsonResponse(responseByProvider.gemini),
    );
    const connection: ProviderConnection = {
      apiKey: 'secret',
      contextWindowTokens: 1_050_000,
      maxInputTokens: 2048,
      maxOutputTokens: 480,
      modelId: 'model-1',
      providerId: 'gemini',
    };

    await requestProviderGrouping(connection, tabs, [], 'en', fetchMock);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(String(init?.body));
      const inputBytes = new TextEncoder().encode(
        body.systemInstruction.parts[0].text + body.contents[0].parts[0].text,
      ).length;
      expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(480);
      expect(inputBytes + body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(2048);
    }

    fetchMock.mockClear();
    await expect(requestProviderGrouping(
      { ...connection, maxInputTokens: 1024 },
      tabs,
      [],
      'en',
      fetchMock,
    )).rejects.toThrow('context window');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the versioned Messages endpoint for an Anthropic SDK-style Base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(responseByProvider.anthropic));

    await requestProviderGrouping(
      {
        apiKey: 'deepseek-secret',
        baseUrl: 'https://api.deepseek.com/anthropic',
        modelId: 'deepseek-chat',
        providerId: 'anthropic',
      },
      [{ id: 1, title: 'One', url: 'https://one.example/' }],
      [],
      'en',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/messages',
      expect.any(Object),
    );
  });

  it('caps completions on the OpenAI endpoint with the current API field', async () => {
    const connection: ProviderConnection = {
      apiKey: 'secret',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'o3',
      providerId: 'openai-compatible',
    };
    const fetchMock = vi.fn<ProviderFetch>(async () => jsonResponse(responseByProvider['openai-compatible']));
    await testProviderConnection(connection, fetchMock);
    await requestProviderGrouping(
      connection,
      [{ id: 1, title: 'One', url: 'https://example.com/' }],
      [],
      'en',
      fetchMock,
    );

    const [test, grouping] = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(test.max_completion_tokens).toBe(16);
    expect(grouping.max_completion_tokens).toBeGreaterThan(0);
    expect(grouping).not.toHaveProperty('max_tokens');
  });

  it('instructs the provider to prefer existing groups and sends their context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeDefined();
      expect(init).toBeDefined();
      return jsonResponse({ choices: [{ message: { content: '{"groups":[]}' } }] });
    });

    await requestProviderGrouping(
      {
        apiKey: 'secret',
        baseUrl: 'https://compatible.example/v1',
        modelId: 'model-1',
        providerId: 'openai-compatible',
      },
      [{ id: 1, title: 'New issue', url: 'https://github.example/issues/1' }],
      [
        {
          id: 7,
          tabs: [{ id: 70, title: 'Existing issue', url: 'https://github.example/issues/70' }],
          title: 'GitHub Issues',
        },
      ],
      'en',
      fetchMock,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    expect(body.messages[0]?.content).toContain('Prefer assigning tabs to a suitable existing group');
    expect(body.messages[0]?.content).toContain('Only return tab IDs from the top-level tabs array');
    expect(body.messages[1]?.content).toContain('"existingGroups"');
    expect(body.messages[1]?.content).toContain('"GitHub Issues"');
    expect(body.messages[1]?.content).not.toContain('"id":70');
  });
});

describe('testProviderConnection', () => {
  it.each([
    {
      baseUrl: 'https://api.openai.com/v1',
      expectedUrl: 'https://api.openai.com/v1/responses',
      headerName: 'Authorization',
      headerValue: 'Bearer test-secret',
      providerId: 'openai' as const,
    },
    {
      baseUrl: 'https://api.deepseek.com/anthropic',
      expectedUrl: 'https://api.deepseek.com/anthropic/v1/messages',
      headerName: 'x-api-key',
      headerValue: 'test-secret',
      providerId: 'anthropic' as const,
    },
    {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      expectedUrl:
        'https://generativelanguage.googleapis.com/v1beta/models/model-1:generateContent',
      headerName: 'x-goog-api-key',
      headerValue: 'test-secret',
      providerId: 'gemini' as const,
    },
    {
      baseUrl: 'https://gateway.example/v1',
      expectedUrl: 'https://gateway.example/v1/chat/completions',
      headerName: 'Authorization',
      headerValue: 'Bearer test-secret',
      providerId: 'openai-compatible' as const,
    },
  ])('sends a bounded $providerId generation request', async (testCase) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeDefined();
      expect(init).toBeDefined();
      return jsonResponse({ accepted: true });
    });

    await testProviderConnection(
      {
        apiKey: 'test-secret',
        baseUrl: testCase.baseUrl,
        modelId: 'model-1',
        providerId: testCase.providerId,
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      testCase.expectedUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ [testCase.headerName]: testCase.headerValue }),
        method: 'POST',
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.model ?? 'model-1').toBe('model-1');
    const outputLimit =
      testCase.providerId === 'gemini'
        ? (body.generationConfig as Record<string, unknown>).maxOutputTokens
        : testCase.providerId === 'openai'
          ? body.max_output_tokens
          : body.max_tokens;
    expect(outputLimit).toBe(16);
  });

  it('returns sanitized provider failures', async () => {
    await expect(
      testProviderConnection(
        {
          apiKey: 'never-show-this',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'model-1',
          providerId: 'openai',
        },
        vi.fn(async () => jsonResponse({ leaked: 'body' }, 401)),
      ),
    ).rejects.toThrow('API key was rejected');
  });
});
