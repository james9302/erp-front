import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ListState } from '../../core/list-state';
import { MatDialog } from '@angular/material/dialog';
import { PackDialog } from './pack-dialog';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { newKey, splitSerials } from '../../core/pipes';
import { bundleSerials, bundles, networks, onHand, quarantine, release, summary, unpack, writeOff } from '../../api/functions';
import { BundleView, NetworkResponse, StockOnHandRow, StockSummary } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Stock on hand" subtitle="What each company holds right now, where it is, who supplied it and what it cost. Counts come from every SIM's current position." />
  @if (sum(); as s) {
    <div class="cards">
      <div class="kpi"><div class="label">In warehouse (available)</div><div class="value">{{ s.inWarehouse | qty }}</div><div class="sub">{{ s.warehouseValueExcl | rand }} at cost excl. VAT</div></div>
      <div class="kpi"><div class="label">Packed, waiting allocation</div><div class="value">{{ s.packed | qty }}</div><div class="sub">{{ bundleList().length }} bundles</div></div>
      <div class="kpi"><div class="label">With reps</div><div class="value">{{ s.withReps | qty }}</div></div>
      <div class="kpi"><div class="label">With agents & shops</div><div class="value">{{ (s.withAgents || 0) + (s.withShops || 0) | qty }}</div><div class="sub">{{ s.withAgents | qty }} agents · {{ s.withShops | qty }} shops</div></div>
      <div class="kpi"><div class="label">Returned, to be checked</div><div class="value">{{ s.returnedCheck | qty }}</div><div class="sub">{{ s.quarantine | qty }} quarantine</div></div>
    </div>
  }
  <mat-tab-group>
    <mat-tab label="Warehouse stock">
      <div class="toolbar">
        <mat-form-field appearance="outline"><mat-label>Network</mat-label><mat-select [ngModel]="network" (ngModelChange)="network = $event; state.refresh()"><mat-option [value]="''">All</mat-option>@for (n of nets(); track n.code) { <mat-option [value]="n.code">{{ n.name }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Status</mat-label><mat-select [ngModel]="status" (ngModelChange)="status = $event; state.refresh()"><mat-option [value]="''">All</mat-option>@for (s of ['IN_WAREHOUSE','PACKED','RETURNED_CHECK','QUARANTINE','WITH_REP','WITH_AGENT','WITH_SHOP','SOLD']; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
        <mat-checkbox [(ngModel)]="warehouseOnly" (change)="state.refresh()">Warehouse only</mat-checkbox>
      </div>
      <app-table [cols]="cols" [rows]="rows()" [server]="state" />
    </mat-tab>
    <mat-tab label="Bundles">
      <div class="toolbar"><mat-checkbox [(ngModel)]="unallocated" (change)="bundleState.refresh()">Unallocated only</mat-checkbox><span class="muted">Click a bundle to see its serials or unpack what is left. A bundle may mix networks and be handed out in parts.</span><span class="grow"></span>@if (auth.has('stock.pack')) { <button mat-flat-button (click)="doPack()"><mat-icon>inventory_2</mat-icon> Pack a bundle</button> }</div>
      <app-table [cols]="bundleCols" [rows]="bundleList()" [server]="bundleState" (pick)="unpackBundle($event)" />
    </mat-tab>
    @if (auth.has('stock.allocate')) {
      <mat-tab label="Quarantine / write-off">
        <div class="panel">
          <mat-form-field appearance="outline" class="full"><mat-label>Serials</mat-label><textarea matInput rows="4" class="serials" [(ngModel)]="moveText"></textarea></mat-form-field>
          <mat-form-field appearance="outline" style="min-width:300px"><mat-label>Reason</mat-label><input matInput [(ngModel)]="moveReason"></mat-form-field>
          <div class="row">
            <button mat-stroked-button (click)="move(quarantine)">Quarantine</button>
            <button mat-stroked-button (click)="move(release)">Release to stock</button>
            <button mat-stroked-button color="warn" (click)="move(writeOff)">Write off (company loss)</button>
          </div>
        </div>
      </mat-tab>
    }
  </mat-tab-group>`,
})
export class StockOnHandPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs); private dialog = inject(MatDialog);
  sum = signal<StockSummary | null>(null); rows = signal<StockOnHandRow[]>([]); state = new ListState(() => this.load()); bundleState = new ListState(() => this.loadBundles()); nets = signal<NetworkResponse[]>([]); bundleList = signal<BundleView[]>([]);
  network = ''; status = ''; warehouseOnly = true; unallocated = true;
  moveText = ''; moveReason = '';
  quarantine = quarantine; release = release; writeOff = writeOff;
  cols: Col[] = [{ key: 'companyCode', label: 'Company' }, { key: 'warehouseCode', label: 'Warehouse' }, { key: 'supplierName', label: 'Supplier' }, { key: 'account', label: 'Account' }, { key: 'productCode', label: 'Product' }, { key: 'networkCode', label: 'Network' },
    { key: 'status', label: 'Status', type: 'tag' }, { key: 'qty', label: 'Qty', type: 'qty' }, { key: 'valueExcl', label: 'Value excl', type: 'rand' }, { key: 'oldestReceivedAt', label: 'Oldest', type: 'date' }, { key: 'oldestDays', label: 'Days', type: 'qty' }];
  bundleCols: Col[] = [{ key: 'name', label: 'Bundle' }, { key: 'warehouseCode', label: 'Warehouse' }, { key: 'networks', label: 'Networks' }, { key: 'sims', label: 'Packed', type: 'qty' }, { key: 'left', label: 'Left', type: 'qty' }, { key: 'packedAt', label: 'Packed on', type: 'datetime' }, { key: 'status', label: 'Status', type: 'tag' }];
  constructor() { this.load(); this.loadBundles(); this.api.call(networks).subscribe(n => this.nets.set(n)); }
  load(): void {
    const companyId = this.companies.param();
    this.api.call(summary, { companyId }).subscribe(s => this.sum.set(s));
    this.api.call(onHand, { companyId, networkCode: this.network || undefined, status: this.status || undefined, warehouseOnly: this.warehouseOnly, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r)));
  }
  loadBundles(): void { this.api.call(bundles, { unallocated: this.unallocated ? true : undefined, ...this.bundleState.params() }).subscribe(p => this.bundleState.apply(p, b => this.bundleList.set(b))); }
  async doPack(): Promise<void> {
    const warehouses = this.companies.companies().flatMap(c => (c.warehouses ?? []).map(w => ({ id: w.id!, label: `${c.code} · ${w.code}`, companyId: c.id! })));
    const b = await firstValueFrom(this.dialog.open(PackDialog, { data: { warehouses, networks: this.nets() }, width: '760px', maxWidth: '94vw', disableClose: true }).afterClosed());
    if (b) { this.load(); this.loadBundles(); }
  }
  async unpackBundle(b: BundleView): Promise<void> {
    const serials = await firstValueFrom(this.api.call(bundleSerials, { id: b.id! }));
    const v = await this.dialogs.form({ title: `${b.name} · ${b.sims} SIMs`, subtitle: `${b.networks} · ${b.warehouseCode} · packed ${new Date(b.packedAt!).toLocaleString('en-ZA')} · ${b.left} of ${b.sims} left · ${b.status}`, submit: !b.left || !this.auth.has('stock.pack') ? 'Close' : `Unpack the ${b.left} left`, width: '560px',
      initial: { serials: serials.join('\n') }, fields: [{ key: 'serials', label: 'Serials', type: 'textarea' }] });
    if (!v || !b.left || !this.auth.has('stock.pack')) return;
    this.api.call(unpack, { id: b.id!, body: { idempotencyKey: newKey('unpack'), reason: 'unpacked from stock screen' } }).subscribe({ next: () => { this.toast.ok('Unpacked'); this.load(); this.loadBundles(); }, error: e => this.toast.error(e) });
  }
  move(fn: any): void {
    this.api.call(fn, { body: { serials: splitSerials(this.moveText), reason: this.moveReason, idempotencyKey: newKey('wh') } }).subscribe({ next: () => { this.toast.ok('Done'); this.moveText = ''; this.load(); }, error: e => this.toast.error(e) });
  }
}
