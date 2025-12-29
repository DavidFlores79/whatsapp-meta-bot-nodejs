# Unified Status System - Angular Frontend Implementation Plan

## Executive Summary

This document provides a detailed implementation plan for unifying the conversation and ticket status display in the Angular frontend. The goal is to simplify conversation statuses from 5 to 3 states while maintaining ticket workflow complexity and creating an intuitive combined status visualization.

## 1. UnifiedStatusBadgeComponent Design

### 1.1 Visual Design Strategy

**Approach: Hierarchical Badge Display**

The unified status will use a **primary-secondary badge pattern** where:
- **Primary badge** (larger, dominant): Shows conversation state (open/active/closed)
- **Secondary badge** (smaller, indicator): Shows ticket state when applicable

**Rationale:**
- Conversations are the primary entity agents interact with
- Tickets are secondary context that adds detail
- Not all conversations have tickets, so ticket status is optional
- Mobile-friendly: collapses gracefully at small viewports

### 1.2 Component Interface

```typescript
// frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.ts

export interface UnifiedStatus {
  conversationStatus: 'open' | 'active' | 'closed';
  ticketStatus?: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'waiting_internal' | 'resolved' | 'closed';
  ticketId?: string;
  ticketPriority?: 'low' | 'medium' | 'high' | 'urgent';
}

@Component({
  selector: 'app-unified-status-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './unified-status-badge.component.html',
  styleUrls: ['./unified-status-badge.component.css']
})
export class UnifiedStatusBadgeComponent {
  @Input() status!: UnifiedStatus;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() layout: 'stacked' | 'inline' | 'compact' = 'inline';
  @Input() showTooltip = true;

  // Expose for template
  getConversationBadgeClass(): string;
  getTicketIndicatorClass(): string;
  getTooltipText(): string;
  getConversationIcon(): string;
  getTicketIcon(): string;
  hasTicket(): boolean;
}
```

### 1.3 Color Scheme (Tailwind CSS)

**Conversation Status Colors:**
```typescript
const conversationColors = {
  open: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    darkBg: 'dark:bg-blue-900/50',
    darkText: 'dark:text-blue-400',
    border: 'border-blue-300',
    icon: 'fas fa-circle-dot',
    label: 'AI Active'
  },
  active: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    darkBg: 'dark:bg-green-900/50',
    darkText: 'dark:text-green-400',
    border: 'border-green-300',
    icon: 'fas fa-user-headset',
    label: 'Agent Active'
  },
  closed: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    darkBg: 'dark:bg-gray-700',
    darkText: 'dark:text-gray-400',
    border: 'border-gray-300',
    icon: 'fas fa-lock',
    label: 'Closed'
  }
};
```

**Ticket Indicator Colors (smaller, accent-style):**
```typescript
const ticketIndicatorColors = {
  new: 'bg-purple-500',
  open: 'bg-blue-500',
  in_progress: 'bg-yellow-500 animate-pulse',
  pending_customer: 'bg-orange-500',
  waiting_internal: 'bg-indigo-500',
  resolved: 'bg-green-500',
  closed: 'bg-gray-500'
};
```

### 1.4 Component Template Patterns

**Layout 1: Inline (Default - Desktop)**
```html
<!-- Shows conversation badge with small ticket dot indicator -->
<div class="inline-flex items-center gap-2">
  <!-- Primary conversation badge -->
  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
        [ngClass]="getConversationBadgeClass()">
    <i [ngClass]="getConversationIcon()"></i>
    <span>{{ getConversationLabel() }}</span>
  </span>

  <!-- Secondary ticket indicator (if ticket exists) -->
  <span *ngIf="hasTicket()"
        class="w-2 h-2 rounded-full animate-pulse"
        [ngClass]="getTicketIndicatorClass()"
        [title]="getTicketTooltip()">
  </span>
</div>
```

**Layout 2: Compact (Mobile - Chat List)**
```html
<!-- Shows only conversation badge with ticket count -->
<div class="inline-flex items-center gap-1">
  <span class="px-2 py-0.5 rounded-full text-xs font-medium"
        [ngClass]="getConversationBadgeClass()">
    <i [ngClass]="getConversationIcon()" class="text-xs"></i>
  </span>

  <span *ngIf="hasTicket()"
        class="text-xs font-bold text-gray-400">
    🎫
  </span>
</div>
```

**Layout 3: Stacked (Detail Views)**
```html
<!-- Shows full conversation + ticket status vertically -->
<div class="flex flex-col gap-1">
  <!-- Conversation status -->
  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
        [ngClass]="getConversationBadgeClass()">
    <i [ngClass]="getConversationIcon()"></i>
    <span>{{ getConversationLabel() }}</span>
  </span>

  <!-- Ticket status (if exists) -->
  <app-ticket-status-badge *ngIf="hasTicket()"
                           [status]="status.ticketStatus!"
                           [showDot]="true">
  </app-ticket-status-badge>
</div>
```

### 1.5 Files to Create

1. **frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.ts**
   - Component logic
   - Status color mapping
   - Tooltip generation
   - Icon mapping

2. **frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.html**
   - Template with responsive layouts
   - Conditional rendering based on layout input

3. **frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.css**
   - Custom animations (pulse, glow)
   - Responsive breakpoints

4. **frontend/src/app/models/unified-status.model.ts**
   - TypeScript interfaces
   - Type guards
   - Utility functions

---

## 2. State Management Updates

### 2.1 ChatService Enhancements

**Current Issue:**
- ChatService only tracks conversation status
- No awareness of linked tickets
- Real-time updates don't include ticket context

**Solution: Hybrid Approach**

