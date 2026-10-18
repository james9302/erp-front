import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { ApiClient } from '../core/api';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { PageHeader } from '../shared/page-header';
import { ChartComponent } from '../shared/chart';
import { TableComponent, Col } from '../shared/table';
import { coverage, movements, parties1, pnl, runs, runs1, summary } from '../api/functions';
import { AccountRunView, CoverageRow, MovementView, PartyEarningsView, PnlView, StockSummary } from '../api/models';
import { QtyPipe, RandPipe, MonthPipe } from '../core/pipes';

@Component({
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeader, ChartComponent, TableComponent, QtyPipe, RandPipe, MonthPipe],
  template: `
  <app-page title="Overview" subtitle="Where the business stands right now: stock in the field, the latest statements, earnings and profit.">
    @if (auth.has('gr.receive')) { <a mat-stroked-button routerLink="/receiving"><mat-icon>inventory</mat-icon> Receive</a> }
    @if (auth.hasAny('stock.allocate','stock.handover_own')) { <a mat-stroked-button routerLink="/handover"><mat-icon>swap_horiz</mat-icon> Allocate</a> }
    @if (auth.has('files.import')) { <a mat-stroked-button routerLink="/network-files"><mat-icon>cloud_upload</mat-icon> Import files</a> }
    @if (auth.has('earnings.run')) { <a mat-flat-button routerLink="/earnings"><mat-icon>calculate</mat-icon> Run earnings</a> }
  </app-page>

  <div class="cards">
    @if (stock(); as s) {
      <div class="kpi" routerLink="/stock"><div class="ico"><mat-icon>warehouse</mat-icon></div><div class="label">In warehouse</div><div class="value">{{ s.inWarehouse | qty }}</div><div class="sub">{{ s.warehouseValueExcl | rand }} at cost · {{ s.packed | qty }} packed</div></div>
      <div class="kpi ok" routerLink="/handover"><div class="ico"><mat-icon>groups</mat-icon></div><div class="label">In the field</div><div class="value">{{ (s.withReps||0)+(s.withAgents||0)+(s.withShops||0) | qty }}</div><div class="sub">{{ s.withReps | qty }} reps · {{ s.withAgents | qty }} agents · {{ s.withShops | qty }} shops</div></div>
      <div class="kpi warn" routerLink="/stock"><div class="ico"><mat-icon>assignment_return</mat-icon></div><div class="label">To check</div><div class="value">{{ (s.returnedCheck||0)+(s.quarantine||0) | qty }}</div><div class="sub">{{ s.returnedCheck | qty }} returned · {{ s.quarantine | qty }} quarantine</div></div>
    }
    @if (latestPnl(); as p) {
      <div class="kpi" [class.ok]="(p.grossProfit||0)>=0" [class.bad]="(p.grossProfit||0)<0" routerLink="/dash/pnl"><div class="ico"><mat-icon>trending_up</mat-icon></div><div class="label">Gross profit · {{ p.period | month }}</div><div class="value">{{ p.grossProfit | rand }}</div><div class="sub">{{ p.supplierRevenue | rand }} revenue · {{ p.payouts | rand }} payouts · {{ p.activations | qty }} activations</div></div>
    }
    @if (lastStatement(); as st) { <div class="kpi" [routerLink]="['/statements/runs', st.id]"><div class="ico"><mat-icon>payments</mat-icon></div><div class="label">Statements · {{ st.statementMonth | month }}</div><div class="value">{{ st.payTotal | rand }}</div><div class="sub">{{ st.status }} · {{ st.reps }} reps · {{ st.earningsTotal | rand }} earned</div></div> }
  </div>

  <div class="grid3">
    <div class="panel">
      <h2>Revenue, payouts and profit by month</h2>
      @if (months().length) { <app-chart type="bar" [labels]="chartLabels()" [datasets]="chartSets()" [height]="260" [money]="true" /> }
      @else { <div class="empty">No earnings runs yet. Import the monthly statement and run earnings.</div> }
    </div>
    <div class="panel">
      <h2>Stock by position</h2>
      @if (stock(); as s) { <app-chart type="doughnut" [labels]="['Warehouse','Packed','With reps','With agents','In shops','To check']" [datasets]="[{ data: [s.inWarehouse||0, s.packed||0, s.withReps||0, s.withAgents||0, s.withShops||0, (s.returnedCheck||0)+(s.quarantine||0)] }]" [height]="260" /> }
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2>Top earners · {{ latestPnl()?.period | month }}</h2>
      @if (top().length) { <app-chart type="bar" [labels]="topLabels()" [datasets]="[{ label: 'Earned', data: topData() }]" [height]="220" [money]="true" [options]="{ indexAxis: 'y', plugins: { legend: { display: false } } }" /> }
      @else { <div class="empty">No earnings for the latest month.</div> }
    </div>
    <div class="panel">
      <h2>Network file coverage</h2>
      <app-table [cols]="covCols" [rows]="cov()" [filterable]="false" [clickable]="false" empty="No files imported yet." />
    </div>
  </div>

  <div class="panel">
    <h2>Recent stock movements</h2>
    <app-table [cols]="moveCols" [rows]="moves()" [filterable]="false" [clickable]="false" empty="No movements yet." />
  </div>`,
})
export class HomePage {
  auth = inject(AuthService);
  private api = inject(ApiClient);
  private companies = inject(CompanyService);
  stock = signal<StockSummary | null>(null);
  cov = signal<CoverageRow[]>([]);
  lastStatement = signal<AccountRunView | null>(null);
  months = signal<PnlView[]>([]);
  top = signal<PartyEarningsView[]>([]);
  moves = signal<MovementView[]>([]);
  latestPnl = computed(() => { const live = this.months().filter(m => (m.supplierRevenue ?? 0) !== 0 || (m.grossProfit ?? 0) !== 0); return live.length ? live[live.length - 1] : (this.months().length ? this.months()[this.months().length - 1] : null); });
  chartLabels = computed(() => this.months().map(m => new MonthPipe().transform(m.period)));
  chartSets = computed(() => [
    { label: 'Revenue', data: this.months().map(m => m.supplierRevenue ?? 0) },
    { label: 'Payouts', data: this.months().map(m => m.payouts ?? 0) },
    { label: 'SIM cost', data: this.months().map(m => m.simCost ?? 0) },
    { label: 'Gross profit', data: this.months().map(m => m.grossProfit ?? 0), type: 'line' as const, borderWidth: 2, tension: .3, backgroundColor: 'transparent' },
  ]);
  topLabels = computed(() => this.top().map(p => p.partyName ?? ''));
  topData = computed(() => this.top().map(p => p.total ?? 0));
  covCols: Col[] = [{ key: 'kind', label: 'Kind' }, { key: 'events', label: 'Events', type: 'qty' }, { key: 'latestEventDate', label: 'Latest', type: 'date' }];
  moveCols: Col[] = [{ key: 'movedAt', label: 'When', type: 'datetime' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'fromName', label: 'From' }, { key: 'toName', label: 'To' }, { key: 'serialCount', label: 'SIMs', type: 'qty' }, { key: 'movedByName', label: 'By' }];

