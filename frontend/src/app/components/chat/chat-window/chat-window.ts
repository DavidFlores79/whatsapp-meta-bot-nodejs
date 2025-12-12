import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ChatService, Chat } from '../../../services/chat';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast';
import { Observable } from 'rxjs';
import { MessageBubbleComponent } from '../message-bubble/message-bubble';
import { MessageInputComponent } from '../message-input/message-input';
import { CustomerModalComponent } from '../../customers/customer-modal/customer-modal';
import { TemplateSenderComponent } from '../../templates/template-sender/template-sender';
import { Customer } from '../../../services/customer';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, TranslateModule, MessageBubbleComponent, MessageInputComponent, CustomerModalComponent, TemplateSenderComponent],
  templateUrl: './chat-window.html',
  styleUrls: ['./chat-window.css']
})
export class ChatWindowComponent implements OnInit, AfterViewChecked {
  selectedChat$: Observable<Chat | null>;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  isTyping = false;
  private typingTimeout: any;

  // Customer Modal
  isCustomerModalOpen = false;
  selectedPhoneNumber?: string;
  selectedCustomerId?: string;

  // Template Sender Modal
  isTemplateSenderOpen = false;
  selectedCustomerIdForTemplate?: string;

  // Takeover Summary Modal
  isSummaryModalOpen = false;
  conversationSummary: any = null;
  isTakingOver = false;
  isReleasingChat = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.selectedChat$ = this.chatService.selectedChat$;
  }

  ngOnInit() {
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

        // Show summary modal if available
        if (response.summary) {
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
}
