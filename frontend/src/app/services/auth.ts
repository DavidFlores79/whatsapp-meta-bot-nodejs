import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface Agent {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'agent' | 'supervisor' | 'admin';
  avatar?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  phoneNumber?: string;
  autoAssign?: boolean;
  statistics: {
    activeAssignments: number;
    totalAssignments: number;
    totalMessages: number;
    averageResponseTime: number;
  };
}

export interface AuthResponse {
  agent: Agent;
  accessToken: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = '/api/v2/agents';

  private currentAgentSubject = new BehaviorSubject<Agent | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

  currentAgent$ = this.currentAgentSubject.asObservable();
  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor() {
    this.loadAgentFromStorage();
  }

  private loadAgentFromStorage() {
    const token = localStorage.getItem('accessToken');
    const agentData = localStorage.getItem('agent');

    if (token && agentData) {
      try {
        const agent = JSON.parse(agentData);
        this.currentAgentSubject.next(agent);
        this.isAuthenticatedSubject.next(true);
      } catch (e) {
        this.clearAuth();
      }
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, {
      email,
      password,
      deviceInfo: navigator.userAgent
    }).pipe(
      tap(response => {
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        localStorage.setItem('agent', JSON.stringify(response.agent));
        this.currentAgentSubject.next(response.agent);
        this.isAuthenticatedSubject.next(true);
      })
    );
  }

  logout(): Observable<any> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken }).pipe(
      tap(() => this.clearAuth())
    );
  }

  private clearAuth() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('agent');
    this.currentAgentSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  refreshAccessToken(): Observable<{ accessToken: string }> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post<{ accessToken: string }>(`${this.apiUrl}/auth/refresh`, {
      refreshToken
    }).pipe(
      tap(response => {
        localStorage.setItem('accessToken', response.accessToken);
      })
    );
  }

  updateStatus(status: Agent['status']): Observable<{ agent: Agent }> {
    return this.http.patch<{ agent: Agent }>(`${this.apiUrl}/status`, { status }).pipe(
      tap(response => {
        this.currentAgentSubject.next(response.agent);
        localStorage.setItem('agent', JSON.stringify(response.agent));
      })
    );
  }

  toggleAutoAssign(autoAssign: boolean): Observable<{ agent: Agent }> {
    return this.http.patch<{ agent: Agent }>(`${this.apiUrl}/profile`, { autoAssign }).pipe(
      tap(response => {
        this.currentAgentSubject.next(response.agent);
        localStorage.setItem('agent', JSON.stringify(response.agent));
      })
    );
  }

  updateAgentLanguage(languageCode: string): Observable<{ agent: Agent }> {
    return this.http.patch<{ agent: Agent }>(`${this.apiUrl}/profile`, {
      languages: [languageCode]
    }).pipe(
      tap(response => {
        this.currentAgentSubject.next(response.agent);
        localStorage.setItem('agent', JSON.stringify(response.agent));
      })
    );
  }

  getCurrentAgent(): Agent | null {
    return this.currentAgentSubject.value;
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }
}
