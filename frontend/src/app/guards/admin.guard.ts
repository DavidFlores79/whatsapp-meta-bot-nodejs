import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs/operators';

/**
 * Admin Guard - Protects routes that require admin role
 *
 * Usage in routes:
 * {
 *   path: 'settings',
 *   component: SettingsComponent,
 *   canActivate: [adminGuard]
 * }
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentAgent$.pipe(
    take(1),
    map(agent => {
      // Check if user is authenticated and has admin role
      if (agent && agent.role === 'admin') {
        return true;
      }

      // Redirect to conversations page if not admin
      console.warn('Access denied: Admin role required');
      router.navigate(['/conversations']);
      return false;
    })
  );
};

/**
 * Supervisor or Admin Guard - Protects routes that require at least supervisor role
 *
 * Usage in routes:
 * {
 *   path: 'reports',
 *   component: ReportsComponent,
 *   canActivate: [supervisorGuard]
 * }
 */
export const supervisorGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentAgent$.pipe(
    take(1),
    map(agent => {
      // Check if user is authenticated and has supervisor or admin role
      if (agent && (agent.role === 'admin' || agent.role === 'supervisor')) {
        return true;
      }

      // Redirect to conversations page if not supervisor/admin
      console.warn('Access denied: Supervisor or Admin role required');
      router.navigate(['/conversations']);
      return false;
    })
  );
};
