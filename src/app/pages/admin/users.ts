import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { Dialogs, opt } from '../../shared/dialogs';
import { ApiClient } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { Toast } from '../../core/problem';
import { create, create1, grant, list, list1, permissions, resetPassword, revoke, setPermissions, status } from '../../api/functions';
import { PermissionResponse, RoleResponse, UserResponse } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Users, roles & permissions" subtitle="Permissions are fixed in code, one per capability. Roles are sets of permissions. A grant gives a user a role, for one company or all.">
    @if (auth.has('user.manage')) { <button mat-flat-button (click)="createUser()"><mat-icon>person_add</mat-icon> New user</button> }
    @if (auth.has('role.manage')) { <button mat-stroked-button (click)="createRole()"><mat-icon>add_moderator</mat-icon> New role</button> }
  </app-page>
  <mat-tab-group>
    <mat-tab label="Users">
      <div class="toolbar"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Search</mat-label><input matInput [(ngModel)]="q" (keyup.enter)="loadUsers()"></mat-form-field></div>
      <app-table [cols]="userCols" [rows]="users()" [filterable]="false" (pick)="sel.set($event)" />
      <app-drawer [open]="!!sel()" (closed)="sel.set(null)" [title]="sel()?.username || ''" [subtitle]="sel()?.email || ''">
          @if (sel(); as u) {
            <div>
              <div class="row" style="align-items:center"><span class="tag" [class.ok]="u.status==='ACTIVE'" [class.bad]="u.status!=='ACTIVE'">{{ u.status }}</span></div>
              <div class="muted" style="margin:6px 0 10px">{{ u.email || '' }} {{ u.mobile || '' }} · party {{ u.partyId || '—' }} · last login {{ u.lastLoginAt | when:true }}</div>
              @if (auth.has('user.manage')) { <div class="row"><button mat-stroked-button (click)="doGrant(u)"><mat-icon>add</mat-icon> Grant role</button><button mat-button (click)="pwd(u)">Reset password</button><button mat-button (click)="toggle(u)">{{ u.status === 'ACTIVE' ? 'Disable' : 'Enable' }}</button></div> }
              <h2>Grants</h2>
              @for (g of u.roles || []; track g.grantId) { <div class="row" style="align-items:center; padding:4px 0"><span class="tag ok">{{ g.roleCode }}</span><span class="muted">{{ g.companyId ? companies.code(g.companyId) : 'all companies' }} · {{ g.grantedAt | when }}</span><span class="grow"></span>@if (auth.has('user.manage')) { <button mat-icon-button (click)="drop(u, g.grantId!)" matTooltip="Revoke"><mat-icon>close</mat-icon></button> }</div> } @empty { <div class="muted">No roles granted.</div> }
            </div>
          }
      </app-drawer>
    </mat-tab>
    <mat-tab label="Roles">
      <app-table [cols]="roleCols" [rows]="roles()" [filterable]="false" (pick)="pickRole($event)" />
      <app-drawer [open]="!!role()" (closed)="role.set(null)" [title]="role() ? role()!.code + ' · ' + role()!.name : ''" [subtitle]="role()?.description || ''">
          @if (role(); as r) {
            <div>
              <div class="row" style="align-items:center">@if (r.system) { <span class="tag">system: every permission, not editable</span> }<span class="grow"></span>@if (auth.has('role.manage') && !r.system) { <button mat-flat-button (click)="savePerms(r)"><mat-icon>save</mat-icon> Save permissions</button> }</div>
              @for (m of modules(); track m) {
                <h2 style="font-size:12px; text-transform:uppercase; color:var(--ink-3)">{{ m }}</h2>
                <div class="perms">@for (p of perms(); track p.code) { @if (p.module === m) { <mat-checkbox [checked]="rolePerms.has(p.code!)" (change)="togglePerm(p.code!, $event.checked)" [disabled]="!auth.has('role.manage') || r.system" [matTooltip]="p.description || ''">{{ p.code }}</mat-checkbox> } }</div>
              }
            </div>
          }
      </app-drawer>
    </mat-tab>
  </mat-tab-group>`,
  styles: [`.perms { display: grid; grid-template-columns: 1fr 1fr; }`],
})
export class UsersPage {
  auth = inject(AuthService); companies = inject(CompanyService);
  private api = inject(ApiClient); private toast = inject(Toast); private dialogs = inject(Dialogs);
  q = ''; users = signal<UserResponse[]>([]); sel = signal<UserResponse | null>(null); roles = signal<RoleResponse[]>([]); role = signal<RoleResponse | null>(null); perms = signal<PermissionResponse[]>([]); modules = signal<string[]>([]);
  rolePerms = new Set<string>();
  userCols: Col[] = [{ key: 'username', label: 'User' }, { key: 'status', label: 'Status', type: 'tag' }, { key: 'email', label: 'Email' }, { key: 'partyId', label: 'Party' }, { key: 'lastLoginAt', label: 'Last login', type: 'datetime' }];
  roleCols: Col[] = [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'system', label: 'System', type: 'bool' }];
  constructor() { this.loadUsers(); this.loadRoles(); this.api.call(permissions).subscribe(p => { this.perms.set(p); this.modules.set(Array.from(new Set(p.map(x => x.module!)))); }); }
  loadUsers(): void { this.api.call(list, { q: this.q || undefined, size: 50 }).subscribe(p => { this.users.set(p.items ?? []); const id = this.sel()?.id; if (id) this.sel.set(p.items?.find(u => u.id === id) ?? null); }); }
  loadRoles(): void { this.api.call(list1, { size: 500 }).subscribe(r => this.roles.set(r.items ?? [])); }
  async doGrant(u: UserResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Grant a role to ' + u.username, submit: 'Grant', width: '480px', fields: [
      { key: 'roleId', label: 'Role', type: 'select', required: true, wide: true, options: this.roles().map(r => opt(r.id, `${r.code} · ${r.name}`)) },
      { key: 'companyId', label: 'Company (blank = all)', type: 'select', wide: true, options: this.companies.companies().map(c => opt(c.id, c.code!)) }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    this.api.call(grant, { id: u.id!, body: v }).subscribe({ next: () => { this.toast.ok('Granted'); this.loadUsers(); }, error: e => this.toast.error(e) });
  }
  async drop(u: UserResponse, grantId: number): Promise<void> {
    const reason = await this.dialogs.reason('Revoke this role?', undefined, 'Revoke', true); if (!reason) return;
    this.api.call(revoke, { id: u.id!, grantId, body: { reason } }).subscribe({ next: () => { this.toast.ok('Revoked'); this.loadUsers(); }, error: e => this.toast.error(e) });
  }
  async pwd(u: UserResponse): Promise<void> {
    const v = await this.dialogs.form({ title: 'Reset password for ' + u.username, submit: 'Reset', width: '440px', fields: [{ key: 'password', label: 'New password', type: 'password', required: true, wide: true }, { key: 'reason', label: 'Reason', wide: true }] }); if (!v) return;
    this.api.call(resetPassword, { id: u.id!, body: v }).subscribe({ next: () => this.toast.ok('Password reset'), error: e => this.toast.error(e) });
  }
  async toggle(u: UserResponse): Promise<void> {
    const to = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const reason = await this.dialogs.reason(`${to === 'ACTIVE' ? 'Enable' : 'Disable'} ${u.username}?`, undefined, to === 'ACTIVE' ? 'Enable' : 'Disable', to !== 'ACTIVE'); if (!reason) return;
    this.api.call(status, { id: u.id!, body: { status: to, reason } }).subscribe({ next: () => this.loadUsers(), error: e => this.toast.error(e) });
  }
  async createUser(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New user', submit: 'Create', fields: [{ key: 'username', label: 'Username', required: true }, { key: 'email', label: 'Email' }, { key: 'mobile', label: 'Mobile' },
      { key: 'partyId', label: 'Party id (rep app login)', type: 'number' }, { key: 'password', label: 'Initial password', type: 'password', required: true, wide: true }] }); if (!v) return;
    this.api.call(create, { body: v }).subscribe({ next: () => { this.toast.ok('User created'); this.loadUsers(); }, error: e => this.toast.error(e) });
  }
  async createRole(): Promise<void> {
    const v = await this.dialogs.form({ title: 'New role', submit: 'Create', width: '480px', fields: [{ key: 'code', label: 'Code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description', wide: true }] }); if (!v) return;
    this.api.call(create1, { body: { ...v, permissions: [] } }).subscribe({ next: () => { this.toast.ok('Role created'); this.loadRoles(); }, error: e => this.toast.error(e) });
  }
  pickRole(r: RoleResponse): void { this.role.set(r); this.rolePerms = new Set(r.permissions ?? []); }
  togglePerm(code: string, on: boolean): void { if (on) this.rolePerms.add(code); else this.rolePerms.delete(code); }
  savePerms(r: RoleResponse): void { this.api.call(setPermissions, { id: r.id!, body: { permissions: Array.from(this.rolePerms), reason: 'set in UI' } }).subscribe({ next: () => { this.toast.ok('Saved'); this.loadRoles(); }, error: e => this.toast.error(e) }); }
}
