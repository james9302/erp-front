import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { PROVINCES } from '../../shared/address-dialog';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Toast } from '../../core/problem';
import { createSurveyType, listSurveyTypes, setSurveyTypeRules, surveyType, updateSurveyType } from '../../api/functions';
import { SurveyForm, SurveyQuestion, SurveyRuleRequest, SurveySection, SurveyTypeView } from '../../api/models';

export const KINDS = ['TEXT', 'NUMBER', 'YESNO', 'CHOICE', 'MULTI', 'PHOTO', 'RATING'];
const CYCLES = ['MONTH', 'QUARTER', 'ONCE', 'FISCAL_WEEK', 'FISCAL_MONTH'];
/** The fixed families every type belongs to; dashboards, filters and the rep app's badge group by them. */
export const FAMILIES = ['RED_AUDIT', 'MYSTERY', 'PROMOTIONAL', 'COMPANY'];
export function familyLabel(f?: string | null): string { return ({ RED_AUDIT: 'Red audit', MYSTERY: 'Mystery shopper', PROMOTIONAL: 'Promotional', COMPANY: 'Company' } as Record<string, string>)[f ?? ''] ?? (f ?? ''); }
const BRANDINGS = ['CCBSA', 'SHOP'];
const CATEGORIES = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const SHOP_TYPES = ['SPAZA', 'RETAIL', 'WHOLESALE', 'FORECOURT', 'OTHER'];

type Rule = SurveyRuleRequest & { tradeClassText?: string };

/**
 * Survey types (docs/MIGRATION.md 4): a type is data, not code. Each has a cycle and a per-shop limit, a form of sections and
 * questions, and eligibility rules (OR-ed; within a rule every filled list must contain the shop's value).
 */
