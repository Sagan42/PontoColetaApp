import { fireEvent } from '@testing-library/react-native';
import HomeScreen from '../app/index';
import { renderWithProviders } from './support/render';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

describe('Home', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('presents the product and the city', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    expect(view.getByText('PontoColeta')).toBeVisible();
    expect(view.getByText('Londrina')).toBeVisible();
  });

  it('offers seeing everything without typing anything first', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    expect(view.getByTestId('tile-map')).toBeVisible();
    expect(view.getByTestId('tile-list')).toBeVisible();
    expect(view.getByText('Ver mapa')).toBeVisible();
    expect(view.getByText('Listar pontos')).toBeVisible();
  });

  it('opens every point on the map', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('tile-map'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/results',
      params: { mode: 'all', view: 'map' },
    });
  });

  it('opens every point as a list', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('tile-list'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/results',
      params: { mode: 'all', view: 'list' },
    });
  });

  it('sends the filtered search to its own screen', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('button-open-search'));

    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('offers the contribution entry point', async () => {
    const view = await renderWithProviders(<HomeScreen />);
    expect(view.getByTestId('button-new-point')).toBeVisible();
  });

  it('opens the contribution form', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('button-new-point'));

    expect(mockPush).toHaveBeenCalledWith('/new-point');
  });

  it('keeps the administrative area reachable', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Área administrativa'));

    expect(mockPush).toHaveBeenCalledWith('/admin');
  });
});
