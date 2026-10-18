import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { coverage, holdings, onHand, summary } from '../../api/functions';
import { CoverageRow, HoldingRow, StockOnHandRow, StockSummary } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Stock & files" subtitle="Where the SIMs are, how old the warehouse stock is, and whether the network files are up to date." />
  @if (sum(); as s) {
    <div class="cards">
      <div class="kpi"><div class="label">Warehouse</div><div class="value">{{ (s.inWarehouse||0)+(s.packed||0) | qty }}</div><div class="sub">{{ s.warehouseValueExcl | rand }} at cost</div></div>
      <div class="kpi"><div class="label">In the field</div><div class="value">{{ (s.withReps||0)+(s.withAgents||0)+(s.withShops||0) | qty }}</div><div class="sub">{{ s.withReps | qty }} reps · {{ s.withAgents | qty }} agents · {{ s.withShops | qty }} shops</div></div>
      <div class="kpi"><div class="label">To check / quarantine</div><div class="value">{{ (s.returnedCheck||0)+(s.quarantine||0) | qty }}</div></div>
    </div>
  }
  <div class="grid2">
    <div class="panel"><h2>Warehouse stock by age</h2>
      @for (r of aged(); track $index) { <div class="arow"><span>{{ r.companyCode }} {{ r.warehouseCode }} · {{ r.productCode }} <span class="tag">{{ r.status }}</span></span><span>{{ r.qty | qty }}</span><span [class.neg]="(r.oldestDays||0) > 60" [class.warn]="(r.oldestDays||0) > 30">{{ r.oldestDays }} days</span></div> } @empty { <div class="empty">No warehouse stock.</div> }
    </div>
    <div class="panel"><h2>Biggest holders</h2>
      @for (h of holders(); track $index) { <div class="arow"><span>{{ h.partyName }} <span class="tag">{{ h.kind }}</span></span><span>{{ h.dealName || '' }}</span><b>{{ h.qty | qty }}</b></div> } @empty { <div class="empty">Nothing in the field.</div> }
    </div>
  </div>
  @if (auth.has('files.view')) { <h2>Network file coverage</h2><app-table [cols]="covCols" [rows]="cov()" /> }`,
  styles: [`.arow { display: grid; grid-template-columns: 1fr 90px 90px; gap: 8px; padding: 5px 0; border-bottom: 1px dashed #e5e7eb; } .arow span:nth-child(2), .arow b { text-align: right; }`],
})
export class StockDashPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient);
  sum = signal<StockSummary | null>(null); aged = signal<StockOnHandRow[]>([]); holders = signal<HoldingRow[]>([]); cov = signal<CoverageRow[]>([]);
  covCols: Col[] = [{ key: 'supplierName', label: 'Supplier' }, { key: 'kind', label: 'Kind' }, { key: 'events', label: 'Events', type: 'qty' }, { key: 'files', label: 'Files', type: 'qty' }, { key: 'latestEventDate', label: 'Latest event', type: 'date' }, { key: 'latestPeriod', label: 'Latest period', type: 'month' }];
  constructor() {
    const companyId = this.companies.param();
    this.api.call(summary, { companyId }).subscribe(s => this.sum.set(s));
    this.api.call(onHand, { companyId, warehouseOnly: true, size: 12, sort: 'oldestDays,desc' }).subscribe(r => this.aged.set(r.items ?? []));
    this.api.call(holdings, { size: 12, sort: 'qty,desc' }).subscribe(h => this.holders.set(h.items ?? []));
    if (this.auth.has('files.view')) this.api.call(coverage, { size: 100 }).subscribe(c => this.cov.set(c.items ?? []));
  }
}
