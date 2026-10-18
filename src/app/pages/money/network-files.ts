import { Component, inject, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { coverage, files, reverse, suppliers, upload } from '../../api/functions';
import { CoverageRow, ImportFileView, ImportResult, SupplierSummary } from '../../api/models';

const KINDS = [
  { v: 'RICA_DAILY', l: 'Daily · RICA (pipe csv)' }, { v: 'CONNECTION_DAILY', l: 'Daily · Connections / FCDR (pipe csv)' }, { v: 'RECHARGE_DAILY', l: 'Daily · Recharges / OGR (pipe csv)' }, { v: 'DISCONNECTION_DAILY', l: 'Daily · Disconnections (pipe csv)' },
  { v: 'STATEMENT_MONTHLY', l: 'Monthly · Dealer statement workbook (.xlsb, PRE_ADL + PRE_ONG)' }, { v: 'ACTIVATION_MONTHLY', l: 'Monthly · Activation list (.xlsx)' }, { v: 'RECHARGE_MONTHLY', l: 'Monthly · Recharge list (.xlsx)' },
];

@Component({
  standalone: true, imports: [UI, KeyValuePipe, PageHeader],
  template: `
  <app-page title="Network files" subtitle="Daily files (RICA, connections, recharges, disconnections) feed monitoring; the monthly statement workbook carries the money. The same file is never loaded twice; a wrong upload is reversed by id." />
  <div class="grid2">
    @if (auth.has('files.import')) {
      <div class="panel"><h2>Upload</h2>
        <div class="row">
          <mat-form-field appearance="outline"><mat-label>Supplier</mat-label><mat-select [(ngModel)]="supplierId">@for (s of sups(); track s.partyId) { <mat-option [value]="s.partyId">{{ s.name }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Kind</mat-label><mat-select [(ngModel)]="kind">@for (k of kinds; track k.v) { <mat-option [value]="k.v">{{ k.l }}</mat-option> }</mat-select></mat-form-field>
          @if (kind.endsWith('_MONTHLY')) { <mat-form-field appearance="outline"><mat-label>Month</mat-label><input matInput [(ngModel)]="period" placeholder="yyyy-MM"><mat-hint>{{ kind === 'STATEMENT_MONTHLY' ? 'required' : 'used when the file has no MONTH/YEAR' }}</mat-hint></mat-form-field> }
          <mat-form-field appearance="outline"><mat-label>Network (optional)</mat-label><input matInput [(ngModel)]="network"></mat-form-field>
        </div>
        <input type="file" (change)="file = $any($event.target).files[0]" accept=".csv,.txt,.xlsb,.xlsx">
        <button mat-flat-button [disabled]="!file || busy()" (click)="send()">Upload</button>
        @if (busy()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
        @if (result(); as r) {
          <div class="res"><b>{{ r.fileName }}</b> · {{ r.status }} · {{ r.millis }} ms<br>
            rows {{ r.rowsTotal | qty }} · new {{ r.rowsNew | qty }} · duplicate {{ r.rowsDuplicate | qty }} · skipped {{ r.rowsSkipped | qty }} · unknown serial {{ r.rowsUnknownSerial | qty }} · unknown account {{ r.rowsUnknownAccount | qty }}
            @if (r.sheets) { <br>sheets: @for (s of (r.sheets | keyvalue); track s.key) { {{ s.key }} {{ s.value }} } }
            @for (p of r.problems || []; track $index) { <div class="muted">{{ p }}</div> }
          </div>
        }
      </div>
    }
    <div class="panel"><h2>Coverage</h2><app-table [cols]="covCols" [rows]="cov()" empty="Nothing imported yet." /></div>
  </div>
  <h2>Imported files</h2>
  <app-table [cols]="cols" [rows]="list()" [server]="state" (pick)="undo($event)" />`,
  styles: [`.res { background: #f3f4f6; border-radius: 8px; padding: 10px 12px; margin-top: 10px; }`],
})
export class NetworkFilesPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  kinds = KINDS; sups = signal<SupplierSummary[]>([]); list = signal<ImportFileView[]>([]); cov = signal<CoverageRow[]>([]); state = new ListState(() => this.load());
  supplierId?: number; kind = 'RICA_DAILY'; period = ''; network = ''; file: File | null = null; busy = signal(false); result = signal<ImportResult | null>(null);
  covCols: Col[] = [{ key: 'supplierName', label: 'Supplier' }, { key: 'kind', label: 'Kind' }, { key: 'events', label: 'Events', type: 'qty' }, { key: 'files', label: 'Files', type: 'qty' }, { key: 'latestEventDate', label: 'Latest event', type: 'date' }, { key: 'latestPeriod', label: 'Latest period', type: 'month' }];
  cols: Col[] = [{ key: 'id', label: '#' }, { key: 'importedAt', label: 'When', type: 'datetime' }, { key: 'supplierName', label: 'Supplier' }, { key: 'kind', label: 'Kind' }, { key: 'fileName', label: 'File' }, { key: 'period', label: 'Period', type: 'month' },
    { key: 'rowsTotal', label: 'Rows', type: 'qty' }, { key: 'rowsNew', label: 'New', type: 'qty' }, { key: 'rowsDuplicate', label: 'Dup', type: 'qty' }, { key: 'rowsSkipped', label: 'Skipped', type: 'qty' }, { key: 'rowsUnknownSerial', label: 'Unknown serial', type: 'qty' }, { key: 'status', label: 'Status', type: 'tag' }];
  constructor() { this.api.call(suppliers, { size: 500 }).subscribe(pg => { const s = pg.items ?? []; this.sups.set(s); this.supplierId ??= s[0]?.partyId; }); this.load(); }
  load(): void { this.api.call(files, this.state.params()).subscribe(p => this.state.apply(p, f => this.list.set(f))); this.api.call(coverage, { size: 100 }).subscribe(c => this.cov.set(c.items ?? [])); }
  send(): void {
    this.busy.set(true); this.result.set(null);
    this.api.call(upload, { supplierPartyId: this.supplierId!, kind: this.kind, period: this.period || undefined, networkCode: this.network || undefined, body: { file: this.file! } })
      .subscribe({ next: r => { this.busy.set(false); this.result.set(r); this.file = null; this.load(); }, error: e => { this.busy.set(false); this.toast.error(e); } });
  }
  async undo(f: ImportFileView): Promise<void> {
    if (!this.auth.has('files.import') || f.status !== 'DONE' || !(await this.dialogs.confirm(`Reverse file ${f.id}?`, `${f.fileName}: its ${f.rowsNew} events are removed. The file can be loaded again afterwards.`, 'Reverse', true))) return;
    this.api.call(reverse, { id: f.id! }).subscribe({ next: () => { this.toast.ok('Reversed'); this.load(); }, error: e => this.toast.error(e) });
  }
}
