import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'PHONE_NUMBER' | 'URL';
    text: string;
    url?: string;
    phone_number?: string;
    example?: string[];
  }>;
}

export interface TemplateParameter {
  name: string;
  type: 'text' | 'currency' | 'date_time';
  position: number;
  component: 'HEADER' | 'BODY';
}

export interface Template {
  _id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: TemplateComponent[];
  parameters: TemplateParameter[];
  whatsappTemplateId?: string;
  namespace?: string;
  rejectionReason?: string;
  description?: string;
  tags: string[];
  usageCount: number;
  lastUsedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

export interface TemplateFilters {
  status?: string;
  category?: string;
  language?: string;
  tags?: string;
}

export interface TemplateStats {
  total: number;
  byStatus: Array<{ _id: string; count: number }>;
  byCategory: Array<{ _id: string; count: number }>;
  byLanguage: Array<{ _id: string; count: number }>;
  mostUsed: Array<{ _id: string; name: string; usageCount: number; lastUsedAt?: Date }>;
}

export interface SendTemplateRequest {
  templateId: string;
  customerId: string;
  parameters?: string[];
}

export interface SendTemplateBulkRequest {
  templateId: string;
  customerIds?: string[];
  parameters?: string[];
  filters?: {
    tags?: string[];
    status?: string;
  };
}

export interface SendTemplateResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface SyncTemplatesResponse {
  success: boolean;
  message: string;
  data: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: Array<{ template: string; error: string }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private apiUrl = '/api/v2/templates';

  constructor(private http: HttpClient) {}

  /**
   * Sync templates from Meta WhatsApp API
   */
  syncTemplates(): Observable<SyncTemplatesResponse> {
    return this.http.post<SyncTemplatesResponse>(`${this.apiUrl}/sync`, {});
  }

  /**
   * Get all templates with optional filters
   */
  getTemplates(filters?: TemplateFilters): Observable<{ success: boolean; data: Template[]; count: number }> {
    let params = new HttpParams();

    if (filters) {
      if (filters.status) params = params.set('status', filters.status);
      if (filters.category) params = params.set('category', filters.category);
      if (filters.language) params = params.set('language', filters.language);
      if (filters.tags) params = params.set('tags', filters.tags);
    }

    return this.http.get<{ success: boolean; data: Template[]; count: number }>(
      this.apiUrl,
      { params }
    );
  }

  /**
   * Get single template by ID
   */
  getTemplateById(id: string): Observable<{ success: boolean; data: Template }> {
    return this.http.get<{ success: boolean; data: Template }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Update template metadata
   */
  updateTemplate(id: string, updates: Partial<Template>): Observable<{ success: boolean; message: string; data: Template }> {
    return this.http.put<{ success: boolean; message: string; data: Template }>(
      `${this.apiUrl}/${id}`,
      updates
    );
  }

  /**
   * Delete template (soft delete)
   */
  deleteTemplate(id: string): Observable<{ success: boolean; message: string; data: Template }> {
    return this.http.delete<{ success: boolean; message: string; data: Template }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get template statistics
   */
  getTemplateStats(): Observable<{ success: boolean; data: TemplateStats }> {
    return this.http.get<{ success: boolean; data: TemplateStats }>(`${this.apiUrl}/stats`);
  }

  /**
   * Send template to single customer
   */
  sendTemplate(request: SendTemplateRequest): Observable<SendTemplateResponse> {
    return this.http.post<SendTemplateResponse>(`${this.apiUrl}/send`, request);
  }

  /**
   * Send template to multiple customers (bulk)
   */
  sendTemplateBulk(request: SendTemplateBulkRequest): Observable<SendTemplateResponse> {
    return this.http.post<SendTemplateResponse>(`${this.apiUrl}/send-bulk`, request);
  }

  /**
   * Get template categories
   */
  getCategories(): string[] {
    return ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
  }

  /**
   * Get template statuses
   */
  getStatuses(): string[] {
    return ['APPROVED', 'PENDING', 'REJECTED', 'DISABLED'];
  }

  /**
   * Get supported languages
   */
  getLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'es_MX', name: 'Spanish (Mexico)' },
      { code: 'en_US', name: 'English (US)' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'pt_BR', name: 'Portuguese (Brazil)' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' }
    ];
  }

  /**
   * Extract text from template components
   */
  getTemplateText(template: Template): string {
    const bodyComponent = template.components.find(c => c.type === 'BODY');
    return bodyComponent?.text || '';
  }

  /**
   * Get template preview text with parameter placeholders
   */
  getTemplatePreview(template: Template, parameters?: string[]): string {
    let text = this.getTemplateText(template);

    if (parameters && parameters.length > 0) {
      parameters.forEach((param, index) => {
        text = text.replace(`{{${index + 1}}}`, param);
      });
    }

    return text;
  }

  /**
   * Count parameters in template
   */
  getParameterCount(template: Template): number {
    return template.parameters.length;
  }
}
