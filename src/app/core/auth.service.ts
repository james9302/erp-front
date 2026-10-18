import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import { ApiClient } from './api';
import { login, logout, refresh } from '../api/functions';
import { MeResponse, TokenResponse } from '../api/models';

const ACCESS = 'sl.access';
const REFRESH = 'sl.refresh';
const USER = 'sl.user';

/** Who is signed in, their permissions and company scope; tokens live in localStorage. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiClient);
  private router = inject(Router);
  private refreshing: Observable<TokenResponse> | null = null;

  readonly user = signal<MeResponse | null>(read<MeResponse>(USER));
  readonly permissions = computed(() => new Set(this.user()?.permissions ?? []));
  readonly signedIn = computed(() => !!this.user() && !!this.accessToken());

  accessToken(): string | null { return localStorage.getItem(ACCESS); }
  refreshToken(): string | null { return localStorage.getItem(REFRESH); }

  has(perm: string): boolean { return this.permissions().has(perm); }
  hasAny(...perms: string[]): boolean { return perms.some(p => this.permissions().has(p)); }

  login(username: string, password: string, otp?: string): Observable<TokenResponse> {
    return this.api.call(login, { body: { username, password, otp: otp || undefined, device: 'web' } }).pipe(tap(t => this.store(t)));
  }

  /** One refresh at a time: concurrent 401s share the same in-flight call, since the refresh token rotates on use. */
  refresh(): Observable<TokenResponse> {
    if (!this.refreshing) {
      this.refreshing = this.api.call(refresh, { body: { refreshToken: this.refreshToken() ?? '' } }).pipe(
        tap(t => this.store(t)),
        finalize(() => { this.refreshing = null; }),
        shareReplay(1),
      );
    }
    return this.refreshing;
  }

  logout(): void {
    const rt = this.refreshToken();
    if (rt) this.api.call(logout, { body: { refreshToken: rt } }).subscribe({ error: () => {} });
    [ACCESS, REFRESH, USER, 'sl.company'].forEach(k => localStorage.removeItem(k));
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  private store(t: TokenResponse): void {
    if (t.accessToken) localStorage.setItem(ACCESS, t.accessToken);
    if (t.refreshToken) localStorage.setItem(REFRESH, t.refreshToken);
    if (t.user) { localStorage.setItem(USER, JSON.stringify(t.user)); this.user.set(t.user); }
  }
}

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
