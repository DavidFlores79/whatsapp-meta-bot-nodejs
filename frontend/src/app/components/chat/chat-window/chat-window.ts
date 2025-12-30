import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast';
import { Observable } from 'rxjs';
import { MessageBubbleComponent } from '../message-bubble/message-bubble';
import { MessageInputComponent } from '../message-input/message-input';
import { CustomerModalComponent } from '../../customers/customer-modal/customer-modal';
import { TemplateSenderComponent } from '../../templates/template-sender/template-sender';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge';
import { TicketCreateModalComponent } from '../../tickets/ticket-create-modal/ticket-create-modal.component';
import { Customer } from '../../../services/customer';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, TranslateModule, MessageBubbleComponent, MessageInputComponent, CustomerModalComponent, TemplateSenderComponent, StatusBadgeComponent, TicketCreateModalComponent],
  templateUrl: './chat-window.html',
  styleUrls: ['./chat-window.css']
})
export class ChatWindowComponent implements OnInit, AfterViewChecked {
  selectedChat$: Observable<Chat | null>;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('scrollAnchor') private scrollAnchor!: ElementRef;
  isTyping = false;
  private typingTimeout: any;
  private lastMessageCount = 0;
  private lastChatId: string | null = null;
  private shouldScroll = false;
  private scrollAttempts = 0;

  // Customer Modal
  isCustomerModalOpen = false;
  selectedPhoneNumber?: string;
  selectedCustomerId?: string;

  // Template Sender Modal
  isTemplateSenderOpen = false;
  selectedCustomerIdForTemplate?: string;

  // Ticket Create Modal
  isTicketCreateModalOpen = false;
  ticketCustomerId?: string | null;
  ticketConversationId?: string | null;
  ticketCustomerPhone?: string | null;

  // Takeover Summary Modal
  isSummaryModalOpen = false;
  conversationSummary: any = null;
  isTakingOver = false;
  isReleasingChat = false;

  // Lifecycle actions loading states
  isResolvingChat = false;
  isClosingChat = false;

