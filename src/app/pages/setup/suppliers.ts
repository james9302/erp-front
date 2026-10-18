import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { account, accounts, createAccount, createProduct, networks, suppliers, updateProduct } from '../../api/functions';
import { AccountDetail, AccountResponse, NetworkResponse, ProductResponse, SupplierSummary } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Suppliers & accounts" subtitle="Each company buys on its own supplier account; the account's products are what the purchase order and the goods receipt scan against.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:260px"><mat-label>Supplier</mat-label>
      <mat-select [(ngModel)]="supplierId" (valueChange)="loadAccounts()">@for (s of list(); track s.partyId) { <mat-option [value]="s.partyId">{{ s.name }} ({{ s.accounts }} accounts)</mat-option> }</mat-select>
    </mat-form-field>
    @if (auth.has('supplier.edit') && supplierId) { <button mat-flat-button (click)="newAccount()"><mat-icon>add</mat-icon> New account</button> }
  </app-page>
  <app-table [cols]="accCols" [rows]="accs()" (pick)="open($event)" empty="Pick a supplier. A supplier is a party of kind SUPPLIER; create one under Parties." />
  @if (detail(); as d) {
    <div class="panel">
      <div class="row" style="align-items:center">
        <h2 style="margin:0">{{ d.account?.supplierName }} · {{ d.account?.accountId }} <span class="tag info">{{ d.account?.companyCode }}</span> <span class="tag">{{ d.account?.networkCode }}</span></h2>
        <span class="grow"></span>
        @if (auth.has('supplier.edit')) { <button mat-stroked-button (click)="newProduct(d.account!)"><mat-icon>add</mat-icon> Product</button> }
      </div>
      @if (d.account?.currentTerm; as t) { <div class="muted" style="margin:4px 0 10px">Current term from {{ t.validFrom | when }}: SIM {{ t.simPriceIncl | rand }} incl · activation {{ t.activationCommission | rand }} · OGR {{ t.ogrPct }} %</div> } @else { <div style="margin:6px 0"><span class="tag warn">no term yet</span></div> }
      <h2>Products</h2>
      <app-table [cols]="prodCols" [rows]="d.products || []" [filterable]="false" (pick)="editProduct($event, d.account!)" empty="No products." />
      <h2>Term history</h2>
      <app-table [cols]="termCols" [rows]="d.history || []" [filterable]="false" [clickable]="false" empty="No terms." />
    </div>
  }`,
})
export class SuppliersPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  list = signal<SupplierSummary[]>([]); nets = signal<NetworkResponse[]>([]); accs = signal<AccountResponse[]>([]); detail = signal<AccountDetail | null>(null);
  supplierId: number | null = null;
  accCols: Col[] = [{ key: 'companyCode', label: 'Company' }, { key: 'networkCode', label: 'Network' }, { key: 'accountId', label: 'Account' }, { key: 'subAccount', label: 'Sub-account' },
    { key: 'productCount', label: 'Products', type: 'qty' }, { key: 'currentTerm.activationCommission', label: 'Activation', type: 'rand' }, { key: 'currentTerm.ogrPct', label: 'OGR', type: 'pct' }, { key: 'active', label: 'Active', type: 'bool' }];
  prodCols: Col[] = [{ key: 'productCode', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'iccidPrefix', label: 'ICCID prefix' }, { key: 'active', label: 'Active', type: 'bool' }];
  termCols: Col[] = [{ key: 'validFrom', label: 'From', type: 'date' }, { key: 'validTo', label: 'To', type: 'date' }, { key: 'supplierProductId', label: 'Product id' }, { key: 'simPriceIncl', label: 'SIM incl', type: 'rand' },
    { key: 'activationCommission', label: 'Activation', type: 'rand' }, { key: 'ogrPct', label: 'OGR', type: 'pct' }, { key: 'ogrMonths', label: 'OGR months' }, { key: 'status', label: 'Status', type: 'tag' }];

  constructor() {
    this.api.call(suppliers, { size: 500 }).subscribe(pg => { const l = pg.items ?? []; this.list.set(l); if (l.length && !this.supplierId) { this.supplierId = l[0].partyId!; this.loadAccounts(); } });
    this.api.call(networks).subscribe(n => this.nets.set(n));
  }
  loadAccounts(): void { if (this.supplierId) this.api.call(accounts, { partyId: this.supplierId, size: 500 }).subscribe(a => this.accs.set(a.items ?? [])); }
  open(a: AccountResponse): void { this.api.call(account, { id: a.id! }).subscribe(d => this.detail.set(d)); }
  async newAccount(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New supplier account', subtitle: 'The account id must match the DEALER_CODE in the network files (e.g. SZBFD for Tradr Loop) so events route to it.', submit: 'Create', fields: [
      { key: 'companyId', label: 'Company', type: 'select', required: true, options: this.companies.companies().map(c => opt(c.id, c.code!)) },
      { key: 'networkCode', label: 'Network', type: 'select', required: true, options: this.nets().map(n => opt(n.code, n.name!)) },
      { key: 'accountId', label: 'Account id (dealer code)', required: true }, { key: 'subAccount', label: 'Sub-account' }] }); if (!v) return;
    this.api.call(createAccount, { body: { ...v, supplierPartyId: this.supplierId!, active: true } }).subscribe({ next: () => { this.toast.ok('Account created'); this.loadAccounts(); }, error: e => this.toast.error(e) });
  }
  private productFields = [{ key: 'productCode', label: 'Product code (supplier part no)', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'iccidPrefix', label: 'ICCID prefix', hint: 'serials must start with this' }, { key: 'active', label: 'Active', type: 'checkbox' as const }];
  async newProduct(a: AccountResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'New product on ' + a.accountId, fields: this.productFields, initial: { active: true }, submit: 'Add' }); if (!v) return;
    this.api.call(createProduct, { body: { ...v, supplierAccountId: a.id! } }).subscribe({ next: () => { this.toast.ok('Product added'); this.open(a); }, error: e => this.toast.error(e) });
  }
  async editProduct(p: ProductResponse, a: AccountResponse): Promise<void> {
    if (!this.auth.has('supplier.edit')) return;
    const v = await this.dialogs.form({ title: 'Edit ' + p.productCode, fields: this.productFields, initial: p }); if (!v) return;
    this.api.call(updateProduct, { id: p.id!, body: { ...v, supplierAccountId: a.id! } }).subscribe({ next: () => { this.toast.ok('Saved'); this.open(a); }, error: e => this.toast.error(e) });
  }
}
