import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { collapseWhitespace, slugify } from '../../../../shared/domain/text/index.js';

const MAX_LABEL_LENGTH = 40;
const MIN_LABEL_LENGTH = 2;

export const SUGGESTED_MATERIALS = [
  'Pilhas',
  'Baterias',
  'Eletrônicos',
  'Lâmpadas',
  'Óleo de cozinha',
  'Medicamentos',
  'Vidro',
  'Papel',
  'Plástico',
  'Metal',
] as const;

export class Material {
  private constructor(
    readonly label: string,
    readonly slug: string,
  ) {
    Object.freeze(this);
  }

  static create(rawLabel: string): Material {
    const label = collapseWhitespace(rawLabel);

    if (label.length < MIN_LABEL_LENGTH) {
      throw new ValidationError('Informe um material com pelo menos 2 caracteres.', 'materials');
    }
    if (label.length > MAX_LABEL_LENGTH) {
      throw new ValidationError(
        `Material deve ter no máximo ${MAX_LABEL_LENGTH} caracteres.`,
        'materials',
      );
    }

    const slug = slugify(label);
    if (slug.length === 0) {
      throw new ValidationError('Material inválido.', 'materials');
    }

    return new Material(label, slug);
  }

  static toSlug(rawLabel: string): string {
    return slugify(collapseWhitespace(rawLabel));
  }

  equals(other: Material): boolean {
    return this.slug === other.slug;
  }

  toString(): string {
    return this.label;
  }
}
