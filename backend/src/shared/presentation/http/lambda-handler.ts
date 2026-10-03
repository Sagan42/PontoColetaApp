import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { Logger } from '../../application/ports/logger.js';
import { toHttpRequest } from './api-gateway-adapter.js';
import { toHttpResponse } from './error-mapper.js';
import type { Router } from './router.js';

type LambdaEvent = Parameters<typeof toHttpRequest>[0];

export function createLambdaHandler(router: Router, logger: Logger) {
  return async (event: LambdaEvent): Promise<APIGatewayProxyResultV2> => {
    const request = toHttpRequest(event);
    const requestLogger = logger.child({
      requestId: request.requestId,
      correlationId: request.correlationId,
      operation: `${request.method} ${request.path}`,
    });

    const startedAt = Date.now();
    let response;

    try {
      response = await router.handle(request);
    } catch (error) {
      response = toHttpResponse(error, request, requestLogger);
    }

    requestLogger.info('request.completed', {
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    });

    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
    };
  };
}
