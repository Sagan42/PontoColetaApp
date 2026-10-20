import { fireEvent } from '@testing-library/react-native';
import { FeedbackFab } from '../src/features/feedback/components/FeedbackFab';
import { renderWithProviders } from './support/render';

const mockPush = jest.fn();
let mockPathname = '/';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => mockPathname,
}));

describe('Feedback floating button', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPathname = '/';
  });

  it('shows the leaf label on an ordinary screen', async () => {
    const view = await renderWithProviders(<FeedbackFab />);

    expect(view.getByTestId('button-feedback')).toBeVisible();
    expect(view.getByText('Deixe seu feedback')).toBeVisible();
  });

  it('opens the feedback screen', async () => {
    const view = await renderWithProviders(<FeedbackFab />);

    await fireEvent.press(view.getByTestId('button-feedback'));

    expect(mockPush).toHaveBeenCalledWith('/feedback');
  });

  it('stays out of the way on the feedback screen itself', async () => {
    mockPathname = '/feedback';

    const view = await renderWithProviders(<FeedbackFab />);

    expect(view.queryByTestId('button-feedback')).toBeNull();
  });
});
