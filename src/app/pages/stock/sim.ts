import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { events, sim, simMovements, sim1 } from '../../api/functions';
import { EventView, MovementView, SimMarginView, SimView } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="SIM lookup" subtitle="One ICCID, its whole life: receipt, every hand-over, what the network reported, and who earned what on it.">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:300px"><mat-label>ICCID</mat-label><input matInput [(ngModel)]="q" (keyup.enter)="router.navigate(['/sim', q.trim()])"></mat-form-field><button mat-flat-button (click)="router.navigate(['/sim', q.trim()])"><mat-icon>search</mat-icon> Look up</button>
  </app-page>
  @if (view(); as s) {
    <div class="cards">
      <div class="kpi"><div class="label">Status</div><div class="value"><span class="tag info">{{ s.status }}</span></div><div class="sub">{{ s.companyCode }} · {{ s.networkCode }} · {{ s.productCode }}</div></div>
      <div class="kpi"><div class="label">Holder / owner</div><div class="value" style="font-size:18px">{{ s.holderName || '—' }}</div><div class="sub">owner {{ s.ownerName || '—' }} · path {{ s.path }}</div></div>
      <div class="kpi"><div class="label">Cost / deal</div><div class="value" style="font-size:18px">{{ s.unitCostExcl | rand }} excl</div><div class="sub">deal cost {{ s.simCostSnapshot | rand }} · rate {{ s.rateSnapshot | rand }}</div></div>
      <div class="kpi"><div class="label">Received</div><div class="value" style="font-size:18px">{{ s.receivedAt | when }}</div><div class="sub">account {{ s.account }} · first out {{ s.firstOutAt | when }} · bundle {{ s.bundleName || '—' }}</div></div>
      @if (margin(); as m) { <div class="kpi"><div class="label">Margin to date</div><div class="value" [class.pos]="(m.margin||0) > 0" [class.neg]="(m.margin||0) < 0">{{ m.margin | rand }}</div><div class="sub">{{ m.lines?.length || 0 }} ledger lines</div></div> }
    </div>
    <h2>Movements</h2>
    <app-table [cols]="moveCols" [rows]="moves()" />
    <h2>Network events</h2>
    <app-table [cols]="eventCols" [rows]="evs()" empty="Nothing reported by the network for this serial." />
    @if (margin()?.lines?.length) { <h2>Money</h2><app-table [cols]="lineCols" [rows]="margin()!.lines!" /> }
  }`,
})
export class SimPage {
  serial = input<string>();
  router = inject(Router); auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast);
  q = ''; view = signal<SimView | null>(null); moves = signal<MovementView[]>([]); evs = signal<EventView[]>([]); margin = signal<SimMarginView | null>(null);
  moveCols: Col[] = [{ key: 'movedAt', label: 'When', type: 'datetime' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'fromName', label: 'From' }, { key: 'toName', label: 'To' }, { key: 'dealId', label: 'Deal' }, { key: 'movedByName', label: 'By' }, { key: 'reason', label: 'Note' }];
  eventCols: Col[] = [{ key: 'eventDate', label: 'Date', type: 'date' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'source', label: 'Source' }, { key: 'period', label: 'Period', type: 'month' }, { key: 'amount', label: 'Amount', type: 'rand' }, { key: 'commissionExcl', label: 'Commission excl', type: 'rand' }, { key: 'dealerCode', label: 'Dealer' }, { key: 'agentCode', label: 'Agent' }, { key: 'msisdn', label: 'MSISDN' }];
  lineCols: Col[] = [{ key: 'period', label: 'Period', type: 'month' }, { key: 'line', label: 'Line', type: 'tag' }, { key: 'partyName', label: 'Party' }, { key: 'amount', label: 'Amount', type: 'signed' }, { key: 'reason', label: 'Note' }];
  constructor() { effect(() => { const s = this.serial(); if (s) { this.q = s; this.load(s); } }); }
  load(serial: string): void {
    this.view.set(null); this.margin.set(null);
    this.api.call(sim, { serial }).subscribe({ next: v => this.view.set(v), error: e => this.toast.error(e) });
    this.api.call(simMovements, { serial }).subscribe(m => this.moves.set(m));
    if (this.auth.has('files.view')) this.api.call(events, { serial }).subscribe(e => this.evs.set(e));
    if (this.auth.has('earnings.view')) this.api.call(sim1, { serial }).subscribe({ next: m => this.margin.set(m), error: () => {} });
  }
}
