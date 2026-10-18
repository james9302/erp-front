import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { areas, checkShopIdentity, createShop, createZone, deactivateZone, geocode, loadAround, loadStatus, loadStreets, noGoZones, street, streets, syncAreas } from '../../api/functions';
import { AreaView, GeocodeHit, NoGoZoneView, StreetDetail, StreetLoadStatus, StreetRow } from '../../api/models';

const JHB: L.LatLngTuple = [-26.2041, 28.0473];

/**
 * The street network for field planning: browse province > district > suburb (built from the shop pins) or search a
 * place, load the named streets from OpenStreetMap, and see on the map which streets carry shops nobody has visited
 * lately (red), which carry visited shops (teal) and which have no shops on record yet (grey, "not surveyed").
 * No-go zones are drawn by clicking points on the map.
 */
@Component({
  standalone: true, imports: [UI, PageHeader, DecimalPipe],
  template: `
  <app-page title="Streets & areas" subtitle="Streets come from OpenStreetMap, one suburb (or a searched place) at a time. A shop belongs to the nearest named street within 60 m. Red streets have shops due a visit; grey ones have no shop on record and are worth a survey.">
    @if (auth.has('route.plan')) { <button mat-flat-button (click)="planRoute()" [disabled]="!rows().length" matTooltip="Plan a route over the streets listed below"><mat-icon>alt_route</mat-icon> Plan a route</button> }
    @if (auth.has('shop.visit') || auth.has('party.edit')) { <button mat-stroked-button (click)="addMode.set(!addMode()); zoneMode.set(false)" [class.on]="addMode()"><mat-icon>{{ addMode() ? 'close' : 'add_business' }}</mat-icon> {{ addMode() ? 'Cancel add' : 'Add shop here' }}</button> }
    @if (auth.has('party.edit')) { <button mat-stroked-button (click)="sync()"><mat-icon>sync</mat-icon> Rebuild areas</button> <button mat-stroked-button (click)="zoneMode.set(!zoneMode()); zonePts.set([])" [class.on]="zoneMode()"><mat-icon>{{ zoneMode() ? 'close' : 'block' }}</mat-icon> {{ zoneMode() ? 'Cancel zone' : 'New no-go zone' }}</button> }
  </app-page>
  @if (status(); as s) { @if (s.state !== 'IDLE') {
    <div class="panel" style="padding:10px 16px"><div class="row" style="align-items:center"><span class="tag" [class.ok]="s.state==='DONE'" [class.bad]="s.state==='FAILED'" [class.info]="s.state==='RUNNING'">{{ s.state }}</span>
      <span class="muted">{{ s.scope }} · ways {{ s.waysRead | qty }} · streets {{ s.streetsWritten | qty }} · shops linked {{ s.shopsLinked | qty }} of {{ s.shopsSeen | qty }} · {{ s.message }}</span></div>
      @if (s.state === 'RUNNING') { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
    </div> } }
  <div class="layout">
    <div class="side">
      <div class="panel">
        <h2>Browse by area</h2>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w"><mat-label>Province</mat-label><mat-select [value]="prov()?.id" (valueChange)="pickProv($event)"><mat-option [value]="undefined">—</mat-option>@for (a of provs(); track a.id) { <mat-option [value]="a.id">{{ a.name }} · {{ a.dueCount | qty }} due / {{ a.shopCount | qty }}</mat-option> }</mat-select></mat-form-field>
        @if (prov()) { <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w"><mat-label>District</mat-label><mat-select [value]="dist()?.id" (valueChange)="pickDist($event)"><mat-option [value]="undefined">—</mat-option>@for (a of dists(); track a.id) { <mat-option [value]="a.id">{{ a.name }} · {{ a.dueCount | qty }} / {{ a.shopCount | qty }}</mat-option> }</mat-select></mat-form-field> }
        @if (subs().length) { <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w"><mat-label>Suburb{{ dist() ? '' : ' (no district on record)' }}</mat-label><mat-select [value]="sub()?.id" (valueChange)="pickSub($event)"><mat-option [value]="undefined">—</mat-option>@for (a of subs(); track a.id) { <mat-option [value]="a.id">{{ a.name }} · {{ a.dueCount | qty }} / {{ a.shopCount | qty }}{{ a.streetCount ? ' · ' + a.streetCount + ' st' : '' }}</mat-option> }</mat-select></mat-form-field> }
        @if (area(); as a) {
          <div class="muted" style="margin:4px 0 8px">{{ a.kind }} {{ a.name }} · {{ a.shopCount | qty }} shops, {{ a.dueCount | qty }} due · {{ a.streetCount }} streets{{ a.streetsLoadedAt ? ' (loaded ' + (a.streetsLoadedAt | when) + ')' : ' (not loaded)' }}</div>
          @if (auth.has('party.edit') && a.kind !== 'PROVINCE') { <button mat-flat-button (click)="loadArea(a)" [disabled]="running()"><mat-icon>download</mat-icon> {{ a.streetCount ? 'Refresh streets' : 'Load streets' }}</button> }
        }
        <h2>Or search a place</h2>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w"><mat-label>Place or address</mat-label><input matInput [(ngModel)]="placeQ" (keyup.enter)="searchPlace()"><button matSuffix mat-icon-button (click)="searchPlace()"><mat-icon>search</mat-icon></button></mat-form-field>
        @if (hits().length) { <div class="hits">@for (h of hits(); track $index) { <div class="hit" (click)="usePlace(h)">{{ h.label }}</div> }</div> }
        @if (centre(); as c) {
          <div class="row" style="align-items:center"><span class="muted mono">{{ c[0] | number:'1.4-4' }}, {{ c[1] | number:'1.4-4' }}</span><mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:110px"><mat-label>Radius m</mat-label><input matInput type="number" [(ngModel)]="radius" (change)="state.refresh()"></mat-form-field>
            @if (auth.has('party.edit')) { <button mat-stroked-button (click)="loadHere()" [disabled]="running()"><mat-icon>download</mat-icon> Load here</button> }</div>
        }
        <h2>Filter</h2>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w"><mat-label>Street name</mat-label><input matInput [(ngModel)]="q" (keyup.enter)="state.refresh()"></mat-form-field>
        <mat-checkbox [(ngModel)]="dueOnly" (change)="state.refresh()">With due shops</mat-checkbox><br>
        <mat-checkbox [(ngModel)]="notSurveyed" (change)="state.refresh()">Not surveyed (no shops)</mat-checkbox>
      </div>
    </div>
    <div class="main">
      <div class="map" #map></div>
      @if (addMode()) { <div class="muted" style="margin:6px 0">Click the map where the new shop stands; existing shops within 100 m are checked first.</div> }
      @if (zoneMode()) { <div class="muted" style="margin:6px 0">Click the map to add corners ({{ zonePts().length }} so far); <button mat-button (click)="saveZone()" [disabled]="zonePts().length < 3">save the zone</button></div> }
      <div class="legend"><span><i style="background:#dc2626"></i> due shops</span><span><i style="background:#0e7490"></i> visited shops</span><span><i style="background:#94a3b8"></i> not surveyed</span><span><i style="background:rgba(220,38,38,.25); border:1px solid #dc2626"></i> no-go zone</span></div>
      <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)" empty="No streets here yet. Pick a suburb or search a place and load its streets." />
      <app-drawer [open]="!!sel()" (closed)="sel.set(null); pins.clearLayers()" [title]="sel()?.street?.name || ''" [subtitle]="sel() ? (sel()!.street?.lengthM + ' m · ' + (sel()!.street?.areaName || '') + ' · ' + sel()!.street?.shopsDue + ' due of ' + sel()!.street?.shopsTotal + ' shops') : ''" width="min(640px, 96vw)">
        @if (sel(); as d) {
          <div class="row" style="align-items:center; margin-bottom:8px"><span class="tag">{{ d.street?.highwayClass }}</span>@if (d.street?.inNoGo) { <span class="tag bad">in a no-go zone</span> }</div>
          <app-table [cols]="shopCols" [rows]="d.shops || []" [filterable]="false" [clickable]="false" [paged]="false" empty="No shop on record on this street: worth a survey." />
        }
      </app-drawer>
    </div>
  </div>`,
  styles: [`
    .layout { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 16px; } @media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .w { width: 100%; } .side h2:first-child { margin-top: 0; }
    .map { height: 460px; border-radius: 10px; border: 1px solid var(--line); overflow: hidden; z-index: 0; background: #e2e8f0; }
    .hits { border: 1px solid var(--line); border-radius: 8px; max-height: 150px; overflow: auto; margin-bottom: 8px; } .hit { padding: 6px 10px; font-size: 12.5px; cursor: pointer; border-bottom: 1px solid var(--line); } .hit:hover { background: var(--brand-soft); }
    .legend { display: flex; gap: 16px; font-size: 12px; color: var(--ink-2); margin: 8px 0 12px; } .legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    button.on { background: var(--bad-soft); }
  `],
})
export class StreetsPage implements AfterViewInit, OnDestroy {
  auth = inject(AuthService); private router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  provs = signal<AreaView[]>([]); dists = signal<AreaView[]>([]); subs = signal<AreaView[]>([]);
  prov = signal<AreaView | null>(null); dist = signal<AreaView | null>(null); sub = signal<AreaView | null>(null); area = signal<AreaView | null>(null);
  placeQ = ''; hits = signal<GeocodeHit[]>([]); centre = signal<L.LatLngTuple | null>(null); radius = 1000;
  q = ''; dueOnly = false; notSurveyed = false;
  rows = signal<StreetRow[]>([]); state = new ListState(() => this.load(), 100); sel = signal<StreetDetail | null>(null);
  status = signal<StreetLoadStatus | null>(null); running = signal(false); zones = signal<NoGoZoneView[]>([]);
  zoneMode = signal(false); zonePts = signal<L.LatLngTuple[]>([]); addMode = signal(false);
  cols: Col[] = [{ key: 'name', label: 'Street' }, { key: 'highwayClass', label: 'Class', type: 'tag' }, { key: 'areaName', label: 'Area' }, { key: 'lengthM', label: 'Length m', type: 'qty' }, { key: 'shopsTotal', label: 'Shops', type: 'qty' }, { key: 'shopsDue', label: 'Due', type: 'qty' }, { key: 'inNoGo', label: 'No-go', type: 'bool' }];
  shopCols: Col[] = [{ key: 'name', label: 'Shop' }, { key: 'externalRef', label: 'Ref' }, { key: 'parentName', label: 'Under' }, { key: 'distanceM', label: 'From street m', type: 'qty' }, { key: 'lastVisitAt', label: 'Last visit', type: 'date' }, { key: 'lastVisitKind', label: 'How', type: 'tag' }, { key: 'due', label: 'Due', type: 'bool' }];
  private map?: L.Map; private lines = L.layerGroup(); pins = L.layerGroup(); private zoneLayer = L.layerGroup(); private draft?: L.Polygon; private poll: any;

