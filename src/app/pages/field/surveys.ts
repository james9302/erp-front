import { Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import * as L from 'leaflet';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ListState } from '../../core/list-state';
import { Dialogs } from '../../shared/dialogs';
import { PROVINCES } from '../../shared/address-dialog';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Photos } from '../../core/photos';
import { Toast } from '../../core/problem';
import { listSurveyTypes, listSurveys, reviewSurvey, survey } from '../../api/functions';
import { SurveyQuestion, SurveyTypeView, SurveyView } from '../../api/models';
import { FAMILIES, familyLabel } from '../setup/survey-types';

const STATUSES = ['SUBMITTED', 'REVIEWED', 'REJECTED'];

/** One answered question as the drawer shows it. */
export interface AnswerRow { section: string; q: SurveyQuestion; value: string; photos: number[]; }

/** Turns a survey's answers into labelled rows in form order; used here and in the shop drawer. */
export function answerRows(s: SurveyView): AnswerRow[] {
  const a = (s.answers ?? {}) as Record<string, any>; const rows: AnswerRow[] = [];
  for (const sec of s.form?.sections ?? []) for (const q of sec.questions ?? []) {
    const v = a[q.code!]; let text = '—'; let photos: number[] = [];
    if (q.kind === 'PHOTO') photos = Array.isArray(v) ? v : [];
    else if (v === true) text = 'Yes'; else if (v === false) text = 'No';
    else if (Array.isArray(v)) text = v.map(c => q.options?.find(o => o.code === c)?.label ?? c).join(', ') || '—';
    else if (v != null && v !== '') text = q.kind === 'CHOICE' ? (q.options?.find(o => o.code === v)?.label ?? String(v)) : q.kind === 'RATING' ? `${v} / ${q.max ?? 5}` : String(v);
    const extra = a[q.code + '_photo']; if (Array.isArray(extra)) photos = [...photos, ...extra];
    rows.push({ section: sec.title!, q, value: text, photos });
  }
  return rows;
}

