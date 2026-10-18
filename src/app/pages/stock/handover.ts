import { Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { TitleCasePipe } from '@angular/common';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast, toProblem } from '../../core/problem';
import { newKey, splitSerials } from '../../core/pipes';
import { agentCap, allocate, bundles, deals, handover, holdings, parties, returnToWarehouse, transfer } from '../../api/functions';
import { AgentCapView, BundleView, DealResponse, HoldingRow, MoveResult, PartyResponse } from '../../api/models';

type Kind = 'allocate' | 'transfer' | 'handover' | 'return';

@Component({
  standalone: true, imports: [UI, TitleCasePipe, PageHeader],
  template: `
  <app-page title="Allocate / hand over" subtitle="Every move is one movement with its serials. Allocate stamps the rep's deal and checks their pick, the deal cap and their credit; transfer checks the agent's monthly cap; hand-over records the channel; return brings stock back for checking." />
  <div class="grid2">
    <div class="panel">
      <mat-tab-group (selectedTabChange)="setKind($event.index)">
        @if (auth.has('stock.allocate')) { <mat-tab label="Allocate (warehouse → rep/agent)"></mat-tab> }
        <mat-tab label="Transfer (rep → agent)"></mat-tab>
        <mat-tab label="Hand over (→ shop / customer)"></mat-tab>
        <mat-tab label="Return (→ warehouse)"></mat-tab>
      </mat-tab-group>
      <div class="row">
        @if (kind !== 'return') {
          <mat-form-field appearance="outline" style="min-width:300px"><mat-label>{{ kind === 'allocate' ? 'Rep or agent' : 'To party' }}</mat-label>
            <input matInput [(ngModel)]="toSearch" (ngModelChange)="search($event, 'to')" placeholder="type a name">
            @if (toParty) { <mat-hint>{{ toParty.kind }} · {{ toParty.name }} (id {{ toParty.id }})</mat-hint> }
          </mat-form-field>
          @if (toHits().length) { <div class="hits">@for (h of toHits(); track h.id) { <div class="hit" (click)="pickTo(h)"><span class="tag">{{ h.kind }}</span> {{ h.name }} <span class="muted">{{ h.externalRef }}</span></div> }</div> }
        } @else {
          <mat-form-field appearance="outline"><mat-label>Warehouse</mat-label><mat-select [(ngModel)]="warehouseId">@for (c of companies.companies(); track c.id) { @for (w of c.warehouses || []; track w.id) { <mat-option [value]="w.id">{{ c.code }} · {{ w.code }}</mat-option> } }</mat-select></mat-form-field>
        }
        @if (kind !== 'allocate' && auth.has('stock.allocate')) {
          <mat-form-field appearance="outline" style="min-width:300px"><mat-label>From party (whose stock moves)</mat-label><input matInput [(ngModel)]="fromSearch" (ngModelChange)="search($event, 'from')">
            @if (fromParty) { <mat-hint>{{ fromParty.kind }} · {{ fromParty.name }} (id {{ fromParty.id }})</mat-hint> }
          </mat-form-field>
          @if (fromHits().length) { <div class="hits">@for (h of fromHits(); track h.id) { <div class="hit" (click)="pickFrom(h)"><span class="tag">{{ h.kind }}</span> {{ h.name }}</div> }</div> }
        }
      </div>
      @if (kind === 'allocate') {
        <div class="row">
          <mat-form-field appearance="outline" style="min-width:300px"><mat-label>Bundles</mat-label><mat-select [(ngModel)]="bundleIds" multiple>@for (b of bundleList(); track b.id) { <mat-option [value]="b.id">{{ b.name }} · {{ b.networks }} · {{ b.left }} left</mat-option> }</mat-select></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Deal (blank = pick or default)</mat-label><mat-select [(ngModel)]="dealId"><mat-option [value]="undefined">—</mat-option>@for (d of dealList(); track d.id) { <mat-option [value]="d.id">{{ d.name }} ({{ d.networkCode }})</mat-option> }</mat-select></mat-form-field>
        </div>
      }
      <mat-form-field appearance="outline" class="full"><mat-label>Loose serials (scan or paste)</mat-label><textarea matInput rows="4" class="serials" [(ngModel)]="serialText"></textarea></mat-form-field>
      <div class="row">
        <mat-form-field appearance="outline" style="min-width:300px"><mat-label>Reason / note</mat-label><input matInput [(ngModel)]="reason"></mat-form-field>
        @if (kind === 'allocate') { <mat-checkbox [(ngModel)]="overridePick">Override pick</mat-checkbox><mat-checkbox [(ngModel)]="overrideCredit">Override credit limit</mat-checkbox> }
        @if (kind === 'transfer') { <mat-checkbox [(ngModel)]="overrideCap">Override agent cap</mat-checkbox> }
      </div>
      <button mat-flat-button [disabled]="!ready()" (click)="go()">{{ kind | titlecase }} {{ count() }} serials{{ bundleIds.length ? ' + ' + bundleIds.length + ' bundles' : '' }}</button>
      @if (problem(); as p) { <div class="problem"><b>{{ p.code }}</b> {{ p.detail }} @if (p['remaining'] != null) { <span class="muted">(remaining {{ p['remaining'] }}, requested {{ p['requested'] }})</span> }</div> }
      @for (r of results(); track r.movementId) { <div class="ok"><b>{{ r.kind }}</b> {{ r.sims }} SIMs {{ r.fromName }} → {{ r.toName }} · now {{ r.newStatus }} @if (r.dealName) { · deal {{ r.dealName }} (cost {{ r.simCostSnapshot | rand }}, rate {{ r.rateSnapshot | rand }}) } @if (r.note) { · {{ r.note }} }</div> }
    </div>
    <div>
      @if (cap(); as c) {
        <div class="panel"><h2>{{ c.name }} · month {{ c.agentMonth }}</h2>
          <div class="value">{{ c.remaining === 2147483647 ? 'no cap' : (c.remaining | qty) }} <span class="muted">may still be given this month</span></div>
          <div class="muted">{{ c.explanation }}</div>
        </div>
      }
      <div class="panel"><h2>Holdings {{ toParty ? 'under ' + toParty.name : '' }}</h2>
        <app-table [cols]="holdCols" [rows]="holds()" empty="Nothing held." />
      </div>
    </div>
  </div>`,
  styles: [`.hits { background: #fff; border: 1px solid #e3e6ea; border-radius: 8px; max-height: 200px; overflow: auto; min-width: 300px; } .hit { padding: 6px 10px; cursor: pointer; } .hit:hover { background: #f3f4f6; }
    .problem { background: #fee2e2; color: #991b1b; padding: 10px 12px; border-radius: 8px; margin-top: 10px; } .ok { background: #d1fae5; color: #065f46; padding: 10px 12px; border-radius: 8px; margin-top: 10px; }`],
})
export class HandoverPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast);
  kinds: Kind[] = inject(AuthService).has('stock.allocate') ? ['allocate', 'transfer', 'handover', 'return'] : ['transfer', 'handover', 'return'];
  kind: Kind = this.kinds[0];
  toSearch = ''; fromSearch = ''; toParty: PartyResponse | null = null; fromParty: PartyResponse | null = null;
  toHits = signal<PartyResponse[]>([]); fromHits = signal<PartyResponse[]>([]);
  bundleList = signal<BundleView[]>([]); dealList = signal<DealResponse[]>([]); holds = signal<HoldingRow[]>([]); cap = signal<AgentCapView | null>(null);
  bundleIds: number[] = []; dealId?: number; warehouseId?: number; serialText = ''; reason = ''; overridePick = false; overrideCredit = false; overrideCap = false;
  results = signal<MoveResult[]>([]); problem = signal<any>(null);
  holdCols: Col[] = [{ key: 'partyName', label: 'Holder' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'networkCode', label: 'Network' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'dealName', label: 'Deal' }, { key: 'qty', label: 'Qty', type: 'qty' }];

  constructor() {
    if (this.auth.has('stock.allocate')) { this.api.call(bundles, { unallocated: true, size: 500 }).subscribe(b => this.bundleList.set(b.items ?? [])); this.api.call(deals, { active: true, size: 500 }).subscribe(d => this.dealList.set(d.items ?? [])); }
    this.loadHolds();
  }
  setKind(i: number): void { this.kind = this.kinds[i]; this.results.set([]); this.problem.set(null); }
  count(): number { return splitSerials(this.serialText).length; }
  private searchSeq = 0;
  search(q: string, which: 'to' | 'from'): void {
    // typing again means the earlier pick no longer stands
    if (which === 'to') { if (this.toParty && q !== this.toParty.name) { this.toParty = null; this.cap.set(null); } } else if (this.fromParty && q !== this.fromParty.name) this.fromParty = null;
    const hits = which === 'to' ? this.toHits : this.fromHits;
    if (q.trim().length < 2) { hits.set([]); return; }
    const seq = ++this.searchSeq;
    this.api.call(parties, { q: q.trim(), active: true, size: 8 }).subscribe(p => { if (seq === this.searchSeq) hits.set(p.items ?? []); });
  }
  ready(): boolean { return this.kind === 'return' ? !!this.warehouseId : !!this.toParty; }
  pickTo(p: PartyResponse): void {
    this.toParty = p; this.toSearch = p.name!; this.toHits.set([]); this.loadHolds();
    if (p.kind === 'FIELD_AGENT' || p.kind === 'SHOP_AGENT') this.api.call(agentCap, { partyId: p.id! }).subscribe({ next: c => this.cap.set(c), error: () => this.cap.set(null) }); else this.cap.set(null);
  }
  pickFrom(p: PartyResponse): void { this.fromParty = p; this.fromSearch = p.name!; this.fromHits.set([]); }
  loadHolds(): void { this.api.call(holdings, { under: this.toParty?.id, size: 500 }).subscribe(h => this.holds.set(h.items ?? [])); }
  go(): void {
    this.problem.set(null); this.results.set([]);
    const serials = splitSerials(this.serialText);
    const common = { serials: serials.length ? serials : undefined, reason: this.reason || undefined, idempotencyKey: newKey(this.kind) };
    const from = this.fromParty?.id;
    let call: Observable<MoveResult | MoveResult[]>;
    switch (this.kind) {
      case 'allocate': call = this.api.call(allocate, { body: { ...common, repPartyId: this.toParty?.id!, bundleIds: this.bundleIds.length ? this.bundleIds : undefined, dealId: this.dealId, overridePick: this.overridePick, overrideCredit: this.overrideCredit } }); break;
      case 'transfer': call = this.api.call(transfer, { body: { ...common, toPartyId: this.toParty?.id!, fromPartyId: from, overrideCap: this.overrideCap } }); break;
      case 'handover': call = this.api.call(handover, { body: { ...common, toPartyId: this.toParty?.id!, fromPartyId: from } }); break;
      default: call = this.api.call(returnToWarehouse, { body: { ...common, warehouseId: this.warehouseId!, fromPartyId: from } });
    }
    call.subscribe({
      next: r => { this.results.set(Array.isArray(r) ? r : [r]); this.serialText = ''; this.bundleIds = []; this.loadHolds(); if (this.auth.has('stock.allocate')) this.api.call(bundles, { unallocated: true, size: 500 }).subscribe(b => this.bundleList.set(b.items ?? [])); },
      error: e => this.problem.set(toProblem(e)),
    });
  }
}
