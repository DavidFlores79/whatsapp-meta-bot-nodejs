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
    // Typing indicators disabled - WhatsApp webhooks don't provide customer typing events
    // Agent typing is handled separately and shouldn't show customer typing indicator
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

    // Debug logging
    console.log('=== isAssignedToMe Debug ===');
    console.log('Current Agent:', currentAgent);
    console.log('Chat Assigned Agent:', chat.assignedAgent);
    console.log('Chat Assigned Agent type:', typeof chat.assignedAgent);

    if (!currentAgent || !currentAgent._id || !chat.assignedAgent) {
      console.log('Check failed - missing data');
      return false;
    }

    // Handle both cases: assignedAgent as string or as object
    const assignedAgentId = typeof chat.assignedAgent === 'string' 
      ? chat.assignedAgent 
      : chat.assignedAgent._id;

    if (!assignedAgentId) {
      console.log('Check failed - no assigned agent ID');
      return false;
    }

    // Compare as strings to ensure match
    const match = assignedAgentId.toString() === currentAgent._id.toString();
    console.log('Agent IDs match:', match);
    console.log('===========================');
    return match;
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

  /**
   * Get assigned agent name (handles both string and object format)
   */
  getAssignedAgentName(chat: Chat): string {
    if (!chat.assignedAgent) return '';
    
    if (typeof chat.assignedAgent === 'string') {
      return 'Agent'; // Fallback when we only have ID
    }
    
    return `${chat.assignedAgent.firstName} ${chat.assignedAgent.lastName}`;
  }

  /**
   * Get assigned agent first name (handles both string and object format)
   */
  getAssignedAgentFirstName(chat: Chat): string {
    if (!chat.assignedAgent) return '';
    
    if (typeof chat.assignedAgent === 'string') {
      return 'Agent'; // Fallback when we only have ID
    }
    
    return chat.assignedAgent.firstName;
  }
}
