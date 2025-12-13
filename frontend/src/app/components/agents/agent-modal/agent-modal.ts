import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AgentService, Agent, CreateAgentRequest, UpdateAgentRequest } from '../../../services/agent';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-agent-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './agent-modal.html',
  styleUrls: ['./agent-modal.css']
})
export class AgentModalComponent implements OnInit, OnChanges {
  @Input() show = false;
  @Input() agentId: string | null = null;
  @Input() isAdmin = false;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  isEditMode = false;
  loading = false;
  saving = false;

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
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Don't initialize here, wait for ngOnChanges
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('[AgentModal] ngOnChanges called', changes);

    // Only reinitialize when modal is opened (show changes from false to true)
    // or when agentId changes while modal is already open
    if (changes['show'] && changes['show'].currentValue === true) {
      console.log('[AgentModal] Modal opened, initializing...');
      this.initializeModal();
    } else if (changes['agentId'] && this.show && !changes['show']) {
      console.log('[AgentModal] AgentId changed while modal is open, reinitializing...');
      this.initializeModal();
    }
  }

  initializeModal() {
    console.log('[AgentModal] initializeModal called with agentId:', this.agentId, 'show:', this.show);
    this.errors = {};
    this.saving = false;

    if (this.agentId) {
      this.isEditMode = true;
      this.loadAgent();
    } else {
      this.isEditMode = false;
      this.resetForm();
    }
  }

  resetForm() {
    this.formData = {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      role: 'agent',
      phoneNumber: '',
      maxConcurrentChats: 5,
      isActive: true,
      permissions: ['view_conversations']
    };
    this.loading = false;
  }

  loadAgent() {
    if (!this.agentId) return;

    this.loading = true;
    console.log('[AgentModal] Loading agent with ID:', this.agentId);
    this.cdr.detectChanges();

    this.agentService.getAgentById(this.agentId).subscribe({
      next: (response) => {
        console.log('[AgentModal] Agent loaded successfully:', response);
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
        console.log('[AgentModal] Setting loading to false');
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[AgentModal] Error loading agent:', error);
        console.error('[AgentModal] Error status:', error.status);
        console.error('[AgentModal] Error message:', error.message);
        this.toastService.error('Error loading agent: ' + (error.error?.error || error.message || 'Unknown error'));
        this.loading = false;
        this.cdr.detectChanges();
        this.onClose();
      },
      complete: () => {
        console.log('[AgentModal] Load agent request completed');
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
        this.saved.emit();
        this.onClose();
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
        this.saved.emit();
        this.onClose();
      },
      error: (error) => {
        console.error('Error updating agent:', error);
        const message = error.error?.error || 'Error updating agent';
        this.toastService.error(message);
        this.saving = false;
      }
    });
  }

  onClose() {
    this.close.emit();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
  }
}
