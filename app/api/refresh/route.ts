import { NextResponse } from 'next/server';
import { loadBusinessData } from '@/lib/data/load';

export async function POST() {
  try {
    const { data, fromCache, cacheExpiresAt } = await loadBusinessData({ refresh: true });

    return NextResponse.json({
      fetchedAt: data.fetchedAt,
      fromCache,
      cacheExpiresAt,
      dealsCount: data.deals.length,
      workOrdersCount: data.workOrders.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
