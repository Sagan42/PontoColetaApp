import { z } from 'zod';
import { config } from './config';

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Envelope every endpoint answers with. Unknown keys are dropped rather than
 * rejected, so a newer API that adds fields keeps working on an older app.
 */
export function apiEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface RequestOptions<T = unknown> {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
  /** When given, the response body is validated and `T` is inferred from it. */
  schema?: z.ZodType<T>;
}

export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.apiTimeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-correlation-id': createCorrelationId(),
  };

  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Não foi possível conectar. Verifique sua internet e tente novamente.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN_ERROR',
      body.error?.message ?? 'Não foi possível concluir a operação. Tente novamente.',
      response.status,
      body.error?.details,
    );
  }

  if (!options.schema) return payload as T;

  // A 200 is not a promise about the shape: proxies, Wi-Fi captive portals and
  // other API versions all answer 200 with something else entirely.
  const validated = options.schema.safeParse(payload);
  if (!validated.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      'Resposta inesperada do servidor. Tente novamente.',
      response.status,
      validated.error.issues,
    );
  }

  return validated.data;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function createCorrelationId(): string {
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
