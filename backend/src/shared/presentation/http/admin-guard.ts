import { HttpAuthorizationError } from './error-mapper.js';

/**
 * The JWT authorizer in front of the administrative API already rejects an
 * invalid token. This guards the handler itself, so a route cannot be reached
 * without a subject even if the authorizer is ever misconfigured.
 */
export function assertAdmin(claims: Readonly<Record<string, unknown>> | null): string {
  if (!claims) {
    throw new HttpAuthorizationError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new HttpAuthorizationError(403, 'FORBIDDEN', 'Acesso não autorizado.');
  }
  return claims.sub;
}
