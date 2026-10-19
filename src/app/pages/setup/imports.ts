import { HttpClient, HttpEventType } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { Toast, toProblem } from '../../core/problem';
import { ApiConfiguration } from '../../api/api-configuration';
import { importKinds, importRuns } from '../../api/functions';
import { ImportKindView, ImportRunView, ImportUploadResult } from '../../api/models';

/**
 * Setup → Imports from the old ERP (docs/MIGRATION.md): the steps in order with their dependency state, the template of
 * each, the upload (validated row by row; nothing is written when any row fails), the run log and the rejects sheet.
 */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Imports from the old ERP" subtitle="One Excel template per step, uploaded in order. Every row is checked first; a file with any bad row is refused with the row numbers and reasons and nothing is written. Uploading the same file again adds nothing.">
    <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon> Refresh</button>
  </app-page>
  <div class="steps">
    @for (k of kinds(); track k.code) {
      <div class="panel step" [class.blocked]="k.blocked" [class.active]="sel()?.code === k.code" (click)="pick(k)">
        <div class="row" style="align-items:center">
          <span class="num">M{{ k.order }}</span>
          <h2 style="margin:0">{{ k.name }}</h2>
          <span class="grow"></span>
          @if (k.blocked) { <span class="tag warn">blocked: needs {{ k.dependsOn?.join(', ') }}</span> }
          @else if (k.lastRun) { <span class="tag ok">last run {{ k.lastRun.finishedAt | when:true }}</span> }
          @else { <span class="tag info">not loaded yet</span> }
        </div>
        <div class="muted" style="margin-top:6px">
          {{ k.columns?.length }} columns · up to {{ k.maxRows | qty }} rows per file
          @if (k.dependsOn?.length) { · after {{ k.dependsOn?.join(', ') }} }
          @if (k.lastRun) { · {{ k.lastRun.rowsWritten | qty }} written, {{ k.lastRun.rowsSkipped | qty }} already loaded from {{ k.lastRun.fileName }} }
        </div>
      </div>
    }
  </div>

  @if (sel(); as k) {
    <div class="grid2">
      <div class="panel">
        <h2>{{ k.name }}: upload</h2>
        <div class="row" style="align-items:center">
          <button mat-stroked-button (click)="template(k)"><mat-icon>download</mat-icon> Template {{ k.code }}.xlsx</button>
          <input #f type="file" accept=".xlsx,.xlsm,.csv" (change)="file = $any($event.target).files[0] ?? null">
          <button mat-flat-button [disabled]="!file || busy() || k.blocked" (click)="send(k, f)"><mat-icon>upload</mat-icon> Upload</button>
        </div>
        @if (k.blocked) { <div class="muted" style="margin-top:8px">Upload {{ k.dependsOn?.join(', ') }} first: this step depends on a successful run of it.</div> }
        @if (busy()) { <mat-progress-bar [mode]="progress() < 100 ? 'determinate' : 'indeterminate'" [value]="progress()" style="margin-top:12px"></mat-progress-bar><div class="muted" style="margin-top:4px">{{ progress() < 100 ? 'Uploading ' + progress() + ' %' : 'Checking and writing rows…' }}</div> }
        @if (result(); as r) {
          <div class="res" [class.bad]="r.run?.status !== 'DONE'">
            <b>{{ r.run?.fileName }}</b> · <span class="tag" [class.ok]="r.run?.status === 'DONE'" [class.bad]="r.run?.status !== 'DONE'">{{ r.run?.status }}</span><br>
            {{ r.run?.message }}<br>
            <span class="muted">read {{ r.run?.rowsRead | qty }} · written {{ r.run?.rowsWritten | qty }} · already loaded {{ r.run?.rowsSkipped | qty }} · rejected {{ r.run?.rowsRejected | qty }}</span>
            @if (r.rejects?.length) {
              <div style="margin-top:8px"><b>Rejected rows</b> @if (r.moreRejects) { (first {{ r.rejects!.length }}; the sheet has them all) } <button mat-button (click)="rejects(r.run!)"><mat-icon>download</mat-icon> Rejects sheet</button></div>
              <table class="rej">@for (x of r.rejects; track x.rowNo) { <tr><td class="num">row {{ x.rowNo }}</td><td>{{ x.reason }}</td></tr> }</table>
            }
          </div>
        }
        <h2 style="margin-top:18px">Columns</h2>
        <table class="cols">
          @for (c of k.columns; track c.name) { <tr><td><code>{{ c.name }}</code>@if (c.required) { <span class="req">*</span> }</td><td>{{ c.description }}</td><td class="muted">{{ c.example }}</td></tr> }
        </table>
      </div>
      <div class="panel">
        <h2>Notes</h2>
        <ul class="notes">@for (n of k.notes; track $index) { <li>{{ n }}</li> }</ul>
      </div>
    </div>
  }

  <h2>Runs</h2>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Step</mat-label><mat-select [(ngModel)]="kindFilter" (valueChange)="state.refresh()"><mat-option [value]="''">All</mat-option>@for (k of kinds(); track k.code) { <mat-option [value]="k.code">{{ k.name }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [(ngModel)]="statusFilter" (valueChange)="state.refresh()"><mat-option [value]="''">All</mat-option><mat-option value="DONE">DONE</mat-option><mat-option value="FAILED">FAILED</mat-option><mat-option value="RUNNING">RUNNING</mat-option></mat-select></mat-form-field>
  </div>
  <app-table [cols]="runCols" [rows]="runs()" [server]="state" [filterable]="false" (pick)="openRun($event)" empty="No imports yet." />`,
  styles: [`
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .step { cursor: pointer; margin-bottom: 0; border-left: 4px solid var(--info); } .step.blocked { border-left-color: var(--warn); opacity: .85; } .step.active { outline: 2px solid var(--brand); }
    .num { font-weight: 800; color: var(--ink-3); font-size: 12px; background: #eef2f6; border-radius: 6px; padding: 2px 7px; }
    .res { background: #f0fdf4; border-radius: 8px; padding: 10px 12px; margin-top: 10px; } .res.bad { background: #fef2f2; }
    .rej { font-size: 12px; margin-top: 6px; border-collapse: collapse; } .rej td { padding: 2px 8px 2px 0; vertical-align: top; } .rej .num { white-space: nowrap; color: var(--ink-3); }
    .cols { font-size: 12.5px; border-collapse: collapse; width: 100%; } .cols td { padding: 4px 8px 4px 0; border-top: 1px solid var(--line); vertical-align: top; } .cols code { font-size: 12px; }
    .req { color: var(--bad); font-weight: 700; margin-left: 2px; }
    .notes { padding-left: 18px; font-size: 13px; } .notes li { margin-bottom: 6px; }
    input[type=file] { font-size: 13px; }
  `],
})
export class ImportsPage {
  private api = inject(ApiClient); private http = inject(HttpClient); private cfg = inject(ApiConfiguration); private toast = inject(Toast); private dialogs = inject(Dialogs);
  kinds = signal<ImportKindView[]>([]); sel = signal<ImportKindView | null>(null); runs = signal<ImportRunView[]>([]);
  state = new ListState(() => this.loadRuns());
  file: File | null = null; busy = signal(false); progress = signal(0); result = signal<ImportUploadResult | null>(null);
  kindFilter = ''; statusFilter = '';
  runCols: Col[] = [{ key: 'id', label: '#' }, { key: 'startedAt', label: 'When', type: 'datetime' }, { key: 'kind', label: 'Step' }, { key: 'fileName', label: 'File' }, { key: 'startedByName', label: 'By' },
    { key: 'rowsRead', label: 'Read', type: 'qty' }, { key: 'rowsWritten', label: 'Written', type: 'qty' }, { key: 'rowsSkipped', label: 'Already loaded', type: 'qty' }, { key: 'rowsRejected', label: 'Rejected', type: 'qty' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'message', label: 'Message' }];

  constructor() { this.load(); }

  load(): void {
    this.api.call(importKinds).subscribe(k => { this.kinds.set(k); const cur = this.sel(); this.sel.set(cur ? k.find(x => x.code === cur.code) ?? null : k.find(x => !x.blocked && !x.lastRun) ?? k[0] ?? null); });
    this.loadRuns();
  }
  loadRuns(): void { this.api.call(importRuns, { kind: this.kindFilter || undefined, status: this.statusFilter || undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.runs.set(r))); }
  pick(k: ImportKindView): void { if (this.sel()?.code !== k.code) { this.sel.set(k); this.result.set(null); this.file = null; } }

  template(k: ImportKindView): void { this.download(`/api/v1/imports/templates/${k.code}`, `${k.code}.xlsx`); }
  rejects(r: ImportRunView): void { this.download(`/api/v1/imports/runs/${r.id}/rejects`, `import-run-${r.id}-rejects.xlsx`); }
  private download(path: string, name: string): void {
    this.http.get(this.cfg.rootUrl + path, { responseType: 'blob' }).subscribe({ next: b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, error: e => this.toast.error(e) });
  }

  send(k: ImportKindView, input: HTMLInputElement): void {
    if (!this.file) return;
    const form = new FormData(); form.append('file', this.file, this.file.name);
    this.busy.set(true); this.progress.set(0); this.result.set(null);
    this.http.post<ImportUploadResult>(`${this.cfg.rootUrl}/api/v1/imports/${k.code}`, form, { reportProgress: true, observe: 'events' }).subscribe({
      next: ev => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress.set(Math.min(100, Math.round(100 * ev.loaded / ev.total)));
        else if (ev.type === HttpEventType.Response) { this.busy.set(false); this.result.set(ev.body); this.file = null; input.value = ''; this.load(); if (ev.body?.run?.status === 'DONE') this.toast.ok(ev.body.run.message ?? 'Done'); }
      },
      error: e => { this.busy.set(false); const p = toProblem(e); this.toast.error(e); if (p.code === 'TOO_MANY_ROWS' || p.code === 'MISSING_COLUMNS' || p.code === 'STEP_BLOCKED') this.dialogs.confirm('File refused', p.detail, 'OK'); this.load(); },
    });
  }

  async openRun(r: ImportRunView): Promise<void> {
    const msg = `${r.kind} · ${r.fileName}\n${r.message ?? ''}\nread ${r.rowsRead}, written ${r.rowsWritten}, already loaded ${r.rowsSkipped}, rejected ${r.rowsRejected}\nby ${r.startedByName ?? r.startedBy} · sha256 ${r.sha256}`;
    if (r.rowsRejected && r.rowsRejected > 0) { if (await this.dialogs.confirm(`Import run ${r.id} · ${r.status}`, msg, 'Download rejects')) this.rejects(r); }
    else await this.dialogs.confirm(`Import run ${r.id} · ${r.status}`, msg, 'OK');
  }
}
