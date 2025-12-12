import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { timeout, catchError, finalize } from 'rxjs/operators';
import { throwError, of } from 'rxjs';

interface AgentPerformance {
  analytics: {
    totalAssignments: number;
    analyzedAssignments: number;
    totalDuration: number;
    averageDuration: number;
    performance: {
      overallScore: number;
      professionalism: number;
      responsiveness: number;
      knowledgeability: number;
      empathy: number;
      problemSolving: number;
    };
    resolution: {
      totalResolved: number;
      resolutionRate: number;
      qualityBreakdown: any;
    };
    sentiment: {
      improved: number;
      worsened: number;
      unchanged: number;
      improvementRate: number;
    };
    commonStrengths: Array<{ item: string; count: number }>;
    commonImprovements: Array<{ item: string; count: number }>;
    riskLevels: any;
  };
  recentAssignments: any[];
}

interface ConversationHistory {
  history: any[];
  stats: {
    totalAssignments: number;
    totalDuration: number;
    averageDuration: number;
    uniqueAgents: number;
    resolvedCount: number;
    averagePerformanceScore: number;
  };
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent implements OnInit {
  private apiUrl = '/api/v2';

  activeTab: 'agent-performance' | 'conversation-history' = 'agent-performance';

  // Agent Performance
  selectedAgentId: string = '';
  agentPerformance: AgentPerformance | null = null;
  loadingPerformance = false;

  // Conversation History
  selectedConversationId: string = '';
  conversationHistory: ConversationHistory | null = null;
  loadingHistory = false;

  // Filters
  dateRange = {
    startDate: '',
    endDate: ''
  };

  agents: any[] = [];
  conversations: any[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadAgents();
    this.loadConversations();

    // Set default agent to current user
    const currentAgent = this.authService.getCurrentAgent();
    if (currentAgent) {
      this.selectedAgentId = currentAgent._id;
      this.loadAgentPerformance();
    }
  }

  loadAgents() {
    this.http.get<any>(`${this.apiUrl}/agents`).subscribe({
      next: (response) => {
        this.agents = response.agents || [];
      },
      error: (err) => {
        console.error('Failed to load agents:', err);
      }
    });
  }

  loadConversations() {
    console.log('[Reports] Loading conversations...');
    this.http.get<any>(`${this.apiUrl}/conversations?limit=100`).subscribe({
      next: (response) => {
        console.log('[Reports] Conversations loaded:', response);
        this.conversations = response.conversations || [];
        console.log('[Reports] Total conversations:', this.conversations.length);
      },
      error: (err) => {
        console.error('[Reports] Failed to load conversations:', err);
        this.toastService.error('Failed to load conversations');
      }
    });
  }

  loadAgentPerformance() {
    if (!this.selectedAgentId) {
      this.toastService.warning('Please select an agent');
      return;
    }

    this.loadingPerformance = true;
    this.agentPerformance = null;

    let url = `${this.apiUrl}/agents/${this.selectedAgentId}/performance`;
    const params = new URLSearchParams();

    if (this.dateRange.startDate) params.append('startDate', this.dateRange.startDate);
    if (this.dateRange.endDate) params.append('endDate', this.dateRange.endDate);

    if (params.toString()) {
      url += '?' + params.toString();
    }

    console.log('[Reports] Loading agent performance from:', url);

    this.http.get<AgentPerformance>(url)
      .pipe(
        timeout(30000),
        catchError((err) => {
          console.error('[Reports] Failed to load agent performance:', err);
          let errorMessage = 'Failed to load performance data';
          if (err.name === 'TimeoutError') {
            errorMessage = 'Request timed out. Please try again.';
          } else if (err.error?.error) {
            errorMessage = err.error.error;
          }
          this.toastService.error(errorMessage);
          return throwError(() => err);
        }),
        finalize(() => {
          this.loadingPerformance = false;
        })
      )
      .subscribe({
        next: (data) => {
          console.log('[Reports] Agent performance loaded:', data);
          this.agentPerformance = data;
        },
        error: () => {
          this.agentPerformance = null;
        }
      });
  }

  loadConversationHistory() {
    if (!this.selectedConversationId) {
      this.toastService.warning('Please select a conversation');
      return;
    }

    console.log('[Reports] Loading conversation history for:', this.selectedConversationId);
    this.loadingHistory = true;
    this.conversationHistory = null; // Reset previous data

    const url = `${this.apiUrl}/conversations/${this.selectedConversationId}/assignment-history`;
    console.log('[Reports] Request URL:', url);

    this.http.get<ConversationHistory>(url)
      .pipe(
        timeout(30000), // 30 second timeout
        catchError((err) => {
          console.error('[Reports] Failed to load conversation history:', err);
          console.error('[Reports] Error status:', err.status);
          console.error('[Reports] Error message:', err.message);

          let errorMessage = 'Failed to load conversation history';
          if (err.name === 'TimeoutError') {
            errorMessage = 'Request timed out. Please try again.';
          } else if (err.error?.error) {
            errorMessage = err.error.error;
          } else if (err.message) {
            errorMessage = err.message;
          }

          this.toastService.error(errorMessage);
          return throwError(() => err);
        }),
        finalize(() => {
          console.log('[Reports] Request finalized');
          this.loadingHistory = false;
        })
      )
      .subscribe({
        next: (data) => {
          console.log('[Reports] Conversation history loaded successfully:', data);
          this.conversationHistory = data;
        },
        error: (err) => {
          console.error('[Reports] Final error handler:', err);
          this.conversationHistory = null;
        }
      });
  }

  switchTab(tab: 'agent-performance' | 'conversation-history') {
    this.activeTab = tab;
  }

  getScoreColor(score: number): string {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    if (score >= 4) return 'text-orange-500';
    return 'text-red-500';
  }

  getScoreBgColor(score: number): string {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900';
    if (score >= 6) return 'bg-yellow-100 dark:bg-yellow-900';
    if (score >= 4) return 'bg-orange-100 dark:bg-orange-900';
    return 'bg-red-100 dark:bg-red-900';
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString();
  }

  getSelectedAgentName(): string {
    const agent = this.agents.find(a => a._id === this.selectedAgentId);
    return agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown Agent';
  }

  getSelectedConversationName(): string {
    const conversation = this.conversations.find(c => c._id === this.selectedConversationId);
    if (conversation?.customerId) {
      return conversation.customerId.firstName || conversation.customerId.phoneNumber;
    }
    return 'Unknown Conversation';
  }

  exportToCSV() {
    this.toastService.info('Export feature coming soon!');
  }
}
