import type { ListPage } from '@dongxuan/dto';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? '请求失败');
  }
  return data as T;
}

export async function apiPage<T>(path: string, cursor?: string | null, limit = 50): Promise<ListPage<T>> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  else url.searchParams.delete('cursor');
  return api<ListPage<T>>(url.pathname + url.search);
}

/** Source selectors explicitly traverse all pages; they never silently stop at an arbitrary record count. */
export async function apiAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: ListPage<T> = await apiPage<T>(path, cursor, 100);
    items.push(...page.items);
    if (!page.hasMore) return items;
    if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error('列表分页未能继续，请重试。');
    cursor = page.nextCursor;
    seen.add(page.nextCursor);
  } while (cursor);
  return items;
}
