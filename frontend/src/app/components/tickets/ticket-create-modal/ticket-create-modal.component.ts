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
  @Input() customerId: string | null = null;
  @Input() conversationId: string | null = null;
  @Input() customerPhone: string | null = null;
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

          const customerMessages: string[] = backendMessages
            .filter((m: any) => m.direction === 'in' || m.sender === 'customer')
            .slice(-10)
            .map((m: any) => m.content || '');

          this.conversationMessages = customerMessages;

          if (customerMessages.length > 0 && !this.formData.subject) {
            const lastMessage = customerMessages[customerMessages.length - 1];
            this.formData.subject = lastMessage.substring(0, 50) + (lastMessage.length > 50 ? '...' : '');
          }

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
