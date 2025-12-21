import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService, Ticket } from '../../../services/ticket';
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';
import { ToastService } from '../../../services/toast';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, TicketStatusBadgeComponent, FormsModule],
  template: `
    <div class="ticket-detail-container p-6 max-w-4xl mx-auto">
      <div *ngIf="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading ticket...</p>
      </div>

      <div *ngIf="!loading && ticket" class="space-y-6">
        <!-- Header Card -->
        <div class="bg-white rounded-lg shadow-lg p-6">
          <div class="flex justify-between items-start mb-4">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <h1 class="text-2xl font-bold text-gray-900">{{ ticket.ticketId }}</h1>
                <app-ticket-status-badge [status]="ticket.status" [showDot]="true" />
              </div>
              <p class="text-lg text-gray-700">{{ ticket.subject }}</p>
            </div>
            <button
              (click)="goBack()"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
              </svg>
              Back
            </button>
          </div>

          <!-- Meta Info -->
          <div class="flex flex-wrap gap-3 mb-6">
            <span class="px-3 py-1 text-sm rounded-full" [ngClass]="getPriorityClass(ticket.priority)">
              {{ ticket.priority | titlecase }} Priority
            </span>
            <span class="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-800">
              {{ ticket.category }}
            </span>
            <span *ngIf="ticket.escalated" class="px-3 py-1 text-sm rounded-full bg-red-100 text-red-800">
              ⚠️ Escalated
            </span>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-2" *ngIf="ticket.status !== 'closed'">
            <button
              *ngIf="ticket.status === 'new'"
              (click)="changeStatus('open')"
              [disabled]="updating"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              Open Ticket
            </button>
            <button
              *ngIf="ticket.status === 'open'"
              (click)="changeStatus('in_progress')"
              [disabled]="updating"
              class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50">
              Start Working
            </button>
            <button
              *ngIf="ticket.status === 'in_progress'"
              (click)="changeStatus('pending_customer')"
              [disabled]="updating"
              class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              Waiting for Customer
            </button>
            <button
              *ngIf="['open', 'in_progress', 'pending_customer'].includes(ticket.status)"
              (click)="showResolveModal = true"
              [disabled]="updating"
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              Resolve
            </button>
            <button
              *ngIf="ticket.status === 'resolved'"
              (click)="changeStatus('closed')"
              [disabled]="updating"
              class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              Close Ticket
            </button>
          </div>
        </div>

        <!-- Description Card -->
        <div class="bg-white rounded-lg shadow-lg p-6">
          <h3 class="text-lg font-semibold mb-3">Description</h3>
          <p class="text-gray-700 whitespace-pre-wrap">{{ ticket.description }}</p>
        </div>

        <!-- Customer Info Card -->
        <div class="bg-white rounded-lg shadow-lg p-6" *ngIf="ticket.customerId">
          <h3 class="text-lg font-semibold mb-4">Customer Information</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span class="text-sm text-gray-600">Name:</span>
              <p class="font-medium">{{ ticket.customerId?.firstName || '' }} {{ ticket.customerId?.lastName || '' }}</p>
            </div>
            <div>
              <span class="text-sm text-gray-600">Phone:</span>
              <p class="font-medium">{{ ticket.customerId?.phoneNumber || 'N/A' }}</p>
            </div>
          </div>
        </div>

        <!-- Agent & Timeline Card -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white rounded-lg shadow-lg p-6" *ngIf="ticket.assignedAgent">
            <h3 class="text-lg font-semibold mb-3">Assigned Agent</h3>
            <p class="font-medium">{{ ticket.assignedAgent?.firstName }} {{ ticket.assignedAgent?.lastName }}</p>
            <p class="text-sm text-gray-600">{{ ticket.assignedAgent?.email }}</p>
          </div>

          <div class="bg-white rounded-lg shadow-lg p-6">
            <h3 class="text-lg font-semibold mb-3">Timeline</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600">Created:</span>
                <span class="font-medium">{{ ticket.createdAt | date:'medium' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Last Updated:</span>
                <span class="font-medium">{{ ticket.updatedAt | date:'medium' }}</span>
              </div>
              <div class="flex justify-between" *ngIf="ticket.resolvedAt">
                <span class="text-gray-600">Resolved:</span>
                <span class="font-medium">{{ ticket.resolvedAt | date:'medium' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Resolution Card -->
        <div class="bg-white rounded-lg shadow-lg p-6" *ngIf="ticket.resolution">
          <h3 class="text-lg font-semibold mb-3 text-green-700">Resolution</h3>
          <p class="text-gray-700 whitespace-pre-wrap">{{ ticket.resolution.summary }}</p>
          <p class="text-sm text-gray-500 mt-2" *ngIf="ticket.resolution.resolvedBy">
            Resolved by {{ ticket.resolution.resolvedBy?.firstName }} {{ ticket.resolution.resolvedBy?.lastName }}
          </p>
        </div>

        <!-- Notes Section -->
        <div class="bg-white rounded-lg shadow-lg p-6" *ngIf="ticket.notes && ticket.notes.length > 0">
          <h3 class="text-lg font-semibold mb-4">Notes</h3>
          <div class="space-y-3">
            <div *ngFor="let note of ticket.notes" class="p-3 rounded-lg" [ngClass]="note.isInternal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'">
              <p class="text-gray-700">{{ note.content }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ note.createdBy?.firstName }} {{ note.createdBy?.lastName }} - {{ note.timestamp | date:'short' }}
                <span *ngIf="note.isInternal" class="text-yellow-600">(Internal)</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Add Note Form -->
        <div class="bg-white rounded-lg shadow-lg p-6">
          <h3 class="text-lg font-semibold mb-3">Add Note</h3>
          <textarea
            [(ngModel)]="newNote"
            rows="3"
            placeholder="Add a note to this ticket..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"></textarea>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="noteIsInternal" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
              <span class="text-sm text-gray-700">Internal note (not visible to customer)</span>
            </label>
            <button
              (click)="addNote()"
              [disabled]="!newNote.trim() || addingNote"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {{ addingNote ? 'Adding...' : 'Add Note' }}
            </button>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && !ticket" class="bg-white rounded-lg shadow-lg p-12 text-center">
        <p class="text-gray-600">Ticket not found</p>
        <button
          (click)="goBack()"
          class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Go Back
        </button>
      </div>

      <!-- Resolve Modal -->
      <div *ngIf="showResolveModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
          <h3 class="text-lg font-semibold mb-4">Resolve Ticket</h3>
          <textarea
            [(ngModel)]="resolutionSummary"
            rows="4"
            placeholder="Enter resolution summary..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"></textarea>
          <div class="flex justify-end gap-3">
            <button
              (click)="showResolveModal = false"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              (click)="resolveTicket()"
              [disabled]="!resolutionSummary.trim() || updating"
              class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {{ updating ? 'Resolving...' : 'Resolve Ticket' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .animate-spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private toast: ToastService;

  ticket: Ticket | null = null;
  loading = true;
  updating = false;
  addingNote = false;
  ticketId: string = '';
  
  // UI state
  showResolveModal = false;
  resolutionSummary = '';
  newNote = '';
  noteIsInternal = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService,
    toast: ToastService
  ) {
    this.toast = toast;
  }

  ngOnInit() {
    this.ticketId = this.route.snapshot.params['id'];
    this.loadTicket();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTicket() {
    this.loading = true;
    this.ticketService.getTicketById(this.ticketId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ticket) => {
          this.ticket = ticket;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading ticket:', err);
          this.loading = false;
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

  getPriorityClass(priority: string): string {
    const classes: { [key: string]: string } = {
      'low': 'bg-gray-100 text-gray-800',
      'medium': 'bg-blue-100 text-blue-800',
      'high': 'bg-orange-100 text-orange-800',
      'urgent': 'bg-red-100 text-red-800'
    };
    return classes[priority] || classes['medium'];
  }

  goBack() {
    this.router.navigate(['/tickets']);
  }
}
