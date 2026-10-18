import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast, toProblem } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { generate, runs } from '../../api/functions';
import { AccountRunView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Month-end statements" subtitle="One statement and one payout per rep from the default payout company, built from the approved earnings of the month and the account rule: vehicle and items first, keep the minimum, loan instalments, then recovery of the old balance." />
  @if (auth.has('statement.run')) {
    <div class="toolbar">
      <mat-form-field appearance="outline"><mat-label>Statement month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM"></mat-form-field>
      <mat-checkbox [(ngModel)]="allow">Allow unapproved earnings</mat-checkbox>
      <button mat-flat-button [disabled]="busy()" (click)="gen()">Generate / regenerate</button>
      @if (problem(); as p) { <span class="tag bad">{{ p.code }}: {{ p.detail }}</span> }
    </div>
  }
  <app-table [cols]="cols" [rows]="list()" [server]="state" (pick)="router.navigate(['/statements/runs', $event.id])" />`,
})
export class StatementsPage {
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast);
  list = signal<AccountRunView[]>([]); busy = signal(false); problem = signal<any>(null); state = new ListState(() => this.load());
  month = yyyyMm(new Date(new Date().setMonth(new Date().getMonth() - 1))); allow = false;
  cols: Col[] = [{ key: 'statementMonth', label: 'Month', type: 'month' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'payoutCompanyCode', label: 'Paid by' }, { key: 'reps', label: 'Reps', type: 'qty' }, { key: 'earningsTotal', label: 'Earnings', type: 'rand' }, { key: 'payTotal', label: 'Pay', type: 'rand' }, { key: 'generatedAt', label: 'Generated', type: 'datetime' }, { key: 'publishedAt', label: 'Published', type: 'datetime' }, { key: 'paidAt', label: 'Paid', type: 'datetime' }];
  constructor() { this.load(); }
  load(): void { this.api.call(runs, this.state.params()).subscribe(p => this.state.apply(p, r => this.list.set(r))); }
  gen(): void {
    this.busy.set(true); this.problem.set(null);
    this.api.call(generate, { body: { month: this.month, allowUnapprovedEarnings: this.allow } }).subscribe({ next: r => { this.busy.set(false); this.toast.ok(`${r.reps} statements, pay ${r.payTotal}`); this.router.navigate(['/statements/runs', r.id]); }, error: e => { this.busy.set(false); this.problem.set(toProblem(e)); } });
  }
}
