import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion } from '@/lib/agent';
import { loadBusinessData } from '@/lib/data/load';
import type { ChatMessage } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: ChatMessage[];
      refresh?: boolean;
    };

    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const { data, fromCache, cacheExpiresAt } = await loadBusinessData({
      refresh: body.refresh,
    });
    const { answer, usedFallback } = await answerQuestion(
      body.message.trim(),
      data,
      body.history ?? [],
    );

    return NextResponse.json({
      answer,
      meta: {
        usedFallback,
        fromCache,
        cacheExpiresAt,
        fetchedAt: data.fetchedAt,
        dealsCount: data.deals.length,
        workOrdersCount: data.workOrders.length,
        dataQuality: data.dataQuality,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
