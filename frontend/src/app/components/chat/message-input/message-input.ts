import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService } from '../../../services/auth';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.html',
  styleUrls: ['./message-input.css']
})
export class MessageInputComponent {
  @Input() chat: Chat | null = null;
  messageText = '';

  constructor(
    private chatService: ChatService,
    private authService: AuthService
  ) { }

  /**
   * Check if current agent can send messages (is assigned to chat)
   */
  canSendMessage(): boolean {
    if (!this.chat) return false;

    const currentAgent = this.authService.getCurrentAgent();
    if (!currentAgent || !currentAgent._id) return false;

    // Agent must be assigned to this chat
    if (!this.chat.assignedAgent) return false;

    const assignedAgentId = typeof this.chat.assignedAgent === 'string'
      ? this.chat.assignedAgent
      : this.chat.assignedAgent._id;

    return assignedAgentId?.toString() === currentAgent._id.toString();
  }

  sendMessage() {
    if (!this.canSendMessage()) {
      console.warn('Cannot send message: Not assigned to this chat');
      return;
    }

    if (this.messageText.trim()) {
      this.chatService.sendMessage(this.messageText);
      this.messageText = '';
    }
  }
}
