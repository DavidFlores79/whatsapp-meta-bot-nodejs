import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';

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
    this.http.get<any>(`${this.apiUrl}/conversations?limit=100`).subscribe({
      next: (response) => {
        this.conversations = response.conversations || [];
      },
      error: (err) => {
        console.error('Failed to load conversations:', err);
      }
    });
  }

  loadAgentPerformance() {
    if (!this.selectedAgentId) {
      this.toastService.warning('Please select an agent');
      return;
    }

    this.loadingPerformance = true;
    
    let url = `${this.apiUrl}/agents/${this.selectedAgentId}/performance`;
    const params = new URLSearchParams();
    
    if (this.dateRange.startDate) params.append('startDate', this.dateRange.startDate);
    if (this.dateRange.endDate) params.append('endDate', this.dateRange.endDate);
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    this.http.get<AgentPerformance>(url).subscribe({
      next: (data) => {
        this.agentPerformance = data;
        this.loadingPerformance = false;
      },
      error: (err) => {
        console.error('Failed to load agent performance:', err);
        this.toastService.error('Failed to load performance data');
        this.loadingPerformance = false;
      }
    });
  }

  loadConversationHistory() {
    if (!this.selectedConversationId) {
      this.toastService.warning('Please select a conversation');
      return;
    }

    this.loadingHistory = true;

    this.http.get<ConversationHistory>(`${this.apiUrl}/conversations/${this.selectedConversationId}/assignment-history`).subscribe({
      next: (data) => {
        this.conversationHistory = data;
        this.loadingHistory = false;
      },
      error: (err) => {
        console.error('Failed to load conversation history:', err);
        this.toastService.error('Failed to load conversation history');
        this.loadingHistory = false;
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
