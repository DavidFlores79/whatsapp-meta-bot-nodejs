import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AgentService, Agent } from '../../../services/agent';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast';
import { AgentModalComponent } from '../agent-modal/agent-modal';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-agent-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AgentModalComponent],
  templateUrl: './agent-list.html',
  styleUrls: ['./agent-list.css']
})
export class AgentListComponent implements OnInit, OnDestroy {
  agents: Agent[] = [];
  filteredAgents: Agent[] = [];
  loading = false;
  currentAgent: any = null;
  isAdmin = false;
  isSupervisor = false;

  // Filters
  searchTerm = '';
  statusFilter = 'all';
  roleFilter = 'all';
  isActiveFilter = 'all';

  // Modals
  showDeleteModal = false;
  agentToDelete: Agent | null = null;
  showAgentModal = false;
  selectedAgentId: string | null = null;

  private subscription = new Subscription();

  constructor(
    private agentService: AgentService,
    private authService: AuthService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Check current agent permissions
    this.subscription.add(
      this.authService.currentAgent$.subscribe(agent => {
        if (agent) {
          this.currentAgent = agent;
          this.isAdmin = agent.role === 'admin';
          this.isSupervisor = agent.role === 'supervisor';
        }
      })
    );

    // Load agents
    this.loadAgents();

    // Subscribe to agents updates
    this.subscription.add(
      this.agentService.agents$.subscribe(agents => {
        this.agents = agents;
        this.applyFilters();
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadAgents() {
    this.loading = true;
    console.log('[AgentList] Loading agents...');
    this.cdr.detectChanges();

    this.agentService.getAllAgents().subscribe({
      next: (response) => {
        console.log('[AgentList] Agents loaded successfully:', response);
        this.loading = false;
        console.log('[AgentList] Setting loading to false');
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[AgentList] Error loading agents:', error);
        console.error('[AgentList] Error status:', error.status);
        console.error('[AgentList] Error message:', error.message);
        this.toastService.error('Error loading agents: ' + (error.error?.error || error.message || 'Unknown error'));
        this.loading = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('[AgentList] Load agents request completed');
      }
    });
  }

  applyFilters() {
    let filtered = [...this.agents];

    // Search filter
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.firstName.toLowerCase().includes(search) ||
        agent.lastName.toLowerCase().includes(search) ||
        agent.email.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(agent => agent.status === this.statusFilter);
    }

    // Role filter
    if (this.roleFilter !== 'all') {
      filtered = filtered.filter(agent => agent.role === this.roleFilter);
    }

    // Active filter
    if (this.isActiveFilter !== 'all') {
      const isActive = this.isActiveFilter === 'active';
      filtered = filtered.filter(agent => agent.isActive === isActive);
    }

    this.filteredAgents = filtered;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onFilterChange() {
    this.applyFilters();
  }

  resetFilters() {
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.roleFilter = 'all';
    this.isActiveFilter = 'all';
    this.applyFilters();
  }

  createAgent() {
    this.selectedAgentId = null;
    this.showAgentModal = true;
  }

  editAgent(agent: Agent) {
    this.selectedAgentId = agent._id || null;
    this.showAgentModal = true;
  }

  viewAgent(agent: Agent) {
    this.selectedAgentId = agent._id || null;
    this.showAgentModal = true;
  }

  closeAgentModal() {
    this.showAgentModal = false;
    this.selectedAgentId = null;
  }

  onAgentSaved() {
    this.showAgentModal = false;
    this.selectedAgentId = null;
    this.loadAgents();
  }

  confirmDelete(agent: Agent) {
    this.agentToDelete = agent;
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
    this.agentToDelete = null;
  }

  deleteAgent() {
    if (!this.agentToDelete || !this.agentToDelete._id) return;

    this.agentService.deleteAgent(this.agentToDelete._id).subscribe({
      next: () => {
        this.toastService.success('Agent deactivated successfully');
        this.showDeleteModal = false;
        this.agentToDelete = null;
      },
      error: (error) => {
        console.error('Error deleting agent:', error);
        this.toastService.error('Error deleting agent');
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'online': 'bg-green-100 text-green-800',
      'offline': 'bg-gray-100 text-gray-800',
      'busy': 'bg-red-100 text-red-800',
      'away': 'bg-yellow-100 text-yellow-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }

  getRoleBadgeClass(role: string): string {
    const classes: { [key: string]: string } = {
      'admin': 'bg-purple-100 text-purple-800',
      'supervisor': 'bg-blue-100 text-blue-800',
      'agent': 'bg-gray-100 text-gray-800'
    };
    return classes[role] || 'bg-gray-100 text-gray-800';
  }

  canEditAgent(agent: Agent): boolean {
    if (!this.currentAgent) return false;

    // Admin can edit anyone
    if (this.isAdmin) return true;

    // Supervisor can edit agents only
    if (this.isSupervisor && agent.role === 'agent') return true;

    return false;
  }

  canDeleteAgent(agent: Agent): boolean {
    if (!this.currentAgent) return false;

    // Can't delete yourself
    if (agent._id === this.currentAgent._id) return false;

    // Only admin can delete
    return this.isAdmin;
  }
}
