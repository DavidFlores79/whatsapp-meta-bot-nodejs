import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerService, Customer } from '../../../services/customer';

@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-form.html',
  styleUrls: ['./customer-form.css']
})
export class CustomerFormComponent implements OnInit {
  customer: Partial<Customer> = {
    phoneNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    segment: 'new',
    source: 'whatsapp',
    status: 'active',
    tags: [],
    address: {},
    customFields: {},
    preferences: {
      language: 'es',
      communicationHours: {
        start: '09:00',
        end: '18:00'
      }
    }
  };

  isEditMode = false;
  customerId: string | null = null;
  loading = false;
  error: string | null = null;
  tagInput = '';

  segments = ['vip', 'regular', 'new', 'inactive'];
  sources = ['whatsapp', 'referral', 'website', 'social_media', 'other'];
  statuses = ['active', 'inactive', 'blocked', 'vip'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private customerService: CustomerService
  ) {}

  ngOnInit() {
    this.customerId = this.route.snapshot.paramMap.get('id');

    if (this.customerId && this.customerId !== 'new') {
      this.isEditMode = true;
      this.loadCustomer(this.customerId);
    }
  }

  loadCustomer(id: string) {
    this.loading = true;
    this.customerService.getCustomer(id).subscribe({
      next: (response) => {
        this.customer = response.customer;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading customer:', err);
        this.error = 'Failed to load customer';
        this.loading = false;
      }
    });
  }

  saveCustomer() {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;
    this.error = null;

    const operation = this.isEditMode && this.customerId
      ? this.customerService.updateCustomer(this.customerId, this.customer)
      : this.customerService.createCustomer(this.customer);

    operation.subscribe({
      next: (response) => {
        this.router.navigate(['/customers', response.customer._id]);
      },
      error: (err) => {
        console.error('Error saving customer:', err);
        this.error = err.error?.error || 'Failed to save customer';
        this.loading = false;
      }
    });
  }

  validateForm(): boolean {
    if (!this.customer.phoneNumber || this.customer.phoneNumber.trim() === '') {
      this.error = 'Phone number is required';
      return false;
    }

    if (this.customer.email && !this.isValidEmail(this.customer.email)) {
      this.error = 'Invalid email address';
      return false;
    }

    return true;
  }

  isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  addTag() {
    if (!this.tagInput || this.tagInput.trim() === '') return;

    const tag = this.tagInput.trim();
    if (!this.customer.tags) this.customer.tags = [];

    if (!this.customer.tags.includes(tag)) {
      this.customer.tags.push(tag);
      this.tagInput = '';
    }
  }

  removeTag(tag: string) {
    if (!this.customer.tags) return;
    this.customer.tags = this.customer.tags.filter(t => t !== tag);
  }

  cancel() {
    if (this.isEditMode && this.customerId) {
      this.router.navigate(['/customers', this.customerId]);
    } else {
      this.router.navigate(['/customers']);
    }
  }

  get Object() {
    return Object;
  }

  formatSource(source: string): string {
    return source.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
}