  constructor() {
    this.api.call(areas, {}).subscribe(a => this.provs.set(a));
    this.api.call(loadStatus).subscribe(s => { this.status.set(s); if (s.state === 'RUNNING') this.watch(); });
    this.loadZones();
  }
  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement, { center: JHB, zoom: 10 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    this.zoneLayer.addTo(this.map); this.lines.addTo(this.map); this.pins.addTo(this.map);
    this.map.on('click', e => { if (this.zoneMode()) { this.zonePts.set([...this.zonePts(), [e.latlng.lat, e.latlng.lng]]); this.drawDraft(); } else if (this.addMode()) this.addShop(e.latlng.lat, e.latlng.lng); });
    setTimeout(() => this.map?.invalidateSize(), 300);
    this.drawZones();
  }
  ngOnDestroy(): void { clearInterval(this.poll); this.map?.remove(); }

  // ---- areas -------------------------------------------------------------------------------------------------------
  /** A province's children are its districts and the suburbs whose pins carry no district; both are offered. */
  pickProv(id?: number): void { const a = this.provs().find(x => x.id === id) ?? null; this.prov.set(a); this.dist.set(null); this.sub.set(null); this.dists.set([]); this.subs.set([]); this.use(a); if (a) this.api.call(areas, { parentId: a.id }).subscribe(d => { this.dists.set(d.filter(x => x.kind === 'DISTRICT')); this.subs.set(d.filter(x => x.kind === 'SUBURB')); }); }
  pickDist(id?: number): void { const a = this.dists().find(x => x.id === id) ?? null; this.dist.set(a); this.sub.set(null); this.subs.set([]); this.use(a ?? this.prov()); if (a) this.api.call(areas, { parentId: a.id }).subscribe(s => this.subs.set(s)); }
  pickSub(id?: number): void { const a = this.subs().find(x => x.id === id) ?? null; this.sub.set(a); this.use(a ?? this.dist()); }
  private use(a: AreaView | null): void {
    this.area.set(a); this.centre.set(null); this.sel.set(null);
    if (a?.minLat != null) this.map?.fitBounds([[Number(a.minLat), Number(a.minLng)], [Number(a.maxLat), Number(a.maxLng)]], { padding: [20, 20] });
    this.pins.clearLayers(); this.state.refresh();
  }
  sync(): void { this.api.call(syncAreas).subscribe({ next: r => { this.toast.ok(`Areas rebuilt: ${r.provinces} provinces, ${r.districts} districts, ${r.suburbs} suburbs`); this.api.call(areas, {}).subscribe(a => this.provs.set(a)); }, error: e => this.toast.error(e) }); }
  loadArea(a: AreaView): void { this.api.call(loadStreets, { id: a.id! }).subscribe({ next: s => { this.status.set(s); this.watch(); }, error: e => this.toast.error(e) }); }

