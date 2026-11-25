import type { ModelIdentity, ProviderFetch } from './types';

const CATALOG_URL = 'https://models.dev/api.json';
const CATALOG_TTL_MS = 15 * 60 * 1000;
const PROVIDER_BY_HOST = new Map([
  ['api.anthropic.com', 'anthropic'],
  ['api.openai.com', 'openai'],
  ['generativelanguage.googleapis.com', 'google'],
]);
const PROVIDER_BY_PROTOCOL = {
  anthropic: 'anthropic',
  gemini: 'google',
  openai: 'openai',
  'openai-compatible': '',
};

let cachedCatalog: {
  expiresAt: number;
  fetcher: ProviderFetch;
  response: Promise<unknown>;
} | undefined;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseUrl(value: unknown): URL | undefined {
  if (typeof value === 'string') {
    try {
      return new URL(value);
    } catch {
      return undefined;
    }
  }
}

function modelContext(provider: unknown, modelId: string): number | undefined {
  const models = record(record(provider)?.models);
  if (!models || !Object.hasOwn(models, modelId)) {
    return undefined;
  }
  const context = record(record(models[modelId])?.limit)?.context;
  if (typeof context === 'number' && Number.isSafeInteger(context) && context > 0) {
    return context;
  }
}

function findModelContext(data: unknown, identity: ModelIdentity): number | undefined {
  const providers = record(data);
  if (!providers) {
    return undefined;
  }
  const { baseUrl, modelId, providerId } = identity;
  const endpoint = parseUrl(baseUrl);
  const endpointPath = endpoint?.pathname.replace(/\/$/u, '');
  const endpointMatches = Object.values(providers).flatMap((provider) => {
    const api = parseUrl(record(provider)?.api);
    const path = api?.pathname.replace(/\/$/u, '');
    if (path === undefined || api?.origin !== endpoint?.origin ||
        (endpointPath !== path && !endpointPath?.startsWith(`${path}/`))) {
      return [];
    }
    const tokens = modelContext(provider, modelId);
    return tokens === undefined ? [] : [{ path, tokens }];
  });
  endpointMatches.sort((left, right) => right.path.length - left.path.length);
  const match = endpointMatches[0];
  if (match) {
    const limits = endpointMatches.filter(({ path }) => path === match.path);
    return Math.min(...limits.map(({ tokens }) => tokens));
  }

  const primary = PROVIDER_BY_HOST.get(endpoint?.hostname ?? '') ?? PROVIDER_BY_PROTOCOL[providerId];
  const direct = modelContext(providers[primary], modelId);
  if (direct !== undefined) {
    return direct;
  }
  const separator = modelId.indexOf('/');
  if (separator > 0) {
    const namespace = modelId.slice(0, separator);
    const upstream = modelContext(providers[namespace], modelId.slice(separator + 1));
    if (upstream !== undefined) {
      return upstream;
    }
  }

  const exactLimits = new Set(
    Object.values(providers).map((provider) => modelContext(provider, modelId))
      .filter((tokens) => tokens !== undefined),
  );
  return exactLimits.size === 1 ? exactLimits.values().next().value : undefined;
}

async function fetchCatalog(fetcher: ProviderFetch): Promise<unknown> {
  const response = await fetcher(CATALOG_URL, {
    credentials: 'omit',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error('The public model catalog is unavailable');
  }
  return response.json();
}

export async function lookupCatalogContext(
  identity: ModelIdentity,
  fetcher: ProviderFetch = fetch,
): Promise<number | undefined> {
  if (cachedCatalog?.fetcher !== fetcher || cachedCatalog.expiresAt <= Date.now()) {
    cachedCatalog = {
      expiresAt: Date.now() + CATALOG_TTL_MS,
      fetcher,
      response: fetchCatalog(fetcher),
    };
  }
  const request = cachedCatalog;
  try {
    return findModelContext(await request.response, identity);
  } catch {
    if (cachedCatalog === request) {
      cachedCatalog = undefined;
    }
    return undefined;
  }
}
