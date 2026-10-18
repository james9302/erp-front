import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** RFC 7807 problem detail as the backend sends it, with the stable `code` the UI switches on. */
export interface Problem { status: number; code: string; detail: string; field?: string; [k: string]: unknown; }

export function toProblem(err: unknown): Problem {
  if (err instanceof HttpErrorResponse) {
    const body = (err.error && typeof err.error === 'object') ? err.error as Record<string, unknown> : {};
    return {
      status: err.status,
      code: String(body['code'] ?? (err.status === 0 ? 'OFFLINE' : 'HTTP_' + err.status)),
      detail: String(body['detail'] ?? (err.status === 0 ? 'the server cannot be reached' : err.message)),
      field: body['field'] as string | undefined,
      ...body,
    };
  }
  return { status: 0, code: 'ERROR', detail: String(err) };
}

@Injectable({ providedIn: 'root' })
export class Toast {
  private snack = inject(MatSnackBar);
  ok(msg: string): void { this.snack.open(msg, 'OK', { duration: 3500 }); }
  error(err: unknown): Problem {
    const p = toProblem(err);
    this.snack.open(`${p.detail} [${p.code}]`, 'Close', { duration: 8000, panelClass: 'snack-error' });
    return p;
  }
}
