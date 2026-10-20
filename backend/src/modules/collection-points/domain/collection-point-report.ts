import { ValidationError } from '../../../shared/domain/errors/index.js';
import { sanitizeMultiline, sanitizeSingleLine } from '../../../shared/domain/text/index.js';

/**
 * Motivos de denúncia.
 *
 * Lista fechada em vez de texto livre: quem denuncia escolhe em um toque, e
 * quem modera consegue olhar primeiro o que é urgente. `inappropriate` é o que
 * a política de conteúdo gerado pelo utilizador exige que exista; os outros
 * existem porque um diretório de endereços envelhece.
 */
export const REPORT_REASONS = [
  'inappropriate',
  'incorrect',
  'closed',
  'duplicate',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

const MAX_DETAILS_LENGTH = 500;
const MAX_POINT_NAME_LENGTH = 120;

export interface CreateCollectionPointReportInput {
  readonly id: string;
  readonly pointId: string;
  readonly pointName: string;
  readonly reason: ReportReason;
  readonly details?: string | null | undefined;
  readonly reportedAt: Date;
}

export interface CollectionPointReportSnapshot {
  readonly id: string;
  readonly pointId: string;
  readonly pointName: string;
  readonly reason: ReportReason;
  readonly details: string | null;
  readonly reportedAt: string;
}

/**
 * Denúncia de um ponto de coleta, feita por qualquer pessoa, sem cadastro.
 *
 * Não guarda nada sobre quem denunciou — nem IP, nem identificador. O que
 * importa é o ponto denunciado, e anonimato é o que faz alguém denunciar.
 */
export class CollectionPointReport {
  private constructor(
    readonly id: string,
    readonly pointId: string,
    readonly pointName: string,
    readonly reason: ReportReason,
    readonly details: string | null,
    readonly reportedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(input: CreateCollectionPointReportInput): CollectionPointReport {
    const details = sanitizeMultiline(input.details ?? '');
    if (details.length > MAX_DETAILS_LENGTH) {
      throw new ValidationError(
        `Detalhes devem ter no máximo ${MAX_DETAILS_LENGTH} caracteres.`,
        'details',
      );
    }

    // O nome do ponto é copiado no momento da denúncia para que a lista de
    // moderação seja legível sem uma leitura por item.
    const pointName = sanitizeSingleLine(input.pointName).slice(0, MAX_POINT_NAME_LENGTH);

    return new CollectionPointReport(
      input.id,
      input.pointId,
      pointName,
      input.reason,
      details.length > 0 ? details : null,
      input.reportedAt,
    );
  }

  /** Reconstrói o que já está gravado, sem revalidar. */
  static restore(snapshot: CollectionPointReportSnapshot): CollectionPointReport {
    return new CollectionPointReport(
      snapshot.id,
      snapshot.pointId,
      snapshot.pointName,
      snapshot.reason,
      snapshot.details,
      new Date(snapshot.reportedAt),
    );
  }

  toSnapshot(): CollectionPointReportSnapshot {
    return {
      id: this.id,
      pointId: this.pointId,
      pointName: this.pointName,
      reason: this.reason,
      details: this.details,
      reportedAt: this.reportedAt.toISOString(),
    };
  }
}
