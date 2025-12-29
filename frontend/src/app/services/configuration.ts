import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';

export interface TicketCategory {
  id: string;
  label: string;
  labelEn?: string;
  icon: string;
  color: string;
  description: string;
}

export interface AssistantConfiguration {
  assistantName: string;
  companyName: string;
  primaryServiceIssue: string;
  serviceType: string;
  ticketNoun: string;
  ticketNounPlural: string;
  greetingMessage?: string;
  language: 'es' | 'en';
}

export interface TicketTerminology {
  ticketSingular: string;
  ticketPlural: string;
  createVerb: string;
  customerNoun: string;
  agentNoun: string;
  resolveVerb: string;
}

export interface TicketIdFormat {
  prefix: string;
  includeYear: boolean;
  padLength: number;
  separator: string;
}

export interface InstructionsPreview {
  template: string;
  interpolated: string;
  variables: Record<string, string>;
}

export interface IndustryPreset {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  categories: TicketCategory[];
  assistantConfig: AssistantConfiguration;
  terminology: TicketTerminology;
  idFormat: TicketIdFormat;
}

export interface ConfigurationResponse {
  success: boolean;
  data: any;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigurationService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v2/config';

  // Cache configuration data with TTL (5 minutes as per backend)
  private categoriesSubject = new BehaviorSubject<TicketCategory[]>([]);
  private assistantConfigSubject = new BehaviorSubject<AssistantConfiguration | null>(null);
  private terminologySubject = new BehaviorSubject<TicketTerminology | null>(null);
  private idFormatSubject = new BehaviorSubject<TicketIdFormat | null>(null);
  private presetsSubject = new BehaviorSubject<IndustryPreset[]>([]);
  private instructionsTemplateSubject = new BehaviorSubject<string>('');

  // Observable streams
  categories$ = this.categoriesSubject.asObservable();
  assistantConfig$ = this.assistantConfigSubject.asObservable();
  terminology$ = this.terminologySubject.asObservable();
  idFormat$ = this.idFormatSubject.asObservable();
  presets$ = this.presetsSubject.asObservable();
  instructionsTemplate$ = this.instructionsTemplateSubject.asObservable();

  // Cache metadata
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private lastFetch: { [key: string]: number } = {};

  constructor() {
    // Load initial configuration
    this.loadAllConfigurations();
  }