  // ---- place search ------------------------------------------------------------------------------------------------
  searchPlace(): void { if (this.placeQ.trim().length < 3) return; this.api.call(geocode, { q: this.placeQ.trim() }).subscribe({ next: h => { this.hits.set(h); if (!h.length) this.toast.ok('No place found'); }, error: e => this.toast.error(e) }); }
  usePlace(h: GeocodeHit): void {
    this.hits.set([]); this.placeQ = h.label ?? this.placeQ; this.area.set(null); this.sub.set(null); this.sel.set(null);
    const c: L.LatLngTuple = [Number(h.lat), Number(h.lng)]; this.centre.set(c); this.map?.setView(c, 15); this.pins.clearLayers(); this.state.refresh();
  }
  loadHere(): void { const c = this.centre(); if (!c) return; this.api.call(loadAround, { body: { lat: c[0], lng: c[1], radiusM: this.radius } }).subscribe({ next: s => { this.status.set(s); this.watch(); }, error: e => this.toast.error(e) }); }
  private watch(): void {
    this.running.set(true); clearInterval(this.poll);
    this.poll = setInterval(() => this.api.call(loadStatus).subscribe(s => { this.status.set(s); if (s.state !== 'RUNNING') { clearInterval(this.poll); this.running.set(false); this.load(); const a = this.area(); if (a) this.api.call(areas, { parentId: a.parentAreaId ?? undefined, kind: a.kind }).subscribe(l => { const n = l.find(x => x.id === a.id); if (n) this.area.set(n); }); } }), 2000);
  }

