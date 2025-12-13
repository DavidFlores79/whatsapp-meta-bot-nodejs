import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AgentService, Agent, CreateAgentRequest, UpdateAgentRequest } from '../../../services/agent';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-agent-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './agent-form.html',
  styleUrls: ['./agent-form.css']
})
export class AgentFormComponent implements OnInit {
  isEditMode = false;
  agentId: string | null = null;
  loading = false;
  saving = false;
  currentAgent: any = null;
  isAdmin = false;

  // Form data
  formData = {
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: 'agent' as 'admin' | 'supervisor' | 'agent',
    phoneNumber: '',
    maxConcurrentChats: 5,
    isActive: true,
    permissions: ['view_conversations'] as string[]
  };

  // Available permissions
  availablePermissions = [
    { value: 'view_conversations', label: 'agents.permissions.viewConversations' },
    { value: 'assign_conversations', label: 'agents.permissions.assignConversations' },
    { value: 'manage_agents', label: 'agents.permissions.manageAgents' },
    { value: 'view_analytics', label: 'agents.permissions.viewAnalytics' }
  ];

  // Validation errors
  errors: { [key: string]: string } = {};

  constructor(
    private agentService: AgentService,
    private authService: AuthService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // Check current agent permissions
    this.authService.currentAgent$.subscribe(agent => {
      if (agent) {
        this.currentAgent = agent;
        this.isAdmin = agent.role === 'admin';
      }
    });

    // Check if edit mode
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.agentId = params['id'];
        this.loadAgent();
      }
    });

    // Set default permissions based on role
    this.updatePermissionsForRole();
  }

  loadAgent() {
    if (!this.agentId) return;

    this.loading = true;
    this.agentService.getAgentById(this.agentId).subscribe({
      next: (response) => {
        const agent = response.agent;
        this.formData = {
          email: agent.email,
          password: '',
          confirmPassword: '',
          firstName: agent.firstName,
          lastName: agent.lastName,
          role: agent.role,
          phoneNumber: agent.phoneNumber || '',
          maxConcurrentChats: agent.maxConcurrentChats,
          isActive: agent.isActive,
          permissions: agent.permissions
        };
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading agent:', error);
        this.toastService.error('Error loading agent');
        this.loading = false;
        this.router.navigate(['/agents']);
      }
    });
  }

  onRoleChange() {
    this.updatePermissionsForRole();
  }

  updatePermissionsForRole() {
    switch (this.formData.role) {
      case 'admin':
        this.formData.permissions = [
          'view_conversations',
          'assign_conversations',
          'manage_agents',
          'view_analytics'
        ];
        break;
      case 'supervisor':
        this.formData.permissions = [
          'view_conversations',
          'assign_conversations',
          'view_analytics'
        ];
        break;
      case 'agent':
        this.formData.permissions = ['view_conversations'];
        break;
    }
  }

  togglePermission(permission: string) {
    const index = this.formData.permissions.indexOf(permission);
    if (index > -1) {
      this.formData.permissions.splice(index, 1);
    } else {
      this.formData.permissions.push(permission);
    }
  }

  hasPermission(permission: string): boolean {
    return this.formData.permissions.includes(permission);
  }

  validate(): boolean {
    this.errors = {};

    // Email validation
    if (!this.formData.email) {
      this.errors['email'] = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formData.email)) {
      this.errors['email'] = 'Invalid email format';
    }

    // Password validation (only for create mode or if changing password)
    if (!this.isEditMode) {
      if (!this.formData.password) {
        this.errors['password'] = 'Password is required';
      } else if (this.formData.password.length < 6) {
        this.errors['password'] = 'Password must be at least 6 characters';
      }

      if (this.formData.password !== this.formData.confirmPassword) {
        this.errors['confirmPassword'] = 'Passwords do not match';
      }
    } else if (this.formData.password) {
      // If changing password in edit mode
      if (this.formData.password.length < 6) {
        this.errors['password'] = 'Password must be at least 6 characters';
      }
      if (this.formData.password !== this.formData.confirmPassword) {
        this.errors['confirmPassword'] = 'Passwords do not match';
      }
    }

    // Name validation
    if (!this.formData.firstName) {
      this.errors['firstName'] = 'First name is required';
    }
    if (!this.formData.lastName) {
      this.errors['lastName'] = 'Last name is required';
    }

    // Max concurrent chats validation
    if (this.formData.maxConcurrentChats < 1 || this.formData.maxConcurrentChats > 50) {
      this.errors['maxConcurrentChats'] = 'Must be between 1 and 50';
    }

    return Object.keys(this.errors).length === 0;
  }

  onSubmit() {
    if (!this.validate()) {
      this.toastService.error('Please fix the validation errors');
      return;
    }

    this.saving = true;

    if (this.isEditMode) {
      this.updateAgent();
    } else {
      this.createAgent();
    }
  }

  createAgent() {
    const data: CreateAgentRequest = {
      email: this.formData.email,
      password: this.formData.password,
      firstName: this.formData.firstName,
      lastName: this.formData.lastName,
      role: this.formData.role,
      phoneNumber: this.formData.phoneNumber || undefined
    };

    this.agentService.createAgent(data).subscribe({
      next: () => {
        this.toastService.success('Agent created successfully');
        this.router.navigate(['/agents']);
      },
      error: (error) => {
        console.error('Error creating agent:', error);
        const message = error.error?.error || 'Error creating agent';
        this.toastService.error(message);
        this.saving = false;
      }
    });
  }

  updateAgent() {
    if (!this.agentId) return;

    const data: UpdateAgentRequest = {
      firstName: this.formData.firstName,
      lastName: this.formData.lastName,
      role: this.formData.role,
      isActive: this.formData.isActive,
      maxConcurrentChats: this.formData.maxConcurrentChats,
      permissions: this.formData.permissions
    };

    this.agentService.updateAgent(this.agentId, data).subscribe({
      next: () => {
        this.toastService.success('Agent updated successfully');
        this.router.navigate(['/agents']);
      },
      error: (error) => {
        console.error('Error updating agent:', error);
        const message = error.error?.error || 'Error updating agent';
        this.toastService.error(message);
        this.saving = false;
      }
    });
  }

  cancel() {
    this.router.navigate(['/agents']);
  }
}
