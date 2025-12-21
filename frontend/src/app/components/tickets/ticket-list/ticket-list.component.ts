import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TicketService, Ticket, TicketFilters } from '../../../services/ticket';
import { ConfigurationService, TicketCategory } from '../../../services/configuration';
import { AgentService } from '../../../services/agent';
import { ToastService } from '../../../services/toast';
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TicketStatusBadgeComponent],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.css']
})
export class TicketListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tickets: Ticket[] = [];
  loading = false;
  error: string | null = null;

  // Expose Math for template
  Math = Math;

  // Filters
  searchTerm = '';
  selectedStatuses: string[] = [];
  selectedCategories: string[] = [];
  selectedPriorities: string[] = [];
  selectedAgent = '';
  showEscalated = false;
  showFilters = false;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalTickets = 0;
  totalPages = 0;

  // Sort
  sortBy: 'createdAt' | 'priority' | 'status' = 'createdAt';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Filter options
  availableStatuses = ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed'];
  availablePriorities = ['low', 'medium', 'high', 'urgent'];
  availableCategories: TicketCategory[] = [];
  availableAgents: any[] = [];

  // Statistics
  stats = {
    total: 0,
    new: 0,
    inProgress: 0,
    resolved: 0,
    escalated: 0
  };

  // Search subject for debouncing
  private searchSubject = new Subject<string>();

  constructor(
    private ticketService: TicketService,
    private configService: ConfigurationService,
    private agentService: AgentService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadCategories();
    this.loadAgents();
    this.loadTickets();
    this.loadStatistics();
    this.setupRealtimeUpdates();
    this.setupSearchDebounce();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load ticket categories from configuration
   */
  loadCategories() {
    this.configService.categories$
      .pipe(takeUntil(this.destroy$))
      .subscribe(categories => {
        this.availableCategories = categories;
      });
  }

  /**
   * Load agents for filter dropdown
   */
  loadAgents() {
    this.agentService.getAllAgents()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (agents: any) => {
          this.availableAgents = agents;
        },
        error: (err: any) => {
          console.error('Error loading agents:', err);
        }
      });
  }

  /**
   * Setup real-time ticket updates
   */
  setupRealtimeUpdates() {
    this.ticketService.tickets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tickets => {
        if (tickets.length > 0) {
          this.tickets = tickets;
          this.cdr.detectChanges();
        }
      });
  }

  /**
   * Setup search input debouncing
   */
  setupSearchDebounce() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.searchTerm = searchTerm;
        this.currentPage = 1;
        this.loadTickets();
      });
  }

  /**
   * Handle search input
   */
  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  /**
   * Load tickets with current filters
   */
  loadTickets() {
    this.loading = true;
    this.error = null;

    const filters: TicketFilters = {
      search: this.searchTerm || undefined,
      status: this.selectedStatuses.length > 0 ? this.selectedStatuses : undefined,
      category: this.selectedCategories.length > 0 ? this.selectedCategories : undefined,
      priority: this.selectedPriorities.length > 0 ? this.selectedPriorities : undefined,
      assignedAgent: this.selectedAgent || undefined,
      escalated: this.showEscalated ? true : undefined
    };

    this.ticketService.getTickets(filters, this.currentPage, this.pageSize, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tickets = response.tickets;
          this.totalTickets = response.total;
          this.totalPages = response.totalPages;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error loading tickets:', err);
          this.error = 'Failed to load tickets';
          this.loading = false;
          this.toast.error('Failed to load tickets');
          this.cdr.detectChanges();
        }
      });
  }

  /**
   * Load ticket statistics
   */
  loadStatistics() {
    this.ticketService.getStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats = {
            total: stats.total,
            new: stats.byStatus['new'] || 0,
            inProgress: stats.byStatus['in_progress'] || 0,
            resolved: stats.byStatus['resolved'] || 0,
            escalated: Object.values(stats.byStatus).reduce((sum, val) => sum + val, 0) // Placeholder
          };
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error loading statistics:', err);
        }
      });
  }

  /**
   * Toggle status filter
   */
  toggleStatus(status: string) {
    const index = this.selectedStatuses.indexOf(status);
    if (index > -1) {
      this.selectedStatuses.splice(index, 1);
    } else {
      this.selectedStatuses.push(status);
    }
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Toggle category filter
   */
  toggleCategory(categoryId: string) {
    const index = this.selectedCategories.indexOf(categoryId);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(categoryId);
    }
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Toggle priority filter
   */
  togglePriority(priority: string) {
    const index = this.selectedPriorities.indexOf(priority);
    if (index > -1) {
      this.selectedPriorities.splice(index, 1);
    } else {
      this.selectedPriorities.push(priority);
    }
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Filter by agent
   */
  filterByAgent() {
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Toggle escalated filter
   */
  toggleEscalated() {
    this.showEscalated = !this.showEscalated;
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.searchTerm = '';
    this.selectedStatuses = [];
    this.selectedCategories = [];
    this.selectedPriorities = [];
    this.selectedAgent = '';
    this.showEscalated = false;
    this.currentPage = 1;
    this.loadTickets();
  }

  /**
   * Navigate to ticket detail
   */
  viewTicket(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket._id]);
  }

  /**
   * Navigate to create ticket
   */
  createTicket() {
    this.router.navigate(['/tickets/new']);
  }

  /**
   * Pagination methods
   */
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadTickets();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTickets();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTickets();
    }
  }

  /**
   * Get category by ID
   */
  getCategoryById(categoryId: string): TicketCategory | undefined {
    return this.availableCategories.find(cat => cat.id === categoryId);
  }

  /**
   * Get priority icon
   */
  getPriorityIcon(priority: string): string {
    const iconMap: { [key: string]: string } = {
      'low': '▼',
      'medium': '■',
      'high': '▲',
      'urgent': '⚠'
    };
    return iconMap[priority] || '■';
  }

  /**
   * Get priority color class
   */
  getPriorityColorClass(priority: string): string {
    return this.ticketService.getPriorityColorClass(priority);
  }

  /**
   * Format date
   */
  formatDate(date: Date): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Get time ago
   */
  getTimeAgo(date: Date): string {
    if (!date) return '-';
    const now = new Date().getTime();
    const then = new Date(date).getTime();
    const diff = now - then;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  /**
   * Check if status is selected
   */
  isStatusSelected(status: string): boolean {
    return this.selectedStatuses.includes(status);
  }

  /**
   * Check if category is selected
   */
  isCategorySelected(categoryId: string): boolean {
    return this.selectedCategories.includes(categoryId);
  }

  /**
   * Check if priority is selected
   */
  isPrioritySelected(priority: string): boolean {
    return this.selectedPriorities.includes(priority);
  }
}