  // ---- streets -----------------------------------------------------------------------------------------------------
  load(): void {
    const a = this.area(), c = this.centre();
    if (!a && !c) { this.rows.set([]); this.state.total.set(0); this.lines.clearLayers(); return; }
    const where = a?.kind === 'PROVINCE' ? { areaId: a.id } : a ? { bbox: `${a.minLat},${a.minLng},${a.maxLat},${a.maxLng}` } : { lat: c![0], lng: c![1], radiusM: this.radius };
    this.api.call(streets, { ...where, q: this.q || undefined, dueOnly: this.dueOnly || undefined, notSurveyed: this.notSurveyed || undefined, ...this.state.params() })
      .subscribe(p => { this.state.apply(p, r => this.rows.set(r)); this.draw(); });
  }
  open(r: StreetRow): void {
    this.api.call(street, { id: r.id! }).subscribe(d => {
      this.sel.set(d); this.pins.clearLayers();
      for (const s of d.shops ?? []) if (s.lat != null) L.circleMarker([Number(s.lat), Number(s.lng)], { radius: 6, color: s.due ? '#dc2626' : '#0e7490', fillOpacity: .9, weight: 1 }).bindTooltip(`${s.name} · ${s.due ? 'due' : 'visited'}`).addTo(this.pins);
      const line = (d.street?.line ?? []).map(p => [Number(p[0]), Number(p[1])] as L.LatLngTuple); if (line.length) this.map?.fitBounds(L.latLngBounds(line), { padding: [40, 40], maxZoom: 17 });
    });
  }
  private draw(): void {
    this.lines.clearLayers();
    for (const r of this.rows()) {
      const pts = (r.line ?? []).map(p => [Number(p[0]), Number(p[1])] as L.LatLngTuple); if (pts.length < 2) continue;
      const color = r.shopsDue! > 0 ? '#dc2626' : r.shopsTotal! > 0 ? '#0e7490' : '#94a3b8';
      L.polyline(pts, { color, weight: r.inNoGo ? 2 : 4, dashArray: r.inNoGo ? '4 6' : undefined, opacity: .9 }).bindTooltip(`${r.name} · ${r.shopsDue} due / ${r.shopsTotal} shops`).on('click', () => this.open(r)).addTo(this.lines);
    }
  }

  /** The streets listed right now (this page of the filter) become the plan's scope. */
  planRoute(): void { this.router.navigate(['/route-plans'], { queryParams: { streets: this.rows().map(r => r.id).join(','), title: this.area()?.name || this.placeQ || 'streets' } }); }

