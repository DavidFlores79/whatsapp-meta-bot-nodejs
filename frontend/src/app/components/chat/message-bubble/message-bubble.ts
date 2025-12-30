import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Message } from '../../../services/chat';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './message-bubble.html',
  styleUrls: ['./message-bubble.css']
})
export class MessageBubbleComponent {
  @Input() message!: Message;

  // Image viewer
  showImageViewer = false;
  currentImageUrl = '';
  currentImageFilename = '';

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

  /**
   * Get smart timestamp format
   * - Just time for today's messages
   * - "Yesterday HH:MM" for yesterday
   * - Full date for older messages
   */
  get smartTimestamp(): string {
    const msgDate = new Date(this.message.timestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const msgDateOnly = new Date(msgDate);
    msgDateOnly.setHours(0, 0, 0, 0);

    const timeStr = msgDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (msgDateOnly.getTime() === today.getTime()) {
      // Today - just show time
      return timeStr;
    } else if (msgDateOnly.getTime() === yesterday.getTime()) {
      // Yesterday - show "Yesterday"
      return `Yesterday ${timeStr}`;
    } else {
      // Older - show date
      const dateStr = msgDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      return `${dateStr} ${timeStr}`;
    }
  }

  openImage(url: string, filename?: string) {
    console.log('Opening image viewer:', url, filename);
    this.currentImageUrl = url;
    this.currentImageFilename = filename || 'Image';
    this.showImageViewer = true;
    console.log('Image viewer state:', this.showImageViewer);
  }

  closeImageViewer() {
    this.showImageViewer = false;
    this.currentImageUrl = '';
    this.currentImageFilename = '';
  }

  onMapImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    console.error('Failed to load map image:', img.src);
    console.log('Location data:', this.message.location);
    // Hide the broken image
    img.style.display = 'none';
  }
}
