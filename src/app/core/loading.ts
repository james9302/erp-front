import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

/** Counts in-flight requests so the shell can show a progress bar. */
@Injectable({ providedIn: 'root' })
export class LoadingState {
  private inFlight = signal(0);
  readonly busy = this.inFlight.asReadonly();
  start(): void { this.inFlight.update(n => n + 1); }
  stop(): void { this.inFlight.update(n => Math.max(0, n - 1)); }
}

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const state = inject(LoadingState);
  state.start();
  return next(req).pipe(finalize(() => state.stop()));
};
