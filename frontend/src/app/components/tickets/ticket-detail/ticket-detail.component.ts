import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService, Ticket } from '../../../services/ticket';
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';
import { ToastService } from '../../../services/toast';
import { FormsModule } from '@angular/forms';
import { AuthService, Agent } from '../../../services/auth';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, TicketStatusBadgeComponent, FormsModule],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private toast: ToastService;

  ticket: Ticket | null = null;
  loading = true;
  updating = false;
  addingNote = false;
  ticketId: string = '';
  error: string | null = null;
  currentAgent: Agent | null = null;

  // UI state
  showResolveModal = false;
  resolutionSummary = '';
  newNote = '';
  noteIsInternal = true;
  showReopenModal = false;
  reopenReason = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService,
    private authService: AuthService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    toast: ToastService
  ) {
    this.toast = toast;
    console.log('[TicketDetail] Constructor called');
  }

  ngOnInit() {
    console.log('[TicketDetail] ngOnInit called');
    console.log('[TicketDetail] Route params:', this.route.snapshot.params);
    this.ticketId = this.route.snapshot.params['id'];
    console.log('[TicketDetail] Extracted ticket ID:', this.ticketId);
    if (!this.ticketId) {
      console.error('[TicketDetail] No ticket ID found in route params!');
      this.toast.error('No ticket ID provided');
      this.router.navigate(['/tickets']);
      return;
    }

    // Get current agent for role-based permissions
    this.authService.currentAgent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(agent => {
        this.currentAgent = agent;
        console.log('[TicketDetail] Current agent loaded:', {
          agent: agent ? { role: agent.role, email: agent.email } : null
        });
      });

    this.loadTicket();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTicket() {
    this.loading = true;
    this.error = null;
    console.log('[TicketDetail] Loading ticket with ID:', this.ticketId);

    this.ticketService.getTicketById(this.ticketId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          console.log('[TicketDetail] Ticket loaded successfully:', ticket);
          // Use NgZone.run to ensure change detection triggers
          this.ngZone.run(() => {
            this.ticket = ticket;
            this.loading = false;
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          console.error('[TicketDetail] Error loading ticket:', err);
          console.error('[TicketDetail] Error details:', {
            status: err.status,
            statusText: err.statusText,
            message: err.message,
            error: err.error
          });
          this.ngZone.run(() => {
            this.error = 'Failed to load ticket details';
            this.loading = false;
            this.cdr.detectChanges();
          });
          this.toast.error('Failed to load ticket');
        }
      });
  }

  changeStatus(newStatus: string) {
    if (!this.ticket || this.updating) return;

    this.updating = true;
    this.ticketService.updateTicketStatus(this.ticketId, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.updating = false;
          this.toast.success(`Ticket status updated to ${newStatus}`);
        },
        error: (err) => {
          console.error('Error updating status:', err);
          this.updating = false;
          this.toast.error('Failed to update ticket status');
        }
      });
  }

  resolveTicket() {
    if (!this.ticket || this.updating || !this.resolutionSummary.trim()) return;

    this.updating = true;
    this.ticketService.resolveTicket(this.ticketId, this.resolutionSummary)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.updating = false;
          this.showResolveModal = false;
          this.resolutionSummary = '';
          this.toast.success('Ticket resolved successfully');
        },
        error: (err) => {
          console.error('Error resolving ticket:', err);
          this.updating = false;
          this.toast.error('Failed to resolve ticket');
        }
      });
  }

  addNote() {
    if (!this.ticket || this.addingNote || !this.newNote.trim()) return;

    this.addingNote = true;
    this.ticketService.addNote(this.ticketId, this.newNote, this.noteIsInternal)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.addingNote = false;
          this.newNote = '';
          this.toast.success('Note added successfully');
        },
        error: (err) => {
          console.error('Error adding note:', err);
          this.addingNote = false;
          this.toast.error('Failed to add note');
        }
      });
  }

  reopenTicket() {
    if (!this.ticket || this.updating || !this.reopenReason.trim()) return;

    this.updating = true;
    this.ticketService.reopenTicket(this.ticketId, this.reopenReason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.updating = false;
          this.showReopenModal = false;
          this.reopenReason = '';
          this.toast.success('Ticket reopened successfully');
        },
        error: (err) => {
          console.error('Error reopening ticket:', err);
          this.updating = false;
          const errorMsg = err.error?.message || 'Failed to reopen ticket';
          this.toast.error(errorMsg);
        }
      });
  }

  canReopenTicket(): boolean {
    if (!this.currentAgent || !this.ticket) {
      console.log('[TicketDetail] canReopenTicket - missing data:', {
        hasCurrentAgent: !!this.currentAgent,
        hasTicket: !!this.ticket
      });
      return false;
    }

    // Only admin and supervisor can reopen tickets
    const canReopen = this.currentAgent.role === 'admin' || this.currentAgent.role === 'supervisor';

    // Ticket must be resolved or closed to reopen
    const isReopenable = this.ticket.status === 'resolved' || this.ticket.status === 'closed';

    console.log('[TicketDetail] canReopenTicket check:', {
      currentAgentRole: this.currentAgent.role,
      ticketStatus: this.ticket.status,
      canReopen,
      isReopenable,
      result: canReopen && isReopenable
    });

    return canReopen && isReopenable;
  }

  getPriorityClass(priority: string): string {
    const classes: { [key: string]: string } = {
      'low': 'bg-gray-700 text-gray-300',
      'medium': 'bg-blue-900/50 text-blue-400',
      'high': 'bg-orange-900/50 text-orange-400',
      'urgent': 'bg-red-900/50 text-red-400'
    };
    return classes[priority] || classes['medium'];
  }

  goBack() {
    this.router.navigate(['/tickets']);
  }
}
