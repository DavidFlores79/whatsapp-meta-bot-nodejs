import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TemplateService, Template, TemplateFilters, TemplateStats } from '../../../services/template';

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './template-list.html',
  styleUrls: ['./template-list.css']
})
export class TemplateListComponent implements OnInit {
  templates: Template[] = [];
  filteredTemplates: Template[] = [];
  loading = false;
  syncing = false;
  error: string | null = null;
  successMessage: string | null = null;

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

  constructor(
    private templateService: TemplateService,
    private router: Router
  ) {}

  ngOnInit() {
    this.statuses = this.templateService.getStatuses();
    this.categories = this.templateService.getCategories();
    this.languages = this.templateService.getLanguages();
    this.loadTemplates();
    this.loadStats();
  }

  loadTemplates() {
    this.loading = true;
    this.error = null;

    const filters = { ...this.filters };
    // Remove empty filters
    Object.keys(filters).forEach(key => {
      if (!filters[key as keyof TemplateFilters]) {
        delete filters[key as keyof TemplateFilters];
      }
    });

    this.templateService.getTemplates(filters).subscribe({
      next: (response) => {
        this.templates = response.data;
        this.applySearch();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.error = 'Failed to load templates';
        this.loading = false;
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
    this.error = null;
    this.successMessage = null;

    this.templateService.syncTemplates().subscribe({
      next: (response) => {
        this.syncing = false;
        this.successMessage = `Sync completed: ${response.data.created} created, ${response.data.updated} updated, ${response.data.failed} failed`;
        this.loadTemplates();
        this.loadStats();

        setTimeout(() => {
          this.successMessage = null;
        }, 5000);
      },
      error: (err) => {
        console.error('Error syncing templates:', err);
        this.error = 'Failed to sync templates';
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
  }

  closeSendModal() {
    this.showSendModal = false;
    this.selectedTemplate = null;
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
        this.successMessage = 'Template updated successfully';
        this.loadTemplates();
        setTimeout(() => {
          this.successMessage = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error updating template:', err);
        this.error = 'Failed to update template';
      }
    });
  }

  deleteTemplate(template: Template) {
    if (!confirm(`Are you sure you want to delete template "${template.name}"?`)) {
      return;
    }

    this.templateService.deleteTemplate(template._id).subscribe({
      next: (response) => {
        this.successMessage = 'Template deleted successfully';
        this.loadTemplates();
        setTimeout(() => {
          this.successMessage = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error deleting template:', err);
        this.error = 'Failed to delete template';
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
