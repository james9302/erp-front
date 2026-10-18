import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { yyyyMm } from '../../core/pipes';
import { addCampaignVersion, addCapRule, campaignTerms, capRules, closeDeal, createDeal, createReferral, createReferralDeal, deals, networks, parties, pickSummary, referralDeals, referrals, setActive } from '../../api/functions';
import { CampaignTermResponse, DealResponse, NetworkResponse, PickSummaryRow, ReferralDealResponse, ReferralResponse, StockCapRuleResponse } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Deals & commission rules" subtitle="What reps and agents earn: stock deals (SIM cost + rate per activation), referral deals, the agent campaign and the monthly stock caps." />
  <mat-tab-group>
    <mat-tab label="Stock deals">
      <div class="toolbar"><span class="muted">Click a deal to close it or toggle it.</span><span class="grow"></span>@if (auth.has('deal.edit')) { <button mat-flat-button (click)="newDeal()"><mat-icon>add</mat-icon> New deal</button> }</div>
      <app-table [cols]="dealCols" [rows]="dealList()" [server]="dealState" (pick)="dealMenu($event)" />
      <div class="toolbar" style="margin-top:18px"><h2 style="margin:0">Picks</h2><mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px"><mat-label>Month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM" (change)="loadPicks()"></mat-form-field></div>
      <app-table [cols]="pickCols" [rows]="picks()" [filterable]="false" [clickable]="false" empty="No picks this month." />
    </mat-tab>
    <mat-tab label="Referral deals">
      <div class="toolbar"><span class="grow"></span>@if (auth.has('referral.edit')) { <button mat-stroked-button (click)="newReferralDeal()"><mat-icon>add</mat-icon> Referral deal</button><button mat-flat-button (click)="newReferral()"><mat-icon>person_add</mat-icon> Record a referral</button> }</div>
      <app-table [cols]="refDealCols" [rows]="refDeals()" [filterable]="false" [clickable]="false" />
      <h2>Active referrals</h2>
      <app-table [cols]="refCols" [rows]="refs()" [clickable]="false" />
    </mat-tab>
    <mat-tab label="Agent campaign">
      <div class="toolbar"><span class="muted">Agents earn the qualifying amount once a SIM recharges the threshold within the window; the rep above earns the per-agent-SIM amount per activation.</span><span class="grow"></span>@if (auth.has('campaign.edit')) { <button mat-flat-button (click)="newCampaign()"><mat-icon>add</mat-icon> New version</button> }</div>
      <app-table [cols]="campCols" [rows]="camps()" [filterable]="false" [clickable]="false" />
    </mat-tab>
    <mat-tab label="Stock caps">
      <div class="toolbar"><span class="muted">cap = max(minimum, basis × multiplier rounded up to round_to), by the agent's n-th month since joining.</span><span class="grow"></span>@if (auth.has('campaign.edit')) { <button mat-flat-button (click)="newCap()"><mat-icon>add</mat-icon> New rule</button> }</div>
      <app-table [cols]="capCols" [rows]="caps()" [filterable]="false" [clickable]="false" />
    </mat-tab>
  </mat-tab-group>`,
})
export class DealsPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  dealList = signal<DealResponse[]>([]); dealState = new ListState(() => this.loadDeals()); nets = signal<NetworkResponse[]>([]); picks = signal<PickSummaryRow[]>([]);
  refDeals = signal<ReferralDealResponse[]>([]); refs = signal<ReferralResponse[]>([]); camps = signal<CampaignTermResponse[]>([]); caps = signal<StockCapRuleResponse[]>([]);
  month = yyyyMm();
  dealCols: Col[] = [{ key: 'name', label: 'Deal' }, { key: 'networkCode', label: 'Network' }, { key: 'simCost', label: 'SIM cost', type: 'rand' }, { key: 'activationRate', label: 'Rate', type: 'rand' }, { key: 'ogrSharePct', label: 'OGR share', type: 'pct' },
    { key: 'monthlyCap', label: 'Cap', type: 'qty' }, { key: 'chosenBy', label: 'Chosen by' }, { key: 'defaultDeal', label: 'Default', type: 'bool' }, { key: 'validFrom', label: 'From', type: 'date' }, { key: 'validTo', label: 'To', type: 'date' }, { key: 'status', label: 'Status', type: 'tag' }];
  pickCols: Col[] = [{ key: 'dealName', label: 'Deal' }, { key: 'networkCode', label: 'Network' }, { key: 'reps', label: 'Reps', type: 'qty' }, { key: 'qtyRequested', label: 'Requested', type: 'qty' }, { key: 'qtyAllocated', label: 'Allocated', type: 'qty' }, { key: 'monthlyCap', label: 'Cap', type: 'qty' }];
  refDealCols: Col[] = [{ key: 'name', label: 'Deal' }, { key: 'referredKind', label: 'Referred kind' }, { key: 'months', label: 'Months' }, { key: 'signupBonus', label: 'Sign-up bonus', type: 'rand' }, { key: 'defaultDeal', label: 'Default', type: 'bool' }, { key: 'validFrom', label: 'From', type: 'date' }, { key: 'referrals', label: 'Referrals', type: 'qty' }];
  refCols: Col[] = [{ key: 'referrerName', label: 'Referrer' }, { key: 'referredName', label: 'Referred' }, { key: 'dealName', label: 'Deal' }, { key: 'startDate', label: 'From', type: 'date' }, { key: 'endDate', label: 'To', type: 'date' }];
  campCols: Col[] = [{ key: 'payeeKind', label: 'Agent kind' }, { key: 'validFrom', label: 'From', type: 'date' }, { key: 'qualifyingAmount', label: 'Qualify', type: 'rand' }, { key: 'usageThreshold', label: 'Usage ≥', type: 'rand' }, { key: 'windowDays', label: 'Days' },
    { key: 'retention2Amount', label: 'Month 2', type: 'rand' }, { key: 'retention3Amount', label: 'Month 3', type: 'rand' }, { key: 'repPerAgentSim', label: 'Rep per agent SIM', type: 'rand' }, { key: 'status', label: 'Status', type: 'tag' }];
  capCols: Col[] = [{ key: 'payeeKind', label: 'Agent kind' }, { key: 'fromMonth', label: 'From month' }, { key: 'toMonth', label: 'To month' }, { key: 'basis', label: 'Basis' }, { key: 'multiplier', label: '×' }, { key: 'roundTo', label: 'Round to' }, { key: 'minimum', label: 'Minimum' }, { key: 'validFrom', label: 'Valid from', type: 'date' }];

  constructor() {
    this.loadDeals(); this.loadPicks(); this.loadRest();
    this.api.call(networks).subscribe(n => this.nets.set(n));
  }
  loadDeals(): void { this.api.call(deals, this.dealState.params()).subscribe(p => this.dealState.apply(p, d => this.dealList.set(d))); }
  loadPicks(): void { this.api.call(pickSummary, { month: this.month, size: 500 }).subscribe(p => this.picks.set(p.items ?? [])); }
  loadRest(): void {
    this.api.call(referralDeals, { size: 500 }).subscribe(r => this.refDeals.set(r.items ?? [])); this.api.call(referrals, { size: 500 }).subscribe(r => this.refs.set(r.items ?? []));
    this.api.call(campaignTerms, { size: 500 }).subscribe(c => this.camps.set(c.items ?? [])); this.api.call(capRules, { size: 500 }).subscribe(c => this.caps.set(c.items ?? []));
  }
  async newDeal(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New stock deal', submit: 'Create', initial: { chosenBy: 'REP' }, fields: [
      { key: 'name', label: 'Name', required: true }, { key: 'networkCode', label: 'Network', type: 'select', required: true, options: this.nets().map(n => opt(n.code, n.name!)) },
      { key: 'simCost', label: 'SIM cost to the rep', type: 'number', step: 0.01, required: true }, { key: 'activationRate', label: 'Rate per activation', type: 'number', step: 0.01, required: true },
      { key: 'ogrSharePct', label: 'OGR share % (optional)', type: 'number', step: 0.001 }, { key: 'monthlyCap', label: 'Monthly cap (SIMs)', type: 'number' },
      { key: 'chosenBy', label: 'Chosen by', type: 'select', required: true, options: [opt('REP', 'REP'), opt('ADMIN', 'ADMIN')] }, { key: 'validFrom', label: 'Valid from', type: 'date', required: true },
      { key: 'defaultDeal', label: 'Default deal for the network', type: 'checkbox' }, { key: 'description', label: 'Description', wide: true }] }); if (!v) return;
    this.api.call(createDeal, { body: v }).subscribe({ next: () => { this.toast.ok('Deal created'); this.loadDeals(); }, error: e => this.toast.error(e) });
  }
  async dealMenu(d: DealResponse): Promise<void> {
    if (!this.auth.has('deal.edit')) return;
    const v = await this.dialogs.form({ title: d.name!, submit: 'Apply', width: '480px', initial: { active: d.active }, fields: [
      { key: 'active', label: 'Active (reps can pick it)', type: 'checkbox', wide: true }, { key: 'validTo', label: 'Close on (last valid day, optional)', type: 'date', wide: true }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    if (v.active !== d.active) this.api.call(setActive, { id: d.id!, value: v.active }).subscribe({ next: () => this.loadDeals(), error: e => this.toast.error(e) });
    if (v.validTo) this.api.call(closeDeal, { id: d.id!, body: { validTo: v.validTo, reason: v.reason } }).subscribe({ next: () => { this.toast.ok('Deal closed'); this.loadDeals(); }, error: e => this.toast.error(e) });
  }
  async newReferralDeal(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New referral deal', submit: 'Create', initial: { referredKind: 'REP', active: true }, fields: [
      { key: 'name', label: 'Name', required: true }, { key: 'referredKind', label: 'Referred kind', type: 'select', required: true, options: [opt('REP', 'REP'), opt('FIELD_AGENT', 'FIELD_AGENT'), opt('SHOP_AGENT', 'SHOP_AGENT')] },
      { key: 'rate', label: 'Rate per activation (R)', type: 'number', step: 0.01, required: true }, { key: 'months', label: 'Months (blank = no limit)', type: 'number' },
      { key: 'signupBonus', label: 'Sign-up bonus', type: 'number', step: 0.01 }, { key: 'bonusAfterActivations', label: 'Bonus after N activations', type: 'number' },
      { key: 'validFrom', label: 'Valid from', type: 'date', required: true }, { key: 'defaultDeal', label: 'Default', type: 'checkbox' }] }); if (!v) return;
    this.api.call(createReferralDeal, { body: { ...v, rates: { '*': v.rate } } }).subscribe({ next: () => { this.toast.ok('Referral deal created'); this.loadRest(); }, error: e => this.toast.error(e) });
  }
  async newReferral(): Promise<void> {
    const reps = (await this.partiesOf('REP')).map(p => opt(p.id, `${p.name} (${p.externalRef ?? p.id})`));
    const v = await this.dialogs.form({ title: 'Record a referral', submit: 'Create', fields: [
      { key: 'referrerPartyId', label: 'Referrer (who gets the share)', type: 'select', required: true, options: reps }, { key: 'referredPartyId', label: 'Referred rep', type: 'select', required: true, options: reps },
      { key: 'referralDealId', label: 'Referral deal (blank = default)', type: 'select', options: this.refDeals().map(d => opt(d.id, d.name!)) }, { key: 'startDate', label: 'From', type: 'date', required: true }] }); if (!v) return;
    this.api.call(createReferral, { body: v }).subscribe({ next: () => { this.toast.ok('Referral recorded'); this.loadRest(); }, error: e => this.toast.error(e) });
  }
  async newCampaign(): Promise<void> {
    const last = this.camps()[0];
    const v = await this.dialogs.form({ title: 'New campaign version', submit: 'Add', initial: { payeeKind: 'FIELD_AGENT', qualifyingAmount: last?.qualifyingAmount ?? 12, usageThreshold: last?.usageThreshold ?? 25, windowDays: last?.windowDays ?? 60, retention2Amount: last?.retention2Amount ?? 5, retention3Amount: last?.retention3Amount ?? 10, usageMin: last?.usageMin ?? 50, gate3MinRatePct: last?.gate3MinRatePct ?? 50, monthsLimit: last?.monthsLimit ?? 6, repPerAgentSim: last?.repPerAgentSim ?? 5 }, fields: [
      { key: 'payeeKind', label: 'Agent kind', type: 'select', required: true, options: [opt('FIELD_AGENT', 'FIELD_AGENT'), opt('SHOP_AGENT', 'SHOP_AGENT')] }, { key: 'validFrom', label: 'Valid from', type: 'date', required: true },
      { key: 'qualifyingAmount', label: 'Qualifying amount', type: 'number', step: 0.01, required: true }, { key: 'usageThreshold', label: 'Usage threshold', type: 'number', step: 0.01, required: true }, { key: 'windowDays', label: 'Window days', type: 'number', required: true },
      { key: 'retention2Amount', label: 'Month 2 amount', type: 'number', step: 0.01, required: true }, { key: 'retention3Amount', label: 'Month 3 amount', type: 'number', step: 0.01, required: true }, { key: 'usageMin', label: 'Monthly usage minimum', type: 'number', step: 0.01, required: true },
      { key: 'gate3MinRatePct', label: 'Gate 3 min activation rate %', type: 'number', required: true }, { key: 'monthsLimit', label: 'Months limit', type: 'number', required: true }, { key: 'repPerAgentSim', label: 'Rep per agent SIM', type: 'number', step: 0.01, required: true }] }); if (!v) return;
    this.api.call(addCampaignVersion, { body: v }).subscribe({ next: () => { this.toast.ok('Campaign version added'); this.loadRest(); }, error: e => this.toast.error(e) });
  }
  async newCap(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New stock cap rule', submit: 'Add', initial: { fromMonth: 1, basis: 'ACTIVATIONS', multiplier: 5, roundTo: 10, minimum: 20 }, fields: [
      { key: 'payeeKind', label: 'Agent kind', type: 'select', required: true, options: [opt('FIELD_AGENT', 'FIELD_AGENT'), opt('SHOP_AGENT', 'SHOP_AGENT')] }, { key: 'validFrom', label: 'Valid from', type: 'date', required: true },
      { key: 'fromMonth', label: 'From month since joining', type: 'number', required: true }, { key: 'toMonth', label: 'To month (blank = onwards)', type: 'number' },
      { key: 'basis', label: 'Basis', type: 'select', required: true, options: [opt('ACTIVATIONS', 'Activations in the latest report'), opt('FCR', 'First recharges last month'), opt('NONE', 'No cap')] },
      { key: 'multiplier', label: 'Multiplier', type: 'number' }, { key: 'roundTo', label: 'Round up to', type: 'number' }, { key: 'minimum', label: 'Minimum', type: 'number' }] }); if (!v) return;
    this.api.call(addCapRule, { body: v }).subscribe({ next: () => { this.toast.ok('Rule added'); this.loadRest(); }, error: e => this.toast.error(e) });
  }
  private partiesOf(kind: string) { return new Promise<any[]>(res => this.api.call(parties, { kind, active: true, size: 500 }).subscribe(p => res(p.items ?? []))); }
}
