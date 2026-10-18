import { Component, inject, input, signal, effect } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { approve, cancel, close3, get2, open, receipts, submit } from '../../api/functions';
import { GrResponse, PoResponse } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  @if (po(); as o) {
    <app-page [title]="o.orderNo || ''" [subtitle]="o.companyCode + ' · ' + o.supplierName + ' ' + o.account + ' · warehouse ' + o.warehouseCode + ' · ordered ' + (o.orderedAt | when) + ' · expected ' + (o.expectedAt | when)" [crumbs]="['Purchase orders']">
      <span class="tag info">{{ o.status }}</span>
      @if (auth.has('po.create') && o.status === 'DRAFT') { <button mat-stroked-button (click)="act(submit)"><mat-icon>send</mat-icon> Submit</button> }
      @if (auth.has('po.approve') && o.status === 'SUBMITTED') { <button mat-flat-button (click)="act(approve)"><mat-icon>verified</mat-icon> Approve</button> }
      @if (auth.has('gr.receive') && ['APPROVED','PARTIAL'].includes(o.status!)) { <button mat-flat-button (click)="receive(o)"><mat-icon>inventory</mat-icon> Open goods receipt</button> }
      @if (auth.has('po.approve') && !['CLOSED','CANCELLED'].includes(o.status!)) { <button mat-button (click)="act(close3, true)">Close</button><button mat-button (click)="act(cancel, true)">Cancel</button> }
    </app-page>
    <div class="cards">
      <div class="kpi"><div class="label">Ordered</div><div class="value">{{ o.qtyOrdered | qty }}</div></div>
      <div class="kpi"><div class="label">Received</div><div class="value">{{ o.qtyReceived | qty }}</div></div>
      <div class="kpi"><div class="label">Value excl VAT</div><div class="value">{{ o.valueExcl | rand }}</div></div>
    </div>
    <app-table [cols]="lineCols" [rows]="o.lines || []" />
    @if (o.notes) { <p class="muted">{{ o.notes }}</p> }
    <h2>Goods receipts</h2>
    <app-table [cols]="grCols" [rows]="grs()" (pick)="router.navigate(['/receiving', $event.id])" empty="No receipts yet." />
  }`,
})
export class PurchaseOrderPage {
  id = input.required<string>();
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  po = signal<PoResponse | null>(null); grs = signal<GrResponse[]>([]);
  submit = submit; approve = approve; close3 = close3; cancel = cancel;
  lineCols: Col[] = [{ key: 'productCode', label: 'Product' }, { key: 'networkCode', label: 'Network' }, { key: 'qtyOrdered', label: 'Ordered', type: 'qty' }, { key: 'qtyReceived', label: 'Received', type: 'qty' }, { key: 'open', label: 'Open', type: 'qty' },
    { key: 'unitPriceIncl', label: 'Unit incl', type: 'rand' }, { key: 'unitPriceExcl', label: 'Unit excl', type: 'rand' }, { key: 'lineExcl', label: 'Line excl', type: 'rand' }];
  grCols: Col[] = [{ key: 'grNo', label: 'Receipt' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'deliveryNoteNo', label: 'Delivery note' }, { key: 'receivedAt', label: 'Received', type: 'date' }, { key: 'qtyScanned', label: 'Scanned', type: 'qty' }, { key: 'lineCount', label: 'Lines', type: 'qty' }];

  constructor() { effect(() => { const id = Number(this.id()); if (id) this.load(id); }); }
  load(id: number): void {
    this.api.call(get2, { id }).subscribe(o => this.po.set(o));
    this.api.call(receipts, { poId: id, size: 100 }).subscribe(g => this.grs.set(g.items ?? []));
  }
  async act(fn: any, withReason = false): Promise<void> {
    const id = this.po()!.id!;
    const reason = withReason ? await this.dialogs.reason(fn === cancel ? 'Cancel this order?' : 'Close this order?', undefined, fn === cancel ? 'Cancel order' : 'Close', fn === cancel) : undefined;
    if (withReason && !reason) return;
    this.api.call(fn, withReason ? { id, body: { reason } } : { id }).subscribe({ next: () => { this.toast.ok('Done'); this.load(id); }, error: e => this.toast.error(e) });
  }
  receive(o: PoResponse): void {
    this.api.call(open, { body: { poId: o.id } }).subscribe({ next: g => this.router.navigate(['/receiving', g.id]), error: e => this.toast.error(e) });
  }
}
