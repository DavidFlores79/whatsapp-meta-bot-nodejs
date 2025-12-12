import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomerService, Customer, CustomerFilters } from '../../../services/customer';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-list.html',
  styleUrls: ['./customer-list.css']
})
export class CustomerListComponent implements OnInit {
  customers: Customer[] = [];
  loading = false;
  error: string | null = null;

  // Filters
  filters: CustomerFilters = {
    page: 1,
    limit: 20,
    search: '',
    status: '',
    segment: '',
    tags: '',
    sortBy: 'lastInteraction',
    sortOrder: 'desc'
  };

  // Pagination
  pagination = {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  };

  // Filter options
  statuses: string[] = [];
  segments: string[] = [];
  showFilters = false;
  showBulkActions = false;
  selectedCustomers: Set<string> = new Set();

  // Statistics
  stats = {
    totalCustomers: 0,
    activeCustomers: 0,
    vipCustomers: 0,
    blockedCustomers: 0,
    newThisMonth: 0
  };

  constructor(
    private customerService: CustomerService,
    private router: Router
  ) {}

  ngOnInit() {
    this.statuses = this.customerService.getStatuses();
    this.segments = this.customerService.getSegments();
    this.loadCustomers();
    this.loadStats();
  }

  loadCustomers() {
    this.loading = true;
    this.error = null;

    this.customerService.listCustomers(this.filters).subscribe({
      next: (response) => {
        this.customers = response.customers;
        this.pagination = response.pagination;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading customers:', err);
        this.error = 'Failed to load customers';
        this.loading = false;
      }
    });
  }

  loadStats() {
    this.customerService.getCustomerStats().subscribe({
      next: (response) => {
        this.stats = response.summary;
      },
      error: (err) => {
        console.error('Error loading stats:', err);
      }
    });
  }

  onSearch() {
    this.filters.page = 1;
    this.loadCustomers();
  }

  onFilterChange() {
    this.filters.page = 1;
    this.loadCustomers();
  }

  clearFilters() {
    this.filters = {
      page: 1,
      limit: 20,
      search: '',
      status: '',
      segment: '',
      tags: '',
      sortBy: 'lastInteraction',
      sortOrder: 'desc'
    };
    this.loadCustomers();
  }

  onSort(field: string) {
    if (this.filters.sortBy === field) {
      this.filters.sortOrder = this.filters.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.filters.sortBy = field;
      this.filters.sortOrder = 'desc';
    }
    this.loadCustomers();
  }

  onPageChange(page: number) {
    this.filters.page = page;
    this.loadCustomers();
  }

  viewCustomer(customer: Customer) {
    this.router.navigate(['/customers', customer._id]);
  }

  createCustomer() {
    this.router.navigate(['/customers/new']);
  }

  toggleSelectCustomer(customerId: string) {
    if (this.selectedCustomers.has(customerId)) {
      this.selectedCustomers.delete(customerId);
    } else {
      this.selectedCustomers.add(customerId);
    }
  }

  toggleSelectAll() {
    if (this.selectedCustomers.size === this.customers.length) {
      this.selectedCustomers.clear();
    } else {
      this.selectedCustomers.clear();
      this.customers.forEach(c => this.selectedCustomers.add(c._id));
    }
  }

  isSelected(customerId: string): boolean {
    return this.selectedCustomers.has(customerId);
  }

  get allSelected(): boolean {
    return this.customers.length > 0 && this.selectedCustomers.size === this.customers.length;
  }

  exportCustomers(format: 'json' | 'csv') {
    const url = this.customerService.exportCustomers(format, this.filters);
    window.open(url, '_blank');
  }

  deleteSelected() {
    if (this.selectedCustomers.size === 0) return;

    if (!confirm(`Delete ${this.selectedCustomers.size} customer(s)? This will deactivate them.`)) {
      return;
    }

    let completed = 0;
    const total = this.selectedCustomers.size;

    this.selectedCustomers.forEach(customerId => {
      this.customerService.deleteCustomer(customerId, false).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            this.selectedCustomers.clear();
            this.loadCustomers();
            this.loadStats();
          }
        },
        error: (err) => {
          console.error('Error deleting customer:', err);
          completed++;
          if (completed === total) {
            this.selectedCustomers.clear();
            this.loadCustomers();
            this.loadStats();
          }
        }
      });
    });
  }

  getCustomerName(customer: Customer): string {
    return this.customerService.getCustomerDisplayName(customer);
  }

  getSegmentColor(segment: string): string {
    return this.customerService.getSegmentColor(segment);
  }

  getStatusColor(status: string): string {
    return this.customerService.getStatusColor(status);
  }

  formatDate(date: Date | string | undefined): string {
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

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.pagination.page - Math.floor(maxPages / 2));
    let endPage = Math.min(this.pagination.pages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  toggleBulkActions() {
    this.showBulkActions = !this.showBulkActions;
  }
}