  constructor() {
    const companyId = this.companies.param();
    if (this.auth.has('stock.view')) {
      this.api.call(summary, { companyId }).subscribe(s => this.stock.set(s));
      this.api.call(movements, { companyId, size: 8 }).subscribe(p => this.moves.set(p.items ?? []));
    }
    if (this.auth.has('files.view')) this.api.call(coverage, { size: 100 }).subscribe(c => this.cov.set(c.items ?? []));
    if (this.auth.has('ledger.view')) this.api.call(runs, { size: 1 }).subscribe(r => this.lastStatement.set(r.items?.[0] ?? null));
    if (this.auth.has('earnings.view')) {
      this.api.call(runs1, { companyId, size: 100 }).subscribe(pg => { const rs = pg.items ?? [];
        const done = rs.filter(r => r.status === 'DONE' || r.status === 'APPROVED');
        const periods = Array.from(new Set(done.map(r => (r.period ?? '').slice(0, 7)))).sort().slice(-6);
        const cid = companyId ?? done[0]?.companyId;
        if (!periods.length || !cid) return;
        forkJoin(periods.map(p => this.api.call(pnl, { companyId: cid, period: p }))).subscribe(list => {
          this.months.set(list);
          const lp = this.latestPnl(); this.api.call(parties1, { companyId, period: (lp?.period ?? periods[periods.length - 1]).slice(0, 7), size: 8, sort: 'total,desc' }).subscribe(t => this.top.set(t.items ?? []));
        });
      });
    }
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, MatButtonModule, PageHeader],
  template: `<app-page title="Not allowed" subtitle="Your roles do not include the permission for this page." /><a mat-button routerLink="/">Home</a>`,
})
export class ForbiddenPage {}
