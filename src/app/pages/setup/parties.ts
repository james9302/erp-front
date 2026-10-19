import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, Field, opt } from '../../shared/dialogs';
import { Places, placeLine } from '../../shared/address-dialog';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { createParty, moveParty, myVehicle, parties, tree, updateParty } from '../../api/functions';
import { MyVehicle, PartyResponse } from '../../api/models';

const KINDS = ['REP', 'FIELD_AGENT', 'SHOP_AGENT', 'SHOP', 'SUPPLIER', 'CUSTOMER_SINK', 'COMPANY', 'WAREHOUSE'];

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Parties" subtitle="Reps, their agents and shops, suppliers and the customer sinks. The tree is the path stock follows; moving a party moves its whole subtree.">
    @if (auth.has('party.edit')) { <button mat-flat-button (click)="create()"><mat-icon>person_add</mat-icon> New party</button> }
  </app-page>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Search</mat-label><input matInput [(ngModel)]="q" (keyup.enter)="page = 0; load()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Kind</mat-label><mat-select [ngModel]="kind" (ngModelChange)="kind = $event; page = 0; load()"><mat-option [value]="''">Any</mat-option>@for (k of kinds; track k) { <mat-option [value]="k">{{ k }}</mat-option> }</mat-select></mat-form-field>
    <mat-checkbox [(ngModel)]="activeOnly" (change)="load()">Active only</mat-checkbox>
    <span class="grow"></span><span class="muted">{{ total() }} parties</span>
    <button mat-icon-button [disabled]="page===0" (click)="page = page - 1; load()"><mat-icon>chevron_left</mat-icon></button><button mat-icon-button [disabled]="(page+1)*size >= total()" (click)="page = page + 1; load()"><mat-icon>chevron_right</mat-icon></button>
  </div>
  <app-table [cols]="cols" [rows]="rows()" [paged]="false" [filterable]="false" (pick)="open($event)" />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel()?.name || ''" [subtitle]="sel()?.path || ''">
      @if (sel(); as p) {
        <div>
          <div class="row" style="align-items:center"><span class="tag info">{{ p.kind }}</span>@if (!p.active) { <span class="tag bad">inactive</span> }</div>
          <div class="muted" style="margin:6px 0 10px">ref {{ p.externalRef || '—' }} · mobile {{ p.mobile || '—' }} · under {{ p.parentName || '—' }}<br><span class="mono">{{ p.path }}</span>
            @if (p.place) { <br><mat-icon class="pin">location_on</mat-icon> {{ place(p.place) }} } @else if (p.kind !== 'COMPANY' && p.kind !== 'WAREHOUSE') { <br><span class="tag warn">no address</span> }</div>
          <div class="row">@if (auth.has('party.edit')) { <button mat-stroked-button (click)="edit(p)"><mat-icon>edit</mat-icon> Edit</button><button mat-stroked-button (click)="move(p)"><mat-icon>drive_file_move</mat-icon> Move</button> }
            @if (p.kind !== 'COMPANY' && p.kind !== 'WAREHOUSE') { <button mat-stroked-button (click)="address(p)"><mat-icon>{{ p.place ? 'location_on' : 'add_location_alt' }}</mat-icon> Address</button> }</div>
          @if ((p.kind === 'REP' || p.kind === 'FIELD_AGENT') && auth.hasAny('vehicle.manage', 'fuel.approve')) {
            <h2>Vehicle</h2>
            @if (veh(); as v) {
              @if (v.vehicle) {
                <div class="muted"><a routerLink="/vehicles">{{ v.vehicle.regNo }}</a> {{ v.vehicle.make }} {{ v.vehicle.model }} · since {{ v.assignment?.validFrom | when }}</div>
                @if (v.day) { <div class="muted" style="margin-top:4px">Today: start {{ v.day.startReading | qty }}{{ v.day.endReading ? ' · end ' + (v.day.endReading | qty) + ' · ' + (v.day.kmBusiness | qty) + ' business km' : ' · not parked off yet' }} <span class="tag" [class.bad]="v.day.flags?.length">{{ v.day.status }}</span></div> }
                @else { <div class="muted" style="margin-top:4px">No logbook row today.</div> }
                <app-table [cols]="fuelCols" [rows]="v.recentClaims || []" [filterable]="false" [clickable]="false" [paged]="false" empty="No fuel claims." />
              } @else { <div class="muted">{{ v.message || 'No vehicle assigned.' }}</div> }
            } @else { <div class="muted">…</div> }
          }
          <h2>Subtree</h2>
          @for (n of subtree(); track n.id) { <div [style.padding-left.px]="((n.depth ?? 0) - (p.depth ?? 0)) * 18" class="node clickable" (click)="open(n)"><span class="tag">{{ n.kind }}</span> {{ n.name }} <span class="muted">{{ n.externalRef }}</span></div> }
        </div>
      }
  </app-drawer>`,
  styles: [`.node { padding: 5px 6px; border-radius: 6px; } .node:hover { background: #f1f5f9; } .pin { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; color: var(--brand); }`],
})
export class PartiesPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs); private places = inject(Places);
  kinds = KINDS; place = placeLine;
  q = ''; kind = ''; activeOnly = true; page = 0; size = 25;
  rows = signal<PartyResponse[]>([]); total = signal(0); sel = signal<PartyResponse | null>(null); subtree = signal<PartyResponse[]>([]); veh = signal<MyVehicle | null>(null);
  fuelCols: Col[] = [{ key: 'filledAt', label: 'Filled', type: 'datetime' }, { key: 'amount', label: 'Amount', type: 'rand' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'flags', label: 'Flags', type: 'tags' }, { key: 'statementMonth', label: 'Statement', type: 'month' }];
  cols: Col[] = [{ key: 'kind', label: 'Kind', type: 'tag' }, { key: 'name', label: 'Name' }, { key: 'externalRef', label: 'Ref' }, { key: 'parentName', label: 'Under' }, { key: 'mobile', label: 'Mobile' }, { key: 'place.suburb', label: 'Suburb' }, { key: 'place.city', label: 'City' }, { key: 'active', label: 'Active', type: 'bool' }];

  constructor() { this.load(); }
  load(): void {
    this.api.call(parties, { q: this.q || undefined, kind: this.kind || undefined, active: this.activeOnly ? true : undefined, page: this.page, size: this.size })
      .subscribe(p => { this.rows.set(p.items ?? []); this.total.set(p.total ?? 0); });
  }
  open(p: PartyResponse): void {
    this.sel.set(p); this.veh.set(null); this.api.call(tree, { id: p.id! }).subscribe(t => this.subtree.set(t));
    if ((p.kind === 'REP' || p.kind === 'FIELD_AGENT') && this.auth.hasAny('vehicle.manage', 'fuel.approve')) this.api.call(myVehicle, { repPartyId: p.id! }).subscribe({ next: v => this.veh.set(v), error: () => this.veh.set({ message: 'Could not load the vehicle.' }) });
  }
  private fields(): Field[] {
    return [{ key: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS.map(k => opt(k, k)) }, { key: 'name', label: 'Name', required: true },
      { key: 'externalRef', label: 'External ref (ERP code)' }, { key: 'mobile', label: 'Mobile' },
      { key: 'parentPartyId', label: 'Parent party id (rep for an agent, agent for a shop)', type: 'number' }, { key: 'repType', label: 'Rep type', when: v => v.kind === 'REP' },
      { key: 'companyId', label: 'Company', type: 'select', options: this.companies.companies().map(c => opt(c.id, c.code!)), when: v => v.kind === 'COMPANY' || v.kind === 'WAREHOUSE' },
      { key: 'active', label: 'Active', type: 'checkbox' }];
  }
  async create(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New party', subtitle: 'The address, with a place search and map pin, is asked next.', fields: this.fields(), initial: { kind: 'REP', active: true, parentPartyId: this.sel()?.id }, submit: 'Create' }); if (!v) return;
    this.api.call(createParty, { body: v }).subscribe({ next: p => { this.toast.ok('Created'); this.load(); this.open(p); if (p.kind !== 'COMPANY' && p.kind !== 'WAREHOUSE') this.address(p); }, error: e => this.toast.error(e) });
  }
  async edit(p: PartyResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Edit ' + p.name, fields: this.fields(), initial: p }); if (!v) return;
    this.api.call(updateParty, { id: p.id!, body: v }).subscribe({ next: u => { this.toast.ok('Saved'); this.load(); this.open(u); }, error: e => this.toast.error(e) });
  }
  async address(p: PartyResponse): Promise<void> {
    const a = await this.places.edit({ title: 'Address of ' + p.name + ' (' + p.kind + ')', ownerKind: 'PARTY', ownerId: p.id!, initial: p.place, readOnly: !this.auth.has('party.edit') }); if (!a) return;
    this.load(); this.open({ ...p, place: a });
  }
  async move(p: PartyResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Move ' + p.name, subtitle: 'The whole subtree moves with it.', width: '480px', submit: 'Move', fields: [
      { key: 'newParentPartyId', label: 'New parent party id (blank = top level)', type: 'number', wide: true }, { key: 'reason', label: 'Reason', required: true, wide: true }] }); if (!v) return;
    this.api.call(moveParty, { id: p.id!, body: { newParentPartyId: v.newParentPartyId || undefined, reason: v.reason } }).subscribe({ next: () => { this.toast.ok('Moved'); this.load(); this.open(p); }, error: e => this.toast.error(e) });
  }
}
