import { config } from '../../services/config';

export interface AdminSession {
  idToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

interface InitiateAuthResponse {
  AuthenticationResult?: { IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
  ChallengeName?: string;
}

type AuthFlow = 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH';

async function initiateAuth(
  authFlow: AuthFlow,
  authParameters: Record<string, string>,
  rejectedMessage: string,
): Promise<InitiateAuthResponse> {
  if (config.admin.clientId.length === 0) {
    throw new AdminAuthError(
      'Acesso administrativo não configurado nesta build. Defina EXPO_PUBLIC_COGNITO_CLIENT_ID.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://cognito-idp.${config.admin.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: authFlow,
        ClientId: config.admin.clientId,
        AuthParameters: authParameters,
      }),
    });
  } catch {
    throw new AdminAuthError('Não foi possível conectar. Verifique sua internet.');
  }

  if (!response.ok) {
    throw new AdminAuthError(rejectedMessage);
  }

  return (await response.json()) as InitiateAuthResponse;
}

function toSession(payload: InitiateAuthResponse, currentRefreshToken: string | null): AdminSession {
  const idToken = payload.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new AdminAuthError('Resposta de autenticação inválida.');
  }

  const expiresInSeconds = payload.AuthenticationResult?.ExpiresIn ?? 3600;

  return {
    idToken,
    // REFRESH_TOKEN_AUTH does not return a new refresh token; keep the one we hold.
    refreshToken: payload.AuthenticationResult?.RefreshToken ?? currentRefreshToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

export async function signInAdmin(email: string, password: string): Promise<AdminSession> {
  const payload = await initiateAuth(
    'USER_PASSWORD_AUTH',
    { USERNAME: email, PASSWORD: password },
    'E-mail ou senha inválidos.',
  );

  if (payload.ChallengeName) {
    throw new AdminAuthError(
      'Esta conta exige uma etapa adicional de login. Conclua no console da AWS e tente novamente.',
    );
  }

  return toSession(payload, null);
}

export async function refreshAdminSession(session: AdminSession): Promise<AdminSession> {
  if (!session.refreshToken) {
    throw new AdminAuthError('Esta sessão não pode ser renovada.');
  }

  const payload = await initiateAuth(
    'REFRESH_TOKEN_AUTH',
    { REFRESH_TOKEN: session.refreshToken },
    'Não foi possível renovar a sessão.',
  );

  return toSession(payload, session.refreshToken);
}

export function isSessionValid(session: AdminSession | null): session is AdminSession {
  return session !== null && session.expiresAt > Date.now();
}
