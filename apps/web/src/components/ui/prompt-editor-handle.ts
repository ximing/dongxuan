import type { PromptDocument } from '@dongxuan/dto';

/** React owns the editor. Services receive only this small synchronous bridge. */
export interface PromptEditorHandle {
  getDocument(): PromptDocument;
  isComposing(): boolean;
  rememberSelection(): void;
  focusSelection(): void;
  insertVariable(name: string): void;
}
