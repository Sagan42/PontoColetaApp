import { fireEvent, waitFor } from '@testing-library/react-native';
import ResultsScreen from '../app/results';
import { collectionPointsApi, type CollectionPoint } from '../src/features/collection-points/api';
import { ApiError } from '../src/services/apiClient';
import { renderWithProviders } from './support/render';

const mockPush = jest.fn();
let mockParams: Record<string, string> = { mode: 'material', query: 'Pilhas' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const point: CollectionPoint = {
  id: 'point-1',
  name: 'Ecoponto Centro',
  address: {
    line: 'Rua Pará, 500',
    city: 'Londrina',
    state: 'PR',
    formatted: 'Rua Pará, 500, Londrina, PR',
  },
  location: { latitude: -23.3103, longitude: -51.1628 },
  materials: [{ label: 'Pilhas', slug: 'pilhas' }],
  openingHours: 'Seg a Sex, 8h às 18h',
  notes: null,
  status: 'PUBLISHED',
  distanceKm: 1.2,
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

describe('Results', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.restoreAllMocks();
    mockParams = { mode: 'material', query: 'Pilhas' };
  });

  it('shows a loading state while the search runs', async () => {
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockReturnValue(new Promise(() => undefined));

    const view = await renderWithProviders(<ResultsScreen />);

    expect(view.getByText('Buscando pontos de coleta...')).toBeVisible();
  });

  it('lists the results with name, address, materials and distance', async () => {
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockResolvedValue({ points: [point], origin: null });

    const view = await renderWithProviders(<ResultsScreen />);

    expect(await view.findByText('Ecoponto Centro')).toBeVisible();
    expect(view.getByText('Rua Pará, 500, Londrina, PR')).toBeVisible();
    expect(view.getAllByText('Pilhas')).toHaveLength(2);
    expect(view.getByText('1,2 km')).toBeVisible();
    expect(view.getByText('1 ponto encontrado')).toBeVisible();
  });

  it('opens the details of a result', async () => {
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockResolvedValue({ points: [point], origin: null });

    const view = await renderWithProviders(<ResultsScreen />);

    await fireEvent.press(await view.findByTestId('result-point-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/point/[id]',
      params: { id: 'point-1' },
    });
  });

  it('switches between list and map over the same results', async () => {
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockResolvedValue({ points: [point], origin: null });

    const view = await renderWithProviders(<ResultsScreen />);
    await view.findByText('Ecoponto Centro');

    await fireEvent.press(view.getByTestId('view-mode-map'));
    await waitFor(() => expect(view.queryByText('1 ponto encontrado')).toBeNull());
    // The map itself, not the "unavailable" fallback: the lazy require resolved.
    expect(view.getByLabelText('Mapa com 1 ponto(s) de coleta')).toBeVisible();
    expect(view.queryByText('Mapa indisponível')).toBeNull();

    await fireEvent.press(view.getByTestId('view-mode-list'));
    expect(await view.findByText('1 ponto encontrado')).toBeVisible();
  });

  it('shows an empty state that invites a contribution', async () => {
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockResolvedValue({ points: [], origin: null });

    const view = await renderWithProviders(<ResultsScreen />);

    expect(await view.findByText('Nenhum ponto encontrado')).toBeVisible();

    await fireEvent.press(view.getByText('Cadastrar novo ponto'));
    expect(mockPush).toHaveBeenCalledWith('/new-point');
  });

  it('explains an address that could not be located', async () => {
    mockParams = { mode: 'address', query: 'Rua Inexistente' };
    jest
      .spyOn(collectionPointsApi, 'searchByAddress')
      .mockRejectedValue(
        new ApiError('ADDRESS_NOT_FOUND', 'Não foi possível localizar esse endereço.', 404),
      );

    const view = await renderWithProviders(<ResultsScreen />);

    expect(await view.findByText('Endereço não encontrado')).toBeVisible();
  });

  it('shows the failure and lets the person try again', async () => {
    const search = jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'Requisição inválida.', 400))
      .mockResolvedValueOnce({ points: [point], origin: null });

    const view = await renderWithProviders(<ResultsScreen />);

    expect(await view.findByText('Algo deu errado')).toBeVisible();
    expect(search).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByText('Tentar novamente'));

    expect(await view.findByText('Ecoponto Centro')).toBeVisible();
    expect(search).toHaveBeenCalledTimes(2);
  });
});
