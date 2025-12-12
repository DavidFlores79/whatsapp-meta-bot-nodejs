import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private translate = inject(TranslateService);

  email = '';
  password = '';
  error = '';
  loading = false;

  login() {
    if (!this.email || !this.password) {
      this.error = this.translate.instant('auth.emailRequired') + ' / ' + this.translate.instant('auth.passwordRequired');
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error = err.error?.error || this.translate.instant('auth.loginError');
        this.loading = false;
      }
    });
  }
}
