import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { io } from 'socket.io-client';
import { AuthService, Agent } from './auth';

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  timestamp: Date;
  type?: string;
  attachments?: Array<{
    type: string;
    url: string;
    filename?: string;
    thumbnailUrl?: string;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    name?: string;
  };
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
  assignedAgent?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  isAIEnabled?: boolean;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private socket: any;
  private apiUrl = '/api/v2'; // Relative URL for same-port deployment
  private mockChats: Chat[] = [];

  private chatsSubject = new BehaviorSubject<Chat[]>(this.mockChats);
  private selectedChatIdSubject = new BehaviorSubject<string | null>(null);
  private typingSubject = new BehaviorSubject<any>(null);

  chats$ = this.chatsSubject.asObservable();
  selectedChat$ = this.selectedChatIdSubject.asObservable().pipe(
    map(chatId => this.mockChats.find(c => c.id === chatId) || null)
  );

  constructor(private http: HttpClient, private authService: AuthService) {
    this.initSocket();
    this.loadConversations();
  }

  private loadConversations() {
    this.http.get<any>(`${this.apiUrl}/conversations`).subscribe(
      (response) => {
        // Map backend conversation format to frontend Chat format
        const conversations = response.conversations || [];
        this.mockChats = conversations.map((conv: any) => ({
          id: conv._id, // MongoDB _id field
          name: conv.customerId?.firstName || conv.customerId?.phoneNumber || 'Unknown',
          avatar: conv.customerId?.avatar || `https://i.pravatar.cc/150?u=${conv.customerId?.phoneNumber}`,
          lastMessage: conv.lastMessage || '',
          lastMessageTime: new Date(conv.lastCustomerMessage || conv.updatedAt),
          unreadCount: 0,
          messages: [],
          assignedAgent: conv.assignedAgent,
          isAIEnabled: conv.isAIEnabled !== false, // Default to true if not specified
          status: conv.status
        }));
        this.chatsSubject.next(this.mockChats);
      },
      (error) => console.error('Error loading conversations:', error)
    );
  }

  private loadMessages(chatId: string) {
    return this.http.get<any>(`${this.apiUrl}/conversations/${chatId}/messages`).pipe(
      tap(response => {
        const chat = this.mockChats.find(c => c.id === chatId);
        if (chat) {
          // Map backend message format to frontend Message format
          const backendMessages = response.messages || [];
          chat.messages = backendMessages.map((msg: any) => ({
            id: msg._id,
            text: msg.content,
            // AI and agent messages should show on the right (sender: 'me')
            // Customer messages show on the left (sender: 'other')
            sender: (msg.sender === 'ai' || msg.sender === 'agent') ? 'me' : 'other',
            timestamp: new Date(msg.timestamp),
            type: msg.type,
            attachments: msg.attachments,
            location: msg.location
          }));
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }

  private initSocket() {
    this.socket = io(); // Connects to same origin (port 3010)

    this.socket.on('connect', () => {
      console.log('Connected to socket server');

      // Authenticate agent if logged in
      this.authService.currentAgent$.subscribe((agent: Agent | null) => {
        if (agent) {
          this.socket.emit('agent_authenticate', { agentId: agent._id });
        }
      });
    });

    this.socket.on('new_message', (data: { chatId: string, message: Message }) => {
      console.log('New message received:', data);
      this.handleNewMessage(data.chatId, data.message);
    });

    // Listen for agent-specific events
    this.socket.on('takeover_suggested', (data: any) => {
      console.log('Takeover suggested:', data);
      // You can emit this to a separate subject for UI notifications
    });

    this.socket.on('ai_resumed', (data: any) => {
      console.log('AI resumed:', data);
      // Update conversation in UI
      this.handleAIResumed(data.conversationId);
    });

    this.socket.on('customer_message', (data: any) => {
      console.log('Customer message (assigned to me):', data);
      this.handleNewMessage(data.customerPhone, {
        id: Date.now().toString(),
        text: data.message,
        sender: 'other',
        timestamp: new Date(data.timestamp)
      });
    });

    this.socket.on('conversation_assigned', (data: any) => {
      console.log('Conversation assigned to me:', data);
      this.loadConversations(); // Reload conversations
    });

    this.socket.on('agent_typing', (data: any) => {
      console.log('Agent typing:', data);
      this.typingSubject.next(data);
    });
  }

  /**
   * Observable for typing indicator
   */
  onTyping(): Observable<any> {
    return this.typingSubject.asObservable();
  }

  private handleAIResumed(conversationId: string) {
    const chat = this.mockChats.find(c => c.id === conversationId);
    if (chat) {
      chat.assignedAgent = undefined;
      chat.isAIEnabled = true;
      this.chatsSubject.next([...this.mockChats]);
    }
  }

  private handleNewMessage(chatId: string, message: Message) {
    const chatIndex = this.mockChats.findIndex(c => c.id === chatId);

    if (chatIndex !== -1) {
      const chat = this.mockChats[chatIndex];

      // Check if message already exists (deduplication)
      if (!chat.messages.some(m => m.id === message.id)) {
        chat.messages.push(message);
        chat.lastMessage = message.text;
        chat.lastMessageTime = new Date(message.timestamp);

        if (this.selectedChatIdSubject.value !== chatId) {
          chat.unreadCount++;
        }

        // Move chat to top
        this.mockChats.splice(chatIndex, 1);
        this.mockChats.unshift(chat);

        this.chatsSubject.next([...this.mockChats]);
      }
    } else {
      // Create new chat if it doesn't exist (optional, for new users)
      const newChat: Chat = {
        id: chatId,
        name: chatId, // Use phone number as name initially
        avatar: 'https://i.pravatar.cc/150?u=' + chatId,
        lastMessage: message.text,
        lastMessageTime: new Date(message.timestamp),
        unreadCount: 1,
        messages: [message]
      };
      this.mockChats.unshift(newChat);
      this.chatsSubject.next([...this.mockChats]);
    }
  }

  async selectChat(chatId: string) {
    this.selectedChatIdSubject.next(chatId);

    // Load messages for the selected chat
    try {
      await firstValueFrom(this.loadMessages(chatId));
    } catch (error) {
      console.error('Error loading messages:', error);
    }

    // Reset unread count
    const chatIndex = this.mockChats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      this.mockChats[chatIndex].unreadCount = 0;
      this.chatsSubject.next([...this.mockChats]);
    }
  }

  sendMessage(text: string) {
    const currentChatId = this.selectedChatIdSubject.value;
    if (!currentChatId) return;

    // Send via agent message API
    this.sendAgentMessage(currentChatId, text).subscribe({
      next: (response) => {
        console.log('Message sent successfully:', response);
        // Optionally add optimistic update
        const newMessage: Message = {
          id: response.message?._id || Date.now().toString(),
          text,
          sender: 'me',
          timestamp: new Date()
        };
        this.handleNewMessage(currentChatId, newMessage);
      },
      error: (err) => {
        console.error('Failed to send message:', err);
        alert('Failed to send message: ' + (err.error?.error || 'Unknown error'));
      }
    });
  }

  // ======================================
  // AGENT-SPECIFIC METHODS
  // ======================================

  /**
   * Assign conversation to current agent
   */
  assignToMe(conversationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/assign`, {}).pipe(
      tap(() => {
        const chat = this.mockChats.find(c => c.id === conversationId);
        if (chat) {
          const currentAgent = this.authService.getCurrentAgent();
          if (currentAgent) {
            chat.assignedAgent = {
              _id: currentAgent._id,
              firstName: currentAgent.firstName,
              lastName: currentAgent.lastName,
              email: currentAgent.email
            };
            chat.isAIEnabled = false;
            this.chatsSubject.next([...this.mockChats]);
          }
        }
      })
    );
  }

  /**
   * Release conversation back to AI
   */
  releaseConversation(conversationId: string, reason?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/release`, {
      reason
    }).pipe(
      tap(() => {
        const chat = this.mockChats.find(c => c.id === conversationId);
        if (chat) {
          chat.assignedAgent = undefined;
          chat.isAIEnabled = true;
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }

  /**
   * Send agent message (from Web UI)
   */
  sendAgentMessage(conversationId: string, text: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/reply`, {
      message: text
    });
  }

  /**
   * Get conversations assigned to current agent
   */
  getAssignedConversations(): Observable<any> {
    return this.http.get(`${this.apiUrl}/conversations/assigned`);
  }
}
