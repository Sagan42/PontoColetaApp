import type {
  MonthlyPage,
  MonthlyPageRequest,
} from '../../../../shared/infrastructure/dynamodb/monthly-reader.js';
import type { CollectionPointReport } from '../collection-point-report.js';

export type ReportPageRequest = MonthlyPageRequest;
export type ReportPage = MonthlyPage<CollectionPointReport>;

export interface CollectionPointReportRepository {
  save(report: CollectionPointReport): Promise<void>;

  /** Mais recente primeiro. */
  findRecent(request: ReportPageRequest): Promise<ReportPage>;
}
