import {
  composeAddress,
  composeOpeningHours,
  emptyCollectionPointForm,
  formatWeekdays,
  maskTime,
  onlyDigits,
  validateCollectionPointForm,
  type CollectionPointForm,
} from '../src/schemas/collectionPoint';

const validForm: CollectionPointForm = {
  name: 'Ecoponto Centro',
  street: 'Rua Pará',
  number: '500',
  neighborhood: 'Centro',
  materials: ['Pilhas'],
  weekdays: ['seg', 'ter', 'qua', 'qui', 'sex'],
  opensAt: '08:00',
  closesAt: '18:00',
  notes: '',
};

describe('validateCollectionPointForm', () => {
  it('accepts a complete form', () => {
    expect(validateCollectionPointForm(validForm)).toEqual({});
  });

  it('accepts a form without the optional fields', () => {
    expect(
      validateCollectionPointForm({
        ...validForm,
        weekdays: [],
        opensAt: '',
        closesAt: '',
        notes: '',
      }),
    ).toEqual({});
  });

  it('reports every required field of an empty form', () => {
    const errors = validateCollectionPointForm(emptyCollectionPointForm);

    expect(errors.name).toBeDefined();
    expect(errors.street).toBeDefined();
    expect(errors.number).toBeDefined();
    expect(errors.neighborhood).toBeDefined();
    expect(errors.materials).toBeDefined();
  });

  it('does not demand opening hours of an empty form', () => {
    const errors = validateCollectionPointForm(emptyCollectionPointForm);

    expect(errors.weekdays).toBeUndefined();
    expect(errors.opensAt).toBeUndefined();
    expect(errors.closesAt).toBeUndefined();
  });

  it('requires at least one material', () => {
    const errors = validateCollectionPointForm({ ...validForm, materials: [] });
    expect(errors.materials).toBe('Selecione ou digite ao menos um material.');
  });

  it('rejects a name that is too short', () => {
    const errors = validateCollectionPointForm({ ...validForm, name: 'ab' });
    expect(errors.name).toBe('Informe um nome com pelo menos 3 caracteres.');
  });

  it('accepts only digits in the address number', () => {
    const errors = validateCollectionPointForm({ ...validForm, number: '500A' });
    expect(errors.number).toBe('O número aceita apenas dígitos.');
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

  it('demands the weekdays once an hour is filled in', () => {
    const errors = validateCollectionPointForm({ ...validForm, weekdays: [] });
    expect(errors.weekdays).toBe('Selecione os dias de funcionamento.');
  });

  it('demands both hours once a weekday is marked', () => {
    const errors = validateCollectionPointForm({ ...validForm, opensAt: '', closesAt: '' });

    expect(errors.opensAt).toBe('Informe o horário de abertura.');
    expect(errors.closesAt).toBe('Informe o horário de fechamento.');
  });

  it('rejects an hour outside the 24h clock', () => {
    const errors = validateCollectionPointForm({ ...validForm, opensAt: '25:00' });
    expect(errors.opensAt).toBe('Use o formato 24h, como 08:00.');
  });

  it('rejects a closing time that is not after the opening one', () => {
    const errors = validateCollectionPointForm({ ...validForm, closesAt: '08:00' });
    expect(errors.closesAt).toBe('O fechamento deve ser depois da abertura.');
  });
});

describe('composeAddress', () => {
  it('builds the single line the API expects', () => {
    expect(composeAddress(validForm)).toBe('Rua Pará, 500 - Centro');
  });

  it('trims each part', () => {
    expect(
      composeAddress({ ...validForm, street: '  Rua Pará ', neighborhood: ' Centro  ' }),
    ).toBe('Rua Pará, 500 - Centro');
  });
});

describe('formatWeekdays', () => {
  it('is empty without a selection', () => {
    expect(formatWeekdays([])).toBe('');
  });

  it('keeps a single day as it is', () => {
    expect(formatWeekdays(['qua'])).toBe('Qua');
  });

  it('joins two adjacent days with "e"', () => {
    expect(formatWeekdays(['sab', 'dom'])).toBe('Sáb e Dom');
  });

  it('compresses a run of three or more days', () => {
    expect(formatWeekdays(['seg', 'ter', 'qua', 'qui', 'sex'])).toBe('Seg a Sex');
  });

  it('separates the blocks when the selection has a gap', () => {
    expect(formatWeekdays(['seg', 'ter', 'qua', 'qui', 'sex', 'dom'])).toBe('Seg a Sex e Dom');
  });

  it('ignores the order the days were marked in', () => {
    expect(formatWeekdays(['sex', 'seg'])).toBe('Seg e Sex');
  });
});

describe('composeOpeningHours', () => {
  it('builds the readable line', () => {
    expect(composeOpeningHours(validForm)).toBe('Seg a Sex, 08:00 às 18:00');
  });

  it('is absent when no day is marked', () => {
    expect(composeOpeningHours({ ...validForm, weekdays: [] })).toBeNull();
  });
});

describe('onlyDigits', () => {
  it('drops everything that is not a digit', () => {
    expect(onlyDigits('5a0-0 ')).toBe('500');
  });
});

describe('maskTime', () => {
  it('inserts the colon as the digits come in', () => {
    expect(maskTime('0')).toBe('0');
    expect(maskTime('08')).toBe('08');
    expect(maskTime('080')).toBe('08:0');
    expect(maskTime('0800')).toBe('08:00');
  });

  it('keeps an already masked value stable', () => {
    expect(maskTime('08:00')).toBe('08:00');
  });

  it('never grows past five characters', () => {
    expect(maskTime('0800123')).toBe('08:00');
  });

  it('survives a backspace in the middle', () => {
    expect(maskTime('08:0')).toBe('08:0');
  });
});
