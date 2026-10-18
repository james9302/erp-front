import { Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { PageHeader } from '../../shared/page-header';
import { Col } from '../../shared/table';
import { ApiClient } from '../../core/api';
import { audit } from '../../api/functions';
import { AuditResponse } from '../../api/models';

@Component({
  standalone: true, imports: [UI, PageHeader],
  template: `
  <app-page title="Audit log" subtitle="Every permission and role change, who did it and why." />
  <div class="toolbar"><mat-form-field appearance="outline"><mat-label>Action</mat-label><input matInput [(ngModel)]="action" (change)="page = 0; load()"></mat-form-field><span class="grow"></span><span class="muted">{{ total() }} entries</span>
    <button mat-button [disabled]="page===0" (click)="page = page - 1; load()">‹</button><button mat-button [disabled]="(page+1)*50 >= total()" (click)="page = page + 1; load()">›</button></div>
  <app-table [cols]="cols" [rows]="rows()" [paged]="false" />`,
})
export class AuditPage {
  private api = inject(ApiClient);
  action = ''; page = 0; rows = signal<AuditResponse[]>([]); total = signal(0);
  cols: Col[] = [{ key: 'at', label: 'When', type: 'datetime' }, { key: 'actor', label: 'Who' }, { key: 'action', label: 'Action', type: 'tag' }, { key: 'user', label: 'User' }, { key: 'role', label: 'Role' }, { key: 'permissionCode', label: 'Permission' }, { key: 'companyId', label: 'Company' }, { key: 'reason', label: 'Reason' }];
  constructor() { this.load(); }
  load(): void { this.api.call(audit, { action: this.action || undefined, page: this.page, size: 50 }).subscribe(p => { this.rows.set(p.items ?? []); this.total.set(p.total ?? 0); }); }
}
