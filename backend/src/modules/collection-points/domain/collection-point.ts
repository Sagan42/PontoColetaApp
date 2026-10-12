import { ValidationError } from '../../../shared/domain/errors/index.js';
import { collapseWhitespace } from '../../../shared/domain/text/index.js';
import {
  CollectionPointStatus,
  isPubliclyVisible,
  parseCollectionPointStatus,
} from './collection-point-status.js';
import { Address } from './value-objects/address.js';
import { Coordinates } from './value-objects/coordinates.js';
import { Material } from './value-objects/material.js';
import { Notes } from './value-objects/notes.js';
import { OpeningHours } from './value-objects/opening-hours.js';

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 120;
const MAX_MATERIALS = 10;

/**
 * Raised by the pre-check in the use case and by the transaction that enforces
 * it, so the person reads the same thing either way.
 */
export const DUPLICATE_POINT_MESSAGE = 'Esse ponto de coleta já está cadastrado.';

export interface CollectionPointProps {
  readonly id: string;
  readonly name: string;
  readonly address: Address;
  readonly coordinates: Coordinates;
  readonly materials: readonly Material[];
  readonly openingHours: OpeningHours;
  readonly notes: Notes;
  readonly status: CollectionPointStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CollectionPointSnapshot {
  readonly id: string;
  readonly name: string;
  readonly address: { line: string; city: string; state: string; formatted: string };
  readonly latitude: number;
  readonly longitude: number;
  readonly materials: { label: string; slug: string }[];
  readonly openingHours: string | null;
  readonly notes: string | null;
  readonly status: CollectionPointStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCollectionPointInput {
  readonly name: string;
  readonly address: Address;
  readonly coordinates: Coordinates;
  readonly materials: readonly Material[];
  readonly openingHours?: OpeningHours;
  readonly notes?: Notes;
}

export class CollectionPoint {
  private constructor(private props: CollectionPointProps) {}

  static create(
    input: CreateCollectionPointInput,
    context: { id: string; now: Date },
  ): CollectionPoint {
    return new CollectionPoint({
      id: context.id,
      name: normalizeName(input.name),
      address: input.address,
      coordinates: input.coordinates,
      materials: normalizeMaterials(input.materials),
      openingHours: input.openingHours ?? OpeningHours.notInformed,
      notes: input.notes ?? Notes.empty,
      status: CollectionPointStatus.Published,
      createdAt: context.now,
      updatedAt: context.now,
    });
  }

  static restore(snapshot: CollectionPointSnapshot): CollectionPoint {
    return new CollectionPoint({
      id: snapshot.id,
      name: normalizeName(snapshot.name),
      address: Address.create(snapshot.address.line, snapshot.address.city, snapshot.address.state),
      coordinates: Coordinates.create(snapshot.latitude, snapshot.longitude),
      materials: normalizeMaterials(snapshot.materials.map((item) => Material.create(item.label))),
      openingHours: OpeningHours.create(snapshot.openingHours),
      notes: Notes.create(snapshot.notes),
      status: parseCollectionPointStatus(snapshot.status),
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get address(): Address {
    return this.props.address;
  }

  get coordinates(): Coordinates {
    return this.props.coordinates;
  }

  get materials(): readonly Material[] {
    return this.props.materials;
  }

  get status(): CollectionPointStatus {
    return this.props.status;
  }

  get isPubliclyVisible(): boolean {
    return isPubliclyVisible(this.props.status);
  }

  acceptsMaterial(rawMaterial: string): boolean {
    const slug = Material.toSlug(rawMaterial);
    return this.props.materials.some((material) => material.slug === slug);
  }

  distanceKmTo(coordinates: Coordinates): number {
    return this.props.coordinates.distanceKmTo(coordinates);
  }

  hide(now: Date): void {
    if (this.props.status === CollectionPointStatus.Hidden) return;
    this.props = { ...this.props, status: CollectionPointStatus.Hidden, updatedAt: now };
  }

  publish(now: Date): void {
    if (this.props.status === CollectionPointStatus.Published) return;
    this.props = { ...this.props, status: CollectionPointStatus.Published, updatedAt: now };
  }

  toSnapshot(): CollectionPointSnapshot {
    return {
      id: this.props.id,
      name: this.props.name,
      address: {
        line: this.props.address.line,
        city: this.props.address.city,
        state: this.props.address.state,
        formatted: this.props.address.formatted,
      },
      latitude: this.props.coordinates.latitude,
      longitude: this.props.coordinates.longitude,
      materials: this.props.materials.map((material) => ({
        label: material.label,
        slug: material.slug,
      })),
      openingHours: this.props.openingHours.value,
      notes: this.props.notes.value,
      status: this.props.status,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}

function normalizeName(rawName: string): string {
  const name = collapseWhitespace(rawName);

  if (name.length < MIN_NAME_LENGTH) {
    throw new ValidationError('Informe um nome com pelo menos 3 caracteres.', 'name');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`, 'name');
  }

  return name;
}

function normalizeMaterials(materials: readonly Material[]): readonly Material[] {
  const bySlug = new Map<string, Material>();
  for (const material of materials) {
    if (!bySlug.has(material.slug)) {
      bySlug.set(material.slug, material);
    }
  }

  const unique = [...bySlug.values()];
  if (unique.length === 0) {
    throw new ValidationError('Informe ao menos um material aceito.', 'materials');
  }
  if (unique.length > MAX_MATERIALS) {
    throw new ValidationError(`Informe no máximo ${MAX_MATERIALS} materiais.`, 'materials');
  }

  return unique;
}
