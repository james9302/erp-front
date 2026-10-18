import { Component, Injectable, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

export interface Option { value: any; label: string; }
export interface Field {
  key: string; label: string;
  type?: 'text' | 'number' | 'date' | 'month' | 'select' | 'checkbox' | 'textarea' | 'password';
  options?: Option[]; required?: boolean; hint?: string; step?: number; wide?: boolean; placeholder?: string; multiple?: boolean;
  /** Shown only when this predicate on the current values is true. */
  when?: (v: any) => boolean;
}
export interface LineGroup { key: string; label: string; fields: Field[]; min?: number; }
export interface FormSpec { title: string; subtitle?: string; fields: Field[]; lines?: LineGroup; submit?: string; initial?: any; width?: string; }

/** Field-spec driven dialog: the result is the values object, or null when cancelled. */
@Component({
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule],
  template: `
  <h2 mat-dialog-title>{{ spec.title }}</h2>
  <mat-dialog-content>
    @if (spec.subtitle) { <p class="muted" style="margin-top:0">{{ spec.subtitle }}</p> }
    <div class="fields">
      @for (f of spec.fields; track f.key) {
        @if (!f.when || f.when(v)) {
          @switch (f.type) {
            @case ('checkbox') { <mat-checkbox [(ngModel)]="v[f.key]" class="cb" [class.wide]="f.wide">{{ f.label }}</mat-checkbox> }
            @case ('select') {
              <mat-form-field appearance="outline" [class.wide]="f.wide"><mat-label>{{ f.label }}</mat-label>
                <mat-select [(ngModel)]="v[f.key]" [required]="!!f.required" [multiple]="!!f.multiple">@if (!f.required && !f.multiple) { <mat-option [value]="undefined">—</mat-option> }@for (o of f.options || []; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }</mat-select>
                @if (f.hint) { <mat-hint>{{ f.hint }}</mat-hint> }
              </mat-form-field>
            }
            @case ('textarea') { <mat-form-field appearance="outline" class="wide"><mat-label>{{ f.label }}</mat-label><textarea matInput rows="4" [(ngModel)]="v[f.key]" [placeholder]="f.placeholder || ''"></textarea>@if (f.hint) { <mat-hint>{{ f.hint }}</mat-hint> }</mat-form-field> }
            @default {
              <mat-form-field appearance="outline" [class.wide]="f.wide"><mat-label>{{ f.label }}</mat-label>
                <input matInput [type]="inputType(f)" [step]="f.step || null" [(ngModel)]="v[f.key]" [required]="!!f.required" [placeholder]="f.placeholder || (f.type === 'month' ? 'yyyy-MM' : '')">
                @if (f.hint) { <mat-hint>{{ f.hint }}</mat-hint> }
              </mat-form-field>
            }
          }
        }
      }
    </div>
    @if (spec.lines; as g) {
      <h3>{{ g.label }}</h3>
      @for (row of v[g.key]; track $index) {
        <div class="line">
          @for (f of g.fields; track f.key) {
            @if (f.type === 'select') {
              <mat-form-field appearance="outline" [class.wide]="f.wide"><mat-label>{{ f.label }}</mat-label><mat-select [(ngModel)]="row[f.key]">@for (o of f.options || []; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }</mat-select></mat-form-field>
            } @else {
              <mat-form-field appearance="outline" [class.wide]="f.wide"><mat-label>{{ f.label }}</mat-label><input matInput [type]="inputType(f)" [step]="f.step || null" [(ngModel)]="row[f.key]"></mat-form-field>
            }
          }
          <button mat-icon-button (click)="v[g.key].splice($index, 1)" [disabled]="v[g.key].length <= (g.min ?? 1)"><mat-icon>delete</mat-icon></button>
        </div>
      }
      <button mat-button (click)="v[g.key].push({})"><mat-icon>add</mat-icon> Add line</button>
    }
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-flat-button [disabled]="!valid()" (click)="ref.close(v)">{{ spec.submit || 'Save' }}</button>
  </mat-dialog-actions>`,
  styles: [`
    .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 12px; padding-top: 6px; }
    @media (max-width: 640px) { .fields { grid-template-columns: minmax(0, 1fr); } }
    .wide { grid-column: 1 / -1; }
    .cb { align-self: center; padding-bottom: 14px; }
    .line { display: flex; gap: 8px; align-items: center; } .line mat-form-field { flex: 1; min-width: 120px; }
    h3 { font-size: 13px; font-weight: 700; margin: 10px 0 6px; }
    mat-dialog-content { width: 100%; }
  `],
})
export class FormDialog {
  spec: FormSpec = inject(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<FormDialog>);
  v: any = { ...(this.spec.initial ?? {}) };
  constructor() { if (this.spec.lines && !Array.isArray(this.v[this.spec.lines.key])) this.v[this.spec.lines.key] = [{}]; }
  inputType(f: Field): string { return f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'; }
  valid(): boolean { return this.spec.fields.every(f => (f.when && !f.when(this.v)) || !f.required || (this.v[f.key] !== undefined && this.v[f.key] !== null && this.v[f.key] !== '' && !(Array.isArray(this.v[f.key]) && this.v[f.key].length === 0))); }
}

@Component({
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
  <h2 mat-dialog-title>{{ d.title }}</h2>
  <mat-dialog-content>
    @if (d.message) { <p>{{ d.message }}</p> }
    @if (d.reason) { <mat-form-field appearance="outline" style="width:100%"><mat-label>{{ d.reasonLabel || 'Reason' }}</mat-label><input matInput [(ngModel)]="reason" cdkFocusInitial></mat-form-field> }
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button mat-dialog-close>Cancel</button>
    <button mat-flat-button [color]="d.danger ? 'warn' : undefined" [disabled]="d.reason && !reason.trim()" (click)="ref.close(d.reason ? reason.trim() : true)">{{ d.ok || 'Confirm' }}</button>
  </mat-dialog-actions>`,
})
export class ConfirmDialog {
  d: { title: string; message?: string; ok?: string; danger?: boolean; reason?: boolean; reasonLabel?: string } = inject(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ConfirmDialog>);
  reason = '';
}

/** `const v = await dialogs.form({...}); if (!v) return;` */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private dialog = inject(MatDialog);
  form<T = any>(spec: FormSpec): Promise<T | null> {
    return firstValueFrom(this.dialog.open(FormDialog, { data: spec, width: spec.width ?? '720px', maxWidth: '94vw', autoFocus: 'first-tabbable' }).afterClosed()).then(v => v ?? null);
  }
  confirm(title: string, message?: string, ok = 'Confirm', danger = false): Promise<boolean> {
    return firstValueFrom(this.dialog.open(ConfirmDialog, { data: { title, message, ok, danger }, width: '440px', maxWidth: '94vw' }).afterClosed()).then(v => !!v);
  }
  reason(title: string, message?: string, ok = 'Confirm', danger = false): Promise<string | null> {
    return firstValueFrom(this.dialog.open(ConfirmDialog, { data: { title, message, ok, danger, reason: true }, width: '480px', maxWidth: '94vw' }).afterClosed()).then(v => (typeof v === 'string' ? v : null));
  }
}

export const opt = (value: any, label: string): Option => ({ value, label });