@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Survey types" subtitle="Red audits, mystery shopper and whatever comes next, defined here without a release. A shop may carry several types, but each type at most the limit per cycle, by anyone.">
    @if (auth.has('survey.manage')) { <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon> New survey type</button> }
  </app-page>
  <div class="toolbar">
    <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px"><mat-label>Family</mat-label><mat-select [ngModel]="family" (ngModelChange)="family = $event; load()"><mat-option [value]="''">Any</mat-option>@for (f of families; track f) { <mat-option [value]="f">{{ familyLabel(f) }}</mat-option> }</mat-select></mat-form-field>
    <mat-checkbox [(ngModel)]="activeOnly" (change)="load()">Active only</mat-checkbox>
  </div>
  <app-table [cols]="cols" [rows]="rows()" (pick)="open($event)" empty="No survey types yet." />
  <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel() ? sel()!.code + ' · ' + sel()!.name : ''" [subtitle]="sel()?.description || ''" width="min(900px, 96vw)">
    @if (sel(); as t) {
      <div>
        <div class="row" style="align-items:center">
          <span class="tag" [class.ok]="t.active" [class.bad]="!t.active">{{ t.active ? 'ACTIVE' : 'INACTIVE' }}</span>
          <span class="tag">{{ familyLabel(t.family) }}</span>
          <span class="tag info">{{ t.cycle }} · limit {{ t.limitPerCycle }}</span>
          @if (t.sponsor) { <span class="tag info">{{ t.sponsor }}</span> }
          @if (t.validFrom || t.validTo) { <span class="tag warn">{{ t.validFrom || '…' }} → {{ t.validTo || '…' }}</span> }
          <span class="muted">{{ t.surveyCount }} survey(s) submitted</span>
          <span class="grow"></span>
          @if (auth.has('survey.manage')) { <button mat-stroked-button (click)="edit(t)"><mat-icon>edit</mat-icon> Edit</button> }
        </div>
        <mat-tab-group style="margin-top:12px">
          <mat-tab label="Form ({{ questionCount() }})">
            <p class="muted">Sections and questions in the order the app shows them. Points are what a good answer earns (yes, the chosen option's points, rating × points / max). A photo prompt asks for photos with the answer.</p>
            @for (s of form().sections; track $index; let si = $index) {
              <div class="panel sec">
                <div class="row" style="align-items:center">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px"><mat-label>Section code</mat-label><input matInput [(ngModel)]="s.code" [disabled]="!canEdit()" (ngModelChange)="s.code = upper($event)"></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1"><mat-label>Title</mat-label><input matInput [(ngModel)]="s.title" [disabled]="!canEdit()"></mat-form-field>
                  @if (canEdit()) {
                    <button mat-icon-button (click)="move(form().sections, si, -1)" [disabled]="si === 0" matTooltip="Up"><mat-icon>arrow_upward</mat-icon></button>
                    <button mat-icon-button (click)="move(form().sections, si, 1)" [disabled]="si === form().sections.length - 1" matTooltip="Down"><mat-icon>arrow_downward</mat-icon></button>
                    <button mat-icon-button (click)="form().sections.splice(si, 1)" matTooltip="Remove section"><mat-icon>delete</mat-icon></button>
                  }
                </div>
                @for (q of s.questions; track $index; let qi = $index) {
                  <div class="q">
                    <div class="row" style="align-items:center">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:170px"><mat-label>Code</mat-label><input matInput [(ngModel)]="q.code" [disabled]="!canEdit()" (ngModelChange)="q.code = upper($event)"></mat-form-field>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:2"><mat-label>Question</mat-label><input matInput [(ngModel)]="q.label" [disabled]="!canEdit()"></mat-form-field>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px"><mat-label>Kind</mat-label><mat-select [(ngModel)]="q.kind" [disabled]="!canEdit()">@for (k of kinds; track k) { <mat-option [value]="k">{{ k }}</mat-option> }</mat-select></mat-form-field>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:80px"><mat-label>Points</mat-label><input matInput type="number" [(ngModel)]="q.points" [disabled]="!canEdit()"></mat-form-field>
                      <mat-checkbox [(ngModel)]="q.required" [disabled]="!canEdit()">Required</mat-checkbox>
                      @if (canEdit()) {
                        <button mat-icon-button (click)="move(s.questions, qi, -1)" [disabled]="qi === 0"><mat-icon>arrow_upward</mat-icon></button>
                        <button mat-icon-button (click)="move(s.questions, qi, 1)" [disabled]="qi === s.questions.length - 1"><mat-icon>arrow_downward</mat-icon></button>
                        <button mat-icon-button (click)="s.questions.splice(qi, 1)" matTooltip="Remove question"><mat-icon>close</mat-icon></button>
                      }
                    </div>
                    <div class="row" style="align-items:center">
                      @if (q.kind !== 'PHOTO') { <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1"><mat-label>Photo prompt (optional)</mat-label><input matInput [(ngModel)]="q.photoPrompt" [disabled]="!canEdit()" placeholder="Capture signage pictures"></mat-form-field> }
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1"><mat-label>Hint</mat-label><input matInput [(ngModel)]="q.hint" [disabled]="!canEdit()"></mat-form-field>
                      @if (q.kind === 'RATING') { <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:90px"><mat-label>Max</mat-label><input matInput type="number" [(ngModel)]="q.max" [disabled]="!canEdit()" placeholder="5"></mat-form-field> }
                      @if (q.kind === 'CHOICE' || q.kind === 'MULTI') {
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:2"><mat-label>Options, one per line: CODE = Label = points</mat-label><textarea matInput rows="3" [ngModel]="optionsText(q)" (ngModelChange)="setOptions(q, $event)" [disabled]="!canEdit()"></textarea></mat-form-field>
                      }
                    </div>
                  </div>
                }
                @if (canEdit()) { <button mat-button (click)="s.questions.push(newQuestion())"><mat-icon>add</mat-icon> Question</button> }
              </div>
            }
            @if (canEdit()) {
              <div class="row">
                <button mat-stroked-button (click)="form().sections.push({ code: 'S' + (form().sections.length + 1), title: 'New section', questions: [newQuestion()] })"><mat-icon>add</mat-icon> Section</button>
                <span class="grow"></span>
                <button mat-flat-button (click)="saveForm(t)"><mat-icon>save</mat-icon> Save form</button>
              </div>
            }
          </mat-tab>
          <mat-tab label="Rules ({{ rules().length }})">
            <p class="muted">Which shops this type applies to. Rules are OR-ed; within a rule every filled list must contain the shop's value (branding CCBSA / SHOP, category, trade class, shop type, province) and "requires the flag" needs the shop's survey-required flag. A type without rules applies to nobody.</p>
            @for (r of rules(); track $index; let ri = $index) {
              <div class="panel">
                <div class="row">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px"><mat-label>Branding</mat-label><mat-select [(ngModel)]="r.brandingTypes" multiple [disabled]="!canEdit()">@for (b of brandings; track b) { <mat-option [value]="b">{{ b }}</mat-option> }</mat-select></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:180px"><mat-label>Category</mat-label><mat-select [(ngModel)]="r.shopCategories" multiple [disabled]="!canEdit()">@for (c of categories; track c) { <mat-option [value]="c">{{ c }}</mat-option> }</mat-select></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px"><mat-label>Shop type</mat-label><mat-select [(ngModel)]="r.shopTypes" multiple [disabled]="!canEdit()">@for (s of shopTypes; track s) { <mat-option [value]="s">{{ s }}</mat-option> }</mat-select></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:220px"><mat-label>Province</mat-label><mat-select [(ngModel)]="r.provinces" multiple [disabled]="!canEdit()">@for (p of provinces; track p) { <mat-option [value]="p">{{ p }}</mat-option> }</mat-select></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1; min-width:200px"><mat-label>Trade classes, comma separated</mat-label><input matInput [(ngModel)]="r.tradeClassText" [disabled]="!canEdit()" placeholder="Local & Trade, Petroleum"></mat-form-field>
                  <mat-checkbox [(ngModel)]="r.requireFlag" [disabled]="!canEdit()">Requires the flag</mat-checkbox>
                  @if (canEdit()) { <button mat-icon-button (click)="rules().splice(ri, 1)" matTooltip="Remove rule"><mat-icon>delete</mat-icon></button> }
                </div>
              </div>
            }
            @if (!rules().length) { <div class="muted" style="margin:8px 0">No rules: no shop is eligible.</div> }
            @if (canEdit()) {
              <div class="row">
                <button mat-stroked-button (click)="rules().push({ requireFlag: false })"><mat-icon>add</mat-icon> Rule</button>
                <span class="grow"></span>
                <button mat-flat-button (click)="saveRules(t)"><mat-icon>save</mat-icon> Save rules</button>
              </div>
            }
          </mat-tab>
        </mat-tab-group>
      </div>
    }
  </app-drawer>`,
  styles: [`
    .grow { flex: 1; } .sec { margin-bottom: 12px; } .q { padding: 6px 8px; border-top: 1px dashed var(--line); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  `],
})
export class SurveyTypesPage {
  auth = inject(AuthService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  kinds = KINDS; brandings = BRANDINGS; categories = CATEGORIES; shopTypes = SHOP_TYPES; provinces = PROVINCES; families = FAMILIES; familyLabel = familyLabel;
  activeOnly = false; family = '';
  rows = signal<SurveyTypeView[]>([]); sel = signal<SurveyTypeView | null>(null);
  form = signal<{ sections: SurveySection[] }>({ sections: [] }); rules = signal<Rule[]>([]);
  cols: Col[] = [{ key: 'code', label: 'Code' }, { key: 'family', label: 'Family', type: 'tag' }, { key: 'name', label: 'Name' }, { key: 'sponsor', label: 'Sponsor' }, { key: 'cycle', label: 'Cycle', type: 'tag' }, { key: 'limitPerCycle', label: 'Limit', type: 'qty' },
    { key: 'questionCount', label: 'Questions', type: 'qty' }, { key: 'rules.length', label: 'Rules', type: 'qty' }, { key: 'surveyCount', label: 'Surveys', type: 'qty' }, { key: 'active', label: 'Active', type: 'bool' }];

  constructor() { this.load(); }
  load(): void { this.api.call(listSurveyTypes, { active: this.activeOnly || undefined, family: this.family || undefined }).subscribe(r => this.rows.set(r)); }
  canEdit(): boolean { return this.auth.has('survey.manage'); }
  upper(s: string): string { return (s || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_'); }
  questionCount(): number { return this.form().sections.reduce((n, s) => n + (s.questions?.length ?? 0), 0); }
  open(t: SurveyTypeView): void {
    this.api.call(surveyType, { id: t.id! }).subscribe(d => {
      this.sel.set(d);
      this.form.set(structuredClone({ sections: (d.form?.sections ?? []).map(s => ({ ...s, questions: s.questions ?? [] })) }));
      this.rules.set((d.rules ?? []).map(r => ({ brandingTypes: r.brandingTypes ?? [], shopCategories: r.shopCategories ?? [], shopTypes: r.shopTypes ?? [], provinces: r.provinces ?? [], tradeClasses: r.tradeClasses ?? [], tradeClassText: (r.tradeClasses ?? []).join(', '), requireFlag: !!r.requireFlag })));
    });
  }
  private reopen(id: number): void { this.load(); this.open({ id } as SurveyTypeView); }
  newQuestion(): SurveyQuestion { return { code: 'Q' + (this.questionCount() + 1), label: '', kind: 'YESNO', required: true, points: 0 }; }
  move<T>(a: T[], i: number, d: number): void { const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }
  optionsText(q: SurveyQuestion): string { return (q.options ?? []).map(o => `${o.code} = ${o.label}${o.points != null ? ' = ' + o.points : ''}`).join('\n'); }
  setOptions(q: SurveyQuestion, text: string): void {
    q.options = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const p = l.split('=').map(x => x.trim()); return { code: this.upper(p[0]), label: p[1] || p[0], points: p[2] !== undefined && p[2] !== '' ? Number(p[2]) : undefined }; });
  }
  private fields() {
    return [{ key: 'family', label: 'Family', type: 'select' as const, required: true, options: FAMILIES.map(f => opt(f, familyLabel(f))) },
      { key: 'code', label: 'Code (A-Z, 0-9, _)', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'sponsor', label: 'Sponsor (CCBSA, own)' },
      { key: 'cycle', label: 'Cycle', type: 'select' as const, required: true, options: CYCLES.map(c => opt(c, c)), hint: 'FISCAL_WEEK / FISCAL_MONTH take the cycle key from the fiscal calendar (Setup > Imports)' }, { key: 'limitPerCycle', label: 'Limit per shop per cycle', type: 'number' as const, required: true },
      { key: 'validFrom', label: 'Valid from (optional)', type: 'date' as const }, { key: 'validTo', label: 'Valid to (optional)', type: 'date' as const },
      { key: 'description', label: 'Description', wide: true }, { key: 'active', label: 'Active (listed in the app for eligible shops)', type: 'checkbox' as const, wide: true }];
  }
  private body(v: any, form: SurveyForm): any {
    return { code: this.upper(v.code), family: v.family, name: v.name, sponsor: v.sponsor || undefined, cycle: v.cycle, limitPerCycle: Number(v.limitPerCycle) || 1, validFrom: v.validFrom || undefined, validTo: v.validTo || undefined, description: v.description || undefined, active: !!v.active, form };
  }
  async create(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New survey type', subtitle: 'The questions and the rules are edited in the drawer afterwards.', fields: this.fields(), submit: 'Create', initial: { family: 'RED_AUDIT', cycle: 'MONTH', limitPerCycle: 1, active: false } }); if (!v) return;
    this.api.call(createSurveyType, { body: this.body(v, { sections: [{ code: 'S1', title: 'Section 1', questions: [] }] }) }).subscribe({ next: t => { this.toast.ok('Created'); this.reopen(t.id!); }, error: e => this.toast.error(e) });
  }
  async edit(t: SurveyTypeView): Promise<void> {
    const v = await this.dialogs.form({ title: 'Edit ' + t.code, fields: this.fields(), initial: t }); if (!v) return;
    this.api.call(updateSurveyType, { id: t.id!, body: this.body(v, t.form ?? { sections: [] }) }).subscribe({ next: () => { this.toast.ok('Saved'); this.reopen(t.id!); }, error: e => this.toast.error(e) });
  }
  saveForm(t: SurveyTypeView): void {
    const form: SurveyForm = { sections: this.form().sections.map(s => ({ code: s.code, title: s.title, questions: (s.questions ?? []).map(q => ({ ...q, points: q.points == null || (q.points as any) === '' ? 0 : Number(q.points), max: q.max ? Number(q.max) : undefined, photoPrompt: q.kind === 'PHOTO' ? undefined : (q.photoPrompt || undefined), hint: q.hint || undefined, options: q.kind === 'CHOICE' || q.kind === 'MULTI' ? q.options : undefined })) })) };
    this.api.call(updateSurveyType, { id: t.id!, body: this.body(t, form) }).subscribe({ next: () => { this.toast.ok('Form saved'); this.reopen(t.id!); }, error: e => this.toast.error(e) });
  }
  saveRules(t: SurveyTypeView): void {
    const rules: SurveyRuleRequest[] = this.rules().map(r => ({ brandingTypes: r.brandingTypes ?? [], shopCategories: r.shopCategories ?? [], shopTypes: r.shopTypes ?? [], provinces: r.provinces ?? [],
      tradeClasses: (r.tradeClassText || '').split(',').map(x => x.trim()).filter(Boolean), requireFlag: !!r.requireFlag }));
    this.api.call(setSurveyTypeRules, { id: t.id!, body: { rules } }).subscribe({ next: () => { this.toast.ok('Rules saved'); this.reopen(t.id!); }, error: e => this.toast.error(e) });
  }
}
