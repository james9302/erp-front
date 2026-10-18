import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';
import { toProblem } from '../core/problem';

@Component({
  standalone: true,
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
  <div class="wrap">
    <mat-card class="card">
      <div class="brand"><span class="logo">SL</span><div><b>SIM Ledger</b><br><small>Stock, earnings and profit</small></div></div>
      <h2>Sign in</h2>
      <form (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full"><mat-label>Username</mat-label><input matInput [(ngModel)]="username" name="u" autocomplete="username" required></mat-form-field>
        <mat-form-field appearance="outline" class="full"><mat-label>Password</mat-label><input matInput type="password" [(ngModel)]="password" name="p" autocomplete="current-password" required></mat-form-field>
        <mat-form-field appearance="outline" class="full"><mat-label>Authenticator code (if enabled)</mat-label><input matInput [(ngModel)]="otp" name="o" inputmode="numeric"></mat-form-field>
        @if (error()) { <p class="err">{{ error() }}</p> }
        <button mat-flat-button color="primary" class="full" [disabled]="busy()">Sign in</button>
      </form>
      <p class="hint">Locked after 5 failed attempts. No self-registration: users are created by someone holding user.manage.</p>
    </mat-card>
  </div>`,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; background: #f3f5f7; }
    .card { width: 380px; padding: 28px; }
    .brand { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
    .logo { background: #0f766e; color: #fff; font-weight: 700; border-radius: 8px; width: 38px; height: 38px; display: grid; place-items: center; }
    .full { width: 100%; }
    .err { color: #b91c1c; }
    .hint { color: #6b7280; font-size: 12px; margin-top: 16px; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  username = ''; password = ''; otp = '';
  busy = signal(false); error = signal('');

  submit(): void {
    this.busy.set(true); this.error.set('');
    this.auth.login(this.username, this.password, this.otp).subscribe({
      next: () => this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('next') || '/'),
      error: e => { this.busy.set(false); const p = toProblem(e); this.error.set(p.detail); },
    });
  }
}
