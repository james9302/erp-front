import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MonthPipe, QtyPipe, RandPipe, WhenPipe } from '../core/pipes';
import { ListState } from '../core/list-state';

export type ColType = 'text' | 'rand' | 'signed' | 'qty' | 'date' | 'datetime' | 'month' | 'tag' | 'tags' | 'bool' | 'pct';
export interface Col { key: string; label: string; type?: ColType; width?: string; }

/**
 * Column-driven table. Client mode (default): sort by clicking a header, quick filter and paging over the rows given.
 * Server mode: pass `[server]="state"` (a ListState) and the table drives the server's page, sort and q instead:
 * `<app-table [cols]="cols" [rows]="rows()" [server]="state" (pick)="open($event)">`.
 */
@Component({
  selector: 'app-table',
  standalone: true,
  imports: [FormsModule, MatTableModule, MatIconModule, MatButtonModule, RandPipe, QtyPipe, WhenPipe, MonthPipe],
  template: `
  @if (rows().length === 0 && !(server()?.q())) { <div class="empty"><mat-icon>inbox</mat-icon><div>{{ empty() }}</div></div> }
  @else {
  <div class="tbl">
    @if (filterable() && (server() || rows().length > 5)) {
      <div class="tools">
        <div class="filter"><mat-icon>filter_list</mat-icon>
          @if (server(); as s) { <input [ngModel]="s.q()" (ngModelChange)="pendingQ = $event" (keyup.enter)="s.setQ(pendingQ)" (blur)="pendingQ !== s.q() && s.setQ(pendingQ)" placeholder="Search… (Enter)"> }
          @else { <input [ngModel]="filter()" (ngModelChange)="filter.set($event); page.set(0)" placeholder="Filter rows…"> }
        </div>
        <span class="muted">{{ server() ? (server()!.total() | qty) + ' rows' : visible().length + ' of ' + rows().length }}</span>
      </div>
    }
    @if (rows().length === 0) { <div class="empty">No rows match.</div> }
    <div class="scroll">
    <table mat-table [dataSource]="pageRows()">
      @for (c of cols(); track c.key) {
        <ng-container [matColumnDef]="c.key">
          <th mat-header-cell *matHeaderCellDef [class.num]="isNum(c)" [style.width]="c.width" (click)="sortBy(c.key)" class="sortable">
            {{ c.label }} @if (activeSort() === c.key) { <mat-icon class="sort-ico">{{ activeDesc() ? 'arrow_downward' : 'arrow_upward' }}</mat-icon> }
          </th>
          <td mat-cell *matCellDef="let r" [class.num]="isNum(c)">
            @switch (c.type) {
              @case ('rand') { {{ get(r, c.key) | rand }} }
              @case ('signed') { <span [class.pos]="num(r, c.key) > 0" [class.neg]="num(r, c.key) < 0">{{ get(r, c.key) | rand }}</span> }
              @case ('qty') { {{ get(r, c.key) | qty }} }
              @case ('pct') { {{ get(r, c.key) == null ? '' : get(r, c.key) + ' %' }} }
              @case ('date') { {{ get(r, c.key) | when }} }
              @case ('datetime') { {{ get(r, c.key) | when:true }} }
              @case ('month') { {{ get(r, c.key) | month }} }
              @case ('bool') { @if (get(r, c.key)) { <mat-icon class="yes">check_circle</mat-icon> } @else { <span class="muted">—</span> } }
              @case ('tag') { @if (get(r, c.key)) { <span class="tag" [class]="'tag ' + tagClass(get(r, c.key))">{{ get(r, c.key) }}</span> } }
              @case ('tags') { @for (t of (get(r, c.key) || []); track t) { <span class="tag" [class]="'tag ' + tagClass(t)">{{ t }}</span> } }
              @default { {{ get(r, c.key) }} }
            }
          </td>
        </ng-container>
      }
      <tr mat-header-row *matHeaderRowDef="keys(); sticky: true"></tr>
      <tr mat-row *matRowDef="let r; columns: keys()" [class.clickable]="clickable()" (click)="clickable() && pick.emit(r)"></tr>
    </table>
    </div>
    @if (server(); as s) {
      @if (s.total() > s.size()) {
        <div class="pager">
          <span class="muted">{{ s.page() * s.size() + 1 }}–{{ min((s.page() + 1) * s.size(), s.total()) }} of {{ s.total() | qty }}</span>
          <button mat-icon-button [disabled]="s.page() === 0" (click)="s.setPage(s.page() - 1)"><mat-icon>chevron_left</mat-icon></button>
          <button mat-icon-button [disabled]="(s.page() + 1) * s.size() >= s.total()" (click)="s.setPage(s.page() + 1)"><mat-icon>chevron_right</mat-icon></button>
        </div>
      }
    } @else if (paged() && visible().length > pageSize()) {
      <div class="pager">
        <span class="muted">{{ page() * pageSize() + 1 }}–{{ min((page() + 1) * pageSize(), visible().length) }} of {{ visible().length }}</span>
        <button mat-icon-button [disabled]="page() === 0" (click)="page.set(page() - 1)"><mat-icon>chevron_left</mat-icon></button>
        <button mat-icon-button [disabled]="(page() + 1) * pageSize() >= visible().length" (click)="page.set(page() + 1)"><mat-icon>chevron_right</mat-icon></button>
      </div>
    }
  </div>
  }`,
  styles: [`
    .tbl { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); box-shadow: var(--shadow); }
    .scroll { overflow-x: auto; }
    .tools { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--line); background: #fff; }
    .filter { display: flex; align-items: center; gap: 6px; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; color: var(--ink-3); flex: 1; max-width: 320px; }
    .filter input { border: 0; background: transparent; outline: none; flex: 1; font: inherit; color: var(--ink); }
    .filter mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .sortable { cursor: pointer; user-select: none; } .sort-ico { font-size: 14px; width: 14px; height: 14px; vertical-align: middle; }
    .yes { color: var(--ok); font-size: 18px; width: 18px; height: 18px; }
    .pager { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--line); }
    .empty mat-icon { font-size: 30px; width: 30px; height: 30px; color: #cbd5e1; margin-bottom: 4px; }
    .tbl .empty { border: 0; box-shadow: none; }
  `],
})
export class TableComponent {
  cols = input.required<Col[]>();
  rows = input.required<any[]>();
  empty = input('Nothing to show.');
  clickable = input(true);
  filterable = input(true);
  paged = input(true);
  pageSize = input(25);
  server = input<ListState | null>(null);
  pick = output<any>();
  keys = computed(() => this.cols().map(c => c.key));
  filter = signal(''); sortKey = signal<string | null>(null); sortDir = signal<1 | -1>(1);
  page = linkedSignal({ source: this.rows, computation: () => 0 });   // back to the first page whenever the rows change
  pendingQ = '';
  visible = computed(() => {
    if (this.server()) return this.rows();
    const f = this.filter().trim().toLowerCase();
    let rows = f ? this.rows().filter(r => this.cols().some(c => String(this.get(r, c.key) ?? '').toLowerCase().includes(f))) : [...this.rows()];
    const k = this.sortKey();
    if (k) { const d = this.sortDir(); rows.sort((a, b) => { const x = this.get(a, k), y = this.get(b, k); if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * d; }); }
    return rows;
  });
  pageRows = computed(() => this.server() || !this.paged() ? this.visible() : this.visible().slice(this.page() * this.pageSize(), (this.page() + 1) * this.pageSize()));
  activeSort = computed(() => this.server() ? this.server()!.sortKey() : this.sortKey());
  activeDesc = computed(() => this.server() ? this.server()!.sortDesc() : this.sortDir() === -1);
  min = Math.min;

