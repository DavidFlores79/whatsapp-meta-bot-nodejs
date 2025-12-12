import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MainLayoutComponent } from './components/layout/main-layout/main-layout';
import { LoginComponent } from './components/auth/login/login';
import { CustomerListComponent } from './components/customers/customer-list/customer-list';
import { CustomerDetailComponent } from './components/customers/customer-detail/customer-detail';
import { CustomerFormComponent } from './components/customers/customer-form/customer-form';
import { AuthService } from './services/auth';

// Auth guard function
const authGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    }

    return router.createUrlTree(['/login']);
};

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: '', component: MainLayoutComponent, canActivate: [authGuard] },
    { path: 'customers', component: CustomerListComponent, canActivate: [authGuard] },
    { path: 'customers/new', component: CustomerFormComponent, canActivate: [authGuard] },
    { path: 'customers/:id', component: CustomerDetailComponent, canActivate: [authGuard] },
    { path: 'customers/:id/edit', component: CustomerFormComponent, canActivate: [authGuard] }
];
