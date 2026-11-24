import type { ChartSnapshot, MeihuaDraft, PromptPreview, PromptTemplate, PromptVariable } from '@dongxuan/dto';
import { api } from './client';

export function listPromptVariables(): Promise<PromptVariable[]> {
  return api<PromptVariable[]>('/api/v2/prompt-variables');
}

export function savePromptTemplate(id: string | null, body: object): Promise<PromptTemplate> {
  return api<PromptTemplate>(id ? `/api/v2/prompt-templates/${id}` : '/api/v2/prompt-templates', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
}

export function deletePromptTemplate(id: string, revision: number): Promise<void> {
  return api(`/api/v2/prompt-templates/${id}?revision=${revision}`, { method: 'DELETE' });
}

export function createPromptPreview(body: object): Promise<PromptPreview> {
  return api<PromptPreview>('/api/v2/prompt-previews', { method: 'POST', body: JSON.stringify(body) });
}

export function getPromptSnapshot(id: string): Promise<ChartSnapshot> {
  return api<ChartSnapshot>(`/api/v2/snapshots/${id}`);
}

export function getMeihuaDraft(id: string): Promise<MeihuaDraft> {
  return api<MeihuaDraft>(`/api/v2/meihua-drafts/${id}`);
}
