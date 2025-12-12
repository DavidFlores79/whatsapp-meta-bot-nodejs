import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { io } from 'socket.io-client';
import { AuthService, Agent } from './auth';
import { ToastService } from './toast';

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  timestamp: Date;
  type?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  isAI?: boolean; // Flag to indicate AI-generated message
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
    mapImageUrl?: string;
  };
  template?: {
    name: string;
    language: string;
    parameters?: string[];
    category?: string;
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
  assignedAgent?: string | {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  isAIEnabled?: boolean;
  status?: string;
  customerId?: string;
  phoneNumber?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private socket: any;
  private apiUrl = '/api/v2'; // Relative URL for same-port deployment
  private mockChats: Chat[] = [];
  private currentAgent: Agent | null = null; // Store current agent for filtering

  private chatsSubject = new BehaviorSubject<Chat[]>(this.mockChats);
  private selectedChatIdSubject = new BehaviorSubject<string | null>(null);
  private typingSubject = new BehaviorSubject<any>(null);

  chats$ = this.chatsSubject.asObservable();
  selectedChat$ = this.selectedChatIdSubject.asObservable().pipe(
    map(chatId => this.mockChats.find(c => c.id === chatId) || null)
  );

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.initSocket();

    // Load conversations based on agent authentication status
    this.authService.currentAgent$.subscribe((agent: Agent | null) => {
      this.currentAgent = agent; // Store current agent
      this.loadConversations(agent);
    });
  }

  /**
   * Helper method to get customer display name
   */
  private getCustomerName(customer: any): string {
    if (!customer) return 'Unknown';

    if (customer.firstName && customer.lastName) {
      return `${customer.firstName} ${customer.lastName}`;
    }

    if (customer.firstName) {
      return customer.firstName;
    }

    return customer.phoneNumber || 'Unknown';
  }

  private loadConversations(agent?: Agent | null) {
    // Always load all conversations, let the tabs filter them
    const endpoint = `${this.apiUrl}/conversations`;

    this.http.get<any>(endpoint).subscribe(
      (response) => {
        // Map backend conversation format to frontend Chat format
        const conversations = response.conversations || [];
        const newChats = conversations.map((conv: any) => ({
          id: conv._id, // MongoDB _id field
          name: this.getCustomerName(conv.customerId),
          avatar: conv.customerId?.avatar || `https://i.pravatar.cc/150?u=${conv.customerId?.phoneNumber}`,
          lastMessage: conv.lastMessage?.content || '',
          lastMessageTime: new Date(conv.lastMessage?.timestamp || conv.lastCustomerMessage || conv.updatedAt),
          unreadCount: 0,
          messages: [],
          assignedAgent: conv.assignedAgent,
          isAIEnabled: conv.isAIEnabled !== false, // Default to true if not specified
          status: conv.status,
          customerId: conv.customerId?._id,
          phoneNumber: conv.customerId?.phoneNumber
        }));

        // Deduplicate: Remove any existing conversations with same IDs
        const existingIds = new Set(newChats.map((c: Chat) => c.id));
        this.mockChats = this.mockChats.filter((c: Chat) => !existingIds.has(c.id));

        // Add new conversations
        this.mockChats = [...newChats, ...this.mockChats];

        this.chatsSubject.next(this.mockChats);

        console.log(`Loaded ${newChats.length} conversation(s)`);
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
            // Agent and AI messages show on the right (sender: 'me')
            // Customer messages show on the left (sender: 'other')
            sender: (msg.sender === 'agent' || msg.sender === 'ai') ? 'me' : 'other',
            isAI: msg.sender === 'ai', // Mark AI messages
            timestamp: new Date(msg.timestamp),
            type: msg.type,
            status: msg.status,
            attachments: msg.attachments,
            location: msg.location,
            template: msg.template
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

    // Listen for new conversations
    this.socket.on('new_conversation', (data: any) => {
      console.log('New conversation created:', data);
      this.handleNewConversation(data);
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

    this.socket.on('conversation_released', (data: any) => {
      console.log('Conversation released:', data);
      // Update conversation in UI (same as AI resumed)
      this.handleAIResumed(data.conversationId);
    });

    this.socket.on('customer_message', (data: any) => {
      console.log('Customer message (assigned to me):', data);
      this.handleNewMessage(data.conversationId, {
        id: Date.now().toString(),
        text: data.message,
        sender: 'other',
        timestamp: new Date(data.timestamp),
        type: data.type || 'text',
        status: data.status,
        attachments: data.attachments,
        location: data.location
      });
    });

    this.socket.on('conversation_assigned', (data: any) => {
      console.log('Conversation assigned to me:', data);
      // Update existing conversation or add it if not present
      const existingChat = this.mockChats.find(c => c.id === data.conversationId);
      if (existingChat) {
        // Update assignment info
        existingChat.assignedAgent = data.agent;
        existingChat.isAIEnabled = false;
        existingChat.status = 'assigned';
        this.chatsSubject.next([...this.mockChats]);
        console.log(`Updated conversation ${data.conversationId} with assignment`);
      } else {
        // Conversation not in list, reload all
        this.loadConversations(this.currentAgent);
      }
    });

    this.socket.on('agent_typing', (data: any) => {
      console.log('Agent typing:', data);
      this.typingSubject.next(data);
    });

    // AI typing indicators
    this.socket.on('ai_typing_start', (data: any) => {
      console.log('AI typing start:', data);
      this.typingSubject.next({ conversationId: data.conversationId, isTyping: true, isAI: true });
    });

    this.socket.on('ai_typing_end', (data: any) => {
      console.log('AI typing end:', data);
      this.typingSubject.next({ conversationId: data.conversationId, isTyping: false, isAI: true });
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

  private handleNewConversation(data: any) {
    // Check if conversation already exists
    if (this.mockChats.find(c => c.id === data.conversationId)) {
      console.log(`Conversation ${data.conversationId} already exists, ignoring`);
      return;
    }

    // Add all new conversations - let the tabs filter them
    // Queue tab will show unassigned, My Chats will show mine, All will show everything
    console.log('Adding new conversation:', data.conversationId, 'Assigned:', data.assignedAgent ? 'Yes' : 'No');

    // Create new chat entry
    const newChat: Chat = {
      id: data.conversationId,
      name: data.customer?.name || data.customer?.phoneNumber || 'Unknown',
      avatar: data.customer?.avatar || `https://i.pravatar.cc/150?u=${data.customer?.phoneNumber}`,
      lastMessage: 'New conversation',
      lastMessageTime: new Date(data.timestamp),
      unreadCount: 0,
      messages: [],
      assignedAgent: data.assignedAgent,
      isAIEnabled: true,
      status: data.status
    };

    this.mockChats.unshift(newChat);
    this.chatsSubject.next([...this.mockChats]);
    console.log(`Added new conversation ${data.conversationId} to chat list`);
  }

  private handleNewMessage(chatId: string, message: Message) {
    let chatIndex = this.mockChats.findIndex(c => c.id === chatId);

    if (chatIndex !== -1) {
      const chat = this.mockChats[chatIndex];

      // Check if message already exists (deduplication)
      if (!chat.messages.some(m => m.id === message.id)) {
        chat.messages.push(message);
        chat.lastMessage = message.text || (message.type === 'image' ? '📷 Image' : 'Message');
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
      // Chat not found - fetch the specific conversation from server
      console.log(`Chat ${chatId} not found locally, fetching from server`);
      this.http.get<any>(`${this.apiUrl}/conversations/${chatId}`).subscribe({
        next: (response) => {
          const conv = response.conversation;
          if (conv) {
            // If agent is logged in, only show conversations assigned to them
            const isAssignedToAgent = !this.currentAgent ||
              (conv.assignedAgent && conv.assignedAgent._id === this.currentAgent._id);

            if (isAssignedToAgent) {
              // Create new chat entry with proper data
              const newChat: Chat = {
                id: conv._id,
                name: this.getCustomerName(conv.customerId),
                avatar: conv.customerId?.avatar || `https://i.pravatar.cc/150?u=${conv.customerId?.phoneNumber}`,
                lastMessage: message.text || (message.type === 'image' ? '📷 Image' : 'Message'),
                lastMessageTime: new Date(message.timestamp),
                unreadCount: 1,
                messages: [message],
                assignedAgent: conv.assignedAgent,
                isAIEnabled: conv.isAIEnabled !== false,
                status: conv.status
              };
              this.mockChats.unshift(newChat);
              this.chatsSubject.next([...this.mockChats]);
            } else {
              console.log(`Conversation ${chatId} is not assigned to current agent, ignoring`);
            }
          }
        },
        error: (err) => {
          console.error('Error fetching conversation:', err);
          // Fallback: reload conversations with agent context
          this.loadConversations(this.currentAgent);
        }
      });
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
          timestamp: new Date(),
          status: response.message?.status || 'sent'
        };
        this.handleNewMessage(currentChatId, newMessage);
      },
      error: (err) => {
        console.error('Failed to send message:', err);
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to send message: ${errorMessage}`, 6000);
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

  /**
   * Refresh conversations from server
   */
  refreshConversations(): void {
    this.loadConversations(this.currentAgent);
  }

  /**
   * Update customer information for a specific conversation
   */
  updateConversationCustomer(phoneNumber: string, customer: any): void {
    const chat = this.mockChats.find(c => c.phoneNumber === phoneNumber);
    if (chat) {
      // Update the chat name with new customer info
      chat.name = this.getCustomerName(customer);
      chat.customerId = customer._id;

      // Trigger update
      this.chatsSubject.next([...this.mockChats]);
      console.log(`Updated conversation for ${phoneNumber} with new customer name: ${chat.name}`);
    }
  }
}
