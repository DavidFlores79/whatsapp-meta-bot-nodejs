# Ticket System Frontend Implementation Plan

**Angular 21 + Tailwind CSS + Socket.io**
**Architecture**: Clean Architecture with RxJS State Management (No NgRx, No Signals)
**Date**: December 18, 2024

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [State Management Strategy](#state-management-strategy)
3. [Component Architecture](#component-architecture)
4. [Real-time Updates Strategy](#real-time-updates-strategy)
5. [Forms Architecture](#forms-architecture)
6. [UI/UX Design Patterns](#uiux-design-patterns)
7. [Integration Points](#integration-points)
8. [File Structure](#file-structure)
9. [Implementation Phases](#implementation-phases)
10. [Testing Strategy](#testing-strategy)

---

## Executive Summary

### Decision Summary

| Question | Decision | Rationale |
|----------|----------|-----------|
| **State Management** | Services + RxJS (BehaviorSubjects) | Simple, performant, consistent with existing codebase |
| **Component Pattern** | Smart/Dumb separation | Better testability, reusability, and separation of concerns |
| **Real-time Updates** | Socket.io event listeners in service layer | Centralized event handling, automatic UI updates |
| **Forms Strategy** | Typed ReactiveForms with dynamic validation | Type safety, dynamic field requirements, better UX |
| **Caching** | BehaviorSubject-based cache with TTL | Fast UI, reduced API calls, optimistic updates |

---

## 1. State Management Strategy

### Overview

**DO NOT use NgRx or Signals** - use simple RxJS-based state management consistent with existing `ChatService` and `AuthService` patterns.

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Layer                          │
│  (Smart Components subscribe to service observables)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Service Layer                             │
│  - BehaviorSubjects for state                               │
│  - HTTP calls for data fetching                             │
│  - Socket.io listeners for real-time updates                │
│  - Optimistic update logic                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Backend Layer                             │
│  - REST API endpoints                                       │
│  - Socket.io event emissions                                │
└─────────────────────────────────────────────────────────────┘
```

### Service Implementation: TicketService

**File**: `/frontend/src/app/services/ticket.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, Subject, of } from 'rxjs';
import { map, tap, catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth';
import { ToastService } from './toast';

// Domain Models
export interface Ticket {
  _id: string;
  ticketNumber: string; // Auto-generated: TKT-YYYYMMDD-XXX
  customerId: {
    _id: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  conversationId?: string; // Optional link to conversation
  category: TicketCategory;
  subcategory?: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedAgent?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  tags: string[];
  notes: TicketNote[];
  attachments: TicketAttachment[];
  dueDate?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    source: 'manual' | 'conversation' | 'ai' | 'import';
    estimatedResolutionTime?: number; // in minutes
    actualResolutionTime?: number; // in minutes
    reopenCount: number;
    customerSatisfactionScore?: number; // 1-5
  };
}

export type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'pending_internal' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'technical_issue' | 'billing' | 'product_inquiry' | 'complaint' | 'feature_request' | 'other';

export interface TicketNote {
  _id: string;
  ticketId: string;
  content: string;
  agentId: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  isInternal: boolean; // True = only visible to agents, False = visible to customer
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketAttachment {
  _id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  url: string;
  thumbnailUrl?: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface CreateTicketDto {
  customerId: string;
  conversationId?: string;
  category: TicketCategory;
  subcategory?: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  tags?: string[];
  dueDate?: Date;
  assignedAgent?: string;
}

export interface UpdateTicketDto {
  category?: TicketCategory;
  subcategory?: string;
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedAgent?: string | null;
  tags?: string[];
  dueDate?: Date;
}

export interface TicketFilters {
  page: number;
  limit: number;
  search?: string;
  status?: TicketStatus | '';
  priority?: TicketPriority | '';
  category?: TicketCategory | '';
  assignedAgent?: string;
  customerId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string;
  sortBy: 'createdAt' | 'updatedAt' | 'priority' | 'dueDate' | 'ticketNumber';
  sortOrder: 'asc' | 'desc';
}

export interface TicketStatistics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  overdueTickets: number;
  averageResolutionTime: number; // in minutes
  ticketsByCategory: { category: TicketCategory; count: number }[];
  ticketsByPriority: { priority: TicketPriority; count: number }[];
  ticketsByAgent: { agentId: string; agentName: string; count: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private apiUrl = '/api/v2/tickets';
  private socket: Socket | null = null;

  // State Management with BehaviorSubjects
  private ticketsSubject = new BehaviorSubject<Ticket[]>([]);
  private selectedTicketIdSubject = new BehaviorSubject<string | null>(null);
  private filtersSubject = new BehaviorSubject<TicketFilters>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private statisticsSubject = new BehaviorSubject<TicketStatistics | null>(null);

  // Cache configuration
  private ticketCache = new Map<string, { ticket: Ticket; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Observables for components to subscribe
  public readonly tickets$ = this.ticketsSubject.asObservable();
  public readonly selectedTicketId$ = this.selectedTicketIdSubject.asObservable();
  public readonly filters$ = this.filtersSubject.asObservable();
  public readonly loading$ = this.loadingSubject.asObservable();
  public readonly statistics$ = this.statisticsSubject.asObservable();

  // Selected ticket observable with caching
  public readonly selectedTicket$ = this.selectedTicketIdSubject.pipe(
    switchMap(ticketId => {
      if (!ticketId) return of(null);

      // Check cache first
      const cached = this.ticketCache.get(ticketId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return of(cached.ticket);
      }

      // Fetch from API if not in cache or expired
      return this.getTicketById(ticketId);
    })
  );

  // View model for components (combines multiple observables)
  public readonly viewModel$ = this.tickets$.pipe(
    map(tickets => ({
      tickets,
      loading: this.loadingSubject.value,
      filters: this.filtersSubject.value,
      hasTickets: tickets.length > 0,
      isEmpty: tickets.length === 0 && !this.loadingSubject.value
    }))
  );

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.initSocket();

    // Auto-load tickets when authenticated
    this.authService.currentAgent$.subscribe(agent => {
      if (agent) {
        this.loadTickets();
        this.loadStatistics();
      } else {
        this.clearState();
      }
    });
  }

  // Socket.io initialization
  private initSocket(): void {
    this.socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling']
    });

    // Listen to ticket-related events
    this.socket.on('ticket_created', (data: { ticket: Ticket }) => {
      this.handleTicketCreated(data.ticket);
    });

    this.socket.on('ticket_updated', (data: { ticket: Ticket }) => {
      this.handleTicketUpdated(data.ticket);
    });

    this.socket.on('ticket_note_added', (data: { ticketId: string; note: TicketNote }) => {
      this.handleNoteAdded(data.ticketId, data.note);
    });

    this.socket.on('ticket_assigned', (data: { ticketId: string; agent: any }) => {
      this.handleTicketAssigned(data.ticketId, data.agent);
    });

    this.socket.on('connect', () => {
      console.log('Socket.io connected to ticket events');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.io disconnected from ticket events');
    });
  }

  // Real-time event handlers
  private handleTicketCreated(ticket: Ticket): void {
    const currentTickets = this.ticketsSubject.value;

    // Check if ticket already exists (prevent duplicates)
    const exists = currentTickets.some(t => t._id === ticket._id);
    if (!exists) {
      this.ticketsSubject.next([ticket, ...currentTickets]);
      this.toastService.info(`New ticket created: ${ticket.ticketNumber}`);
    }

    // Invalidate cache and reload statistics
    this.loadStatistics();
  }

  private handleTicketUpdated(updatedTicket: Ticket): void {
    const currentTickets = this.ticketsSubject.value;
    const index = currentTickets.findIndex(t => t._id === updatedTicket._id);

    if (index !== -1) {
      const updated = [...currentTickets];
      updated[index] = updatedTicket;
      this.ticketsSubject.next(updated);

      // Update cache
      this.ticketCache.set(updatedTicket._id, {
        ticket: updatedTicket,
        timestamp: Date.now()
      });

      // If this is the selected ticket, update it
      if (this.selectedTicketIdSubject.value === updatedTicket._id) {
        this.selectedTicketIdSubject.next(updatedTicket._id);
      }
    }

    this.loadStatistics();
  }

  private handleNoteAdded(ticketId: string, note: TicketNote): void {
    // Invalidate cache for this ticket
    this.ticketCache.delete(ticketId);

    // If this ticket is selected, reload it
    if (this.selectedTicketIdSubject.value === ticketId) {
      this.getTicketById(ticketId).subscribe();
    }

    this.toastService.info('New note added to ticket');
  }

  private handleTicketAssigned(ticketId: string, agent: any): void {
    const currentTickets = this.ticketsSubject.value;
    const ticket = currentTickets.find(t => t._id === ticketId);

    if (ticket) {
      const updated = { ...ticket, assignedAgent: agent };
      this.handleTicketUpdated(updated);
    }
  }

  // API Methods

  /**
   * Load tickets with current filters
   */
  loadTickets(): void {
    this.loadingSubject.next(true);
    const filters = this.filtersSubject.value;

    this.http.get<{ tickets: Ticket[]; pagination: any }>(`${this.apiUrl}`, {
      params: this.buildQueryParams(filters)
    }).pipe(
      tap(response => {
        this.ticketsSubject.next(response.tickets);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        console.error('Error loading tickets:', error);
        this.toastService.error('Failed to load tickets');
        this.loadingSubject.next(false);
        return throwError(() => error);
      })
    ).subscribe();
  }

  /**
   * Get ticket by ID with caching
   */
  getTicketById(ticketId: string): Observable<Ticket> {
    return this.http.get<{ ticket: Ticket }>(`${this.apiUrl}/${ticketId}`).pipe(
      map(response => response.ticket),
      tap(ticket => {
        // Update cache
        this.ticketCache.set(ticketId, {
          ticket,
          timestamp: Date.now()
        });
      }),
      catchError(error => {
        console.error('Error fetching ticket:', error);
        this.toastService.error('Failed to load ticket details');
        return throwError(() => error);
      })
    );
  }

  /**
   * Create new ticket with optimistic update
   */
  createTicket(dto: CreateTicketDto): Observable<Ticket> {
    this.loadingSubject.next(true);

    return this.http.post<{ ticket: Ticket }>(`${this.apiUrl}`, dto).pipe(
      map(response => response.ticket),
      tap(ticket => {
        // Optimistic update - add to list immediately
        const currentTickets = this.ticketsSubject.value;
        this.ticketsSubject.next([ticket, ...currentTickets]);

        this.loadingSubject.next(false);
        this.toastService.success('Ticket created successfully');
        this.loadStatistics(); // Refresh stats
      }),
      catchError(error => {
        console.error('Error creating ticket:', error);
        this.toastService.error('Failed to create ticket');
        this.loadingSubject.next(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Update ticket with optimistic update
   */
  updateTicket(ticketId: string, dto: UpdateTicketDto): Observable<Ticket> {
    // Optimistic update
    const currentTickets = this.ticketsSubject.value;
    const index = currentTickets.findIndex(t => t._id === ticketId);

    if (index !== -1) {
      const optimisticTicket = { ...currentTickets[index], ...dto };
      const updated = [...currentTickets];
      updated[index] = optimisticTicket;
      this.ticketsSubject.next(updated);
    }

    return this.http.put<{ ticket: Ticket }>(`${this.apiUrl}/${ticketId}`, dto).pipe(
      map(response => response.ticket),
      tap(ticket => {
        // Replace optimistic update with actual response
        this.handleTicketUpdated(ticket);
        this.toastService.success('Ticket updated successfully');
      }),
      catchError(error => {
        console.error('Error updating ticket:', error);
        this.toastService.error('Failed to update ticket');
        // Revert optimistic update on error
        this.loadTickets();
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete ticket
   */
  deleteTicket(ticketId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${ticketId}`).pipe(
      tap(() => {
        const currentTickets = this.ticketsSubject.value;
        this.ticketsSubject.next(currentTickets.filter(t => t._id !== ticketId));
        this.ticketCache.delete(ticketId);
        this.toastService.success('Ticket deleted successfully');
        this.loadStatistics();
      }),
      catchError(error => {
        console.error('Error deleting ticket:', error);
        this.toastService.error('Failed to delete ticket');
        return throwError(() => error);
      })
    );
  }

  /**
   * Add note to ticket
   */
  addNote(ticketId: string, content: string, isInternal: boolean): Observable<TicketNote> {
    return this.http.post<{ note: TicketNote }>(`${this.apiUrl}/${ticketId}/notes`, {
      content,
      isInternal
    }).pipe(
      map(response => response.note),
      tap(note => {
        // Invalidate cache and reload ticket
        this.ticketCache.delete(ticketId);
        if (this.selectedTicketIdSubject.value === ticketId) {
          this.getTicketById(ticketId).subscribe();
        }
        this.toastService.success('Note added successfully');
      }),
      catchError(error => {
        console.error('Error adding note:', error);
        this.toastService.error('Failed to add note');
        return throwError(() => error);
      })
    );
  }

  /**
   * Assign ticket to agent
   */
  assignTicket(ticketId: string, agentId: string | null): Observable<Ticket> {
    return this.http.patch<{ ticket: Ticket }>(`${this.apiUrl}/${ticketId}/assign`, {
      agentId
    }).pipe(
      map(response => response.ticket),
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.success(agentId ? 'Ticket assigned successfully' : 'Ticket unassigned');
      }),
      catchError(error => {
        console.error('Error assigning ticket:', error);
        this.toastService.error('Failed to assign ticket');
        return throwError(() => error);
      })
    );
  }

  /**
   * Load ticket statistics
   */
  loadStatistics(): void {
    this.http.get<{ statistics: TicketStatistics }>(`${this.apiUrl}/statistics`).pipe(
      tap(response => {
        this.statisticsSubject.next(response.statistics);
      }),
      catchError(error => {
        console.error('Error loading statistics:', error);
        return throwError(() => error);
      })
    ).subscribe();
  }

  // Filter management
  updateFilters(filters: Partial<TicketFilters>): void {
    const current = this.filtersSubject.value;
    this.filtersSubject.next({ ...current, ...filters });
    this.loadTickets();
  }

  clearFilters(): void {
    this.filtersSubject.next({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });
    this.loadTickets();
  }

  // Selection management
  selectTicket(ticketId: string | null): void {
    this.selectedTicketIdSubject.next(ticketId);
  }

  // Utility methods
  private buildQueryParams(filters: TicketFilters): any {
    const params: any = {
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    };

    if (filters.search) params.search = filters.search;
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.category) params.category = filters.category;
    if (filters.assignedAgent) params.assignedAgent = filters.assignedAgent;
    if (filters.customerId) params.customerId = filters.customerId;
    if (filters.tags) params.tags = filters.tags;
    if (filters.startDate) params.startDate = filters.startDate.toISOString();
    if (filters.endDate) params.endDate = filters.endDate.toISOString();

    return params;
  }

  private clearState(): void {
    this.ticketsSubject.next([]);
    this.selectedTicketIdSubject.next(null);
    this.statisticsSubject.next(null);
    this.ticketCache.clear();
  }

  // Helper methods for components
  getStatusColor(status: TicketStatus): string {
    const colors = {
      open: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      pending_customer: 'bg-purple-100 text-purple-800',
      pending_internal: 'bg-orange-100 text-orange-800',
      resolved: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || colors.open;
  }

  getPriorityColor(priority: TicketPriority): string {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
    return colors[priority] || colors.low;
  }

  getCategoryIcon(category: TicketCategory): string {
    const icons = {
      technical_issue: 'bi-tools',
      billing: 'bi-credit-card',
      product_inquiry: 'bi-box-seam',
      complaint: 'bi-exclamation-triangle',
      feature_request: 'bi-lightbulb',
      other: 'bi-question-circle'
    };
    return icons[category] || icons.other;
  }

  formatTicketNumber(ticketNumber: string): string {
    // Format: TKT-YYYYMMDD-XXX
    return ticketNumber;
  }

  destroy(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
```

### Key State Management Features

1. **BehaviorSubjects for State**: All state stored in BehaviorSubjects for immediate value access and reactive updates
2. **Optimistic Updates**: UI updates immediately on user actions, rollback on error
3. **Caching Strategy**: 5-minute TTL cache for individual tickets to reduce API calls
4. **View Model Pattern**: Combine multiple observables for efficient component consumption
5. **Real-time Sync**: Socket.io events automatically update state without manual refresh
6. **Filter Management**: Centralized filter state with automatic reloading

---

## 2. Component Architecture

### Smart vs Dumb Component Pattern

```
┌────────────────────────────────────────────────────────────┐
│                  Smart Components (Pages)                  │
│  - Subscribe to service observables                        │
│  - Handle business logic                                   │
│  - Manage state                                            │
│  - Handle navigation                                       │
├────────────────────────────────────────────────────────────┤
│  Examples:                                                 │
│  - TicketListPage                                          │
│  - TicketDetailPage                                        │
└──────────────────┬─────────────────────────────────────────┘
                   │ Props & Events
┌──────────────────▼─────────────────────────────────────────┐
│              Dumb Components (Presentation)                │
│  - Receive data via @Input                                 │
│  - Emit events via @Output                                 │
│  - Pure presentation logic                                 │
│  - No service dependencies (except utility)                │
├────────────────────────────────────────────────────────────┤
│  Examples:                                                 │
│  - TicketListComponent                                     │
│  - TicketDetailComponent                                   │
│  - TicketFormComponent                                     │
│  - TicketNotesComponent                                    │
│  - TicketCardComponent                                     │
│  - TicketStatusBadgeComponent                              │
│  - TicketPriorityBadgeComponent                            │
└────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
TicketListPage (Smart)
├── TicketListComponent (Dumb)
│   ├── TicketFilterComponent (Dumb)
│   ├── TicketStatsComponent (Dumb)
│   ├── TicketCardComponent (Dumb)
│   │   ├── TicketStatusBadgeComponent (Dumb)
│   │   └── TicketPriorityBadgeComponent (Dumb)
│   └── PaginationComponent (Shared/Dumb)
└── TicketFormModalComponent (Dumb)

TicketDetailPage (Smart)
├── TicketDetailComponent (Dumb)
│   ├── TicketHeaderComponent (Dumb)
│   │   ├── TicketStatusBadgeComponent (Dumb)
│   │   └── TicketPriorityBadgeComponent (Dumb)
│   ├── TicketInfoComponent (Dumb)
│   ├── TicketNotesComponent (Dumb)
│   │   └── TicketNoteCardComponent (Dumb)
│   ├── TicketActivityLogComponent (Dumb)
│   └── TicketActionsComponent (Dumb)
└── TicketFormComponent (Dumb)
```

### Component File Structure

#### 1. Smart Component: TicketListPage

**File**: `/frontend/src/app/components/tickets/ticket-list-page/ticket-list-page.ts`

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService, Ticket, TicketFilters, CreateTicketDto } from '../../../services/ticket';
import { TicketListComponent } from '../ticket-list/ticket-list';
import { TicketFormModalComponent } from '../ticket-form-modal/ticket-form-modal';

/**
 * Smart component for ticket list page
 * Handles data fetching, state management, and navigation
 */
@Component({
  selector: 'app-ticket-list-page',
  standalone: true,
  imports: [CommonModule, TicketListComponent, TicketFormModalComponent],
  templateUrl: './ticket-list-page.html',
  styleUrls: ['./ticket-list-page.css']
})
export class TicketListPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Observables from service
  viewModel$ = this.ticketService.viewModel$;
  statistics$ = this.ticketService.statistics$;
  loading$ = this.ticketService.loading$;

  // Modal state
  showCreateModal = false;

  constructor(
    private ticketService: TicketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Service auto-loads tickets on init
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Event handlers from dumb components
  onTicketClick(ticket: Ticket): void {
    this.router.navigate(['/tickets', ticket._id]);
  }

  onFilterChange(filters: Partial<TicketFilters>): void {
    this.ticketService.updateFilters(filters);
  }

  onClearFilters(): void {
    this.ticketService.clearFilters();
  }

  onCreateTicket(): void {
    this.showCreateModal = true;
  }

  onTicketCreated(dto: CreateTicketDto): void {
    this.ticketService.createTicket(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.showCreateModal = false;
          this.router.navigate(['/tickets', ticket._id]);
        },
        error: (error) => {
          console.error('Error creating ticket:', error);
        }
      });
  }

  onCloseModal(): void {
    this.showCreateModal = false;
  }
}
```

**Template**: `/frontend/src/app/components/tickets/ticket-list-page/ticket-list-page.html`

```html
<div class="h-full flex flex-col bg-gray-50">
  <!-- Page Header -->
  <div class="bg-white border-b border-gray-200 px-6 py-4">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Tickets</h1>
        <p class="text-sm text-gray-500 mt-1">Manage customer support tickets</p>
      </div>
      <button
        (click)="onCreateTicket()"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
        <i class="bi bi-plus-lg"></i>
        Create Ticket
      </button>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 overflow-hidden">
    <app-ticket-list
      [viewModel]="viewModel$ | async"
      [statistics]="statistics$ | async"
      [loading]="loading$ | async"
      (ticketClick)="onTicketClick($event)"
      (filterChange)="onFilterChange($event)"
      (clearFilters)="onClearFilters()">
    </app-ticket-list>
  </div>

  <!-- Create Modal -->
  <app-ticket-form-modal
    *ngIf="showCreateModal"
    [isOpen]="showCreateModal"
    (ticketCreated)="onTicketCreated($event)"
    (close)="onCloseModal()">
  </app-ticket-form-modal>
</div>
```

#### 2. Dumb Component: TicketListComponent

**File**: `/frontend/src/app/components/tickets/ticket-list/ticket-list.ts`

```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket, TicketFilters, TicketStatistics } from '../../../services/ticket';
import { TicketCardComponent } from '../ticket-card/ticket-card';
import { TicketFilterComponent } from '../ticket-filter/ticket-filter';
import { TicketStatsComponent } from '../ticket-stats/ticket-stats';

/**
 * Dumb component for displaying ticket list
 * Receives all data via @Input, emits events via @Output
 */
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TicketCardComponent, TicketFilterComponent, TicketStatsComponent],
  templateUrl: './ticket-list.html',
  styleUrls: ['./ticket-list.css']
})
export class TicketListComponent {
  @Input() viewModel: any = null;
  @Input() statistics: TicketStatistics | null = null;
  @Input() loading = false;

  @Output() ticketClick = new EventEmitter<Ticket>();
  @Output() filterChange = new EventEmitter<Partial<TicketFilters>>();
  @Output() clearFilters = new EventEmitter<void>();

  showFilters = false;

  onTicketClick(ticket: Ticket): void {
    this.ticketClick.emit(ticket);
  }

  onFilterChange(filters: Partial<TicketFilters>): void {
    this.filterChange.emit(filters);
  }

  onClearFilters(): void {
    this.clearFilters.emit();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }
}
```

**Template**: `/frontend/src/app/components/tickets/ticket-list/ticket-list.html`

```html
<div class="h-full flex flex-col">
  <!-- Statistics Bar -->
  <app-ticket-stats
    *ngIf="statistics"
    [statistics]="statistics"
    class="border-b border-gray-200">
  </app-ticket-stats>

  <!-- Filters -->
  <div class="bg-white border-b border-gray-200 px-6 py-3">
    <button
      (click)="toggleFilters()"
      class="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2">
      <i class="bi" [ngClass]="showFilters ? 'bi-funnel-fill' : 'bi-funnel'"></i>
      {{ showFilters ? 'Hide' : 'Show' }} Filters
    </button>
  </div>

  <app-ticket-filter
    *ngIf="showFilters"
    [filters]="viewModel?.filters"
    (filterChange)="onFilterChange($event)"
    (clearFilters)="onClearFilters()"
    class="border-b border-gray-200">
  </app-ticket-filter>

  <!-- Ticket List -->
  <div class="flex-1 overflow-y-auto bg-gray-50 p-6">
    <!-- Loading State -->
    <div *ngIf="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>

    <!-- Empty State -->
    <div *ngIf="!loading && viewModel?.isEmpty" class="flex flex-col items-center justify-center h-64">
      <i class="bi bi-inbox text-6xl text-gray-400 mb-4"></i>
      <h3 class="text-lg font-medium text-gray-900 mb-2">No tickets found</h3>
      <p class="text-sm text-gray-500">Create your first ticket to get started</p>
    </div>

    <!-- Ticket Grid -->
    <div *ngIf="!loading && viewModel?.hasTickets" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      <app-ticket-card
        *ngFor="let ticket of viewModel.tickets"
        [ticket]="ticket"
        (click)="onTicketClick(ticket)"
        class="cursor-pointer">
      </app-ticket-card>
    </div>
  </div>
</div>
```

#### 3. Dumb Component: TicketCardComponent

**File**: `/frontend/src/app/components/tickets/ticket-card/ticket-card.ts`

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ticket } from '../../../services/ticket';
import { TicketStatusBadgeComponent } from '../../shared/ticket-status-badge/ticket-status-badge';
import { TicketPriorityBadgeComponent } from '../../shared/ticket-priority-badge/ticket-priority-badge';

/**
 * Dumb component for ticket card display
 * Pure presentation, no business logic
 */
@Component({
  selector: 'app-ticket-card',
  standalone: true,
  imports: [CommonModule, TicketStatusBadgeComponent, TicketPriorityBadgeComponent],
  templateUrl: './ticket-card.html',
  styleUrls: ['./ticket-card.css']
})
export class TicketCardComponent {
  @Input({ required: true }) ticket!: Ticket;

  getCustomerName(): string {
    const customer = this.ticket.customerId;
    if (customer.firstName && customer.lastName) {
      return `${customer.firstName} ${customer.lastName}`;
    }
    return customer.firstName || customer.phoneNumber;
  }

  getAgentName(): string {
    if (!this.ticket.assignedAgent) return 'Unassigned';
    const agent = this.ticket.assignedAgent;
    return `${agent.firstName} ${agent.lastName}`;
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  isOverdue(): boolean {
    if (!this.ticket.dueDate) return false;
    return new Date(this.ticket.dueDate) < new Date() &&
           this.ticket.status !== 'resolved' &&
           this.ticket.status !== 'closed';
  }
}
```

**Template**: `/frontend/src/app/components/tickets/ticket-card/ticket-card.html`

```html
<div class="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow p-4">
  <!-- Header -->
  <div class="flex justify-between items-start mb-3">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-mono text-gray-500">{{ ticket.ticketNumber }}</span>
        <app-ticket-priority-badge [priority]="ticket.priority"></app-ticket-priority-badge>
        <span *ngIf="isOverdue()" class="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
          Overdue
        </span>
      </div>
      <h3 class="text-sm font-semibold text-gray-900 line-clamp-2">{{ ticket.subject }}</h3>
    </div>
  </div>

  <!-- Description -->
  <p class="text-sm text-gray-600 line-clamp-2 mb-3">{{ ticket.description }}</p>

  <!-- Metadata -->
  <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
    <span class="flex items-center gap-1">
      <i class="bi bi-person"></i>
      {{ getCustomerName() }}
    </span>
    <span>{{ formatDate(ticket.createdAt) }}</span>
  </div>

  <!-- Footer -->
  <div class="flex items-center justify-between pt-3 border-t border-gray-100">
    <app-ticket-status-badge [status]="ticket.status"></app-ticket-status-badge>

    <div class="flex items-center gap-2">
      <!-- Category Icon -->
      <span class="text-gray-400" [title]="ticket.category">
        <i class="bi" [ngClass]="getCategoryIcon()"></i>
      </span>

      <!-- Assigned Agent -->
      <span *ngIf="ticket.assignedAgent"
            class="text-xs text-gray-600 flex items-center gap-1"
            [title]="getAgentName()">
        <i class="bi bi-person-badge"></i>
        {{ ticket.assignedAgent.firstName.charAt(0) }}{{ ticket.assignedAgent.lastName.charAt(0) }}
      </span>
      <span *ngIf="!ticket.assignedAgent" class="text-xs text-gray-400">
        <i class="bi bi-person-dash"></i>
      </span>

      <!-- Notes Count -->
      <span *ngIf="ticket.notes.length > 0" class="text-xs text-gray-600 flex items-center gap-1">
        <i class="bi bi-chat-left-text"></i>
        {{ ticket.notes.length }}
      </span>
    </div>
  </div>
</div>
```

---

## 3. Real-time Updates Strategy

### Socket.io Event Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend Emits Events                     │
│  ticketController.js → req.io.emit('ticket_created', data)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               Socket.io Transport Layer                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          TicketService Listens to Events                    │
│  socket.on('ticket_created', handleTicketCreated)           │
│  socket.on('ticket_updated', handleTicketUpdated)           │
│  socket.on('ticket_note_added', handleNoteAdded)            │
│  socket.on('ticket_assigned', handleTicketAssigned)         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Update BehaviorSubjects                        │
│  ticketsSubject.next([updatedTicket, ...])                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            Components Receive Updates via $                 │
│  tickets$ observable emits new value                        │
│  Angular change detection triggers automatically            │
└─────────────────────────────────────────────────────────────┘
```

### Events to Listen For

| Event Name | Payload | Handler Action |
|------------|---------|----------------|
| `ticket_created` | `{ ticket: Ticket }` | Add to beginning of tickets array |
| `ticket_updated` | `{ ticket: Ticket }` | Find and replace in tickets array + cache |
| `ticket_note_added` | `{ ticketId: string, note: TicketNote }` | Invalidate cache, reload if selected |
| `ticket_assigned` | `{ ticketId: string, agent: Agent }` | Update assignedAgent field |
| `ticket_status_changed` | `{ ticketId: string, status: TicketStatus }` | Update status field + reload stats |
| `ticket_deleted` | `{ ticketId: string }` | Remove from tickets array |

### Event Handler Implementation

Already implemented in `TicketService` (see State Management section).

### Real-time UI Updates Without Full Refresh

**Key patterns:**

1. **Automatic Updates**: Components subscribe to `tickets$` observable, Angular change detection handles updates
2. **Optimistic Updates**: UI updates immediately on user actions, server confirms later
3. **Cache Invalidation**: Socket events trigger cache invalidation for affected tickets
4. **Selective Reloading**: Only reload selected ticket detail when note is added, not entire list
5. **Toast Notifications**: Inform users of background changes from other agents

---

## 4. Forms Architecture

### Form Strategy: Typed ReactiveF forms with Dynamic Validation

**Key principles:**

1. **Strict TypeScript interfaces** for form models matching DTOs
2. **Dynamic field requirements** based on category selection
3. **Real-time validation** with custom validators
4. **Error messages** displayed immediately on blur
5. **Auto-save drafts** to localStorage for create form

### TicketFormComponent Implementation

**File**: `/frontend/src/app/components/tickets/ticket-form/ticket-form.ts`

```typescript
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import {
  CreateTicketDto,
  UpdateTicketDto,
  Ticket,
  TicketCategory,
  TicketPriority
} from '../../../services/ticket';
import { CustomerService, Customer } from '../../../services/customer';
import { AgentService, Agent } from '../../../services/agent';

/**
 * Dumb component for ticket form
 * Handles create and edit modes with dynamic validation
 */
@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ticket-form.html',
  styleUrls: ['./ticket-form.css']
})
export class TicketFormComponent implements OnInit, OnDestroy {
  @Input() ticket: Ticket | null = null; // For edit mode
  @Input() customerId: string | null = null; // Pre-fill customer
  @Input() conversationId: string | null = null; // Link to conversation
  @Input() loading = false;

  @Output() submitForm = new EventEmitter<CreateTicketDto | UpdateTicketDto>();
  @Output() cancel = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  ticketForm: FormGroup;
  isEditMode = false;

  // Dropdown data
  customers: Customer[] = [];
  agents: Agent[] = [];
  loadingCustomers = false;
  loadingAgents = false;

  // Form options
  categories: { value: TicketCategory; label: string; subcategories: string[] }[] = [
    {
      value: 'technical_issue',
      label: 'Technical Issue',
      subcategories: ['Login Problem', 'System Error', 'Performance Issue', 'Bug Report']
    },
    {
      value: 'billing',
      label: 'Billing',
      subcategories: ['Payment Failed', 'Invoice Request', 'Refund Request', 'Pricing Question']
    },
    {
      value: 'product_inquiry',
      label: 'Product Inquiry',
      subcategories: ['Feature Question', 'How To', 'Product Recommendation', 'Availability']
    },
    {
      value: 'complaint',
      label: 'Complaint',
      subcategories: ['Service Quality', 'Product Quality', 'Delivery Issue', 'Other']
    },
    {
      value: 'feature_request',
      label: 'Feature Request',
      subcategories: ['New Feature', 'Enhancement', 'Integration']
    },
    {
      value: 'other',
      label: 'Other',
      subcategories: ['General Question', 'Feedback', 'Other']
    }
  ];

  priorities: { value: TicketPriority; label: string; description: string }[] = [
    { value: 'low', label: 'Low', description: 'No immediate impact' },
    { value: 'medium', label: 'Medium', description: 'Moderate impact' },
    { value: 'high', label: 'High', description: 'Significant impact' },
    { value: 'urgent', label: 'Urgent', description: 'Critical, needs immediate attention' }
  ];

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private agentService: AgentService
  ) {
    this.ticketForm = this.createForm();
  }

  ngOnInit(): void {
    this.isEditMode = !!this.ticket;
    this.loadCustomers();
    this.loadAgents();

    if (this.ticket) {
      this.patchFormWithTicket();
    } else if (this.customerId) {
      this.ticketForm.patchValue({ customerId: this.customerId });
    }

    // Dynamic subcategory field
    this.ticketForm.get('category')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(category => {
        this.updateSubcategoryOptions(category);
      });

    // Auto-save draft for create mode
    if (!this.isEditMode) {
      this.ticketForm.valueChanges
        .pipe(
          debounceTime(1000),
          takeUntil(this.destroy$)
        )
        .subscribe(value => {
          localStorage.setItem('ticket_draft', JSON.stringify(value));
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      customerId: ['', [Validators.required]],
      conversationId: [null],
      category: ['', [Validators.required]],
      subcategory: [''],
      subject: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      priority: ['medium', [Validators.required]],
      tags: [''],
      dueDate: [null],
      assignedAgent: [null]
    });
  }

  private patchFormWithTicket(): void {
    if (!this.ticket) return;

    this.ticketForm.patchValue({
      customerId: this.ticket.customerId._id,
      conversationId: this.ticket.conversationId,
      category: this.ticket.category,
      subcategory: this.ticket.subcategory,
      subject: this.ticket.subject,
      description: this.ticket.description,
      priority: this.ticket.priority,
      tags: this.ticket.tags.join(', '),
      dueDate: this.ticket.dueDate ? new Date(this.ticket.dueDate).toISOString().split('T')[0] : null,
      assignedAgent: this.ticket.assignedAgent?._id
    });
  }

  private loadCustomers(): void {
    this.loadingCustomers = true;
    this.customerService.listCustomers({ page: 1, limit: 100 }).subscribe({
      next: (response) => {
        this.customers = response.customers;
        this.loadingCustomers = false;
      },
      error: (error) => {
        console.error('Error loading customers:', error);
        this.loadingCustomers = false;
      }
    });
  }

  private loadAgents(): void {
    this.loadingAgents = true;
    this.agentService.listAgents().subscribe({
      next: (response) => {
        this.agents = response.agents;
        this.loadingAgents = false;
      },
      error: (error) => {
        console.error('Error loading agents:', error);
        this.loadingAgents = false;
      }
    });
  }

  private updateSubcategoryOptions(category: TicketCategory): void {
    const selected = this.categories.find(c => c.value === category);
    // Reset subcategory when category changes
    this.ticketForm.patchValue({ subcategory: '' }, { emitEvent: false });
  }

  getSubcategoryOptions(): string[] {
    const category = this.ticketForm.get('category')?.value;
    const selected = this.categories.find(c => c.value === category);
    return selected?.subcategories || [];
  }

  onSubmit(): void {
    if (this.ticketForm.invalid || this.loading) {
      this.markFormGroupTouched(this.ticketForm);
      return;
    }

    const formValue = this.ticketForm.value;

    // Parse tags (comma-separated string to array)
    const tags = formValue.tags
      ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
      : [];

    const dto: CreateTicketDto | UpdateTicketDto = {
      ...formValue,
      tags,
      dueDate: formValue.dueDate ? new Date(formValue.dueDate) : undefined,
      conversationId: this.conversationId || formValue.conversationId
    };

    this.submitForm.emit(dto);

    // Clear draft on successful submit
    if (!this.isEditMode) {
      localStorage.removeItem('ticket_draft');
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onRestoreDraft(): void {
    const draft = localStorage.getItem('ticket_draft');
    if (draft) {
      try {
        const value = JSON.parse(draft);
        this.ticketForm.patchValue(value);
      } catch (e) {
        console.error('Error restoring draft:', e);
      }
    }
  }

  hasDraft(): boolean {
    return !this.isEditMode && !!localStorage.getItem('ticket_draft');
  }

  getFieldError(fieldName: string): string | null {
    const field = this.ticketForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors['required']) return `${this.getFieldLabel(fieldName)} is required`;
      if (field.errors['minlength']) {
        return `Minimum ${field.errors['minlength'].requiredLength} characters`;
      }
      if (field.errors['maxlength']) {
        return `Maximum ${field.errors['maxlength'].requiredLength} characters`;
      }
    }
    return null;
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      customerId: 'Customer',
      category: 'Category',
      subject: 'Subject',
      description: 'Description',
      priority: 'Priority'
    };
    return labels[fieldName] || fieldName;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getCustomerDisplayName(customer: Customer): string {
    if (customer.firstName && customer.lastName) {
      return `${customer.firstName} ${customer.lastName} (${customer.phoneNumber})`;
    }
    return customer.phoneNumber;
  }
}
```

**Template**: `/frontend/src/app/components/tickets/ticket-form/ticket-form.html`

```html
<form [formGroup]="ticketForm" (ngSubmit)="onSubmit()" class="space-y-6">
  <!-- Draft Restore -->
  <div *ngIf="hasDraft()" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <p class="text-sm font-medium text-blue-900">Draft Found</p>
        <p class="text-xs text-blue-700 mt-1">You have an unsaved draft from a previous session</p>
      </div>
      <button
        type="button"
        (click)="onRestoreDraft()"
        class="ml-4 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
        Restore
      </button>
    </div>
  </div>

  <!-- Customer Selection -->
  <div class="form-group">
    <label for="customerId" class="block text-sm font-medium text-gray-700 mb-2">
      Customer *
    </label>
    <select
      id="customerId"
      formControlName="customerId"
      [disabled]="isEditMode"
      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      [class.border-red-500]="getFieldError('customerId')">
      <option value="">Select a customer</option>
      <option *ngFor="let customer of customers" [value]="customer._id">
        {{ getCustomerDisplayName(customer) }}
      </option>
    </select>
    <div *ngIf="getFieldError('customerId')" class="mt-1 text-sm text-red-600">
      {{ getFieldError('customerId') }}
    </div>
  </div>

  <!-- Category and Subcategory -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="form-group">
      <label for="category" class="block text-sm font-medium text-gray-700 mb-2">
        Category *
      </label>
      <select
        id="category"
        formControlName="category"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        [class.border-red-500]="getFieldError('category')">
        <option value="">Select a category</option>
        <option *ngFor="let cat of categories" [value]="cat.value">
          {{ cat.label }}
        </option>
      </select>
      <div *ngIf="getFieldError('category')" class="mt-1 text-sm text-red-600">
        {{ getFieldError('category') }}
      </div>
    </div>

    <div class="form-group" *ngIf="getSubcategoryOptions().length > 0">
      <label for="subcategory" class="block text-sm font-medium text-gray-700 mb-2">
        Subcategory
      </label>
      <select
        id="subcategory"
        formControlName="subcategory"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Select a subcategory</option>
        <option *ngFor="let sub of getSubcategoryOptions()" [value]="sub">
          {{ sub }}
        </option>
      </select>
    </div>
  </div>

  <!-- Subject -->
  <div class="form-group">
    <label for="subject" class="block text-sm font-medium text-gray-700 mb-2">
      Subject *
    </label>
    <input
      id="subject"
      type="text"
      formControlName="subject"
      placeholder="Brief description of the issue"
      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      [class.border-red-500]="getFieldError('subject')">
    <div *ngIf="getFieldError('subject')" class="mt-1 text-sm text-red-600">
      {{ getFieldError('subject') }}
    </div>
  </div>

  <!-- Description -->
  <div class="form-group">
    <label for="description" class="block text-sm font-medium text-gray-700 mb-2">
      Description *
    </label>
    <textarea
      id="description"
      formControlName="description"
      rows="5"
      placeholder="Detailed description of the issue or request..."
      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      [class.border-red-500]="getFieldError('description')">
    </textarea>
    <div *ngIf="getFieldError('description')" class="mt-1 text-sm text-red-600">
      {{ getFieldError('description') }}
    </div>
  </div>

  <!-- Priority -->
  <div class="form-group">
    <label class="block text-sm font-medium text-gray-700 mb-2">
      Priority *
    </label>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <label *ngFor="let p of priorities"
             class="relative flex cursor-pointer rounded-lg border bg-white p-4 shadow-sm focus:outline-none"
             [class.border-blue-600]="ticketForm.get('priority')?.value === p.value"
             [class.ring-2]="ticketForm.get('priority')?.value === p.value"
             [class.ring-blue-600]="ticketForm.get('priority')?.value === p.value">
        <input
          type="radio"
          formControlName="priority"
          [value]="p.value"
          class="sr-only">
        <span class="flex flex-1 flex-col">
          <span class="block text-sm font-medium text-gray-900">{{ p.label }}</span>
          <span class="mt-1 flex items-center text-xs text-gray-500">{{ p.description }}</span>
        </span>
        <i *ngIf="ticketForm.get('priority')?.value === p.value"
           class="bi bi-check-circle-fill text-blue-600 absolute top-2 right-2"></i>
      </label>
    </div>
  </div>

  <!-- Tags -->
  <div class="form-group">
    <label for="tags" class="block text-sm font-medium text-gray-700 mb-2">
      Tags
    </label>
    <input
      id="tags"
      type="text"
      formControlName="tags"
      placeholder="Separate tags with commas (e.g., urgent, refund, vip)"
      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
    <p class="mt-1 text-xs text-gray-500">Enter tags separated by commas</p>
  </div>

  <!-- Due Date and Agent Assignment -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="form-group">
      <label for="dueDate" class="block text-sm font-medium text-gray-700 mb-2">
        Due Date
      </label>
      <input
        id="dueDate"
        type="date"
        formControlName="dueDate"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
    </div>

    <div class="form-group">
      <label for="assignedAgent" class="block text-sm font-medium text-gray-700 mb-2">
        Assign To
      </label>
      <select
        id="assignedAgent"
        formControlName="assignedAgent"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option [value]="null">Unassigned</option>
        <option *ngFor="let agent of agents" [value]="agent._id">
          {{ agent.firstName }} {{ agent.lastName }}
        </option>
      </select>
    </div>
  </div>

  <!-- Form Actions -->
  <div class="flex justify-end gap-3 pt-4 border-t border-gray-200">
    <button
      type="button"
      (click)="onCancel()"
      [disabled]="loading"
      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
      Cancel
    </button>

    <button
      type="submit"
      [disabled]="ticketForm.invalid || loading"
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
      <span *ngIf="loading" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
      {{ isEditMode ? 'Update' : 'Create' }} Ticket
    </button>
  </div>
</form>
```

### Form Validation Rules

| Field | Validators | Dynamic Behavior |
|-------|-----------|------------------|
| `customerId` | Required | Disabled in edit mode |
| `category` | Required | Changes available subcategories |
| `subcategory` | Optional | Only shown if category has subcategories |
| `subject` | Required, Min 5, Max 200 | - |
| `description` | Required, Min 10 | - |
| `priority` | Required | Defaults to 'medium' |
| `tags` | Optional | Comma-separated, parsed to array |
| `dueDate` | Optional | Date picker, future dates only |
| `assignedAgent` | Optional | Dropdown of active agents |

---

## 5. UI/UX Design Patterns

### Tailwind CSS Configuration Extensions

**File**: `/frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'whatsapp-green': '#00a884',
        'whatsapp-dark': '#111b21',
        'whatsapp-gray': '#202c33',
        'whatsapp-input': '#2a3942',
        'whatsapp-light': '#f0f2f5',
        'incoming-message': '#202c33',
        'outgoing-message': '#056162',
        // Ticket system colors
        'ticket': {
          'low': '#6b7280',
          'medium': '#3b82f6',
          'high': '#f97316',
          'urgent': '#ef4444',
          'open': '#3b82f6',
          'in-progress': '#eab308',
          'pending': '#a855f7',
          'resolved': '#22c55e',
          'closed': '#6b7280'
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
}
```

### Status Badge Component

**File**: `/frontend/src/app/components/shared/ticket-status-badge/ticket-status-badge.ts`

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketStatus } from '../../../services/ticket';

@Component({
  selector: 'app-ticket-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      [ngClass]="getStatusClass()">
      <span class="w-2 h-2 rounded-full mr-1.5" [ngClass]="getDotClass()"></span>
      {{ getStatusLabel() }}
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class TicketStatusBadgeComponent {
  @Input({ required: true }) status!: TicketStatus;

  getStatusClass(): string {
    const classes: Record<TicketStatus, string> = {
      'open': 'bg-blue-100 text-blue-800',
      'in_progress': 'bg-yellow-100 text-yellow-800',
      'pending_customer': 'bg-purple-100 text-purple-800',
      'pending_internal': 'bg-orange-100 text-orange-800',
      'resolved': 'bg-green-100 text-green-800',
      'closed': 'bg-gray-100 text-gray-800'
    };
    return classes[this.status] || classes.open;
  }

  getDotClass(): string {
    const classes: Record<TicketStatus, string> = {
      'open': 'bg-blue-600 animate-pulse',
      'in_progress': 'bg-yellow-600 animate-pulse',
      'pending_customer': 'bg-purple-600',
      'pending_internal': 'bg-orange-600',
      'resolved': 'bg-green-600',
      'closed': 'bg-gray-600'
    };
    return classes[this.status] || classes.open;
  }

  getStatusLabel(): string {
    const labels: Record<TicketStatus, string> = {
      'open': 'Open',
      'in_progress': 'In Progress',
      'pending_customer': 'Pending Customer',
      'pending_internal': 'Pending Internal',
      'resolved': 'Resolved',
      'closed': 'Closed'
    };
    return labels[this.status] || 'Unknown';
  }
}
```

### Priority Badge Component

**File**: `/frontend/src/app/components/shared/ticket-priority-badge/ticket-priority-badge.ts`

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketPriority } from '../../../services/ticket';

@Component({
  selector: 'app-ticket-priority-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      [ngClass]="getPriorityClass()">
      <i class="bi mr-1" [ngClass]="getPriorityIcon()"></i>
      {{ getPriorityLabel() }}
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class TicketPriorityBadgeComponent {
  @Input({ required: true }) priority!: TicketPriority;

  getPriorityClass(): string {
    const classes: Record<TicketPriority, string> = {
      'low': 'bg-gray-100 text-gray-800',
      'medium': 'bg-blue-100 text-blue-800',
      'high': 'bg-orange-100 text-orange-800',
      'urgent': 'bg-red-100 text-red-800'
    };
    return classes[this.priority] || classes.low;
  }

  getPriorityIcon(): string {
    const icons: Record<TicketPriority, string> = {
      'low': 'bi-arrow-down',
      'medium': 'bi-dash',
      'high': 'bi-arrow-up',
      'urgent': 'bi-exclamation-triangle-fill'
    };
    return icons[this.priority] || icons.low;
  }

  getPriorityLabel(): string {
    return this.priority.charAt(0).toUpperCase() + this.priority.slice(1);
  }
}
```

### Timeline/Activity Log Component

**File**: `/frontend/src/app/components/tickets/ticket-activity-log/ticket-activity-log.ts`

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ActivityLogEntry {
  _id: string;
  type: 'created' | 'updated' | 'note_added' | 'status_changed' | 'assigned' | 'resolved';
  description: string;
  agent?: {
    firstName: string;
    lastName: string;
  };
  timestamp: Date;
  metadata?: any;
}

@Component({
  selector: 'app-ticket-activity-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-activity-log.html',
  styleUrls: ['./ticket-activity-log.css']
})
export class TicketActivityLogComponent {
  @Input() activities: ActivityLogEntry[] = [];

  getActivityIcon(type: ActivityLogEntry['type']): string {
    const icons = {
      created: 'bi-plus-circle-fill text-blue-600',
      updated: 'bi-pencil-fill text-gray-600',
      note_added: 'bi-chat-left-text-fill text-purple-600',
      status_changed: 'bi-arrow-left-right text-yellow-600',
      assigned: 'bi-person-fill-check text-green-600',
      resolved: 'bi-check-circle-fill text-green-600'
    };
    return icons[type] || 'bi-circle-fill text-gray-400';
  }

  formatTimestamp(date: Date): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return d.toLocaleDateString();
  }
}
```

**Template**: `/frontend/src/app/components/tickets/ticket-activity-log/ticket-activity-log.html`

```html
<div class="flow-root">
  <ul role="list" class="-mb-8">
    <li *ngFor="let activity of activities; let last = last">
      <div class="relative pb-8">
        <!-- Vertical line -->
        <span *ngIf="!last" class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>

        <div class="relative flex space-x-3">
          <!-- Icon -->
          <div>
            <span class="h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white bg-gray-50">
              <i class="bi text-sm" [ngClass]="getActivityIcon(activity.type)"></i>
            </span>
          </div>

          <!-- Content -->
          <div class="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
            <div>
              <p class="text-sm text-gray-900">
                {{ activity.description }}
                <span *ngIf="activity.agent" class="font-medium text-gray-900">
                  {{ activity.agent.firstName }} {{ activity.agent.lastName }}
                </span>
              </p>
            </div>
            <div class="whitespace-nowrap text-right text-sm text-gray-500">
              <time>{{ formatTimestamp(activity.timestamp) }}</time>
            </div>
          </div>
        </div>
      </div>
    </li>
  </ul>
</div>
```

### Mobile-Responsive Patterns

```css
/* ticket-list-page.css */

/* Mobile: Single column */
@media (max-width: 1023px) {
  .ticket-grid {
    @apply grid-cols-1;
  }
}

/* Tablet: Two columns */
@media (min-width: 1024px) and (max-width: 1279px) {
  .ticket-grid {
    @apply grid-cols-2;
  }
}

/* Desktop: Three columns */
@media (min-width: 1280px) {
  .ticket-grid {
    @apply grid-cols-3;
  }
}

/* Mobile ticket card adjustments */
@media (max-width: 640px) {
  .ticket-card {
    @apply text-sm;
  }

  .ticket-card-header {
    @apply flex-col items-start gap-2;
  }
}
```

---

## 6. Integration Points

### 6.1 Show Tickets in CustomerDetailComponent

**Implementation**: Add a "Tickets" tab to customer detail page

**File**: `/frontend/src/app/components/customers/customer-detail/customer-detail.ts`

```typescript
// Add import
import { TicketService } from '../../../services/ticket';

// In component class
export class CustomerDetailComponent implements OnInit {
  // ... existing code ...

  customerTickets$ = this.ticketService.tickets$.pipe(
    map(tickets => tickets.filter(t => t.customerId._id === this.customerId))
  );

  constructor(
    // ... existing injections ...
    private ticketService: TicketService
  ) {}

  ngOnInit(): void {
    // ... existing code ...
    this.loadCustomerTickets();
  }

  loadCustomerTickets(): void {
    this.ticketService.updateFilters({
      customerId: this.customerId,
      page: 1,
      limit: 10
    });
  }

  onCreateTicketForCustomer(): void {
    // Navigate to ticket creation with pre-filled customer
    this.router.navigate(['/tickets/new'], {
      queryParams: { customerId: this.customerId }
    });
  }
}
```

**Template addition** in `/frontend/src/app/components/customers/customer-detail/customer-detail.html`:

```html
<!-- Add new tab -->
<div class="border-b border-gray-200">
  <nav class="-mb-px flex space-x-8">
    <button (click)="activeTab = 'overview'"
            [class.border-blue-500]="activeTab === 'overview'"
            class="py-4 px-1 border-b-2 font-medium text-sm">
      Overview
    </button>
    <button (click)="activeTab = 'conversations'"
            [class.border-blue-500]="activeTab === 'conversations'"
            class="py-4 px-1 border-b-2 font-medium text-sm">
      Conversations
    </button>
    <button (click)="activeTab = 'tickets'"
            [class.border-blue-500]="activeTab === 'tickets'"
            class="py-4 px-1 border-b-2 font-medium text-sm">
      Tickets
    </button>
  </nav>
</div>

<!-- Tab content -->
<div *ngIf="activeTab === 'tickets'" class="p-6">
  <div class="flex justify-between items-center mb-4">
    <h3 class="text-lg font-medium">Customer Tickets</h3>
    <button
      (click)="onCreateTicketForCustomer()"
      class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
      Create Ticket
    </button>
  </div>

  <div class="space-y-3">
    <app-ticket-card
      *ngFor="let ticket of customerTickets$ | async"
      [ticket]="ticket"
      (click)="router.navigate(['/tickets', ticket._id])"
      class="cursor-pointer">
    </app-ticket-card>
  </div>

  <div *ngIf="(customerTickets$ | async)?.length === 0"
       class="text-center py-12 text-gray-500">
    <i class="bi bi-inbox text-4xl mb-2"></i>
    <p>No tickets found for this customer</p>
  </div>
</div>
```

### 6.2 Quick Ticket Creation from ConversationWindow

**Implementation**: Add "Create Ticket" button in chat header

**File**: `/frontend/src/app/components/chat/conversation-window/conversation-window.ts`

```typescript
// Add import
import { TicketService, CreateTicketDto } from '../../../services/ticket';

// In component class
export class ConversationWindowComponent {
  // ... existing code ...

  showCreateTicketModal = false;

  constructor(
    // ... existing injections ...
    private ticketService: TicketService
  ) {}

  onCreateTicketFromConversation(): void {
    this.showCreateTicketModal = true;
  }

  onTicketCreatedFromConversation(dto: CreateTicketDto): void {
    // Pre-fill with conversation context
    const enrichedDto = {
      ...dto,
      conversationId: this.selectedChat._id,
      customerId: this.selectedChat.customerId,
      description: dto.description + '\n\n--- Created from conversation ---'
    };

    this.ticketService.createTicket(enrichedDto).subscribe({
      next: (ticket) => {
        this.showCreateTicketModal = false;
        this.toastService.success('Ticket created successfully');
        // Optionally navigate to ticket
        this.router.navigate(['/tickets', ticket._id]);
      },
      error: (error) => {
        console.error('Error creating ticket:', error);
      }
    });
  }

  onCloseTicketModal(): void {
    this.showCreateTicketModal = false;
  }
}
```

**Template addition** in `/frontend/src/app/components/chat/conversation-window/conversation-window.html`:

```html
<!-- In chat header, add button next to existing actions -->
<div class="flex items-center gap-2">
  <!-- ... existing buttons ... -->

  <button
    (click)="onCreateTicketFromConversation()"
    [title]="'Create Ticket'"
    class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
    <i class="bi bi-ticket-perforated text-lg"></i>
  </button>
</div>

<!-- Add modal at bottom -->
<app-ticket-form-modal
  *ngIf="showCreateTicketModal"
  [isOpen]="showCreateTicketModal"
  [customerId]="selectedChat.customerId"
  [conversationId]="selectedChat._id"
  (ticketCreated)="onTicketCreatedFromConversation($event)"
  (close)="onCloseTicketModal()">
</app-ticket-form-modal>
```

### 6.3 Navigation: Tickets → Conversation

**Implementation**: Add "View Conversation" link in ticket detail if conversationId exists

**File**: `/frontend/src/app/components/tickets/ticket-detail/ticket-detail.ts`

```typescript
onViewConversation(): void {
  if (this.ticket?.conversationId) {
    // Navigate to main chat page and select the conversation
    this.router.navigate(['/'], {
      queryParams: { conversationId: this.ticket.conversationId }
    });
  }
}
```

**Template addition**:

```html
<!-- In ticket header actions -->
<button
  *ngIf="ticket.conversationId"
  (click)="onViewConversation()"
  class="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 flex items-center gap-2">
  <i class="bi bi-chat-left-text"></i>
  View Conversation
</button>
```

---

## 7. File Structure

### Complete Directory Tree

```
frontend/src/app/
├── components/
│   ├── tickets/
│   │   ├── ticket-list-page/
│   │   │   ├── ticket-list-page.ts
│   │   │   ├── ticket-list-page.html
│   │   │   └── ticket-list-page.css
│   │   ├── ticket-detail-page/
│   │   │   ├── ticket-detail-page.ts
│   │   │   ├── ticket-detail-page.html
│   │   │   └── ticket-detail-page.css
│   │   ├── ticket-list/
│   │   │   ├── ticket-list.ts
│   │   │   ├── ticket-list.html
│   │   │   └── ticket-list.css
│   │   ├── ticket-card/
│   │   │   ├── ticket-card.ts
│   │   │   ├── ticket-card.html
│   │   │   └── ticket-card.css
│   │   ├── ticket-detail/
│   │   │   ├── ticket-detail.ts
│   │   │   ├── ticket-detail.html
│   │   │   └── ticket-detail.css
│   │   ├── ticket-form/
│   │   │   ├── ticket-form.ts
│   │   │   ├── ticket-form.html
│   │   │   └── ticket-form.css
│   │   ├── ticket-form-modal/
│   │   │   ├── ticket-form-modal.ts
│   │   │   ├── ticket-form-modal.html
│   │   │   └── ticket-form-modal.css
│   │   ├── ticket-notes/
│   │   │   ├── ticket-notes.ts
│   │   │   ├── ticket-notes.html
│   │   │   └── ticket-notes.css
│   │   ├── ticket-note-card/
│   │   │   ├── ticket-note-card.ts
│   │   │   ├── ticket-note-card.html
│   │   │   └── ticket-note-card.css
│   │   ├── ticket-activity-log/
│   │   │   ├── ticket-activity-log.ts
│   │   │   ├── ticket-activity-log.html
│   │   │   └── ticket-activity-log.css
│   │   ├── ticket-filter/
│   │   │   ├── ticket-filter.ts
│   │   │   ├── ticket-filter.html
│   │   │   └── ticket-filter.css
│   │   ├── ticket-stats/
│   │   │   ├── ticket-stats.ts
│   │   │   ├── ticket-stats.html
│   │   │   └── ticket-stats.css
│   │   ├── ticket-header/
│   │   │   ├── ticket-header.ts
│   │   │   ├── ticket-header.html
│   │   │   └── ticket-header.css
│   │   ├── ticket-info/
│   │   │   ├── ticket-info.ts
│   │   │   ├── ticket-info.html
│   │   │   └── ticket-info.css
│   │   └── ticket-actions/
│   │       ├── ticket-actions.ts
│   │       ├── ticket-actions.html
│   │       └── ticket-actions.css
│   ├── shared/
│   │   ├── ticket-status-badge/
│   │   │   └── ticket-status-badge.ts (standalone, inline template)
│   │   ├── ticket-priority-badge/
│   │   │   └── ticket-priority-badge.ts (standalone, inline template)
│   │   └── ... (existing shared components)
│   ├── customers/
│   │   └── ... (existing components, modify customer-detail)
│   └── chat/
│       └── ... (existing components, modify conversation-window)
├── services/
│   ├── ticket.ts (NEW - main ticket service)
│   ├── customer.ts (existing, no changes)
│   ├── agent.ts (existing, no changes)
│   ├── chat.ts (existing, no changes)
│   ├── auth.ts (existing, no changes)
│   └── toast.ts (existing, no changes)
├── app.routes.ts (UPDATE - add ticket routes)
├── app.config.ts (no changes needed)
└── ... (other existing files)
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1)

**Priority: Core Infrastructure**

1. **Create TicketService** (`/services/ticket.ts`)
   - Domain models and interfaces
   - HTTP methods for CRUD operations
   - BehaviorSubjects for state management
   - Basic filter logic

2. **Create Backend API Routes** (if not existing)
   - `POST /api/v2/tickets` - Create ticket
   - `GET /api/v2/tickets` - List tickets
   - `GET /api/v2/tickets/:id` - Get ticket by ID
   - `PUT /api/v2/tickets/:id` - Update ticket
   - `DELETE /api/v2/tickets/:id` - Delete ticket
   - `GET /api/v2/tickets/statistics` - Get statistics

3. **Add Routes to Angular Router**
   ```typescript
   // app.routes.ts
   {
     path: '',
     component: MainLayoutComponent,
     canActivate: [authGuard],
     children: [
       // ... existing routes ...
       { path: 'tickets', component: TicketListPage },
       { path: 'tickets/new', component: TicketDetailPage },
       { path: 'tickets/:id', component: TicketDetailPage }
     ]
   }
   ```

4. **Create Shared Badge Components**
   - TicketStatusBadgeComponent
   - TicketPriorityBadgeComponent

**Deliverable**: Basic ticket CRUD operations working with simple UI

---

### Phase 2: Core Components (Week 2)

**Priority: Main User Flows**

1. **Create TicketListPage** (Smart Component)
   - Subscribe to service observables
   - Handle navigation
   - Manage create modal

2. **Create TicketListComponent** (Dumb Component)
   - Display ticket grid
   - Show loading/empty states
   - Emit events to page

3. **Create TicketCardComponent**
   - Display ticket summary
   - Show badges, metadata, customer info

4. **Create TicketFormComponent**
   - Typed ReactiveForm
   - Dynamic subcategory field
   - Form validation and error messages

5. **Create TicketFormModalComponent**
   - Wrapper for TicketFormComponent
   - Modal backdrop and animations

**Deliverable**: Users can create tickets and view ticket list

---

### Phase 3: Detail View (Week 2-3)

**Priority: Ticket Management**

1. **Create TicketDetailPage** (Smart Component)
   - Fetch ticket by ID
   - Handle updates
   - Manage notes

2. **Create TicketDetailComponent** (Dumb Component)
   - Display full ticket information
   - Show all fields, attachments, tags

3. **Create TicketHeaderComponent**
   - Ticket number, status, priority
   - Action buttons (edit, delete, resolve)

4. **Create TicketInfoComponent**
   - Customer info, category, dates
   - Agent assignment

5. **Create TicketNotesComponent**
   - Display notes timeline
   - Add note form
   - Internal/external toggle

6. **Create TicketNoteCardComponent**
   - Individual note display
   - Agent avatar, timestamp

7. **Create TicketActivityLogComponent**
   - Timeline of ticket changes
   - Icons, descriptions, timestamps

**Deliverable**: Complete ticket detail view with notes and activity log

---

### Phase 4: Filters & Search (Week 3)

**Priority: Navigation & Discovery**

1. **Create TicketFilterComponent**
   - Status, priority, category filters
   - Date range picker
   - Agent and customer filters
   - Search by ticket number or keywords

2. **Create TicketStatsComponent**
   - Display summary statistics
   - Cards for open, in progress, resolved counts
   - Overdue tickets alert

3. **Enhance TicketService**
   - Implement advanced filter logic
   - Pagination support
   - Sorting by multiple fields

**Deliverable**: Advanced search and filtering capabilities

---

### Phase 5: Real-time Updates (Week 4)

**Priority: Collaboration**

1. **Add Socket.io Event Listeners to TicketService**
   - `ticket_created`
   - `ticket_updated`
   - `ticket_note_added`
   - `ticket_assigned`
   - `ticket_status_changed`

2. **Implement Event Handlers**
   - Update BehaviorSubjects
   - Invalidate cache
   - Show toast notifications

3. **Backend Socket.io Emissions**
   - Emit events from ticket controllers
   - Include relevant data in payloads

**Deliverable**: Real-time ticket updates across all connected agents

---

### Phase 6: Integrations (Week 4-5)

**Priority: Cross-Feature Connectivity**

1. **Customer Detail Integration**
   - Add "Tickets" tab
   - Show customer tickets
   - Quick ticket creation

2. **Conversation Window Integration**
   - Add "Create Ticket" button in chat header
   - Pre-fill form with conversation context
   - Link ticket to conversation

3. **Navigation Links**
   - Ticket → Conversation (if linked)
   - Customer → Tickets
   - Ticket → Customer detail

**Deliverable**: Seamless navigation between tickets, customers, and conversations

---

### Phase 7: Polish & Optimization (Week 5)

**Priority: Performance & UX**

1. **Caching Strategy**
   - Implement 5-minute TTL cache
   - Cache invalidation on updates

2. **Optimistic Updates**
   - Update UI immediately on actions
   - Rollback on errors

3. **Mobile Responsiveness**
   - Test on mobile devices
   - Adjust card layouts
   - Optimize modals for small screens

4. **Accessibility**
   - Add ARIA labels
   - Keyboard navigation
   - Screen reader support

5. **Performance Optimization**
   - Lazy load ticket details
   - Virtual scrolling for long lists
   - Image optimization

**Deliverable**: Production-ready ticket system

---

## 9. Testing Strategy

### Unit Tests

**TicketService Tests** (`ticket.service.spec.ts`):

```typescript
describe('TicketService', () => {
  let service: TicketService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TicketService, AuthService, ToastService]
    });
    service = TestBed.inject(TicketService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should create ticket and update state', (done) => {
    const mockTicket: Ticket = { /* ... */ };
    const dto: CreateTicketDto = { /* ... */ };

    service.createTicket(dto).subscribe(ticket => {
      expect(ticket).toEqual(mockTicket);

      // Verify state update
      service.tickets$.subscribe(tickets => {
        expect(tickets).toContain(mockTicket);
        done();
      });
    });

    const req = httpMock.expectOne('/api/v2/tickets');
    expect(req.request.method).toBe('POST');
    req.flush({ ticket: mockTicket });
  });

  it('should handle real-time ticket_updated event', () => {
    const updatedTicket: Ticket = { /* ... */ };

    // Simulate socket event
    (service as any).handleTicketUpdated(updatedTicket);

    // Verify state update
    service.tickets$.subscribe(tickets => {
      const found = tickets.find(t => t._id === updatedTicket._id);
      expect(found).toEqual(updatedTicket);
    });
  });
});
```

**Component Tests**:

```typescript
describe('TicketCardComponent', () => {
  it('should display ticket information correctly', () => {
    const fixture = TestBed.createComponent(TicketCardComponent);
    const component = fixture.componentInstance;
    component.ticket = mockTicket;
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.ticket-number').textContent).toContain(mockTicket.ticketNumber);
    expect(compiled.querySelector('.ticket-subject').textContent).toContain(mockTicket.subject);
  });

  it('should show overdue badge when ticket is overdue', () => {
    const overdueTicket = { ...mockTicket, dueDate: new Date('2020-01-01'), status: 'open' };
    component.ticket = overdueTicket;
    fixture.detectChanges();

    expect(component.isOverdue()).toBe(true);
    expect(compiled.querySelector('.overdue-badge')).toBeTruthy();
  });
});
```

### Integration Tests

**Ticket Creation Flow**:

```typescript
describe('Ticket Creation Flow', () => {
  it('should create ticket and navigate to detail page', async () => {
    // 1. Navigate to ticket list
    await page.navigateTo('/tickets');

    // 2. Click "Create Ticket" button
    await page.click('[data-test="create-ticket-btn"]');

    // 3. Fill form
    await page.fillInput('[data-test="customer-select"]', mockCustomerId);
    await page.fillInput('[data-test="subject-input"]', 'Test Ticket');
    await page.fillInput('[data-test="description-textarea"]', 'Test Description');

    // 4. Submit
    await page.click('[data-test="submit-btn"]');

    // 5. Verify navigation
    expect(await page.getCurrentUrl()).toContain('/tickets/');

    // 6. Verify ticket appears in list
    await page.navigateTo('/tickets');
    expect(await page.getTextContent('[data-test="ticket-card"]:first-child')).toContain('Test Ticket');
  });
});
```

### E2E Tests (Cypress)

```typescript
// cypress/e2e/tickets.cy.ts
describe('Ticket System', () => {
  beforeEach(() => {
    cy.login('agent@example.com', 'password');
    cy.visit('/tickets');
  });

  it('should display ticket list', () => {
    cy.get('[data-test="ticket-card"]').should('have.length.greaterThan', 0);
  });

  it('should filter tickets by status', () => {
    cy.get('[data-test="filter-status"]').select('open');
    cy.get('[data-test="ticket-card"]').each(($card) => {
      cy.wrap($card).find('[data-test="status-badge"]').should('contain', 'Open');
    });
  });

  it('should create ticket and add note', () => {
    // Create ticket
    cy.get('[data-test="create-ticket-btn"]').click();
    cy.get('[data-test="customer-select"]').select(1);
    cy.get('[data-test="subject-input"]').type('E2E Test Ticket');
    cy.get('[data-test="description-textarea"]').type('This is a test ticket');
    cy.get('[data-test="submit-btn"]').click();

    // Verify creation
    cy.url().should('include', '/tickets/');
    cy.get('[data-test="ticket-subject"]').should('contain', 'E2E Test Ticket');

    // Add note
    cy.get('[data-test="note-textarea"]').type('This is a test note');
    cy.get('[data-test="add-note-btn"]').click();

    // Verify note appears
    cy.get('[data-test="note-card"]').should('contain', 'This is a test note');
  });

  it('should receive real-time updates', () => {
    // Open ticket detail
    cy.get('[data-test="ticket-card"]:first').click();

    // Simulate socket event from another agent
    cy.window().then((win) => {
      win.dispatchEvent(new CustomEvent('socket:ticket_updated', {
        detail: { ticket: { ...mockTicket, status: 'resolved' } }
      }));
    });

    // Verify UI updates
    cy.get('[data-test="status-badge"]').should('contain', 'Resolved');
  });
});
```

---

## 10. Additional Implementation Notes

### Performance Considerations

1. **Virtual Scrolling**: For ticket lists with 100+ items, implement `@angular/cdk/scrolling`
2. **Lazy Loading**: Lazy load ticket detail page and components
3. **Image Optimization**: Use Cloudinary transformations for attachment thumbnails
4. **Pagination**: Default to 20 items per page, allow users to change
5. **Debounce Search**: 300ms debounce on search input

### Accessibility (WCAG 2.1 AA)

1. **Keyboard Navigation**: All actions accessible via keyboard
2. **Screen Reader Support**: ARIA labels on all interactive elements
3. **Focus Management**: Proper focus trapping in modals
4. **Color Contrast**: Minimum 4.5:1 contrast ratio
5. **Form Labels**: All form fields have associated labels

### Error Handling

1. **Network Errors**: Show toast notification, retry option
2. **Validation Errors**: Display inline below fields
3. **Permission Errors**: Redirect to 403 page
4. **Not Found**: Redirect to 404 page with link to ticket list
5. **Optimistic Update Failures**: Rollback UI, show error toast

### Security Considerations

1. **XSS Prevention**: Angular sanitizes by default, but be careful with dynamic HTML
2. **CSRF Protection**: Use Angular's built-in CSRF token handling
3. **Authorization**: Check agent permissions before showing actions
4. **Input Sanitization**: Validate all user inputs on backend
5. **File Upload Security**: Validate file types, sizes, scan for malware

### Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile: iOS Safari 14+, Chrome Android 90+

### Bootstrap Icons Required

```html
<!-- Add to index.html -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
```

**Icons used:**
- `bi-ticket-perforated` - Ticket icon
- `bi-plus-lg` - Create button
- `bi-funnel` - Filter icon
- `bi-person` - Customer icon
- `bi-person-badge` - Agent icon
- `bi-chat-left-text` - Notes icon
- `bi-arrow-up/down` - Priority indicators
- `bi-exclamation-triangle` - Urgent priority
- `bi-check-circle` - Resolved status
- `bi-inbox` - Empty state
- Additional icons as needed

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building a production-ready Ticket System in Angular 21. The architecture follows Clean Architecture principles with strict separation of concerns, uses RxJS for state management without NgRx or signals, leverages Tailwind CSS for styling, and integrates seamlessly with existing CRM components.

**Key Takeaways:**

1. **State Management**: Services + BehaviorSubjects pattern consistent with existing codebase
2. **Component Architecture**: Smart/Dumb separation for testability and reusability
3. **Real-time Updates**: Socket.io events handled in service layer, automatic UI updates
4. **Forms**: Typed ReactiveF forms with dynamic validation and auto-save
5. **UI/UX**: Tailwind CSS with custom badge components and mobile-responsive design
6. **Integration**: Seamless navigation between tickets, customers, and conversations
7. **Testing**: Comprehensive unit, integration, and E2E test strategies

**Next Steps:**

1. Review and approve this implementation plan
2. Start with Phase 1 (Foundation) to establish core infrastructure
3. Iterate through phases sequentially
4. Conduct code reviews after each phase
5. Perform UAT before production deployment

---

**Document Version**: 1.0
**Last Updated**: December 18, 2024
**Author**: Claude Code Implementation Planning
**Status**: Ready for Implementation