```typescript
// frontend/src/app/services/chat.ts

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
  assignedAgent?: string | { ... };
  isAIEnabled?: boolean;

  // Updated status field
  status: 'open' | 'active' | 'closed';

  // NEW: Ticket linkage (lightweight)
  linkedTicket?: {
    ticketId: string;
    _id: string;
    status: string;
    priority: string;
    category: string;
  } | null;

  customerId?: string;
  phoneNumber?: string;
}
```

**Key Design Decision: Fetch-on-Demand vs. Eager Loading**

**Recommended: Eager Loading with Selective Population**

**Rationale:**
- Chat list loads frequently (every page load, real-time updates)
- Ticket info is small (4 fields: ticketId, status, priority, category)
- Backend can efficiently populate via MongoDB aggregation
- Avoids N+1 query problem (loading tickets for each conversation)
- Real-time Socket.io events can include ticket updates

**Implementation:**

```typescript
// frontend/src/app/services/chat.ts

private loadConversations(agent?: Agent | null) {
  const endpoint = `${this.apiUrl}/conversations?includeTickets=true`;

  this.http.get<any>(endpoint).subscribe(
    (response) => {
      const conversations = response.conversations || [];
      const activeConversations = conversations.filter((conv: any) =>
        conv.status !== 'closed'
      );

      const newChats = activeConversations.map((conv: any) => ({
        id: conv._id,
        name: this.getCustomerName(conv.customerId),
        avatar: conv.customerId?.avatar || `https://i.pravatar.cc/150?u=${conv.customerId?.phoneNumber}`,
        lastMessage: conv.lastMessage?.content || '',
        lastMessageTime: new Date(conv.lastMessage?.timestamp || conv.updatedAt),
        unreadCount: 0,
        messages: [],
        assignedAgent: conv.assignedAgent,
        isAIEnabled: conv.isAIEnabled !== false,

        // Map backend status to simplified frontend status
        status: this.mapConversationStatus(conv.status, conv.assignedAgent),

        // NEW: Include linked ticket if exists
        linkedTicket: conv.linkedTicket ? {
          ticketId: conv.linkedTicket.ticketId,
          _id: conv.linkedTicket._id,
          status: conv.linkedTicket.status,
          priority: conv.linkedTicket.priority,
          category: conv.linkedTicket.category
        } : null,

        customerId: conv.customerId?._id,
        phoneNumber: conv.customerId?.phoneNumber
      }));

      this.mockChats = [...newChats, ...this.mockChats];
      this.chatsSubject.next(this.mockChats);
    }
  );
}

/**
 * Map backend status to simplified frontend status
 */
private mapConversationStatus(
  backendStatus: string,
  assignedAgent: any
): 'open' | 'active' | 'closed' {
  if (backendStatus === 'closed') return 'closed';
  if (assignedAgent) return 'active'; // Agent assigned
  return 'open'; // AI handling
}
```

### 2.2 Real-time Updates with Socket.io

**Current Socket.io Events:**
- `new_message`
- `conversation_assigned`
- `conversation_released`
- `ticket_created`
- `ticket_updated`
- `ticket_status_changed`

**NEW Event: `unified_status_update`**

```typescript
// Backend emits this event when either conversation or ticket status changes
socket.emit('unified_status_update', {
  conversationId: '123',
  conversationStatus: 'active',
  linkedTicket: {
    ticketId: 'LUX-2025-000001',
    _id: '456',
    status: 'in_progress',
    priority: 'high',
    category: 'solar_installation'
  }
});
```

**Frontend Handler:**

```typescript
// frontend/src/app/services/chat.ts

private initSocket() {
  this.socket = io();

  // Existing handlers...

  // NEW: Unified status update handler
  this.socket.on('unified_status_update', (data: any) => {
    console.log('Unified status update:', data);
    const chat = this.mockChats.find(c => c.id === data.conversationId);

    if (chat) {
      // Update conversation status
      if (data.conversationStatus) {
        chat.status = data.conversationStatus;
      }

      // Update linked ticket
      if (data.linkedTicket) {
        chat.linkedTicket = data.linkedTicket;
      } else if (data.linkedTicket === null) {
        chat.linkedTicket = null;
      }

      // Trigger UI update
      this.chatsSubject.next([...this.mockChats]);
      this.cdr?.detectChanges();
    }
  });

  // UPDATED: Merge ticket_created into unified update
  this.socket.on('ticket_created', (data: any) => {
    console.log('Ticket created:', data);
    const chat = this.mockChats.find(c => c.id === data.conversationId);

    if (chat) {
      chat.linkedTicket = {
        ticketId: data.ticket.ticketId,
        _id: data.ticket._id,
        status: data.ticket.status,
        priority: data.ticket.priority,
        category: data.ticket.category
      };

      this.chatsSubject.next([...this.mockChats]);
    }
  });

  // UPDATED: Merge ticket_status_changed into unified update
  this.socket.on('ticket_status_changed', (data: any) => {
    console.log('Ticket status changed:', data);
    const chat = this.mockChats.find(c =>
      c.linkedTicket?._id === data.ticketId
    );

    if (chat && chat.linkedTicket) {
      chat.linkedTicket.status = data.newStatus;
      this.chatsSubject.next([...this.mockChats]);
    }
  });
}
```

### 2.3 RxJS Patterns for Combined Updates

**Pattern 1: combineLatest for Conversation + Ticket State**

```typescript
// frontend/src/app/services/chat.ts

/**
 * Observable that emits unified status for a specific conversation
 */
