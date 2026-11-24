import { Service } from '@rabjs/react';

export class DialogService extends Service {
  message: string | null = null;
  _resolver: ((accepted: boolean) => void) | null = null;

  confirm(message: string): Promise<boolean> {
    return new Promise((done) => {
      if (this._resolver) {
        done(false);
        return;
      }
      this._resolver = done;
      this.message = message;
    });
  }

  finish(accepted: boolean): void {
    const done = this._resolver;
    this._resolver = null;
    this.message = null;
    done?.(accepted);
  }

  dismiss(): void {
    this.finish(false);
  }
}
