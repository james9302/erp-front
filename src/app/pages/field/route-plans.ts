import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { areas, buildRoutePlan, parties, routePlans } from '../../api/functions';
import { PlanRow } from '../../api/models';

/** Route plans: who goes where on which day. Build one from an area (or from streets picked on the Streets page), optimise, publish. */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Route plans" subtitle="A plan is a set of days: each day one rep or agent and an ordered list of shops to visit, optimised by the route service. Due shops come first; shops inside a no-go zone are never planned. Visits and hand-overs tick the stops off.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [ngModel]="status" (ngModelChange)="status = $event; state.refresh()"><mat-option [value]="''">Any</mat-option>@for (s of ['DRAFT','PUBLISHED','DONE','CANCELLED']; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
    @if (auth.has('route.plan')) { <button mat-flat-button (click)="plan()"><mat-icon>add_road</mat-icon> New plan</button> }
  </app-page>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="router.navigate(['/route-plans', $event.id])" empty="No route plan yet. Build one from an area, or pick streets on the Streets page." />`,
})
export class RoutePlansPage {
  auth = inject(AuthService); router = inject(Router); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  status = ''; rows = signal<PlanRow[]>([]); state = new ListState(() => this.load());
  cols: Col[] = [{ key: 'name', label: 'Plan' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'areaName', label: 'Area' }, { key: 'companyCode', label: 'Company' }, { key: 'days', label: 'Days', type: 'qty' },
    { key: 'stops', label: 'Stops', type: 'qty' }, { key: 'visited', label: 'Visited', type: 'qty' }, { key: 'skipped', label: 'Skipped', type: 'qty' }, { key: 'createdAt', label: 'Created', type: 'date' }];
  constructor() {
    this.load();
    const qp = inject(ActivatedRoute).snapshot.queryParamMap;
    const streets = qp.get('streets'); if (streets) { this.router.navigate([], { queryParams: {}, replaceUrl: true }); this.plan({ streetIds: streets.split(',').map(Number).filter(Boolean), title: 'Route over ' + (qp.get('title') || 'picked streets') }); }
  }
  load(): void { this.api.call(routePlans, { companyId: this.companies.param(), status: this.status || undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }

  /** Plan from an area: the suburbs are offered by name; streets are picked on the Streets page instead. */
  async plan(preset: { streetIds?: number[]; areaId?: number; title?: string } = {}): Promise<void> {
    const reps = await this.api.items(parties, { kind: 'REP', size: 500, active: true });
    const agents = await this.api.items(parties, { kind: 'FIELD_AGENT', size: 500, active: true });
    const subs = preset.streetIds?.length ? [] : (await this.api.list(areas, { kind: 'SUBURB' })).filter(x => (x.shopCount ?? 0) > 0).sort((x, y) => (y.dueCount ?? 0) - (x.dueCount ?? 0)).slice(0, 400);
    const today = new Date().toISOString().slice(0, 10);
    const v = await this.dialogs.form({ title: preset.title ?? 'New route plan', submit: 'Build plan', width: '640px',
      subtitle: preset.streetIds?.length ? `${preset.streetIds.length} street(s) picked on the map.` : 'Pick a suburb (sorted by due shops); the plan takes the due shops there, nearest first.',
      initial: { startDate: today, days: 5, stopsPerDay: 25, serviceMin: 10, dueOnly: true, skipWeekends: true, areaId: preset.areaId, companyId: this.companies.defaultId() },
      fields: [
        { key: 'name', label: 'Name', required: true, wide: true },
        ...(preset.streetIds?.length ? [] : [{ key: 'areaId', label: 'Suburb', type: 'select' as const, required: true, wide: true, options: subs.map(a => opt(a.id, `${a.name} · ${a.parentName ?? ''} · ${a.dueCount} due / ${a.shopCount}`)) }]),
        { key: 'repPartyIds', label: 'Reps / agents (hold Ctrl for several)', type: 'select', required: true, wide: true, options: [...reps.map(r => opt(r.id, 'REP · ' + r.name)), ...agents.map(r => opt(r.id, 'AGENT · ' + r.name))], multiple: true },
        { key: 'companyId', label: 'Company', type: 'select', options: this.companies.companies().map(c => opt(c.id, c.code!)) },
        { key: 'startDate', label: 'First day', type: 'date', required: true }, { key: 'days', label: 'Days', type: 'number', required: true },
        { key: 'stopsPerDay', label: 'Stops per rep per day', type: 'number', required: true }, { key: 'serviceMin', label: 'Minutes per stop', type: 'number', required: true },
        { key: 'dueOnly', label: 'Due shops only', type: 'checkbox' }, { key: 'skipWeekends', label: 'Skip weekends', type: 'checkbox' },
        { key: 'notes', label: 'Notes', wide: true }] }); if (!v) return;
    const body = { ...v, repPartyIds: Array.isArray(v.repPartyIds) ? v.repPartyIds : [v.repPartyIds], streetIds: preset.streetIds, companyId: v.companyId || undefined, areaId: v.areaId || undefined, notes: v.notes || undefined };
    this.api.call(buildRoutePlan, { body }).subscribe({ next: d => { this.toast.ok(`Plan built: ${d.plan?.days} day(s), ${d.plan?.stops} stops`); this.router.navigate(['/route-plans', d.plan!.id]); }, error: e => this.toast.error(e) });
  }
}