  sortBy(key: string): void {
    const s = this.server();
    if (s) { s.sortBy(key); return; }
    if (this.sortKey() === key) { if (this.sortDir() === 1) this.sortDir.set(-1); else { this.sortKey.set(null); this.sortDir.set(1); } } else { this.sortKey.set(key); this.sortDir.set(1); }
  }
  get(r: any, key: string): any { return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), r); }
  num(r: any, key: string): number { return Number(this.get(r, key) ?? 0); }
  isNum(c: Col): boolean { return ['rand', 'signed', 'qty', 'pct'].includes(c.type ?? ''); }
  tagClass(v: string): string {
    const s = String(v).toUpperCase();
    if (/DONE|APPROVED|PUBLISHED|PAID|CLOSED|CONFIRMED|RECEIVED|ACTIVE|OK|IN_WAREHOUSE|MATCHED|IN_CREDIT|ACTIVATION/.test(s)) return 'ok';
    if (/FAILED|REVERSED|CANCELLED|OVER_LIMIT|SHORTFALL|BAD|WRITTEN_OFF|LOST|DISPUTED|NO_BANK|QUARANTINE|UNKNOWN/.test(s)) return 'bad';
    if (/RUNNING|DRAFT|OPEN|PENDING|NEAR_LIMIT|LOAN|PAY_CHANGED|RETURNED_CHECK|PACKED|PARTIAL|SUBMITTED|RECHARGE/.test(s)) return 'warn';
    return 'info';
  }
}
