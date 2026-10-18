import { Component, HostListener, effect, input, output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Slide-over detail panel: the list keeps the whole width, the detail opens on top of it from the right and scrolls on
 * its own. Close with the button, Esc or a click outside. Focus is kept inside while open and returned when it closes.
 * Use instead of a side column, which does not fit a laptop.
 * `<app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel()?.name || ''">…</app-drawer>`
 */
@Component({
  selector: 'app-drawer',
  standalone: true,
  imports: [A11yModule, MatButtonModule, MatIconModule],
  template: `
  @if (open()) {
    <div class="scrim" (click)="close()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="title()" [style.width]="width()" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <header>
        <div class="t"><h2>{{ title() }}</h2>@if (subtitle()) { <div class="muted">{{ subtitle() }}</div> }</div>
        <button mat-icon-button (click)="close()" aria-label="Close"><mat-icon>close</mat-icon></button>
      </header>
      <div class="body"><ng-content /></div>
    </aside>
  }`,
  styles: [`
    .scrim { position: fixed; inset: 0; background: rgba(15, 23, 42, .25); z-index: 900; animation: fade .15s ease-out; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; max-width: 96vw; background: var(--surface); border-left: 1px solid var(--line); box-shadow: -12px 0 32px rgba(15, 23, 42, .18); z-index: 901; display: flex; flex-direction: column; animation: slide .2s ease-out; }
    header { display: flex; align-items: flex-start; gap: 10px; padding: 16px 16px 12px 22px; border-bottom: 1px solid var(--line); }
    .t { flex: 1; min-width: 0; } .t h2 { margin: 0; font-size: 16px; }
    .body { flex: 1; overflow: auto; padding: 16px 22px 24px; }
    .body h2:first-child { margin-top: 0; }
    @keyframes slide { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class Drawer {
  open = input(false);
  title = input('');
  subtitle = input('');
  width = input('min(580px, 96vw)');
  closed = output<void>();
  private returnTo: HTMLElement | null = null;
  constructor() {
    effect(() => {
      if (this.open()) { this.returnTo = document.activeElement as HTMLElement | null; }
      else if (this.returnTo) { const el = this.returnTo; this.returnTo = null; setTimeout(() => el.focus?.(), 0); }
    });
  }
  /** A Material dialog or select open above the drawer handles Esc first and marks the event; only an unhandled Esc closes the drawer. */
  @HostListener('document:keydown.escape', ['$event']) onEsc(e: Event): void { if (this.open() && !e.defaultPrevented) this.close(); }
  close(): void { this.closed.emit(); }
}
