import { fireEvent, waitFor } from '@testing-library/react-native';
import FeedbackScreen from '../app/feedback';
import { feedbackApi } from '../src/features/feedback/hooks';
import { ApiError } from '../src/services/apiClient';
import { renderWithProviders } from './support/render';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));

const receipt = { id: 'feedback-1', submittedAt: '2026-10-19T15:30:00.000Z' };

describe('Feedback', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('offers a name and a message, and says the name is optional', async () => {
    const view = await renderWithProviders(<FeedbackScreen />);

    expect(view.getByTestId('input-feedback-name')).toBeVisible();
    expect(view.getByTestId('input-feedback-message')).toBeVisible();
    expect(view.getByText('Opcional. Em branco, o feedback fica como anônimo.')).toBeVisible();
  });

  it('does not send an empty message', async () => {
    const submit = jest.spyOn(feedbackApi, 'submit');

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.press(view.getByTestId('button-submit-feedback'));

    expect(
      await view.findByText('Escreva uma mensagem com pelo menos 3 caracteres.'),
    ).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it('clears the error as soon as the message is written', async () => {
    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.press(view.getByTestId('button-submit-feedback'));
    await view.findByText('Escreva uma mensagem com pelo menos 3 caracteres.');

    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Muito bom.');

    expect(view.queryByText('Escreva uma mensagem com pelo menos 3 caracteres.')).toBeNull();
  });

  it('sends the feedback with the name that was given', async () => {
    const submit = jest.spyOn(feedbackApi, 'submit').mockResolvedValue(receipt);

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.changeText(view.getByTestId('input-feedback-name'), 'Pedro');
    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Faltou meu bairro.');
    await fireEvent.press(view.getByTestId('button-submit-feedback'));

    expect(await view.findByText('Feedback enviado')).toBeVisible();
    expect(submit).toHaveBeenCalledWith({ name: 'Pedro', message: 'Faltou meu bairro.' });
  });

  it('sends the feedback without a name', async () => {
    const submit = jest.spyOn(feedbackApi, 'submit').mockResolvedValue(receipt);

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Muito útil.');
    await fireEvent.press(view.getByTestId('button-submit-feedback'));

    await view.findByText('Feedback enviado');
    expect(submit).toHaveBeenCalledWith({ name: '', message: 'Muito útil.' });
  });

  it('never sends the same feedback twice', async () => {
    let resolveSubmit: ((value: typeof receipt) => void) | undefined;
    const submit = jest.spyOn(feedbackApi, 'submit').mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Muito útil.');

    const button = view.getByTestId('button-submit-feedback');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    resolveSubmit?.(receipt);
    expect(await view.findByText('Feedback enviado')).toBeVisible();
  });

  it('explains the rate limit instead of blaming the person', async () => {
    jest
      .spyOn(feedbackApi, 'submit')
      .mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 'Too Many Requests', 429));

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Muito útil.');
    await fireEvent.press(view.getByTestId('button-submit-feedback'));

    expect(
      await view.findByText('Muitos envios em sequência. Tente de novo em instantes.'),
    ).toBeVisible();
  });

  it('lets the person go back home after sending', async () => {
    jest.spyOn(feedbackApi, 'submit').mockResolvedValue(receipt);

    const view = await renderWithProviders(<FeedbackScreen />);
    await fireEvent.changeText(view.getByTestId('input-feedback-message'), 'Muito útil.');
    await fireEvent.press(view.getByTestId('button-submit-feedback'));

    await fireEvent.press(await view.findByText('Voltar ao início'));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
