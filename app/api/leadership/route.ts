import { NextRequest, NextResponse } from 'next/server';
import { generateLeadershipUpdate } from '@/lib/agent';
import { loadBusinessData } from '@/lib/data/load';

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const { data, fromCache, cacheExpiresAt } = await loadBusinessData({ refresh });
    const update = await generateLeadershipUpdate(data);

    return NextResponse.json({
      update,
      fetchedAt: data.fetchedAt,
      fromCache,
      cacheExpiresAt,
      dataQuality: data.dataQuality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
