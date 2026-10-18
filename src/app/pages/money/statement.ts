import { Component, effect, inject, input, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { setPay, statement } from '../../api/functions';
import { StatementView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, KeyValuePipe, PageHeader],
  template: `
  @if (s(); as s) {
    <app-page [title]="s.repName + ' · statement ' + (s.statementMonth | month)" [crumbs]="['Month-end statements']"><span class="tag info">{{ s.status }}</span> @for (f of s.flags || []; track f) { <span class="tag" [class.bad]="f==='OVER_LIMIT'||f==='SHORTFALL'||f==='NO_BANK'" [class.warn]="f==='LOAN_DUE'||f==='PAY_CHANGED'||f==='LOAN_ADVANCE'">{{ f }}</span> }</app-page>
    <div class="grid2">
      <div class="panel">
        <h2>How the pay was worked out</h2>
        <ul class="steps">
          <li><span>Opening balance</span><b [class.neg]="(s.opening||0)<0" [class.pos]="(s.opening||0)>0">{{ s.opening | rand }}</b></li>
          @for (st of s.steps || []; track $index) { <li><span>{{ st['label'] }}</span><b>{{ $any(st['amount']) | rand }}</b></li> }
          <li><span><b>Pay</b> @if (s.payReason) { <span class="muted">({{ s.payReason }})</span> }</span><b>{{ s.pay | rand }}</b></li>
          @if ((s.loanAdvance||0) > 0) { <li><span>of which loan advance</span><b>{{ s.loanAdvance | rand }}</b></li> }
          @if ((s.credits||0) > 0) { <li><span>Credits this month</span><b class="pos">{{ s.credits | rand }}</b></li> }
          @if ((s.chargesOwing||0) > 0) { <li><span>Added to what is owed (loans, losses)</span><b class="neg">{{ s.chargesOwing | rand }}</b></li> }
          <li><span>Closing balance</span><b [class.neg]="(s.closing||0)<0" [class.pos]="(s.closing||0)>0">{{ s.closing | rand }}</b></li>
        </ul>
        @if (auth.has('statement.publish') && s.status === 'DRAFT') { <div style="margin-top:12px"><button mat-stroked-button (click)="setPay()"><mat-icon>edit</mat-icon> Set pay with a reason</button></div> }
      </div>
      <div class="panel">
        <h2>Earnings by company</h2>
        @for (c of (s.earningsByCompany | keyvalue); track c.key) { <div class="line"><span>{{ c.key }}</span><b>{{ c.value | rand }}</b></div> }
        <h2>By line</h2>
        @for (c of (s.earningsByLine | keyvalue); track c.key) { <div class="line"><span>{{ c.key }}</span><b>{{ c.value | rand }}</b></div> }
        <h2>Payout account</h2>
        @if (s.payoutAccount) { <div class="muted">{{ s.payoutAccount['holder'] }} · {{ s.payoutAccount['bank'] }} {{ s.payoutAccount['branch'] }} · {{ s.payoutAccount['account'] }}</div> } @else { <span class="tag bad">no bank details</span> }
      </div>
    </div>
    @for (g of s.groups || []; track g.group) {
      @if (g.group !== 'Earnings' && g.group !== 'Payout') {
        <div class="panel"><h2>{{ g.group }} <span class="muted" style="font-weight:400">· net {{ g.total | rand }}</span></h2>
          @if (g.group === 'Vehicle') { <p class="muted">The monthly vehicle charge taken by the run and the fuel the rep paid, credited back on this statement (each line shows the fill date).</p> }
          <app-table [cols]="groupCols" [rows]="g.lines || []" [filterable]="false" [clickable]="false" [paged]="false" />
        </div>
      }
    }
    <h2>Lines of the month</h2>
    <app-table [cols]="lineCols" [rows]="s.lines || []" />
  }`,
  styles: [`.line { display: flex; justify-content: space-between; padding: 4px 0; }`],
})
export class StatementPage {
  id = input.required<string>();
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  s = signal<StatementView | null>(null);
  lineCols: Col[] = [{ key: 'line', label: 'Line', type: 'tag' }, { key: 'serial', label: 'Serial' }, { key: 'balanceEffect', label: 'Effect on balance', type: 'signed' }, { key: 'reason', label: 'Note' }];
  groupCols: Col[] = [{ key: 'line', label: 'Line', type: 'tag' }, { key: 'reason', label: 'Detail' }, { key: 'createdAt', label: 'Posted', type: 'datetime' }, { key: 'balanceEffect', label: 'Amount', type: 'signed' }];
  constructor() { effect(() => { const id = Number(this.id()); if (id) this.api.call(statement, { id }).subscribe(s => this.s.set(s)); }); }
  async setPay(): Promise<void> {
    const cur = this.s()!;
    const v = await this.dialogs.form({ title: 'Set pay for ' + cur.repName, subtitle: `The rule proposes ${cur.proposedPay}. Pay above what is available is booked as a loan advance.`, submit: 'Apply', width: '440px', initial: { pay: cur.pay }, fields: [
      { key: 'pay', label: 'Pay (R)', type: 'number', step: 0.01, required: true, wide: true }, { key: 'reason', label: 'Reason', required: true, wide: true }] }); if (!v) return;
    this.api.call(setPay, { id: Number(this.id()), body: v }).subscribe({ next: s => { this.s.set(s); this.toast.ok('Pay set'); }, error: e => this.toast.error(e) });
  }
}
