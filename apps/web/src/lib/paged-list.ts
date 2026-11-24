import { apiPage } from '@/api/client';
import { errorMessage } from '@/lib/format';

export class PagedList<T extends { id: string }> {
  path: string | null = null;
  items: T[] = [];
  nextCursor: string | null = null;
  hasMore = false;
  loading = false;
  loaded = false;
  error = '';
  _version = 0;
  _inFlight = false;

  reload(path: string | null = this.path): void {
    const current = ++this._version;
    this.path = path;
    this.items = [];
    this.nextCursor = null;
    this.hasMore = false;
    this.loading = Boolean(path);
    this.loaded = !path;
    this.error = '';
    this._inFlight = Boolean(path);
    if (!path) return;
    void apiPage<T>(path)
      .then((page) => {
        if (this._version !== current) return;
        this.items = page.items;
        this.nextCursor = page.nextCursor;
        this.hasMore = page.hasMore;
        this.loading = false;
        this.loaded = true;
        this.error = '';
      })
      .catch((error: unknown) => {
        if (this._version !== current) return;
        this.items = [];
        this.nextCursor = null;
        this.hasMore = false;
        this.loading = false;
        this.loaded = true;
        this.error = errorMessage(error);
      })
      .finally(() => {
        if (this._version === current) this._inFlight = false;
      });
  }

  cancel(): void {
    this._version += 1;
    this._inFlight = false;
  }

  async loadMore(): Promise<void> {
    if (!this.path || this._inFlight || !this.hasMore || !this.nextCursor) return;
    this._inFlight = true;
    const current = this._version;
    const cursor = this.nextCursor;
    this.loading = true;
    this.error = '';
    try {
      const page = await apiPage<T>(this.path, cursor);
      if (this._version !== current) return;
      const ids = new Set(this.items.map((item) => item.id));
      this.items = [...this.items, ...page.items.filter((item) => !ids.has(item.id))];
      this.nextCursor = page.nextCursor;
      this.hasMore = page.hasMore;
      this.loading = false;
    } catch (error) {
      if (this._version !== current) return;
      this.loading = false;
      this.error = errorMessage(error);
    } finally {
      if (this._version === current) this._inFlight = false;
    }
  }

  setItems(update: T[] | ((items: T[]) => T[])): void {
    this.items = typeof update === 'function' ? update(this.items) : update;
  }
}