getUnifiedStatus$(conversationId: string): Observable<UnifiedStatus> {
  return combineLatest([
    this.chats$.pipe(
      map(chats => chats.find(c => c.id === conversationId))
    ),
    // Ticket service observable (optional, for detail views)
    this.ticketService.getTicketByConversation$(conversationId).pipe(
      catchError(() => of(null))
    )
  ]).pipe(
    map(([chat, ticket]) => {
      if (!chat) {
        return {
          conversationStatus: 'closed',
          ticketStatus: undefined,
          ticketId: undefined,
          ticketPriority: undefined
        };
      }

      return {
        conversationStatus: chat.status,
        ticketStatus: chat.linkedTicket?.status as any,
        ticketId: chat.linkedTicket?.ticketId,
        ticketPriority: chat.linkedTicket?.priority as any
      };
    }),
    distinctUntilChanged((prev, curr) =>
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );
}
```

**Pattern 2: BehaviorSubject for Immediate Access**

```typescript
// frontend/src/app/services/chat.ts

private unifiedStatusCache = new Map<string, BehaviorSubject<UnifiedStatus>>();

getUnifiedStatusSubject(conversationId: string): BehaviorSubject<UnifiedStatus> {
  if (!this.unifiedStatusCache.has(conversationId)) {
    const chat = this.mockChats.find(c => c.id === conversationId);
    const initialStatus: UnifiedStatus = {
      conversationStatus: chat?.status || 'open',
      ticketStatus: chat?.linkedTicket?.status as any,
      ticketId: chat?.linkedTicket?.ticketId,
      ticketPriority: chat?.linkedTicket?.priority as any
    };

    this.unifiedStatusCache.set(
      conversationId,
      new BehaviorSubject(initialStatus)
    );
  }

  return this.unifiedStatusCache.get(conversationId)!;
}

// Call this in Socket.io handlers to update cache
private updateUnifiedStatusCache(conversationId: string, status: UnifiedStatus) {
  const subject = this.unifiedStatusCache.get(conversationId);
  if (subject) {
    subject.next(status);
  }
}
```

### 2.4 Files to Modify

1. **frontend/src/app/services/chat.ts**
   - Add `linkedTicket` field to `Chat` interface
   - Update `loadConversations()` to include ticket data
   - Add `unified_status_update` Socket.io handler
   - Add `getUnifiedStatus$()` method
   - Update status mapping logic

2. **frontend/src/app/models/unified-status.model.ts** (NEW)
   - Create `UnifiedStatus` interface
   - Export type guards and utilities

---

## 3. ChatListComponent Simplification

### 3.1 Current State Analysis

**Current Filters:**
- 3 tabs: Queue / My Chats / All
- Status dropdown: all, open, assigned, waiting, resolved, closed (5 statuses)

**Issues:**
- 5 conversation statuses are confusing (open vs assigned vs waiting)
- Status filter clutters UI
- Not clear which conversations need attention

### 3.2 Simplified Filter Strategy

**Remove Status Dropdown Completely**

**Rationale:**
- With only 3 statuses (open/active/closed), tabs provide sufficient filtering
- Closed conversations are already filtered out (line 144 in chat.ts)
- Active conversations are filtered by tabs (Queue = unassigned, My Chats = assigned)
- Adding a status filter is redundant

**New Filter Layout:**

```html
<!-- frontend/src/app/components/chat/chat-list/chat-list.html -->

<div class="p-2 bg-whatsapp-dark border-b border-gray-700 shrink-0 space-y-2">
  <!-- Search Bar -->
  <div class="bg-whatsapp-gray rounded-lg flex items-center px-4 py-1.5">
    <i class="fas fa-search text-gray-400 text-sm"></i>
    <input type="text"
           [placeholder]="'chat.searchPlaceholder' | translate"
           class="bg-transparent border-none text-gray-200 text-sm ml-4 w-full focus:outline-none placeholder-gray-400">
  </div>

  <!-- NEW: Quick Filters (icon-based, mobile-friendly) -->
  <div class="flex items-center gap-2">
    <button
      (click)="toggleFilter('hasTicket')"
      [class.bg-purple-500]="showTicketsOnly"
      [class.text-white]="showTicketsOnly"
      class="px-3 py-1 rounded-full text-xs font-medium bg-whatsapp-gray text-gray-400 hover:bg-gray-600 transition-colors"
      title="Show only conversations with tickets">
      <i class="fas fa-ticket mr-1"></i>
      <span class="hidden sm:inline">With Ticket</span>
    </button>

    <button
      (click)="toggleFilter('highPriority')"
      [class.bg-red-500]="showHighPriorityOnly"
      [class.text-white]="showHighPriorityOnly"
      class="px-3 py-1 rounded-full text-xs font-medium bg-whatsapp-gray text-gray-400 hover:bg-gray-600 transition-colors"
      title="Show only high priority">
      <i class="fas fa-exclamation-triangle mr-1"></i>
      <span class="hidden sm:inline">Urgent</span>
    </button>

    <button
      (click)="clearQuickFilters()"
      *ngIf="hasActiveFilters()"
      class="px-2 py-1 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
      title="Clear filters">
      <i class="fas fa-times"></i>
    </button>
  </div>
</div>
```

### 3.3 Updated Tab Logic

```typescript
// frontend/src/app/components/chat/chat-list/chat-list.ts

export class ChatListComponent implements OnInit {
  // Remove statusFilter
  activeTab: 'queue' | 'mine' | 'all' = 'queue';

  // NEW: Quick filters
  showTicketsOnly = false;
  showHighPriorityOnly = false;

  toggleFilter(filter: 'hasTicket' | 'highPriority') {
    if (filter === 'hasTicket') {
      this.showTicketsOnly = !this.showTicketsOnly;
    } else if (filter === 'highPriority') {
      this.showHighPriorityOnly = !this.showHighPriorityOnly;
    }
  }

  clearQuickFilters() {
    this.showTicketsOnly = false;
    this.showHighPriorityOnly = false;
  }

  hasActiveFilters(): boolean {
    return this.showTicketsOnly || this.showHighPriorityOnly;
  }

  getDisplayChats(): Observable<Chat[]> {
    let baseChats$: Observable<Chat[]>;

    switch (this.activeTab) {
      case 'queue':
        baseChats$ = this.queueChats$;
        break;
      case 'mine':
        baseChats$ = this.myChats$;
        break;
      case 'all':
      default:
        baseChats$ = this.chats$;
    }

    // Apply quick filters
    return baseChats$.pipe(
      map(chats => {
        let filtered = chats;

        // Filter by ticket existence
        if (this.showTicketsOnly) {
          filtered = filtered.filter(chat => chat.linkedTicket !== null);
        }

        // Filter by high priority
        if (this.showHighPriorityOnly) {
          filtered = filtered.filter(chat =>
            chat.linkedTicket?.priority === 'high' ||
            chat.linkedTicket?.priority === 'urgent'
          );
        }

        return filtered;
      })
    );
  }
}
```

### 3.4 Ticket Indicator in Chat List

**Add visual ticket indicator to chat list items:**

```html
<!-- frontend/src/app/components/chat/chat-list/chat-list.html -->

<div *ngFor="let chat of getDisplayChats() | async"
     (click)="selectChat(chat.id)"
     [class.bg-whatsapp-gray]="(selectedChatId$ | async) === chat.id"
     class="flex items-center px-3 py-3 cursor-pointer hover:bg-whatsapp-gray transition-colors border-b border-gray-800 relative">

  <!-- Avatar with ticket badge -->
  <div class="w-12 h-12 rounded-full overflow-hidden shrink-0 mr-3 relative">
    <img [src]="chat.avatar" [alt]="chat.name" class="w-full h-full object-cover">

    <!-- Assignment indicator (existing) -->
    <div *ngIf="chat.assignedAgent"
         class="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-full border-2 border-whatsapp-dark"
         title="Assigned">
    </div>

    <!-- NEW: Ticket indicator (top-left) -->
    <div *ngIf="chat.linkedTicket"
         class="absolute top-0 left-0 w-4 h-4 rounded-full border-2 border-whatsapp-dark flex items-center justify-center text-xs"
         [ngClass]="getTicketPriorityBadgeClass(chat.linkedTicket.priority)"
         [title]="'Ticket: ' + chat.linkedTicket.ticketId">
      <i class="fas fa-ticket text-xs"></i>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <div class="flex justify-between items-baseline mb-1">
      <h3 class="text-gray-100 font-medium truncate">{{ chat.name }}</h3>
      <span class="text-xs text-gray-400 shrink-0">
        {{ chat.lastMessageTime | date:'shortTime' }}
      </span>
    </div>

    <div class="flex justify-between items-center gap-2">
      <p class="text-sm text-gray-400 truncate mr-2">{{ chat.lastMessage }}</p>

      <!-- UPDATED: Use UnifiedStatusBadgeComponent -->
      <div class="flex items-center gap-2 shrink-0">
        <app-unified-status-badge
          *ngIf="chat.status"
          [status]="{
            conversationStatus: chat.status,
            ticketStatus: chat.linkedTicket?.status,
            ticketId: chat.linkedTicket?.ticketId,
            ticketPriority: chat.linkedTicket?.priority
          }"
          size="sm"
          layout="compact">
        </app-unified-status-badge>

        <div *ngIf="chat.unreadCount > 0"
             class="bg-whatsapp-green text-whatsapp-dark text-xs font-bold rounded-full h-5 min-w-[1.25rem] flex items-center justify-center px-1">
          {{ chat.unreadCount }}
        </div>
      </div>
    </div>
  </div>
