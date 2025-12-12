import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CustomerService, Customer } from '../../../services/customer';

@Component({
  selector: 'app-customer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './customer-modal.html',
  styleUrls: ['./customer-modal.css']
})
export class CustomerModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() customerId?: string;
  @Input() phoneNumber?: string; // Pre-fill phone number from chat
  @Output() closeModal = new EventEmitter<void>();
  @Output() customerSaved = new EventEmitter<Customer>();

  customer: Partial<Customer> = {
    tags: [],
    customFields: {}
  };

  isLoading = false;
  errorMessage = '';
  successMessage = '';
  isEditMode = false;

  // Tag input
  newTag = '';

  // Source options
  sourceOptions = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'website', label: 'Website' },
    { value: 'referral', label: 'Referral' },
    { value: 'social_media', label: 'Social Media' },
    { value: 'advertising', label: 'Advertising' },
    { value: 'other', label: 'Other' }
  ];

  // Segment options
  segmentOptions = [
    { value: 'new', label: 'New', color: 'blue' },
    { value: 'regular', label: 'Regular', color: 'green' },
    { value: 'vip', label: 'VIP', color: 'purple' },
    { value: 'inactive', label: 'Inactive', color: 'gray' }
  ];

  constructor(
    private customerService: CustomerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initializeCustomer();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reset and reload when modal opens or customerId changes
    if (changes['isOpen'] && changes['isOpen'].currentValue) {
      this.initializeCustomer();
    } else if (changes['customerId'] && !changes['customerId'].firstChange) {
      this.initializeCustomer();
    }
  }

  initializeCustomer() {
    // Reset state
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = false;

    if (this.customerId) {
      this.isEditMode = true;
      this.loadCustomer();
    } else if (this.phoneNumber) {
      // Pre-fill phone number from chat
      this.isEditMode = false;
      this.customer = {
        phoneNumber: this.phoneNumber,
        source: 'whatsapp',
        segment: 'new',
        tags: [],
        customFields: {}
      };
    } else {
      // Default values for new customer
      this.isEditMode = false;
      this.customer = {
        source: 'whatsapp',
        segment: 'new',
        tags: [],
        customFields: {}
      };
    }
  }

  loadCustomer() {
    if (!this.customerId) return;

    this.isLoading = true;
    this.customerService.getCustomer(this.customerId).subscribe({
      next: (response: any) => {
        // API returns wrapped response: { success, customer, statistics, recentConversations }
        this.customer = { ...response.customer };
        this.isLoading = false;
        this.cdr.detectChanges(); // Manually trigger change detection
      },
      error: (error) => {
        console.error('Error loading customer:', error);
        this.errorMessage = `Failed to load customer details: ${error.message || error.error?.error || 'Unknown error'}`;
        this.isLoading = false;
        this.cdr.detectChanges(); // Manually trigger change detection
      }
    });
  }

  saveCustomer() {
    this.errorMessage = '';
    this.successMessage = '';

    // Validate required fields
    if (!this.customer.phoneNumber) {
      this.errorMessage = 'Phone number is required';
      return;
    }

    this.isLoading = true;

    const operation = this.isEditMode && this.customerId
      ? this.customerService.updateCustomer(this.customerId, this.customer)
      : this.customerService.createCustomer(this.customer);

    operation.subscribe({
      next: (response: any) => {
        this.successMessage = `Customer ${this.isEditMode ? 'updated' : 'created'} successfully!`;
        this.isLoading = false;

        // API returns wrapped response: { success, customer }
        const savedCustomer = response.customer || response;
        this.customerSaved.emit(savedCustomer);

        // Close modal after a short delay
        setTimeout(() => {
          this.close();
        }, 1000);
      },
      error: (error) => {
        console.error('Error saving customer:', error);
        this.errorMessage = error.error?.error || 'Failed to save customer';
        this.isLoading = false;
      }
    });
  }

  addTag() {
    if (this.newTag.trim() && !this.customer.tags?.includes(this.newTag.trim())) {
      this.customer.tags = [...(this.customer.tags || []), this.newTag.trim()];
      this.newTag = '';
    }
  }

  removeTag(tag: string) {
    this.customer.tags = this.customer.tags?.filter(t => t !== tag) || [];
  }

  close() {
    this.closeModal.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  get Object() {
    return Object;
  }
}
