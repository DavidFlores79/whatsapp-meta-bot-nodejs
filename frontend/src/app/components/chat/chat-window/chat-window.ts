import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService } from '../../../services/auth';
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
  isTyping = false;
  private typingTimeout: any;

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) {
    this.selectedChat$ = this.chatService.selectedChat$;
  }

  ngOnInit() {
    // Listen for typing events from socket
    this.chatService.onTyping().subscribe((data: any) => {
      this.isTyping = true;

      // Clear existing timeout
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      // Stop showing typing after 3 seconds
      this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
      }, 3000);
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  /**
   * Check if current agent is assigned to this chat
   */
  isAssignedToMe(chat: Chat): boolean {
    const currentAgent = this.authService.getCurrentAgent();
    if (!currentAgent || !currentAgent._id || !chat.assignedAgent || !chat.assignedAgent._id) {
      return false;
    }
    // Compare as strings to ensure match
    return chat.assignedAgent._id.toString() === currentAgent._id.toString();
  }

  /**
   * Take over conversation (assign to current agent)
   */
  takeoverChat(chatId: string) {
    this.chatService.assignToMe(chatId).subscribe({
      next: () => {
        console.log('Conversation taken over successfully');
      },
      error: (err) => {
        console.error('Takeover failed:', err);
        alert('Failed to take over conversation: ' + (err.error?.error || 'Unknown error'));
      }
    });
  }

  /**
   * Release conversation back to AI
   */
  releaseChat(chatId: string) {
    this.chatService.releaseConversation(chatId, 'Manual release by agent').subscribe({
      next: () => {
        console.log('Conversation released to AI');
      },
      error: (err) => {
        console.error('Release failed:', err);
        alert('Failed to release conversation: ' + (err.error?.error || 'Unknown error'));
      }
    });
  }
}