</div>
```

### 3.5 Helper Methods

```typescript
// frontend/src/app/components/chat/chat-list/chat-list.ts

getTicketPriorityBadgeClass(priority?: string): string {
  const priorityMap: { [key: string]: string } = {
    'low': 'bg-gray-500',
    'medium': 'bg-blue-500',
    'high': 'bg-orange-500',
    'urgent': 'bg-red-500 animate-pulse'
  };
  return priorityMap[priority || 'low'] || 'bg-gray-500';
}
```

### 3.6 Files to Modify

1. **frontend/src/app/components/chat/chat-list/chat-list.ts**
   - Remove `statusFilter` property
   - Remove `setStatusFilter()` method
   - Add quick filter properties and methods
   - Update `getDisplayChats()` to use quick filters
   - Add `getTicketPriorityBadgeClass()` helper

2. **frontend/src/app/components/chat/chat-list/chat-list.html**
   - Remove status dropdown filter
   - Add quick filter buttons
   - Add ticket indicator to avatar
   - Replace `StatusBadgeComponent` with `UnifiedStatusBadgeComponent`

---

## 4. Mobile Considerations

### 4.1 Responsive Breakpoints

**Tailwind CSS Breakpoints:**
- `sm`: 640px (mobile landscape)
- `md`: 768px (tablet)
- `lg`: 1024px (desktop)

**Strategy:**
- Mobile (<640px): Compact layout, icon-only indicators
- Tablet (640-1024px): Inline layout with abbreviated labels
- Desktop (>1024px): Full layout with labels and tooltips

### 4.2 Mobile-Optimized Status Display

**Chat List (Mobile):**
```html
<!-- Compact badge: icon + dot indicator -->
<app-unified-status-badge
  [status]="getUnifiedStatus(chat)"
  size="sm"
  layout="compact">
