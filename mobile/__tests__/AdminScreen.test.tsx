import { fireEvent } from '@testing-library/react-native';
import AdminScreen from '../app/admin';
import {
  AdminAuthError,
  refreshAdminSession,
  signInAdmin,
  type AdminSession,
} from '../src/features/admin/auth';
import type { UsageMetricsReport } from '../src/features/admin/hooks';
import { ApiError, apiRequest } from '../src/services/apiClient';
import { renderWithProviders } from './support/render';

jest.mock('../src/features/admin/auth', () => ({
  ...jest.requireActual('../src/features/admin/auth'),
  signInAdmin: jest.fn(),
  refreshAdminSession: jest.fn(),
}));

jest.mock('../src/services/apiClient', () => ({
  ...jest.requireActual('../src/services/apiClient'),
  apiRequest: jest.fn(),
}));

const signInAdminMock = signInAdmin as jest.MockedFunction<typeof signInAdmin>;
const refreshAdminSessionMock = refreshAdminSession as jest.MockedFunction<
  typeof refreshAdminSession
>;
const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

const report: UsageMetricsReport = {
  period: { from: '2026-09-12', to: '2026-10-12', days: 30 },
  totals: {
    app_open: 120,
    search_address: 31,
    search_material: 26,
    point_created: 9,
    point_viewed: 44,
    searches: 57,
  },
  daily: [
    {
      date: '2026-10-12',
      counters: {
        app_open: 10,
        search_address: 3,
        search_material: 2,
        point_created: 1,
        point_viewed: 4,
      },
    },
  ],
};

function session(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    idToken: 'id-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    ...overrides,
  };
}

const expired = () => session({ idToken: 'id-expired', expiresAt: Date.now() - 1_000 });
const renewed = () => session({ idToken: 'id-renewed' });

async function renderAndSignIn() {
  const view = await renderWithProviders(<AdminScreen />);

  await fireEvent.changeText(view.getByTestId('input-admin-email'), 'admin@pontocoleta.app');
  await fireEvent.changeText(view.getByTestId('input-admin-password'), 'senha-super-secreta');
  await fireEvent.press(view.getByTestId('button-admin-signin'));

  return view;
}

