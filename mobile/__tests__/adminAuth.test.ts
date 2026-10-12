import {
  AdminAuthError,
  isSessionValid,
  refreshAdminSession,
  signInAdmin,
  type AdminSession,
} from '../src/features/admin/auth';

jest.mock('../src/services/config', () => ({
  config: {
    apiUrl: 'http://localhost:3000',
    apiTimeoutMs: 12000,
    admin: { region: 'us-east-1', clientId: 'test-client-id' },
  },
}));

const fetchMock = jest.fn();
const globalFetch = globalThis as { fetch: typeof fetch };
const originalFetch = globalFetch.fetch;

function cognitoResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function lastRequestBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const storedSession: AdminSession = {
  idToken: 'id-expired',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() - 1_000,
};

describe('admin auth', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalFetch.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalFetch.fetch = originalFetch;
  });

  it('keeps the refresh token returned by InitiateAuth', async () => {
    fetchMock.mockResolvedValue(
      cognitoResponse({
        AuthenticationResult: { IdToken: 'id-1', RefreshToken: 'refresh-1', ExpiresIn: 3600 },
      }),
    );

    const session = await signInAdmin('admin@pontocoleta.app', 'senha-super-secreta');

    expect(session.idToken).toBe('id-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(lastRequestBody()).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: 'admin@pontocoleta.app', PASSWORD: 'senha-super-secreta' },
    });
  });

  it('renews the session through the REFRESH_TOKEN_AUTH flow', async () => {
    fetchMock.mockResolvedValue(
      cognitoResponse({ AuthenticationResult: { IdToken: 'id-2', ExpiresIn: 3600 } }),
    );

    const renewed = await refreshAdminSession(storedSession);

    expect(lastRequestBody()).toMatchObject({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: 'test-client-id',
      AuthParameters: { REFRESH_TOKEN: 'refresh-1' },
    });
    expect(renewed.idToken).toBe('id-2');
    expect(isSessionValid(renewed)).toBe(true);
  });

  it('carries the current refresh token over, since the renewal does not return one', async () => {
    fetchMock.mockResolvedValue(
      cognitoResponse({ AuthenticationResult: { IdToken: 'id-2', ExpiresIn: 3600 } }),
    );

    await expect(refreshAdminSession(storedSession)).resolves.toMatchObject({
      refreshToken: 'refresh-1',
    });
  });

  it('fails when Cognito refuses the refresh token', async () => {
    fetchMock.mockResolvedValue(cognitoResponse({ __type: 'NotAuthorizedException' }, false));

    await expect(refreshAdminSession(storedSession)).rejects.toThrow(AdminAuthError);
  });

  it('fails without reaching Cognito when there is no refresh token', async () => {
    await expect(refreshAdminSession({ ...storedSession, refreshToken: null })).rejects.toThrow(
      AdminAuthError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells a live session from an expired one', () => {
    expect(isSessionValid(null)).toBe(false);
    expect(isSessionValid(storedSession)).toBe(false);
    expect(isSessionValid({ ...storedSession, expiresAt: Date.now() + 60_000 })).toBe(true);
  });
});