  // Image Viewer
  showImageViewer = false;
  currentImageUrl = '';
  currentImageFilename = '';
  isReopeningChat = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.selectedChat$ = this.chatService.selectedChat$;
  }

  ngOnInit() {
    // Track message count changes to determine when to scroll
    this.selectedChat$.subscribe(chat => {
      if (chat) {
        const chatChanged = chat.id !== this.lastChatId;
        const currentMessageCount = chat.messages?.length || 0;

        if (chatChanged) {
          // Chat switched - reset tracking
          this.lastChatId = chat.id;
          this.lastMessageCount = 0; // Reset to 0 so we scroll when messages load

          // If messages are already loaded (cached), scroll immediately
          if (currentMessageCount > 0) {
            this.lastMessageCount = currentMessageCount;
            this.shouldScroll = true;
            this.forceScrollToBottom();
          }
          // Otherwise, wait for messages to load (handled by the else-if below)
        } else if (currentMessageCount > this.lastMessageCount) {
          // Messages loaded for current chat OR new messages added - scroll to bottom
          this.shouldScroll = true;
          this.lastMessageCount = currentMessageCount;
          // Force scroll when messages first load for a newly selected chat
          this.forceScrollToBottom();
        }
      }
    });

    // Subscribe to typing indicators
    this.chatService.onTyping().subscribe(typingData => {
      if (!typingData) {
        this.isTyping = false;
        return;
      }

      // Show typing indicator for current chat only
      this.selectedChat$.subscribe(chat => {
        if (chat && chat.id === typingData.conversationId) {
          this.isTyping = typingData.isTyping !== false; // Default to true if not specified

          // Auto-clear typing indicator after 10 seconds as safety
          if (this.isTyping) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
              this.isTyping = false;
            }, 10000);
          }
        }
      });
    });

    // Subscribe to conversation summaries (from auto-assignment or manual takeover)
    this.chatService.conversationSummary$.subscribe(summaryData => {
      if (summaryData && summaryData.summary) {
        // Validate that summary has actual content before showing modal
        const hasContent = summaryData.summary.briefSummary ||
                          summaryData.summary.keyPoints?.length > 0 ||
                          summaryData.summary.customerIntent;

        if (hasContent) {
          console.log('📊 Received summary from service:', summaryData.source);
          this.conversationSummary = summaryData.summary;
          this.isSummaryModalOpen = true;
        } else {
          console.log('⚠️ Summary received but has no content, skipping modal');
        }
      }
    });
  }

  ngAfterViewChecked() {
    // Only scroll to bottom when messages are added, not on every change
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  scrollToBottom(): void {
    try {
      // Multiple attempts to ensure scroll works
      const scroll = () => {
        if (this.scrollAnchor?.nativeElement) {
          // Method 1: Use scrollIntoView on anchor element at bottom
          this.scrollAnchor.nativeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else if (this.scrollContainer?.nativeElement) {
          // Method 2: Fallback to scrollTop
          const element = this.scrollContainer.nativeElement;
          element.scrollTop = element.scrollHeight;
        }
      };

      // Immediate scroll
      scroll();

      // Delayed scroll to ensure DOM is rendered
      setTimeout(scroll, 50);
      setTimeout(scroll, 150);
    } catch (err) {
      console.error('Scroll error:', err);
    }
  }

  /**
   * Force scroll to bottom with multiple delayed attempts
   * Used when switching chats or loading messages for the first time
   */
  forceScrollToBottom(): void {
    // Use requestAnimationFrame to wait for DOM render
    requestAnimationFrame(() => {
      this.scrollToBottom();
      // Additional delayed scrolls to ensure DOM is fully rendered with all messages
      setTimeout(() => this.scrollToBottom(), 50);
      setTimeout(() => this.scrollToBottom(), 100);
      setTimeout(() => this.scrollToBottom(), 200);
      setTimeout(() => this.scrollToBottom(), 400);
    });
  }

  /**
   * Group messages by date for date separators
   */
  groupMessagesByDate(messages: any[]): { date: string, dateLabel: string, messages: any[] }[] {
    if (!messages || messages.length === 0) return [];

    const groups: { [key: string]: any[] } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    messages.forEach(msg => {
      const msgDate = new Date(msg.timestamp);
      msgDate.setHours(0, 0, 0, 0);
      const dateKey = msgDate.toISOString().split('T')[0];

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });

    // Convert to array and add labels
    return Object.keys(groups)
      .sort()
      .map(dateKey => {
        const msgDate = new Date(dateKey);
        let dateLabel: string;

        if (msgDate.getTime() === today.getTime()) {
          dateLabel = 'Today';
        } else if (msgDate.getTime() === yesterday.getTime()) {
          dateLabel = 'Yesterday';
        } else {
          // Format as "December 27, 2024"
          dateLabel = msgDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }

        return {
          date: dateKey,
          dateLabel,
          messages: groups[dateKey]
        };
      });
  }

  /**
   * Go back to conversation list (mobile)
   */
  goBack(): void {
    this.chatService.deselectChat();
  }

  /**
   * Check if current agent can take over conversations
   */
  canTakeOver(): boolean {
    const currentAgent = this.authService.getCurrentAgent();
    return currentAgent?.autoAssign === true;
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
    const currentAgent = this.authService.getCurrentAgent();

    // Check if agent has auto-assign enabled
    if (currentAgent && !currentAgent.autoAssign) {
      this.toastService.warning('Please enable Auto-Assign in your profile menu to take over conversations', 6000);
      return;
    }

    this.isTakingOver = true;

    this.chatService.assignToMe(chatId).subscribe({
      next: (response) => {
        console.log('Conversation taken over successfully', response);
        this.isTakingOver = false;

        // Emit summary through the service for consistent handling
        if (response.summary) {
          // The summary will be shown via the conversationSummary$ subscription
          // This ensures consistent behavior for both manual and auto-assignment
          this.conversationSummary = response.summary;
          this.isSummaryModalOpen = true;
        }

        this.toastService.success('Conversation assigned to you successfully');
      },
      error: (err) => {
        console.error('Takeover failed:', err);
        this.isTakingOver = false;
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to take over: ${errorMessage}`, 6000);
      }
    });
  }

  /**
   * Release conversation back to AI
   */
  releaseChat(chatId: string) {
    this.isReleasingChat = true;

    this.chatService.releaseConversation(chatId, 'Manual release by agent').subscribe({
      next: () => {
        console.log('Conversation released to AI');
        this.isReleasingChat = false;
        this.toastService.success('Conversation released. AI has resumed control and analyzing your interaction...');
      },
      error: (err) => {
        console.error('Release failed:', err);
        this.isReleasingChat = false;
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to release conversation: ${errorMessage}`, 6000);
      }
    });
  }

  /**
   * Close summary modal
   */
  closeSummaryModal() {
    this.isSummaryModalOpen = false;
    this.conversationSummary = null;
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

  /**
   * Open customer modal to save or edit customer
   */
  openCustomerModal(chat: Chat) {
    this.selectedPhoneNumber = chat.phoneNumber;
    this.selectedCustomerId = chat.customerId;
    this.isCustomerModalOpen = true;
  }

  /**
   * Close customer modal
   */
  closeCustomerModal() {
    this.isCustomerModalOpen = false;
    this.selectedPhoneNumber = undefined;
    this.selectedCustomerId = undefined;
  }

  /**
   * Handle customer saved event
   */
  onCustomerSaved(customer: Customer) {
    console.log('Customer saved:', customer);
    // Update the specific conversation with new customer info
    if (customer.phoneNumber) {
      this.chatService.updateConversationCustomer(customer.phoneNumber, customer);
    }
  }

  /**
   * Open template sender modal
   */
  openTemplateSender(chat: Chat) {
    if (!chat.customerId) {
      this.toastService.warning('Please save customer information first before sending templates', 5000);
      return;
    }
    this.selectedCustomerIdForTemplate = chat.customerId;
    this.isTemplateSenderOpen = true;
  }

  /**
   * Close template sender modal
   */
  closeTemplateSender() {
    this.isTemplateSenderOpen = false;
    this.selectedCustomerIdForTemplate = undefined;
  }

  /**
   * Handle template sent event
   */
  onTemplateSent() {
    console.log('Template sent successfully');
    // Messages will be updated via Socket.io
  }

  /**
   * Check if current user is admin or supervisor
   */
  isAdminOrSupervisor(): boolean {
    return this.authService.isAdminOrSupervisor();
  }

  /**
   * Mark conversation as resolved
   */
  resolveConversation(chatId: string) {
    this.isResolvingChat = true;

    this.chatService.resolveConversation(chatId).subscribe({
      next: () => {
        console.log('Conversation marked as resolved');
        this.isResolvingChat = false;
        this.toastService.success('Conversation marked as resolved. Confirmation sent to customer.');
      },
      error: (err) => {
        console.error('Resolve failed:', err);
        this.isResolvingChat = false;
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to resolve conversation: ${errorMessage}`);
      }
    });
  }

  /**
   * Close conversation (final state)
   */
  closeConversation(chatId: string) {
    if (!confirm('Are you sure you want to close this conversation? This action marks it as complete.')) {
      return;
    }

    this.isClosingChat = true;

    this.chatService.closeConversation(chatId).subscribe({
      next: () => {
        console.log('Conversation closed');
        this.isClosingChat = false;
        this.toastService.success('Conversation closed successfully.');
      },
      error: (err) => {
        console.error('Close failed:', err);
        this.isClosingChat = false;
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to close conversation: ${errorMessage}`);
      }
    });
  }

  /**
   * Reopen closed conversation (admin/supervisor only)
   */
  reopenConversation(chatId: string) {
    if (!confirm('Are you sure you want to reopen this closed conversation?')) {
      return;
    }

    this.isReopeningChat = true;

    this.chatService.reopenConversation(chatId).subscribe({
      next: () => {
        console.log('Conversation reopened');
        this.isReopeningChat = false;
        this.toastService.success('Conversation reopened successfully.');
      },
      error: (err) => {
        console.error('Reopen failed:', err);
        this.isReopeningChat = false;
        const errorMessage = err.error?.error || err.error?.message || 'Unknown error';
        this.toastService.error(`Failed to reopen conversation: ${errorMessage}`);
      }
    });
  }

  /**
   * Create ticket for current conversation
   */
  createTicket(chat: Chat) {
    if (!chat.customerId) {
      this.toastService.warning('Please save customer information first');
      return;
    }

    // Extract customer ID
    const customerId = typeof chat.customerId === 'string'
      ? chat.customerId
      : (chat.customerId as any)._id;

    // Open ticket creation modal with conversation context
    this.ticketCustomerId = customerId;
    this.ticketConversationId = chat.id;
    this.ticketCustomerPhone = chat.phoneNumber;
    this.isTicketCreateModalOpen = true;
  }

  /**
   * Close ticket create modal
   */
  closeTicketCreateModal() {
    this.isTicketCreateModalOpen = false;
    this.ticketCustomerId = null;
    this.ticketConversationId = null;
    this.ticketCustomerPhone = null;
  }

  /**
   * Handle ticket created
   */
  onTicketCreated(ticket: any) {
    this.toastService.success(`Ticket ${ticket.ticketId} created successfully`);
    this.closeTicketCreateModal();
  }

  /**
   * Open image viewer modal
   */
  openImageViewer(event: { url: string; filename: string }) {
    this.currentImageUrl = event.url;
    this.currentImageFilename = event.filename;
    this.showImageViewer = true;
  }

  /**
   * Close image viewer modal
   */
  closeImageViewer() {
    this.showImageViewer = false;
    this.currentImageUrl = '';
    this.currentImageFilename = '';
  }
}
