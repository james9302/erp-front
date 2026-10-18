import { Component, computed, effect, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { ChartComponent } from '../../shared/chart';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { CompanyService } from '../../core/company.service';
import { MonthPipe } from '../../core/pipes';
import { pnl } from '../../api/functions';
import { PnlView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader, ChartComponent],
  template: `
  <app-page title="P&L by month" subtitle="Supplier revenue less payouts and SIM cost, from the earnings runs. Each month is what the network's statement paid and what we paid out for it.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Company</mat-label><mat-select [(ngModel)]="companyId" (valueChange)="load()">@for (c of companies.companies(); track c.id) { <mat-option [value]="c.id">{{ c.code }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px"><mat-label>From</mat-label><input matInput [(ngModel)]="from" placeholder="yyyy-MM" (change)="load()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px"><mat-label>To</mat-label><input matInput [(ngModel)]="to" placeholder="yyyy-MM" (change)="load()"></mat-form-field>
  </app-page>
  @if (total(); as t) {
    <div class="cards">
      <div class="kpi ok"><div class="ico"><mat-icon>north_east</mat-icon></div><div class="label">Revenue</div><div class="value">{{ t.revenue | rand }}</div><div class="sub">activation + OGR from the network</div></div>
      <div class="kpi warn"><div class="ico"><mat-icon>groups</mat-icon></div><div class="label">Payouts</div><div class="value">{{ t.payouts | rand }}</div><div class="sub">reps, referrals, agents</div></div>
      <div class="kpi"><div class="ico"><mat-icon>sim_card</mat-icon></div><div class="label">SIM cost</div><div class="value">{{ t.simCost | rand }}</div><div class="sub">recognised at activation</div></div>
      <div class="kpi" [class.ok]="t.profit>=0" [class.bad]="t.profit<0"><div class="ico"><mat-icon>trending_up</mat-icon></div><div class="label">Gross profit</div><div class="value">{{ t.profit | rand }}</div><div class="sub">{{ t.activations | qty }} activations · {{ t.perAct | rand }} each</div></div>
    </div>
  }
  <div class="grid3">
    <div class="panel"><h2>By month</h2>
      @if (months().length) { <app-chart type="bar" [labels]="labels()" [datasets]="sets()" [height]="300" [money]="true" /> } @else { <div class="empty">No earnings runs in this range for the company.</div> }
    </div>
    <div class="panel"><h2>Profit by channel</h2>
      @if (channelLabels().length) { <app-chart type="doughnut" [labels]="channelLabels()" [datasets]="[{ data: channelData() }]" [height]="300" [money]="true" /> } @else { <div class="empty">No attributed activations.</div> }
    </div>
  </div>
  <app-table [cols]="cols" [rows]="months()" [filterable]="false" [clickable]="false" />`,
})
export class PnlDashPage {
  companies = inject(CompanyService);
  private api = inject(ApiClient);
  companyId?: number; from = shift(-5); to = shift(0);
  months = signal<PnlView[]>([]);
  labels = computed(() => this.months().map(m => new MonthPipe().transform(m.period)));
  sets = computed(() => [
    { label: 'Revenue', data: this.months().map(m => m.supplierRevenue ?? 0) },
    { label: 'Payouts', data: this.months().map(m => m.payouts ?? 0) },
    { label: 'SIM cost', data: this.months().map(m => m.simCost ?? 0) },
    { label: 'Gross profit', data: this.months().map(m => m.grossProfit ?? 0), type: 'line' as const, borderWidth: 2, tension: .3, backgroundColor: 'transparent' },
  ]);
  channelLabels = computed(() => Object.keys(this.channelTotals()));
  channelData = computed(() => Object.values(this.channelTotals()));
  channelTotals = computed(() => { const t: Record<string, number> = {}; this.months().forEach(m => Object.entries(m.byChannel ?? {}).forEach(([k, v]) => t[k] = (t[k] ?? 0) + Number(v))); return t; });
  total = computed(() => { const ms = this.months(); if (!ms.length) return null; const sum = (f: (m: PnlView) => number) => ms.reduce((a, m) => a + f(m), 0);
    const profit = sum(m => m.grossProfit ?? 0), acts = sum(m => m.activations ?? 0);
    return { revenue: sum(m => m.supplierRevenue ?? 0), payouts: sum(m => m.payouts ?? 0), simCost: sum(m => m.simCost ?? 0), profit, activations: acts, perAct: acts ? profit / acts : 0 }; });
  cols: Col[] = [{ key: 'period', label: 'Month', type: 'month' }, { key: 'activations', label: 'Activations', type: 'qty' }, { key: 'recharges', label: 'Recharges', type: 'qty' }, { key: 'rechargeValue', label: 'Recharge value', type: 'rand' },
    { key: 'supplierActivationRev', label: 'Activation rev', type: 'rand' }, { key: 'supplierOgrRev', label: 'OGR rev', type: 'rand' }, { key: 'payouts', label: 'Payouts', type: 'rand' }, { key: 'simCost', label: 'SIM cost', type: 'rand' }, { key: 'grossProfit', label: 'Gross profit', type: 'signed' }, { key: 'grossProfitPerActivation', label: 'Per activation', type: 'signed' }];
  constructor() { effect(() => { const id = this.companies.defaultId(); if (id && this.companyId !== id) { this.companyId = id; this.load(); } }); }
  load(): void {
    if (!this.companyId) return;
    forkJoin(monthsBetween(this.from, this.to).map(p => this.api.call(pnl, { companyId: this.companyId!, period: p })))
      .subscribe(r => this.months.set(r.filter(m => (m.activations ?? 0) + (m.recharges ?? 0) > 0 || (m.grossProfit ?? 0) !== 0)));
  }
}

function shift(n: number): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); }
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []; const [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m++) { if (m > 12) { m = 1; y++; } out.push(`${y}-${String(m).padStart(2, '0')}`); if (out.length > 24) break; }
  return out;
}
