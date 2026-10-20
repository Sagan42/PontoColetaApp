import type { Clock, IdGenerator } from '../../../../shared/application/ports/index.js';
import { NotFoundError } from '../../../../shared/domain/errors/index.js';
import { CollectionPointReport, type ReportReason } from '../../domain/collection-point-report.js';
import type { CollectionPointReportRepository } from '../../domain/repositories/collection-point-report-repository.js';
import type { CollectionPointRepository } from '../../domain/repositories/collection-point-repository.js';

export interface ReportCollectionPointInput {
  readonly pointId: string;
  readonly reason: ReportReason;
  readonly details?: string | null | undefined;
}

export class ReportCollectionPoint {
  constructor(
    private readonly points: CollectionPointRepository,
    private readonly reports: CollectionPointReportRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReportCollectionPointInput): Promise<void> {
    // Denúncia de ponto inexistente é 404, não registro: sem isso, qualquer um
    // enche a fila de moderação com ids inventados.
    //
    // Busca por `findById`, que encontra em qualquer estado: um ponto já
    // ocultado continua denunciável, e recusar seria pedir para a pessoa
    // tentar de novo sem motivo.
    const point = await this.points.findById(input.pointId);
    if (!point) {
      throw new NotFoundError('Ponto de coleta não encontrado.');
    }

    const report = CollectionPointReport.create({
      id: this.idGenerator.generate(),
      pointId: point.id,
      pointName: point.toSnapshot().name,
      reason: input.reason,
      details: input.details,
      reportedAt: this.clock.now(),
    });

    await this.reports.save(report);
  }
}