</app-unified-status-badge>
```

**Chat Window Header (Mobile):**
```html
<!-- Inline badge: conversation + ticket dot -->
<app-unified-status-badge
  [status]="getUnifiedStatus(selectedChat)"
  size="md"
  layout="inline">
</app-unified-status-badge>
```

**Ticket Detail (Mobile):**
```html
<!-- Stacked: full status labels -->
<app-unified-status-badge
  [status]="getUnifiedStatus(ticket.conversation)"
  size="md"
  layout="stacked">
</app-unified-status-badge>
```

### 4.3 Touch-Friendly Interactions

**Quick Filters (Mobile):**
```html
<!-- Icon-only buttons with larger touch targets -->
<button
  (click)="toggleFilter('hasTicket')"
  class="w-10 h-10 rounded-full flex items-center justify-center"
  [class.bg-purple-500]="showTicketsOnly"
  [class.bg-whatsapp-gray]="!showTicketsOnly">
  <i class="fas fa-ticket text-sm"></i>
</button>
```

### 4.4 Responsive Template Pattern

```html
<!-- frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.html -->

<div [ngSwitch]="layout" class="unified-status-badge">
  <!-- Compact Layout (Mobile) -->
  <div *ngSwitchCase="'compact'" class="inline-flex items-center gap-1">
    <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
          [ngClass]="getConversationBadgeClass()">
      <i [ngClass]="getConversationIcon()"></i>
    </span>

    <span *ngIf="hasTicket()"
          class="w-2 h-2 rounded-full"
          [ngClass]="getTicketIndicatorClass()">
    </span>
  </div>

  <!-- Inline Layout (Tablet/Desktop) -->
  <div *ngSwitchCase="'inline'" class="inline-flex items-center gap-2">
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
          [ngClass]="getConversationBadgeClass()">
      <i [ngClass]="getConversationIcon()"></i>
      <span class="hidden sm:inline">{{ getConversationLabel() }}</span>
    </span>

    <span *ngIf="hasTicket()"
          class="w-2 h-2 rounded-full animate-pulse"
          [ngClass]="getTicketIndicatorClass()"
          [title]="getTicketTooltip()">
    </span>
  </div>

  <!-- Stacked Layout (Detail Views) -->
  <div *ngSwitchCase="'stacked'" class="flex flex-col gap-1">
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
          [ngClass]="getConversationBadgeClass()">
      <i [ngClass]="getConversationIcon()"></i>
      <span>{{ getConversationLabel() }}</span>
    </span>

    <app-ticket-status-badge *ngIf="hasTicket()"
                             [status]="status.ticketStatus!"
                             [showDot]="true">
    </app-ticket-status-badge>
  </div>
</div>
```

### 4.5 Performance Optimization for Mobile

**Virtual Scrolling (Optional):**
```typescript
// For very long chat lists (>100 conversations)
import { ScrollingModule } from '@angular/cdk/scrolling';

// Use <cdk-virtual-scroll-viewport> in chat-list.html
```

**Change Detection Strategy:**
```typescript
// frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.ts

@Component({
  selector: 'app-unified-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush, // Optimize rendering
  // ...
})
```

---

## 5. Socket.io Event Handling

### 5.1 Efficient Update Strategy

**Current Issue:**
- Multiple events (`conversation_updated`, `ticket_status_changed`, etc.) cause redundant UI updates
- No batching mechanism
- Can cause flickering on mobile

**Solution: Debounced Batch Updates**

```typescript
// frontend/src/app/services/chat.ts

import { debounceTime, bufferTime } from 'rxjs/operators';

private updateQueue$ = new Subject<{
  conversationId: string;
  updates: Partial<Chat>;
}>();

constructor(
  private http: HttpClient,
  private authService: AuthService,
  private toastService: ToastService,
  private cdr: ChangeDetectorRef // Inject if needed
) {
  this.initSocket();
  this.setupBatchUpdates();
}

private setupBatchUpdates() {
  // Batch updates every 300ms to prevent UI thrashing
  this.updateQueue$.pipe(
    bufferTime(300),
    filter(updates => updates.length > 0)
  ).subscribe(batchedUpdates => {
    // Group updates by conversation ID
    const groupedUpdates = new Map<string, Partial<Chat>>();

    batchedUpdates.forEach(update => {
      const existing = groupedUpdates.get(update.conversationId) || {};
      groupedUpdates.set(update.conversationId, {
        ...existing,
        ...update.updates
      });
    });

    // Apply all updates at once
    groupedUpdates.forEach((updates, conversationId) => {
      const chat = this.mockChats.find(c => c.id === conversationId);
      if (chat) {
        Object.assign(chat, updates);
      }
    });

    // Single UI update for all changes
    this.chatsSubject.next([...this.mockChats]);
    console.log(`Applied ${groupedUpdates.size} batched updates`);
  });
}
```

### 5.2 Unified Event Handler

```typescript
// frontend/src/app/services/chat.ts

