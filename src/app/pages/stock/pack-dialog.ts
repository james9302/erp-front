import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiClient } from '../../core/api';
import { Toast, toProblem } from '../../core/problem';
import { newKey, splitSerials } from '../../core/pipes';
import { boxes, pack } from '../../api/functions';
import { BoxView, BundleView, NetworkResponse } from '../../api/models';

interface Added { label: string; serials: string[]; }

/**
 * Pack a bundle the way the warehouse works: scan a box or brick number and all its available serials come in at once,
 * a box scan brings every brick in that box, a brick scan exactly that brick, single serials for loose SIMs, or a quantity FIFO. Result: the packed BundleView, or null when cancelled.
 */
@Component({
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
  <h2 mat-dialog-title>Pack a bundle</h2>
  <mat-dialog-content>
    <div class="top">
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Warehouse</mat-label><mat-select [(ngModel)]="warehouseId" [disabled]="added().length > 0">@for (w of data.warehouses; track w.id) { <mat-option [value]="w.id">{{ w.label }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Network (only for a quantity pack)</mat-label><mat-select [(ngModel)]="networkCode" [disabled]="added().length > 0"><mat-option [value]="undefined">any / mixed</mat-option>@for (n of data.networks; track n.code) { <mat-option [value]="n.code">{{ n.name }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Bundle name (optional)</mat-label><input matInput [(ngModel)]="name"></mat-form-field>
    </div>
    <div class="scan">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow"><mat-label>Scan a box number (whole box, every brick in it)</mat-label>
        <input matInput [(ngModel)]="boxCode" (keyup.enter)="scanBox()" placeholder="outer carton number" autofocus>
        <mat-icon matSuffix>inventory_2</mat-icon>
      </mat-form-field>
      <button mat-stroked-button (click)="scanBox()" [disabled]="!boxCode.trim()">Add box</button>
    </div>
    <div class="scan">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow"><mat-label>Scan a brick number (that brick only)</mat-label>
        <input matInput [(ngModel)]="brickCode" (keyup.enter)="scanBrick()" placeholder="inner carton number">
        <mat-icon matSuffix>view_in_ar</mat-icon>
      </mat-form-field>
      <button mat-stroked-button (click)="scanBrick()" [disabled]="!brickCode.trim()">Add brick</button>
    </div>
    <div class="scan">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow"><mat-label>Scan a single serial</mat-label>
        <input matInput [(ngModel)]="serialCode" (keyup.enter)="scanSerial()" placeholder="ICCID, one at a time or pasted">
        <mat-icon matSuffix>qr_code_scanner</mat-icon>
      </mat-form-field>
      <button mat-stroked-button (click)="scanSerial()" [disabled]="!serialCode.trim()">Add serial</button>
    </div>
    <div class="scan">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px"><mat-label>Or take a quantity (FIFO)</mat-label><input matInput type="number" [(ngModel)]="qty" min="1"></mat-form-field>
      <span class="muted">oldest available stock of the chosen warehouse and network; cannot be mixed with scans. Scans may mix networks (e.g. 5 Telkom + 5 MTN).</span>
    </div>
    @if (msg(); as m) { <div class="msg" [class.bad]="m.bad">{{ m.text }}</div> }
    @if (added().length) {
      <table class="list">
        <tr><th>Added</th><th class="num">SIMs</th><th></th></tr>
        @for (a of added(); track $index) { <tr><td>{{ a.label }}</td><td class="num">{{ a.serials.length }}</td><td><button mat-icon-button (click)="remove($index)"><mat-icon>close</mat-icon></button></td></tr> }
        <tr class="total"><td>Total</td><td class="num">{{ count() }}</td><td></td></tr>
      </table>
    }
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-flat-button [disabled]="!canPack() || busy()" (click)="doPack()"><mat-icon>inventory_2</mat-icon> Pack {{ count() || qty || '' }} SIMs</button>
  </mat-dialog-actions>`,
  styles: [`
    .top, .scan { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    .top mat-form-field { flex: 1; min-width: 160px; } .grow { flex: 1; min-width: 240px; }
    .msg { padding: 8px 12px; border-radius: 8px; background: var(--ok-soft); color: var(--ok); margin-bottom: 10px; } .msg.bad { background: var(--bad-soft); color: var(--bad); }
    .list { width: 100%; border-collapse: collapse; } .list th, .list td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; } .list th { color: var(--ink-3); font-size: 11px; text-transform: uppercase; }
    .list .num { text-align: right; } .list .total td { font-weight: 700; border-bottom: 0; }
    mat-dialog-content { width: 100%; }
  `],
})
export class PackDialog {
  data: { warehouses: { id: number; label: string; companyId: number }[]; networks: NetworkResponse[] } = inject(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<PackDialog>);
  private api = inject(ApiClient); private toast = inject(Toast);
  warehouseId?: number; networkCode?: string; name = ''; boxCode = ''; brickCode = ''; serialCode = ''; qty?: number;
  added = signal<Added[]>([]); msg = signal<{ text: string; bad?: boolean } | null>(null); busy = signal(false);
  count = computed(() => this.added().reduce((n, a) => n + a.serials.length, 0));
  private have = new Set<string>();

  canPack(): boolean { return !!this.warehouseId && (this.count() > 0 || (!!this.qty && this.qty > 0 && !!this.networkCode)); }

  scanBox(): void { const code = this.boxCode.trim(); if (code) this.lookup({ boxNo: code }, code, 'box'); this.boxCode = ''; }
  scanBrick(): void { const code = this.brickCode.trim(); if (code) this.lookup({ brickNo: code }, code, 'brick'); this.brickCode = ''; }

  private lookup(q: { boxNo?: string; brickNo?: string }, code: string, what: 'box' | 'brick'): void {
    this.api.call(boxes, { ...q, warehouseId: this.warehouseId }).subscribe({
      next: list => {
        if (!list.length) { this.msg.set({ text: `No ${what} "${code}" in ${this.warehouseId ? 'this warehouse' : 'stock'}.`, bad: true }); return; }
        let addedNow = 0, skipped = 0;
        for (const b of list) {
          if (!this.warehouseId) this.warehouseId = b.warehouseId;
          if (b.warehouseId !== this.warehouseId) { this.msg.set({ text: `${b.boxNo ?? b.brickNo} is in ${b.warehouseCode}; a bundle is packed from one warehouse.`, bad: true }); continue; }
          const fresh = (b.serials ?? []).filter(s => !this.have.has(s));
          skipped += (b.serials?.length ?? 0) - fresh.length;
          if (!fresh.length) continue;
          fresh.forEach(s => this.have.add(s));
          this.added.update(a => [...a, { label: `box ${b.boxNo ?? '—'} · brick ${b.brickNo ?? '—'} · ${b.productCode} · ${b.grNo}${b.available! < b.received! ? ` (${b.available} of ${b.received} still in stock)` : ''}`, serials: fresh }]);
          addedNow += fresh.length;
        }
        if (addedNow) this.msg.set({ text: `Added ${addedNow} serials from ${what} "${code}" (${list.length} brick${list.length > 1 ? 's' : ''})${skipped ? `, ${skipped} already in this bundle` : ''}.` });
        else if (skipped) this.msg.set({ text: `${what} "${code}" is already in this bundle.`, bad: true });
      },
      error: e => this.msg.set({ text: toProblem(e).detail, bad: true }),
    });
  }

  scanSerial(): void {
    const serials = splitSerials(this.serialCode); this.serialCode = '';
    if (!serials.length) { this.msg.set({ text: 'That is not an ICCID (18 digits or more).', bad: true }); return; }
    const fresh = serials.filter(s => !this.have.has(s));
    fresh.forEach(s => this.have.add(s));
    if (fresh.length) this.added.update(a => [...a, { label: fresh.length === 1 ? `serial ${fresh[0]}` : `${fresh.length} scanned serials`, serials: fresh }]);
    this.msg.set(fresh.length ? { text: `Added ${fresh.length} serial${fresh.length > 1 ? 's' : ''}.` } : { text: 'Already in this bundle.', bad: true });
  }

  remove(i: number): void { this.added.update(a => { a[i].serials.forEach(s => this.have.delete(s)); return a.filter((_, k) => k !== i); }); }

  doPack(): void {
    this.busy.set(true);
    const serials = this.count() ? this.added().flatMap(a => a.serials) : undefined;
    this.api.call(pack, { body: { warehouseId: this.warehouseId!, networkCode: serials ? undefined : this.networkCode, serials, qty: serials ? undefined : this.qty, name: this.name || undefined, idempotencyKey: newKey('pack') } })
      .subscribe({ next: (b: BundleView) => { this.toast.ok(`Packed ${b.name} with ${b.sims} SIMs`); this.ref.close(b); }, error: e => { this.busy.set(false); this.msg.set({ text: toProblem(e).detail + ' [' + toProblem(e).code + ']', bad: true }); } });
  }
}
