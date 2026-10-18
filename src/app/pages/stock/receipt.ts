import { Component, effect, inject, input, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { splitSerials } from '../../core/pipes';
import { account, addBox, addLoose, addVariance, cancelReceipt, confirm as confirmGr, counted, importOrderFile, receipt, removeLine, reopen } from '../../api/functions';
import { GrResponse, ProductResponse, ScanResult } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  @if (gr(); as g) {
    <app-page [title]="g.grNo || ''" [subtitle]="g.companyCode + ' · account ' + g.account + ' · warehouse ' + g.warehouseCode + ' · order ' + (g.orderNo || '—') + ' · delivery note ' + (g.deliveryNoteNo || '—') + ' · received ' + (g.receivedAt | when)" [crumbs]="['Receiving']">
      <span class="tag info">{{ g.status }}</span>
      @if (auth.has('gr.receive') && g.status === 'OPEN') { <button mat-stroked-button (click)="act(counted)"><mat-icon>fact_check</mat-icon> Mark counted</button> }
      @if (auth.has('gr.confirm') && ['OPEN','COUNTED'].includes(g.status!)) { <button mat-flat-button (click)="confirmInto()"><mat-icon>done_all</mat-icon> Confirm into stock</button> }
      @if (auth.has('gr.receive') && g.status === 'COUNTED') { <button mat-button (click)="act(reopen)">Reopen</button> }
      @if (auth.has('gr.receive') && g.status !== 'CONFIRMED' && g.status !== 'CANCELLED') { <button mat-button color="warn" (click)="cancel()">Cancel receipt</button> }
    </app-page>
    <div class="cards">
      <div class="kpi"><div class="ico"><mat-icon>qr_code_scanner</mat-icon></div><div class="label">Serials scanned</div><div class="value">{{ g.qtyScanned | qty }}</div><div class="sub">{{ g.lineCount }} lines · {{ g.boxCount || 0 }} boxes expected</div></div>
      @if (g.noteUnitCostIncl) { <div class="kpi"><div class="ico"><mat-icon>sell</mat-icon></div><div class="label">Delivery note unit cost incl</div><div class="value">{{ g.noteUnitCostIncl | rand }}</div></div> }
      @if (g.receiveMovementId) { <div class="kpi ok"><div class="ico"><mat-icon>check</mat-icon></div><div class="label">Receive movement</div><div class="value">#{{ g.receiveMovementId }}</div><div class="sub">confirmed {{ g.confirmedAt | when:true }}</div></div> }
    </div>
    @if (auth.has('gr.receive') && g.status === 'OPEN') {
      <div class="toolbar">
        <button mat-stroked-button (click)="addRange()"><mat-icon>view_week</mat-icon> Box range</button>
        <button mat-stroked-button (click)="addLooseSerials()"><mat-icon>qr_code</mat-icon> Loose serials</button>
        <button mat-stroked-button (click)="file.click()"><mat-icon>upload_file</mat-icon> Supplier ORDER file</button><input #file type="file" hidden accept=".txt,.csv" (change)="importFile($any($event.target).files[0])">
        <button mat-stroked-button (click)="addVar()"><mat-icon>report</mat-icon> Variance</button>
        @if (scan(); as s) { <span class="tag ok">accepted {{ s.accepted }}</span> @if (s.rejectedLuhn) { <span class="tag bad">bad Luhn {{ s.rejectedLuhn }}</span> } @if (s.rejectedPrefix) { <span class="tag bad">wrong prefix {{ s.rejectedPrefix }}</span> } @if (s.rejectedDuplicateInStock) { <span class="tag warn">in stock {{ s.rejectedDuplicateInStock }}</span> } @if (s.rejectedDuplicateInReceipt) { <span class="tag warn">in receipt {{ s.rejectedDuplicateInReceipt }}</span> } }
        @if (fileResult(); as r) { <span class="tag info">file: {{ r.rows }} rows · {{ r.linesCreated }} lines · {{ r.accepted }} accepted · {{ r.rejected }} rejected · {{ r.unknownProducts }} unknown products</span> }
      </div>
    }
    @if (g.poProgress?.length) { <h2>Order progress</h2><app-table [cols]="progCols" [rows]="g.poProgress!" [filterable]="false" [clickable]="false" /> }
    <h2>Lines <span class="muted" style="font-weight:400">· click a line to remove it while open</span></h2>
    <app-table [cols]="lineCols" [rows]="g.lines || []" [filterable]="false" (pick)="g.status === 'OPEN' && auth.has('gr.receive') ? drop($event) : null" empty="Nothing scanned yet." />
    @if (g.variances?.length) { <h2>Variances</h2><app-table [cols]="varCols" [rows]="g.variances!" [filterable]="false" [clickable]="false" /> }
  }`,
})
export class ReceiptPage {
  id = input.required<string>();
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  gr = signal<GrResponse | null>(null); prods = signal<ProductResponse[]>([]); scan = signal<ScanResult | null>(null); fileResult = signal<any>(null);
  counted = counted; reopen = reopen;
  lineCols: Col[] = [{ key: 'id', label: 'Line' }, { key: 'productCode', label: 'Product' }, { key: 'boxNo', label: 'Box' }, { key: 'serialFrom', label: 'From' }, { key: 'serialTo', label: 'To' }, { key: 'qtyExpected', label: 'Expected', type: 'qty' }, { key: 'qtyScanned', label: 'Scanned', type: 'qty' }, { key: 'unitCostIncl', label: 'Cost incl', type: 'rand' }, { key: 'costSource', label: 'Cost from', type: 'tag' }];
  progCols: Col[] = [{ key: 'productCode', label: 'Product' }, { key: 'qtyOrdered', label: 'Ordered', type: 'qty' }, { key: 'qtyReceivedBefore', label: 'Received before', type: 'qty' }, { key: 'qtyScannedHere', label: 'Here', type: 'qty' }, { key: 'difference', label: 'Difference', type: 'qty' }];
  varCols: Col[] = [{ key: 'kind', label: 'Kind', type: 'tag' }, { key: 'grLineId', label: 'Line' }, { key: 'qty', label: 'Qty', type: 'qty' }, { key: 'note', label: 'Note' }];

  constructor() { effect(() => { const id = Number(this.id()); if (id) this.load(id); }); }
  load(id: number): void {
    this.api.call(receipt, { id }).subscribe(g => { this.gr.set(g); if (g.supplierAccountId) this.api.call(account, { id: g.supplierAccountId }).subscribe(d => this.prods.set(d.products ?? [])); });
  }
  private refresh(): void { this.load(this.gr()!.id!); }
  private productOptions() { return this.prods().map(p => opt(p.id, `${p.productCode} · ${p.name}`)); }
  act(fn: any): void { this.api.call(fn, { id: this.gr()!.id! }).subscribe({ next: () => { this.toast.ok('Done'); this.refresh(); }, error: e => this.toast.error(e) }); }
  async confirmInto(): Promise<void> {
    if (await this.dialogs.confirm('Confirm into stock?', `${this.gr()!.qtyScanned} serials become stock of ${this.gr()!.companyCode} in ${this.gr()!.warehouseCode}. This cannot be undone.`, 'Confirm')) this.act(confirmGr);
  }
  async cancel(): Promise<void> { const reason = await this.dialogs.reason('Cancel this receipt?', 'Scanned serials are discarded.', 'Cancel receipt', true); if (reason) this.api.call(cancelReceipt, { id: this.gr()!.id!, body: { reason } }).subscribe({ next: () => this.refresh(), error: e => this.toast.error(e) }); }
  async addRange(): Promise<void> {
    const v = await this.dialogs.form({ title: 'Add a box range', subtitle: 'The range is stepped on the ICCID body and the check digit recomputed; bad Luhn, wrong prefix and duplicates are rejected.', submit: 'Add box', fields: [
      { key: 'supplierProductId', label: 'Product', type: 'select', required: true, wide: true, options: this.productOptions() }, { key: 'boxNo', label: 'Box no' }, { key: 'brickNo', label: 'Brick no' },
      { key: 'serialFrom', label: 'First ICCID', required: true }, { key: 'serialTo', label: 'Last ICCID', required: true }, { key: 'qtyExpected', label: 'Qty expected', type: 'number' }] }); if (!v) return;
    this.api.call(addBox, { id: this.gr()!.id!, body: v }).subscribe({ next: () => { this.toast.ok('Box added'); this.refresh(); }, error: e => this.toast.error(e) });
  }
  async addLooseSerials(): Promise<void> {
    const v = await this.dialogs.form({ title: 'Loose serials', submit: 'Add', fields: [{ key: 'supplierProductId', label: 'Product', type: 'select', required: true, wide: true, options: this.productOptions() }, { key: 'boxNo', label: 'Box no', wide: true },
      { key: 'text', label: 'Scan or paste ICCIDs (one per line or separated by spaces)', type: 'textarea', required: true }] }); if (!v) return;
    this.api.call(addLoose, { id: this.gr()!.id!, body: { supplierProductId: v.supplierProductId, boxNo: v.boxNo, serials: splitSerials(v.text) } })
      .subscribe({ next: s => { this.scan.set(s); this.refresh(); }, error: e => this.toast.error(e) });
  }
  importFile(file?: File): void {
    if (!file) return;
    this.api.call(importOrderFile, { id: this.gr()!.id!, body: { file } }).subscribe({ next: r => { this.fileResult.set(r); this.refresh(); }, error: e => this.toast.error(e) });
  }
  async addVar(): Promise<void> {
    const v = await this.dialogs.form({ title: 'Record a variance', submit: 'Record', fields: [
      { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['SHORT', 'OVER', 'DAMAGED', 'WRONG_PRODUCT', 'SEAL_BROKEN'].map(k => opt(k, k)) },
      { key: 'grLineId', label: 'Line', type: 'select', options: (this.gr()!.lines ?? []).map(l => opt(l.id, `${l.id} · ${l.productCode} ${l.boxNo ?? ''}`)) },
      { key: 'qty', label: 'Qty', type: 'number' }, { key: 'note', label: 'Note', wide: true }] }); if (!v) return;
    this.api.call(addVariance, { id: this.gr()!.id!, body: v }).subscribe({ next: () => this.refresh(), error: e => this.toast.error(e) });
  }
  async drop(line: any): Promise<void> {
    if (await this.dialogs.confirm(`Remove line ${line.id}?`, `${line.qtyScanned} scanned serials are dropped from this receipt.`, 'Remove', true))
      this.api.call(removeLine, { id: this.gr()!.id!, lineId: line.id }).subscribe({ next: () => this.refresh(), error: e => this.toast.error(e) });
  }
}
