import { describe, expect, it } from 'vitest';
import { ANONYMOUS_AUTHOR, Feedback } from '../../src/modules/feedback/domain/feedback.js';
import { ValidationError } from '../../src/shared/domain/errors/index.js';

const submittedAt = new Date('2026-10-19T15:30:00.000Z');

function create(overrides: { author?: string | null; message?: string } = {}) {
  return Feedback.create({
    id: 'feedback-1',
    author: overrides.author,
    message: overrides.message ?? 'O app ajudou a achar onde descartar pilhas.',
    submittedAt,
  });
}

describe('Feedback', () => {
  it('keeps the author that was given', () => {
    expect(create({ author: 'Pedro' }).author).toBe('Pedro');
  });

  it('falls back to anonymous without an author', () => {
    expect(create().author).toBe(ANONYMOUS_AUTHOR);
    expect(create({ author: null }).author).toBe(ANONYMOUS_AUTHOR);
    expect(create({ author: '   ' }).author).toBe(ANONYMOUS_AUTHOR);
  });

  it('records the instant it was submitted', () => {
    expect(create().submittedAt).toEqual(submittedAt);
  });

  it('rejects a message that says nothing', () => {
    expect(() => create({ message: 'ok' })).toThrow(ValidationError);
    expect(() => create({ message: '   ' })).toThrow(ValidationError);
  });

  it('rejects a message over the limit', () => {
    expect(() => create({ message: 'a'.repeat(1001) })).toThrow(ValidationError);
  });

  it('rejects an author over the limit', () => {
    expect(() => create({ author: 'a'.repeat(61) })).toThrow(ValidationError);
  });

  it('keeps the author on a single line', () => {
    expect(create({ author: ' Maria\n  Silva ' }).author).toBe('Maria Silva');
  });

  it('preserves paragraphs but collapses the excess', () => {
    const feedback = create({ message: 'Primeira.\n\n\n\n   Segunda.   \n Terceira.' });
    expect(feedback.message).toBe('Primeira.\n\nSegunda.\nTerceira.');
  });

  it('strips control, zero-width and direction-override characters', () => {
    const feedback = create({ message: 'Oi\u0000​‮tudo\u0007 bem­' });
    expect(feedback.message).toBe('Oitudo bem');
  });

  it('measures the limit after sanitising, not before', () => {
    // Mil caracteres de verdade mais mil invisíveis: o que conta é o que sobra.
    const message = `${'a'.repeat(1000)}${'​'.repeat(1000)}`;
    expect(create({ message }).message).toHaveLength(1000);
  });

  it('counts an invisible-only message as empty', () => {
    expect(() => create({ message: '​​​​' })).toThrow(ValidationError);
  });

  it('does not touch the words someone wrote', () => {
    const message = 'Faltou o ponto da Rua Pará, 500 <b>obrigado</b> & parabéns!';
    expect(create({ message }).message).toBe(message);
  });
});
