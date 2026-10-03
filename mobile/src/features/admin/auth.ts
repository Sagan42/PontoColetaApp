import { config } from '../../services/config';

export interface AdminSession {
  idToken: string;
  expiresAt: number;
}

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

interface InitiateAuthResponse {
  AuthenticationResult?: { IdToken?: string; ExpiresIn?: number };
  ChallengeName?: string;
}

export async function signInAdmin(email: string, password: string): Promise<AdminSession> {
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
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.admin.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    });
  } catch {
    throw new AdminAuthError('Não foi possível conectar. Verifique sua internet.');
  }

  if (!response.ok) {
    throw new AdminAuthError('E-mail ou senha inválidos.');
  }

  const payload = (await response.json()) as InitiateAuthResponse;

  if (payload.ChallengeName) {
    throw new AdminAuthError(
      'Esta conta exige uma etapa adicional de login. Conclua no console da AWS e tente novamente.',
    );
  }

  const idToken = payload.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new AdminAuthError('Resposta de autenticação inválida.');
  }

  const expiresInSeconds = payload.AuthenticationResult?.ExpiresIn ?? 3600;
  return { idToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function isSessionValid(session: AdminSession | null): session is AdminSession {
  return session !== null && session.expiresAt > Date.now();
}
