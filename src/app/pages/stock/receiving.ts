import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { accounts, open, receipts, suppliers } from '../../api/functions';
import { GrResponse } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Receiving" subtitle="Goods receipts: scan box ranges or import the supplier's ORDER file, record variances, count, then confirm into stock. Open one from an approved purchase order, or without an order here.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [(ngModel)]="status" (valueChange)="state.refresh()"><mat-option [value]="''">Any</mat-option>@for (s of ['OPEN','COUNTED','CONFIRMED','CANCELLED']; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
    @if (auth.has('gr.receive')) { <button mat-flat-button (click)="openGr()"><mat-icon>add</mat-icon> Receipt without order</button> }
  </app-page>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="router.navigate(['/receiving', $event.id])" />`,
})
export class ReceivingPage {
  auth = inject(AuthService); companies = inject(CompanyService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  status = ''; rows = signal<GrResponse[]>([]); state = new ListState(() => this.load());
  cols: Col[] = [{ key: 'grNo', label: 'Receipt' }, { key: 'orderNo', label: 'Order' }, { key: 'companyCode', label: 'Company' }, { key: 'account', label: 'Account' }, { key: 'warehouseCode', label: 'Warehouse' }, { key: 'status', label: 'Status', type: 'tag' },
    { key: 'deliveryNoteNo', label: 'Delivery note' }, { key: 'receivedAt', label: 'Received', type: 'date' }, { key: 'qtyScanned', label: 'Scanned', type: 'qty' }, { key: 'lineCount', label: 'Lines', type: 'qty' }];
  constructor() { this.load(); }
  load(): void { this.api.call(receipts, { companyId: this.companies.param(), status: this.status || undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }
  async openGr(): Promise<void> {
    const sups = await new Promise<any[]>(res => this.api.call(suppliers, { size: 500 }).subscribe(s => res(s.items ?? [])));
    const all: any[] = [];
    for (const s of sups) all.push(...(await new Promise<any[]>(res => this.api.call(accounts, { partyId: s.partyId!, size: 500 }).subscribe(a => res((a.items ?? []).map(x => ({ ...x, supplierName: s.name })))))));
    const v = await this.dialogs.form({ title: 'Goods receipt without a purchase order', submit: 'Open receipt', fields: [
      { key: 'supplierAccountId', label: 'Supplier account', type: 'select', required: true, wide: true, options: all.map(a => opt(a.id, `${a.supplierName} · ${a.accountId} (${a.companyCode}, ${a.networkCode})`)) },
      { key: 'warehouseId', label: 'Warehouse', type: 'select', required: true, wide: true, options: this.companies.companies().flatMap(c => (c.warehouses ?? []).map(w => opt(w.id, `${c.code} · ${w.code}`))) },
      { key: 'deliveryNoteNo', label: 'Delivery note' }, { key: 'noteUnitCostIncl', label: 'Unit cost incl VAT on the note', type: 'number', step: 0.0001 }, { key: 'boxCount', label: 'Boxes', type: 'number' }] }); if (!v) return;
    const acc = all.find(a => a.id === v.supplierAccountId);
    this.api.call(open, { body: { companyId: acc.companyId, supplierAccountId: acc.id, warehouseId: v.warehouseId, deliveryNoteNo: v.deliveryNoteNo || undefined, noteUnitCostIncl: v.noteUnitCostIncl || undefined, boxCount: v.boxCount || undefined } })
      .subscribe({ next: g => this.router.navigate(['/receiving', g.id]), error: e => this.toast.error(e) });
  }
}
