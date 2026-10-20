import { emptyFeedbackForm, validateFeedbackForm } from '../src/schemas/feedback';

describe('validateFeedbackForm', () => {
  it('accepts a message without a name', () => {
    expect(validateFeedbackForm({ name: '', message: 'Muito útil.' })).toEqual({});
  });

  it('accepts a message with a name', () => {
    expect(validateFeedbackForm({ name: 'Pedro', message: 'Muito útil.' })).toEqual({});
  });

  it('requires a message', () => {
    const errors = validateFeedbackForm(emptyFeedbackForm);

    expect(errors.message).toBe('Escreva uma mensagem com pelo menos 3 caracteres.');
    expect(errors.name).toBeUndefined();
  });

  it('does not accept whitespace as a message', () => {
    expect(validateFeedbackForm({ name: '', message: '    ' }).message).toBeDefined();
  });

  it('rejects a name over the limit', () => {
    const errors = validateFeedbackForm({ name: 'a'.repeat(61), message: 'Muito útil.' });
    expect(errors.name).toBe('Nome deve ter no máximo 60 caracteres.');
  });

  it('rejects a message over the limit', () => {
    const errors = validateFeedbackForm({ name: '', message: 'a'.repeat(1001) });
    expect(errors.message).toBe('Mensagem deve ter no máximo 1000 caracteres.');
  });
});
