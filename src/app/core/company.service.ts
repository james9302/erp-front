import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from './api';
import { companies } from '../api/functions';
import { CompanyResponse } from '../api/models';

const KEY = 'sl.company';

/** The company filter in the shell: null = all companies the user may see. */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private api = inject(ApiClient);
  readonly companies = signal<CompanyResponse[]>([]);
  readonly loaded = signal(false);
  readonly selectedId = signal<number | null>(readId());
  readonly selected = computed(() => this.companies().find(c => c.id === this.selectedId()) ?? null);
  readonly payoutCompany = computed(() => this.companies().find(c => c.payoutDefault) ?? null);
  /** The selected company, else the first one the user may see; for pages that need exactly one. */
  readonly defaultId = computed(() => this.selectedId() ?? this.companies()[0]?.id ?? null);

  load(): void {
    this.api.call(companies, { size: 500 }).subscribe({ next: p => { const list = p.items ?? [];
      this.companies.set(list);
      const sel = this.selectedId();
      if (sel != null && !list.some(c => c.id === sel && c.active !== false)) this.select(null);   // stale or foreign selection from an earlier session
      this.loaded.set(true);
    }, error: () => this.loaded.set(true) });
  }

  select(id: number | null): void {
    this.selectedId.set(id);
    if (id == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(id));
  }

  /** Query-parameter value for list endpoints. */
  param(): number | undefined { return this.selectedId() ?? undefined; }

  code(id: number | null | undefined): string { return this.companies().find(c => c.id === id)?.code ?? (id == null ? '' : String(id)); }
}

function readId(): number | null { const v = localStorage.getItem(KEY); return v ? Number(v) : null; }
