import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService, Agent } from '../../../services/auth';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-list.html',
  styleUrls: ['./chat-list.css']
})
export class ChatListComponent implements OnInit {
  chats$: Observable<Chat[]>;
  selectedChatId$: Observable<string | null>;
  currentAgent$: Observable<Agent | null>;

  activeTab: 'queue' | 'mine' | 'all' = 'queue';

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

  getDisplayChats(): Observable<Chat[]> {
    switch (this.activeTab) {
      case 'queue':
        return this.queueChats$;
      case 'mine':
        return this.myChats$;
      case 'all':
      default:
        return this.chats$;
    }
  }
}
