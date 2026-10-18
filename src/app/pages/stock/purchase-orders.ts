import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { account, accounts, create2, list2, suppliers } from '../../api/functions';
import { PoListRow, PoRequest, SupplierSummary } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Purchase orders" subtitle="One order per company and supplier account. Approve it, then receive against it; the goods receipt shows progress per line.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [(ngModel)]="status" (valueChange)="page = 0; load()"><mat-option [value]="''">Any</mat-option>@for (s of ['DRAFT','SUBMITTED','APPROVED','PARTIAL','RECEIVED','CLOSED','CANCELLED']; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
    @if (auth.has('po.create')) { <button mat-flat-button (click)="create()"><mat-icon>add_shopping_cart</mat-icon> New order</button> }
  </app-page>
  <div class="toolbar"><span class="grow"></span><span class="muted">{{ total() }} orders</span>
    <button mat-icon-button [disabled]="page===0" (click)="page = page - 1; load()"><mat-icon>chevron_left</mat-icon></button><button mat-icon-button [disabled]="(page+1)*25 >= total()" (click)="page = page + 1; load()"><mat-icon>chevron_right</mat-icon></button></div>
  <app-table [cols]="cols" [rows]="rows()" [paged]="false" (pick)="router.navigate(['/purchase-orders', $event.id])" />`,
})
export class PurchaseOrdersPage {
  auth = inject(AuthService); companies = inject(CompanyService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  status = ''; page = 0; rows = signal<PoListRow[]>([]); total = signal(0); sups = signal<SupplierSummary[]>([]);
  cols: Col[] = [{ key: 'orderNo', label: 'Order' }, { key: 'companyCode', label: 'Company' }, { key: 'supplierName', label: 'Supplier' }, { key: 'account', label: 'Account' }, { key: 'warehouseCode', label: 'Warehouse' },
    { key: 'status', label: 'Status', type: 'tag' }, { key: 'orderedAt', label: 'Ordered', type: 'date' }, { key: 'expectedAt', label: 'Expected', type: 'date' }, { key: 'qtyOrdered', label: 'Ordered', type: 'qty' }, { key: 'qtyReceived', label: 'Received', type: 'qty' }, { key: 'valueExcl', label: 'Value excl', type: 'rand' }];

  constructor() { this.load(); this.api.call(suppliers, { size: 500 }).subscribe(s => this.sups.set(s.items ?? [])); }
  load(): void { this.api.call(list2, { companyId: this.companies.param(), status: this.status || undefined, page: this.page, size: 25 }).subscribe(p => { this.rows.set(p.items ?? []); this.total.set(p.total ?? 0); }); }

  /** Two steps: pick the supplier account (which fixes company, network and products), then the lines. */
  async create(): Promise<void> {
    const allAccounts: any[] = [];
    for (const s of this.sups()) allAccounts.push(...(await new Promise<any[]>(res => this.api.call(accounts, { partyId: s.partyId!, size: 500 }).subscribe(a => res((a.items ?? []).map(x => ({ ...x, supplierName: s.name })))))));
    const step1 = await this.dialogs.form({ title: 'New purchase order', submit: 'Next', width: '560px', fields: [
      { key: 'supplierAccountId', label: 'Supplier account', type: 'select', required: true, wide: true, options: allAccounts.map(a => opt(a.id, `${a.supplierName} · ${a.accountId} (${a.companyCode}, ${a.networkCode})`)) },
      { key: 'warehouseId', label: 'Warehouse', type: 'select', required: true, wide: true, options: this.companies.companies().flatMap(c => (c.warehouses ?? []).map(w => opt(w.id, `${c.code} · ${w.code} ${w.name}`))) },
      { key: 'expectedAt', label: 'Expected', type: 'date' }, { key: 'notes', label: 'Notes' }] }); if (!step1) return;
    const acc = allAccounts.find(a => a.id === step1.supplierAccountId);
    const detail = await new Promise<any>(res => this.api.call(account, { id: acc.id }).subscribe(d => res(d)));
    const step2 = await this.dialogs.form({ title: `Lines · ${acc.supplierName} ${acc.accountId}`, submit: 'Create order', fields: [],
      lines: { key: 'lines', label: 'Products and quantities', fields: [
        { key: 'supplierProductId', label: 'Product', type: 'select', options: (detail.products ?? []).map((p: any) => opt(p.id, `${p.productCode} · ${p.name}`)) },
        { key: 'qtyOrdered', label: 'Qty', type: 'number' }, { key: 'unitPriceIncl', label: 'Unit price incl VAT (optional)', type: 'number', step: 0.0001 }] } }); if (!step2) return;
    const body: PoRequest = { companyId: acc.companyId, supplierAccountId: acc.id, warehouseId: step1.warehouseId, expectedAt: step1.expectedAt || undefined, notes: step1.notes || undefined,
      lines: step2.lines.filter((l: any) => l.supplierProductId).map((l: any) => ({ supplierProductId: l.supplierProductId, qtyOrdered: l.qtyOrdered, unitPriceIncl: l.unitPriceIncl })) };
    this.api.call(create2, { body }).subscribe({ next: po => { this.toast.ok('Order ' + po.orderNo + ' created'); this.router.navigate(['/purchase-orders', po.id]); }, error: e => this.toast.error(e) });
  }
}
