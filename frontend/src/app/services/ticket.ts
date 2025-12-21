import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth';
import { ToastService } from './toast';
import { ConfigurationService, TicketCategory } from './configuration';

export interface TicketNote {
  _id?: string;
  content: string;
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  isInternal: boolean;
  timestamp: Date;
}

export interface StatusHistoryEntry {
  from: string;
  to: string;
  changedBy: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  changedAt: Date;
  reason?: string;
}

export interface Ticket {
  _id: string;
  ticketId: string; // Human-readable ID (e.g., LUX-2025-000001)
  subject: string;
  description: string;
  category: string;
  subcategory?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'waiting_internal' | 'resolved' | 'closed';

  // Relationships
  customerId: {
    _id: string;
    firstName: string;
    lastName?: string;
    phoneNumber: string;
  };
  conversationId?: {
    _id: string;
  };
  assignedAgent?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  // SLA tracking
  slaTargets?: {
    firstResponse: Date;
    resolution: Date;
  };
  firstResponseAt?: Date;
  resolvedAt?: Date;

  // Additional fields
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };

  attachments?: Array<{
    type: string;
    url: string;
    filename?: string;
    uploadedAt: Date;
  }>;

  tags?: string[];
  notes?: TicketNote[];
  statusHistory?: StatusHistoryEntry[];

  // Escalation
  escalated?: boolean;
  escalatedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  escalationReason?: string;
  escalatedAt?: Date;

  // Resolution
  resolution?: {
    summary: string;
    resolvedBy: {
      _id: string;
      firstName: string;
      lastName: string;
    };
    resolvedAt: Date;
  };

  // Customer feedback
  customerFeedback?: {
    rating: number; // 1-5
    comment?: string;
    submittedAt: Date;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TicketFilters {
  status?: string[];
  category?: string[];
  priority?: string[];
  assignedAgent?: string;
  customerId?: string;
  conversationId?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  escalated?: boolean;
}

export interface TicketStatistics {
  total: number;
  byStatus: { [key: string]: number };
  byCategory: { [key: string]: number };
  byPriority: { [key: string]: number };
  avgResolutionTime?: number;
  slaCompliance?: number;
}

export interface PaginatedTickets {
  tickets: Ticket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root',
})
export class TicketService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private configService = inject(ConfigurationService);

  private apiUrl = '/api/v2/tickets';
  private socket: Socket | null = null;

  // State management
  private ticketsSubject = new BehaviorSubject<Ticket[]>([]);
  private selectedTicketSubject = new BehaviorSubject<Ticket | null>(null);
  private statisticsSubject = new BehaviorSubject<TicketStatistics | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  // Observables
  tickets$ = this.ticketsSubject.asObservable();
  selectedTicket$ = this.selectedTicketSubject.asObservable();
  statistics$ = this.statisticsSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();

  // Cache
  private lastFetchTime = 0;
  private cacheTTL = 30000; // 30 seconds

  constructor() {
    this.initializeSocketConnection();
  }

  /**
   * Initialize Socket.io connection for real-time updates
   */
  private initializeSocketConnection(): void {
    // Wait for authentication
    this.authService.isAuthenticated$.subscribe(isAuth => {
      if (isAuth && !this.socket) {
        this.connectSocket();
      } else if (!isAuth && this.socket) {
        this.disconnectSocket();
      }
    });
  }

  /**
   * Connect to Socket.io server
   */
  private connectSocket(): void {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('[TicketService] Socket.io connected');
    });

    this.socket.on('disconnect', () => {
      console.log('[TicketService] Socket.io disconnected');
    });

    // Listen to ticket events
    this.socket.on('ticket_created', (data: { ticket: Ticket }) => {
      console.log('[TicketService] Ticket created:', data.ticket);
      this.handleTicketCreated(data.ticket);
    });

    this.socket.on('ticket_updated', (data: { ticket: Ticket }) => {
      console.log('[TicketService] Ticket updated:', data.ticket);
      this.handleTicketUpdated(data.ticket);
    });

    this.socket.on('ticket_status_changed', (data: { ticket: Ticket; previousStatus: string }) => {
      console.log('[TicketService] Ticket status changed:', data);
      this.handleTicketUpdated(data.ticket);
      this.toastService.info(`Ticket ${data.ticket.ticketId} status changed to ${data.ticket.status}`);
    });

    this.socket.on('ticket_assigned', (data: { ticket: Ticket }) => {
      console.log('[TicketService] Ticket assigned:', data.ticket);
      this.handleTicketUpdated(data.ticket);

      // Notify if assigned to current agent
      this.authService.currentAgent$.subscribe(currentAgent => {
        if (currentAgent && data.ticket.assignedAgent?._id === currentAgent._id) {
          this.toastService.success(`New ticket assigned: ${data.ticket.ticketId}`);
        }
      }).unsubscribe();
    });

    this.socket.on('ticket_note_added', (data: { ticket: Ticket; note: TicketNote }) => {
      console.log('[TicketService] Ticket note added:', data);
      this.handleTicketUpdated(data.ticket);
    });

    this.socket.on('ticket_resolved', (data: { ticket: Ticket }) => {
      console.log('[TicketService] Ticket resolved:', data.ticket);
      this.handleTicketUpdated(data.ticket);
    });

    this.socket.on('ticket_escalated', (data: { ticket: Ticket }) => {
      console.log('[TicketService] Ticket escalated:', data.ticket);
      this.handleTicketUpdated(data.ticket);
      this.toastService.warning(`Ticket ${data.ticket.ticketId} has been escalated`);
    });
  }

  /**
   * Disconnect Socket.io
   */
  private disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Handle new ticket creation
   */
  private handleTicketCreated(ticket: Ticket): void {
    const currentTickets = this.ticketsSubject.value;
    this.ticketsSubject.next([ticket, ...currentTickets]);

    // Update statistics
    this.refreshStatistics();
  }

  /**
   * Handle ticket update
   */
  private handleTicketUpdated(updatedTicket: Ticket): void {
    const currentTickets = this.ticketsSubject.value;
    const index = currentTickets.findIndex(t => t._id === updatedTicket._id);

    if (index !== -1) {
      const newTickets = [...currentTickets];
      newTickets[index] = updatedTicket;
      this.ticketsSubject.next(newTickets);
    } else {
      // Ticket not in current list, add it
      this.ticketsSubject.next([updatedTicket, ...currentTickets]);
    }

    // Update selected ticket if it's the one being updated
    if (this.selectedTicketSubject.value?._id === updatedTicket._id) {
      this.selectedTicketSubject.next(updatedTicket);
    }

    // Update statistics
    this.refreshStatistics();
  }

  // ==================== API Methods ====================

  /**
   * Get tickets with filters and pagination
   */
  getTickets(
    filters?: TicketFilters,
    page = 1,
    limit = 20,
    forceRefresh = false
  ): Observable<PaginatedTickets> {
    // Check cache
    const now = Date.now();
    if (!forceRefresh && now - this.lastFetchTime < this.cacheTTL && this.ticketsSubject.value.length > 0) {
      return new Observable(observer => {
        observer.next({
          tickets: this.ticketsSubject.value,
          total: this.ticketsSubject.value.length,
          page,
          limit,
          totalPages: Math.ceil(this.ticketsSubject.value.length / limit)
        });
        observer.complete();
      });
    }

    this.loadingSubject.next(true);

    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (filters) {
      if (filters.status && filters.status.length > 0) {
        params = params.set('status', filters.status.join(','));
      }
      if (filters.category && filters.category.length > 0) {
        params = params.set('category', filters.category.join(','));
      }
      if (filters.priority && filters.priority.length > 0) {
        params = params.set('priority', filters.priority.join(','));
      }
      if (filters.assignedAgent) {
        params = params.set('assignedAgent', filters.assignedAgent);
      }
      if (filters.customerId) {
        params = params.set('customerId', filters.customerId);
      }
      if (filters.conversationId) {
        params = params.set('conversationId', filters.conversationId);
      }
      if (filters.search) {
        params = params.set('search', filters.search);
      }
      if (filters.escalated !== undefined) {
        params = params.set('escalated', filters.escalated.toString());
      }
    }

    return this.http.get<PaginatedTickets>(this.apiUrl, { params }).pipe(
      tap(response => {
        this.ticketsSubject.next(response.tickets);
        this.lastFetchTime = Date.now();
        this.loadingSubject.next(false);
      })
    );
  }

  /**
   * Get ticket by ID
   */
  getTicketById(ticketId: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${this.apiUrl}/${ticketId}`).pipe(
      tap(ticket => {
        this.selectedTicketSubject.next(ticket);
      })
    );
  }

  /**
   * Create new ticket
   */
  createTicket(ticketData: Partial<Ticket>): Observable<Ticket> {
    this.loadingSubject.next(true);
    return this.http.post<Ticket>(this.apiUrl, ticketData).pipe(
      tap(ticket => {
        this.handleTicketCreated(ticket);
        this.loadingSubject.next(false);
        this.toastService.success(`Ticket ${ticket.ticketId} created successfully`);
      })
    );
  }

  /**
   * Update ticket
   */
  updateTicket(ticketId: string, updates: Partial<Ticket>): Observable<Ticket> {
    this.loadingSubject.next(true);
    return this.http.put<Ticket>(`${this.apiUrl}/${ticketId}`, updates).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.loadingSubject.next(false);
        this.toastService.success('Ticket updated successfully');
      })
    );
  }

  /**
   * Update ticket status
   */
  updateTicketStatus(ticketId: string, newStatus: string, reason?: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.apiUrl}/${ticketId}/status`, { status: newStatus, reason }).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.success(`Ticket status updated to ${newStatus}`);
      })
    );
  }

  /**
   * Assign ticket to agent
   */
  assignTicket(ticketId: string, agentId: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.apiUrl}/${ticketId}/assign`, { agentId }).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.success('Ticket assigned successfully');
      })
    );
  }

  /**
   * Add note to ticket
   */
  addNote(ticketId: string, content: string, isInternal: boolean): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.apiUrl}/${ticketId}/notes`, { content, isInternal }).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.success('Note added successfully');
      })
    );
  }

  /**
   * Resolve ticket
   */
  resolveTicket(ticketId: string, resolutionSummary: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.apiUrl}/${ticketId}/resolve`, { resolution: resolutionSummary }).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.success(`Ticket ${ticket.ticketId} resolved successfully`);
      })
    );
  }

  /**
   * Escalate ticket
   */
  escalateTicket(ticketId: string, escalateToAgentId: string, reason: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.apiUrl}/${ticketId}/escalate`, {
      escalatedTo: escalateToAgentId,
      escalationReason: reason
    }).pipe(
      tap(ticket => {
        this.handleTicketUpdated(ticket);
        this.toastService.warning(`Ticket ${ticket.ticketId} escalated`);
      })
    );
  }

  /**
   * Get tickets by customer
   */
  getTicketsByCustomer(customerId: string): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`/api/v2/customers/${customerId}/tickets`);
  }

  /**
   * Get tickets by conversation
   */
  getTicketsByConversation(conversationId: string): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`/api/v2/conversations/${conversationId}/tickets`);
  }

  /**
   * Get ticket statistics
   */
  getStatistics(): Observable<TicketStatistics> {
    return this.http.get<TicketStatistics>(`${this.apiUrl}/statistics`).pipe(
      tap(stats => {
        this.statisticsSubject.next(stats);
      })
    );
  }

  /**
   * Refresh statistics
   */
  refreshStatistics(): void {
    this.getStatistics().subscribe();
  }

  /**
   * Select a ticket
   */
  selectTicket(ticket: Ticket | null): void {
    this.selectedTicketSubject.next(ticket);
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedTicketSubject.next(null);
  }

  /**
   * Get status color class
   */
  getStatusColorClass(status: string): string {
    const colorMap: { [key: string]: string } = {
      'new': 'bg-gray-100 text-gray-800',
      'open': 'bg-blue-100 text-blue-800',
      'in_progress': 'bg-yellow-100 text-yellow-800',
      'pending_customer': 'bg-purple-100 text-purple-800',
      'waiting_internal': 'bg-orange-100 text-orange-800',
      'resolved': 'bg-green-100 text-green-800',
      'closed': 'bg-gray-200 text-gray-600'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  }

  /**
   * Get priority color class
   */
  getPriorityColorClass(priority: string): string {
    const colorMap: { [key: string]: string } = {
      'low': 'text-gray-500',
      'medium': 'text-blue-500',
      'high': 'text-orange-500',
      'urgent': 'text-red-500'
    };
    return colorMap[priority] || 'text-gray-500';
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    this.disconnectSocket();
  }
}
