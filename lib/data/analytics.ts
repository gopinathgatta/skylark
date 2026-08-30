import type { DealRecord, WorkOrderRecord } from '../types';

function isOpenDeal(deal: DealRecord): boolean {
  const status = deal.dealStatus?.toLowerCase() ?? '';
  return status === 'open' || (!status && !!deal.dealStage && !deal.dealStage.toLowerCase().includes('lost'));
}

function isWonDeal(deal: DealRecord): boolean {
  const status = deal.dealStatus?.toLowerCase() ?? '';
  const stage = deal.dealStage?.toLowerCase() ?? '';
  return status === 'won' || stage.includes('won') || stage.includes('work order received');
}

function inQuarter(dateStr: string | null, year: number, quarter: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() === year && q === quarter;
}

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

export function buildAnalyticsSummary(deals: DealRecord[], workOrders: WorkOrderRecord[]) {
  const { year, quarter } = currentQuarter();

  const openDeals = deals.filter(isOpenDeal);
  const wonDeals = deals.filter(isWonDeal);

  const pipelineValue = openDeals.reduce((sum, d) => sum + (d.dealValue ?? 0), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.dealValue ?? 0), 0);

  const sectorBreakdown = (records: { sector: string | null; dealValue?: number | null; amountExclGst?: number | null }[]) => {
    const map: Record<string, { count: number; value: number }> = {};
    for (const r of records) {
      const sector = r.sector ?? 'Unknown';
      if (!map[sector]) map[sector] = { count: 0, value: 0 };
      map[sector].count += 1;
      map[sector].value += (r.dealValue ?? r.amountExclGst ?? 0);
    }
    return Object.entries(map)
      .map(([sector, stats]) => ({ sector, ...stats }))
      .sort((a, b) => b.value - a.value);
  };

  const dealsThisQuarter = deals.filter(
    (d) => inQuarter(d.closeDate, year, quarter) || inQuarter(d.tentativeCloseDate, year, quarter),
  );

  const workOrderTotals = {
    total: workOrders.length,
    ongoing: workOrders.filter((w) => w.executionStatus?.toLowerCase() === 'ongoing').length,
    completed: workOrders.filter((w) => w.executionStatus?.toLowerCase() === 'completed').length,
    totalContractValue: workOrders.reduce((s, w) => s + (w.amountExclGst ?? 0), 0),
    totalBilled: workOrders.reduce((s, w) => s + (w.billedExclGst ?? 0), 0),
    totalReceivable: workOrders.reduce((s, w) => s + (w.amountReceivable ?? 0), 0),
    openWorkOrders: workOrders.filter((w) => w.woStatus?.toLowerCase() === 'open').length,
  };

  return {
    deals: {
      total: deals.length,
      open: openDeals.length,
      won: wonDeals.length,
      dead: deals.filter((d) => d.dealStatus?.toLowerCase() === 'dead').length,
      pipelineValue,
      wonValue,
      avgDealValue: deals.length ? deals.reduce((s, d) => s + (d.dealValue ?? 0), 0) / deals.length : 0,
      bySector: sectorBreakdown(deals),
      openBySector: sectorBreakdown(openDeals),
      byStage: countBy(deals, (d) => d.dealStage ?? 'Unknown'),
      byStatus: countBy(deals, (d) => d.dealStatus ?? 'Unknown'),
      byProbability: countBy(deals, (d) => d.closureProbability ?? 'Unknown'),
      closingThisQuarter: dealsThisQuarter.length,
      closingThisQuarterValue: dealsThisQuarter.reduce((s, d) => s + (d.dealValue ?? 0), 0),
    },
    workOrders: {
      ...workOrderTotals,
      bySector: sectorBreakdown(workOrders),
      byExecutionStatus: countBy(workOrders, (w) => w.executionStatus ?? 'Unknown'),
      byBillingStatus: countBy(workOrders, (w) => w.billingStatus ?? 'Unknown'),
    },
    crossBoard: {
      sectorsInBoth: [...new Set(deals.map((d) => d.sector).filter(Boolean))].filter((s) =>
        workOrders.some((w) => w.sector === s),
      ),
    },
    currentPeriod: { year, quarter: `Q${quarter}` },
  };
}

function countBy<T>(items: T[], pick: (item: T) => string): { label: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = pick(item);
    map[key] = (map[key] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₹${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}
