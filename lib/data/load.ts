import {
  columnMap,
  fetchBoardItems,
  getBoardIds,
  readDate,
  readNumber,
  readText,
} from '../monday/client';
import { buildAnalyticsSummary } from './analytics';
import {
  clearBusinessDataCache,
  getCachedBusinessData,
  getCacheExpiresAt,
  setCachedBusinessData,
} from './cache';
import type { BusinessDataSnapshot, DealRecord, WorkOrderRecord } from '../types';

export interface BusinessDataLoadResult {
  data: BusinessDataSnapshot;
  fromCache: boolean;
  cacheExpiresAt: string | null;
}

export { clearBusinessDataCache };

const HEADER_ARTIFACTS = new Set([
  'deal status',
  'deal stage',
  'closure probability',
  'product deal',
  'sector/service',
  'sector',
  'close date (a)',
  'execution status',
  'nature of work',
  'document type',
  'type of work',
  'actual billing month',
  'invoice status',
  'billing status',
  'wo status (billed)',
  'collection status',
]);

function cleanLabel(value: string | null, fieldName: string, notes: string[]): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (HEADER_ARTIFACTS.has(normalized.toLowerCase())) {
    notes.push(`Stripped header artifact "${normalized}" from ${fieldName}`);
    return null;
  }

  return normalized;
}

function normalizeSector(sector: string | null): string | null {
  if (!sector) return null;
  const lower = sector.toLowerCase();
  if (lower.includes('renewable') || lower.includes('energy') || lower.includes('solar')) {
    return 'Renewables';
  }
  if (lower.includes('mining')) return 'Mining';
  if (lower.includes('power')) return 'Powerline';
  if (lower.includes('rail')) return 'Railways';
  if (lower.includes('construct')) return 'Construction';
  return sector;
}

function normalizeDeal(item: { id: string; name: string; column_values: unknown[] }): DealRecord {
  const cols = columnMap(item as Parameters<typeof columnMap>[0]);
  const notes: string[] = [];

  return {
    id: item.id,
    name: item.name,
    ownerCode: cleanLabel(readText(cols['Owner code']), 'ownerCode', notes),
    clientCode: cleanLabel(readText(cols['Client Code']), 'clientCode', notes),
    dealStatus: cleanLabel(readText(cols['Deal Status']), 'dealStatus', notes),
    closeDate: readDate(cols['Close Date (A)']),
    tentativeCloseDate: readDate(cols['Tentative Close Date']),
    closureProbability: cleanLabel(readText(cols['Closure Probability']), 'closureProbability', notes),
    dealValue: readNumber(cols['Masked Deal value']),
    dealStage: cleanLabel(readText(cols['Deal Stage']), 'dealStage', notes),
    productDeal: cleanLabel(readText(cols['Product deal']), 'productDeal', notes),
    sector: normalizeSector(cleanLabel(readText(cols['Sector/service']), 'sector', notes)),
    createdDate: readDate(cols['Created Date']),
    dataQualityNotes: notes,
  };
}

function normalizeWorkOrder(item: { id: string; name: string; column_values: unknown[] }): WorkOrderRecord {
  const cols = columnMap(item as Parameters<typeof columnMap>[0]);
  const notes: string[] = [];

  return {
    id: item.id,
    name: item.name,
    customerCode: cleanLabel(readText(cols['Customer Name Code']), 'customerCode', notes),
    serial: cleanLabel(readText(cols['Serial #']), 'serial', notes),
    natureOfWork: cleanLabel(readText(cols['Nature of Work']), 'natureOfWork', notes),
    executionStatus: cleanLabel(readText(cols['Execution Status']), 'executionStatus', notes),
    sector: normalizeSector(cleanLabel(readText(cols['Sector']), 'sector', notes)),
    typeOfWork: cleanLabel(readText(cols['Type of Work']), 'typeOfWork', notes),
    amountExclGst: readNumber(cols['Amount in Rupees (Excl of GST) (Masked)']),
    billedExclGst: readNumber(cols['Billed Value in Rupees (Excl of GST.) (Masked)']),
    collectedInclGst: readNumber(cols['Collected Amount in Rupees (Incl of GST.) (Masked)']),
    amountReceivable: readNumber(cols['Amount Receivable (Masked)']),
    woStatus: cleanLabel(readText(cols['WO Status (billed)']), 'woStatus', notes),
    billingStatus: cleanLabel(readText(cols['Billing Status']), 'billingStatus', notes),
    invoiceStatus: cleanLabel(readText(cols['Invoice Status']), 'invoiceStatus', notes),
    dataQualityNotes: notes,
  };
}

async function fetchFreshBusinessData(): Promise<BusinessDataSnapshot> {
  const { dealsBoardId, workOrdersBoardId } = getBoardIds();

  const [dealsBoard, workOrdersBoard] = await Promise.all([
    fetchBoardItems(dealsBoardId),
    fetchBoardItems(workOrdersBoardId),
  ]);

  const deals = dealsBoard.items.map(normalizeDeal);
  const workOrders = workOrdersBoard.items.map(normalizeWorkOrder);

  const dealNameCounts = deals.reduce<Record<string, number>>((acc, d) => {
    acc[d.name] = (acc[d.name] ?? 0) + 1;
    return acc;
  }, {});

  const duplicateDealNames = Object.values(dealNameCounts).filter((c) => c > 1).length;
  const headerArtifactValuesStripped = [...deals, ...workOrders].reduce(
    (sum, r) => sum + r.dataQualityNotes.length,
    0,
  );

  const summary = buildAnalyticsSummary(deals, workOrders);

  return {
    fetchedAt: new Date().toISOString(),
    dealsBoardName: dealsBoard.name,
    workOrdersBoardName: workOrdersBoard.name,
    deals,
    workOrders,
    summary,
    dataQuality: {
      dealsWithMissingSector: deals.filter((d) => !d.sector).length,
      dealsWithMissingValue: deals.filter((d) => d.dealValue == null).length,
      dealsWithMissingCloseDate: deals.filter((d) => !d.closeDate && !d.tentativeCloseDate).length,
      workOrdersWithMissingSector: workOrders.filter((w) => !w.sector).length,
      workOrdersWithMissingAmount: workOrders.filter((w) => w.amountExclGst == null).length,
      duplicateDealNames,
      headerArtifactValuesStripped,
    },
  };
}

export async function loadBusinessData(options?: {
  refresh?: boolean;
}): Promise<BusinessDataLoadResult> {
  if (options?.refresh) {
    clearBusinessDataCache();
  }

  const cached = getCachedBusinessData();
  if (cached) {
    return {
      data: cached,
      fromCache: true,
      cacheExpiresAt: getCacheExpiresAt(),
    };
  }

  const data = await fetchFreshBusinessData();
  setCachedBusinessData(data);

  return {
    data,
    fromCache: false,
    cacheExpiresAt: getCacheExpiresAt(),
  };
}
