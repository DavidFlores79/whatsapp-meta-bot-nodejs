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

  openImage(url: string) {
    window.open(url, '_blank');
  }

  onMapImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    console.error('Failed to load map image:', img.src);
    console.log('Location data:', this.message.location);
    // Hide the broken image
    img.style.display = 'none';
  }
}
