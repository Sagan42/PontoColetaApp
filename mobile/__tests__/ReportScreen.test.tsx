import { fireEvent, waitFor } from '@testing-library/react-native';
import ReportCollectionPointScreen from '../app/report/[id]';
import { collectionPointsApi } from '../src/features/collection-points/api';
import { ApiError } from '../src/services/apiClient';
import { renderWithProviders } from './support/render';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'point-1', name: 'Ecoponto Centro' }),
}));

describe('Report a collection point', () => {
  beforeEach(() => {
    mockBack.mockClear();
    jest.restoreAllMocks();
  });

  it('says the report is anonymous and names the point', async () => {
    const view = await renderWithProviders(<ReportCollectionPointScreen />);

    expect(
      view.getByText('Conte o que há de errado com "Ecoponto Centro". A denúncia é anônima.'),
    ).toBeVisible();
  });

  it('offers a reason for objectionable content', async () => {
    const view = await renderWithProviders(<ReportCollectionPointScreen />);

    expect(view.getByTestId('reason-inappropriate')).toBeVisible();
    expect(view.getByText('Conteúdo impróprio ou ofensivo')).toBeVisible();
  });

  it('does not send without a reason', async () => {
    const report = jest.spyOn(collectionPointsApi, 'report');

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('button-submit-report'));

    expect(await view.findByText('Escolha um motivo para a denúncia.')).toBeVisible();
    expect(report).not.toHaveBeenCalled();
  });

  it('sends the chosen reason without details', async () => {
    const report = jest.spyOn(collectionPointsApi, 'report').mockResolvedValue(undefined);

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-inappropriate'));
    await fireEvent.press(view.getByTestId('button-submit-report'));

    expect(await view.findByText('Denúncia enviada')).toBeVisible();
    expect(report).toHaveBeenCalledWith({
      pointId: 'point-1',
      reason: 'inappropriate',
      details: '',
    });
  });

  it('sends the details when they are written', async () => {
    const report = jest.spyOn(collectionPointsApi, 'report').mockResolvedValue(undefined);

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-closed'));
    await fireEvent.changeText(view.getByTestId('input-report-details'), 'Fechou em janeiro.');
    await fireEvent.press(view.getByTestId('button-submit-report'));

    await view.findByText('Denúncia enviada');
    expect(report).toHaveBeenCalledWith({
      pointId: 'point-1',
      reason: 'closed',
      details: 'Fechou em janeiro.',
    });
  });

  it('keeps only the last reason chosen', async () => {
    const report = jest.spyOn(collectionPointsApi, 'report').mockResolvedValue(undefined);

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-incorrect'));
    await fireEvent.press(view.getByTestId('reason-duplicate'));
    await fireEvent.press(view.getByTestId('button-submit-report'));

    await view.findByText('Denúncia enviada');
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ reason: 'duplicate' }));
  });

  it('never sends the same report twice', async () => {
    let resolveReport: (() => void) | undefined;
    const report = jest.spyOn(collectionPointsApi, 'report').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReport = resolve;
      }),
    );

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-other'));

    const button = view.getByTestId('button-submit-report');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);

    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));

    resolveReport?.();
    expect(await view.findByText('Denúncia enviada')).toBeVisible();
  });

  it('explains a point that no longer exists', async () => {
    jest
      .spyOn(collectionPointsApi, 'report')
      .mockRejectedValue(new ApiError('NOT_FOUND', 'Ponto de coleta não encontrado.', 404));

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-incorrect'));
    await fireEvent.press(view.getByTestId('button-submit-report'));

    expect(await view.findByText('Esse ponto não está mais disponível.')).toBeVisible();
  });

  it('explains the rate limit instead of blaming the person', async () => {
    jest
      .spyOn(collectionPointsApi, 'report')
      .mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'Too Many Requests', 429));

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-incorrect'));
    await fireEvent.press(view.getByTestId('button-submit-report'));

    expect(
      await view.findByText('Muitos envios em sequência. Tente de novo em instantes.'),
    ).toBeVisible();
  });

  it('goes back after sending', async () => {
    jest.spyOn(collectionPointsApi, 'report').mockResolvedValue(undefined);

    const view = await renderWithProviders(<ReportCollectionPointScreen />);
    await fireEvent.press(view.getByTestId('reason-incorrect'));
    await fireEvent.press(view.getByTestId('button-submit-report'));

    await fireEvent.press(await view.findByText('Voltar'));

    expect(mockBack).toHaveBeenCalled();
  });
});
