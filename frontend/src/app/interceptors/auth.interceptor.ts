import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Clone request and add Authorization header if token exists
  if (token && !req.url.includes('/auth/login') && !req.url.includes('/auth/refresh')) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError(error => {
      // If 401 Unauthorized, try to refresh token (token expired/invalid)
      // Do NOT refresh on 403 Forbidden (user lacks permission - legitimate access denial)
      // Do NOT refresh on logout endpoint (prevents infinite loop)
      if (error.status === 401 && !req.url.includes('/auth/refresh') && !req.url.includes('/auth/login') && !req.url.includes('/auth/logout')) {
        return authService.refreshAccessToken().pipe(
          switchMap(() => {
            // Retry request with new token
            const newToken = authService.getAccessToken();
            const retryReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${newToken}`
              }
            });
            return next(retryReq);
          }),
          catchError(refreshError => {
            // Refresh failed, clear auth and redirect to login
            authService.clearAuthAndRedirect();
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
