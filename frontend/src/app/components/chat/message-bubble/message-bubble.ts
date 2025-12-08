import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../../services/chat';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-bubble.html',
  styleUrls: ['./message-bubble.css']
})
export class MessageBubbleComponent {
  @Input() message!: Message;
}
