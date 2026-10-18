import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Title, subtitle, breadcrumb trail and an actions slot: `<app-page title="…" subtitle="…"><button …></app-page>`. */
@Component({
  selector: 'app-page',
  standalone: true,
  imports: [MatIconModule],
  template: `
  <header class="ph">
    <div class="ph-text">
      @if (crumbs().length) { <div class="crumbs">@for (c of crumbs(); track $index) { <span>{{ c }}</span>@if (!$last) { <mat-icon>chevron_right</mat-icon> } }</div> }
      <h1>{{ title() }}</h1>
      @if (subtitle()) { <p class="lead">{{ subtitle() }}</p> }
    </div>
    <div class="ph-actions"><ng-content /></div>
  </header>`,
  styles: [`
    .ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
    .ph .lead { margin-bottom: 0; }
    .crumbs { display: flex; align-items: center; gap: 2px; color: var(--ink-3); font-size: 12px; margin-bottom: 4px; }
    .crumbs mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .ph-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 4px; }
  `],
})
export class PageHeader {
  title = input.required<string>();
  subtitle = input('');
  crumbs = input<string[]>([]);
}
