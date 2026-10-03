import { fireEvent, waitFor } from '@testing-library/react-native';
import NewCollectionPointScreen from '../app/new-point';
import { collectionPointsApi, type CollectionPoint } from '../src/features/collection-points/api';
import { ApiError } from '../src/services/apiClient';
import { renderWithProviders } from './support/render';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

const created: CollectionPoint = {
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
  openingHours: null,
  notes: null,
  status: 'PUBLISHED',
  distanceKm: null,
  createdAt: '2026-08-22T12:00:00.000Z',
  updatedAt: '2026-08-22T12:00:00.000Z',
};

type View = Awaited<ReturnType<typeof renderWithProviders>>;

async function fillValidForm(view: View) {
  await fireEvent.changeText(view.getByTestId('input-name'), 'Ecoponto Centro');
  await fireEvent.changeText(view.getByTestId('input-point-address'), 'Rua Pará, 500');
  await fireEvent.changeText(view.getByTestId('input-custom-material'), 'Pilhas');
  await fireEvent.press(view.getByTestId('button-add-material'));
}

describe('New collection point', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
    jest.spyOn(collectionPointsApi, 'listSuggestedMaterials').mockResolvedValue(['Pilhas', 'Óleo']);
  });

  it('does not submit an empty form and shows what is missing', async () => {
    const create = jest.spyOn(collectionPointsApi, 'create');

    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('button-submit-point'));

    expect(await view.findByText('Informe um nome com pelo menos 3 caracteres.')).toBeVisible();
    expect(view.getByText('Informe o endereço completo.')).toBeVisible();
    expect(view.getByText('Selecione ou digite ao menos um material.')).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });

  it('clears the error of a field as soon as it is corrected', async () => {
    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('button-submit-point'));
    await view.findByText('Informe um nome com pelo menos 3 caracteres.');

    await fireEvent.changeText(view.getByTestId('input-name'), 'Ecoponto Centro');

    expect(view.queryByText('Informe um nome com pelo menos 3 caracteres.')).toBeNull();
  });

  it('lets a material be picked from the suggestions', async () => {
    const view = await renderWithProviders(<NewCollectionPointScreen />);

    const chip = await view.findByTestId('material-Pilhas');
    await fireEvent.press(chip);

    expect(view.getByTestId('material-Pilhas')).toBeChecked();
  });

  it('sends the contribution and confirms it', async () => {
    const create = jest.spyOn(collectionPointsApi, 'create').mockResolvedValue(created);

    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fillValidForm(view);
    await fireEvent.press(view.getByTestId('button-submit-point'));

    expect(await view.findByText('Ponto cadastrado com sucesso')).toBeVisible();
    expect(create).toHaveBeenCalledWith({
      name: 'Ecoponto Centro',
      address: 'Rua Pará, 500',
      materials: ['Pilhas'],
      openingHours: null,
      notes: null,
    });
  });

  it('lets the person open the point that was just created', async () => {
    jest.spyOn(collectionPointsApi, 'create').mockResolvedValue(created);

    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fillValidForm(view);
    await fireEvent.press(view.getByTestId('button-submit-point'));

    await fireEvent.press(await view.findByText('Ver o ponto cadastrado'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/point/[id]',
      params: { id: 'point-1' },
    });
  });

  it('never sends the same contribution twice', async () => {
    let resolveCreate: ((point: CollectionPoint) => void) | undefined;
    const create = jest.spyOn(collectionPointsApi, 'create').mockReturnValue(
      new Promise<CollectionPoint>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fillValidForm(view);

    const submit = view.getByTestId('button-submit-point');
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    await fireEvent.press(submit);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    resolveCreate?.(created);
    expect(await view.findByText('Ponto cadastrado com sucesso')).toBeVisible();
  });

  it('explains a duplicated point returned by the backend', async () => {
    jest
      .spyOn(collectionPointsApi, 'create')
      .mockRejectedValue(new ApiError('CONFLICT', 'Esse ponto de coleta já está cadastrado.', 409));

    const view = await renderWithProviders(<NewCollectionPointScreen />);
    await fillValidForm(view);
    await fireEvent.press(view.getByTestId('button-submit-point'));

    expect(await view.findByText('Esse ponto de coleta já está cadastrado.')).toBeVisible();
  });
});
