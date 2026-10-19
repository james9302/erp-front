import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { PROVINCES, Places, placeLine } from '../../shared/address-dialog';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { checkin, fieldSettings, saveProfile, setFieldSetting, shop, shopSurveys, shops } from '../../api/functions';
import { FieldSettingView, ShopDetail, ShopRow, ShopSurveysView } from '../../api/models';

const OUTCOMES = ['VISITED', 'SOLD', 'NO_STOCK', 'CLOSED', 'REFUSED', 'NOT_FOUND'];

/**
 * Shops for the field team: who has not been visited in the due window, where they are, their profile and visit history.
 * Visits come from hand-overs (automatic) and check-ins from the rep app.
 */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Shops" subtitle="Every shop with its pin, profile and last visit. A shop is due when nobody has visited it for {{ dueWeeks() }} weeks; hand-overs count as visits, so do check-ins from the app.">
    @if (auth.has('party.edit')) {
      <button mat-stroked-button (click)="settings()"><mat-icon>tune</mat-icon> Due rule</button>
    }
  </app-page>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Province</mat-label><mat-select [ngModel]="province" (ngModelChange)="province = $event; state.refresh()"><mat-option [value]="''">Any</mat-option>@for (p of provinces; track p) { <mat-option [value]="p">{{ p }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>City / town</mat-label><input matInput [(ngModel)]="city" (keyup.enter)="state.refresh()" (change)="state.refresh()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Suburb</mat-label><input matInput [(ngModel)]="suburb" (keyup.enter)="state.refresh()" (change)="state.refresh()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Under rep / agent id</mat-label><input matInput type="number" [(ngModel)]="under" (keyup.enter)="state.refresh()" (change)="state.refresh()"></mat-form-field>
    <mat-checkbox [(ngModel)]="dueOnly" (change)="state.refresh()">Due only</mat-checkbox>
    <mat-checkbox [(ngModel)]="activeOnly" (change)="state.refresh()">Active only</mat-checkbox>
  </div>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)" empty="No shops match. Create SHOP parties and give them an address." />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel()?.shop?.name || ''" [subtitle]="sel()?.shop?.fullAddress || ''">
      @if (sel(); as d) {
        <div>
          <div class="row" style="align-items:center"><span class="tag" [class.bad]="d.shop?.due" [class.ok]="!d.shop?.due">{{ d.shop?.due ? 'DUE' : 'visited' }}</span>@if (d.profile?.suspended) { <span class="tag warn" [matTooltip]="d.profile?.suspendedReason || ''">suspended</span> }@if (!d.shop?.active) { <span class="tag bad">inactive</span> }</div>
          <div class="muted" style="margin:6px 0 10px">ref {{ d.shop?.externalRef || '—' }} · mobile {{ d.shop?.mobile || '—' }} · under {{ d.shop?.parentName || '—' }}<br>
            @if (d.place) { <mat-icon class="pin">location_on</mat-icon> {{ place(d.place) }} } @else { <span class="tag warn">no address</span> }<br>
            last visit {{ d.shop?.lastVisitAt | when:true }} {{ d.shop?.lastVisitKind ? '(' + d.shop?.lastVisitKind + ')' : '' }}</div>
          <div class="row">
            @if (auth.has('party.edit')) { <button mat-stroked-button (click)="editProfile(d)"><mat-icon>edit</mat-icon> Profile</button> }
            <button mat-stroked-button (click)="address(d)"><mat-icon>{{ d.place ? 'location_on' : 'add_location_alt' }}</mat-icon> Address</button>
            @if (auth.has('shop.visit') || auth.has('party.edit')) { <button mat-flat-button (click)="doCheckin(d)"><mat-icon>where_to_vote</mat-icon> Check in</button> }
          </div>
          @if (d.profile; as p) {
            <h2>Profile</h2>
            <div class="kv">
              <span>Trade</span><span>{{ p.tradeType || '—' }} · {{ p.channel || '—' }} {{ p.subChannel ? '· ' + p.subChannel : '' }}</span>
              <span>Class / category</span><span>{{ p.tradeClass || '—' }} · {{ p.category || '—' }}</span>
              <span>People</span><span>owner {{ p.ownerName || '—' }} · keeper {{ p.keeperName || '—' }} {{ p.keeperMobile || '' }}</span>
              <span>Hours</span><span>{{ p.openingDays || '' }} {{ p.openingTime || '?' }}–{{ p.closingTime || '?' }}</span>
              <span>Branding</span><span>{{ p.branding || '—' }} · geofence {{ p.geofenceM || '—' }} m @if (p.surveyRequired) { <span class="tag info">survey required</span> }</span>
              @if (p.notes) { <span>Notes</span><span>{{ p.notes }}</span> }
            </div>
          } @else { <div class="muted" style="margin-top:10px">No profile yet.</div> }
          <h2>Recent visits</h2>
          <app-table [cols]="visitCols" [rows]="d.recentVisits || []" [filterable]="false" [clickable]="false" [paged]="false" empty="Never visited." />
          @if (auth.hasAny('survey.review', 'survey.manage', 'survey.submit')) {
            <h2>Surveys</h2>
            @if (surveys(); as sv) {
              @if (!sv.types?.length) { <div class="muted">No survey type applies to this shop (branding, category, class, type, province or the survey-required flag).</div> }
              <div class="row" style="margin-bottom:8px">
                @for (t of sv.types || []; track t.typeId) {
                  <span class="tag" [class.ok]="t.state === 'DONE'" [class.warn]="t.state === 'OPEN'" [class.info]="t.state === 'NOT_DUE'" [matTooltip]="t.state === 'DONE' ? 'done ' + (t.lastDoneAt | when:true) + ' by ' + (t.lastDoneBy || '?') : t.state === 'OPEN' ? 'open this ' + (t.cycle || '').toLowerCase() + ' (' + t.doneThisCycle + ' of ' + t.limitPerCycle + ' done)' : 'outside the dates of the type'">{{ t.name }} · {{ t.state }}</span>
                }
              </div>
              <app-table [cols]="surveyCols" [rows]="sv.surveys || []" [filterable]="false" [paged]="false" (pick)="openSurvey($event)" empty="No survey at this shop yet." />
            } @else { <div class="muted">loading…</div> }
          }
        </div>
      }
  </app-drawer>`,
  styles: [`.pin { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; color: var(--brand); }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 4px 10px; font-size: 13px; } .kv > span:nth-child(odd) { color: var(--ink-3); }`],
})
export class ShopsPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs); private places = inject(Places); private router = inject(Router);
  provinces = PROVINCES; place = placeLine;
  province = ''; city = ''; suburb = ''; under: number | null = null; dueOnly = false; activeOnly = true;
  rows = signal<ShopRow[]>([]); state = new ListState(() => this.load()); sel = signal<ShopDetail | null>(null);
  dueWeeks = signal(14); settingsList = signal<FieldSettingView[]>([]);
  cols: Col[] = [{ key: 'name', label: 'Shop' }, { key: 'externalRef', label: 'Ref' }, { key: 'suburb', label: 'Suburb' }, { key: 'city', label: 'City' }, { key: 'province', label: 'Province' },
    { key: 'channel', label: 'Channel' }, { key: 'parentName', label: 'Under' }, { key: 'lastVisitAt', label: 'Last visit', type: 'date' }, { key: 'due', label: 'Due', type: 'bool' }];
  surveys = signal<ShopSurveysView | null>(null);
  surveyCols: Col[] = [{ key: 'submittedAt', label: 'When', type: 'datetime' }, { key: 'typeName', label: 'Type' }, { key: 'visitorName', label: 'By' }, { key: 'cycleKey', label: 'Cycle' }, { key: 'score', label: 'Score', type: 'qty' }, { key: 'maxScore', label: 'Max', type: 'qty' }, { key: 'status', label: 'Status', type: 'tag' }];
  visitCols: Col[] = [{ key: 'visitedAt', label: 'When', type: 'datetime' }, { key: 'kind', label: 'Kind', type: 'tag' }, { key: 'visitorName', label: 'By' }, { key: 'outcome', label: 'Outcome', type: 'tag' }, { key: 'distanceM', label: 'Dist m', type: 'qty' }, { key: 'notes', label: 'Notes' }];

  constructor() { this.load(); this.loadSettings(); }
  load(): void {
    this.api.call(shops, { province: this.province || undefined, city: this.city || undefined, suburb: this.suburb || undefined, under: this.under || undefined,
      dueOnly: this.dueOnly || undefined, active: this.activeOnly ? true : undefined, ...this.state.params() }).subscribe(p => this.state.apply(p, r => this.rows.set(r)));
  }
  loadSettings(): void { this.api.call(fieldSettings).subscribe(s => { this.settingsList.set(s); const w = s.find(x => x.key === 'VISIT_DUE_WEEKS'); if (w) this.dueWeeks.set(Number(w.value)); }); }
  open(r: ShopRow): void {
    this.surveys.set(null);
    this.api.call(shop, { id: r.id! }).subscribe(d => this.sel.set(d));
    if (this.auth.hasAny('survey.review', 'survey.manage', 'survey.submit')) this.api.call(shopSurveys, { id: r.id! }).subscribe({ next: s => this.surveys.set(s), error: () => this.surveys.set({ shopPartyId: r.id!, types: [], surveys: [] }) });
  }
  openSurvey(s: { id?: number }): void { if (this.auth.hasAny('survey.review', 'survey.manage')) this.router.navigate(['/surveys'], { queryParams: { id: s.id } }); }
  private reopen(d: ShopDetail): void { this.load(); this.open(d.shop!); }

  async editProfile(d: ShopDetail): Promise<void> {
    const v = await this.dialogs.form({ title: 'Profile of ' + d.shop?.name, submit: 'Save', initial: d.profile ?? { suspended: false }, fields: [
      { key: 'tradeType', label: 'Trade type', type: 'select', options: ['RETAIL', 'WHOLESALE', 'SPAZA', 'FORECOURT', 'OTHER'].map(x => opt(x, x)) }, { key: 'channel', label: 'Channel' },
      { key: 'subChannel', label: 'Sub-channel' }, { key: 'tradeClass', label: 'Trade class' }, { key: 'category', label: 'Category', type: 'select', options: ['Bronze', 'Silver', 'Gold', 'Platinum'].map(x => opt(x, x)) },
      { key: 'branding', label: 'Branding' }, { key: 'ownerName', label: 'Owner' }, { key: 'keeperName', label: 'Shop keeper' }, { key: 'keeperMobile', label: 'Keeper mobile' },
      { key: 'openingDays', label: 'Open days', placeholder: 'Mon-Sat' }, { key: 'openingTime', label: 'Opens', placeholder: '08:00' }, { key: 'closingTime', label: 'Closes', placeholder: '18:00' },
      { key: 'geofenceM', label: 'Geofence m', type: 'number' }, { key: 'photoUrl', label: 'Photo URL' }, { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'surveyRequired', label: 'Survey required (an explicit rule criterion for survey types)', type: 'checkbox', wide: true },
      { key: 'suspended', label: 'Suspended (closed or duplicate)', type: 'checkbox', wide: true }, { key: 'suspendedReason', label: 'Why suspended', wide: true, when: x => !!x.suspended }] }); if (!v) return;
    this.api.call(saveProfile, { id: d.shop!.id!, body: v }).subscribe({ next: () => { this.toast.ok('Profile saved'); this.reopen(d); }, error: e => this.toast.error(e) });
  }
  async address(d: ShopDetail): Promise<void> {
    const a = await this.places.edit({ title: 'Address of ' + d.shop?.name, ownerKind: 'PARTY', ownerId: d.shop!.id!, initial: d.place, readOnly: !this.auth.has('party.edit') }); if (a) this.reopen(d);
  }
  async doCheckin(d: ShopDetail): Promise<void> {
    const me = this.auth.user()?.partyId;
    const v = await this.dialogs.form({ title: 'Check in at ' + d.shop?.name, subtitle: me ? 'Recorded as your own visit.' : 'Your login has no party: give the visiting rep or agent.', submit: 'Check in', width: '520px', initial: { outcome: 'VISITED' }, fields: [
      { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: OUTCOMES.map(x => opt(x, x)) }, { key: 'visitorPartyId', label: 'Visiting party id', type: 'number', required: !me },
      { key: 'lat', label: 'Lat (optional)', type: 'number', step: 0.000001 }, { key: 'lng', label: 'Lng (optional)', type: 'number', step: 0.000001 }, { key: 'notes', label: 'Notes', wide: true }] }); if (!v) return;
    this.api.call(checkin, { id: d.shop!.id!, body: { outcome: v.outcome, visitorPartyId: v.visitorPartyId || undefined, lat: v.lat || undefined, lng: v.lng || undefined, notes: v.notes || undefined } })
      .subscribe({ next: r => { this.toast.ok('Checked in' + (r.distanceM != null ? ` · ${r.distanceM} m from the pin` : '')); this.reopen(d); }, error: e => this.toast.error(e) });
  }
  async settings(): Promise<void> {
    const init: any = {}; for (const s of this.settingsList()) init[s.key!] = s.value;
    const v = await this.dialogs.form({ title: 'Field settings', submit: 'Save', width: '460px', initial: init, fields: this.settingsList().map(s => ({ key: s.key!, label: s.key! + (s.description ? ' · ' + s.description : ''), type: 'number' as const, wide: true })) }); if (!v) return;
    for (const s of this.settingsList()) if (String(v[s.key!]) !== s.value) this.api.call(setFieldSetting, { key: s.key!, body: { value: String(v[s.key!]) } }).subscribe({ next: () => { this.toast.ok('Saved'); this.loadSettings(); this.load(); }, error: e => this.toast.error(e) });
  }
}
