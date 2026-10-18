import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adds the bearer token; on 401 refreshes once and retries, else signs out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh') || req.url.includes('/auth/bootstrap');
  const withToken = (r: HttpRequest<unknown>) => {
    const t = auth.accessToken();
    return t && !isAuthCall ? r.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : r;
  };
  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isAuthCall && auth.refreshToken()) {
        return auth.refresh().pipe(
          switchMap(() => next(withToken(req))),
          catchError(e2 => { auth.logout(); return throwError(() => e2); }),
        );
      }
      if (err.status === 401 && !isAuthCall) auth.logout();
      return throwError(() => err);
    }),
  );
};
