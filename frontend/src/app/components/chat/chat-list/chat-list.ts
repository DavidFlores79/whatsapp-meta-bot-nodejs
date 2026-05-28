import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService, Agent } from '../../../services/auth';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, StatusBadgeComponent],
  templateUrl: './chat-list.html',
  styleUrls: ['./chat-list.css']
})
export class ChatListComponent implements OnInit {
  chats$: Observable<Chat[]>;
  selectedChatId$: Observable<string | null>;
  currentAgent$: Observable<Agent | null>;

  activeTab: 'queue' | 'mine' | 'all' = 'queue';
  statusFilter: string = 'all';

  queueChats$: Observable<Chat[]>;
  myChats$: Observable<Chat[]>;

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) {
    this.chats$ = this.chatService.chats$;
    this.selectedChatId$ = this.chatService.selectedChat$.pipe(
      map(chat => chat ? chat.id : null)
    );
    this.currentAgent$ = this.authService.currentAgent$;

    // Filter chats based on assignment
    this.queueChats$ = this.chats$.pipe(
      map(chats => chats.filter(chat => !chat.assignedAgent))
    );

    this.myChats$ = this.chats$.pipe(
      map(chats => {
        let currentAgentId: string | null = null;
        this.authService.currentAgent$.subscribe(agent => {
          currentAgentId = agent?._id || null;
        }).unsubscribe();

        return chats.filter(chat => {
          if (!chat.assignedAgent || !currentAgentId) return false;
          const assignedAgentId = typeof chat.assignedAgent === 'string'
            ? chat.assignedAgent
            : chat.assignedAgent._id;
          return assignedAgentId === currentAgentId;
        });
      })
    );
  }

  ngOnInit() { }

  selectChat(id: string) {
    this.chatService.selectChat(id);
  }

  setActiveTab(tab: 'queue' | 'mine' | 'all') {
    this.activeTab = tab;
  }

  setStatusFilter(status: string) {
    this.statusFilter = status;
  }

  getDisplayChats(): Observable<Chat[]> {
    let baseChats$: Observable<Chat[]>;

    switch (this.activeTab) {
      case 'queue':
        baseChats$ = this.queueChats$;
        break;
      case 'mine':
        baseChats$ = this.myChats$;
        break;
      case 'all':
      default:
        baseChats$ = this.chats$;
    }

    // Apply status filter
    if (this.statusFilter !== 'all') {
      return baseChats$.pipe(
        map(chats => chats.filter(chat => chat.status === this.statusFilter))
      );
    }

    return baseChats$;
  }

  getAvatarInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#1E88E5', '#43A047', '#E53935', '#8E24AA',
      '#F4511E', '#039BE5', '#00897B', '#FB8C00',
      '#6D4C41', '#546E7A'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }
}
