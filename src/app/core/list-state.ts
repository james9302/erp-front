import { signal } from '@angular/core';

export interface PageLike<T> { items?: T[]; page?: number; size?: number; total?: number; }

/**
 * Server-side list state shared by a page and its table: page, size, sort and free-text q, plus the total the server
 * returned. The table drives it (pager, header sort, quick filter) and calls `reload`; the page sends `params()` to the API.
 *   state = new ListState(() => this.load());   ...   this.api.call(fn, { ...filters, ...this.state.params() }).subscribe(p => this.state.apply(p, rows => this.rows.set(rows)));
 */
export class ListState {
  page = signal(0); size = signal(25); sort = signal<string | null>(null); q = signal(''); total = signal(0);
  constructor(private reload: () => void, size = 25) { this.size.set(size); }

  params(): { page: number; size: number; sort?: string; q?: string } {
    return { page: this.page(), size: this.size(), sort: this.sort() ?? undefined, q: this.q() || undefined };
  }
  apply<T>(p: PageLike<T>, set: (rows: T[]) => void): void { set(p.items ?? []); this.total.set(p.total ?? 0); if (p.page != null) this.page.set(p.page); }
  setPage(n: number): void { this.page.set(Math.max(0, n)); this.reload(); }
  setQ(q: string): void { this.q.set(q); this.page.set(0); this.reload(); }
  sortBy(key: string): void {
    const cur = this.sort();
    this.sort.set(cur === key ? key + ',desc' : cur === key + ',desc' ? null : key);
    this.page.set(0); this.reload();
  }
  /** Call when a page-level filter changed: back to the first page and reload. */
  refresh(): void { this.page.set(0); this.reload(); }
  sortKey(): string | null { return this.sort()?.split(',')[0] ?? null; }
  sortDesc(): boolean { return !!this.sort()?.endsWith(',desc'); }
}
