import { Component, computed, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { ChartComponent, PALETTE } from '../../shared/chart';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { yyyyMm } from '../../core/pipes';
import { fieldActivity, fieldCoverage, fieldCoverageWeeks, surveyCoverage } from '../../api/functions';
import { ActivityRow, AreaCoverageRow, CoverageWeek, SurveyCoverageRow } from '../../api/models';
import { familyLabel } from '../setup/survey-types';

/** Coverage: which areas the field team reaches, week by week, and what each rep and agent did. Drill province > district > suburb. */
@Component({
  standalone: true, imports: [UI, PageHeader, ChartComponent],
  template: `
  <app-page title="Field coverage" subtitle="Shops reached in the window against shops on record, by area and by week. A shop is due when nobody visited it within the due window; a visit is a check-in or a hand-over.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px"><mat-label>Weeks</mat-label><mat-select [ngModel]="weeks" (ngModelChange)="weeks = $event; reload()">@for (w of [4, 8, 12, 26, 52]; track w) { <mat-option [value]="w">{{ w }}</mat-option> }</mat-select></mat-form-field>
  </app-page>
  @if (total(); as t) {
    <div class="cards">
      <div class="kpi"><div class="label">Shops on record</div><div class="value">{{ t.shops | qty }}</div><div class="sub">{{ t.newShops | qty }} found in the window</div><div class="ico"><mat-icon>storefront</mat-icon></div></div>
      <div class="kpi"><div class="label">Reached</div><div class="value">{{ t.visited | qty }}</div><div class="sub">{{ t.coveragePct }}% of shops · {{ t.visits | qty }} visits</div><div class="ico"><mat-icon>where_to_vote</mat-icon></div></div>
      <div class="kpi"><div class="label">Due a visit</div><div class="value">{{ t.due | qty }}</div><div class="sub">older than the due window</div><div class="ico"><mat-icon>schedule</mat-icon></div></div>
      <div class="kpi"><div class="label">Route stops</div><div class="value">{{ t.visitedStops | qty }} / {{ t.plannedStops | qty }}</div><div class="sub">{{ t.skippedStops | qty }} skipped</div><div class="ico"><mat-icon>alt_route</mat-icon></div></div>
    </div>
  }
  <div class="grid2">
    <div class="panel"><h2>Week by week{{ crumbName() ? ' · ' + crumbName() : '' }}</h2>
      <app-chart type="bar" [labels]="weekLabels()" [datasets]="weekSets()" [height]="260" /></div>
    <div class="panel"><h2>By area · due vs reached</h2>
      <div class="crumbs">@for (c of crumbs(); track c.id; let i = $index) { <a (click)="drill(i)">{{ c.name }}</a>@if (!$last) { <mat-icon>chevron_right</mat-icon> } }</div>
      <app-chart type="bar" [labels]="areaLabels()" [datasets]="areaSets()" [height]="230" [options]="{ indexAxis: 'y' }" />
    </div>
  </div>
  <div class="panel"><h2>Areas{{ crumbName() ? ' in ' + crumbName() : '' }} <span class="muted" style="font-weight:400">· click a row to drill down</span></h2>
    <app-table [cols]="areaCols" [rows]="areaRows()" [pageSize]="15" (pick)="into($event)" />
  </div>
  <div class="panel"><h2>Field activity · last {{ actWeeks }} weeks</h2>
    <app-table [cols]="actCols" [rows]="activity()" [pageSize]="15" [clickable]="false" />
  </div>
  @if (auth.hasAny('survey.review', 'survey.manage')) {
    <div class="panel"><h2 class="row">Surveys this month <span class="muted" style="font-weight:400">· eligible shops against shops surveyed in the month's cycle; rejected surveys do not count as done</span>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px;margin-left:auto"><mat-label>Month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM" (change)="loadSurveys()"></mat-form-field></h2>
      @for (g of surveyGroups(); track g.family) {
        <h3 class="fam"><span class="tag">{{ familyLabel(g.family) }}</span> <span class="muted">{{ g.rows.length }} type(s) · {{ g.done }} shop(s) surveyed · {{ g.surveys }} survey(s)</span></h3>
        <app-table [cols]="surveyCols" [rows]="g.rows" [pageSize]="15" [clickable]="false" />
      }
      @if (!surveys().length) { <div class="empty">No active survey types.</div> }
      <p class="muted" style="margin:6px 0 0">The per-family dashboards (mystery by fiscal week, red audits by shop category) are under Field → Survey dashboards.</p>
    </div>
  }`,
  styles: [`.row { display: flex; align-items: center; gap: 8px; } .fam { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 10px 0 4px; } .crumbs { display: flex; align-items: center; gap: 2px; font-size: 12px; margin-bottom: 6px; } .crumbs a { cursor: pointer; } .crumbs mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--ink-3); }`],
})
export class CoverageDashPage {
  private api = inject(ApiClient); auth = inject(AuthService);
  weeks = 12; actWeeks = 4; month = yyyyMm();
  surveys = signal<SurveyCoverageRow[]>([]); familyLabel = familyLabel;
  surveyGroups = computed(() => {
    const m = new Map<string, SurveyCoverageRow[]>();
    for (const r of this.surveys()) { const k = r.family ?? ''; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()].map(([family, rows]) => ({ family, rows, done: rows.reduce((n, r) => n + (r.doneShops ?? 0), 0), surveys: rows.reduce((n, r) => n + (r.surveys ?? 0), 0) }));
  });
  surveyCols: Col[] = [{ key: 'name', label: 'Survey type' }, { key: 'cycleKey', label: 'Cycle', type: 'tag' }, { key: 'eligibleShops', label: 'Eligible', type: 'qty' }, { key: 'doneShops', label: 'Done', type: 'qty' }, { key: 'coveredPct', label: '% covered', type: 'pct' }, { key: 'surveys', label: 'Surveys', type: 'qty' }, { key: 'reviewed', label: 'Reviewed', type: 'qty' }, { key: 'rejected', label: 'Rejected', type: 'qty' }, { key: 'avgScorePct', label: 'Avg score %', type: 'pct' }];
  rows = signal<AreaCoverageRow[]>([]); weeksData = signal<CoverageWeek[]>([]); activity = signal<ActivityRow[]>([]);
  crumbs = signal<{ id: number | null; name: string }[]>([{ id: null, name: 'South Africa' }]);
  total = signal<AreaCoverageRow | null>(null);
  areaCols: Col[] = [{ key: 'name', label: 'Area' }, { key: 'shops', label: 'Shops', type: 'qty' }, { key: 'due', label: 'Due', type: 'qty' }, { key: 'visited', label: 'Reached', type: 'qty' }, { key: 'coveragePct', label: 'Coverage %', type: 'qty' }, { key: 'visits', label: 'Visits', type: 'qty' }, { key: 'plannedStops', label: 'Planned', type: 'qty' }, { key: 'visitedStops', label: 'Done', type: 'qty' }, { key: 'newShops', label: 'New', type: 'qty' }];
  actCols: Col[] = [{ key: 'name', label: 'Rep / agent' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'visits', label: 'Visits', type: 'qty' }, { key: 'shopsVisited', label: 'Shops', type: 'qty' }, { key: 'checkins', label: 'Check-ins', type: 'qty' }, { key: 'handovers', label: 'Hand-overs', type: 'qty' }, { key: 'stopsVisited', label: 'Stops done', type: 'qty' }, { key: 'stopsPlanned', label: 'Planned', type: 'qty' }, { key: 'stopsSkipped', label: 'Skipped', type: 'qty' }, { key: 'routeDays', label: 'Days', type: 'qty' }, { key: 'kmPlanned', label: 'km', type: 'qty' }, { key: 'lastVisitAt', label: 'Last visit', type: 'datetime' }];
  weekLabels = signal<string[]>([]); weekSets = signal<any[]>([]); areaLabels = signal<string[]>([]); areaSets = signal<any[]>([]);

  constructor() { this.reload(); this.api.call(fieldActivity, { weeks: this.actWeeks }).subscribe(a => this.activity.set(a)); this.loadSurveys(); }
  loadSurveys(): void { if (!this.auth.hasAny('survey.review', 'survey.manage')) return; this.api.call(surveyCoverage, { month: this.month }).subscribe(r => this.surveys.set(r)); }
  crumbName(): string { const c = this.crumbs(); return c.length > 1 ? c[c.length - 1].name : ''; }
  areaRows = computed(() => this.rows().filter(r => r.kind !== 'TOTAL'));
  reload(): void {
    const cur = this.crumbs()[this.crumbs().length - 1];
    this.api.call(fieldCoverage, { parentId: cur.id ?? undefined, weeks: this.weeks }).subscribe(r => {
      this.rows.set(r); this.total.set(r.find(x => x.kind === 'TOTAL') ?? null);
      const top = r.filter(x => x.kind !== 'TOTAL').slice(0, 12);
      this.areaLabels.set(top.map(x => x.name!)); this.areaSets.set([{ label: 'Due', data: top.map(x => x.due), backgroundColor: PALETTE[5] }, { label: 'Reached', data: top.map(x => x.visited), backgroundColor: PALETTE[3] }]);
    });
    this.api.call(fieldCoverageWeeks, { areaId: cur.id ?? undefined, weeks: this.weeks }).subscribe(w => {
      this.weeksData.set(w); this.weekLabels.set(w.map(x => (x.weekStart ?? '').slice(5)));
      this.weekSets.set([{ label: 'Shops reached', data: w.map(x => x.shopsVisited), backgroundColor: PALETTE[0] }, { label: 'Stops done', data: w.map(x => x.visitedStops), backgroundColor: PALETTE[3] },
        { label: 'Stops planned', data: w.map(x => x.plannedStops), backgroundColor: PALETTE[2] }, { label: 'New shops', data: w.map(x => x.newShops), type: 'line', borderColor: PALETTE[1], backgroundColor: PALETTE[1] }]);
    });
  }
  into(r: AreaCoverageRow): void { if (r.kind === 'SUBURB' || !r.areaId) return; this.crumbs.set([...this.crumbs(), { id: r.areaId, name: r.name! }]); this.reload(); }
  drill(i: number): void { this.crumbs.set(this.crumbs().slice(0, i + 1)); this.reload(); }
}
