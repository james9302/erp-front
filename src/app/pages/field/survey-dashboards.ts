import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { ChartComponent, PALETTE } from '../../shared/chart';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { Toast } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { surveyFiscalMonths, surveyMysteryDashboard, surveyRedAuditDashboard } from '../../api/functions';
import { FiscalMonthView, MysteryDashboard, RedAuditDashboard } from '../../api/models';

/**
 * Field > Survey dashboards, one tab per family. Mystery follows the old CCBSA dashboard: a fiscal month, its fiscal weeks,
 * shops done against eligible by province and the reps' counts. Red audit is by shop category and type for a calendar
 * month with the average score and the review state. Done = not rejected; pending = still awaiting review.
 */
@Component({
  standalone: true, imports: [UI, PageHeader, ChartComponent],
  template: `
  <app-page title="Survey dashboards" subtitle="Mystery shopper by fiscal week and province (the CCBSA calendar), red audits by shop category and type. A rejected survey counts in neither; pending means submitted and not yet reviewed." />
  <mat-tab-group (selectedIndexChange)="tab = $event">
    <mat-tab label="Mystery shopper">
      <div class="toolbar" style="margin-top:8px">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:180px"><mat-label>Fiscal month</mat-label>
          <mat-select [ngModel]="fiscalMonth" (ngModelChange)="fiscalMonth = $event; loadMystery()">@for (m of months(); track m.key) { <mat-option [value]="m.key">{{ m.key }}{{ m.current ? ' · current' : '' }}</mat-option> }</mat-select></mat-form-field>
        @if (mystery(); as d) { <span class="muted">{{ d.from | when }} – {{ d.to | when }} · types {{ d.typeCodes?.join(', ') || 'none active' }}</span> }
      </div>
      @if (mystery(); as d) {
        <div class="cards">
          <div class="kpi"><div class="label">Eligible shops</div><div class="value">{{ d.eligibleShops | qty }}</div><div class="sub">by the active mystery types' rules</div><div class="ico"><mat-icon>storefront</mat-icon></div></div>
          <div class="kpi"><div class="label">Shops done</div><div class="value">{{ d.doneShops | qty }}</div><div class="sub">{{ pct(d.doneShops, d.eligibleShops) }}% · {{ d.pendingShops | qty }} still to do</div><div class="ico"><mat-icon>where_to_vote</mat-icon></div></div>
          <div class="kpi"><div class="label">Surveys</div><div class="value">{{ d.surveys | qty }}</div><div class="sub">{{ d.reviewed | qty }} reviewed · {{ d.submitted | qty }} pending · {{ d.rejected | qty }} rejected</div><div class="ico"><mat-icon>checklist</mat-icon></div></div>
          <div class="kpi"><div class="label">Average score</div><div class="value">{{ d.avgScorePct == null ? '—' : d.avgScorePct + ' %' }}</div><div class="sub">of the maximum, non-rejected surveys</div><div class="ico"><mat-icon>grade</mat-icon></div></div>
        </div>
        <div class="grid2">
          <div class="panel"><h2>By fiscal week</h2><app-chart type="bar" [labels]="weekLabels()" [datasets]="weekSets()" [height]="240" /></div>
          <div class="panel"><h2>By province · eligible vs done</h2><app-chart type="bar" [labels]="provLabels()" [datasets]="provSets()" [height]="240" [options]="{ indexAxis: 'y' }" /></div>
        </div>
        <div class="panel"><h2>Fiscal weeks of {{ d.fiscalMonth }}</h2><app-table [cols]="weekCols" [rows]="d.weeks ?? []" [clickable]="false" /></div>
        <div class="grid2">
          <div class="panel"><h2>By province</h2><app-table [cols]="provCols" [rows]="d.byProvince ?? []" [pageSize]="12" [clickable]="false" /></div>
          <div class="panel"><h2>By rep</h2><app-table [cols]="repCols" [rows]="d.byRep ?? []" [pageSize]="12" [clickable]="false" empty="No mystery surveys in this fiscal month." /></div>
        </div>
      } @else if (loadError()) { <div class="empty">{{ loadError() }}</div> }
    </mat-tab>
    <mat-tab label="Red audit">
      <div class="toolbar" style="margin-top:8px">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px"><mat-label>Month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM" (change)="loadRed()"></mat-form-field>
      </div>
      @if (red(); as d) {
        <div class="cards">
          <div class="kpi"><div class="label">Red audits</div><div class="value">{{ d.grandTotal?.surveys | qty }}</div><div class="sub">{{ d.grandTotal?.shops | qty }} shops · {{ d.month }}</div><div class="ico"><mat-icon>fact_check</mat-icon></div></div>
          <div class="kpi"><div class="label">Average score</div><div class="value">{{ d.grandTotal?.avgScorePct == null ? '—' : d.grandTotal?.avgScorePct + ' %' }}</div><div class="sub">min {{ d.grandTotal?.minScorePct ?? '—' }} · max {{ d.grandTotal?.maxScorePct ?? '—' }}</div><div class="ico"><mat-icon>grade</mat-icon></div></div>
          <div class="kpi"><div class="label">Reviewed</div><div class="value">{{ d.grandTotal?.reviewed | qty }}</div><div class="sub">{{ d.grandTotal?.submitted | qty }} pending review</div><div class="ico"><mat-icon>task_alt</mat-icon></div></div>
          <div class="kpi"><div class="label">Rejected</div><div class="value">{{ d.grandTotal?.rejected | qty }}</div><div class="sub">slots freed for a redo</div><div class="ico"><mat-icon>block</mat-icon></div></div>
        </div>
        <div class="grid2">
          <div class="panel"><h2>By shop category · surveys and average score</h2><app-chart type="bar" [labels]="catLabels()" [datasets]="catSets()" [height]="240" /></div>
          <div class="panel"><h2>Totals by category</h2><app-table [cols]="totalCols" [rows]="d.totals ?? []" [clickable]="false" /></div>
        </div>
        <div class="panel"><h2>By shop category and type</h2><app-table [cols]="redCols" [rows]="d.rows ?? []" [pageSize]="20" [clickable]="false" empty="No red audits in this month." /></div>
      }
    </mat-tab>
  </mat-tab-group>`,
})
export class SurveyDashboardsPage {
  private api = inject(ApiClient); private toast = inject(Toast);
  tab = 0; fiscalMonth = ''; month = yyyyMm();
  months = signal<FiscalMonthView[]>([]); mystery = signal<MysteryDashboard | null>(null); red = signal<RedAuditDashboard | null>(null); loadError = signal('');
  weekLabels = signal<string[]>([]); weekSets = signal<any[]>([]); provLabels = signal<string[]>([]); provSets = signal<any[]>([]); catLabels = signal<string[]>([]); catSets = signal<any[]>([]);
  weekCols: Col[] = [{ key: 'cycleKey', label: 'Fiscal week', type: 'tag' }, { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To', type: 'date' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'done', label: 'Done', type: 'qty' },
    { key: 'shops', label: 'Shops', type: 'qty' }, { key: 'reviewed', label: 'Reviewed', type: 'qty' }, { key: 'pending', label: 'Pending', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }];
  provCols: Col[] = [{ key: 'name', label: 'Province' }, { key: 'eligibleShops', label: 'Eligible', type: 'qty' }, { key: 'doneShops', label: 'Done', type: 'qty' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'pending', label: 'Pending', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }, { key: 'avgScorePct', label: 'Avg %', type: 'pct' }];
  repCols: Col[] = [{ key: 'name', label: 'Rep' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'doneShops', label: 'Shops', type: 'qty' }, { key: 'reviewed', label: 'Reviewed', type: 'qty' }, { key: 'pending', label: 'Pending', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }, { key: 'avgScorePct', label: 'Avg %', type: 'pct' }];
  redCols: Col[] = [{ key: 'category', label: 'Category', type: 'tag' }, { key: 'typeName', label: 'Type' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'shops', label: 'Shops', type: 'qty' }, { key: 'avgScorePct', label: 'Avg %', type: 'pct' }, { key: 'minScorePct', label: 'Min %', type: 'pct' }, { key: 'maxScorePct', label: 'Max %', type: 'pct' },
    { key: 'reviewed', label: 'Reviewed', type: 'qty' }, { key: 'submitted', label: 'Pending', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }];
  totalCols: Col[] = [{ key: 'category', label: 'Category', type: 'tag' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'shops', label: 'Shops', type: 'qty' }, { key: 'avgScorePct', label: 'Avg %', type: 'pct' }, { key: 'reviewed', label: 'Reviewed', type: 'qty' }, { key: 'submitted', label: 'Pending', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }];

  pct(a?: number, b?: number): string { return b ? ((a ?? 0) * 100 / b).toFixed(1) : '0'; }
  constructor() {
    this.api.call(surveyFiscalMonths).subscribe(m => { this.months.set(m); this.fiscalMonth = m.find(x => x.current)?.key ?? m[m.length - 1]?.key ?? ''; this.loadMystery(); });
    this.loadRed();
  }
  loadMystery(): void {
    if (!this.fiscalMonth) { this.loadError.set('No fiscal calendar is loaded: upload docs/fiscal-calendar.csv at Setup → Imports (kind fiscal_calendar).'); return; }
    this.api.call(surveyMysteryDashboard, { fiscalMonth: this.fiscalMonth }).subscribe({
      next: d => {
        this.mystery.set(d); this.loadError.set('');
        const w = d.weeks ?? [];
        this.weekLabels.set(w.map(x => 'wk ' + x.week)); this.weekSets.set([{ label: 'Done', data: w.map(x => x.done), backgroundColor: PALETTE[3] }, { label: 'Pending review', data: w.map(x => x.pending), backgroundColor: PALETTE[1] }, { label: 'Rejected', data: w.map(x => x.rejected), backgroundColor: PALETTE[5] }]);
        const p = (d.byProvince ?? []).slice(0, 10);
        this.provLabels.set(p.map(x => x.name!)); this.provSets.set([{ label: 'Eligible', data: p.map(x => x.eligibleShops), backgroundColor: PALETTE[2] }, { label: 'Done', data: p.map(x => x.doneShops), backgroundColor: PALETTE[3] }]);
      },
      error: e => { this.mystery.set(null); this.loadError.set(e?.error?.detail || 'The mystery dashboard could not be loaded.'); this.toast.error(e); },
    });
  }
  loadRed(): void {
    this.api.call(surveyRedAuditDashboard, { month: this.month || undefined }).subscribe({
      next: d => {
        this.red.set(d);
        const t = d.totals ?? [];
        this.catLabels.set(t.map(x => x.category!)); this.catSets.set([{ label: 'Surveys', data: t.map(x => x.surveys), backgroundColor: PALETTE[0], yAxisID: 'y' }, { label: 'Avg score %', data: t.map(x => x.avgScorePct), type: 'line', borderColor: PALETTE[1], backgroundColor: PALETTE[1], yAxisID: 'y' }]);
      },
      error: e => this.toast.error(e),
    });
  }
}
