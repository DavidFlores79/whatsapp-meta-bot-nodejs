import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService } from '../../../services/auth';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './message-input.html',
  styleUrls: ['./message-input.css']
})
export class MessageInputComponent {
  @Input() chat: Chat | null = null;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  messageText = '';
  selectedFile: File | null = null;
  isUploading = false;
  uploadProgress = 0;

  // Allowed file types for WhatsApp
  readonly allowedTypes = [
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'
  ];

  // Accept string for file input
  readonly acceptTypes = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.mp4,.3gp,.aac,.mp3,.amr,.ogg';

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

  /**
   * Open file picker dialog
   */
  openFilePicker() {
    if (!this.canSendMessage() || this.isUploading) return;
    this.fileInput.nativeElement.click();
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Validate file type
    if (!this.allowedTypes.includes(file.type)) {
      alert('File type not supported. Please select an image, document, video, or audio file.');
      this.clearFileInput();
      return;
    }

    // Validate file size
    const maxSize = this.getMaxSizeForType(file.type);
    if (file.size > maxSize) {
      const maxMB = Math.floor(maxSize / (1024 * 1024));
      alert(`File too large. Maximum size for this file type is ${maxMB}MB.`);
      this.clearFileInput();
      return;
    }

    this.selectedFile = file;
  }

  /**
   * Get max file size based on type
   */
  private getMaxSizeForType(mimeType: string): number {
    if (mimeType.startsWith('video/')) return 16 * 1024 * 1024; // 16MB
    if (mimeType.startsWith('image/')) return 5 * 1024 * 1024; // 5MB
    return 100 * 1024 * 1024; // 100MB for documents
  }

  /**
   * Get file type icon class
   */
  getFileIcon(): string {
    if (!this.selectedFile) return 'fas fa-file';

    const type = this.selectedFile.type;
    if (type.startsWith('image/')) return 'fas fa-image';
    if (type.startsWith('video/')) return 'fas fa-video';
    if (type.startsWith('audio/')) return 'fas fa-music';
    if (type === 'application/pdf') return 'fas fa-file-pdf';
    if (type.includes('word')) return 'fas fa-file-word';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'fas fa-file-excel';
    if (type.includes('powerpoint') || type.includes('presentation')) return 'fas fa-file-powerpoint';
    return 'fas fa-file';
  }

  /**
   * Get formatted file size
   */
  getFormattedFileSize(): string {
    if (!this.selectedFile) return '';

    const bytes = this.selectedFile.size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Remove selected file
   */
  removeSelectedFile() {
    this.selectedFile = null;
    this.clearFileInput();
  }

  /**
   * Clear the file input element
   */
  private clearFileInput() {
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  /**
   * Send the selected file
   */
  sendFile() {
    if (!this.canSendMessage() || !this.selectedFile || this.isUploading) return;

    this.isUploading = true;
    this.uploadProgress = 0;

    // Use messageText as caption if provided
    const caption = this.messageText.trim();

    this.chatService.sendMediaMessage(this.selectedFile, caption).subscribe({
      next: (response) => {
        console.log('Media sent successfully:', response);
        this.resetFileState();
      },
      error: (err) => {
        console.error('Failed to send media:', err);
        this.isUploading = false;
        this.uploadProgress = 0;
        alert('Failed to send file: ' + (err.error?.error || err.message || 'Unknown error'));
      },
      complete: () => {
        // Ensure cleanup happens even if next doesn't trigger properly
        this.resetFileState();
      }
    });
  }

  /**
   * Reset file upload state
   */
  private resetFileState() {
    this.isUploading = false;
    this.uploadProgress = 100;
    this.selectedFile = null;
    this.messageText = '';
    this.clearFileInput();
  }
}
