import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/shared/domain/errors/index.js';
import { Address } from '../../src/modules/collection-points/domain/value-objects/address.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import { Material } from '../../src/modules/collection-points/domain/value-objects/material.js';
import { Notes } from '../../src/modules/collection-points/domain/value-objects/notes.js';
import { OpeningHours } from '../../src/modules/collection-points/domain/value-objects/opening-hours.js';
import {
  SERVICE_AREA,
  isWithinServiceArea,
} from '../../src/modules/collection-points/domain/service-area.js';

describe('Coordinates', () => {
  it('rounds to six decimal places', () => {
    const coordinates = Coordinates.create(-23.31034567, -51.16281234);
    expect(coordinates.latitude).toBe(-23.310346);
    expect(coordinates.longitude).toBe(-51.162812);
  });

  it.each([
    [-91, 0],
    [91, 0],
    [0, 181],
    [0, -181],
    [Number.NaN, 0],
  ])('rejects out-of-range values (%s, %s)', (latitude, longitude) => {
    expect(() => Coordinates.create(latitude, longitude)).toThrow(ValidationError);
  });

  it('compares by value', () => {
    expect(Coordinates.create(-23.31, -51.16).equals(Coordinates.create(-23.31, -51.16))).toBe(
      true,
    );
  });
});

describe('Material', () => {
  it.each([
    ['Baterias', 'baterias'],
    ['Óleo de cozinha', 'oleo-de-cozinha'],
    ['  LÂMPADAS  ', 'lampadas'],
    ['Eletrônicos', 'eletronicos'],
    ['Pilhas/Baterias', 'pilhas-baterias'],
  ])('normalises %s into %s', (label, slug) => {
    expect(Material.create(label).slug).toBe(slug);
  });

  it('keeps the label as typed, only collapsing whitespace', () => {
    expect(Material.create('  Óleo   de cozinha ').label).toBe('Óleo de cozinha');
  });

  it('rejects labels that normalise to nothing', () => {
    expect(() => Material.create('!!!')).toThrow(ValidationError);
  });

  it('rejects labels that are too short', () => {
    expect(() => Material.create('a')).toThrow(ValidationError);
  });

  it('exposes slug conversion without instantiating', () => {
    expect(Material.toSlug('Óleo de Cozinha')).toBe('oleo-de-cozinha');
  });
});

describe('Address', () => {
  it('appends the city when the line does not mention it', () => {
    expect(Address.create('Rua Pará, 500').formatted).toBe('Rua Pará, 500, Londrina, PR');
  });

  it('does not duplicate the city when already present', () => {
    expect(Address.create('Rua Pará, 500, Londrina').formatted).toBe('Rua Pará, 500, Londrina');
  });

  it('rejects lines that are too short', () => {
    expect(() => Address.create('Rua')).toThrow(ValidationError);
  });
});

describe('OpeningHours and Notes', () => {
  it('treats empty values as not informed', () => {
    expect(OpeningHours.create('   ').isInformed).toBe(false);
    expect(OpeningHours.create(null).value).toBeNull();
    expect(Notes.create(undefined).isPresent).toBe(false);
  });

  it('normalises whitespace', () => {
    expect(OpeningHours.create('Seg a Sex,   8h  às 18h').value).toBe('Seg a Sex, 8h às 18h');
  });

  it('rejects values over the limit', () => {
    expect(() => OpeningHours.create('a'.repeat(121))).toThrow(ValidationError);
    expect(() => Notes.create('a'.repeat(501))).toThrow(ValidationError);
  });
});

describe('service area', () => {
  it('accepts a coordinate inside Londrina', () => {
    expect(isWithinServiceArea(SERVICE_AREA.centre)).toBe(true);
  });

  it('rejects a coordinate in another city', () => {
    expect(isWithinServiceArea(Coordinates.create(-23.5505, -46.6333))).toBe(false);
  });
});
