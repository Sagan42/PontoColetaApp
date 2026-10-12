import { fireEvent } from '@testing-library/react-native';
import ResultsScreen from '../app/results';
import { collectionPointsApi, type CollectionPoint } from '../src/features/collection-points/api';
import { renderWithProviders } from './support/render';

// Stands in for a build without the native module: requiring it throws, exactly
// as it does on a device where the module was never linked. This overrides the
// working mock that jest.setup.js installs for every other suite.
jest.mock('react-native-maps', () => {
  throw new Error('react-native-maps: native module RNMapsAirModule is not available');
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ mode: 'material', query: 'Pilhas' }),
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

describe('Results without the maps native module', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(collectionPointsApi, 'searchByMaterial')
      .mockResolvedValue({ points: [point], origin: null, nextCursor: null });
  });

  it('mounts the screen and lists the results', async () => {
    const view = await renderWithProviders(<ResultsScreen />);

    expect(await view.findByText('Ecoponto Centro')).toBeVisible();
    expect(view.getByText('1 ponto encontrado')).toBeVisible();
  });

  it('explains that the map is unavailable instead of taking the screen down', async () => {
    const view = await renderWithProviders(<ResultsScreen />);
    await view.findByText('Ecoponto Centro');

    await fireEvent.press(view.getByTestId('view-mode-map'));

    expect(await view.findByText('Mapa indisponível')).toBeVisible();
    expect(
      view.getByText(
        'Não foi possível carregar o mapa neste dispositivo. Use a visualização em lista.',
      ),
    ).toBeVisible();
  });

  it('keeps the list reachable after the map view was opened', async () => {
    const view = await renderWithProviders(<ResultsScreen />);
    await view.findByText('Ecoponto Centro');

    await fireEvent.press(view.getByTestId('view-mode-map'));
    await view.findByText('Mapa indisponível');

    await fireEvent.press(view.getByTestId('view-mode-list'));

    expect(await view.findByText('Ecoponto Centro')).toBeVisible();
    expect(view.getByText('1 ponto encontrado')).toBeVisible();
    expect(view.queryByText('Mapa indisponível')).toBeNull();
  });
});
