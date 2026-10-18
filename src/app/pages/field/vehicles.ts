import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, Field, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { assignVehicle, createVehicle, endAssignment, fuelClaims, parties, updateVehicle, vehicle, vehicleAssignments, vehicleDays, vehicles } from '../../api/functions';
import { AssignmentView, FuelClaimView, VehicleDayView, VehicleView } from '../../api/models';

const STATUSES = ['ACTIVE', 'WORKSHOP', 'RETIRED'];

/** The vehicle register: who drives what, each van's logbook days and fuel, and the SARS logbook CSV (docs/VEHICLES.md 3.5). */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Vehicles" subtitle="The company vans, who is assigned to each and from when, the per-day odometer logbook with photo proof, and the fuel put in. The logbook CSV per vehicle and month is the SARS record.">
    @if (auth.has('vehicle.manage')) { <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New vehicle</button> }
  </app-page>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [(ngModel)]="status" (valueChange)="state.refresh()"><mat-option [value]="''">Any</mat-option>@for (s of statuses; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
  </div>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)" empty="No vehicles yet. Add one, or import the register from the old ERP (Fleet import)." />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel()?.regNo || ''" [subtitle]="(sel()?.make || '') + ' ' + (sel()?.model || '')" width="min(760px, 96vw)">
    @if (sel(); as v) {
      <div>
        <div class="row" style="align-items:center"><span class="tag" [class.ok]="v.status==='ACTIVE'" [class.warn]="v.status==='WORKSHOP'" [class.bad]="v.status==='RETIRED'">{{ v.status }}</span>
          @if (v.currentRepName) { <span class="tag info">{{ v.currentRepName }}</span> } @else { <span class="tag warn">nobody assigned</span> }</div>
        <div class="kv" style="margin:10px 0">
          <span>Fuel / tank</span><span>{{ v.fuelType || '—' }} · {{ v.tankLitres || '?' }} l · expected {{ v.expectedLPer100km || '?' }} l/100 km</span>
          <span>Company</span><span>{{ v.companyCode || '—' }} · monthly charge {{ v.monthlyCharge | rand:'—' }}</span>
          <span>Last reading</span><span>{{ v.lastReading | qty }} km</span>
          <span>Tracker</span><span>{{ v.trackerDevice || '—' }} {{ v.legacyId ? '· old ERP ' + v.legacyId : '' }}</span>
          @if (v.notes) { <span>Notes</span><span>{{ v.notes }}</span> }
        </div>
        <div class="row" style="align-items:center">
          @if (auth.has('vehicle.manage')) { <button mat-stroked-button (click)="edit(v)"><mat-icon>edit</mat-icon> Edit</button><button mat-flat-button (click)="assign(v)"><mat-icon>person_add</mat-icon> Assign</button> }
          <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px"><mat-label>Month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM"></mat-form-field>
          <button mat-stroked-button (click)="csv(v)"><mat-icon>download</mat-icon> Logbook CSV</button>
        </div>
        <mat-tab-group style="margin-top:12px">
          <mat-tab label="Assignments"><p class="muted">Effective-dated, no overlaps per vehicle or per rep. Click an open assignment to end it.</p>
            <app-table [cols]="asgCols" [rows]="assignments()" [filterable]="false" [paged]="false" (pick)="end(v, $event)" empty="Never assigned." /></mat-tab>
          <mat-tab label="Days"><app-table [cols]="dayCols" [rows]="days()" [filterable]="false" [clickable]="false" empty="No logbook days yet." /></mat-tab>
          <mat-tab label="Fuel"><app-table [cols]="fuelCols" [rows]="fuel()" [filterable]="false" [clickable]="false" empty="No fuel recorded." /></mat-tab>
        </mat-tab-group>
      </div>
    }
  </app-drawer>`,
  styles: [`.kv { display: grid; grid-template-columns: 120px 1fr; gap: 4px 10px; font-size: 13px; } .kv > span:nth-child(odd) { color: var(--ink-3); }`],
})
export class VehiclesPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  statuses = STATUSES; status = ''; month = yyyyMm();
  rows = signal<VehicleView[]>([]); state = new ListState(() => this.load()); sel = signal<VehicleView | null>(null);
  assignments = signal<AssignmentView[]>([]); days = signal<VehicleDayView[]>([]); fuel = signal<FuelClaimView[]>([]);
  cols: Col[] = [{ key: 'regNo', label: 'Reg no' }, { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'companyCode', label: 'Company' },
    { key: 'currentRepName', label: 'Driver' }, { key: 'lastReading', label: 'Last km', type: 'qty' }, { key: 'tankLitres', label: 'Tank l', type: 'qty' }, { key: 'monthlyCharge', label: 'Charge / month', type: 'rand' }];
  asgCols: Col[] = [{ key: 'repName', label: 'Rep / agent' }, { key: 'validFrom', label: 'From', type: 'date' }, { key: 'validTo', label: 'To', type: 'date' }, { key: 'reason', label: 'Reason' }, { key: 'endedAt', label: 'Ended', type: 'datetime' }];
  dayCols: Col[] = [{ key: 'day', label: 'Day', type: 'date' }, { key: 'repName', label: 'Driver' }, { key: 'startReading', label: 'Start', type: 'qty' }, { key: 'endReading', label: 'End', type: 'qty' }, { key: 'kmBusiness', label: 'Business km', type: 'qty' },
    { key: 'kmPrivate', label: 'Private km', type: 'qty' }, { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'flags', label: 'Flags', type: 'tags' }];
  fuelCols: Col[] = [{ key: 'filledAt', label: 'Filled', type: 'datetime' }, { key: 'repName', label: 'Rep' }, { key: 'litres', label: 'Litres' }, { key: 'amount', label: 'Amount', type: 'rand' }, { key: 'odometerReading', label: 'Reading', type: 'qty' },
    { key: 'paidBy', label: 'Paid by', type: 'tag' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'flags', label: 'Flags', type: 'tags' }, { key: 'statementMonth', label: 'Statement', type: 'month' }];

  constructor() { this.load(); }
  load(): void { this.api.call(vehicles, { status: this.status || undefined, companyId: this.companies.param(), ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }
  open(v: VehicleView): void {
    this.sel.set(v); this.assignments.set([]); this.days.set([]); this.fuel.set([]);
    this.api.call(vehicleAssignments, { id: v.id! }).subscribe(a => this.assignments.set(a));
    this.api.call(vehicleDays, { vehicleId: v.id!, size: 100 }).subscribe(p => this.days.set(p.items ?? []));
    this.api.call(fuelClaims, { vehicleId: v.id!, size: 100 }).subscribe(p => this.fuel.set(p.items ?? []));
  }
  private reopen(id: number): void { this.load(); this.api.call(vehicle, { id }).subscribe(v => this.open(v)); }
  private fields(): Field[] {
    return [{ key: 'regNo', label: 'Registration (e.g. CA123456)', required: true }, { key: 'status', label: 'Status', type: 'select', required: true, options: STATUSES.map(s => opt(s, s)) },
      { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'fuelType', label: 'Fuel type (ULP95, DIESEL)' },
      { key: 'companyId', label: 'Company', type: 'select', options: this.companies.companies().map(c => opt(c.id, c.code!)) },
      { key: 'tankLitres', label: 'Tank (litres)', type: 'number' }, { key: 'expectedLPer100km', label: 'Expected l / 100 km', type: 'number', step: 0.1 },
      { key: 'monthlyCharge', label: 'Monthly charge to the rep (R)', type: 'number', step: 0.01 }, { key: 'trackerDevice', label: 'Tracker device' }, { key: 'notes', label: 'Notes', wide: true }];
  }
  private body(v: any): any { return { ...v, regNo: String(v.regNo || '').toUpperCase().replace(/\s+/g, ''), companyId: v.companyId || undefined, tankLitres: num(v.tankLitres), expectedLPer100km: num(v.expectedLPer100km), monthlyCharge: num(v.monthlyCharge), make: v.make || undefined, model: v.model || undefined, fuelType: v.fuelType || undefined, trackerDevice: v.trackerDevice || undefined, notes: v.notes || undefined }; }
  async create(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New vehicle', fields: this.fields(), submit: 'Create', initial: { status: 'ACTIVE', make: 'Suzuki', model: 'Eeco', fuelType: 'ULP95', tankLitres: 32, expectedLPer100km: 5.4, companyId: this.companies.defaultId() } }); if (!v) return;
    this.api.call(createVehicle, { body: this.body(v) }).subscribe({ next: r => { this.toast.ok('Created'); this.reopen(r.id!); }, error: e => this.toast.error(e) });
  }
  async edit(cur: VehicleView): Promise<void> {
    const v = await this.dialogs.form({ title: 'Edit ' + cur.regNo, fields: this.fields(), initial: cur }); if (!v) return;
    this.api.call(updateVehicle, { id: cur.id!, body: this.body(v) }).subscribe({ next: () => { this.toast.ok('Saved'); this.reopen(cur.id!); }, error: e => this.toast.error(e) });
  }
  async assign(cur: VehicleView): Promise<void> {
    const reps = await this.api.items(parties, { kind: 'REP', size: 500, active: true });
    const agents = await this.api.items(parties, { kind: 'FIELD_AGENT', size: 500, active: true });
    const v = await this.dialogs.form({ title: 'Assign ' + cur.regNo, subtitle: 'From the date given until ended. A rep with another van on those dates, or a van with another driver, is refused.', submit: 'Assign', width: '520px',
      initial: { validFrom: new Date().toISOString().slice(0, 10) }, fields: [
        { key: 'repPartyId', label: 'Rep / agent', type: 'select', required: true, wide: true, options: [...reps.map(r => opt(r.id, 'REP · ' + r.name)), ...agents.map(r => opt(r.id, 'AGENT · ' + r.name))] },
        { key: 'validFrom', label: 'From', type: 'date', required: true }, { key: 'validTo', label: 'To (optional, exclusive)', type: 'date' }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    this.api.call(assignVehicle, { id: cur.id!, body: { repPartyId: v.repPartyId, validFrom: v.validFrom, validTo: v.validTo || undefined, reason: v.reason || undefined } }).subscribe({ next: () => { this.toast.ok('Assigned'); this.reopen(cur.id!); }, error: e => this.toast.error(e) });
  }
  async end(cur: VehicleView, a: AssignmentView): Promise<void> {
    if (!this.auth.has('vehicle.manage') || a.endedAt || (a.validTo && a.validTo <= new Date().toISOString().slice(0, 10))) return;
    const v = await this.dialogs.form({ title: `End ${a.repName}'s assignment to ${cur.regNo}`, submit: 'End', width: '440px', initial: { on: new Date().toISOString().slice(0, 10) }, fields: [
      { key: 'on', label: 'Last day driven', type: 'date', required: true, wide: true }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    this.api.call(endAssignment, { id: cur.id!, assignmentId: a.id!, on: v.on, reason: v.reason || undefined }).subscribe({ next: () => { this.toast.ok('Ended'); this.reopen(cur.id!); }, error: e => this.toast.error(e) });
  }
  csv(v: VehicleView): void {
    const m = (this.month || yyyyMm()).trim();
    this.api.text(`/api/v1/vehicles/${v.id}/logbook.csv?month=${m}`).subscribe({ next: t => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = `logbook-${v.regNo}-${m}.csv`; a.click();
    }, error: e => this.toast.error(e) });
  }
}

function num(v: unknown): number | undefined { return v === '' || v == null ? undefined : Number(v); }
