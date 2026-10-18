import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { account1, charge, chargeTypes, endCharge, saveSettings, settings, statementsOfRep } from '../../api/functions';
import { ChargeRequest, ChargeTypeView, RepAccountDetail, SettingsView, StatementView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  @if (d(); as d) {
    <app-page [title]="d.account?.repName || ''" [crumbs]="['Rep accounts']">
      <span class="tag info">{{ d.account?.kind }}</span> @for (f of (d.account?.flags ?? []); track f) { <span class="tag" [class.bad]="f==='OVER_LIMIT' || f==='NO_BANK'" [class.warn]="f==='NEAR_LIMIT'" [class.ok]="f==='IN_CREDIT'">{{ f }}</span> }
      @if (auth.has('ledger.charge')) { <button mat-flat-button (click)="post()"><mat-icon>add_card</mat-icon> Post charge / credit</button> }
      @if (auth.has('ledger.settings')) { <button mat-stroked-button (click)="editSettings()"><mat-icon>tune</mat-icon> Settings</button> }
    </app-page>
    <div class="cards">
      <div class="kpi" [class.ok]="(d.account?.balance||0)>0" [class.bad]="(d.account?.balance||0)<0"><div class="ico"><mat-icon>account_balance</mat-icon></div><div class="label">Balance</div><div class="value">{{ d.account?.balance | rand }}</div><div class="sub">owing {{ d.account?.owing | rand }}</div></div>
      <div class="kpi"><div class="ico"><mat-icon>credit_score</mat-icon></div><div class="label">Credit limit</div><div class="value">{{ d.account?.creditLimit | rand }}</div><div class="sub">available {{ d.account?.available | rand }}</div></div>
      <div class="kpi warn"><div class="ico"><mat-icon>request_quote</mat-icon></div><div class="label">Loan balance</div><div class="value">{{ d.account?.loanBalance | rand }}</div></div>
      <div class="kpi ok"><div class="ico"><mat-icon>trending_up</mat-icon></div><div class="label">Earned this month</div><div class="value">{{ d.account?.earnedThisPeriod | rand }}</div></div>
    </div>
    <mat-tab-group>
      <mat-tab label="Lines"><app-table [cols]="lineCols" [rows]="d.recentLines || []" [clickable]="false" /></mat-tab>
      <mat-tab label="Charges & loans"><p class="muted">Click a charge to end it.</p><app-table [cols]="chargeCols" [rows]="d.openCharges || []" [filterable]="false" (pick)="end($event)" empty="No open charges." /></mat-tab>
      <mat-tab label="Settings">
        @if (s(); as s) {
          <div class="panel">
            <div class="muted">{{ s.usesDefaults ? 'Using the account defaults.' : 'Own settings.' }}</div>
            <ul class="steps">
              <li><span>Credit limit</span><b>{{ s.creditLimit | rand }}</b></li><li><span>Minimum keep</span><b>{{ s.minKeep | rand }}</b></li>
              <li><span>Recovery</span><b>{{ s.recoveryPercent }} %</b></li><li><span>Mode</span><b>{{ s.mode }}</b></li>
              <li><span>Payout account</span><b>{{ s.payoutAccount ? (s.payoutAccount['bank'] + ' ' + s.payoutAccount['branch'] + ' · ' + s.payoutAccount['account'] + ' · ' + s.payoutAccount['holder']) : '—' }}</b></li>
            </ul>
            <div class="muted" style="margin-top:8px">Account numbers are masked everywhere except the payout file.</div>
          </div>
        }
      </mat-tab>
      <mat-tab label="Statements"><app-table [cols]="stmtCols" [rows]="stmts()" [filterable]="false" (pick)="router.navigate(['/statements', $event.id])" empty="No statements yet." /></mat-tab>
    </mat-tab-group>
  }`,
})
export class AccountPage {
  id = input.required<string>();
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  d = signal<RepAccountDetail | null>(null); s = signal<SettingsView | null>(null); types = signal<ChargeTypeView[]>([]); stmts = signal<StatementView[]>([]);
  lineCols: Col[] = [{ key: 'period', label: 'Month', type: 'month' }, { key: 'line', label: 'Line', type: 'tag' }, { key: 'serial', label: 'Serial' }, { key: 'balanceEffect', label: 'Effect on balance', type: 'signed' }, { key: 'reason', label: 'Note' }, { key: 'createdAt', label: 'Posted', type: 'datetime' }];
  chargeCols: Col[] = [{ key: 'typeName', label: 'Type' }, { key: 'amount', label: 'Amount', type: 'rand' }, { key: 'principal', label: 'Principal', type: 'rand' }, { key: 'remaining', label: 'Left', type: 'rand' }, { key: 'recurring', label: 'Recurring', type: 'bool' }, { key: 'fromPeriod', label: 'From', type: 'month' }, { key: 'toPeriod', label: 'To', type: 'month' }, { key: 'reason', label: 'Reason' }];
  stmtCols: Col[] = [{ key: 'statementMonth', label: 'Month', type: 'month' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'earnings', label: 'Earnings', type: 'rand' }, { key: 'chargesNow', label: 'Charges', type: 'rand' }, { key: 'recovery', label: 'Recovery', type: 'rand' }, { key: 'pay', label: 'Pay', type: 'rand' }, { key: 'closing', label: 'Closing', type: 'signed' }];
  constructor() { effect(() => { const id = Number(this.id()); if (id) this.load(id); }); this.api.call(chargeTypes).subscribe(t => this.types.set(t)); }
  load(id: number): void {
    this.api.call(account1, { repPartyId: id }).subscribe(d => this.d.set(d));
    this.api.call(settings, { repPartyId: id }).subscribe(s => this.s.set(s));
    this.api.call(statementsOfRep, { repPartyId: id }).subscribe(l => this.stmts.set(l));
  }
  async post(): Promise<void> {
    const loanCodes = new Set(this.types().filter(t => t.loan).map(t => t.code));
    const v = await this.dialogs.form({ title: 'Post to ' + this.d()?.account?.repName, submit: 'Post', initial: { fromPeriod: yyyyMm(), recurring: false }, fields: [
      { key: 'typeCode', label: 'Type', type: 'select', required: true, wide: true, options: this.types().map(t => opt(t.code, `${t.name} (${t.payRule === 'ALWAYS' ? 'taken from the pay' : t.payRule === 'RECOVERY' ? 'owed, recovered by the rule' : t.direction === -1 ? 'credit' : 'balance only'})`)) },
      { key: 'amount', label: 'Amount (loans: monthly instalment)', type: 'number', step: 0.01, required: true }, { key: 'principal', label: 'Loan principal', type: 'number', step: 0.01, when: x => loanCodes.has(x.typeCode) },
      { key: 'fromPeriod', label: 'From month', type: 'month', required: true }, { key: 'toPeriod', label: 'To month (recurring)', type: 'month', when: x => !!x.recurring },
      { key: 'recurring', label: 'Recurring every month', type: 'checkbox' }, { key: 'overrideLimit', label: 'Override the credit limit', type: 'checkbox' },
      { key: 'reason', label: 'Reason', required: true, wide: true }] }); if (!v) return;
    this.api.call(charge, { body: { ...v, repPartyId: Number(this.id()) } as ChargeRequest }).subscribe({ next: () => { this.toast.ok('Posted'); this.load(Number(this.id())); }, error: e => this.toast.error(e) });
  }
  async end(c: any): Promise<void> {
    if (!this.auth.has('ledger.charge')) return;
    const reason = await this.dialogs.reason(`End ${c.typeName}?`, c.reason, 'End charge', true); if (!reason) return;
    this.api.call(endCharge, { id: c.id, body: { reason } }).subscribe({ next: () => this.load(Number(this.id())), error: e => this.toast.error(e) });
  }
  async editSettings(): Promise<void> {
    const s = this.s(); if (!s) return;
    const v = await this.dialogs.form({ title: 'Account settings · ' + s.repName, subtitle: 'Blank limit, keep or recovery = use the defaults. Leave the masked account number untouched to keep it.', submit: 'Save', initial: { creditLimit: s.usesDefaults ? undefined : s.creditLimit, minKeep: s.usesDefaults ? undefined : s.minKeep, recoveryPercent: s.usesDefaults ? undefined : s.recoveryPercent, mode: s.mode, ...prefix('bank_', s.payoutAccount) }, fields: [
      { key: 'creditLimit', label: 'Credit limit', type: 'number' }, { key: 'minKeep', label: 'Minimum keep', type: 'number' }, { key: 'recoveryPercent', label: 'Recovery %', type: 'number' },
      { key: 'mode', label: 'Mode', type: 'select', required: true, options: [opt('PERCENT', 'PERCENT'), opt('KEEP_ALL', 'KEEP_ALL (VSP: all commission against the balance)')] },
      { key: 'bank_holder', label: 'Account holder' }, { key: 'bank_bank', label: 'Bank' }, { key: 'bank_branch', label: 'Branch code' }, { key: 'bank_account', label: 'Account number' }] }); if (!v) return;
    const bank: Record<string, string> = {}; ['holder', 'bank', 'branch', 'account'].forEach(k => { if (v['bank_' + k]) bank[k] = v['bank_' + k]; });
    const payoutAccount = bank['account']?.startsWith('****') ? s.payoutAccount : (Object.keys(bank).length ? bank : undefined);
    this.api.call(saveSettings, { repPartyId: Number(this.id()), body: { creditLimit: num(v.creditLimit), minKeep: num(v.minKeep), recoveryPercent: num(v.recoveryPercent), mode: v.mode, payoutAccount } })
      .subscribe({ next: () => { this.toast.ok('Saved'); this.load(Number(this.id())); }, error: e => this.toast.error(e) });
  }
}

function num(v: unknown): number | undefined { return v === '' || v == null ? undefined : Number(v); }
function prefix(p: string, m?: Record<string, string> | null): Record<string, string> { const o: Record<string, string> = {}; Object.entries(m ?? {}).forEach(([k, v]) => o[p + k] = v); return o; }