  /** New shop at a clicked point: name first, then the identity check; a look-alike nearby needs an explicit "create anyway". */
  async addShop(lat: number, lng: number): Promise<void> {
    const v = await this.dialogs.form({ title: 'New shop at ' + lat.toFixed(5) + ', ' + lng.toFixed(5), submit: 'Check and save', width: '560px', initial: { tradeType: 'SPAZA' }, fields: [
      { key: 'name', label: 'Shop name', required: true, wide: true }, { key: 'mobile', label: 'Mobile' }, { key: 'keeperName', label: 'Shop keeper' },
      { key: 'tradeType', label: 'Trade type', type: 'select', options: ['RETAIL', 'WHOLESALE', 'SPAZA', 'FORECOURT', 'OTHER'].map(x => opt(x, x)) }, { key: 'channel', label: 'Channel' },
      { key: 'streetNo', label: 'Street no' }, { key: 'streetName', label: 'Street' }, { key: 'suburb', label: 'Suburb' }, { key: 'city', label: 'City / town' }, { key: 'notes', label: 'Notes', wide: true }] }); if (!v) return;
    const check = await new Promise<any>(res => this.api.call(checkShopIdentity, { body: { name: v.name, lat, lng } }).subscribe({ next: res, error: e => { this.toast.error(e); res(null); } })); if (!check) return;
    let force = false;
    if (check.suggestion === 'SAME_SHOP') {
      const c = check.candidates?.find((x: any) => x.sameShop) ?? check.candidates?.[0];
      if (!c) { this.toast.ok('Looks like an existing shop nearby'); return; }
      if (!await this.dialogs.confirm('Looks like an existing shop', `${c.name} is ${c.distanceM} m away (name similarity ${c.similarity}). Visit that shop instead, or create a separate one anyway?`, 'Create anyway', true)) return;
      force = true;
    }
    this.api.call(createShop, { body: { ...v, lat, lng, force, mobile: v.mobile || undefined, notes: v.notes || undefined } }).subscribe({ next: d => { this.toast.ok('Shop created: ' + d.shop?.name + (check.candidates.length ? ` · ${check.candidates.length} other shop(s) nearby` : '')); this.addMode.set(false); this.load(); }, error: e => this.toast.error(e) });
  }

  // ---- no-go zones -------------------------------------------------------------------------------------------------
  private loadZones(): void { this.api.call(noGoZones, { active: true }).subscribe(z => { this.zones.set(z); this.drawZones(); }); }
  private drawZones(): void {
    if (!this.map) return; this.zoneLayer.clearLayers();
    for (const z of this.zones()) {
      const poly = L.polygon((z.polygon ?? []).map(p => [Number(p[0]), Number(p[1])] as L.LatLngTuple), { color: '#dc2626', fillOpacity: .22, weight: 1 }).bindTooltip(`${z.kind}: ${z.name}${z.reason ? ' · ' + z.reason : ''}`);
      if (this.auth.has('party.edit')) poly.on('click', async () => { if (await this.dialogs.confirm('Remove zone ' + z.name + '?', z.reason ?? undefined, 'Remove', true)) this.api.call(deactivateZone, { id: z.id! }).subscribe({ next: () => { this.toast.ok('Zone removed'); this.loadZones(); this.load(); }, error: e => this.toast.error(e) }); });
      poly.addTo(this.zoneLayer);
    }
  }
  private drawDraft(): void { this.draft?.remove(); if (this.zonePts().length) this.draft = L.polygon(this.zonePts(), { color: '#dc2626', dashArray: '4 4', fillOpacity: .15 }).addTo(this.map!); }
  async saveZone(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New no-go zone', submit: 'Save zone', width: '460px', initial: { kind: 'NO_GO' }, fields: [{ key: 'name', label: 'Name', required: true, wide: true }, { key: 'kind', label: 'Kind', type: 'select', options: [opt('NO_GO', 'No-go (unsafe, blocked)'), opt('REST', 'Rest stop area')] }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    this.api.call(createZone, { body: { name: v.name, kind: v.kind, reason: v.reason || undefined, polygon: this.zonePts().map(p => [p[0], p[1]]), active: true } }).subscribe({ next: () => { this.toast.ok('Zone saved'); this.zoneMode.set(false); this.zonePts.set([]); this.draft?.remove(); this.loadZones(); this.load(); }, error: e => this.toast.error(e) });
  }
}
