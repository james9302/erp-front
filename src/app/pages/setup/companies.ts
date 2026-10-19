import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { Places, placeLine } from '../../shared/address-dialog';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { addVatRate, companies, createCompany, createWarehouse, updateCompany, vatRates } from '../../api/functions';
import { CompanyResponse, VatRateResponse, WarehouseResponse } from '../../api/models';

const COMPANY_FIELDS = [
  { key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true },
  { key: 'regNo', label: 'Registration no' }, { key: 'vatNo', label: 'VAT no' }, { key: 'address', label: 'Address, one line (the map pin is set with the Address button)', wide: true },
  { key: 'payoutDefault', label: 'Default payout company (pays every rep)', type: 'checkbox' as const }, { key: 'active', label: 'Active', type: 'checkbox' as const },
];

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Companies & warehouses" subtitle="The trading companies in this software. Exactly one is the default payout company: it pays every rep, and the others owe it their share.">
    @if (auth.has('company.edit')) { <button mat-flat-button (click)="newCompany()"><mat-icon>add</mat-icon> New company</button> }
  </app-page>
  @for (c of list(); track c.id) {
    <div class="panel">
      <div class="row" style="align-items:center">
        <h2 style="margin:0">{{ c.code }} · {{ c.name }}</h2>
        @if (c.payoutDefault) { <span class="tag ok">payout default</span> } @if (!c.active) { <span class="tag bad">inactive</span> }
        <span class="grow"></span>
        @if (auth.has('warehouse.edit')) { <button mat-stroked-button (click)="newWarehouse(c)"><mat-icon>add</mat-icon> Warehouse</button> }
        <button mat-stroked-button (click)="companyAddress(c)"><mat-icon>{{ c.place ? 'location_on' : 'add_location_alt' }}</mat-icon> Address</button>
        @if (auth.has('company.edit')) { <button mat-stroked-button (click)="edit(c)"><mat-icon>edit</mat-icon> Edit</button> }
      </div>
      <div class="muted" style="margin:4px 0 10px">Reg {{ c.regNo || '—' }} · VAT {{ c.vatNo || '—' }} @if (c.place) { · <mat-icon class="pin">location_on</mat-icon> {{ place(c.place) }} } @else if (c.address) { · {{ c.address }} <span class="tag warn">no pin</span> }</div>
      <app-table [cols]="whCols" [rows]="c.warehouses || []" [filterable]="false" (pick)="warehouseAddress(c, $event)" empty="No warehouses yet." />
      <div class="muted" style="margin-top:6px; font-size:12px">Click a warehouse to set or see its address and map pin; the pin is where a route plan starts.</div>
    </div>
  }
  <div class="panel">
    <div class="row" style="align-items:center"><h2 style="margin:0">VAT rates</h2><span class="grow"></span>@if (auth.has('company.edit')) { <button mat-stroked-button (click)="newVat()"><mat-icon>add</mat-icon> Rate</button> }</div>
    <app-table [cols]="vatCols" [rows]="vat()" [filterable]="false" [clickable]="false" />
  </div>`,
  styles: [`.pin { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; color: var(--brand); }`],
})
export class CompaniesPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs); private companies = inject(CompanyService); private places = inject(Places);
  list = signal<CompanyResponse[]>([]); vat = signal<VatRateResponse[]>([]);
  whCols: Col[] = [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'address', label: 'Address' }, { key: 'place.suburb', label: 'Suburb' }, { key: 'place.city', label: 'City' }, { key: 'place.province', label: 'Province' }, { key: 'active', label: 'Active', type: 'bool' }];
  place = placeLine;
  vatCols: Col[] = [{ key: 'validFrom', label: 'Valid from', type: 'date' }, { key: 'ratePct', label: 'Rate', type: 'pct' }];

  constructor() { this.load(); this.api.call(vatRates).subscribe(v => this.vat.set(v)); }
  load(): void { this.api.call(companies, { size: 500 }).subscribe(p => { this.list.set(p.items ?? []); this.companies.load(); }); }
  async newCompany(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New company', subtitle: 'The address, with a place search and map pin, is asked next.', fields: COMPANY_FIELDS.filter(f => f.key !== 'address'), initial: { active: true }, submit: 'Create' }); if (!v) return;
    this.api.call(createCompany, { body: v }).subscribe({ next: c => { this.toast.ok('Company created'); this.load(); this.companyAddress(c); }, error: e => this.toast.error(e) });
  }
  async edit(c: CompanyResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Edit ' + c.code, fields: COMPANY_FIELDS, initial: c }); if (!v) return;
    this.api.call(updateCompany, { id: c.id!, body: v }).subscribe({ next: () => { this.toast.ok('Saved'); this.load(); }, error: e => this.toast.error(e) });
  }
  async newWarehouse(c: CompanyResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'New warehouse for ' + c.code, subtitle: 'The address, with a place search and map pin, is asked next: the pin is where route plans start.', fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }], submit: 'Create' }); if (!v) return;
    this.api.call(createWarehouse, { body: { ...v, companyId: c.id!, active: true } }).subscribe({ next: w => { this.toast.ok('Warehouse added'); this.load(); this.warehouseAddress(c, w); }, error: e => this.toast.error(e) });
  }
  async companyAddress(c: CompanyResponse): Promise<void> {
    const a = await this.places.edit({ title: 'Address of ' + c.code + ' · ' + c.name, ownerKind: 'COMPANY', ownerId: c.id!, initial: c.place, readOnly: !this.auth.has('company.edit') }); if (a) this.load();
  }
  async warehouseAddress(c: CompanyResponse, w: WarehouseResponse): Promise<void> {
    const a = await this.places.edit({ title: 'Address of warehouse ' + c.code + ' · ' + w.code + ' ' + w.name, ownerKind: 'WAREHOUSE', ownerId: w.id!, initial: w.place, readOnly: !(this.auth.has('warehouse.edit') || this.auth.has('company.edit')) }); if (a) this.load();
  }
  async newVat(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New VAT rate', fields: [{ key: 'validFrom', label: 'Valid from', type: 'date', required: true }, { key: 'ratePct', label: 'Rate %', type: 'number', required: true }], initial: { ratePct: 15 }, submit: 'Add', width: '420px' }); if (!v) return;
    this.api.call(addVatRate, { body: v }).subscribe({ next: () => this.api.call(vatRates).subscribe(r => this.vat.set(r)), error: e => this.toast.error(e) });
  }
}
