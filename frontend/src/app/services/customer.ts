import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface Customer {
  _id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  tags: string[];
  segment: 'vip' | 'regular' | 'new' | 'inactive';
  source: 'whatsapp' | 'referral' | 'website' | 'social_media' | 'other';
  status: 'active' | 'inactive' | 'blocked' | 'vip';
  isBlocked: boolean;
  blockReason?: string;
  notes?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  customFields?: { [key: string]: string };
  preferences?: {
    language: string;
    communicationHours?: {
      start: string;
      end: string;
    };
    preferredAgent?: string;
  };
  statistics?: {
    totalConversations: number;
    totalMessages: number;
    totalTickets: number;
    averageResponseTime: number;
    satisfactionScore?: number;
  };
  firstContact?: Date;
  lastInteraction?: Date;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerListResponse {
  success: boolean;
  customers: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CustomerDetailResponse {
  success: boolean;
  customer: Customer;
  statistics: {
    totalConversations: number;
    openConversations: number;
    resolvedConversations: number;
  };
  recentConversations: any[];
}

export interface CustomerStatsResponse {
  success: boolean;
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    vipCustomers: number;
    blockedCustomers: number;
    newThisMonth: number;
  };
  segments: Array<{
    _id: string;
    count: number;
  }>;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  segment?: string;
  tags?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiUrl = '/api/v2/customers';
  private selectedCustomerSubject = new BehaviorSubject<Customer | null>(null);

  selectedCustomer$ = this.selectedCustomerSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * List customers with filters and pagination
   */
  listCustomers(filters: CustomerFilters = {}): Observable<CustomerListResponse> {
    let params = new HttpParams();

    Object.keys(filters).forEach(key => {
      const value = (filters as any)[key];
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });

    return this.http.get<CustomerListResponse>(this.apiUrl, { params });
  }

  /**
   * Get customer details with statistics
   */
  getCustomer(id: string): Observable<CustomerDetailResponse> {
    return this.http.get<CustomerDetailResponse>(`${this.apiUrl}/${id}`).pipe(
      tap(response => {
        if (response.success) {
          this.selectedCustomerSubject.next(response.customer);
        }
      })
    );
  }

  /**
   * Create new customer
   */
  createCustomer(customerData: Partial<Customer>): Observable<{ success: boolean; customer: Customer }> {
    return this.http.post<{ success: boolean; customer: Customer }>(this.apiUrl, customerData);
  }

  /**
   * Update customer
   */
  updateCustomer(id: string, updates: Partial<Customer>): Observable<{ success: boolean; customer: Customer }> {
    return this.http.put<{ success: boolean; customer: Customer }>(`${this.apiUrl}/${id}`, updates).pipe(
      tap(response => {
        if (response.success) {
          this.selectedCustomerSubject.next(response.customer);
        }
      })
    );
  }

  /**
   * Update customer tags
   */
  updateCustomerTags(
    id: string,
    tags: string[],
    action: 'set' | 'add' | 'remove' = 'set'
  ): Observable<{ success: boolean; customer: Customer }> {
    return this.http.patch<{ success: boolean; customer: Customer }>(
      `${this.apiUrl}/${id}/tags`,
      { tags, action }
    );
  }

  /**
   * Block or unblock customer
   */
  toggleBlockCustomer(
    id: string,
    isBlocked: boolean,
    blockReason?: string
  ): Observable<{ success: boolean; customer: Customer }> {
    return this.http.patch<{ success: boolean; customer: Customer }>(
      `${this.apiUrl}/${id}/block`,
      { isBlocked, blockReason }
    );
  }

  /**
   * Delete customer (soft delete by default)
   */
  deleteCustomer(id: string, permanent: boolean = false): Observable<{ success: boolean; message: string }> {
    const params = new HttpParams().set('permanent', permanent.toString());
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`, { params });
  }

  /**
   * Reactivate customer (change status from inactive to active)
   */
  reactivateCustomer(id: string): Observable<{ success: boolean; message: string; customer: Customer }> {
    return this.http.patch<{ success: boolean; message: string; customer: Customer }>(
      `${this.apiUrl}/${id}/reactivate`,
      {}
    ).pipe(
      tap(response => {
        if (response.success) {
          this.selectedCustomerSubject.next(response.customer);
        }
      })
    );
  }

  /**
   * Get customer conversations
   */
  getCustomerConversations(
    id: string,
    page: number = 1,
    limit: number = 20
  ): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get(`${this.apiUrl}/${id}/conversations`, { params });
  }

  /**
   * Get customer statistics for dashboard
   */
  getCustomerStats(): Observable<CustomerStatsResponse> {
    return this.http.get<CustomerStatsResponse>(`${this.apiUrl}/stats/summary`);
  }

  /**
   * Bulk import customers from file
   */
  importCustomersFromFile(
    file: File,
    updateExisting: boolean = false
  ): Observable<{
    success: boolean;
    message: string;
    results: {
      total: number;
      imported: number;
      updated: number;
      duplicates: number;
      failed: number;
    };
    details: {
      success: Array<{ row: number; phoneNumber: string; id: string }>;
      updated: Array<{ row: number; phoneNumber: string; id: string }>;
      duplicates: Array<{ row: number; phoneNumber: string; reason: string }>;
      failed: Array<{ row: number; data: any; reason: string }>;
    };
  }> {
    const formData = new FormData();
    formData.append('file', file);
    if (updateExisting) {
      formData.append('updateExisting', 'true');
    }

    return this.http.post<any>(`${this.apiUrl}/bulk/import`, formData);
  }

  /**
   * Download import template
   */
  downloadImportTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/template`, {
      responseType: 'blob'
    });
  }

  /**
   * Export customers to file
   */
  exportCustomersToFile(
    format: 'xlsx' | 'csv' = 'xlsx',
    filters: CustomerFilters = {}
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format);

    Object.keys(filters).forEach(key => {
      const value = (filters as any)[key];
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });

    return this.http.get(`${this.apiUrl}/export`, {
      params,
      responseType: 'blob'
    });
  }

  /**
   * Bulk import customers (legacy - kept for backward compatibility)
   */
  bulkImportCustomers(customers: Partial<Customer>[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/bulk/import`, { customers });
  }

  /**
   * Export customers (legacy - kept for backward compatibility)
   */
  exportCustomers(format: 'json' | 'csv' = 'json', filters: CustomerFilters = {}): string {
    let params = new HttpParams().set('format', format);

    Object.keys(filters).forEach(key => {
      const value = (filters as any)[key];
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, value.toString());
      }
    });

    // Return URL for download
    return `${this.apiUrl}/export?${params.toString()}`;
  }

  /**
   * Clear selected customer
   */
  clearSelection(): void {
    this.selectedCustomerSubject.next(null);
  }

  /**
   * Search customers (convenience method)
   */
  searchCustomers(searchTerm: string): Observable<CustomerListResponse> {
    return this.listCustomers({ search: searchTerm, limit: 10 });
  }

  /**
   * Get available segments
   */
  getSegments(): string[] {
    return ['vip', 'regular', 'new', 'inactive'];
  }

  /**
   * Get available statuses
   */
  getStatuses(): string[] {
    return ['active', 'inactive', 'blocked', 'vip'];
  }

  /**
   * Get available sources
   */
  getSources(): string[] {
    return ['whatsapp', 'referral', 'website', 'social_media', 'other'];
  }

  /**
   * Format customer display name
   */
  getCustomerDisplayName(customer: Customer): string {
    if (customer.firstName && customer.lastName) {
      return `${customer.firstName} ${customer.lastName}`;
    }
    if (customer.firstName) {
      return customer.firstName;
    }
    return customer.phoneNumber;
  }

  /**
   * Get badge color for segment
   */
  getSegmentColor(segment: string): string {
    const colors: { [key: string]: string } = {
      'vip': 'bg-yellow-500 text-yellow-900',
      'regular': 'bg-blue-500 text-blue-900',
      'new': 'bg-green-500 text-green-900',
      'inactive': 'bg-gray-500 text-gray-900'
    };
    return colors[segment] || 'bg-gray-500 text-gray-900';
  }

  /**
   * Get badge color for status
   */
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'active': 'bg-green-500 text-green-900',
      'inactive': 'bg-gray-500 text-gray-900',
      'blocked': 'bg-red-500 text-red-900',
      'vip': 'bg-purple-500 text-purple-900'
    };
    return colors[status] || 'bg-gray-500 text-gray-900';
  }
}
