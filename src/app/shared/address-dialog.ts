import { AfterViewInit, Component, ElementRef, Injectable, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { ApiClient } from '../core/api';
import { Toast } from '../core/problem';
import { geocode, reverseGeocode, saveAddress } from '../api/functions';
import { AddressRequest, AddressResponse, GeocodeHit } from '../api/models';

export const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
const JOHANNESBURG: L.LatLngTuple = [-26.2041, 28.0473];

export interface AddressDialogData { title: string; ownerKind: 'COMPANY' | 'WAREHOUSE' | 'PARTY'; ownerId: number; initial?: AddressResponse | null; readOnly?: boolean; }

/**
 * Address with a map pin. Search a place or address (OpenStreetMap through the backend), click a hit or drop the pin by
 * clicking/dragging on the map, then "Fill from pin" completes suburb, city, municipality and province from the pin.
 * The pin is the truth: it is what route planning uses. Result: the saved AddressResponse, or null when cancelled.
 */
@Component({
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
  <h2 mat-dialog-title>{{ d.title }}</h2>
  <mat-dialog-content>
    <div class="cols">
      <div class="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wide"><mat-label>Search a place or address</mat-label>
          <input matInput [(ngModel)]="q" (keyup.enter)="search()" placeholder="e.g. 12 Pritchard St Johannesburg, or Soweto Maponya Mall" [disabled]="!!d.readOnly">
          <button matSuffix mat-icon-button (click)="search()" [disabled]="q.trim().length < 3 || searching()" matTooltip="Search (OpenStreetMap)"><mat-icon>search</mat-icon></button>
        </mat-form-field>
        @if (hits().length) {
          <div class="hits">@for (h of hits(); track $index) { <div class="hit" (click)="useHit(h)"><mat-icon>place</mat-icon><span>{{ h.label }}</span></div> }</div>
        }
        <div class="grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Street no</mat-label><input matInput [(ngModel)]="v.streetNo" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span2"><mat-label>Street</mat-label><input matInput [(ngModel)]="v.streetName" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Suburb</mat-label><input matInput [(ngModel)]="v.suburb" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>City / town</mat-label><input matInput [(ngModel)]="v.city" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Postal code</mat-label><input matInput [(ngModel)]="v.postalCode" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Local municipality</mat-label><input matInput [(ngModel)]="v.localMunicipality" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>District</mat-label><input matInput [(ngModel)]="v.districtMunicipality" [disabled]="!!d.readOnly"></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Province</mat-label><mat-select [(ngModel)]="v.province" [disabled]="!!d.readOnly"><mat-option [value]="undefined">—</mat-option>@for (p of provinces; track p) { <mat-option [value]="p">{{ p }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span3"><mat-label>Full address (as printed; blank = composed from the parts)</mat-label><input matInput [(ngModel)]="v.fullAddress" [disabled]="!!d.readOnly"></mat-form-field>
        </div>
        <div class="pinrow">
          <mat-icon [class.on]="hasPin()">{{ hasPin() ? 'location_on' : 'location_off' }}</mat-icon>
          @if (hasPin()) { <span class="mono">{{ v.lat | number:'1.6-6' }}, {{ v.lng | number:'1.6-6' }}</span> } @else { <span class="muted">No pin yet: search, or click the map.</span> }
          <span class="grow"></span>
          @if (!d.readOnly) { <button mat-stroked-button (click)="fillFromPin()" [disabled]="!hasPin() || searching()" matTooltip="Reverse geocode the pin and fill the blank parts"><mat-icon>auto_fix_high</mat-icon> Fill from pin</button> }
          <mat-checkbox [(ngModel)]="v.verified" [disabled]="!!d.readOnly">Verified on site</mat-checkbox>
        </div>
        @if (d.initial?.source) { <div class="muted" style="margin-top:6px">Source {{ d.initial?.source }}{{ d.initial?.provider ? ' · ' + d.initial?.provider : '' }} · updated {{ d.initial?.updatedAt | date:'d MMM yyyy HH:mm' }}</div> }
      </div>
      <div class="map" #map></div>
    </div>
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button mat-dialog-close>{{ d.readOnly ? 'Close' : 'Cancel' }}</button>
    @if (!d.readOnly) { <button mat-flat-button [disabled]="!hasPin() || saving()" (click)="save()"><mat-icon>save</mat-icon> Save address</button> }
  </mat-dialog-actions>`,
  styles: [`
    .cols { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; padding-top: 6px; }
    @media (max-width: 860px) { .cols { grid-template-columns: minmax(0, 1fr); } .map { min-height: 280px; } }
    .form { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .wide { width: 100%; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .span2 { grid-column: span 2; } .span3 { grid-column: 1 / -1; }
    .hits { border: 1px solid var(--line); border-radius: 8px; max-height: 160px; overflow: auto; background: var(--surface); }
    .hit { display: flex; gap: 8px; align-items: center; padding: 7px 10px; cursor: pointer; font-size: 12.5px; border-bottom: 1px solid var(--line); }
    .hit:last-child { border-bottom: 0; } .hit:hover { background: var(--brand-soft); } .hit mat-icon { color: var(--brand); font-size: 18px; width: 18px; height: 18px; }
    .pinrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .pinrow mat-icon { color: var(--ink-3); } .pinrow mat-icon.on { color: var(--brand); }
    .map { min-height: 420px; border-radius: 10px; border: 1px solid var(--line); overflow: hidden; z-index: 0; }
    :host ::ng-deep .pin { width: 26px; height: 26px; border-radius: 50% 50% 50% 0; background: var(--brand); border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); transform: rotate(-45deg); margin: -26px 0 0 -13px; }
    :host ::ng-deep .pin::after { content: ''; position: absolute; width: 8px; height: 8px; background: #fff; border-radius: 50%; left: 7px; top: 7px; }
  `],
})
export class AddressDialog implements AfterViewInit, OnDestroy {
  d: AddressDialogData = inject(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<AddressDialog>);
  private api = inject(ApiClient); private toast = inject(Toast);
  private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  provinces = PROVINCES;
  q = ''; hits = signal<GeocodeHit[]>([]); searching = signal(false); saving = signal(false);
  v: any = { ...(this.d.initial ?? {}), verified: !!this.d.initial?.verified };
  hasPin = signal(this.v.lat != null && this.v.lng != null);
  private map?: L.Map; private marker?: L.Marker;

  ngAfterViewInit(): void {
    const start: L.LatLngTuple = this.hasPin() ? [Number(this.v.lat), Number(this.v.lng)] : JOHANNESBURG;
    this.map = L.map(this.mapEl().nativeElement, { center: start, zoom: this.hasPin() ? 16 : 10, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    if (this.hasPin()) this.setPin(start[0], start[1], false);
    if (!this.d.readOnly) this.map.on('click', e => this.setPin(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => this.map?.invalidateSize(), 250);     // the dialog is still animating open when the map is created
    setTimeout(() => this.map?.invalidateSize(), 800);
  }
  ngOnDestroy(): void { this.map?.remove(); }

  private setPin(lat: number, lng: number, pan: boolean): void {
    this.v.lat = Number(lat.toFixed(6)); this.v.lng = Number(lng.toFixed(6)); this.hasPin.set(true);
    if (!this.marker) {
      this.marker = L.marker([lat, lng], { draggable: !this.d.readOnly, icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [0, 0] }) }).addTo(this.map!);
      this.marker.on('dragend', () => { const p = this.marker!.getLatLng(); this.setPin(p.lat, p.lng, false); });
    } else this.marker.setLatLng([lat, lng]);
    if (pan) this.map!.setView([lat, lng], Math.max(this.map!.getZoom(), 16));
  }

  search(): void {
    const q = this.q.trim(); if (q.length < 3) return;
    this.searching.set(true);
    this.api.call(geocode, { q }).subscribe({ next: h => { this.hits.set(h); this.searching.set(false); if (!h.length) this.toast.ok('No place found: try fewer words, or drop the pin by hand'); }, error: e => { this.searching.set(false); this.toast.error(e); } });
  }
  useHit(h: GeocodeHit): void {
    this.hits.set([]); this.q = h.label ?? this.q;
    this.setPin(Number(h.lat), Number(h.lng), true);
    this.apply(h, true);
    this.v.providerPlaceId = h.providerPlaceId; this.v.source = 'GEOCODED'; this.v.provider = 'NOMINATIM';
  }
  fillFromPin(): void {
    this.searching.set(true);
    this.api.call(reverseGeocode, { lat: this.v.lat, lng: this.v.lng }).subscribe({ next: h => { this.searching.set(false); if (h.length) this.apply(h[0], false); else this.toast.ok('Nothing known at the pin'); }, error: e => { this.searching.set(false); this.toast.error(e); } });
  }
  /** Fills the parts; `replace` overwrites what is typed (a chosen search hit), otherwise only blanks are filled (pin drop). */
  private apply(h: GeocodeHit, replace: boolean): void {
    const p = h.parts ?? {};
    if (replace) for (const k of ['streetNo', 'streetName', 'suburb', 'city', 'localMunicipality', 'districtMunicipality', 'province', 'postalCode']) this.v[k] = undefined;
    for (const k of ['streetNo', 'streetName', 'suburb', 'city', 'localMunicipality', 'districtMunicipality', 'province', 'postalCode'] as const) {
      const val = (p as any)[k]; if (val && (replace || !this.v[k])) this.v[k] = val;
    }
    if (replace) this.v.fullAddress = '';
  }
  save(): void {
    const body: AddressRequest = { streetNo: this.v.streetNo || undefined, streetName: this.v.streetName || undefined, suburb: this.v.suburb || undefined, city: this.v.city || undefined,
      localMunicipality: this.v.localMunicipality || undefined, districtMunicipality: this.v.districtMunicipality || undefined, province: this.v.province || undefined,
      postalCode: this.v.postalCode || undefined, fullAddress: this.v.fullAddress || undefined, lat: this.v.lat, lng: this.v.lng,
      source: this.v.source || (this.d.initial ? this.d.initial.source : 'MANUAL'), provider: this.v.provider || undefined, providerPlaceId: this.v.providerPlaceId || undefined, verified: !!this.v.verified };
    this.saving.set(true);
    this.api.call(saveAddress, { ownerKind: this.d.ownerKind, ownerId: this.d.ownerId, body }).subscribe({ next: a => { this.toast.ok('Address saved'); this.ref.close(a); }, error: e => { this.saving.set(false); this.toast.error(e); } });
  }
}

/** `const a = await places.edit({...}); if (!a) return;` */
@Injectable({ providedIn: 'root' })
export class Places {
  private dialog = inject(MatDialog);
  edit(data: AddressDialogData): Promise<AddressResponse | null> {
    return firstValueFrom(this.dialog.open(AddressDialog, { data, width: '1040px', maxWidth: '96vw', autoFocus: 'first-tabbable' }).afterClosed()).then(v => v ?? null);
  }
}

/** One line for lists: "12 Pritchard St, Marshalltown · Johannesburg, Gauteng". */
export function placeLine(a?: AddressResponse | null): string {
  if (!a) return '';
  const area = [a.city, a.province].filter(Boolean).join(', ');
  return [a.fullAddress, area].filter(Boolean).join(' · ');
}
