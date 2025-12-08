import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { io } from 'socket.io-client';

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  timestamp: Date;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private socket: any;
  private apiUrl = 'http://localhost:5001/api/v2';
  private mockChats: Chat[] = [];

  private chatsSubject = new BehaviorSubject<Chat[]>(this.mockChats);
  private selectedChatIdSubject = new BehaviorSubject<string | null>(null);

  chats$ = this.chatsSubject.asObservable();
  selectedChat$ = this.selectedChatIdSubject.asObservable().pipe(
    map(chatId => this.mockChats.find(c => c.id === chatId) || null)
  );

  constructor(private http: HttpClient) {
    this.initSocket();
    this.loadConversations();
  }

  private loadConversations() {
    this.http.get<Chat[]>(`${this.apiUrl}/conversations`).subscribe(
      (chats) => {
        this.mockChats = chats;
        this.chatsSubject.next(this.mockChats);
      },
      (error) => console.error('Error loading conversations:', error)
    );
  }

  private loadMessages(chatId: string) {
    return this.http.get<Message[]>(`${this.apiUrl}/messages/${chatId}`).pipe(
      tap(messages => {
        const chat = this.mockChats.find(c => c.id === chatId);
        if (chat) {
          chat.messages = messages;
          this.chatsSubject.next([...this.mockChats]);
        }
      })
    );
  }

  private initSocket() {
    this.socket = io('http://localhost:5001'); // Adjust URL as needed

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
    });

    this.socket.on('new_message', (data: { chatId: string, message: Message }) => {
      console.log('New message received:', data);
      this.handleNewMessage(data.chatId, data.message);
    });
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

    // In a real app, you'd send this to the backend via API
    // For now, we'll just simulate the local update and assume backend will emit the event back
    // Or we can emit to socket if backend supports it

    // this.socket.emit('send_message', { chatId: currentChatId, text });

    // Optimistic update
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'me',
      timestamp: new Date()
    };

    this.handleNewMessage(currentChatId, newMessage);
  }
}
