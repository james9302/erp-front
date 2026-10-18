import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { account, accounts, capture, invoice, invoices, match, paid, suppliers } from '../../api/functions';
import { InvoiceRequest, InvoiceResponse, SupplierSummary } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Supplier invoices" subtitle="Three-way match: invoice line against the purchase order price and the goods receipt quantity. A matched invoice re-prices the SIMs it covers.">
    @if (auth.has('invoice.capture')) { <button mat-flat-button (click)="captureInv()"><mat-icon>post_add</mat-icon> Capture invoice</button> }
  </app-page>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="openInv($event)" />
  @if (sel(); as i) {
    <div class="panel">
      <div class="row" style="align-items:center"><h2 style="margin:0">{{ i.invoiceNo }} · {{ i.supplierName }} · {{ i.companyCode }}</h2><span class="tag info">{{ i.status }}</span><span class="grow"></span>
        @if (auth.has('invoice.capture')) { <button mat-stroked-button (click)="doMatch(i)"><mat-icon>compare_arrows</mat-icon> Match</button> @if (i.status === 'MATCHED') { <button mat-flat-button (click)="markPaid(i)"><mat-icon>paid</mat-icon> Mark paid</button> } }
      </div>
      <div class="muted" style="margin:6px 0 10px">{{ i.invoiceDate | when }} · excl {{ i.amountExcl | rand }} · VAT {{ i.vatAmount | rand }} · incl {{ i.amountIncl | rand }} @if (i.disputeNote) { · {{ i.disputeNote }} }</div>
      <app-table [cols]="lineCols" [rows]="i.lines || []" [filterable]="false" [clickable]="false" />
    </div>
  }`,
})
export class InvoicesPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  rows = signal<InvoiceResponse[]>([]); state = new ListState(() => this.load()); sel = signal<InvoiceResponse | null>(null); sups = signal<SupplierSummary[]>([]);
  cols: Col[] = [{ key: 'invoiceNo', label: 'Invoice' }, { key: 'companyCode', label: 'Company' }, { key: 'supplierName', label: 'Supplier' }, { key: 'invoiceDate', label: 'Date', type: 'date' }, { key: 'amountExcl', label: 'Excl', type: 'rand' }, { key: 'amountIncl', label: 'Incl', type: 'rand' }, { key: 'status', label: 'Status', type: 'tag' }];
  lineCols: Col[] = [{ key: 'productCode', label: 'Product' }, { key: 'qty', label: 'Qty', type: 'qty' }, { key: 'unitPriceExcl', label: 'Unit excl', type: 'rand' }, { key: 'grNo', label: 'Receipt' }, { key: 'matchStatus', label: 'Match', type: 'tag' }];
  constructor() { this.load(); this.api.call(suppliers, { size: 500 }).subscribe(s => this.sups.set(s.items ?? [])); }
  load(): void { this.api.call(invoices, { companyId: this.companies.param(), ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }
  openInv(i: InvoiceResponse): void { this.api.call(invoice, { id: i.id! }).subscribe(d => this.sel.set(d)); }
  async doMatch(i: InvoiceResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Match ' + i.invoiceNo, width: '400px', submit: 'Match', initial: { tolerancePct: 2 }, fields: [{ key: 'tolerancePct', label: 'Price tolerance %', type: 'number', step: 0.1, wide: true }] }); if (!v) return;
    this.api.call(match, { id: i.id!, body: v }).subscribe({ next: d => { this.sel.set(d); this.load(); }, error: e => this.toast.error(e) });
  }
  async markPaid(i: InvoiceResponse): Promise<void> { if (await this.dialogs.confirm('Mark ' + i.invoiceNo + ' paid?')) this.api.call(paid, { id: i.id! }).subscribe({ next: d => { this.sel.set(d); this.load(); }, error: e => this.toast.error(e) }); }
  async captureInv(): Promise<void> {
    const step1 = await this.dialogs.form({ title: 'Capture supplier invoice', submit: 'Next', fields: [
      { key: 'companyId', label: 'Company', type: 'select', required: true, options: this.companies.companies().map(c => opt(c.id, c.code!)) },
      { key: 'supplierPartyId', label: 'Supplier', type: 'select', required: true, options: this.sups().map(s => opt(s.partyId, s.name!)) },
      { key: 'invoiceNo', label: 'Invoice no', required: true }, { key: 'invoiceDate', label: 'Date', type: 'date', required: true },
      { key: 'amountExcl', label: 'Amount excl', type: 'number', step: 0.01, required: true }, { key: 'vatAmount', label: 'VAT', type: 'number', step: 0.01, required: true }, { key: 'amountIncl', label: 'Amount incl', type: 'number', step: 0.01, required: true }] }); if (!step1) return;
    const accs = await new Promise<any[]>(res => this.api.call(accounts, { partyId: step1.supplierPartyId, size: 500 }).subscribe(a => res((a.items ?? []).filter(x => x.companyId === step1.companyId))));
    const products: any[] = [];
    for (const a of accs) products.push(...(await new Promise<any[]>(res => this.api.call(account, { id: a.id }).subscribe(d => res(d.products ?? [])))));
    const step2 = await this.dialogs.form({ title: 'Invoice lines', submit: 'Capture', fields: [], lines: { key: 'lines', label: 'Lines', fields: [
      { key: 'supplierProductId', label: 'Product', type: 'select', options: products.map(p => opt(p.id, `${p.productCode} · ${p.name}`)) }, { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'unitPriceExcl', label: 'Unit price excl', type: 'number', step: 0.0001 }, { key: 'grLineId', label: 'Receipt line id', type: 'number' }] } }); if (!step2) return;
    const body = { ...step1, lines: step2.lines.filter((l: any) => l.supplierProductId) } as InvoiceRequest;
    this.api.call(capture, { body }).subscribe({ next: d => { this.toast.ok('Captured'); this.sel.set(d); this.load(); }, error: e => this.toast.error(e) });
  }
}
