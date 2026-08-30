import OpenAI from 'openai';
import type { BusinessDataSnapshot, ChatMessage } from './types';
import { formatCurrency } from './data/analytics';

function buildContext(data: BusinessDataSnapshot): string {
  const { summary, dataQuality, dealsBoardName, workOrdersBoardName } = data;

  return `
DATA FETCHED AT: ${data.fetchedAt}
BOARDS: "${dealsBoardName}" (${data.deals.length} deals), "${workOrdersBoardName}" (${data.workOrders.length} work orders)

DATA QUALITY CAVEATS:
- Deals missing sector: ${dataQuality.dealsWithMissingSector}
- Deals missing value: ${dataQuality.dealsWithMissingValue}
- Deals missing close date: ${dataQuality.dealsWithMissingCloseDate}
- Work orders missing sector: ${dataQuality.workOrdersWithMissingSector}
- Work orders missing amount: ${dataQuality.workOrdersWithMissingAmount}
- Duplicate deal names: ${dataQuality.duplicateDealNames}
- Header/import artifacts cleaned: ${dataQuality.headerArtifactValuesStripped}

PIPELINE SUMMARY (${summary.currentPeriod.quarter} ${summary.currentPeriod.year}):
- Open deals: ${summary.deals.open} (${formatCurrency(summary.deals.pipelineValue)} pipeline value)
- Won deals: ${summary.deals.won} (${formatCurrency(summary.deals.wonValue)})
- Deals closing this quarter: ${summary.deals.closingThisQuarter} (${formatCurrency(summary.deals.closingThisQuarterValue)})
- Open pipeline by sector: ${JSON.stringify(summary.deals.openBySector.slice(0, 8))}

WORK ORDERS SUMMARY:
- Total: ${summary.workOrders.total}, Ongoing: ${summary.workOrders.ongoing}, Completed: ${summary.workOrders.completed}
- Contract value: ${formatCurrency(summary.workOrders.totalContractValue)}
- Billed: ${formatCurrency(summary.workOrders.totalBilled)}, Receivable: ${formatCurrency(summary.workOrders.totalReceivable)}
- By sector: ${JSON.stringify(summary.workOrders.bySector.slice(0, 8))}

DEAL STATUS BREAKDOWN: ${JSON.stringify(summary.deals.byStatus.slice(0, 6))}
DEAL STAGE BREAKDOWN: ${JSON.stringify(summary.deals.byStage.slice(0, 8))}
`.trim();
}

const SYSTEM_PROMPT = `You are a business intelligence assistant for Skylark Drones founders and executives.
You answer questions using live data from monday.com boards (Deals pipeline + Work Orders execution).

Rules:
1. Give concise, executive-ready answers with numbers and context — not just raw counts.
2. When data is missing, incomplete, or messy, say so explicitly and explain how it affects the answer.
3. If a question is ambiguous (e.g. "this quarter" without context, unclear sector name), ask ONE clarifying question.
4. Cross-reference both boards when the question spans sales pipeline and operational delivery.
5. "Energy sector" often maps to Renewables or Powerline in this dataset — mention if you infer this.
6. Do not invent data. Only use the provided snapshot.
7. Keep answers under 250 words unless generating a leadership update.`;

export async function answerQuestion(
  question: string,
  data: BusinessDataSnapshot,
  history: ChatMessage[] = [],
): Promise<{ answer: string; usedFallback: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { answer: buildFallbackAnswer(question, data), usedFallback: true };
  }

  const openai = new OpenAI({ apiKey });
  const context = buildContext(data);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Current business data snapshot:\n${context}` },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.2,
    max_tokens: 700,
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    return { answer: buildFallbackAnswer(question, data), usedFallback: true };
  }

  return { answer, usedFallback: false };
}

export async function generateLeadershipUpdate(data: BusinessDataSnapshot): Promise<string> {
  const prompt = `Prepare a concise leadership update (bullet format, 5-7 bullets) covering:
- Pipeline health and top sectors
- Work order execution status
- Revenue/billing highlights
- Key risks from data quality gaps
- Recommended focus areas for leadership`;

  const result = await answerQuestion(prompt, data);
  return result.answer;
}

function buildFallbackAnswer(question: string, data: BusinessDataSnapshot): string {
  const q = question.toLowerCase();
  const s = data.summary;

  if (q.includes('pipeline') || q.includes('deal')) {
    return `Pipeline snapshot: ${s.deals.open} open deals worth ${formatCurrency(s.deals.pipelineValue)}. Top open sectors: ${s.deals.openBySector
      .slice(0, 3)
      .map((x: { sector: string; count: number; value: number }) => `${x.sector} (${x.count} deals, ${formatCurrency(x.value)})`)
      .join('; ')}. Note: ${data.dataQuality.dealsWithMissingValue} deals missing value, ${data.dataQuality.dealsWithMissingSector} missing sector.`;
  }

  if (q.includes('work order') || q.includes('execution') || q.includes('operational')) {
    return `Work orders: ${s.workOrders.total} total — ${s.workOrders.ongoing} ongoing, ${s.workOrders.completed} completed. Contract value ${formatCurrency(s.workOrders.totalContractValue)}, receivable ${formatCurrency(s.workOrders.totalReceivable)}. Top sectors: ${s.workOrders.bySector
      .slice(0, 3)
      .map((x: { sector: string; count: number }) => `${x.sector} (${x.count})`)
      .join('; ')}.`;
  }

  if (q.includes('sector') || q.includes('energy') || q.includes('renewable') || q.includes('mining')) {
    const sector = q.includes('renewable') || q.includes('energy')
      ? 'Renewables'
      : q.includes('mining')
        ? 'Mining'
        : q.includes('power')
          ? 'Powerline'
          : null;

    if (sector) {
      const deals = s.deals.openBySector.find((x: { sector: string }) => x.sector === sector);
      const wos = s.workOrders.bySector.find((x: { sector: string }) => x.sector === sector);
      return `${sector}: ${deals?.count ?? 0} open deals (${formatCurrency(deals?.value ?? 0)}), ${wos?.count ?? 0} work orders (${formatCurrency(wos?.value ?? 0)} contract value). Data pulled live from monday.com.`;
    }
  }

  if (q.includes('revenue') || q.includes('billing') || q.includes('receivable')) {
    return `Financial snapshot: Won deal value ${formatCurrency(s.deals.wonValue)}. Work order contract value ${formatCurrency(s.workOrders.totalContractValue)}, billed ${formatCurrency(s.workOrders.totalBilled)}, receivable ${formatCurrency(s.workOrders.totalReceivable)}. Some amounts may be masked or missing in source data.`;
  }

  return `Business overview: ${s.deals.total} deals (${s.deals.open} open, ${formatCurrency(s.deals.pipelineValue)} pipeline) and ${s.workOrders.total} work orders (${s.workOrders.ongoing} ongoing). Ask about pipeline, sectors, revenue, or work order execution. Set OPENAI_API_KEY for richer conversational answers.`;
}