  /**
   * Load all configurations on service initialization
   */
  private loadAllConfigurations(): void {
    this.getTicketCategories().subscribe();
    this.getAssistantConfiguration().subscribe();
    this.getTerminology().subscribe();
    this.getTicketIdFormat().subscribe();
    this.getPresets().subscribe();
    this.getInstructionsTemplate().subscribe();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(key: string): boolean {
    const lastFetchTime = this.lastFetch[key];
    if (!lastFetchTime) return false;
    return Date.now() - lastFetchTime < this.cacheTTL;
  }

  /**
   * Update cache timestamp
   */
  private updateCacheTimestamp(key: string): void {
    this.lastFetch[key] = Date.now();
  }

  /**
   * Invalidate specific cache
   */
  invalidateCache(key?: string): void {
    if (key) {
      delete this.lastFetch[key];
    } else {
      // Invalidate all caches
      this.lastFetch = {};
    }
  }

  // ==================== Ticket Categories ====================

  getTicketCategories(forceRefresh = false): Observable<TicketCategory[]> {
    if (!forceRefresh && this.isCacheValid('categories') && this.categoriesSubject.value.length > 0) {
      return of(this.categoriesSubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/ticket-categories`).pipe(
      map(response => response.data || []),
      tap(categories => {
        this.categoriesSubject.next(categories);
        this.updateCacheTimestamp('categories');
      }),
      catchError(error => {
        console.error('Error fetching ticket categories:', error);
        return of([]);
      })
    );
  }

  updateTicketCategories(categories: TicketCategory[]): Observable<ConfigurationResponse> {
    return this.http.put<ConfigurationResponse>(`${this.apiUrl}/ticket-categories`, { categories }).pipe(
      tap(response => {
        if (response.success) {
          this.categoriesSubject.next(categories);
          this.invalidateCache('categories');
        }
      })
    );
  }

  // ==================== Assistant Configuration ====================

  getAssistantConfiguration(forceRefresh = false): Observable<AssistantConfiguration | null> {
    if (!forceRefresh && this.isCacheValid('assistant') && this.assistantConfigSubject.value) {
      return of(this.assistantConfigSubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/assistant`).pipe(
      map(response => response.data),
      tap(config => {
        this.assistantConfigSubject.next(config);
        this.updateCacheTimestamp('assistant');
      }),
      catchError(error => {
        console.error('Error fetching assistant configuration:', error);
        return of(null);
      })
    );
  }

  updateAssistantConfiguration(config: AssistantConfiguration): Observable<ConfigurationResponse> {
    return this.http.put<ConfigurationResponse>(`${this.apiUrl}/assistant`, { config }).pipe(
      tap(response => {
        if (response.success) {
          this.assistantConfigSubject.next(config);
          this.invalidateCache('assistant');
        }
      })
    );
  }

  // ==================== Terminology ====================

  getTerminology(forceRefresh = false): Observable<TicketTerminology | null> {
    if (!forceRefresh && this.isCacheValid('terminology') && this.terminologySubject.value) {
      return of(this.terminologySubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/terminology`).pipe(
      map(response => response.data),
      tap(terminology => {
        this.terminologySubject.next(terminology);
        this.updateCacheTimestamp('terminology');
      }),
      catchError(error => {
        console.error('Error fetching terminology:', error);
        return of(null);
      })
    );
  }

  updateTerminology(terminology: TicketTerminology): Observable<ConfigurationResponse> {
    return this.http.put<ConfigurationResponse>(`${this.apiUrl}/terminology`, terminology).pipe(
      tap(response => {
        if (response.success) {
          this.terminologySubject.next(terminology);
          this.invalidateCache('terminology');
        }
      })
    );
  }

  // ==================== Ticket ID Format ====================

  getTicketIdFormat(forceRefresh = false): Observable<TicketIdFormat | null> {
    if (!forceRefresh && this.isCacheValid('idFormat') && this.idFormatSubject.value) {
      return of(this.idFormatSubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/ticket-id-format`).pipe(
      map(response => response.data),
      tap(format => {
        this.idFormatSubject.next(format);
        this.updateCacheTimestamp('idFormat');
      }),
      catchError(error => {
        console.error('Error fetching ticket ID format:', error);
        return of(null);
      })
    );
  }

  updateTicketIdFormat(format: TicketIdFormat): Observable<ConfigurationResponse> {
    return this.http.put<ConfigurationResponse>(`${this.apiUrl}/ticket-id-format`, format).pipe(
      tap(response => {
        if (response.success) {
          this.idFormatSubject.next(format);
          this.invalidateCache('idFormat');
        }
      })
    );
  }

  // ==================== Instructions Template ====================

  getInstructionsTemplate(forceRefresh = false): Observable<string> {
    if (!forceRefresh && this.isCacheValid('instructions') && this.instructionsTemplateSubject.value) {
      return of(this.instructionsTemplateSubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/instructions-template`).pipe(
      map(response => response.data || ''),
      tap(template => {
        this.instructionsTemplateSubject.next(template);
        this.updateCacheTimestamp('instructions');
      }),
      catchError(error => {
        console.error('Error fetching instructions template:', error);
        return of('');
      })
    );
  }

  updateInstructionsTemplate(template: string): Observable<ConfigurationResponse> {
    return this.http.put<ConfigurationResponse>(`${this.apiUrl}/instructions-template`, { template }).pipe(
      tap(response => {
        if (response.success) {
          this.instructionsTemplateSubject.next(template);
          this.invalidateCache('instructions');
        }
      })
    );
  }

  getInstructionsPreview(): Observable<InstructionsPreview | null> {
    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/instructions-preview`).pipe(
      map(response => response.data as InstructionsPreview),
      catchError(error => {
        console.error('Error fetching instructions preview:', error);
        return of(null);
      })
    );
  }

  // ==================== Industry Presets ====================

  getPresets(forceRefresh = false): Observable<IndustryPreset[]> {
    if (!forceRefresh && this.isCacheValid('presets') && this.presetsSubject.value.length > 0) {
      return of(this.presetsSubject.value);
    }

    return this.http.get<ConfigurationResponse>(`${this.apiUrl}/presets`).pipe(
      map(response => response.data || []),
      tap(presets => {
        this.presetsSubject.next(presets);
        this.updateCacheTimestamp('presets');
      }),
      catchError(error => {
        console.error('Error fetching presets:', error);
        return of([]);
      })
    );
  }

  loadPreset(presetId: string): Observable<ConfigurationResponse> {
    return this.http.post<ConfigurationResponse>(`${this.apiUrl}/presets/load`, { presetId }).pipe(
      tap(response => {
        if (response.success) {
          // Invalidate all caches to force reload
          this.invalidateCache();
          this.loadAllConfigurations();
        }
      })
    );
  }

  // ==================== Reset Configuration ====================

  resetToDefaults(): Observable<ConfigurationResponse> {
    return this.http.post<ConfigurationResponse>(`${this.apiUrl}/reset`, {}).pipe(
      tap(response => {
        if (response.success) {
          // Invalidate all caches and reload
          this.invalidateCache();
          this.loadAllConfigurations();
        }
      })
    );
  }

  // ==================== OpenAI Sync ====================

  syncAssistant(syncInstructions = true, syncTools = true): Observable<ConfigurationResponse> {
    return this.http.post<ConfigurationResponse>(`${this.apiUrl}/sync-assistant`, {
      syncInstructions,
      syncTools
    });
  }

  // ==================== Helper Methods ====================

  /**
   * Get category by ID
   */
  getCategoryById(categoryId: string): TicketCategory | undefined {
    return this.categoriesSubject.value.find(cat => cat.id === categoryId);
  }

  /**
   * Get current terminology or default fallback
   */
  getCurrentTerminology(): TicketTerminology {
    return this.terminologySubject.value || {
      ticketSingular: 'ticket',
      ticketPlural: 'tickets',
      createVerb: 'crear',
      customerNoun: 'cliente',
      agentNoun: 'agente',
      resolveVerb: 'resolver'
    };
  }

  /**
   * Generate example ticket ID based on current format
   */
  generateExampleTicketId(): string {
    const format = this.idFormatSubject.value;
    if (!format) return 'TICKET-2025-000001';

    const parts = [format.prefix];
    if (format.includeYear) {
      parts.push(new Date().getFullYear().toString());
    }
    parts.push('0'.repeat(format.padLength) + '1');

    return parts.join(format.separator);
  }
}
