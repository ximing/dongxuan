import type { MeihuaDraft } from '@dongxuan/dto';
import { api } from './client';

export function saveMeihuaDraft(id: string | null, body: object): Promise<MeihuaDraft> {
  return api<MeihuaDraft>(id ? `/api/v2/meihua-drafts/${id}` : '/api/v2/meihua-drafts', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteMeihuaDraft(id: string, revision: number): Promise<void> {
  return api(`/api/v2/meihua-drafts/${id}?revision=${revision}`, { method: 'DELETE' });
}
