import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface Agent {
  _id?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'supervisor' | 'agent';
  phoneNumber?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  isActive: boolean;
  maxConcurrentChats: number;
  autoAssign: boolean;
  permissions: string[];
  languages?: string[];
  avatar?: string;
  assignedConversations?: string[];
  statistics?: {
    totalConversations: number;
    resolvedConversations: number;
    averageResponseTime: number;
    averageResolutionTime: number;
    customerSatisfactionScore: number;
  };
  createdAt?: Date;
  lastActivity?: Date;
}

export interface CreateAgentRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'admin' | 'supervisor' | 'agent';
  phoneNumber?: string;
}

export interface UpdateAgentRequest {
  firstName?: string;
  lastName?: string;
  role?: 'admin' | 'supervisor' | 'agent';
  phoneNumber?: string;
  isActive?: boolean;
  maxConcurrentChats?: number;
  permissions?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AgentService {
  private apiUrl = '/api/v2/agents';
  private agentsSubject = new BehaviorSubject<Agent[]>([]);
  public agents$ = this.agentsSubject.asObservable();

  constructor(private http: HttpClient) {}

  getAllAgents(filters?: { status?: string; role?: string; isActive?: boolean }): Observable<{ agents: Agent[] }> {
    let params: any = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.role) params.role = filters.role;
      if (filters.isActive !== undefined) params.isActive = filters.isActive.toString();
    }

    return this.http.get<{ agents: Agent[] }>(this.apiUrl, { params }).pipe(
      tap(response => this.agentsSubject.next(response.agents))
    );
  }

  getAgentById(id: string): Observable<{ agent: Agent }> {
    return this.http.get<{ agent: Agent }>(`${this.apiUrl}/${id}`);
  }

  createAgent(data: CreateAgentRequest): Observable<{ agent: Agent }> {
    return this.http.post<{ agent: Agent }>(this.apiUrl, data).pipe(
      tap(() => this.getAllAgents().subscribe()) // Refresh list
    );
  }

  updateAgent(id: string, data: UpdateAgentRequest): Observable<{ agent: Agent }> {
    return this.http.patch<{ agent: Agent }>(`${this.apiUrl}/${id}`, data).pipe(
      tap(() => this.getAllAgents().subscribe()) // Refresh list
    );
  }

  deleteAgent(id: string): Observable<{ success: boolean; agent: Agent }> {
    return this.http.delete<{ success: boolean; agent: Agent }>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.getAllAgents().subscribe()) // Refresh list
    );
  }

  getAgentStatistics(id: string): Observable<{ statistics: any }> {
    return this.http.get<{ statistics: any }>(`${this.apiUrl}/${id}/statistics`);
  }
}
