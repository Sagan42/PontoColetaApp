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

  it('presents the product, the city and both ways of searching', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    expect(view.getByText('PontoColeta')).toBeVisible();
    expect(view.getByText('Londrina')).toBeVisible();
    expect(view.getByText('Digite seu endereço')).toBeVisible();
    expect(view.getByText('ou')).toBeVisible();
    expect(view.getByText('Digite o material para descarte')).toBeVisible();
  });

  it('offers the contribution entry point', async () => {
    const view = await renderWithProviders(<HomeScreen />);
    expect(view.getByTestId('button-new-point')).toBeVisible();
  });

  it('navigates to the results with the address search', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.changeText(view.getByTestId('input-address'), 'Rua Pará, 500');
    await fireEvent.press(view.getByTestId('button-search-address'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/results',
      params: { mode: 'address', query: 'Rua Pará, 500' },
    });
  });

  it('navigates to the results with the material search', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.changeText(view.getByTestId('input-material'), 'Pilhas');
    await fireEvent.press(view.getByTestId('button-search-material'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/results',
      params: { mode: 'material', query: 'Pilhas' },
    });
  });

  it('does not search with an empty address and explains why', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('button-search-address'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByText('Digite um endereço para buscar.')).toBeVisible();
  });

  it('does not search with an empty material', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('button-search-material'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByText('Digite um material para buscar.')).toBeVisible();
  });

  it('opens the contribution form', async () => {
    const view = await renderWithProviders(<HomeScreen />);

    await fireEvent.press(view.getByTestId('button-new-point'));

    expect(mockPush).toHaveBeenCalledWith('/new-point');
  });
});