describe('Admin session', () => {
  beforeEach(() => {
    signInAdminMock.mockReset();
    refreshAdminSessionMock.mockReset();
    apiRequestMock.mockReset();
  });

  it('shows the panel on a valid session without renewing it', async () => {
    signInAdminMock.mockResolvedValue(session());
    apiRequestMock.mockResolvedValue({ data: report });

    const view = await renderAndSignIn();

    expect(await view.findByLabelText('Acessos: 120')).toBeVisible();
    expect(refreshAdminSessionMock).not.toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/v1/admin/metrics',
      expect.objectContaining({ token: 'id-1' }),
    );
  });

  it('renews an expired session and shows the panel with the new token', async () => {
    signInAdminMock.mockResolvedValue(expired());
    refreshAdminSessionMock.mockResolvedValue(renewed());
    apiRequestMock.mockResolvedValue({ data: report });

    const view = await renderAndSignIn();

    expect(await view.findByLabelText('Acessos: 120')).toBeVisible();
    expect(refreshAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/v1/admin/metrics',
      expect.objectContaining({ token: 'id-renewed' }),
    );
    expect(view.queryByText('Sua sessão expirou. Entre novamente.')).toBeNull();
  });

  it('returns to the login with the expiry notice when the renewal fails', async () => {
    signInAdminMock.mockResolvedValue(expired());
    refreshAdminSessionMock.mockRejectedValue(
      new AdminAuthError('Não foi possível renovar a sessão.'),
    );

    const view = await renderAndSignIn();

    expect(await view.findByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
    expect(view.getByTestId('input-admin-email')).toBeVisible();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('renews on a 401 instead of showing the generic metrics failure', async () => {
    signInAdminMock.mockResolvedValue(session());
    refreshAdminSessionMock.mockResolvedValue(renewed());
    apiRequestMock
      .mockRejectedValueOnce(new ApiError('UNAUTHORIZED', 'Token inválido.', 401))
      .mockResolvedValueOnce({ data: report });

    const view = await renderAndSignIn();

    expect(await view.findByLabelText('Acessos: 120')).toBeVisible();
    expect(refreshAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Não foi possível carregar as métricas')).toBeNull();
  });

  it('stops after one renewal when the renewed token is refused as well', async () => {
    signInAdminMock.mockResolvedValue(session());
    refreshAdminSessionMock.mockResolvedValue(renewed());
    apiRequestMock.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Token inválido.', 401));

    const view = await renderAndSignIn();

    expect(await view.findByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
    expect(refreshAdminSessionMock).toHaveBeenCalledTimes(1);
  });

  it('still reports a non-401 failure on the panel', async () => {
    signInAdminMock.mockResolvedValue(session());
    apiRequestMock.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Falha interna.', 500));

    const view = await renderAndSignIn();

    expect(await view.findByText('Não foi possível carregar as métricas')).toBeVisible();
    expect(refreshAdminSessionMock).not.toHaveBeenCalled();
  });
});

const feedbackEntry = {
  id: 'feedback-1',
  author: 'Pedro',
  message: 'Faltou um ponto no Cafezal.',
  submittedAt: '2026-10-19T15:30:00.000Z',
};

/** Responde por caminho: o painel consulta métricas e feedback em rotas distintas. */
function answerByPath(feedback: unknown[] = [], nextCursor: string | null = null) {
  apiRequestMock.mockImplementation((path: string) => {
    if (path === '/v1/admin/metrics') return Promise.resolve({ data: report }) as never;
    if (path === '/v1/admin/feedback') {
      return Promise.resolve({ data: feedback, meta: { nextCursor } }) as never;
    }
    return Promise.reject(new Error(`caminho inesperado: ${path}`)) as never;
  });
}

describe('Admin feedback', () => {
  beforeEach(() => {
    signInAdminMock.mockReset();
    refreshAdminSessionMock.mockReset();
    apiRequestMock.mockReset();
  });

  it('does not read feedback while the metrics section is open', async () => {
    signInAdminMock.mockResolvedValue(session());
    answerByPath([feedbackEntry]);

    const view = await renderAndSignIn();
    await view.findByLabelText('Acessos: 120');

    expect(apiRequestMock).not.toHaveBeenCalledWith('/v1/admin/feedback', expect.anything());
  });

  it('shows the feedback with its author and instant, using the session token', async () => {
    signInAdminMock.mockResolvedValue(session());
    answerByPath([feedbackEntry]);

    const view = await renderAndSignIn();
    await view.findByLabelText('Acessos: 120');

    await fireEvent.press(view.getByTestId('admin-section-feedback'));

    expect(await view.findByText('Faltou um ponto no Cafezal.')).toBeVisible();
    expect(view.getByText('Pedro')).toBeVisible();
    expect(view.getByText('19/10/2026 às 12:30')).toBeVisible();
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/v1/admin/feedback',
      expect.objectContaining({ token: 'id-1' }),
    );
  });

  it('says so when nobody has written yet', async () => {
    signInAdminMock.mockResolvedValue(session());
    answerByPath([]);

    const view = await renderAndSignIn();
    await view.findByLabelText('Acessos: 120');

    await fireEvent.press(view.getByTestId('admin-section-feedback'));

    expect(await view.findByText('Nenhum feedback ainda')).toBeVisible();
  });

  it('offers more only when there is another page', async () => {
    signInAdminMock.mockResolvedValue(session());
    answerByPath([feedbackEntry], 'cursor-2');

    const view = await renderAndSignIn();
    await view.findByLabelText('Acessos: 120');

    await fireEvent.press(view.getByTestId('admin-section-feedback'));

    expect(await view.findByTestId('button-load-more-feedback')).toBeVisible();
  });

  it('renews the session on a 401 from the feedback route', async () => {
    signInAdminMock.mockResolvedValue(session());
    refreshAdminSessionMock.mockResolvedValue(renewed());
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/v1/admin/metrics') return Promise.resolve({ data: report }) as never;
      return Promise.reject(new ApiError('UNAUTHORIZED', 'Token inválido.', 401)) as never;
    });

    const view = await renderAndSignIn();
    await view.findByLabelText('Acessos: 120');

    await fireEvent.press(view.getByTestId('admin-section-feedback'));

    expect(await view.findByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
    expect(refreshAdminSessionMock).toHaveBeenCalledTimes(1);
  });
});