private initSocket() {
  this.socket = io();

  // Unified status update (PRIMARY event)
  this.socket.on('unified_status_update', (data: {
    conversationId: string;
    conversationStatus?: 'open' | 'active' | 'closed';
    linkedTicket?: {
      ticketId: string;
      _id: string;
      status: string;
      priority: string;
      category: string;
    } | null;
  }) => {
    console.log('Unified status update:', data);

    this.updateQueue$.next({
      conversationId: data.conversationId,
      updates: {
        status: data.conversationStatus,
        linkedTicket: data.linkedTicket
      }
    });
  });

  // LEGACY: Keep existing events for backward compatibility
  // These will be phased out once backend emits unified_status_update

  this.socket.on('conversation_assigned', (data: any) => {
    console.log('Conversation assigned:', data);

    this.updateQueue$.next({
      conversationId: data.conversationId,
      updates: {
        status: 'active',
        assignedAgent: this.currentAgent?._id || 'unknown',
        isAIEnabled: false
      }
    });

    // Notification (immediate, not batched)
    this.playNotificationSound();
    this.toastService.info(`New conversation assigned: ${data.customerName}`, 5000);
  });

  this.socket.on('conversation_released', (data: any) => {
    console.log('Conversation released:', data);

    this.updateQueue$.next({
      conversationId: data.conversationId,
      updates: {
        status: 'open',
        assignedAgent: undefined,
        isAIEnabled: true
      }
    });
  });

  this.socket.on('ticket_created', (data: any) => {
    console.log('Ticket created:', data);

    this.updateQueue$.next({
      conversationId: data.conversationId,
      updates: {
        linkedTicket: {
          ticketId: data.ticket.ticketId,
          _id: data.ticket._id,
          status: data.ticket.status,
          priority: data.ticket.priority,
          category: data.ticket.category
        }
      }
    });
  });

  this.socket.on('ticket_status_changed', (data: any) => {
    console.log('Ticket status changed:', data);

    // Find conversation by ticket ID
    const chat = this.mockChats.find(c => c.linkedTicket?._id === data.ticketId);

    if (chat && chat.linkedTicket) {
      this.updateQueue$.next({
        conversationId: chat.id,
        updates: {
          linkedTicket: {
            ...chat.linkedTicket,
            status: data.newStatus
          }
        }
      });
    }
  });
}
```

### 5.3 Error Handling and Recovery

```typescript
// frontend/src/app/services/chat.ts

private initSocket() {
  this.socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  this.socket.on('connect_error', (error: any) => {
    console.error('Socket connection error:', error);
    this.toastService.error('Connection lost. Attempting to reconnect...', 3000);
  });

  this.socket.on('reconnect', (attemptNumber: number) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    this.toastService.success('Connection restored', 2000);

    // Reload conversations to sync state
    this.loadConversations(this.currentAgent);
  });

  this.socket.on('disconnect', (reason: string) => {
    console.warn('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, manually reconnect
      this.socket.connect();
    }
  });
}
```

### 5.4 Files to Modify

1. **frontend/src/app/services/chat.ts**
   - Add `updateQueue$` Subject
   - Add `setupBatchUpdates()` method
   - Add `unified_status_update` handler
   - Update existing Socket.io handlers to use `updateQueue$`
   - Add error handling and reconnection logic

---

## 6. Implementation Checklist

### 6.1 Phase 1: Foundation (Components & Models)

- [ ] Create `frontend/src/app/models/unified-status.model.ts`
  - Export `UnifiedStatus` interface
  - Add type guards (`isConversationStatus`, `isTicketStatus`)
  - Add utility functions (`getStatusLabel`, `getStatusColor`)

- [ ] Create `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.ts`
  - Implement component logic
  - Add color mapping methods
  - Add tooltip generation
  - Add icon mapping

- [ ] Create `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.html`
  - Implement compact layout
  - Implement inline layout
  - Implement stacked layout
  - Add responsive breakpoints

- [ ] Create `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.css`
  - Add custom animations
  - Add hover effects
  - Add dark mode styles

### 6.2 Phase 2: State Management

- [ ] Modify `frontend/src/app/services/chat.ts`
  - Add `linkedTicket` field to `Chat` interface
  - Add `mapConversationStatus()` method
  - Update `loadConversations()` to include tickets
  - Add `getUnifiedStatus$()` method
  - Add `updateQueue$` Subject
  - Add `setupBatchUpdates()` method

- [ ] Update Socket.io handlers
  - Add `unified_status_update` handler
  - Update `conversation_assigned` handler
  - Update `conversation_released` handler
  - Update `ticket_created` handler
  - Update `ticket_status_changed` handler
  - Add error handling and reconnection logic

### 6.3 Phase 3: UI Updates

- [ ] Modify `frontend/src/app/components/chat/chat-list/chat-list.ts`
  - Remove `statusFilter` property
  - Add `showTicketsOnly` property
  - Add `showHighPriorityOnly` property
  - Add `toggleFilter()` method
  - Add `clearQuickFilters()` method
  - Add `hasActiveFilters()` method
  - Update `getDisplayChats()` for quick filters
  - Add `getTicketPriorityBadgeClass()` helper

- [ ] Modify `frontend/src/app/components/chat/chat-list/chat-list.html`
  - Remove status dropdown
  - Add quick filter buttons
  - Add ticket indicator to avatar
  - Replace `StatusBadgeComponent` with `UnifiedStatusBadgeComponent`
  - Update responsive classes for mobile

### 6.4 Phase 4: Backend Integration

- [ ] Backend: Add `includeTickets` query parameter to `/api/v2/conversations` endpoint
- [ ] Backend: Implement MongoDB aggregation to populate linked ticket
- [ ] Backend: Create `unified_status_update` Socket.io event
- [ ] Backend: Update conversation status transitions to emit `unified_status_update`
- [ ] Backend: Update ticket status transitions to emit `unified_status_update`

### 6.5 Phase 5: Testing

- [ ] Unit tests for `UnifiedStatusBadgeComponent`
  - Test color mapping
  - Test tooltip generation
  - Test layout switching
  - Test responsive behavior

- [ ] Integration tests for `ChatService`
  - Test `loadConversations()` with ticket data
  - Test `unified_status_update` handler
  - Test batch updates
  - Test Socket.io reconnection

- [ ] E2E tests
  - Test chat list filtering
  - Test status badge display
  - Test real-time updates
  - Test mobile responsive behavior

---

## 7. Migration Strategy

### 7.1 Backward Compatibility

**Goal:** Support both old and new status systems during migration

**Approach:**
1. Keep existing `StatusBadgeComponent` (don't remove)
2. Add new `UnifiedStatusBadgeComponent` alongside
3. Gradually migrate components to use unified badge
4. Backend emits both old and new events during transition

**Status Mapping:**

```typescript
// frontend/src/app/services/chat.ts

