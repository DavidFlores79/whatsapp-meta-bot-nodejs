import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TicketService, Ticket } from '../../../services/ticket';
import { ConfigurationService, TicketCategory } from '../../../services/configuration';
import { CustomerService } from '../../../services/customer';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ticket-form-container p-6 max-w-4xl mx-auto">
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">Create New Ticket</h1>

        <form (ngSubmit)="onSubmit()" #ticketForm="ngForm">
          <!-- Subject -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
            <input
              type="text"
              [(ngModel)]="formData.subject"
              name="subject"
              required
              maxlength="200"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief summary of the issue">
          </div>

          <!-- Description -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Description *</label>
            <textarea
              [(ngModel)]="formData.description"
              name="description"
              required
              rows="5"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Detailed description of the issue"></textarea>
          </div>

          <!-- Category -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Category *</label>
            <select
              [(ngModel)]="formData.category"
              name="category"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Select a category</option>
              <option *ngFor="let category of availableCategories" [value]="category.id">
                {{ category.label }}
              </option>
            </select>
          </div>

          <!-- Priority -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Priority *</label>
            <select
              [(ngModel)]="formData.priority"
              name="priority"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <!-- Customer (simplified - search by phone) -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Customer Phone *</label>
            <input
              type="tel"
              [(ngModel)]="formData.customerPhone"
              name="customerPhone"
              required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Customer phone number">
            <p class="text-sm text-gray-500 mt-1">Enter the customer's phone number</p>
          </div>

          <!-- Actions -->
          <div class="flex gap-4">
            <button
              type="submit"
              [disabled]="!ticketForm.valid || submitting"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ submitting ? 'Creating...' : 'Create Ticket' }}
            </button>
            <button
              type="button"
              (click)="cancel()"
              class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: []
})
export class TicketFormComponent implements OnInit {
  availableCategories: TicketCategory[] = [];
  submitting = false;

  formData = {
    subject: '',
    description: '',
    category: '',
    priority: 'medium',
    customerPhone: ''
  };

  constructor(
    private ticketService: TicketService,
    private configService: ConfigurationService,
    private customerService: CustomerService,
    private router: Router,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.configService.categories$.subscribe(categories => {
      this.availableCategories = categories;
    });
  }

  async onSubmit() {
    if (this.submitting) return;

    this.submitting = true;

    try {
      // First, find or create customer by phone
      // This is simplified - in production, you'd have a proper customer lookup
      const ticketData: any = {
        subject: this.formData.subject,
        description: this.formData.description,
        category: this.formData.category,
        priority: this.formData.priority,
        // Note: Backend should handle customer lookup by phone
        // For now, this is a placeholder
      };

      this.ticketService.createTicket(ticketData).subscribe({
        next: (ticket) => {
          this.toast.success(`Ticket ${ticket.ticketId} created successfully`);
          this.router.navigate(['/tickets', ticket._id]);
        },
        error: (err) => {
          console.error('Error creating ticket:', err);
          this.toast.error('Failed to create ticket');
          this.submitting = false;
        }
      });
    } catch (error) {
      console.error('Error:', error);
      this.toast.error('An error occurred');
      this.submitting = false;
    }
  }

  cancel() {
    this.router.navigate(['/tickets']);
  }
}
