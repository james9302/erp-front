import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const signedInGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  if (auth.signedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Route data `perm` (string or string[]): any of them opens the page. */
export const permGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const perm = route.data['perm'] as string | string[] | undefined;
  if (!perm) return true;
  const list = Array.isArray(perm) ? perm : [perm];
  if (auth.hasAny(...list)) return true;
  return inject(Router).createUrlTree(['/forbidden']);
};
