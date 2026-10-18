import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';
import { Toast } from './problem';
import { ApiConfiguration } from '../api/api-configuration';
import { StrictHttpResponse } from '../api/strict-http-response';

type Fn<P, R> = (http: HttpClient, rootUrl: string, params: P, context?: HttpContext) => Observable<StrictHttpResponse<R>>;
type FnOpt<P, R> = (http: HttpClient, rootUrl: string, params?: P, context?: HttpContext) => Observable<StrictHttpResponse<R>>;

/** Calls a generated operation function and returns the body as an Observable: `api.call(deals, { active: true })`. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private http = inject(HttpClient);
  private config = inject(ApiConfiguration);
  private toast = inject(Toast);

  call<P, R>(fn: Fn<P, R>, params: P): Observable<R>;
  call<P, R>(fn: FnOpt<P, R>, params?: P): Observable<R>;
  call<P, R>(fn: Fn<P, R> | FnOpt<P, R>, params?: P): Observable<R> {
    return (fn as Fn<P, R>)(this.http, this.config.rootUrl, params as P).pipe(map(r => r.body));
  }

  /** A paged list's items as a promise for dialogs; an error shows a toast and resolves to an empty list instead of hanging. */
  items<P>(fn: Fn<P, any> | FnOpt<P, any>, params?: P): Promise<any[]> {
    return firstValueFrom(this.call(fn as Fn<P, any>, params as P).pipe(map(p => (p?.items ?? []) as any[]), catchError(e => { this.toast.error(e); return of([] as any[]); })));
  }
  /** An array endpoint as a promise, same error handling. */
  list<P>(fn: Fn<P, any> | FnOpt<P, any>, params?: P): Promise<any[]> {
    return firstValueFrom(this.call(fn as Fn<P, any>, params as P).pipe(map(a => (a ?? []) as any[]), catchError(e => { this.toast.error(e); return of([] as any[]); })));
  }

  /** For endpoints that return text (the payout CSV). */
  text(path: string): Observable<string> {
    return this.http.get(this.config.rootUrl + path, { responseType: 'text' });
  }
}