/**
 * Map old backend status to new simplified status
 */
private mapConversationStatus(
  backendStatus: string,
  assignedAgent: any
): 'open' | 'active' | 'closed' {
  const statusMap: { [key: string]: 'open' | 'active' | 'closed' } = {
    'open': 'open',
    'assigned': 'active',
    'waiting': 'active',
    'resolved': 'active',
    'closed': 'closed'
  };

  // If agent assigned, always show as 'active'
  if (assignedAgent) return 'active';

  return statusMap[backendStatus] || 'open';
}

/**
 * Reverse map: convert simplified status to backend status (for API calls)
 */
private mapToBackendStatus(
  frontendStatus: 'open' | 'active' | 'closed',
  isAssigned: boolean
): string {
  if (frontendStatus === 'closed') return 'closed';
  if (frontendStatus === 'active' && isAssigned) return 'assigned';
  return 'open';
}
```

### 7.2 Feature Flag (Optional)

```typescript
// frontend/src/app/services/feature-flags.service.ts

export class FeatureFlagsService {
  private flags = {
    unifiedStatus: true, // Enable/disable unified status system
    batchUpdates: true,  // Enable/disable batch updates
  };

  isEnabled(flag: string): boolean {
    return this.flags[flag] || false;
  }
}

// Usage in components
constructor(private featureFlags: FeatureFlagsService) {}

ngOnInit() {
  if (this.featureFlags.isEnabled('unifiedStatus')) {
    // Use UnifiedStatusBadgeComponent
  } else {
    // Use old StatusBadgeComponent
  }
}
```

### 7.3 Migration Timeline

**Week 1: Foundation**
- Create `UnifiedStatusBadgeComponent`
- Create `unified-status.model.ts`
- Update `Chat` interface with `linkedTicket`

**Week 2: State Management**
- Update `ChatService` with unified status methods
- Add Socket.io `unified_status_update` handler
- Implement batch updates

**Week 3: UI Integration**
- Update `ChatListComponent` to use unified badge
- Add quick filters
- Test mobile responsive behavior

**Week 4: Backend Integration**
- Update backend to emit `unified_status_update`
- Add `includeTickets` query parameter
- Test end-to-end real-time updates

**Week 5: Testing & Rollout**
- E2E testing
- Performance testing on mobile
- Gradual rollout with feature flag

---

## 8. Technical Notes and Best Practices

### 8.1 TypeScript Strictness

**Ensure strict null checking:**

```typescript
// frontend/src/app/models/unified-status.model.ts

export interface UnifiedStatus {
  conversationStatus: 'open' | 'active' | 'closed';
  ticketStatus?: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'waiting_internal' | 'resolved' | 'closed';
  ticketId?: string;
  ticketPriority?: 'low' | 'medium' | 'high' | 'urgent';
}

// Type guard for ticket existence
export function hasTicket(status: UnifiedStatus): status is Required<UnifiedStatus> {
  return status.ticketStatus !== undefined && status.ticketId !== undefined;
}

// Safe ticket access
function getTicketStatusLabel(status: UnifiedStatus): string {
  if (hasTicket(status)) {
    return status.ticketStatus; // TypeScript knows this is defined
  }
  return 'No Ticket';
}
```

### 8.2 Performance Optimization

**OnPush Change Detection:**

```typescript
@Component({
  selector: 'app-unified-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ...
})
export class UnifiedStatusBadgeComponent {
  // Use immutable inputs
  @Input() status!: UnifiedStatus;

  // Component only re-renders when status reference changes
}
```

**Memoization for Expensive Computations:**

```typescript
private memoizedTooltips = new Map<string, string>();

getTooltipText(): string {
  const key = JSON.stringify(this.status);

  if (!this.memoizedTooltips.has(key)) {
    const tooltip = this.computeTooltip(this.status);
    this.memoizedTooltips.set(key, tooltip);
  }

  return this.memoizedTooltips.get(key)!;
}
```

### 8.3 Accessibility (WCAG 2.1 AA)

**Color Contrast:**
- Ensure 4.5:1 contrast ratio for text
- Test with Chrome DevTools Lighthouse

**Keyboard Navigation:**
```html
<button
  (click)="toggleFilter('hasTicket')"
  [attr.aria-pressed]="showTicketsOnly"
  role="button"
  tabindex="0"
  class="...">
  <span class="sr-only">Filter conversations with tickets</span>
  <i class="fas fa-ticket"></i>
</button>
```

**Screen Reader Support:**
```html
<app-unified-status-badge
  [status]="getUnifiedStatus(chat)"
  [attr.aria-label]="'Conversation status: ' + chat.status + (chat.linkedTicket ? ', Ticket status: ' + chat.linkedTicket.status : '')">
</app-unified-status-badge>
```

### 8.4 Testing Strategy

**Unit Tests (Jasmine):**

```typescript
// frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.spec.ts

