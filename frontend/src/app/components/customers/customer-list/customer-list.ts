import { Component, OnInit, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CustomerService, Customer, CustomerFilters } from '../../../services/customer';
import { CustomerModalComponent } from '../customer-modal/customer-modal';
import { ImportCustomersModalComponent } from '../import-customers-modal/import-customers-modal';
import { ToastService } from '../../../services/toast';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CustomerModalComponent, ImportCustomersModalComponent],
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

  // Customer detail modal
  isCustomerModalOpen = false;
  selectedCustomerId?: string;

  // Import modal
  isImportModalOpen = false;

  // Export state
  isExporting = false;
  showImportExportDropdown = false;

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
    private router: Router,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.statuses = this.customerService.getStatuses();
    this.segments = this.customerService.getSegments();
    this.loadCustomers();
    this.loadStats();
  }

  loadCustomers() {
    console.log('loadCustomers() called');
    this.loading = true;
    this.error = null;

    this.customerService.listCustomers(this.filters).subscribe({
      next: (response) => {
        console.log('Customers loaded successfully:', response);
        this.customers = response.customers;
        this.pagination = response.pagination;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading customers:', err);
        this.error = 'Failed to load customers';
        this.loading = false;
        this.cdr.detectChanges();
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
    this.selectedCustomerId = customer._id;
    this.isCustomerModalOpen = true;
  }

  closeCustomerModal() {
    this.isCustomerModalOpen = false;
    this.selectedCustomerId = undefined;
  }

  onCustomerSaved(customer: Customer) {
    // Reload customers list to reflect any changes
    this.loadCustomers();
    this.loadStats();
  }

  createCustomer() {
    this.selectedCustomerId = undefined;
    this.isCustomerModalOpen = true;
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

  openImportModal() {
    this.isImportModalOpen = true;
    this.showImportExportDropdown = false;
  }

  closeImportModal() {
    this.isImportModalOpen = false;
  }

  onImportComplete() {
    this.loadCustomers();
    this.loadStats();
  }

  toggleImportExportDropdown() {
    this.showImportExportDropdown = !this.showImportExportDropdown;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Close dropdown when clicking outside
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside && this.showImportExportDropdown) {
      this.showImportExportDropdown = false;
      this.cdr.detectChanges();
    }
  }

  exportCustomers(format: 'xlsx' | 'csv') {
    // Close dropdown IMMEDIATELY
    this.showImportExportDropdown = false;
    this.cdr.detectChanges();

    // Then start export
    this.isExporting = true;

    this.customerService.exportCustomersToFile(format, this.filters).subscribe({
      next: (blob) => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        this.isExporting = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error exporting customers:', err);
        this.error = 'Failed to export customers';
        this.isExporting = false;
        this.cdr.detectChanges();
      }
    });
  }

  downloadTemplate() {
    this.showImportExportDropdown = false;

    this.customerService.downloadImportTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'customer_import_template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
      error: (err) => {
        console.error('Error downloading template:', err);
        this.error = 'Failed to download template';
      }
    });
  }

  deleteSelected() {
    if (this.selectedCustomers.size === 0) return;

    this.toast.warning(`Deleting ${this.selectedCustomers.size} customer(s)...`, 3000);

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

  reactivateSelected() {
    if (this.selectedCustomers.size === 0) return;

    this.toast.info(`Reactivating ${this.selectedCustomers.size} customer(s)...`, 3000);

    let completed = 0;
    let successful = 0;
    const total = this.selectedCustomers.size;

    this.selectedCustomers.forEach(customerId => {
      this.customerService.reactivateCustomer(customerId).subscribe({
        next: () => {
          completed++;
          successful++;
          if (completed === total) {
            this.selectedCustomers.clear();
            this.toast.success(`${successful} customer(s) reactivated successfully`, 3000);
            this.loadCustomers();
            this.loadStats();
          }
        },
        error: (err) => {
          console.error('Error reactivating customer:', err);
          completed++;
          if (completed === total) {
            this.selectedCustomers.clear();
            this.toast.warning(`${successful} of ${total} customer(s) reactivated`, 3000);
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
