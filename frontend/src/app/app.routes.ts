import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MainLayoutComponent } from './components/layout/main-layout/main-layout';
import { LoginComponent } from './components/auth/login/login';
import { CustomerListComponent } from './components/customers/customer-list/customer-list';
import { CustomerDetailComponent } from './components/customers/customer-detail/customer-detail';
import { CustomerFormComponent } from './components/customers/customer-form/customer-form';
import { TemplateListComponent } from './components/templates/template-list/template-list';
import { ReportsComponent } from './components/reports/reports';
import { SettingsComponent } from './components/settings/settings';
import { AgentListComponent } from './components/agents/agent-list/agent-list';
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

// Admin/Supervisor guard function
const adminGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
        return router.createUrlTree(['/login']);
    }

    if (authService.isAdminOrSupervisor()) {
        return true;
    }

    // Redirect to home if not admin/supervisor
    return router.createUrlTree(['/']);
};

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    {
        path: '',
        component: MainLayoutComponent,
        canActivate: [authGuard],
        children: [
            { path: 'customers', component: CustomerListComponent },
            { path: 'customers/new', component: CustomerFormComponent },
            { path: 'customers/:id', component: CustomerDetailComponent },
            { path: 'customers/:id/edit', component: CustomerFormComponent },
            { path: 'templates', component: TemplateListComponent },
            { path: 'agents', component: AgentListComponent, canActivate: [adminGuard] },
            { path: 'reports', component: ReportsComponent, canActivate: [adminGuard] },
            { path: 'settings', component: SettingsComponent }
        ]
    }
];
