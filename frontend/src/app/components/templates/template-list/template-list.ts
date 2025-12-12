import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TemplateService, Template, TemplateFilters, TemplateStats } from '../../../services/template';
import { CustomerService, Customer } from '../../../services/customer';
import { ToastService } from '../../../services/toast';
@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './template-list.html',
  styleUrls: ['./template-list.css']
})
export class TemplateListComponent implements OnInit {
  templates: Template[] = [];
  filteredTemplates: Template[] = [];
  loading = false;
  syncing = false;
  // Filters
  filters: TemplateFilters = {
    status: '',
    category: '',
    language: '',
    tags: ''
  };
  searchTerm = '';
  showFilters = false;
  selectedTemplate: Template | null = null;
  showPreviewModal = false;
  showSendModal = false;
  // Filter options
  statuses: string[] = [];
  categories: string[] = [];
  languages: Array<{ code: string; name: string }> = [];
  // Statistics
  stats: TemplateStats | null = null;
  // Bulk send properties
  customers: Customer[] = [];
  selectedCustomers: Set<string> = new Set();
  bulkParameters: string[] = [];
  customerSearchTerm = '';
  filteredCustomers: Customer[] = [];
  isSendingBulk = false;
  bulkSendProgress = { sent: 0, total: 0 };
  showBulkProgress = false;
  constructor(
    private templateService: TemplateService,
    private customerService: CustomerService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}
  ngOnInit() {
    console.log('TemplateListComponent initialized');
    this.statuses = this.templateService.getStatuses();
    this.categories = this.templateService.getCategories();
    this.languages = this.templateService.getLanguages();
    this.loadTemplates();
    this.loadStats();
  }
  loadTemplates() {
    console.log('loadTemplates() called');
    this.loading = true;
    const filters = { ...this.filters };
    // Remove empty filters
    Object.keys(filters).forEach(key => {
      if (!filters[key as keyof TemplateFilters]) {
        delete filters[key as keyof TemplateFilters];
      }
    });
    console.log('Fetching templates with filters:', filters);
    this.templateService.getTemplates(filters).subscribe({
      next: (response) => {
        console.log('Templates loaded successfully:', response);
        this.templates = response.data;
        this.applySearch();
        this.loading = false;
        console.log('Loading state after set to false:', this.loading);
        console.log('Filtered templates:', this.filteredTemplates);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.toast.error(`Failed to load templates: ${err.message || err.status || 'Unknown error'}`);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
  loadStats() {
    this.templateService.getTemplateStats().subscribe({
      next: (response) => {
        this.stats = response.data;
      },
      error: (err) => {
        console.error('Error loading stats:', err);
      }
    });
  }
  syncTemplates() {
    if (!confirm('Sync templates from WhatsApp Business API? This will update all templates.')) {
      return;
    }
    this.syncing = true;
    this.templateService.syncTemplates().subscribe({
      next: (response) => {
        this.syncing = false;
        this.toast.success(`Sync completed: ${response.data.created} created, ${response.data.updated} updated, ${response.data.failed} failed`, 8000);
        this.loadTemplates();
        this.loadStats();
        setTimeout(() => {
        }, 5000);
      },
      error: (err) => {
        console.error('Error syncing templates:', err);
        this.toast.error('Failed to sync templates');
        this.syncing = false;
      }
    });
  }
  applySearch() {
    if (!this.searchTerm) {
      this.filteredTemplates = this.templates;
      return;
    }
    const term = this.searchTerm.toLowerCase();
    this.filteredTemplates = this.templates.filter(template =>
      template.name.toLowerCase().includes(term) ||
      template.description?.toLowerCase().includes(term) ||
      template.tags.some(tag => tag.toLowerCase().includes(term))
    );
  }
  onSearchChange() {
    this.applySearch();
  }
  applyFilters() {
    this.loadTemplates();
    this.showFilters = false;
  }
  clearFilters() {
    this.filters = {
      status: '',
      category: '',
      language: '',
      tags: ''
    };
    this.searchTerm = '';
    this.loadTemplates();
  }
  toggleFilters() {
    this.showFilters = !this.showFilters;
  }
  previewTemplate(template: Template) {
    this.selectedTemplate = template;
    this.showPreviewModal = true;
  }
  closePreviewModal() {
    this.showPreviewModal = false;
    this.selectedTemplate = null;
  }
  openSendModal(template: Template) {
    this.selectedTemplate = template;
    this.showSendModal = true;
    this.loadCustomers();
    this.initializeBulkParameters(template);
  }
  closeSendModal() {
    this.showSendModal = false;
    this.selectedTemplate = null;
    this.selectedCustomers.clear();
    this.bulkParameters = [];
    this.customerSearchTerm = '';
    this.showBulkProgress = false;
  }
  loadCustomers() {
    this.customerService.listCustomers({ limit: 1000 }).subscribe({
      next: (response) => {
        this.customers = response.customers;
        this.filteredCustomers = this.customers;
      },
      error: (err) => {
        console.error('Error loading customers:', err);
        this.toast.error('Failed to load customers');
      }
    });
  }
  initializeBulkParameters(template: Template) {
    const paramCount = this.getParameterCount(template);
    this.bulkParameters = new Array(paramCount).fill('');
  }
  onCustomerSearchChange() {
    if (!this.customerSearchTerm) {
      this.filteredCustomers = this.customers;
      return;
    }
    const term = this.customerSearchTerm.toLowerCase();
    this.filteredCustomers = this.customers.filter(customer =>
      customer.phoneNumber.includes(term) ||
      customer.firstName?.toLowerCase().includes(term) ||
      customer.lastName?.toLowerCase().includes(term) ||
      customer.email?.toLowerCase().includes(term)
    );
  }
  toggleCustomerSelection(customerId: string) {
    if (this.selectedCustomers.has(customerId)) {
      this.selectedCustomers.delete(customerId);
    } else {
      this.selectedCustomers.add(customerId);
    }
  }
  toggleAllCustomers() {
    if (this.selectedCustomers.size === this.filteredCustomers.length) {
      this.selectedCustomers.clear();
    } else {
      this.filteredCustomers.forEach(customer => {
        this.selectedCustomers.add(customer._id);
      });
    }
  }
  isCustomerSelected(customerId: string): boolean {
    return this.selectedCustomers.has(customerId);
  }
  sendBulkTemplate() {
    if (!this.selectedTemplate) return;
    if (this.selectedCustomers.size === 0) {
      this.toast.warning('Please select at least one customer');
      return;
    }
    // Validate parameters
    const paramCount = this.getParameterCount(this.selectedTemplate);
    if (paramCount > 0) {
      for (let i = 0; i < paramCount; i++) {
        if (!this.bulkParameters[i] || this.bulkParameters[i].trim() === '') {
          this.toast.warning(`Please fill in all parameters. Parameter ${i + 1} is empty.`);
          return;
        }
      }
    }
    if (!confirm(`Send template to ${this.selectedCustomers.size} customer(s)?`)) {
      return;
    }
    this.isSendingBulk = true;
    this.showBulkProgress = true;
    this.bulkSendProgress = { sent: 0, total: this.selectedCustomers.size };
    const request = {
      templateId: this.selectedTemplate._id,
      customerIds: Array.from(this.selectedCustomers),
      parameters: this.bulkParameters.filter(p => p.trim() !== '')
    };
    this.templateService.sendTemplateBulk(request).subscribe({
      next: (response) => {
        this.isSendingBulk = false;
        if (response.success) {
          this.toast.success(`Bulk send completed: ${response.data.sent} sent, ${response.data.failed} failed`, 8000);
          this.closeSendModal();
          this.loadTemplates();
        } else {
          this.toast.error(response.message || 'Failed to send bulk templates');
        }
        setTimeout(() => {
          this.showBulkProgress = false;
        }, 3000);
      },
      error: (err) => {
        console.error('Error sending bulk templates:', err);
        this.toast.error('Failed to send bulk templates');
        this.isSendingBulk = false;
        this.showBulkProgress = false;
      }
    });
  }
  getCustomerDisplayName(customer: Customer): string {
    return this.customerService.getCustomerDisplayName(customer);
  }
  getBulkTemplatePreview(): string {
    if (!this.selectedTemplate) return '';
    return this.templateService.getTemplatePreview(this.selectedTemplate, this.bulkParameters);
  }
  getStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'APPROVED': 'bg-green-100 text-green-800',
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'REJECTED': 'bg-red-100 text-red-800',
      'DISABLED': 'bg-gray-100 text-gray-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }
  getCategoryClass(category: string): string {
    const classes: { [key: string]: string } = {
      'MARKETING': 'bg-purple-100 text-purple-800',
      'UTILITY': 'bg-blue-100 text-blue-800',
      'AUTHENTICATION': 'bg-indigo-100 text-indigo-800'
    };
    return classes[category] || 'bg-gray-100 text-gray-800';
  }
  getTemplatePreview(template: Template): string {
    return this.templateService.getTemplateText(template);
  }
  getParameterCount(template: Template): number {
    return this.templateService.getParameterCount(template);
  }
  updateTemplate(template: Template, updates: Partial<Template>) {
    this.templateService.updateTemplate(template._id, updates).subscribe({
      next: (response) => {
        this.toast.success('Template updated successfully');
        this.loadTemplates();
        setTimeout(() => {
        }, 3000);
      },
      error: (err) => {
        console.error('Error updating template:', err);
        this.toast.error('Failed to update template');
      }
    });
  }
  deleteTemplate(template: Template) {
    if (!confirm(`Are you sure you want to delete template "${template.name}"?`)) {
      return;
    }
    this.templateService.deleteTemplate(template._id).subscribe({
      next: (response) => {
        this.toast.success('Template deleted successfully');
        this.loadTemplates();
        setTimeout(() => {
        }, 3000);
      },
      error: (err) => {
        console.error('Error deleting template:', err);
        this.toast.error('Failed to delete template');
      }
    });
  }
  formatDate(date: Date | undefined): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  getLanguageName(code: string): string {
    const lang = this.languages.find(l => l.code === code);
    return lang ? lang.name : code;
  }
  getStatusCount(status: string): number {
    if (!this.stats) return 0;
    const statusStat = this.stats.byStatus.find(s => s._id === status);
    return statusStat ? statusStat.count : 0;
  }
}
