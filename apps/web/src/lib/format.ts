import { ApiError } from '@/api/client';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : '操作未完成，请重试';
}

export function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function monthNow(): string {
  return today().slice(0, 7);
}

export function displayDate(value: string): string {
  return new Date(value).toLocaleDateString('zh-CN');
}
