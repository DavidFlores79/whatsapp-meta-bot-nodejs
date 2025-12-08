import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService, Chat } from '../../../services/chat';
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

  constructor(private chatService: ChatService) {
    this.chats$ = this.chatService.chats$;
    this.selectedChatId$ = this.chatService.selectedChat$.pipe(
      map(chat => chat ? chat.id : null)
    );
  }

  ngOnInit() { }

  selectChat(id: string) {
    this.chatService.selectChat(id);
  }
}
