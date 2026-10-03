export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly rawBody: string | null;
  readonly requestId: string;
  readonly correlationId: string;
  readonly claims: Readonly<Record<string, unknown>> | null;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface RouteContext {
  readonly request: HttpRequest;
  readonly params: Readonly<Record<string, string>>;
}

export type RouteHandler = (context: RouteContext) => HttpResponse | Promise<HttpResponse>;