/** Field > Surveys: every survey submitted, by type, status, province, period and user; answers and photos; review or reject. */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Surveys" subtitle="What the reps filled in at the shops: answers, photos, the position against the shop pin and the score. Review marks a survey checked; reject (with a reason) frees the shop's cycle slot for a redo." />
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:170px"><mat-label>Family</mat-label><mat-select [ngModel]="family" (ngModelChange)="family = $event; typeId = null; state.refresh()"><mat-option [value]="''">Any</mat-option>@for (f of families; track f) { <mat-option [value]="f">{{ familyLabel(f) }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:220px"><mat-label>Type</mat-label><mat-select [ngModel]="typeId" (ngModelChange)="typeId = $event; state.refresh()"><mat-option [value]="null">Any</mat-option>@for (t of typesShown(); track t.id) { <mat-option [value]="t.id">{{ t.name }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [ngModel]="status" (ngModelChange)="status = $event; state.refresh()"><mat-option [value]="''">Any</mat-option>@for (s of statuses; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Province</mat-label><mat-select [ngModel]="province" (ngModelChange)="province = $event; state.refresh()"><mat-option [value]="''">Any</mat-option>@for (p of provinces; track p) { <mat-option [value]="p">{{ p }}</mat-option> }</mat-select></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:150px"><mat-label>From</mat-label><input matInput type="date" [(ngModel)]="from" (change)="state.refresh()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:150px"><mat-label>To</mat-label><input matInput type="date" [(ngModel)]="to" (change)="state.refresh()"></mat-form-field>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:110px"><mat-label>User id</mat-label><input matInput type="number" [(ngModel)]="userId" (keyup.enter)="state.refresh()" (change)="state.refresh()"></mat-form-field>
  </div>
  <app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)" empty="No surveys match." />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel() ? sel()!.typeName + ' · ' + sel()!.shopName : ''" [subtitle]="sel() ? (sel()!.submittedAt | when:true) + ' · by ' + (sel()!.visitorName || sel()!.username || '?') + ' · cycle ' + sel()!.cycleKey : ''" width="min(860px, 96vw)">
    @if (sel(); as s) {
      <div>
        <div class="row" style="align-items:center">
          <span class="tag" [class.ok]="s.status==='REVIEWED'" [class.bad]="s.status==='REJECTED'" [class.warn]="s.status==='SUBMITTED'">{{ s.status }}</span>
          @if (s.maxScore) { <span class="tag info">score {{ s.score }} / {{ s.maxScore }}</span> }
          @if (s.distanceM != null) { <span class="tag" [class.ok]="s.distanceM <= 150" [class.warn]="s.distanceM > 150">{{ s.distanceM }} m from the pin</span> } @else { <span class="tag info">no GPS</span> }
          <span class="muted">shop ref {{ s.shopExternalRef || '—' }} · {{ s.province || '' }}</span>
          <span class="grow"></span>
          @if (auth.has('survey.review') && s.status === 'SUBMITTED') {
            <button mat-stroked-button color="warn" (click)="reject(s)"><mat-icon>block</mat-icon> Reject</button>
            <button mat-flat-button (click)="review(s)" [disabled]="s.userId === auth.user()?.id"><mat-icon>check</mat-icon> Mark reviewed</button>
          }
        </div>
        @if (s.reviewNote) { <p class="muted">{{ s.status === 'REJECTED' ? 'Rejected' : 'Reviewed' }} {{ s.reviewedAt | when:true }}: {{ s.reviewNote }}</p> }
        @for (sec of sections(); track sec) {
          <h2>{{ sec }}</h2>
          <div class="kv">
            @for (r of answers(); track r.q.code) {
              @if (r.section === sec) {
                <span>{{ r.q.label }}</span>
                <span>{{ r.value }}
                  @if (r.photos.length) { <div class="photos">@for (p of r.photos; track p) { @if (photos.url(p); as u) { <img [src]="u" alt="photo"> } @else { <div class="ph muted">…</div> } }</div> }
                </span>
              }
            }
          </div>
        }
        <h2>Where</h2>
        @if (s.lat && s.lng) { <div #map class="map"></div> } @else { <div class="muted">No GPS with this survey.</div> }
      </div>
    }
  </app-drawer>`,
  styles: [`
    .kv { display: grid; grid-template-columns: minmax(200px, 2fr) 3fr; gap: 6px 12px; font-size: 13px; } .kv > span:nth-child(odd) { color: var(--ink-3); }
    .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; } .photos img { width: 160px; height: 120px; object-fit: cover; border-radius: 6px; background: #0f172a; }
    .ph { width: 160px; height: 120px; display: grid; place-items: center; background: #f1f5f9; border-radius: 6px; }
    .map { height: 240px; border-radius: 8px; border: 1px solid var(--line); } .grow { flex: 1; }
  `],
})
export class SurveysPage implements OnDestroy {
  auth = inject(AuthService); photos = inject(Photos);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  private mapEl = viewChild<ElementRef<HTMLDivElement>>('map'); private route = inject(ActivatedRoute);
  statuses = STATUSES; provinces = PROVINCES; families = FAMILIES; familyLabel = familyLabel;
  typeId: number | null = null; family = ''; status = ''; province = ''; from = ''; to = ''; userId: number | null = null;
  rows = signal<SurveyView[]>([]); state = new ListState(() => this.load()); sel = signal<SurveyView | null>(null); types = signal<SurveyTypeView[]>([]);
  answers = signal<AnswerRow[]>([]); sections = signal<string[]>([]);
  private map?: L.Map;
  cols: Col[] = [{ key: 'id', label: '#' }, { key: 'submittedAt', label: 'Submitted', type: 'datetime' }, { key: 'typeFamily', label: 'Family', type: 'tag' }, { key: 'typeName', label: 'Type' }, { key: 'shopName', label: 'Shop' }, { key: 'province', label: 'Province' },
    { key: 'visitorName', label: 'By' }, { key: 'cycleKey', label: 'Cycle' }, { key: 'score', label: 'Score', type: 'qty' }, { key: 'maxScore', label: 'Max', type: 'qty' }, { key: 'distanceM', label: 'Dist m', type: 'qty' }, { key: 'status', label: 'Status', type: 'tag' }];

  constructor() {
    this.load();
    this.api.call(listSurveyTypes).subscribe(t => this.types.set(t));
    const id = Number(this.route.snapshot.queryParamMap.get('id')); if (id) this.open({ id } as SurveyView);
    effect(() => { const el = this.mapEl()?.nativeElement; const s = this.sel(); if (el && s?.lat && s?.lng) setTimeout(() => this.drawMap(el, s), 0); else { this.map?.remove(); this.map = undefined; } });
  }
  ngOnDestroy(): void { this.map?.remove(); }
  typesShown(): SurveyTypeView[] { return this.types().filter(t => !this.family || t.family === this.family); }
  load(): void {
    this.api.call(listSurveys, { typeId: this.typeId ?? undefined, family: this.family || undefined, status: this.status || undefined, province: this.province || undefined, from: this.from || undefined, to: this.to || undefined, userId: this.userId || undefined, ...this.state.params() })
      .subscribe(p => this.state.apply(p, r => this.rows.set(r)));
  }
  open(s: SurveyView): void {
    this.api.call(survey, { id: s.id! }).subscribe(d => { this.sel.set(d); const rows = answerRows(d); this.answers.set(rows); this.sections.set([...new Set(rows.map(r => r.section))]); });
  }
  private drawMap(el: HTMLDivElement, s: SurveyView): void {
    this.map?.remove();
    this.map = L.map(el, { center: [Number(s.lat), Number(s.lng)], zoom: 15 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    L.marker([Number(s.lat), Number(s.lng)]).bindTooltip('survey').addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 200);
  }
  private refresh(id: number): void { this.load(); this.open({ id } as SurveyView); }
  async review(s: SurveyView): Promise<void> {
    if (!(await this.dialogs.confirm(`Mark survey ${s.id} reviewed?`, `${s.typeName} at ${s.shopName}, score ${s.score ?? '—'} / ${s.maxScore ?? '—'}.`, 'Reviewed'))) return;
    this.api.call(reviewSurvey, { id: s.id!, body: { status: 'REVIEWED' } }).subscribe({ next: () => { this.toast.ok('Reviewed'); this.refresh(s.id!); }, error: e => this.toast.error(e) });
  }
  async reject(s: SurveyView): Promise<void> {
    const note = await this.dialogs.reason(`Reject survey ${s.id}?`, `${s.typeName} at ${s.shopName}. The shop's slot for this cycle is freed; the rep sees the reason.`, 'Reject', true); if (!note) return;
    this.api.call(reviewSurvey, { id: s.id!, body: { status: 'REJECTED', note } }).subscribe({ next: () => { this.toast.ok('Rejected'); this.refresh(s.id!); }, error: e => this.toast.error(e) });
  }
}
