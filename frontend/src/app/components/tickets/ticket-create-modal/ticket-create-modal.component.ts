import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TicketService, Ticket } from '../../../services/ticket';
import { ConfigurationService, TicketCategory } from '../../../services/configuration';
import { CustomerService, Customer } from '../../../services/customer';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-ticket-create-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ticket-create-modal.component.html',
  styleUrls: ['./ticket-create-modal.component.css']
})
export class TicketCreateModalComponent implements OnInit, OnChanges {
  @Input() show = false;
  @Input() customerId?: string | null;
  @Input() conversationId?: string | null;
  @Input() customerPhone?: string | null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Ticket>();

  loading = false;
  submitting = false;
  loadingContext = false;
  customer: Customer | null = null;
  conversationMessages: string[] = [];
  availableCategories: TicketCategory[] = [];

  formData = {
    subject: '',
    description: '',
    category: '',
    priority: 'medium',
    customerPhone: ''
  };

  errors: { [key: string]: string } = {};

  constructor(
    private ticketService: TicketService,
    private configService: ConfigurationService,
    private customerService: CustomerService,
    private http: HttpClient,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['show'] && changes['show'].currentValue === true) {
      this.initializeModal();
    }
  }

  initializeModal() {
    this.errors = {};
    this.submitting = false;
    this.resetForm();

    if (this.customerPhone) {
      this.formData.customerPhone = this.customerPhone;
    }

    if (this.customerId) {
      this.loadCustomerDetails();
    }

    if (this.conversationId) {
      this.loadConversationContext();
    }
  }

  resetForm() {
    this.formData = {
      subject: '',
      description: '',
      category: '',
      priority: 'medium',
      customerPhone: this.customerPhone || ''
    };
    this.customer = null;
    this.conversationMessages = [];
    this.loading = false;
  }

  loadCategories() {
    this.configService.categories$.subscribe(categories => {
      this.availableCategories = categories;
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
        this.cdr.detectChanges();
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

    this.http.get<any>(`/api/v2/conversations/${this.conversationId}/messages`).subscribe({
      next: (response) => {
        try {
          const backendMessages = response.messages || [];

          // Get all messages with metadata
          const allMessages = backendMessages
            .slice(-10)
            .map((m: any) => ({
              content: m.content || '',
              direction: m.direction,
              timestamp: m.timestamp ? new Date(m.timestamp) : null,
              isCustomer: m.direction === 'in' || m.sender === 'customer'
            }));

          const customerMessages = allMessages.filter((m: any) => m.isCustomer);
          this.conversationMessages = customerMessages.map((m: any) => m.content);

          // Auto-suggest subject from the first customer message (usually the main issue)
          if (customerMessages.length > 0 && !this.formData.subject) {
            const firstMessage = customerMessages[0].content;
            this.formData.subject = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '');
          }

          // Create a structured description with conversation context
          if (customerMessages.length > 0 && !this.formData.description) {
            let description = '## Conversation Summary\n\n';

            // Main issue (first message)
            if (customerMessages.length > 0) {
              description += `**Main Issue:**\n${customerMessages[0].content}\n\n`;
            }

            // Additional details (subsequent messages if any)
            if (customerMessages.length > 1) {
              description += '**Additional Information:**\n';
              customerMessages.slice(1).forEach((msg: any, index: number) => {
                description += `${index + 1}. ${msg.content}\n`;
              });
              description += '\n';
            }

            // Add metadata
            description += '---\n';
            description += `*This ticket was created from conversation with ${customerMessages.length} customer message(s)*\n`;
            description += `*Conversation ID: ${this.conversationId}*`;

            this.formData.description = description;
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

  validate(): boolean {
    this.errors = {};

    if (!this.formData.subject || !this.formData.subject.trim()) {
      this.errors['subject'] = 'Subject is required';
    }

    if (!this.formData.description || !this.formData.description.trim()) {
      this.errors['description'] = 'Description is required';
    }

    if (!this.formData.category) {
      this.errors['category'] = 'Category is required';
    }

    if (!this.formData.customerPhone || !this.formData.customerPhone.trim()) {
      this.errors['customerPhone'] = 'Customer phone is required';
    }

    return Object.keys(this.errors).length === 0;
  }

  onSubmit() {
    if (!this.validate()) {
      this.toast.error('Please fix the validation errors');
      return;
    }

    this.submitting = true;

    const ticketData: any = {
      subject: this.formData.subject,
      description: this.formData.description,
      category: this.formData.category,
      priority: this.formData.priority,
      customerPhone: this.formData.customerPhone,
      customerId: this.customerId || undefined,
      conversationId: this.conversationId || undefined
    };

    this.ticketService.createTicket(ticketData).subscribe({
      next: (ticket) => {
        this.toast.success(`Ticket ${ticket.ticketId} created successfully`);
        this.saved.emit(ticket);
        this.onClose();
      },
      error: (err) => {
        console.error('Error creating ticket:', err);
        const message = err.error?.error || 'Failed to create ticket';
        this.toast.error(message);
        this.submitting = false;
      }
    });
  }

  onClose() {
    this.close.emit();
  }

  stopPropagation(event: Event) {
    event.stopPropagation();
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
