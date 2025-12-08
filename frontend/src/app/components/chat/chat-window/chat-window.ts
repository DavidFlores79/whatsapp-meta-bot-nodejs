import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService, Chat } from '../../../services/chat';
import { Observable } from 'rxjs';
import { MessageBubbleComponent } from '../message-bubble/message-bubble';
import { MessageInputComponent } from '../message-input/message-input';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, MessageBubbleComponent, MessageInputComponent],
  templateUrl: './chat-window.html',
  styleUrls: ['./chat-window.css']
})
export class ChatWindowComponent implements OnInit, AfterViewChecked {
  selectedChat$: Observable<Chat | null>;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor(private chatService: ChatService) {
    this.selectedChat$ = this.chatService.selectedChat$;
  }

  ngOnInit() { }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }
}
