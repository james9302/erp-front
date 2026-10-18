import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { addVersion, close, termsAsAt } from '../../api/functions';
import { TermAsAtRow } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Supplier terms" subtitle="What each supplier account pays us, versioned by date: SIM price, activation commission once per SIM, OGR as a share of every recharge. A change on one account applies from a month; earlier months keep the old version.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>As at</mat-label><input matInput type="date" [(ngModel)]="asAt" (change)="state.refresh()"></mat-form-field>
  </app-page>
  <p class="muted">Click an account to add a new version of its terms.</p>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="newVersion($event)" empty="No accounts." />`,
})
export class TermsPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs); private companies = inject(CompanyService);
  asAt = new Date().toISOString().slice(0, 10);
  rows = signal<TermAsAtRow[]>([]); state = new ListState(() => this.load());
  cols: Col[] = [{ key: 'companyCode', label: 'Company' }, { key: 'supplierName', label: 'Supplier' }, { key: 'account', label: 'Account' }, { key: 'product', label: 'Product' }, { key: 'networkCode', label: 'Network' },
    { key: 'term.validFrom', label: 'From', type: 'date' }, { key: 'term.simPriceIncl', label: 'SIM incl', type: 'rand' }, { key: 'term.activationCommission', label: 'Activation', type: 'rand' },
    { key: 'term.ogrPct', label: 'OGR', type: 'pct' }, { key: 'term.ogrMonths', label: 'OGR months' }, { key: 'nextChangeFrom', label: 'Next change', type: 'date' }];

  constructor() { this.load(); }
  load(): void { this.api.call(termsAsAt, { asAt: this.asAt, companyId: this.companies.param(), ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r))); }
  async newVersion(r: TermAsAtRow): Promise<void> {
    if (!this.auth.has('term.edit')) return;
    const t = r.term;
    const v = await this.dialogs.form({ title: `New term version · ${r.supplierName} ${r.account}${r.product ? ' / ' + r.product : ''}`, subtitle: 'The current version is closed the day before the new valid-from.', submit: 'Add version',
      initial: { simPriceIncl: t?.simPriceIncl, activationCommission: t?.activationCommission, ogrPct: t?.ogrPct ?? 6, ogrMonths: t?.ogrMonths, clawbackDays: t?.clawbackDays, closeCurrent: !!t?.id },
      fields: [{ key: 'validFrom', label: 'Valid from', type: 'date', required: true }, { key: 'simPriceIncl', label: 'SIM price incl VAT', type: 'number', step: 0.01 },
        { key: 'activationCommission', label: 'Activation commission', type: 'number', step: 0.01, required: true }, { key: 'ogrPct', label: 'OGR %', type: 'number', step: 0.001, required: true },
        { key: 'ogrMonths', label: 'OGR months (blank = no limit)', type: 'number' }, { key: 'clawbackDays', label: 'Clawback days', type: 'number' }, { key: 'notes', label: 'Notes', wide: true },
        ...(t?.id ? [{ key: 'closeCurrent', label: 'Close the current version first', type: 'checkbox' as const }] : [])] });
    if (!v) return;
    const add = () => this.api.call(addVersion, { body: { supplierAccountId: r.accountId!, supplierProductId: r.productId ?? undefined, validFrom: v.validFrom, simPriceIncl: v.simPriceIncl, activationCommission: v.activationCommission, ogrPct: v.ogrPct, ogrMonths: v.ogrMonths || undefined, clawbackDays: v.clawbackDays || undefined, notes: v.notes } })
      .subscribe({ next: () => { this.toast.ok('Term version added'); this.load(); }, error: e => this.toast.error(e) });
    if (v.closeCurrent && t?.id) {
      const d = new Date(v.validFrom); d.setDate(d.getDate() - 1);
      this.api.call(close, { id: t.id, body: { validTo: d.toISOString().slice(0, 10) } }).subscribe({ next: add, error: e => this.toast.error(e) });
    } else add();
  }
}
