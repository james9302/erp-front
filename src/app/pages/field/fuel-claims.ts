import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Photos } from '../../core/photos';
import { Toast } from '../../core/problem';
import { approveFuelClaim, approveFuelClaimsBulk, fleetPolicies, fuelClaim, fuelClaims, parties, rejectFuelClaim, vehicleDay } from '../../api/functions';
import { FuelClaimView, VehicleDayView } from '../../api/models';

const STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'];
const FLAGS: Record<string, string> = {
  NO_PHOTO: 'No odometer photo with the fill', READING_BACKWARDS: 'Odometer reading below the vehicle\'s last reading', KM_TOO_HIGH: 'More business km than the daily limit',
  PLAN_MISMATCH: 'Km far above the route plan distance', TRACK_MISMATCH: 'Km off the tracker km', MULTI_FILL: 'Second fill the same day', OVER_TANK: 'More litres than the tank holds',
  FUEL_RATE: 'Consumption since the last fill outside the band', OFF_HOURS: 'Filled outside working hours', FAR_FROM_ROUTE: 'Fill far from any stop of the day',
  DUPLICATE_RECEIPT: 'Same receipt image, or same amount within 10 minutes', AMOUNT_MISMATCH: 'Amount is not litres × price',
};

/** The approval queue (docs/VEHICLES.md 3.2): photos, the day's readings, flags and the pin; approve or reject with a reason, singly or in bulk. */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Fuel claims" [subtitle]="'Fuel reps paid from their own pocket. The rules flag what broke them; review the flagged ones. Approval posts a credit onto the next statement; a claim above R' + limit() + ' needs a second approver.'">
    @if (auth.has('fuel.approve') && status === 'SUBMITTED') {
      <button mat-stroked-button (click)="bulk(true)" [disabled]="!approvable(true).length"><mat-icon>done_all</mat-icon> Approve unflagged on this page ({{ approvable(true).length }})</button>
      <button mat-flat-button (click)="bulk(false)" [disabled]="!approvable(false).length"><mat-icon>done_all</mat-icon> Approve all on this page ({{ approvable(false).length }})</button>
    }
  </app-page>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [(ngModel)]="status" (valueChange)="state.refresh()"><mat-option [value]="''">Any</mat-option>@for (s of statuses; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:240px"><mat-label>Rep / agent</mat-label><mat-select [(ngModel)]="rep" (valueChange)="state.refresh()"><mat-option [value]="null">Any</mat-option>@for (r of reps(); track r.id) { <mat-option [value]="r.id">{{ r.name }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px"><mat-label>Month</mat-label><input matInput [(ngModel)]="month" placeholder="yyyy-MM" (keyup.enter)="state.refresh()" (change)="state.refresh()"></mat-form-field>
    <mat-checkbox [(ngModel)]="flagged" (change)="state.refresh()">Flagged only</mat-checkbox>
  </div>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)" empty="No fuel claims match." />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel() ? 'Claim ' + sel()!.id + ' · ' + sel()!.repName : ''" [subtitle]="sel() ? sel()!.regNo + ' · ' + (sel()!.filledAt | when:true) + (sel()!.station ? ' · ' + sel()!.station : '') : ''" width="min(820px, 96vw)">
    @if (sel(); as c) {
      <div>
        <div class="row" style="align-items:center">
          <span class="tag" [class.ok]="c.status==='APPROVED'||c.status==='PAID'" [class.bad]="c.status==='REJECTED'" [class.warn]="c.status==='SUBMITTED'">{{ c.status }}</span>
          <span class="tag info">{{ c.paidBy }}</span>
          @if (c.needsSecondApproval) { <span class="tag warn" matTooltip="Above the policy limit: two different approvers">2nd approver</span> }
          @for (f of c.flags || []; track f) { <span class="tag bad" [matTooltip]="flagText(f)">{{ f }}</span> }
          <span class="grow"></span>
          @if (auth.has('fuel.approve') && c.status === 'SUBMITTED') {
            <button mat-stroked-button color="warn" (click)="reject(c)"><mat-icon>block</mat-icon> Reject</button>
            <button mat-flat-button (click)="approve(c)" [disabled]="c.firstApprovedBy === auth.user()?.id || c.repPartyId === auth.user()?.partyId"><mat-icon>check</mat-icon> {{ c.needsSecondApproval ? (c.firstApprovedBy ? 'Second approval' : 'First approval') : 'Approve' }}</button>
          }
        </div>
        @if (c.firstApprovedBy && c.status === 'SUBMITTED') { <p class="muted">First approved {{ c.firstApprovedAt | when:true }} by user {{ c.firstApprovedBy }}; waiting for a different approver.</p> }
        @if (c.rejectReason) { <p class="muted">Rejected {{ c.reviewedAt | when:true }}: {{ c.rejectReason }}</p> }
        @if (c.statementMonth) { <p class="muted">Credit of {{ c.amount | rand }} on the {{ c.statementMonth | month }} statement (ledger entry {{ c.ledgerEntryId }}){{ c.status === 'PAID' ? ' · paid' : '' }}.</p> }
        <div class="cards" style="margin:10px 0">
          <div class="kpi"><div class="label">Amount</div><div class="value">{{ c.amount | rand }}</div><div class="sub">{{ c.litres }} l × {{ c.pricePerLitre | rand }}</div></div>
          <div class="kpi"><div class="label">Reading at the pump</div><div class="value">{{ c.odometerReading | qty }}</div><div class="sub">{{ day()?.startReading ? 'day start ' + (day()!.startReading | qty) : 'day not started' }}{{ day()?.endReading ? ' · end ' + (day()!.endReading | qty) : '' }}</div></div>
          <div class="kpi"><div class="label">Day</div><div class="value">{{ day()?.kmBusiness != null ? (day()!.kmBusiness | qty) + ' km' : '—' }}</div><div class="sub">{{ day()?.purpose || (day() ? day()!.status : 'no logbook row for the day') }} {{ (day()?.flags?.length) ? '· ' + day()!.flags!.join(' ') : '' }}</div></div>
        </div>
        @if (c.note) { <p>{{ c.note }}</p> }
        <div class="photos">
          <div><h2>Receipt</h2>@if (photos.url(c.receiptPhotoId); as u) { <img [src]="u" alt="receipt"> } @else if (c.receiptPhotoId) { <div class="ph muted">loading…</div> } @else { <div class="ph muted">no receipt photo</div> }</div>
          <div><h2>Odometer</h2>@if (photos.url(c.odometerPhotoId); as u) { <img [src]="u" alt="odometer"> } @else if (c.odometerPhotoId) { <div class="ph muted">loading…</div> } @else { <div class="ph muted">no odometer photo</div> }</div>
        </div>
        <h2>Where</h2>
        @if (c.lat && c.lng) { <div #map class="map"></div> } @else { <div class="muted">No GPS with this fill.</div> }
      </div>
    }
  </app-drawer>`,
  styles: [`
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .photos img { width: 100%; max-height: 420px; object-fit: contain; background: #0f172a; border-radius: 8px; }
    .ph { height: 160px; display: grid; place-items: center; background: #f1f5f9; border-radius: 8px; }
    .map { height: 260px; border-radius: 8px; border: 1px solid var(--line); }
    .grow { flex: 1; }
  `],
})
export class FuelClaimsPage implements OnDestroy {
  auth = inject(AuthService); photos = inject(Photos);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  private mapEl = viewChild<ElementRef<HTMLDivElement>>('map');
  statuses = STATUSES; status = 'SUBMITTED'; rep: number | null = null; month = ''; flagged = false; limit = signal('1,500');
  rows = signal<FuelClaimView[]>([]); state = new ListState(() => this.load()); sel = signal<FuelClaimView | null>(null); day = signal<VehicleDayView | null>(null); reps = signal<any[]>([]);
  private map?: L.Map;
  cols: Col[] = [{ key: 'id', label: '#' }, { key: 'filledAt', label: 'Filled', type: 'datetime' }, { key: 'repName', label: 'Rep / agent' }, { key: 'regNo', label: 'Vehicle' }, { key: 'litres', label: 'Litres' }, { key: 'amount', label: 'Amount', type: 'rand' },
    { key: 'station', label: 'Station' }, { key: 'flags', label: 'Flags', type: 'tags' }, { key: 'needsSecondApproval', label: '2nd', type: 'bool' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'statementMonth', label: 'Statement', type: 'month' }];

  constructor() {
    this.load();
    this.api.call(parties, { kind: 'REP', size: 500, active: true }).subscribe(p => this.api.call(parties, { kind: 'FIELD_AGENT', size: 500, active: true }).subscribe(a => this.reps.set([...(p.items ?? []), ...(a.items ?? [])].sort((x, y) => (x.name ?? '').localeCompare(y.name ?? '')))));
    this.api.call(fleetPolicies).subscribe(ps => { const v = ps.find(p => p.key === 'MAX_CLAIM_NO_SECOND_APPROVAL')?.value; if (v) this.limit.set(Number(v).toLocaleString('en-US')); });
    effect(() => { const el = this.mapEl()?.nativeElement; const c = this.sel(); if (el && c?.lat && c?.lng) setTimeout(() => this.drawMap(el, c), 0); else { this.map?.remove(); this.map = undefined; } });
  }
  ngOnDestroy(): void { this.map?.remove(); }
  load(): void {
    const m = this.month.trim();
    this.api.call(fuelClaims, { status: this.status || undefined, flagged: this.flagged || undefined, repPartyId: this.rep ?? undefined, month: /^\d{4}-\d{2}$/.test(m) ? m : undefined, ...this.state.params() })
      .subscribe(p => this.state.apply(p, r => this.rows.set(r)));
  }
  flagText(f: string): string { return FLAGS[f] ?? f; }
  approvable(unflaggedOnly: boolean): FuelClaimView[] { return this.rows().filter(c => c.status === 'SUBMITTED' && (!unflaggedOnly || !(c.flags?.length)) && c.firstApprovedBy !== this.auth.user()?.id && c.repPartyId !== this.auth.user()?.partyId); }
  open(c: FuelClaimView): void {
    this.sel.set(c); this.day.set(null);
    if (c.vehicleDayId) this.api.call(vehicleDay, { id: c.vehicleDayId }).subscribe(d => { this.day.set(d); if (this.map && d?.startLat != null && d?.startLng != null) L.circleMarker([Number(d.startLat), Number(d.startLng)], { radius: 6, color: '#16a34a' }).bindTooltip('day start').addTo(this.map); });
  }
  private drawMap(el: HTMLDivElement, c: FuelClaimView): void {
    this.map?.remove();
    this.map = L.map(el, { center: [Number(c.lat), Number(c.lng)], zoom: 14 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    L.marker([Number(c.lat), Number(c.lng)]).bindTooltip(c.station || 'fill').addTo(this.map);
    const d = this.day();
    if (d?.startLat && d?.startLng) L.circleMarker([Number(d.startLat), Number(d.startLng)], { radius: 6, color: '#16a34a' }).bindTooltip('day start').addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 200);
  }
  private refresh(id: number): void { this.load(); this.api.call(fuelClaim, { id }).subscribe(c => this.open(c)); }
  async approve(c: FuelClaimView): Promise<void> {
    const what = c.needsSecondApproval ? (c.firstApprovedBy ? 'Give the second approval' : 'Give the first approval (a second approver is still needed)') : 'Approve';
    if (!(await this.dialogs.confirm(`${what} for claim ${c.id}?`, `${c.repName} · ${c.amount} · ${c.litres} l${c.flags?.length ? ' · flags: ' + c.flags.join(', ') : ''}. Approval posts the credit onto the next statement.`, 'Approve'))) return;
    this.api.call(approveFuelClaim, { id: c.id! }).subscribe({ next: r => { this.toast.ok(r.status === 'APPROVED' ? `Approved for the ${r.statementMonth?.slice(0, 7)} statement` : 'First approval recorded'); this.refresh(c.id!); }, error: e => this.toast.error(e) });
  }
  async reject(c: FuelClaimView): Promise<void> {
    const reason = await this.dialogs.reason(`Reject claim ${c.id}?`, `${c.repName} · ${c.amount}. The rep sees the reason.`, 'Reject', true); if (!reason) return;
    this.api.call(rejectFuelClaim, { id: c.id!, body: { reason } }).subscribe({ next: () => { this.toast.ok('Rejected'); this.refresh(c.id!); }, error: e => this.toast.error(e) });
  }
  async bulk(unflaggedOnly: boolean): Promise<void> {
    const ids = this.approvable(unflaggedOnly).map(c => c.id!); if (!ids.length) return;
    if (!(await this.dialogs.confirm(`Approve ${ids.length} claim(s)?`, 'Each claim is decided on its own: claims above the limit get their first approval only, and a refusal does not stop the others.', 'Approve all'))) return;
    this.api.call(approveFuelClaimsBulk, { body: { ids } }).subscribe({ next: r => { this.toast.ok(`${r.approved} approved, ${r.awaitingSecond} awaiting a second approver, ${r.failed} refused`); this.load(); }, error: e => this.toast.error(e) });
  }
}
