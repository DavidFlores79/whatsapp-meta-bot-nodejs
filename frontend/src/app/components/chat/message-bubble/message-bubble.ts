import { Component, Input, Output, EventEmitter } from '@angular/core';
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
  @Output() imageClick = new EventEmitter<{ url: string; filename: string }>();

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

  /**
   * Check if text is just a media placeholder like [image: filename.jpg]
   * These should be hidden when the actual media is displayed
   */
  get isMediaPlaceholder(): boolean {
    if (!this.message.text) return false;
    // Match patterns like [image: filename], [video: filename], [document: filename], [Image]
    return /^\[(image|video|document|audio|Image)(:.*?)?\]$/i.test(this.message.text.trim());
  }

  /**
   * Get image URL from attachments or media property
   */
  get imageUrl(): string | null {
    if (this.message.attachments && this.message.attachments.length > 0) {
      return this.message.attachments[0].url;
    }
    if (this.message.media?.url) {
      return this.message.media.url;
    }
    return null;
  }

  /**
   * Get image filename from attachments or media property
   */
  get imageFilename(): string {
    if (this.message.attachments && this.message.attachments.length > 0) {
      return this.message.attachments[0].filename || 'Image';
    }
    if (this.message.media?.filename) {
      return this.message.media.filename;
    }
    return 'Image';
  }

  openImage(url?: string | null, filename?: string) {
    const imageUrl = url || this.imageUrl;
    if (!imageUrl) return;
    console.log('Emitting image click:', imageUrl, filename);
    this.imageClick.emit({ url: imageUrl, filename: filename || this.imageFilename });
  }

  onMapImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    console.error('Failed to load map image:', img.src);
    console.log('Location data:', this.message.location);
    // Hide the broken image
    img.style.display = 'none';
  }
}
