import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService, Ticket } from '../../../services/ticket';
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, TicketStatusBadgeComponent],
  template: `
    <div class="ticket-detail-container p-6">
      <div *ngIf="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading ticket...</p>
      </div>

      <div *ngIf="!loading && ticket" class="bg-white rounded-lg shadow-lg p-6">
        <!-- Header -->
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">{{ ticket.ticketId }}</h1>
            <p class="text-gray-600 mt-1">{{ ticket.subject }}</p>
          </div>
          <button
            (click)="goBack()"
            class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            ← Back
          </button>
        </div>

        <!-- Status and Priority -->
        <div class="flex gap-4 mb-6">
          <app-ticket-status-badge [status]="ticket.status" [showDot]="true" />
          <span class="px-3 py-1 text-sm rounded-full bg-gray-100">
            Priority: <span class="capitalize font-medium">{{ ticket.priority }}</span>
          </span>
          <span class="px-3 py-1 text-sm rounded-full bg-gray-100">
            Category: <span class="font-medium">{{ ticket.category }}</span>
          </span>
        </div>

        <!-- Description -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-2">Description</h3>
          <p class="text-gray-700 whitespace-pre-wrap">{{ ticket.description }}</p>
        </div>

        <!-- Customer Info -->
        <div class="border-t pt-6 mb-6">
          <h3 class="text-lg font-semibold mb-4">Customer Information</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-sm text-gray-600">Name:</span>
              <p class="font-medium">{{ ticket.customerId.firstName }} {{ ticket.customerId.lastName }}</p>
            </div>
            <div>
              <span class="text-sm text-gray-600">Phone:</span>
              <p class="font-medium">{{ ticket.customerId.phoneNumber }}</p>
            </div>
          </div>
        </div>

        <!-- Assigned Agent -->
        <div class="border-t pt-6 mb-6" *ngIf="ticket.assignedAgent">
          <h3 class="text-lg font-semibold mb-2">Assigned Agent</h3>
          <p class="font-medium">{{ ticket.assignedAgent.firstName }} {{ ticket.assignedAgent.lastName }}</p>
          <p class="text-sm text-gray-600">{{ ticket.assignedAgent.email }}</p>
        </div>

        <!-- Timestamps -->
        <div class="border-t pt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-600">Created:</span>
            <p class="font-medium">{{ ticket.createdAt | date:'medium' }}</p>
          </div>
          <div>
            <span class="text-gray-600">Last Updated:</span>
            <p class="font-medium">{{ ticket.updatedAt | date:'medium' }}</p>
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

  ticket: Ticket | null = null;
  loading = true;
  ticketId: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService
  ) {}

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

  goBack() {
    this.router.navigate(['/tickets']);
  }
}
