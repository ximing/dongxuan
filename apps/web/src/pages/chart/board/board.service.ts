import { Service } from '@rabjs/react';

export class BoardService extends Service {
  selected: number | null = null;
  full = false;

  toggle(index: number): void {
    this.selected = this.selected === index ? null : index;
  }

  toggleFull(): void {
    this.full = !this.full;
  }

  clear(): void {
    this.selected = null;
  }
}
