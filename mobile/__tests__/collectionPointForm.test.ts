import {
  emptyCollectionPointForm,
  validateCollectionPointForm,
} from '../src/schemas/collectionPoint';

const validForm = {
  name: 'Ecoponto Centro',
  address: 'Rua Pará, 500',
  materials: ['Pilhas'],
  openingHours: 'Seg a Sex, 8h às 18h',
  notes: '',
};

describe('validateCollectionPointForm', () => {
  it('accepts a complete form', () => {
    expect(validateCollectionPointForm(validForm)).toEqual({});
  });

  it('accepts a form without the optional fields', () => {
    expect(validateCollectionPointForm({ ...validForm, openingHours: '', notes: '' })).toEqual({});
  });

  it('reports every required field of an empty form', () => {
    const errors = validateCollectionPointForm(emptyCollectionPointForm);

    expect(errors.name).toBeDefined();
    expect(errors.address).toBeDefined();
    expect(errors.materials).toBeDefined();
  });

  it('requires at least one material', () => {
    const errors = validateCollectionPointForm({ ...validForm, materials: [] });
    expect(errors.materials).toBe('Selecione ou digite ao menos um material.');
  });

  it('rejects a name that is too short', () => {
    const errors = validateCollectionPointForm({ ...validForm, name: 'ab' });
    expect(errors.name).toBe('Informe um nome com pelo menos 3 caracteres.');
  });

  it('rejects notes over the limit', () => {
    const errors = validateCollectionPointForm({ ...validForm, notes: 'a'.repeat(501) });
    expect(errors.notes).toBeDefined();
  });

  it('ignores surrounding whitespace', () => {
    expect(validateCollectionPointForm({ ...validForm, name: '   Ecoponto Centro   ' })).toEqual(
      {},
    );
  });

  it('reports only the first problem of each field', () => {
    const errors = validateCollectionPointForm({ ...validForm, name: '' });
    expect(Object.keys(errors)).toEqual(['name']);
  });
});
