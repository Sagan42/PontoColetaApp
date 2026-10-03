import type { HttpMethod, HttpRequest, HttpResponse, RouteHandler } from './http-types.js';
import { errorResponse } from './responses.js';

interface Route {
  readonly method: HttpMethod;
  readonly segments: readonly string[];
  readonly handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: HttpMethod, pattern: string, handler: RouteHandler): this {
    this.routes.push({ method, segments: splitPath(pattern), handler });
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.add('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.add('POST', pattern, handler);
  }

  async handle(request: HttpRequest): Promise<HttpResponse> {
    const segments = splitPath(request.path);
    let pathMatched = false;

    for (const route of this.routes) {
      const params = match(route.segments, segments);
      if (!params) continue;

      pathMatched = true;
      if (route.method === request.method) {
        return await route.handler({ request, params });
      }
    }

    return pathMatched
      ? errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.', request.requestId)
      : errorResponse(404, 'ROUTE_NOT_FOUND', 'Recurso não encontrado.', request.requestId);
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function match(
  pattern: readonly string[],
  segments: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;

  const params: Record<string, string> = {};

  for (let index = 0; index < pattern.length; index += 1) {
    const patternSegment = pattern[index] ?? '';
    const segment = segments[index] ?? '';

    if (patternSegment.startsWith('{') && patternSegment.endsWith('}')) {
      params[patternSegment.slice(1, -1)] = decodeURIComponent(segment);
      continue;
    }

    if (patternSegment !== segment) return null;
  }

  return params;
}
