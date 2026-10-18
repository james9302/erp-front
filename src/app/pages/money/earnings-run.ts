import { Component, effect, inject, input, signal } from '@angular/core';
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
import { approve1, attributions, exceptionSummary, exceptions, lines, parties1, pnl, run2 } from '../../api/functions';
import { AttributionView, ExceptionView, LedgerLineView, PartyEarningsView, PnlView, RunView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, KeyValuePipe, PageHeader],
  template: `
  @if (r(); as run) {
    <app-page [title]="run.companyCode + ' · ' + (run.period | month)" [subtitle]="run.message || ''" [crumbs]="['Earnings runs']">
      <span class="tag info">{{ run.status }}</span>
      @if (auth.has('earnings.approve') && run.status === 'DONE') { <button mat-flat-button (click)="approve()"><mat-icon>lock</mat-icon> Approve (lock lines)</button> }
    </app-page>
    <div class="cards">
      <div class="kpi"><div class="label">Events</div><div class="value">{{ run.eventsTotal | qty }}</div><div class="sub">{{ run.eventsAttributed | qty }} attributed · {{ run.eventsUnrouted | qty }} on unknown SIMs</div></div>
      <div class="kpi"><div class="label">Ledger lines</div><div class="value">{{ run.linesTotal | qty }}</div></div>
      <div class="kpi"><div class="label">Exceptions</div><div class="value">{{ run.exceptionsTotal | qty }}</div><div class="sub">@for (e of (exc() | keyvalue); track e.key) { {{ e.key }} {{ e.value }} · }</div></div>
      <div class="kpi"><div class="label">Activations already paid</div><div class="value">{{ run.activationAlreadyPaid | qty }}</div><div class="sub">listed again by the network, paid in an earlier month</div></div>
    </div>
    @if (p(); as x) {
      <div class="cards">
        <div class="kpi"><div class="label">Supplier revenue</div><div class="value pos">{{ x.supplierRevenue | rand }}</div><div class="sub">{{ x.supplierActivationRev | rand }} activation · {{ x.supplierOgrRev | rand }} OGR</div></div>
        <div class="kpi"><div class="label">Payouts</div><div class="value neg">{{ x.payouts | rand }}</div><div class="sub">@for (l of (x.payoutsByLine | keyvalue); track l.key) { {{ l.key }} {{ l.value | rand }} · }</div></div>
        <div class="kpi"><div class="label">SIM cost</div><div class="value neg">{{ x.simCost | rand }}</div></div>
        <div class="kpi"><div class="label">Gross profit</div><div class="value" [class.pos]="(x.grossProfit||0)>=0" [class.neg]="(x.grossProfit||0)<0">{{ x.grossProfit | rand }}</div><div class="sub">{{ x.grossProfitPerActivation | rand }} per activation · {{ x.activations | qty }} activations</div></div>
      </div>
    }
    <mat-tab-group>
      <mat-tab label="Who earned"><app-table [cols]="partyCols" [rows]="partiesList()" /></mat-tab>
      <mat-tab label="Ledger lines">
        <div class="toolbar"><mat-form-field appearance="outline"><mat-label>Line</mat-label><input matInput [(ngModel)]="lineFilter" (change)="page = 0; loadLines()"></mat-form-field><mat-form-field appearance="outline"><mat-label>Serial</mat-label><input matInput [(ngModel)]="serialFilter" (change)="page = 0; loadLines()"></mat-form-field>
          <span class="grow"></span><span class="muted">{{ linesTotal() }} lines</span><button mat-button [disabled]="page===0" (click)="page = page - 1; loadLines()">‹</button><button mat-button [disabled]="(page+1)*50 >= linesTotal()" (click)="page = page + 1; loadLines()">›</button></div>
        <app-table [cols]="lineCols" [rows]="lineRows()" [paged]="false" (pick)="router.navigate(['/sim', $event.serial])" />
      </mat-tab>
      <mat-tab label="Attributions"><app-table [cols]="attCols" [rows]="atts()" [server]="attState" (pick)="router.navigate(['/sim', $event.serial])" /></mat-tab>
      <mat-tab label="Exceptions"><app-table [cols]="excCols" [rows]="excRows()" [server]="excState" empty="No exceptions." /></mat-tab>
    </mat-tab-group>
  }`,
})
export class EarningsRunPage {
  id = input.required<string>();
  auth = inject(AuthService); router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  r = signal<RunView | null>(null); p = signal<PnlView | null>(null); exc = signal<Record<string, number>>({}); excRows = signal<ExceptionView[]>([]);
  partiesList = signal<PartyEarningsView[]>([]); atts = signal<AttributionView[]>([]); lineRows = signal<LedgerLineView[]>([]); linesTotal = signal(0);
  attState = new ListState(() => this.loadAtts()); excState = new ListState(() => this.loadExc());
  lineFilter = ''; serialFilter = ''; page = 0;
  partyCols: Col[] = [{ key: 'partyName', label: 'Payee' }, { key: 'partyKind', label: 'Kind', type: 'tag' }, { key: 'sims', label: 'SIMs', type: 'qty' }, { key: 'byLine.REP_ACTIVATION', label: 'Activation', type: 'rand' }, { key: 'byLine.REP_REFERRAL', label: 'Referral', type: 'rand' },
    { key: 'byLine.REP_AGENT_SIM', label: 'Per agent SIM', type: 'rand' }, { key: 'byLine.AGENT_QUALIFY', label: 'Qualify', type: 'rand' }, { key: 'byLine.REP_OGR_SHARE', label: 'OGR share', type: 'rand' }, { key: 'total', label: 'Total', type: 'rand' }];
  lineCols: Col[] = [{ key: 'serial', label: 'Serial' }, { key: 'line', label: 'Line', type: 'tag' }, { key: 'partyName', label: 'Party' }, { key: 'qty', label: 'Qty', type: 'qty' }, { key: 'rate', label: 'Rate', type: 'rand' }, { key: 'amount', label: 'Amount', type: 'signed' }, { key: 'amountIncl', label: 'Incl', type: 'rand' }, { key: 'reason', label: 'Note' }];
  attCols: Col[] = [{ key: 'serial', label: 'Serial' }, { key: 'eventKind', label: 'Event', type: 'tag' }, { key: 'eventDate', label: 'Date', type: 'date' }, { key: 'ownerName', label: 'Owner' }, { key: 'ownerKind', label: 'Kind' }, { key: 'referralName', label: 'Rep above' }, { key: 'channel', label: 'Channel', type: 'tag' }, { key: 'scheme', label: 'Scheme' }, { key: 'rate', label: 'Rate', type: 'rand' }, { key: 'amount', label: 'Amount', type: 'rand' }];
  excCols: Col[] = [{ key: 'code', label: 'Code', type: 'tag' }, { key: 'serial', label: 'Serial' }, { key: 'eventKind', label: 'Event' }, { key: 'detail', label: 'Detail' }];
  constructor() { effect(() => { const id = Number(this.id()); if (id) this.load(id); }); }
  load(id: number): void {
    this.api.call(run2, { id }).subscribe(run => {
      this.r.set(run);
      const period = (run.period ?? '').slice(0, 7);
      this.api.call(pnl, { companyId: run.companyId!, period }).subscribe(x => this.p.set(x));
      this.api.call(parties1, { companyId: run.companyId, period, size: 500, sort: 'total,desc' }).subscribe(l => this.partiesList.set(l.items ?? []));
      this.loadLines();
    });
    this.api.call(exceptionSummary, { id }).subscribe(e => this.exc.set(e as any));
    this.loadExc(); this.loadAtts();
  }
  loadExc(): void { this.api.call(exceptions, { id: Number(this.id()), ...this.excState.params() }).subscribe(p => this.excState.apply(p, e => this.excRows.set(e))); }
  loadAtts(): void { this.api.call(attributions, { id: Number(this.id()), ...this.attState.params() }).subscribe(p => this.attState.apply(p, a => this.atts.set(a))); }
  loadLines(): void {
    const run = this.r()!;
    this.api.call(lines, { runId: run.id, line: this.lineFilter || undefined, serial: this.serialFilter || undefined, page: this.page, size: 50 }).subscribe(p => { this.lineRows.set(p.items ?? []); this.linesTotal.set(p.total ?? 0); });
  }
  async approve(): Promise<void> {
    if (!(await this.dialogs.confirm('Approve this earnings run?', 'Its ledger lines are locked and the month can no longer be re-run.', 'Approve'))) return;
    this.api.call(approve1, { id: this.r()!.id! }).subscribe({ next: r => { this.r.set(r); this.toast.ok('Approved'); }, error: e => this.toast.error(e) }); }
}
