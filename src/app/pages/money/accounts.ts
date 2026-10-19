import { Component, inject, signal } from '@angular/core';
import { concat, lastValueFrom } from 'rxjs';
import { KeyValuePipe } from '@angular/common';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs } from '../../shared/dialogs';
import { ListState } from '../../core/list-state';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { accounts1, defaults, setDefault } from '../../api/functions';
import { RepAccountView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, KeyValuePipe, PageHeader],
  template: `
  <app-page title="Rep accounts" subtitle="Balance per rep and agent: + owed to them, − owed by them. Over the credit limit, new stock, items and loans are blocked without an override.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Kind</mat-label><mat-select [ngModel]="kind" (ngModelChange)="kind = $event; state.refresh()"><mat-option [value]="''">All</mat-option><mat-option value="REP">REP</mat-option><mat-option value="FIELD_AGENT">FIELD_AGENT</mat-option><mat-option value="SHOP_AGENT">SHOP_AGENT</mat-option></mat-select></mat-form-field>
    <mat-checkbox [(ngModel)]="overOnly" (change)="state.refresh()">Over limit only</mat-checkbox>
    @if (auth.has('ledger.settings')) { <button mat-stroked-button (click)="editDefaults()"><mat-icon>tune</mat-icon> Defaults</button> }
  </app-page>
  <div class="toolbar">@for (d of (defs() | keyvalue); track d.key) { <span class="tag">{{ d.key }} {{ d.value }}</span> }</div>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="router.navigate(['/accounts', $event.repPartyId])" empty="No accounts with activity yet." />`,
})
export class AccountsPage {
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  kind = ''; overOnly = false; rows = signal<RepAccountView[]>([]); state = new ListState(() => this.load()); defs = signal<Record<string, number>>({});
  cols: Col[] = [{ key: 'repName', label: 'Rep / agent' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'balance', label: 'Balance', type: 'signed' }, { key: 'owing', label: 'Owing', type: 'rand' }, { key: 'creditLimit', label: 'Limit', type: 'rand' }, { key: 'available', label: 'Available', type: 'rand' }, { key: 'loanBalance', label: 'Loan', type: 'rand' }, { key: 'earnedThisPeriod', label: 'Earned this month', type: 'rand' }, { key: 'flags', label: 'Flags', type: 'tags' }];
  constructor() { this.load(); this.api.call(defaults).subscribe(d => this.defs.set(d as any)); }
  load(): void { this.api.call(accounts1, { kind: this.kind || undefined, overLimit: this.overOnly ? true : undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }
  async editDefaults(): Promise<void> {
    const d = this.defs();
    const v = await this.dialogs.form({ title: 'Account defaults', subtitle: 'Used for every rep without their own settings.', submit: 'Save', width: '480px', initial: d, fields: [
      { key: 'CREDIT_LIMIT', label: 'Credit limit (R)', type: 'number' }, { key: 'MIN_KEEP', label: 'Minimum the rep keeps (R)', type: 'number' },
      { key: 'RECOVERY_PERCENT', label: 'Recovery % of the old balance', type: 'number' }, { key: 'WARN_PERCENT', label: 'Warn at % of the limit', type: 'number' }] }); if (!v) return;
    const calls = Object.keys(v).filter(k => Number(v[k]) !== Number(d[k])).map(k => this.api.call(setDefault, { key: k, body: { value: Number(v[k]) } }));
    if (!calls.length) return;
    try { const last = await lastValueFrom(concat(...calls)); this.defs.set(last as any); this.toast.ok('Defaults saved'); this.load(); } catch (e) { this.toast.error(e); }
  }
}
