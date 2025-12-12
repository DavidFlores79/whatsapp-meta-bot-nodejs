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

  /**
   * Get message text with template parameters replaced
   */
  get displayText(): string {
    if (!this.message.text) return '';
    
    // If it's a template message with parameters, replace placeholders
    if (this.message.type === 'template' && this.message.template?.parameters) {
      let text = this.message.text;
      this.message.template.parameters.forEach((param, index) => {
        const placeholder = `{{${index + 1}}}`;
        text = text.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), param);
      });
      return text;
    }
    
    return this.message.text;
  }

  /**
   * Get HTML formatted message text with WhatsApp formatting
   * *bold* -> <strong>bold</strong>
   * _italic_ -> <em>italic</em>
   * ~strikethrough~ -> <del>strikethrough</del>
   * ```monospace``` -> <code>monospace</code>
   */
  get formattedText(): string {
    let text = this.displayText;
    
    // Bold: *text*
    text = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // Italic: _text_
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Strikethrough: ~text~
    text = text.replace(/~([^~]+)~/g, '<del>$1</del>');
    
    // Monospace: ```text```
    text = text.replace(/```([^`]+)```/g, '<code>$1</code>');
    
    return text;
  }

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
