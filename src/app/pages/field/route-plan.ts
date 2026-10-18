import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import * as L from 'leaflet';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { decodePolyline } from '../../core/polyline';
import { cancelRoutePlan, optimiseRoutePlan, publishRoutePlan, routePlan, stopOutcome } from '../../api/functions';
import { DayView, PlanDetail, StopView } from '../../api/models';

const COLOURS = ['#0e7490', '#7c3aed', '#b45309', '#15803d', '#be123c', '#1d4ed8', '#0f766e', '#a21caf'];

/** One route plan: its days on the map (one colour each), the stops in order with their status, and the actions on it. */
@Component({
  standalone: true, imports: [UI, PageHeader, DecimalPipe],
  template: `
  @if (d(); as d) {
  <app-page [title]="d.plan?.name || 'Route plan'" [subtitle]="(d.plan?.areaName ? d.plan?.areaName + ' · ' : '') + d.plan?.days + ' day(s) · ' + d.plan?.stops + ' stops · ' + d.plan?.stopsPerDay + ' per day · ' + d.plan?.serviceMin + ' min per stop' + (d.plan?.notes ? ' · ' + d.plan?.notes : '')" [crumbs]="['Field', 'Route plans']">
    <span class="tag" [class.ok]="d.plan?.status==='PUBLISHED' || d.plan?.status==='DONE'" [class.bad]="d.plan?.status==='CANCELLED'" [class.info]="d.plan?.status==='DRAFT'">{{ d.plan?.status }}</span>
    @if (auth.has('route.plan') && (d.plan?.status === 'DRAFT' || d.plan?.status === 'PUBLISHED')) { <button mat-stroked-button (click)="optimise()" [disabled]="busy()"><mat-icon>route</mat-icon> {{ optimised() ? 'Re-optimise' : 'Optimise' }}</button> }
    @if (auth.has('route.plan') && d.plan?.status === 'DRAFT') { <button mat-flat-button (click)="publish()" [disabled]="busy() || !optimised()"><mat-icon>publish</mat-icon> Publish</button> }
    @if (auth.has('route.plan') && (d.plan?.status === 'DRAFT' || d.plan?.status === 'PUBLISHED')) { <button mat-button (click)="cancel()" [disabled]="busy()">Cancel plan</button> }
  </app-page>
  <div class="progress"><div class="bar" [style.width.%]="pct(d)"></div><span>{{ d.plan?.visited }} visited · {{ d.plan?.skipped }} skipped · {{ (d.plan?.stops || 0) - (d.plan?.visited || 0) - (d.plan?.skipped || 0) }} to go</span></div>
  <div class="map" #map></div>
  <div class="days">
    @for (day of d.days; track day.id; let i = $index) {
      <div class="panel day" [class.active]="sel()?.id === day.id" (click)="focus(day)">
        <div class="row" style="align-items:center"><i class="dot" [style.background]="colour(i)"></i><b>Day {{ day.seq }} · {{ day.day | when }}</b><span class="tag" [class.ok]="day.status==='DONE'" [class.info]="day.status==='STARTED'" [class.bad]="day.status==='CANCELLED'">{{ day.status }}</span></div>
        <div class="muted">{{ day.repName }} · {{ day.stopsVisited }}/{{ day.stopsTotal }} done{{ day.stopsSkipped ? ', ' + day.stopsSkipped + ' skipped' : '' }} · {{ day.distanceM != null ? (day.distanceM / 1000 | number:'1.1-1') + ' km · ' + day.durationMin + ' min' : 'not optimised' }}{{ day.optimiser ? ' · ' + day.optimiser : '' }}<br>start: {{ day.startLabel }}</div>
      </div>
    }
  </div>
  @if (sel(); as day) {
    <div class="panel">
      <h2>Day {{ day.seq }} · {{ day.repName }} · stops in order</h2>
      <app-table [cols]="stopCols" [rows]="day.stops || []" [filterable]="false" [paged]="false" [clickable]="auth.has('route.plan') && (day.status === 'PUBLISHED' || day.status === 'STARTED')" (pick)="outcomeFor(day, $event)" />
      @if (auth.has('route.plan') && (day.status === 'PUBLISHED' || day.status === 'STARTED')) { <div class="muted" style="margin-top:6px; font-size:12px">Click a planned stop to record its outcome on the rep's behalf.</div> }
    </div>
  }
  }`,
  styles: [`
    .progress { position: relative; height: 22px; background: #eef2f6; border-radius: 6px; margin: 4px 0 12px; overflow: hidden; } .progress .bar { height: 100%; background: var(--ok); border-radius: 6px; } .progress span { position: absolute; inset: 0; display: flex; align-items: center; padding-left: 10px; font-size: 12px; font-weight: 600; color: var(--ink); }
    .map { height: 420px; border-radius: 10px; border: 1px solid var(--line); overflow: hidden; z-index: 0; margin-bottom: 12px; background: #e2e8f0; }
    .days { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .day { padding: 10px 14px; margin: 0; cursor: pointer; } .day.active { outline: 2px solid var(--brand); } .day .row { gap: 8px; }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
  `],
})
export class RoutePlanPage implements AfterViewInit, OnDestroy {
  auth = inject(AuthService); private router = inject(Router);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  private mapEl = viewChild<ElementRef<HTMLDivElement>>('map');
  id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  d = signal<PlanDetail | null>(null); sel = signal<DayView | null>(null); busy = signal(false); optimised = signal(false);
  stopCols: Col[] = [{ key: 'seq', label: '#', type: 'qty' }, { key: 'shopName', label: 'Shop' }, { key: 'streetName', label: 'Street' }, { key: 'plannedArrivalMin', label: 'ETA min', type: 'qty' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'outcome', label: 'Outcome', type: 'tag' }, { key: 'visitedAt', label: 'When', type: 'datetime' }, { key: 'lastVisitAt', label: 'Last visit', type: 'date' }, { key: 'notes', label: 'Notes' }];
  private map?: L.Map; private layer = L.layerGroup(); private drawn = false;

