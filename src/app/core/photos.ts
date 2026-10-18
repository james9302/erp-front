import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { ApiConfiguration } from '../api/api-configuration';

/**
 * Attachment images for <img>: `/attachments/{id}/file` needs the bearer token, which a plain <img> cannot send, so the
 * file is fetched through HttpClient once and served as an object URL. `url(id)` returns undefined until it is loaded.
 */
@Injectable({ providedIn: 'root' })
export class Photos {
  private http = inject(HttpClient);
  private config = inject(ApiConfiguration);
  private urls = signal<Record<number, string>>({});
  private pending = new Set<number>();

  url(id: number | null | undefined): string | undefined {
    if (!id) return undefined;
    const u = this.urls()[id];
    if (u || this.pending.has(id)) return u;
    this.pending.add(id);
    this.http.get(`${this.config.rootUrl}/api/v1/attachments/${id}/file`, { responseType: 'blob' }).subscribe({
      next: b => { this.urls.update(m => ({ ...m, [id]: URL.createObjectURL(b) })); this.pending.delete(id); },
      error: () => this.pending.delete(id),
    });
    return undefined;
  }
}
