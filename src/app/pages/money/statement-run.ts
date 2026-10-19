import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { close2, paid1, publish, run1, statements } from '../../api/functions';
import { AccountRunView, StatementRow } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  @if (r(); as run) {
    <app-page [title]="'Statements ' + (run.statementMonth | month)" [subtitle]="'Paid by ' + run.payoutCompanyCode + ' · generated ' + (run.generatedAt | when:true) + (run.message ? ' · ' + run.message : '')" [crumbs]="['Month-end statements']">
      <span class="tag info">{{ run.status }}</span>
      @if (auth.has('statement.publish') && run.status === 'DRAFT') { <button mat-flat-button (click)="act(publish)"><mat-icon>publish</mat-icon> Publish</button> }
      @if (auth.has('statement.pay') && run.status !== 'DRAFT') { <button mat-stroked-button (click)="csv()"><mat-icon>download</mat-icon> Payout file</button> }
      @if (auth.has('statement.pay') && run.status === 'PUBLISHED') { <button mat-flat-button (click)="act(paid1)">Mark paid</button> }
      @if (auth.has('statement.pay') && run.status === 'PAID') { <button mat-button (click)="act(close2)">Close</button> }
    </app-page>
    <div class="cards">
      <div class="kpi"><div class="label">Reps</div><div class="value">{{ run.reps }}</div></div>
      <div class="kpi"><div class="label">Earnings</div><div class="value">{{ run.earningsTotal | rand }}</div></div>
      <div class="kpi"><div class="label">Pay</div><div class="value">{{ run.payTotal | rand }}</div></div>
    </div>
    <div class="toolbar"><mat-form-field appearance="outline"><mat-label>Flag</mat-label><mat-select [ngModel]="flag" (ngModelChange)="flag = $event; state.refresh()"><mat-option [value]="''">All</mat-option>@for (f of ['OVER_LIMIT','SHORTFALL','LOAN_DUE','PAY_CHANGED','LOAN_ADVANCE','NO_BANK','IN_CREDIT']; track f) { <mat-option [value]="f">{{ f }}</mat-option> }</mat-select></mat-form-field></div>
    <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="router.navigate(['/statements', $event.id])" />
  }`,
})
export class StatementRunPage {
  id = input.required<string>();
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  r = signal<AccountRunView | null>(null); rows = signal<StatementRow[]>([]); flag = ''; state = new ListState(() => this.loadRows());
  publish = publish; paid1 = paid1; close2 = close2;
  cols: Col[] = [{ key: 'repName', label: 'Rep / agent' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'opening', label: 'Opening', type: 'signed' }, { key: 'earnings', label: 'Earnings', type: 'rand' }, { key: 'chargesNow', label: 'Charges', type: 'rand' }, { key: 'loanInstalments', label: 'Loan', type: 'rand' },
    { key: 'recovery', label: 'Recovery', type: 'rand' }, { key: 'proposedPay', label: 'Proposed', type: 'rand' }, { key: 'pay', label: 'Pay', type: 'rand' }, { key: 'closing', label: 'Closing', type: 'signed' }, { key: 'flags', label: 'Flags', type: 'tags' }];
  constructor() { effect(() => { const id = Number(this.id()); if (id) { this.api.call(run1, { id }).subscribe(r => this.r.set(r)); this.loadRows(); } }); }
  loadRows(): void { this.api.call(statements, { id: Number(this.id()), flag: this.flag || undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, s => this.rows.set(s))); }
  async act(fn: any): Promise<void> {
    const what = fn === publish ? ['Publish this run?', 'Statements become visible to reps and the lines are locked.', 'Publish'] : fn === paid1 ? ['Mark this run paid?', 'Record that the payout file was paid outside the system.', 'Mark paid'] : ['Close this run?', undefined, 'Close'];
    if (!(await this.dialogs.confirm(what[0]!, what[1], what[2]))) return;
    this.api.call(fn, { id: Number(this.id()) }).subscribe({ next: (r: any) => { this.r.set(r as AccountRunView); this.toast.ok((r as AccountRunView).status ?? 'ok'); this.loadRows(); }, error: e => this.toast.error(e) }); }
  csv(): void {
    this.api.text(`/api/v1/statements/runs/${this.id()}/payout.csv`).subscribe({ next: t => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = `payout-${this.r()?.statementMonth?.slice(0, 7)}.csv`; a.click();
    }, error: e => this.toast.error(e) });
  }
}
