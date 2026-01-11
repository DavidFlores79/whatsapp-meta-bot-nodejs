import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { io } from 'socket.io-client';
import { AuthService, Agent } from './auth';
import { ToastService } from './toast';

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other' | 'system';
  timestamp: Date;
  type?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  isAI?: boolean; // Flag to indicate AI-generated message
  isSystemMessage?: boolean; // Flag for system messages (assignment transitions, etc.)
  systemMessageType?: 'agent_assigned' | 'agent_released' | 'ai_resumed';
  agentName?: string; // Agent name (for both regular agent messages and system transitions)
  agentId?: string; // Agent ID for identification
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
  media?: {
    type: string;
    filename?: string;
    mimeType?: string;
    url?: string;
  };
  // Reply context - when message is a reply to another message
  replyTo?: {
    id: string;
    text: string;
    type?: string;
    sender: 'me' | 'other' | 'system';
    attachments?: Array<{
      type: string;
      url: string;
      filename?: string;
    }>;
    media?: {
      type: string;
      url?: string;
      filename?: string;
    };
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
  private metadataUpdateSubject = new BehaviorSubject<any>(null);
  private newMessageSubject = new BehaviorSubject<any>(null);

  // Store conversation summaries from auto-assignment
  private conversationSummaries = new Map<string, any>();
  private conversationSummarySubject = new BehaviorSubject<any>(null);

  chats$ = this.chatsSubject.asObservable();
  // Use combineLatest to emit when EITHER chatId changes OR chats array updates (e.g., messages loaded)
  selectedChat$ = combineLatest([
    this.selectedChatIdSubject.asObservable(),
    this.chatsSubject.asObservable()
  ]).pipe(
    map(([chatId, chats]) => chats.find(c => c.id === chatId) || null)
  );

  // Observable for conversation summaries (when auto-assigned or manually taken over)
  conversationSummary$ = this.conversationSummarySubject.asObservable();

  /**
   * Get currently selected chat ID
   */
  getSelectedChatId(): string | null {
    return this.selectedChatIdSubject.value;
  }

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.initSocket();

    // Load conversations based on agent authentication status
    this.authService.currentAgent$.subscribe((agent: Agent | null) => {
      this.currentAgent = agent; // Store current agent

      // Only load conversations if agent is authenticated
      if (agent) {
        this.loadConversations(agent);
      } else {
        // Clear conversations when not authenticated
        this.chatsSubject.next([]);
      }
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

        // Filter out closed conversations to prevent duplicates
        const activeConversations = conversations.filter((conv: any) => conv.status !== 'closed');

        const newChats = activeConversations.map((conv: any) => ({
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
      tap(async (response) => {
        const chat = this.mockChats.find(c => c.id === chatId);
        if (chat) {
          // Map backend message format to frontend Message format
          const backendMessages = response.messages || [];
          let messages: Message[] = backendMessages.map((msg: any) => ({
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
            template: msg.template,
            // Include media information for images/documents/videos/audio
            media: msg.media,
            // Include agent information if available (populated by backend)
            agentName: msg.agentId
              ? `${msg.agentId.firstName} ${msg.agentId.lastName}`.trim()
              : undefined,
            agentId: msg.agentId?._id,
            // Include reply context if this message is a reply to another message
            replyTo: msg.replyTo ? {
              id: msg.replyTo._id,
              text: msg.replyTo.content,
              type: msg.replyTo.type,
              sender: (msg.replyTo.sender === 'agent' || msg.replyTo.sender === 'ai') ? 'me' : 'other',
              attachments: msg.replyTo.attachments,
              media: msg.replyTo.media
            } : undefined
          }));

          // Fetch assignment history to inject context markers
          try {
            const historyResponse = await firstValueFrom(
              this.http.get<any>(`${this.apiUrl}/conversations/${chatId}/assignment-history`)
            );

            if (historyResponse?.history && historyResponse.history.length > 0) {
              // Sort assignment history by assignedAt (oldest first)
              const sortedHistory = [...historyResponse.history].sort((a, b) =>
                new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime()
              );

              // Create system messages for each assignment transition
              const systemMessages: Message[] = [];

              sortedHistory.forEach((assignment: any) => {
                const agentName = assignment.agentId
                  ? `${assignment.agentId.firstName} ${assignment.agentId.lastName}`
                  : 'Agent';

                // Add "Agent assigned" marker
                systemMessages.push({
                  id: `system-assigned-${assignment._id}`,
                  text: `🔵 ${agentName} joined the conversation`,
                  sender: 'system',
                  timestamp: new Date(assignment.assignedAt),
                  isSystemMessage: true,
                  systemMessageType: 'agent_assigned',
                  agentName: agentName
                });

                // Add "Agent released" marker if released
                if (assignment.releasedAt) {
                  systemMessages.push({
                    id: `system-released-${assignment._id}`,
                    text: `🟢 AI resumed control (${agentName} left)`,
                    sender: 'system',
                    timestamp: new Date(assignment.releasedAt),
                    isSystemMessage: true,
                    systemMessageType: 'ai_resumed',
                    agentName: agentName
                  });
                }
              });

              // Merge system messages with regular messages and sort by timestamp
              messages = [...messages, ...systemMessages].sort((a, b) =>
                a.timestamp.getTime() - b.timestamp.getTime()
              );

              console.log(`📋 Injected ${systemMessages.length} context markers into conversation timeline`);
            }
          } catch (error) {
            console.error('Failed to load assignment history for context markers:', error);
            // Continue without context markers
          }

          chat.messages = messages;
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
      if (data && data.chatId && data.message) {
        this.handleNewMessage(data.chatId, data.message);
        // Emit to subject for components to subscribe
        this.newMessageSubject.next(data);
      }
    });

    // Listen for metadata updates
    this.socket.on('metadata_updated', (data: any) => {
      console.log('Metadata updated:', data);
      this.metadataUpdateSubject.next(data);
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
      if (data && data.conversationId) {
        this.handleAIResumed(data.conversationId);
      }
    });

    this.socket.on('conversation_released', (data: any) => {
      console.log('Conversation released:', data);
      // Update conversation in UI (same as AI resumed)
      if (data && data.conversationId) {
        this.handleAIResumed(data.conversationId);
      }
    });

    this.socket.on('customer_message', (data: any) => {
      console.log('Customer message (assigned to me):', data);
      if (data && data.conversationId && data.message) {
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
      }
    });

    this.socket.on('conversation_assigned', (data: any) => {
      console.log('Conversation assigned to me:', data);

      // Store summary for later display
      if (data.summary) {
        console.log('📊 Storing conversation summary for', data.conversationId);
        this.conversationSummaries.set(data.conversationId, data.summary);
      }

      // Play notification sound
      this.playNotificationSound();

      // Update existing conversation or add it if not present
      const existingChat = this.mockChats.find(c => c.id === data.conversationId);
      if (existingChat) {
        // Update assignment info - use current agent as assignedAgent
        existingChat.assignedAgent = this.currentAgent?._id || 'unknown';
        existingChat.isAIEnabled = false;
        existingChat.status = 'assigned';
        existingChat.name = data.customerName || existingChat.name;
        existingChat.lastMessage = data.lastMessage || existingChat.lastMessage;
        this.chatsSubject.next([...this.mockChats]);
        console.log(`✅ Updated conversation ${data.conversationId} with assignment to agent ${this.currentAgent?._id}`);

        // Show notification with customer name
        const customerName = data.customerName || existingChat.name || 'Unknown Customer';
        this.toastService.info(`🔔 New conversation assigned: ${customerName}`, 5000);

        // Check if agent is viewing a different conversation
        const currentChatId = this.selectedChatIdSubject.value;
        if (currentChatId && currentChatId !== data.conversationId) {
          this.toastService.warning(`⚠️ You have a new assigned conversation while viewing another chat!`, 8000);
        }
      } else {
        // Conversation not in list, reload all to get the new conversation
        console.log('🔄 Conversation not found in list, reloading...');
        this.loadConversations(this.currentAgent);
        const customerName = data.customerName || 'Unknown Customer';
        this.toastService.info(`🔔 New conversation assigned: ${customerName}`, 5000);
      }
    });

    this.socket.on('agent_typing', (data: any) => {
      console.log('Agent typing:', data);
      this.typingSubject.next(data);
    });

    // AI typing indicators
    this.socket.on('ai_typing_start', (data: any) => {
      console.log('AI typing start:', data);
      if (data && data.conversationId) {
        this.typingSubject.next({ conversationId: data.conversationId, isTyping: true, isAI: true });
      }
    });

    this.socket.on('ai_typing_end', (data: any) => {
      console.log('AI typing end:', data);
      if (data && data.conversationId) {
        this.typingSubject.next({ conversationId: data.conversationId, isTyping: false, isAI: true });
      }
    });
  }

  /**
   * Play notification sound
   */
  private playNotificationSound() {
    try {
      // Create a short notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }

  /**
   * Observable for typing indicator
   */
  onTyping(): Observable<any> {
    return this.typingSubject.asObservable();
  }

  /**
   * Observable for new messages
   */
  onNewMessage(): Observable<any> {
    return this.newMessageSubject.asObservable();
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

    const chat = this.mockChats.find(c => c.id === chatId);

    // Show summary in these cases:
    // 1. Summary was stored during takeover/auto-assignment (conversationSummaries Map)
    // 2. Conversation has status 'assigned' and is assigned to current agent (newly assigned)
    if (this.conversationSummaries.has(chatId)) {
      const summary = this.conversationSummaries.get(chatId);
      console.log('📊 Found stored summary for conversation, emitting to components');
      this.conversationSummarySubject.next({
        conversationId: chatId,
        summary: summary,
        source: 'auto-assignment'
      });
      // Clear the summary after showing it once
      this.conversationSummaries.delete(chatId);
    } else if (chat && chat.status === 'assigned' && this.isAssignedToCurrentAgent(chat)) {
      // Fetch summary for newly assigned conversation that agent is viewing for first time
      console.log('🔍 Fetching summary for newly assigned conversation...');
      try {
        const historyResponse = await firstValueFrom(
          this.http.get<any>(`${this.apiUrl}/conversations/${chatId}/assignment-history`)
        );

        if (historyResponse?.history && historyResponse.history.length > 0) {
          // Get the most recent (active) assignment
          const activeAssignment = historyResponse.history.find((h: any) => !h.releasedAt);

          if (activeAssignment?.contextSummary?.aiSummary) {
            console.log('✅ Using stored AI summary from assignment history');
            this.conversationSummarySubject.next({
              conversationId: chatId,
              summary: activeAssignment.contextSummary.aiSummary,
              source: 'assignment-history'
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch assignment history:', error);
        // Not critical, continue without summary
      }
    }

    // Reset unread count and clear "assigned" status for NEW indicator
    const chatIndex = this.mockChats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      this.mockChats[chatIndex].unreadCount = 0;
      // Clear the "assigned" status once viewed (keeps assignedAgent but removes NEW badge)
      if (this.mockChats[chatIndex].status === 'assigned') {
        this.mockChats[chatIndex].status = 'active';
      }
      this.chatsSubject.next([...this.mockChats]);
    }
  }

  /**
   * Check if conversation is assigned to current agent
   */
  private isAssignedToCurrentAgent(chat: Chat): boolean {
    if (!this.currentAgent || !chat.assignedAgent) {
      return false;
    }

    const assignedAgentId = typeof chat.assignedAgent === 'string'
      ? chat.assignedAgent
      : chat.assignedAgent._id;

    return assignedAgentId === this.currentAgent._id;
  }

  /**
   * Deselect current chat (used for mobile back navigation)
   */
  deselectChat() {
    this.selectedChatIdSubject.next(null);
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

  /**
   * Send media message (image, document, video, audio) to current chat
   */
  sendMediaMessage(file: File, caption: string = ''): Observable<any> {
    const currentChatId = this.selectedChatIdSubject.value;
    if (!currentChatId) {
      return new Observable(observer => {
        observer.error(new Error('No chat selected'));
      });
    }

    const formData = new FormData();
    formData.append('file', file);
    if (caption) {
      formData.append('caption', caption);
    }

    return this.http.post(`${this.apiUrl}/conversations/${currentChatId}/reply-media`, formData).pipe(
      tap((response: any) => {
        // Add message to chat using server response data (includes Cloudinary URL)
        const mediaType = file.type.startsWith('image/') ? 'image' :
                          file.type.startsWith('video/') ? 'video' :
                          file.type.startsWith('audio/') ? 'audio' : 'document';

        // Use server response for media URL if available
        const serverMessage = response.message;
        const mediaUrl = serverMessage?.media?.url || null;

        const newMessage: Message = {
          id: serverMessage?._id || Date.now().toString(),
          text: caption || `[${mediaType}: ${file.name}]`,
          sender: 'me',
          timestamp: new Date(),
          status: serverMessage?.status || 'sent',
          type: mediaType,
          media: {
            type: mediaType,
            filename: file.name,
            mimeType: file.type,
            url: mediaUrl
          },
          // Include attachments for message-bubble compatibility
          attachments: mediaUrl ? [{
            type: mediaType,
            url: mediaUrl,
            filename: file.name
          }] : undefined
        };
        this.handleNewMessage(currentChatId, newMessage);
      })
    );
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

  /**
   * Mark conversation as resolved
   */
  resolveConversation(conversationId: string, resolutionNotes?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/resolve`, {
      resolutionNotes
    }).pipe(
      tap(() => {
        const chat = this.mockChats.find(c => c.id === conversationId);
        if (chat) {
          chat.status = 'resolved';
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }

  /**
   * Close conversation (final state)
   */
  closeConversation(conversationId: string, reason?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/close`, {
      reason
    }).pipe(
      tap(() => {
        const chat = this.mockChats.find(c => c.id === conversationId);
        if (chat) {
          chat.status = 'closed';
          chat.assignedAgent = undefined;
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }

  /**
   * Reopen closed conversation (admin/supervisor only)
   */
  reopenConversation(conversationId: string, reason?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/conversations/${conversationId}/reopen`, {
      reason
    }).pipe(
      tap(() => {
        const chat = this.mockChats.find(c => c.id === conversationId);
        if (chat) {
          chat.status = 'open';
          chat.isAIEnabled = true;
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }
}
