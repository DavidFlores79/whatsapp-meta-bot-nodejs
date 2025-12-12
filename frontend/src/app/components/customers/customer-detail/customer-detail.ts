import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CustomerService, Customer, CustomerDetailResponse } from '../../../services/customer';
import { CustomerModalComponent } from '../customer-modal/customer-modal';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, TranslateModule, CustomerModalComponent],
  templateUrl: './customer-detail.html',
  styleUrls: ['./customer-detail.css']
})
export class CustomerDetailComponent implements OnInit {
  customer: Customer | null = null;
  statistics: any = null;
  recentConversations: any[] = [];
  loading = true;
  error: string | null = null;
  activeTab: 'overview' | 'conversations' | 'activity' = 'overview';
  isCustomerModalOpen = false;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private customerService: CustomerService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    const customerId = this.route.snapshot.paramMap.get('id');
    if (customerId) {
      this.loadCustomer(customerId);
    } else {
      this.error = 'No customer ID provided';
      this.loading = false;
    }
  }

  loadCustomer(id: string) {
    this.loading = true;
    this.error = null;

    this.customerService.getCustomer(id).subscribe({
      next: (response: CustomerDetailResponse) => {
        this.customer = response.customer;
        this.statistics = response.statistics;
        this.recentConversations = response.recentConversations;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading customer:', err);
        this.error = 'Failed to load customer details';
        this.loading = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/customers']);
  }

  editCustomer() {
    this.isCustomerModalOpen = true;
  }

  closeCustomerModal() {
    this.isCustomerModalOpen = false;
  }

  onCustomerSaved(customer: Customer) {
    // Reload customer data
    if (customer._id) {
      this.loadCustomer(customer._id);
    }
    console.log('Customer updated:', customer);
  }

  deleteCustomer() {
    this.showDeleteConfirm = true;
  }

  confirmDelete() {
    if (!this.customer) return;

    this.customerService.deleteCustomer(this.customer._id, false).subscribe({
      next: () => {
        this.router.navigate(['/customers']);
      },
      error: (err) => {
        console.error('Error deleting customer:', err);
        this.toastService.error('Failed to delete customer');
      }
    });
  }

  toggleBlock() {
    if (!this.customer) return;

    const newBlockedState = !this.customer.isBlocked;
    let blockReason = '';

    if (newBlockedState) {
      blockReason = prompt('Reason for blocking this customer:') || 'No reason provided';
    }

    this.customerService.toggleBlockCustomer(
      this.customer._id,
      newBlockedState,
      blockReason
    ).subscribe({
      next: (response) => {
        this.customer = response.customer;
      },
      error: (err) => {
        console.error('Error toggling block:', err);
        this.toastService.error('Failed to update customer status');
      }
    });
  }

  upgradeToVIP() {
    if (!this.customer) return;

    this.customerService.updateCustomer(this.customer._id, {
      segment: 'vip',
      status: 'vip'
    }).subscribe({
      next: (response) => {
        this.customer = response.customer;
      },
      error: (err) => {
        console.error('Error upgrading to VIP:', err);
        this.toastService.error('Failed to upgrade customer');
      }
    });
  }

  addTag() {
    if (!this.customer) return;

    const newTag = prompt('Enter new tag:');
    if (!newTag || newTag.trim() === '') return;

    this.customerService.updateCustomerTags(
      this.customer._id,
      [newTag.trim()],
      'add'
    ).subscribe({
      next: (response) => {
        this.customer = response.customer;
      },
      error: (err) => {
        console.error('Error adding tag:', err);
        this.toastService.error('Failed to add tag');
      }
    });
  }

  removeTag(tag: string) {
    if (!this.customer) return;

    this.customerService.updateCustomerTags(
      this.customer._id,
      [tag],
      'remove'
    ).subscribe({
      next: (response) => {
        this.customer = response.customer;
      },
      error: (err) => {
        console.error('Error removing tag:', err);
        this.toastService.error('Failed to remove tag');
      }
    });
  }

  viewConversation(conversationId: string) {
    this.router.navigate(['/'], { queryParams: { conversation: conversationId } });
  }

  getCustomerName(): string {
    if (!this.customer) return '';
    return this.customerService.getCustomerDisplayName(this.customer);
  }

  getSegmentColor(segment: string): string {
    return this.customerService.getSegmentColor(segment);
  }

  getStatusColor(status: string): string {
    return this.customerService.getStatusColor(status);
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  }

  formatRelativeDate(date: Date | string | undefined): string {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return d.toLocaleDateString();
  }

  get Math() {
    return Math;
  }

  get Object() {
    return Object;
  }
}
