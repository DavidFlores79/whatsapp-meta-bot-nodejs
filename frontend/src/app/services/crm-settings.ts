import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CRMSettings {
  autoTimeout: {
    open: number;
    assigned: number;
    waiting: number;
    resolved: number;
  };
  sla: {
    firstResponseTime: number;
    resolutionTime: number;
    enableAlerts: boolean;
  };
  priorityEscalation: {
    enabled: boolean;
    waitTimeThreshold: number;
    urgentKeywords: string;
    highKeywords: string;
    vipAutoEscalate: boolean;
    reassignmentThreshold: number;
  };
  resolutionConfirmation: {
    enabled: boolean;
    messageTemplate: string;
    autoCloseOnConfirm: boolean;
    autoCloseTimeout: number;
  };
  businessHours: {
    enabled: boolean;
    timezone: string;
    schedule: {
      monday: { start: string; end: string; enabled: boolean };
      tuesday: { start: string; end: string; enabled: boolean };
      wednesday: { start: string; end: string; enabled: boolean };
      thursday: { start: string; end: string; enabled: boolean };
      friday: { start: string; end: string; enabled: boolean };
      saturday: { start: string; end: string; enabled: boolean };
      sunday: { start: string; end: string; enabled: boolean };
    };
    afterHoursMessage: string;
  };
  lastModifiedAt?: Date;
  lastModifiedBy?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CRMSettingsService {
  private apiUrl = '/api/v2/crm-settings';

  constructor(private http: HttpClient) {}

  /**
   * Get current CRM settings
   */
  getSettings(): Observable<CRMSettings> {
    return this.http.get<CRMSettings>(this.apiUrl);
  }

  /**
   * Update CRM settings
   */
  updateSettings(settings: Partial<CRMSettings>): Observable<{ message: string; settings: CRMSettings }> {
    return this.http.put<{ message: string; settings: CRMSettings }>(this.apiUrl, settings);
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): Observable<{ message: string; settings: CRMSettings }> {
    return this.http.post<{ message: string; settings: CRMSettings }>(`${this.apiUrl}/reset`, {});
  }
}
