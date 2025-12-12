import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { TemplateService, Template, SendTemplateRequest } from '../../../services/template';

@Component({
  selector: 'app-template-sender',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './template-sender.html',
  styleUrls: ['./template-sender.css']
})
export class TemplateSenderComponent implements OnInit {
  @Input() customerId!: string;
  @Output() templateSent = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  templates: Template[] = [];
  approvedTemplates: Template[] = [];
  selectedTemplate: Template | null = null;
  parameters: string[] = [];
  sending = false;
  error: string | null = null;
  successMessage: string | null = null;
  loading = false;

  searchTerm = '';
  filteredTemplates: Template[] = [];

  constructor(private templateService: TemplateService) {}

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loading = true;
    this.templateService.getTemplates({ status: 'APPROVED' }).subscribe({
      next: (response) => {
        this.templates = response.data;
        this.approvedTemplates = response.data.filter(t => t.status === 'APPROVED');
        this.filteredTemplates = this.approvedTemplates;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.error = 'Failed to load templates';
        this.loading = false;
      }
    });
  }

  onSearchChange() {
    if (!this.searchTerm) {
      this.filteredTemplates = this.approvedTemplates;
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredTemplates = this.approvedTemplates.filter(template =>
      template.name.toLowerCase().includes(term) ||
      template.description?.toLowerCase().includes(term) ||
      template.category.toLowerCase().includes(term)
    );
  }

  selectTemplate(template: Template) {
    this.selectedTemplate = template;
    this.parameters = new Array(this.getParameterCount(template)).fill('');
    this.error = null;
  }

  backToList() {
    this.selectedTemplate = null;
    this.parameters = [];
    this.error = null;
    this.successMessage = null;
  }

  getParameterCount(template: Template): number {
    return this.templateService.getParameterCount(template);
  }

  getTemplateText(template: Template): string {
    return this.templateService.getTemplateText(template);
  }

  getTemplatePreview(): string {
    if (!this.selectedTemplate) return '';
    return this.templateService.getTemplatePreview(this.selectedTemplate, this.parameters);
  }

  getCategoryClass(category: string): string {
    const classes: { [key: string]: string } = {
      'MARKETING': 'bg-purple-100 text-purple-800',
      'UTILITY': 'bg-blue-100 text-blue-800',
      'AUTHENTICATION': 'bg-indigo-100 text-indigo-800'
    };
    return classes[category] || 'bg-gray-100 text-gray-800';
  }

  canSend(): boolean {
    if (!this.selectedTemplate) return false;

    const paramCount = this.getParameterCount(this.selectedTemplate);
    if (paramCount === 0) return true;

    return this.parameters.every(param => param && param.trim().length > 0);
  }

  sendTemplate() {
    if (!this.selectedTemplate || !this.canSend()) {
      return;
    }

    this.sending = true;
    this.error = null;
    this.successMessage = null;

    const request: SendTemplateRequest = {
      templateId: this.selectedTemplate._id,
      customerId: this.customerId,
      parameters: this.parameters.filter(p => p.trim().length > 0)
    };

    this.templateService.sendTemplate(request).subscribe({
      next: (response) => {
        this.sending = false;
        if (response.success) {
          this.successMessage = 'Template sent successfully';
          this.templateSent.emit();

          setTimeout(() => {
            this.onClose();
          }, 1500);
        } else {
          this.error = response.message || 'Failed to send template';
        }
      },
      error: (err) => {
        console.error('Error sending template:', err);
        this.error = err.error?.message || 'Failed to send template';
        this.sending = false;
      }
    });
  }

  onClose() {
    this.close.emit();
  }
}
