import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { TicketService, Ticket } from '../../../services/ticket';
import { ConfigurationService, TicketCategory } from '../../../services/configuration';
import { CustomerService, Customer } from '../../../services/customer';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col bg-whatsapp-dark text-gray-100 h-full min-h-0 w-full overflow-auto custom-scrollbar">
      <div class="p-4 md:p-6 max-w-4xl mx-auto w-full">
        <div class="bg-whatsapp-gray rounded-lg border border-gray-700 p-6">
          <h1 class="text-xl md:text-2xl font-semibold text-gray-100 mb-6">Create New Ticket</h1>

          <!-- Customer Info Banner -->
          <div *ngIf="customer" class="mb-6 p-4 bg-whatsapp-dark rounded-lg border border-gray-600">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-whatsapp-green rounded-full flex items-center justify-center text-white font-bold">
                {{ getCustomerInitial() }}
              </div>
              <div>
                <div class="font-semibold text-gray-100">{{ getCustomerName() }}</div>
                <div class="text-sm text-gray-400">{{ customer.phoneNumber }}</div>
              </div>
            </div>
          </div>

          <!-- Loading Context Indicator -->
          <div *ngIf="loadingContext" class="mb-4 p-3 bg-whatsapp-dark rounded-lg border border-gray-600 flex items-center gap-2">
            <div class="animate-spin w-4 h-4 border-2 border-whatsapp-green border-t-transparent rounded-full"></div>
            <span class="text-gray-400">Loading conversation context...</span>
          </div>

          <form (ngSubmit)="onSubmit()" #ticketForm="ngForm">
            <!-- Subject -->
            <div class="mb-4">
              <label class="block text-xs text-gray-400 mb-2">Subject *</label>
              <input
                type="text"
                [(ngModel)]="formData.subject"
                name="subject"
                required
                maxlength="200"
                class="w-full px-4 py-2 bg-whatsapp-dark text-gray-100 border border-gray-600 rounded-lg focus:border-whatsapp-green focus:outline-none"
                placeholder="Brief summary of the issue">
            </div>

            <!-- Description -->
            <div class="mb-4">
              <label class="block text-xs text-gray-400 mb-2">Description *</label>
              <textarea
                [(ngModel)]="formData.description"
                name="description"
                required
                rows="6"
                class="w-full px-4 py-2 bg-whatsapp-dark text-gray-100 border border-gray-600 rounded-lg focus:border-whatsapp-green focus:outline-none"
                placeholder="Detailed description of the issue"></textarea>
              <p *ngIf="conversationId" class="text-xs text-gray-500 mt-1">
                Pre-filled from conversation. Edit as needed.
              </p>
            </div>

            <!-- Category -->
            <div class="mb-4">
              <label class="block text-xs text-gray-400 mb-2">Category *</label>
              <select
                [(ngModel)]="formData.category"
                name="category"
                required
                class="w-full px-4 py-2 bg-whatsapp-dark text-gray-100 border border-gray-600 rounded-lg focus:border-whatsapp-green focus:outline-none">
                <option value="">Select a category</option>
                <option *ngFor="let category of availableCategories" [value]="category.id">
                  {{ category.label }}
                </option>
              </select>
            </div>

            <!-- Priority -->
            <div class="mb-4">
              <label class="block text-xs text-gray-400 mb-2">Priority *</label>
              <select
                [(ngModel)]="formData.priority"
                name="priority"
                required
                class="w-full px-4 py-2 bg-whatsapp-dark text-gray-100 border border-gray-600 rounded-lg focus:border-whatsapp-green focus:outline-none">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <!-- Customer Phone (hidden if we already have customer) -->
            <div class="mb-6" *ngIf="!customer">
              <label class="block text-xs text-gray-400 mb-2">Customer Phone *</label>
              <input
                type="tel"
                [(ngModel)]="formData.customerPhone"
                name="customerPhone"
                required
                class="w-full px-4 py-2 bg-whatsapp-dark text-gray-100 border border-gray-600 rounded-lg focus:border-whatsapp-green focus:outline-none"
                placeholder="Customer phone number">
              <p class="text-xs text-gray-500 mt-1">Enter the customer's phone number</p>
            </div>

            <!-- Actions -->
            <div class="flex gap-4">
              <button
                type="submit"
                [disabled]="!ticketForm.valid || submitting || loadingContext"
                class="px-6 py-2 bg-whatsapp-green text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {{ submitting ? 'Creating...' : 'Create Ticket' }}
              </button>
              <button
                type="button"
                (click)="cancel()"
                class="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-whatsapp-dark hover:border-whatsapp-green transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #111b21;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #374151;
      border-radius: 3px;
    }
  `]
})
export class TicketFormComponent implements OnInit {
  availableCategories: TicketCategory[] = [];
  submitting = false;
  loadingContext = false;
  customer: Customer | null = null;
  conversationMessages: string[] = [];

  // Query params from conversation
  customerId: string | null = null;
  conversationId: string | null = null;

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
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategories();
    this.loadQueryParams();
  }

  loadQueryParams() {
    this.route.queryParams.subscribe(params => {
      this.customerId = params['customerId'] || null;
      this.conversationId = params['conversationId'] || null;
      const customerPhone = params['customerPhone'] || '';

      if (customerPhone) {
        this.formData.customerPhone = customerPhone;
      }

      // Load customer details if we have customerId
      if (this.customerId) {
        this.loadCustomerDetails();
      }

      // Load conversation context if we have conversationId
      if (this.conversationId) {
        this.loadConversationContext();
      }
    });
  }

  loadCustomerDetails() {
    if (!this.customerId) return;

    this.customerService.getCustomer(this.customerId).subscribe({
      next: (response) => {
        this.customer = response.customer;
        if (response.customer.phoneNumber) {
          this.formData.customerPhone = response.customer.phoneNumber;
        }
      },
      error: (err) => {
        console.error('Error loading customer:', err);
      }
    });
  }

  loadConversationContext() {
    if (!this.conversationId) {
      this.loadingContext = false;
      return;
    }

    this.loadingContext = true;

    // Load messages directly from the API
    this.http.get<any>(`/api/v2/conversations/${this.conversationId}/messages`).subscribe({
      next: (response) => {
        try {
          const backendMessages = response.messages || [];

          // Get last 10 customer messages for context (direction: 'in' = from customer)
          const customerMessages: string[] = backendMessages
            .filter((m: any) => m.direction === 'in' || m.sender === 'customer')
            .slice(-10)
            .map((m: any) => m.content || '');

          this.conversationMessages = customerMessages;

          // Auto-suggest subject from recent messages
          if (customerMessages.length > 0 && !this.formData.subject) {
            const lastMessage = customerMessages[customerMessages.length - 1];
            // Create a brief subject from the last message (first 50 chars)
            this.formData.subject = lastMessage.substring(0, 50) + (lastMessage.length > 50 ? '...' : '');
          }

          // Pre-fill description with conversation summary
          if (customerMessages.length > 0 && !this.formData.description) {
            this.formData.description = 'Customer messages:\n' + customerMessages.map((m: string) => `- ${m}`).join('\n');
          }
        } catch (e) {
          console.error('Error processing messages:', e);
        } finally {
          this.loadingContext = false;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Error loading conversation:', err);
        this.loadingContext = false;
        this.cdr.detectChanges();
      }
    });
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
      // Build ticket data with conversation context
      const ticketData: any = {
        subject: this.formData.subject,
        description: this.formData.description,
        category: this.formData.category,
        priority: this.formData.priority,
        customerPhone: this.formData.customerPhone,
        // Include IDs from conversation context
        customerId: this.customerId || undefined,
        conversationId: this.conversationId || undefined
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

  getCustomerName(): string {
    if (!this.customer) return 'Customer';
    const firstName = this.customer.firstName || '';
    const lastName = this.customer.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || this.customer.phoneNumber;
  }

  getCustomerInitial(): string {
    if (!this.customer) return 'C';
    if (this.customer.firstName) return this.customer.firstName.charAt(0).toUpperCase();
    return this.customer.phoneNumber?.charAt(0) || 'C';
  }
}
