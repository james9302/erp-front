import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { LoadingState } from '../core/loading';

interface NavItem { label: string; link: string; icon: string; perms: string[]; }
interface NavGroup { title: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  { title: 'Setup', items: [
    { label: 'Companies & warehouses', link: '/companies', icon: 'domain', perms: ['company.view'] },
    { label: 'Suppliers & accounts', link: '/suppliers', icon: 'local_shipping', perms: ['supplier.view'] },
    { label: 'Supplier terms', link: '/terms', icon: 'request_quote', perms: ['term.view'] },
    { label: 'Deals & rules', link: '/deals', icon: 'handshake', perms: ['deal.view'] },
    { label: 'Parties', link: '/parties', icon: 'account_tree', perms: ['party.view'] },
  ]},
  { title: 'Stock', items: [
    { label: 'Purchase orders', link: '/purchase-orders', icon: 'shopping_cart', perms: ['po.view'] },
    { label: 'Receiving', link: '/receiving', icon: 'inventory', perms: ['po.view', 'gr.receive'] },
    { label: 'Supplier invoices', link: '/invoices', icon: 'receipt_long', perms: ['invoice.capture', 'po.view'] },
    { label: 'Stock on hand', link: '/stock', icon: 'warehouse', perms: ['stock.view'] },
    { label: 'Allocate / hand over', link: '/handover', icon: 'swap_horiz', perms: ['stock.allocate', 'stock.handover_own'] },
    { label: 'SIM lookup', link: '/sim', icon: 'sim_card', perms: ['stock.view'] },
  ]},
  { title: 'Network & money', items: [
    { label: 'Network files', link: '/network-files', icon: 'cloud_upload', perms: ['files.view', 'files.import'] },
    { label: 'Earnings runs', link: '/earnings', icon: 'calculate', perms: ['earnings.view'] },
    { label: 'Rep accounts', link: '/accounts', icon: 'account_balance_wallet', perms: ['ledger.view'] },
    { label: 'Month-end statements', link: '/statements', icon: 'payments', perms: ['ledger.view'] },
  ]},
  { title: 'Field', items: [
    { label: 'Shops', link: '/shops', icon: 'storefront', perms: ['party.view', 'shop.visit'] },
    { label: 'Streets & areas', link: '/streets', icon: 'map', perms: ['party.view', 'shop.visit'] },
    { label: 'Route plans', link: '/route-plans', icon: 'alt_route', perms: ['route.view', 'route.plan'] },
    { label: 'Vehicles', link: '/vehicles', icon: 'local_shipping', perms: ['vehicle.manage', 'fuel.approve', 'route.view'] },
    { label: 'Fuel claims', link: '/fuel-claims', icon: 'local_gas_station', perms: ['fuel.approve', 'vehicle.manage'] },
  ]},
  { title: 'Dashboards', items: [
    { label: 'P&L', link: '/dash/pnl', icon: 'trending_up', perms: ['earnings.view'] },
    { label: 'Earnings & exceptions', link: '/dash/earnings', icon: 'leaderboard', perms: ['earnings.view'] },
    { label: 'Stock & files', link: '/dash/stock', icon: 'insights', perms: ['stock.view', 'files.view'] },
    { label: 'Field coverage', link: '/dash/coverage', icon: 'travel_explore', perms: ['party.view', 'route.view'] },
  ]},
  { title: 'Admin', items: [
    { label: 'Users & roles', link: '/users', icon: 'manage_accounts', perms: ['user.manage', 'role.manage'] },
    { label: 'Audit log', link: '/audit', icon: 'history', perms: ['audit.view'] },
  ]},
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MatIconModule, MatButtonModule, MatSelectModule, MatFormFieldModule, MatInputModule, MatMenuModule, MatTooltipModule, MatProgressBarModule],
  template: `
  <div class="layout" [class.collapsed]="collapsed()">
    <aside class="side">
      <div class="brand" routerLink="/"><span class="logo">SL</span><div class="brand-text"><b>SIM Ledger</b><small>stock · earnings · profit</small></div></div>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}" matTooltip="Home" matTooltipPosition="right" [matTooltipDisabled]="!collapsed()"><mat-icon>dashboard</mat-icon><span>Home</span></a>
        @for (g of groups(); track g.title) {
          <div class="group">{{ g.title }}</div>
          @for (i of g.items; track i.link) {
            <a [routerLink]="i.link" routerLinkActive="active" [matTooltip]="i.label" matTooltipPosition="right" [matTooltipDisabled]="!collapsed()"><mat-icon>{{ i.icon }}</mat-icon><span>{{ i.label }}</span></a>
          }
        }
      </nav>
      <button class="collapse" mat-icon-button (click)="toggle()" [matTooltip]="collapsed() ? 'Expand' : 'Collapse'"><mat-icon>{{ collapsed() ? 'chevron_right' : 'chevron_left' }}</mat-icon></button>
    </aside>
    <div class="main">
      <header class="top">
        <div class="search">
          <mat-icon>search</mat-icon>
          <input [(ngModel)]="q" (keyup.enter)="lookup()" placeholder="Look up an ICCID…" />
        </div>
        <span class="grow"></span>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="company">
          <mat-select [value]="companies.selectedId()" (valueChange)="companies.select($event)" placeholder="Company">
            <mat-option [value]="null">All companies</mat-option>
            @for (c of companies.companies(); track c.id) { <mat-option [value]="c.id">{{ c.code }} · {{ c.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <button mat-button class="user" [matMenuTriggerFor]="userMenu"><span class="avatar">{{ initials() }}</span>{{ auth.user()?.username }}<mat-icon>expand_more</mat-icon></button>
        <mat-menu #userMenu="matMenu">
          <button mat-menu-item disabled><mat-icon>verified_user</mat-icon>{{ auth.permissions().size }} permissions · {{ auth.user()?.allCompanies ? 'all companies' : (auth.user()?.companyIds?.length ?? 0) + ' companies' }}</button>
          <button mat-menu-item (click)="auth.logout()"><mat-icon>logout</mat-icon> Sign out</button>
        </mat-menu>
      </header>
      <mat-progress-bar mode="indeterminate" class="loading" [class.on]="loading.busy() > 0"></mat-progress-bar>
      <main class="content"><router-outlet /></main>
    </div>
  </div>`,
  styles: [`
    .layout { display: grid; grid-template-columns: 256px 1fr; min-height: 100vh; transition: grid-template-columns .2s; }
    .layout.collapsed { grid-template-columns: 68px 1fr; }
    .side { background: var(--sidebar); color: var(--sidebar-ink); display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow: hidden; min-width: 0; }
    .brand { display: flex; gap: 10px; align-items: center; padding: 18px 16px 12px; cursor: pointer; color: #fff; }
    .brand small { display: block; color: #64748b; font-size: 11px; }
    .logo { flex: none; background: linear-gradient(135deg, #06b6d4, #0e7490); color: #fff; font-weight: 800; border-radius: 10px; width: 36px; height: 36px; display: grid; place-items: center; letter-spacing: -.02em; }
    .collapsed .brand-text, .collapsed nav a span, .collapsed .group { display: none; }
    nav { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 10px; }
    nav a { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 9px; color: var(--sidebar-ink); text-decoration: none; font-size: 13px; font-weight: 500; margin: 2px 0; white-space: nowrap; }
    nav a mat-icon { font-size: 20px; width: 20px; height: 20px; color: #94a3b8; flex: none; }
    nav a:hover { background: rgba(255,255,255,.06); color: #fff; }
    nav a.active { background: var(--sidebar-active); color: #fff; box-shadow: inset 3px 0 0 #22d3ee; } nav a.active mat-icon { color: #22d3ee; }
    .group { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #64748b; padding: 14px 10px 4px; font-weight: 700; }
    .collapse { color: #94a3b8; margin: 6px auto 10px; }
    .main { min-width: 0; display: flex; flex-direction: column; }
    .top { position: sticky; top: 0; z-index: 5; background: rgba(255,255,255,.9); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 12px; padding: 8px 24px; height: 60px; }
    .search { display: flex; align-items: center; gap: 8px; background: #f1f5f9; border-radius: 10px; padding: 6px 12px; width: 360px; max-width: 40vw; color: var(--ink-3); }
    .search input { border: 0; background: transparent; outline: none; flex: 1; font: inherit; color: var(--ink); }
    .grow { flex: 1; }
    .company { width: 230px; font-size: 13px; }
    .user { display: flex; align-items: center; gap: 8px; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--brand); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
    .loading { position: sticky; top: 60px; z-index: 5; height: 3px; opacity: 0; transition: opacity .2s; } .loading.on { opacity: 1; }
    .content { padding: 22px 26px 40px; max-width: 1480px; width: 100%; }
  `],
})
export class Shell {
  auth = inject(AuthService);
  companies = inject(CompanyService);
  loading = inject(LoadingState);
  private router = inject(Router);
  collapsed = signal(localStorage.getItem('sl.nav') === 'collapsed');
  q = '';
  groups = computed(() => NAV.map(g => ({ ...g, items: g.items.filter(i => this.auth.hasAny(...i.perms)) })).filter(g => g.items.length));
  initials = computed(() => (this.auth.user()?.username ?? '?').slice(0, 2).toUpperCase());
  constructor() { this.companies.load(); }
  toggle(): void { this.collapsed.update(v => !v); localStorage.setItem('sl.nav', this.collapsed() ? 'collapsed' : 'open'); }
  lookup(): void { const s = this.q.replace(/[^0-9]/g, ''); if (s.length >= 18) { this.router.navigate(['/sim', s]); this.q = ''; } }
}
