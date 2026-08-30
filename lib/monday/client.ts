import type { MondayBoard, MondayColumnValue, MondayItem } from '../types';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const BOARD_QUERY = `
  query ($boardId: [ID!], $cursor: String) {
    boards(ids: $boardId) {
      id
      name
      columns { id title type }
      items_page(limit: 500, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
            type
            column { title }
          }
        }
      }
    }
  }
`;

interface GraphQLResponse {
  data?: { boards: MondayBoard[] };
  errors?: { message: string }[];
}

export function getMondayToken(): string {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not set. Add it to .env.local');
  }
  return token;
}

function authorizationHeader(): string {
  const token = getMondayToken().trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    return token;
  }
  // OAuth JWT tokens from monday.com auth require Bearer prefix
  if (token.startsWith('eyJ')) {
    return `Bearer ${token}`;
  }
  return token;
}

export function getBoardIds(): { dealsBoardId: string; workOrdersBoardId: string } {
  const dealsBoardId = process.env.MONDAY_DEALS_BOARD_ID;
  const workOrdersBoardId = process.env.MONDAY_WORK_ORDERS_BOARD_ID;
  if (!dealsBoardId || !workOrdersBoardId) {
    throw new Error('MONDAY_DEALS_BOARD_ID and MONDAY_WORK_ORDERS_BOARD_ID must be set');
  }
  return { dealsBoardId, workOrdersBoardId };
}

async function mondayQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorizationHeader(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '));
  }

  return payload.data as T;
}

export async function fetchBoardItems(boardId: string): Promise<{ name: string; items: MondayItem[] }> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;
  let boardName = '';

  while (true) {
    const data: { boards: MondayBoard[] } = await mondayQuery<{ boards: MondayBoard[] }>(BOARD_QUERY, {
      boardId: [boardId],
      cursor,
    });

    const board = data.boards[0];
    if (!board) {
      throw new Error(`Board ${boardId} not found or not accessible`);
    }

    boardName = board.name;
    items.push(...board.items_page.items);
    cursor = board.items_page.cursor;
    if (!cursor) break;
  }

  return { name: boardName, items };
}

export function columnMap(item: MondayItem): Record<string, MondayColumnValue> {
  const map: Record<string, MondayColumnValue> = {};
  for (const cv of item.column_values) {
    const title = cv.column?.title ?? cv.id;
    map[title] = cv;
  }
  return map;
}

export function readText(cv: MondayColumnValue | undefined): string | null {
  const text = cv?.text?.trim();
  if (!text) return null;
  return text;
}

export function readNumber(cv: MondayColumnValue | undefined): number | null {
  const text = readText(cv);
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function readDate(cv: MondayColumnValue | undefined): string | null {
  const text = readText(cv);
  if (!text) {
    if (cv?.value) {
      try {
        const parsed = JSON.parse(cv.value) as { date?: string };
        if (parsed.date) return parsed.date;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return text;
}