describe('UnifiedStatusBadgeComponent', () => {
  let component: UnifiedStatusBadgeComponent;
  let fixture: ComponentFixture<UnifiedStatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnifiedStatusBadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UnifiedStatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display conversation status', () => {
    component.status = {
      conversationStatus: 'open',
      ticketStatus: undefined
    };
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.conversation-badge');
    expect(badge.textContent).toContain('AI Active');
  });

  it('should display ticket indicator when ticket exists', () => {
    component.status = {
      conversationStatus: 'active',
      ticketStatus: 'in_progress',
      ticketId: 'LUX-2025-000001',
      ticketPriority: 'high'
    };
    fixture.detectChanges();

    const ticketDot = fixture.nativeElement.querySelector('.ticket-indicator');
    expect(ticketDot).toBeTruthy();
  });

  it('should switch layout based on input', () => {
    component.layout = 'compact';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.compact-layout')).toBeTruthy();

    component.layout = 'inline';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.inline-layout')).toBeTruthy();
  });
});
```

**E2E Tests (Cypress):**

```typescript
// frontend/cypress/e2e/unified-status.cy.ts

describe('Unified Status System', () => {
  beforeEach(() => {
    cy.login(); // Custom command to authenticate
    cy.visit('/conversations');
  });

  it('should display conversation status in chat list', () => {
    cy.get('[data-test="chat-list-item"]').first()
      .find('app-unified-status-badge')
      .should('exist');
  });

  it('should show ticket indicator for conversations with tickets', () => {
    cy.get('[data-test="chat-list-item"]')
      .filter(':has([data-test="ticket-indicator"])')
      .should('have.length.greaterThan', 0);
  });

  it('should filter conversations by ticket existence', () => {
    cy.get('[data-test="filter-has-ticket"]').click();

    cy.get('[data-test="chat-list-item"]').each(($el) => {
      cy.wrap($el).find('[data-test="ticket-indicator"]').should('exist');
    });
  });

  it('should update status in real-time via Socket.io', () => {
    // Simulate Socket.io event
    cy.window().then((win) => {
      win.io.emit('unified_status_update', {
        conversationId: 'test-conv-123',
        conversationStatus: 'active',
        linkedTicket: {
          ticketId: 'LUX-2025-000001',
          status: 'in_progress'
        }
      });
    });

    // Verify UI update
    cy.get('[data-test="chat-test-conv-123"]')
      .find('app-unified-status-badge')
      .should('contain', 'Agent Active');
  });
});
```

---

## 9. Summary and Key Takeaways

### 9.1 Architecture Decisions

1. **Primary-Secondary Badge Pattern**: Conversation status is primary, ticket status is secondary indicator
2. **Eager Loading with Selective Population**: Load linked ticket data upfront to avoid N+1 queries
3. **Batched Socket.io Updates**: Prevent UI thrashing by batching real-time updates (300ms window)
4. **Three Responsive Layouts**: Compact (mobile), Inline (tablet/desktop), Stacked (detail views)
5. **Backward Compatibility**: Support old and new systems during migration with status mapping

### 9.2 Benefits

1. **Simplified UX**: 3 conversation statuses instead of 5 reduces cognitive load
2. **Better Context**: Ticket indicator shows agents which conversations need attention
3. **Mobile-Optimized**: Compact layouts work on small screens without information loss
4. **Performance**: Batch updates and OnPush change detection prevent rendering bottlenecks
5. **Maintainability**: Single source of truth for status display across all components

### 9.3 Migration Complexity: Medium

**Estimated Effort:**
- Frontend: 3-4 days
- Backend: 1-2 days (Socket.io events, query parameter)
- Testing: 2-3 days
- Total: ~1.5 weeks

**Risk Mitigation:**
- Feature flag for gradual rollout
- Backward compatibility during transition
- Comprehensive E2E tests
- Mobile testing on real devices

---

## 10. Files Summary

### 10.1 New Files to Create

1. `frontend/src/app/models/unified-status.model.ts` - TypeScript interfaces and utilities
2. `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.ts` - Component logic
3. `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.html` - Template
4. `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.css` - Styles
5. `frontend/src/app/components/shared/unified-status-badge/unified-status-badge.component.spec.ts` - Unit tests
6. `frontend/cypress/e2e/unified-status.cy.ts` - E2E tests

### 10.2 Existing Files to Modify

1. `frontend/src/app/services/chat.ts` - Add linkedTicket, unified status methods, Socket.io handlers
2. `frontend/src/app/components/chat/chat-list/chat-list.ts` - Remove status filter, add quick filters
3. `frontend/src/app/components/chat/chat-list/chat-list.html` - Update UI with unified badge
4. `frontend/src/app/components/chat/chat-window/chat-window.ts` - Display unified status in header
5. `frontend/src/app/components/tickets/ticket-detail/ticket-detail.component.ts` - Show conversation status

### 10.3 Backend Changes (Out of Scope for This Document)

1. `src/routes/conversationRoutes.js` - Add `includeTickets` query parameter support
2. `src/controllers/conversationController.js` - Implement ticket population logic
3. `src/services/socketService.js` - Emit `unified_status_update` event
4. `src/controllers/ticketController.js` - Emit `unified_status_update` on ticket status change

---

## 11. Next Steps

1. Review this implementation plan with the team
2. Create Jira/GitHub tickets for each phase
3. Set up feature branch: `feat/unified-status-system`
4. Begin Phase 1: Foundation (components & models)
5. Schedule weekly reviews during 5-week migration

---

**Document Version:** 1.0
**Last Updated:** 2025-12-29
**Author:** Claude Code (AI-Assisted Implementation Planning)
**Review Status:** Pending Team Review
