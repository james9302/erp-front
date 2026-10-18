import { Component, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { CompanyService } from '../../core/company.service';
import { yyyyMm } from '../../core/pipes';
import { exceptions, parties1, runs1 } from '../../api/functions';
import { ExceptionView, PartyEarningsView, RunView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Earnings & exceptions" subtitle="Who earned what in a month across the companies, and the events the engine could not place." />
  <div class="toolbar">
    <mat-form-field appearance="outline"><mat-label>Month</mat-label><input matInput [(ngModel)]="period" placeholder="yyyy-MM" (change)="load()"></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Kind</mat-label><mat-select [(ngModel)]="kind" (valueChange)="load()"><mat-option [value]="''">All</mat-option><mat-option value="REP">REP</mat-option><mat-option value="FIELD_AGENT">FIELD_AGENT</mat-option><mat-option value="SHOP_AGENT">SHOP_AGENT</mat-option></mat-select></mat-form-field>
  </div>
  <div class="panel">
    <h2>Top earners</h2>
    @for (p of top(); track p.partyId) {
      <div class="erow"><span class="name">{{ p.partyName }} <span class="tag">{{ p.partyKind }}</span></span><div class="bar" [style.width.%]="pct(p.total)"></div><b>{{ p.total | rand }}</b><span class="muted">{{ p.sims | qty }} SIMs</span></div>
    } @empty { <div class="empty">No earnings for this month.</div> }
  </div>
  <h2>Exceptions of the month's runs</h2>
  <app-table [cols]="excCols" [rows]="exc()" (pick)="router.navigate(['/sim', $event.serial])" empty="No exceptions." />`,
  styles: [`.erow { display: grid; grid-template-columns: 260px 1fr 110px 90px; gap: 10px; align-items: center; padding: 5px 0; } .erow b { text-align: right; }`],
})
export class EarningsDashPage {
  companies = inject(CompanyService); router = inject(Router);
  private api = inject(ApiClient);
  period = yyyyMm(new Date(new Date().setMonth(new Date().getMonth() - 1))); kind = '';
  top = signal<PartyEarningsView[]>([]); exc = signal<ExceptionView[]>([]); private loadSeq = 0;
  excCols: Col[] = [{ key: 'runId', label: 'Run' }, { key: 'code', label: 'Code', type: 'tag' }, { key: 'serial', label: 'Serial' }, { key: 'eventKind', label: 'Event' }, { key: 'detail', label: 'Detail' }];
  constructor() { this.load(); }
  pct(v?: number): number { const m = Math.max(1, ...this.top().map(p => p.total ?? 0)); return Math.round(((v ?? 0) / m) * 100); }
  load(): void {
    this.api.call(parties1, { companyId: this.companies.param(), period: this.period, kind: this.kind || undefined, size: 30, sort: 'total,desc' }).subscribe(l => this.top.set(l.items ?? []));
    const seq = ++this.loadSeq;
    this.api.call(runs1, { companyId: this.companies.param(), size: 100 }).subscribe(pg => { const rs = pg.items ?? [];
      const month = rs.filter(r => (r.period ?? '').startsWith(this.period));
      if (!month.length) { if (seq === this.loadSeq) this.exc.set([]); return; }
      forkJoin(month.map(r => this.api.call(exceptions, { id: r.id!, size: 200 }).pipe(catchError(() => of({ items: [] as ExceptionView[] })))))
        .subscribe(lists => { if (seq === this.loadSeq) this.exc.set(lists.flatMap((e, i) => (e.items ?? []).map(x => ({ ...x, runId: month[i].id } as any)))); });
    });
  }
}
