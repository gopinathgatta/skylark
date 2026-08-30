# Decision Log — Skylark BI Agent

## Assumptions

1. **Board mapping**: Deals board ID `5030966113` and Work Orders board ID `5030965963` from the user's Monday.com account.
2. **Sector inference**: Questions about "energy sector" map to **Renewables** or **Powerline** based on keyword matching, since the dataset uses sector labels like Mining, Renewables, Powerline — not "Energy" explicitly.
3. **Open pipeline**: Deals with status "Open" (or no terminal lost/won status) count toward pipeline; won deals identified by status/stage labels containing "Won" or "Work Order Received".
4. **Currency**: Amounts treated as INR (₹) based on column naming in Work Orders board.
5. **Read-only**: Assignment requires read-only Monday access — no write mutations implemented.

## Tech stack — why these choices

The assignment asks for a **hosted, conversational BI agent** that reads **live Monday.com data** and can answer founder-level questions. The stack was chosen to ship quickly, deploy as a public URL, and stay read-only against real boards.

| Layer | Choice | Reason |
|-------|--------|--------|
| **Full-stack framework** | Next.js 15 (App Router) | One repo for UI + API routes; easy Vercel deploy; TypeScript end-to-end for typed Monday payloads and analytics |
| **Data source** | Monday.com GraphQL API | Assignment requires dynamic, read-only board access — not a static CSV in code. GraphQL returns live columns/items and paginates cleanly |
| **Not MCP at runtime** | Direct API token | Monday MCP is useful in Cursor during development, but the hosted app must run on Vercel without IDE tooling. A personal API token is the stable production path |
| **Query understanding** | OpenAI GPT-4o-mini | Converts natural founder questions (“How’s renewables this quarter?”) into answers over pre-computed metrics. Cheaper/faster than larger models; good enough for structured BI summaries |
| **Fallback without LLM** | Rule-based answers in `lib/agent.ts` | Lets the app demo and grade even if `OPENAI_API_KEY` is missing — still reads live Monday data |
| **Analytics before LLM** | `lib/data/analytics.ts` | Sends a compact metrics summary to the model instead of 500+ raw rows — lower cost, fewer hallucinations, clearer numbers |
| **Cache** | In-memory snapshot, 3 min TTL | Follow-up chat questions reuse the same board fetch; avoids hammering Monday API on every message |
| **Hosting** | Vercel | Zero-config Next.js hosting; env vars for tokens; matches “submit a hosted link” deliverable |

**Alternatives considered:** Streamlit (fast for demos but weaker as a polished public product URL), embedding CSVs in repo (violates “live Monday data”), and sending full raw board JSON to the LLM (expensive and harder to keep factual).

## Trade-offs

| Choice | Why |
|--------|-----|
| Next.js over Streamlit | Better fit for hosted public URL deliverable; single deploy on Vercel |
| GraphQL API over MCP at runtime | Hosted app must work without Cursor; API is stable and read-only |
| GPT-4o-mini | Fast, cheap, sufficient for founder Q&A; fallback rules if no API key |
| Pre-computed analytics + LLM | Reduces token cost and hallucination risk vs sending raw 500+ rows |
| In-memory cache (3 min TTL) | Avoids re-fetching Monday on every follow-up question; manual refresh available |

## Leadership updates — how this was interpreted

The assignment lists **“Leadership updates (optional)”** without a strict format. I interpreted it as something a founder would actually use in a weekly stand-up: a **short, proactive executive briefing** — not another free-form chat turn.

**What it is**
- A dedicated **“Leadership update”** button in the chat UI
- A **`GET /api/leadership`** endpoint that returns the same style of briefing as JSON
- Generated from the **same cached Monday snapshot** as chat (Deals + Work Orders together)

**What each briefing covers**
1. **Pipeline health** — open deals, won/lost mix, sector breakdown
2. **Execution status** — active work orders, completion signals, ops load
3. **Billing / receivables** — outstanding amounts where the Work Orders board exposes them
4. **Data quality gaps** — missing sectors, dates, or amounts so leadership knows where numbers are weak
5. **Suggested focus areas** — 2–3 actionable bullets (e.g. sector concentration, stalled deals)

**Why a separate flow (not just another chat prompt)**
- Founders often want a **fixed briefing template** they can skim in 30 seconds
- Keeps chat for ad-hoc questions; leadership update is always **structured and comparable week to week**
- Reuses `loadBusinessData()` + analytics — no duplicate Monday integration

**Implementation:** `generateLeadershipUpdate()` in `lib/agent.ts` builds the briefing from pre-computed metrics (LLM when available, structured fallback otherwise).

## With more time

- Redis/Upstash cache shared across Vercel instances (current cache is in-memory per server)
- Cross-board join on client/deal serial numbers (SDPLDEAL-* ↔ deals)
- Clarifying-question flow in UI before answering ambiguous queries
- Auth on public deployment if needed for production

## What I'd do differently

- Import CSV columns as **Text** instead of Dropdown where values are messy — simplifies normalization
- Add explicit **Sector** and **Deal Value** columns during Monday import for cleaner BI queries
