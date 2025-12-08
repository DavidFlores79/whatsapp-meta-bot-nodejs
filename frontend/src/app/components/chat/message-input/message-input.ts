import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../../services/chat';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.html',
  styleUrls: ['./message-input.css']
})
export class MessageInputComponent {
  messageText = '';

  constructor(private chatService: ChatService) { }

  sendMessage() {
    if (this.messageText.trim()) {
      this.chatService.sendMessage(this.messageText);
      this.messageText = '';
    }
  }
}
