import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService, Ticket } from '../../../services/ticket';
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';
import { ToastService } from '../../../services/toast';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ticket-modal',
  standalone: true,
  imports: [CommonModule, TicketStatusBadgeComponent, FormsModule],
  templateUrl: './ticket-modal.component.html',
  styleUrls: ['./ticket-modal.component.css']
})
export class TicketModalComponent implements OnInit, OnChanges, OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() isOpen = false;
  @Input() ticketId?: string;
  @Output() closeModal = new EventEmitter<void>();
  @Output() ticketUpdated = new EventEmitter<Ticket>();

  ticket: Ticket | null = null;
  loading = true;
  updating = false;
  addingNote = false;
  error: string | null = null;

  // UI state
  showResolveModal = false;
  resolutionSummary = '';
  newNote = '';
  noteIsInternal = true;

  constructor(
    private ticketService: TicketService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.initializeTicket();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen'] && changes['isOpen'].currentValue && this.ticketId) {
      this.initializeTicket();
    } else if (changes['ticketId'] && !changes['ticketId'].firstChange && this.ticketId) {
      this.initializeTicket();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initializeTicket() {
    this.error = null;
    this.loading = true;

    if (this.ticketId) {
      this.loadTicket();
    } else {
      this.loading = false;
    }
  }

  loadTicket() {
    if (!this.ticketId) return;

    this.loading = true;
    this.error = null;

    this.ticketService.getTicketById(this.ticketId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ngZone.run(() => {
            this.ticket = ticket;
            this.loading = false;
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          console.error('[TicketModal] Error loading ticket:', err);
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
    if (!this.ticket || this.updating || !this.ticketId) return;

    this.updating = true;
    this.ticketService.updateTicketStatus(this.ticketId, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.updating = false;
          this.ticketUpdated.emit(ticket);
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
    if (!this.ticket || this.updating || !this.resolutionSummary.trim() || !this.ticketId) return;

    this.updating = true;
    this.ticketService.resolveTicket(this.ticketId, this.resolutionSummary)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.updating = false;
          this.showResolveModal = false;
          this.resolutionSummary = '';
          this.ticketUpdated.emit(ticket);
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
    if (!this.ticket || this.addingNote || !this.newNote.trim() || !this.ticketId) return;

    this.addingNote = true;
    this.ticketService.addNote(this.ticketId, this.newNote, this.noteIsInternal)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.addingNote = false;
          this.newNote = '';
          this.ticketUpdated.emit(ticket);
          this.toast.success('Note added successfully');
        },
        error: (err) => {
          console.error('Error adding note:', err);
          this.addingNote = false;
          this.toast.error('Failed to add note');
        }
      });
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

  close() {
    this.closeModal.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }
}