  constructor() { this.load(); }
  ngAfterViewInit(): void { setTimeout(() => this.initMap(), 0); }
  ngOnDestroy(): void { this.map?.remove(); }
  colour(i: number): string { return COLOURS[i % COLOURS.length]; }
  pct(d: PlanDetail): number { const t = d.plan?.stops || 0; return t ? Math.round(((d.plan?.visited || 0) + (d.plan?.skipped || 0)) / t * 100) : 0; }

  load(): void {
    this.api.call(routePlan, { id: this.id }).subscribe({ next: d => { this.d.set(d); this.optimised.set((d.days ?? []).every(x => !!x.optimisedAt)); const cur = this.sel(); this.sel.set(cur ? d.days?.find(x => x.id === cur.id) ?? null : d.days?.[0] ?? null); setTimeout(() => { this.initMap(); this.draw(); }, 0); }, error: e => { this.toast.error(e); this.router.navigate(['/route-plans']); } });
  }
  private initMap(): void {
    const el = this.mapEl()?.nativeElement; if (!el || this.map) return;
    this.map = L.map(el, { center: [-26.2041, 28.0473], zoom: 11 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    this.layer.addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 300);
  }
  private draw(): void {
    const d = this.d(); if (!this.map || !d) return;
    this.layer.clearLayers(); const all: L.LatLngTuple[] = [];
    (d.days ?? []).forEach((day, i) => {
      const c = this.colour(i);
      const line: L.LatLngTuple[] = day.polyline ? decodePolyline(day.polyline) : (day.line ?? []).map(p => [Number(p[0]), Number(p[1])] as L.LatLngTuple);
      if (line.length) L.polyline(line, { color: c, weight: 4, opacity: .8 }).bindTooltip(`Day ${day.seq} · ${day.repName}`).addTo(this.layer);
      if (day.startLat != null && day.startLng != null) L.marker([Number(day.startLat), Number(day.startLng)], { icon: L.divIcon({ className: '', html: `<div style="background:${c};color:#fff;border-radius:50%;width:22px;height:22px;display:grid;place-items:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">S</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).bindTooltip(`Day ${day.seq} start: ${day.startLabel}`).addTo(this.layer);
      for (const s of day.stops ?? []) {
        if (s.lat == null || s.lng == null) continue;
        const p: L.LatLngTuple = [Number(s.lat), Number(s.lng)]; all.push(p);
        L.circleMarker(p, { radius: 7, color: c, fillColor: s.status === 'VISITED' ? '#16a34a' : s.status === 'SKIPPED' ? '#94a3b8' : '#fff', fillOpacity: 1, weight: 2 })
          .bindTooltip(`${s.seq}. ${s.shopName} · ${s.status}${s.plannedArrivalMin != null ? ' · ETA +' + s.plannedArrivalMin + ' min' : ''}`).addTo(this.layer);
      }
    });
    if (all.length) this.map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 16 });
    this.drawn = true;
  }
  focus(day: DayView): void {
    this.sel.set(day);
    const pts = (day.stops ?? []).map(s => [Number(s.lat), Number(s.lng)] as L.LatLngTuple);
    if (pts.length) this.map?.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
  }
  optimise(): void { this.busy.set(true); this.api.call(optimiseRoutePlan, { id: this.id }).subscribe({ next: r => { this.busy.set(false); this.toast.ok(`Optimised ${r.optimisedByVroom} day(s) by VROOM${r.optimisedByFallback ? ', ' + r.optimisedByFallback + ' by fallback' : ''}${r.unassigned ? ', ' + r.unassigned + ' stops did not fit' : ''}`); this.load(); }, error: e => { this.busy.set(false); this.toast.error(e); } }); }
  async publish(): Promise<void> { if (!await this.dialogs.confirm('Publish this plan?', 'The reps will see their days in the app.', 'Publish')) return; this.busy.set(true); this.api.call(publishRoutePlan, { id: this.id }).subscribe({ next: () => { this.busy.set(false); this.toast.ok('Published'); this.load(); }, error: e => { this.busy.set(false); this.toast.error(e); } }); }
  async cancel(): Promise<void> { if (!await this.dialogs.confirm('Cancel this plan?', undefined, 'Cancel plan', true)) return; this.api.call(cancelRoutePlan, { id: this.id }).subscribe({ next: () => { this.toast.ok('Cancelled'); this.load(); }, error: e => this.toast.error(e) }); }
  async outcomeFor(day: DayView, s: StopView): Promise<void> {
    if (s.status !== 'PLANNED' || !this.auth.has('route.plan') || (day.status !== 'PUBLISHED' && day.status !== 'STARTED')) return;
    const v = await this.dialogs.form({ title: `${s.seq}. ${s.shopName}`, subtitle: `Recorded as a visit by ${day.repName}.`, submit: 'Save', width: '460px', initial: { status: 'VISITED', outcome: 'VISITED' }, fields: [
      { key: 'status', label: 'Result', type: 'select', required: true, options: [opt('VISITED', 'Visited (makes a check-in)'), opt('SKIPPED', 'Skipped')] },
      { key: 'outcome', label: 'Outcome', type: 'select', options: ['VISITED', 'SOLD', 'NO_STOCK', 'CLOSED', 'REFUSED', 'NOT_FOUND'].map(x => opt(x, x)) }, { key: 'notes', label: 'Notes', wide: true }] }); if (!v) return;
    this.api.call(stopOutcome, { id: s.id!, body: { status: v.status, outcome: v.outcome || undefined, notes: v.notes || undefined } }).subscribe({ next: () => { this.toast.ok('Saved'); this.load(); }, error: e => this.toast.error(e) });
  }
}
