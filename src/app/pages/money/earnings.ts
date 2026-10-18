import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { run, runs1 } from '../../api/functions';
import { RunView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Earnings runs" subtitle="One run per company and statement month: every monthly activation and recharge is attributed to the SIM's owner at the time and turned into money lines. Re-running replaces; approving locks." />
  @if (auth.has('earnings.run')) {
    <div class="toolbar">
      <mat-form-field appearance="outline"><mat-label>Company</mat-label><mat-select [(ngModel)]="companyId">@for (c of companies.companies(); track c.id) { <mat-option [value]="c.id">{{ c.code }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Month</mat-label><input matInput [(ngModel)]="period" placeholder="yyyy-MM"></mat-form-field>
      <button mat-flat-button [disabled]="busy() || !companyId || !period" (click)="start()">Run</button>
      @if (busy()) { <mat-progress-bar mode="indeterminate" style="width:200px"></mat-progress-bar> }
    </div>
  }
  <app-table [cols]="cols" [rows]="list()" [server]="state" (pick)="router.navigate(['/earnings', $event.id])" />`,
})
export class EarningsPage {
  auth = inject(AuthService); companies = inject(CompanyService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast);
  list = signal<RunView[]>([]); busy = signal(false); state = new ListState(() => this.load());
  companyId?: number; period = yyyyMm();
  cols: Col[] = [{ key: 'period', label: 'Month', type: 'month' }, { key: 'companyCode', label: 'Company' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'eventsTotal', label: 'Events', type: 'qty' }, { key: 'eventsAttributed', label: 'Attributed', type: 'qty' },
    { key: 'linesTotal', label: 'Lines', type: 'qty' }, { key: 'exceptionsTotal', label: 'Exceptions', type: 'qty' }, { key: 'activationAlreadyPaid', label: 'Already paid', type: 'qty' }, { key: 'finishedAt', label: 'Finished', type: 'datetime' }];
  constructor() { this.load(); effect(() => { const id = this.companies.defaultId(); if (id && !this.companyId) this.companyId = id; }); }
  load(): void { this.api.call(runs1, { companyId: this.companies.param(), ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.list.set(r))); }
  start(): void {
    this.busy.set(true);
    this.api.call(run, { body: { companyId: this.companyId!, period: this.period } }).subscribe({ next: r => { this.busy.set(false); this.toast.ok(r.message ?? 'Done'); this.router.navigate(['/earnings', r.id]); }, error: e => { this.busy.set(false); this.toast.error(e); } });
  }
}
