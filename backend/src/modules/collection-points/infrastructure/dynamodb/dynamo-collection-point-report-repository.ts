import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { readMonthlyPartitions } from '../../../../shared/infrastructure/dynamodb/monthly-reader.js';
import {
  CollectionPointReport,
  REPORT_REASONS,
  type ReportReason,
} from '../../domain/collection-point-report.js';
import type {
  CollectionPointReportRepository,
  ReportPage,
  ReportPageRequest,
} from '../../domain/repositories/collection-point-report-repository.js';

export const REPORT_ENTITY_TYPE = 'CollectionPointReport';

/**
 * Mesma tabela, mesmo desenho do feedback: partição por mês e ordenação pelo
 * instante, sem atributo de GSI — denúncia não entra em índice nenhum.
 */
export const reportKeys = {
  monthPartition: (reportedAt: Date): string => `REPORT#${reportedAt.toISOString().slice(0, 7)}`,
  monthPartitionFromMonth: (month: string): string => `REPORT#${month}`,
  sortKey: (reportedAt: Date, id: string): string => `AT#${reportedAt.toISOString()}#${id}`,
} as const;

function toReason(value: unknown): ReportReason {
  return REPORT_REASONS.includes(value as ReportReason) ? (value as ReportReason) : 'other';
}

export function toCollectionPointReport(raw: Record<string, unknown>): CollectionPointReport {
  return CollectionPointReport.restore({
    id: typeof raw.reportId === 'string' ? raw.reportId : '',
    pointId: typeof raw.pointId === 'string' ? raw.pointId : '',
    pointName: typeof raw.pointName === 'string' ? raw.pointName : '',
    // Um motivo que o código não conhece mais lê como "outro": perder a
    // denúncia inteira por causa do rótulo seria pior.
    reason: toReason(raw.reason),
    details: typeof raw.details === 'string' ? raw.details : null,
    reportedAt: typeof raw.reportedAt === 'string' ? raw.reportedAt : '',
  });
}

export class DynamoCollectionPointReportRepository implements CollectionPointReportRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async save(report: CollectionPointReport): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: reportKeys.monthPartition(report.reportedAt),
          SK: reportKeys.sortKey(report.reportedAt, report.id),
          entityType: REPORT_ENTITY_TYPE,
          reportId: report.id,
          pointId: report.pointId,
          pointName: report.pointName,
          reason: report.reason,
          details: report.details,
          reportedAt: report.reportedAt.toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

  findRecent(request: ReportPageRequest): Promise<ReportPage> {
    return readMonthlyPartitions({
      client: this.client,
      tableName: this.tableName,
      partitionFor: reportKeys.monthPartitionFromMonth,
      toDomain: toCollectionPointReport,
      request,
    });
  }
}
