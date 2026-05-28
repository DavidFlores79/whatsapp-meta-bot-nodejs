# Angular Frontend Implementation Plan: TicketList Component

## Document Information
- **Component**: TicketList Component
- **Feature**: Universal Ticket System Frontend
- **Framework**: Angular 21 (Standalone Components)
- **Architecture**: Clean Architecture Pattern
- **Date**: 2025-12-21
- **Status**: Implementation Ready

---

## 1. Component Overview

### 1.1 Purpose
The TicketList component is a smart container component responsible for displaying, filtering, sorting, and managing tickets in a paginated table/card view with real-time updates via Socket.io.

### 1.2 Component Location
```
frontend/src/app/components/tickets/ticket-list/
├── ticket-list.component.ts      (TypeScript logic)
├── ticket-list.component.html    (Template)
└── ticket-list.component.css     (Styles)
```

### 1.3 Component Architecture Layer
**Layer**: UI Layer (Presentation) - Smart/Container Component

**Responsibilities**:
- Orchestrate ticket listing feature logic
- Manage component state and user interactions
- Subscribe to TicketService observables for real-time updates
- Handle filtering, sorting, pagination, and navigation
- Coordinate with child components (TicketStatusBadge)

---

## 2. Dependencies and Imports

### 2.1 Angular Core Imports
```typescript
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
```

**Rationale**:
- `Component, OnInit, OnDestroy`: Lifecycle management
- `inject`: Modern Angular 18+ dependency injection (recommended over constructor injection)
- `ChangeDetectorRef`: Manual change detection for Socket.io updates
- `CommonModule`: Structural directives (*ngIf, *ngFor, *ngClass)
- `FormsModule`: Template-driven forms for filters ([(ngModel)])
- `Router`: Navigation to ticket detail and create pages

### 2.2 Service Imports
```typescript
import { TicketService, Ticket, TicketFilters, PaginatedTickets } from '../../../services/ticket';
import { ConfigurationService, TicketCategory } from '../../../services/configuration';
import { AgentService, Agent } from '../../../services/agent';
import { ToastService } from '../../../services/toast';
```

**Rationale**:
- `TicketService`: Core business logic for ticket operations and real-time updates
- `ConfigurationService`: Fetch dynamic ticket categories for filters
- `AgentService`: Agent list for "Assigned Agent" filter
- `ToastService`: User notifications for errors and success messages

### 2.3 Component Imports
```typescript
import { TicketStatusBadgeComponent } from '../ticket-status-badge/ticket-status-badge.component';
```

**Rationale**:
- Reusable presentational component for consistent status display

### 2.4 RxJS Imports
```typescript
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
```

**Rationale**:
- `Subject`: Memory leak prevention pattern (destroy$)
- `takeUntil`: Automatic subscription cleanup
- `debounceTime`: Search input optimization (300ms delay)
- `distinctUntilChanged`: Prevent duplicate search requests

---

## 3. Component Metadata

### 3.1 Component Decorator Configuration
```typescript
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TicketStatusBadgeComponent
  ],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.css']
})
```

**Important Notes**:
- **Standalone**: True (Angular 21 best practice, no NgModule needed)
- **Imports**: All dependencies declared inline (standalone requirement)
- **Selector**: Follows Angular naming convention (app-ticket-list)

---

## 4. Component Class Structure

### 4.1 Service Injection (Modern inject() Pattern)
```typescript
export class TicketListComponent implements OnInit, OnDestroy {
  // Dependency Injection using inject() function (Angular 18+ best practice)
  private ticketService = inject(TicketService);
  private configService = inject(ConfigurationService);
  private agentService = inject(AgentService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
```

**Why inject() over constructor injection**:
- Cleaner, more concise syntax
- Better TypeScript type inference
- Recommended by Angular team for modern applications
- Enables functional programming patterns

### 4.2 Component State Properties

#### 4.2.1 Data Arrays
```typescript
tickets: Ticket[] = [];
categories: TicketCategory[] = [];
agents: Agent[] = [];
```

**Rationale**:
- `tickets`: Current page of tickets (updated by TicketService subscription)
- `categories`: Dynamic ticket categories from ConfigurationService
- `agents`: Available agents for filter dropdown

#### 4.2.2 Loading and Error State
```typescript
loading = false;
error: string | null = null;
```

**Rationale**:
- `loading`: Show spinner during API calls
- `error`: Display error messages to user

#### 4.2.3 Filter Configuration
```typescript
filters: TicketFilters = {
  status: [],      // Multi-select: ['new', 'open', 'in_progress']
  category: [],    // Multi-select: category IDs
  priority: [],    // Multi-select: ['low', 'medium', 'high', 'urgent']
  assignedAgent: undefined,  // Single-select: agent ID
  search: '',      // Full-text search (ticketId, subject, description)
  escalated: undefined       // Boolean filter for escalated tickets
};
```

**Important Notes**:
- **Multi-select arrays**: Backend expects comma-separated values (e.g., `status=new,open`)
- **Search field**: Searches across ticketId, subject, and description
- **Filter persistence**: Consider localStorage for user preferences (future enhancement)

#### 4.2.4 Pagination Configuration
```typescript
pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0
};
```

**Rationale**:
- Matches backend `PaginatedTickets` response structure
- Default 20 items per page (same as CustomerList pattern)

#### 4.2.5 Sorting Configuration
```typescript
sortBy: 'createdAt' | 'updatedAt' | 'priority' | 'status' = 'createdAt';
sortOrder: 'asc' | 'desc' = 'desc';
```

**Rationale**:
- Default sort: newest tickets first (createdAt DESC)
- Clickable table headers toggle sort direction

#### 4.2.6 UI State Flags
```typescript
showFilters = false;           // Collapsible filter panel
showCategoryFilter = false;    // Dropdown for category multi-select
showStatusFilter = false;      // Dropdown for status multi-select
showPriorityFilter = false;    // Dropdown for priority multi-select
```

**Rationale**:
- Responsive design: Collapse filters on mobile
- Multi-select dropdowns use custom checkboxes (better UX than native <select multiple>)

#### 4.2.7 Available Filter Options (Constants)
```typescript
readonly statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_customer', label: 'Pending Customer' },
  { value: 'waiting_internal', label: 'Waiting Internal' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

readonly priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];
```

**Rationale**:
- Readonly ensures immutability
- Structured as objects for easy template iteration with labels

#### 4.2.8 Memory Leak Prevention
```typescript
private destroy$ = new Subject<void>();
```

**Critical Pattern**:
- Used with `takeUntil(this.destroy$)` on all subscriptions
- Prevents memory leaks from unfinished subscriptions
- Called in `ngOnDestroy()`

### 4.3 Lifecycle Hooks

#### 4.3.1 ngOnInit Implementation
```typescript
ngOnInit(): void {
  // 1. Load tickets with initial filters
  this.loadTickets();

  // 2. Load filter options (categories from config, agents from service)
  this.loadFilterOptions();

  // 3. Subscribe to real-time ticket updates from TicketService
  this.subscribeToTicketUpdates();

  // 4. Setup search debouncing
  this.setupSearchDebounce();
}
```

**Execution Order Rationale**:
1. **Load tickets first**: Immediate user feedback
2. **Load filter options**: Async, non-blocking
3. **Real-time subscriptions**: After initial data load
4. **Debounce setup**: Configure event listeners

#### 4.3.2 ngOnDestroy Implementation
```typescript
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

**Critical for**:
- Unsubscribing from TicketService observables
- Cleaning up debounced search subscriptions
- Preventing memory leaks in Single Page Applications

---

## 5. Core Methods Implementation

### 5.1 Data Loading Methods

#### 5.1.1 loadTickets()
```typescript
loadTickets(forceRefresh = false): void {
  this.loading = true;
  this.error = null;

  this.ticketService.getTickets(
    this.filters,
    this.pagination.page,
    this.pagination.limit,
    forceRefresh
  )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response: PaginatedTickets) => {
        this.tickets = response.tickets;
        this.pagination.total = response.total;
        this.pagination.totalPages = response.totalPages;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading tickets:', err);
        this.error = 'Failed to load tickets. Please try again.';
        this.loading = false;
        this.toastService.error('Failed to load tickets');
        this.cdr.detectChanges();
      }
    });
}
```

**Key Features**:
- **forceRefresh**: Bypass TicketService cache (default: false)
- **Loading state**: User feedback with spinner
- **Error handling**: Console log + user-friendly message + toast
- **ChangeDetectorRef**: Manual change detection for async updates
- **Memory safety**: takeUntil pattern for subscription cleanup

#### 5.1.2 loadFilterOptions()
```typescript
loadFilterOptions(): void {
  // Load dynamic categories from ConfigurationService
  this.configService.categories$
    .pipe(takeUntil(this.destroy$))
    .subscribe(categories => {
      this.categories = categories;
      this.cdr.detectChanges();
    });

  // Load available agents for assignment filter
  this.agentService.getAllAgents({ isActive: true })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        this.agents = response.agents;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading agents:', err);
        // Non-critical error, don't block UI
      }
    });
}
```

**Design Decisions**:
- **Categories**: Subscribe to observable (updates when config changes)
- **Agents**: Filtered to active only (inactive agents can't be assigned)
- **Error handling**: Agents error is non-critical (filter still works without it)

#### 5.1.3 subscribeToTicketUpdates()
```typescript
subscribeToTicketUpdates(): void {
  // Subscribe to ticket list updates from Socket.io events
  this.ticketService.tickets$
    .pipe(takeUntil(this.destroy$))
    .subscribe(tickets => {
      // Update local tickets array when TicketService broadcasts changes
      this.tickets = tickets.slice(
        (this.pagination.page - 1) * this.pagination.limit,
        this.pagination.page * this.pagination.limit
      );
      this.cdr.detectChanges();
    });
}
```

**Real-time Update Strategy**:
- TicketService maintains master ticket list
- Socket.io events update service state
- Component reacts to service state changes
- Manual pagination slicing (service has full dataset)

**Alternative Approach** (if performance issues):
```typescript
// Option: Reload current page after Socket.io update
this.ticketService.tickets$
  .pipe(
    takeUntil(this.destroy$),
    debounceTime(500) // Prevent rapid reloads
  )
  .subscribe(() => {
    this.loadTickets(true); // Force refresh from backend
  });
```

### 5.2 Filter and Search Methods

#### 5.2.1 onFilterChange()
```typescript
onFilterChange(): void {
  // Reset to page 1 when filters change
  this.pagination.page = 1;
  this.loadTickets(true);
}
```

**Rationale**:
- Page 1 reset prevents "empty page" confusion
- Force refresh ensures backend filters are applied correctly

#### 5.2.2 setupSearchDebounce()
```typescript
private searchSubject = new Subject<string>();

setupSearchDebounce(): void {
  this.searchSubject
    .pipe(
      debounceTime(300),           // Wait 300ms after user stops typing
      distinctUntilChanged(),      // Only trigger if value changed
      takeUntil(this.destroy$)
    )
    .subscribe(searchTerm => {
      this.filters.search = searchTerm;
      this.onFilterChange();
    });
}

onSearchInput(value: string): void {
  this.searchSubject.next(value);
}
```

**Performance Optimization**:
- 300ms debounce reduces API calls (typing "installation" = 1 call, not 12)
- `distinctUntilChanged` prevents duplicate requests
- Subject pattern separates user input from API calls

**Template Usage**:
```html
<input type="text"
       [ngModel]="filters.search"
       (ngModelChange)="onSearchInput($event)"
       placeholder="Search tickets...">
```

#### 5.2.3 clearFilters()
```typescript
clearFilters(): void {
  this.filters = {
    status: [],
    category: [],
    priority: [],
    assignedAgent: undefined,
    search: '',
    escalated: undefined
  };
  this.pagination.page = 1;
  this.loadTickets(true);
}
```

**UX Consideration**:
- Single button clears all filters
- Reset to page 1 for predictable behavior

#### 5.2.4 Multi-Select Filter Helpers
```typescript
toggleStatusFilter(status: string): void {
  const index = this.filters.status?.indexOf(status) ?? -1;
  if (index === -1) {
    this.filters.status = [...(this.filters.status || []), status];
  } else {
    this.filters.status = this.filters.status?.filter(s => s !== status) || [];
  }
  this.onFilterChange();
}

isStatusSelected(status: string): boolean {
  return this.filters.status?.includes(status) || false;
}

// Similar methods for category and priority filters
toggleCategoryFilter(categoryId: string): void { /* ... */ }
isCategorySelected(categoryId: string): boolean { /* ... */ }
togglePriorityFilter(priority: string): void { /* ... */ }
isPrioritySelected(priority: string): boolean { /* ... */ }
```

**Pattern Benefits**:
- Immutable array updates (spread operator)
- Two-way binding without ngModel complexity
- Template can check checkbox state easily

### 5.3 Sorting Methods

#### 5.3.1 onSort()
```typescript
onSort(field: 'createdAt' | 'updatedAt' | 'priority' | 'status'): void {
  if (this.sortBy === field) {
    // Toggle sort order if same field
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    // New field, default to descending
    this.sortBy = field;
    this.sortOrder = 'desc';
  }
  this.loadTickets(true);
}

getSortIcon(field: string): string {
  if (this.sortBy !== field) return 'fa-sort';
  return this.sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
}
```

**Template Usage**:
```html
<th (click)="onSort('createdAt')" class="cursor-pointer hover:text-whatsapp-green">
  <div class="flex items-center gap-2">
    <span>Created Date</span>
    <i class="fas {{ getSortIcon('createdAt') }} text-xs"></i>
  </div>
</th>
```

**Note**: Backend API must support sorting via query parameters:
```
GET /api/v2/tickets?sortBy=createdAt&sortOrder=desc
```

### 5.4 Pagination Methods

#### 5.4.1 onPageChange()
```typescript
onPageChange(page: number): void {
  if (page < 1 || page > this.pagination.totalPages) return;
  this.pagination.page = page;
  this.loadTickets();
}
```

**Validation**:
- Prevent invalid page numbers
- No force refresh (paginating existing dataset)

#### 5.4.2 Pagination Helper Getters
```typescript
get pageNumbers(): number[] {
  const pages: number[] = [];
  const maxVisible = 5;
  let startPage = Math.max(1, this.pagination.page - Math.floor(maxVisible / 2));
  let endPage = Math.min(this.pagination.totalPages, startPage + maxVisible - 1);

  // Adjust start if near end
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }
  return pages;
}

get showingFrom(): number {
  return (this.pagination.page - 1) * this.pagination.limit + 1;
}

get showingTo(): number {
  return Math.min(this.pagination.page * this.pagination.limit, this.pagination.total);
}
```

**UI Display Example**:
```
Showing 21 to 40 of 156 tickets
[<] [1] [2] [3] [4] [5] [>]
```

### 5.5 Navigation Methods

#### 5.5.1 viewTicket()
```typescript
viewTicket(ticket: Ticket): void {
  this.router.navigate(['/tickets', ticket._id]);
}
```

**Routing Configuration Required**:
```typescript
// app.routes.ts
{
  path: 'tickets/:id',
  component: TicketDetailComponent
}
```

#### 5.5.2 createTicket()
```typescript
createTicket(): void {
  this.router.navigate(['/tickets/new']);
}
```

**Alternative Modal Approach** (future enhancement):
```typescript
createTicket(): void {
  this.showTicketFormModal = true;
}

onTicketCreated(ticket: Ticket): void {
  this.showTicketFormModal = false;
  this.loadTickets(true);
  this.toastService.success(`Ticket ${ticket.ticketId} created successfully`);
}
```

### 5.6 Helper Methods

#### 5.6.1 getCategoryLabel()
```typescript
getCategoryLabel(categoryId: string): string {
  const category = this.categories.find(c => c.id === categoryId);
  return category?.label || categoryId;
}

getCategoryColor(categoryId: string): string {
  const category = this.categories.find(c => c.id === categoryId);
  return category?.color || '#6B7280';
}
```

**Usage in Template**:
```html
<span [style.color]="getCategoryColor(ticket.category)">
  {{ getCategoryLabel(ticket.category) }}
</span>
```

#### 5.6.2 formatDate()
```typescript
formatDate(date: Date | string | undefined): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return d.toLocaleDateString();
}
```

**Relative Time Display**:
- "Just now" (< 1 hour)
- "3h ago" (< 24 hours)
- "5d ago" (< 7 days)
- "12/15/2024" (older)

#### 5.6.3 getCustomerName()
```typescript
getCustomerName(ticket: Ticket): string {
  const { customerId } = ticket;
  if (!customerId) return 'Unknown';

  const firstName = customerId.firstName || '';
  const lastName = customerId.lastName || '';

  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  return customerId.phoneNumber || 'Unknown';
}
```

**Fallback Strategy**:
1. Full name (first + last)
2. First name only
3. Phone number
4. "Unknown"

#### 5.6.4 getPriorityIcon()
```typescript
getPriorityIcon(priority: string): string {
  const iconMap: { [key: string]: string } = {
    'low': 'fa-arrow-down',
    'medium': 'fa-minus',
    'high': 'fa-arrow-up',
    'urgent': 'fa-exclamation-circle'
  };
  return iconMap[priority] || 'fa-minus';
}
```

**Visual Indicators**:
- Low: ↓ (arrow-down)
- Medium: — (minus)
- High: ↑ (arrow-up)
- Urgent: ⚠ (exclamation-circle) with red color

---

## 6. Template Structure (HTML)

### 6.1 Overall Layout Pattern
```html
<div class="flex flex-col bg-whatsapp-dark text-gray-100 h-full min-h-0 w-full max-w-full overflow-hidden">
  <!-- 1. Header with Stats -->
  <div class="bg-whatsapp-gray border-b border-gray-700 px-6 py-4 flex-none">
    <!-- Title, subtitle, create button -->
    <!-- Statistics cards (total, by status) -->
  </div>

  <!-- 2. Filters and Search -->
  <div class="bg-whatsapp-gray border-b border-gray-700 px-6 py-3 flex-none">
    <!-- Search input -->
    <!-- Filter toggles and dropdowns -->
    <!-- Advanced filters (collapsible) -->
  </div>

  <!-- 3. Table/Content Area -->
  <div class="flex-1 min-h-0 overflow-y-auto px-6 py-4">
    <!-- Loading state -->
    <!-- Error state -->
    <!-- Empty state -->
    <!-- Tickets table -->
  </div>

  <!-- 4. Pagination (fixed bottom) -->
  <div class="bg-whatsapp-gray border-t border-gray-700 px-6 py-3 flex-none">
    <!-- Pagination controls -->
  </div>
</div>
```

**Layout Strategy**:
- **Flexbox column**: Full height layout
- **flex-none**: Header, filters, pagination don't shrink
- **flex-1**: Content area takes remaining space
- **overflow-y-auto**: Content area scrolls, header/footer fixed

### 6.2 Header Section

#### 6.2.1 Title and Create Button
```html
<div class="flex items-center justify-between mb-4">
  <div>
    <h1 class="text-2xl font-semibold text-gray-100">Tickets</h1>
    <p class="text-sm text-gray-400 mt-1">Manage and track support tickets</p>
  </div>
  <button (click)="createTicket()"
          class="bg-whatsapp-green hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
    <i class="fas fa-plus"></i>
    <span>New Ticket</span>
  </button>
</div>
```

**Styling Notes**:
- `bg-whatsapp-green`: Custom Tailwind color (defined in tailwind.config.js)
- `hover:bg-green-600`: Darker shade on hover
- `transition-colors`: Smooth color change animation

#### 6.2.2 Statistics Cards
```html
<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
  <div class="bg-whatsapp-dark p-3 rounded-lg border border-gray-700">
    <div class="text-gray-400 text-xs uppercase tracking-wide mb-1">Total</div>
    <div class="text-2xl font-bold text-gray-100">{{ pagination.total }}</div>
  </div>

  <div class="bg-whatsapp-dark p-3 rounded-lg border border-gray-700">
    <div class="text-gray-400 text-xs uppercase tracking-wide mb-1">New</div>
    <div class="text-2xl font-bold text-blue-400">
      {{ getStatusCount('new') }}
    </div>
  </div>

  <div class="bg-whatsapp-dark p-3 rounded-lg border border-gray-700">
    <div class="text-gray-400 text-xs uppercase tracking-wide mb-1">In Progress</div>
    <div class="text-2xl font-bold text-yellow-400">
      {{ getStatusCount('in_progress') }}
    </div>
  </div>

  <div class="bg-whatsapp-dark p-3 rounded-lg border border-gray-700">
    <div class="text-gray-400 text-xs uppercase tracking-wide mb-1">Resolved</div>
    <div class="text-2xl font-bold text-green-400">
      {{ getStatusCount('resolved') }}
    </div>
  </div>

  <div class="bg-whatsapp-dark p-3 rounded-lg border border-gray-700">
    <div class="text-gray-400 text-xs uppercase tracking-wide mb-1">Escalated</div>
    <div class="text-2xl font-bold text-red-400">
      {{ getEscalatedCount() }}
    </div>
  </div>
</div>
```

**Required Component Methods**:
```typescript
getStatusCount(status: string): number {
  return this.tickets.filter(t => t.status === status).length;
}

getEscalatedCount(): number {
  return this.tickets.filter(t => t.escalated).length;
}
```

**Note**: Consider fetching statistics from backend API endpoint:
```typescript
// Better approach for large datasets
this.ticketService.getStatistics().subscribe(stats => {
  this.stats = stats;
});
```

### 6.3 Filters Section

#### 6.3.1 Search Bar
```html
<div class="flex gap-3">
  <div class="flex-1 relative">
    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
    <input type="text"
           [ngModel]="filters.search"
           (ngModelChange)="onSearchInput($event)"
           placeholder="Search by ticket ID, subject, or description..."
           class="w-full bg-whatsapp-dark text-gray-100 pl-10 pr-4 py-2 rounded-lg border border-gray-600 focus:border-whatsapp-green focus:outline-none">
  </div>

  <button (click)="toggleFilters()"
          class="bg-whatsapp-dark text-gray-100 px-4 py-2 rounded-lg border border-gray-600 hover:border-whatsapp-green transition-colors flex items-center gap-2">
    <i class="fas fa-filter"></i>
    <span>Filters</span>
    <i class="fas fa-chevron-down text-xs" [class.rotate-180]="showFilters"></i>
  </button>
</div>
```

**CSS for Chevron Rotation** (ticket-list.component.css):
```css
.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.3s ease;
}
```

#### 6.3.2 Advanced Filters (Collapsible)
```html
<div *ngIf="showFilters" class="mt-3 pt-3 border-t border-gray-700 grid grid-cols-1 md:grid-cols-4 gap-3">
  <!-- Status Filter (Multi-Select) -->
  <div>
    <label class="block text-xs text-gray-400 mb-1">Status</label>
    <div class="relative">
      <button (click)="showStatusFilter = !showStatusFilter"
              class="w-full bg-whatsapp-dark text-gray-100 px-3 py-2 rounded-lg border border-gray-600 focus:border-whatsapp-green text-left flex items-center justify-between">
        <span *ngIf="filters.status.length === 0">All Statuses</span>
        <span *ngIf="filters.status.length > 0">{{ filters.status.length }} selected</span>
        <i class="fas fa-chevron-down text-xs"></i>
      </button>

      <!-- Dropdown -->
      <div *ngIf="showStatusFilter"
           class="absolute top-full left-0 mt-1 w-full bg-whatsapp-dark border border-gray-600 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
        <div *ngFor="let option of statusOptions"
             (click)="toggleStatusFilter(option.value)"
             class="px-3 py-2 hover:bg-whatsapp-gray cursor-pointer flex items-center gap-2">
          <input type="checkbox"
                 [checked]="isStatusSelected(option.value)"
                 class="rounded border-gray-600 text-whatsapp-green">
          <span>{{ option.label }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Category Filter (Multi-Select) -->
  <div>
    <label class="block text-xs text-gray-400 mb-1">Category</label>
    <div class="relative">
      <button (click)="showCategoryFilter = !showCategoryFilter"
              class="w-full bg-whatsapp-dark text-gray-100 px-3 py-2 rounded-lg border border-gray-600 focus:border-whatsapp-green text-left flex items-center justify-between">
        <span *ngIf="filters.category.length === 0">All Categories</span>
        <span *ngIf="filters.category.length > 0">{{ filters.category.length }} selected</span>
        <i class="fas fa-chevron-down text-xs"></i>
      </button>

      <div *ngIf="showCategoryFilter"
           class="absolute top-full left-0 mt-1 w-full bg-whatsapp-dark border border-gray-600 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
        <div *ngFor="let category of categories"
             (click)="toggleCategoryFilter(category.id)"
             class="px-3 py-2 hover:bg-whatsapp-gray cursor-pointer flex items-center gap-2">
          <input type="checkbox"
                 [checked]="isCategorySelected(category.id)"
                 class="rounded border-gray-600 text-whatsapp-green">
          <i class="fas {{ category.icon }}" [style.color]="category.color"></i>
          <span>{{ category.label }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Priority Filter (Multi-Select) -->
  <div>
    <label class="block text-xs text-gray-400 mb-1">Priority</label>
    <div class="relative">
      <button (click)="showPriorityFilter = !showPriorityFilter"
              class="w-full bg-whatsapp-dark text-gray-100 px-3 py-2 rounded-lg border border-gray-600 focus:border-whatsapp-green text-left flex items-center justify-between">
        <span *ngIf="filters.priority.length === 0">All Priorities</span>
        <span *ngIf="filters.priority.length > 0">{{ filters.priority.length }} selected</span>
        <i class="fas fa-chevron-down text-xs"></i>
      </button>

      <div *ngIf="showPriorityFilter"
           class="absolute top-full left-0 mt-1 w-full bg-whatsapp-dark border border-gray-600 rounded-lg shadow-xl z-10">
        <div *ngFor="let option of priorityOptions"
             (click)="togglePriorityFilter(option.value)"
             class="px-3 py-2 hover:bg-whatsapp-gray cursor-pointer flex items-center gap-2">
          <input type="checkbox"
                 [checked]="isPrioritySelected(option.value)"
                 class="rounded border-gray-600 text-whatsapp-green">
          <span>{{ option.label }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Assigned Agent Filter (Single-Select) -->
  <div>
    <label class="block text-xs text-gray-400 mb-1">Assigned Agent</label>
    <select [(ngModel)]="filters.assignedAgent"
            (change)="onFilterChange()"
            class="w-full bg-whatsapp-dark text-gray-100 px-3 py-2 rounded-lg border border-gray-600 focus:border-whatsapp-green focus:outline-none">
      <option [value]="undefined">All Agents</option>
      <option *ngFor="let agent of agents" [value]="agent._id">
        {{ agent.firstName }} {{ agent.lastName }}
      </option>
    </select>
  </div>

  <!-- Clear Filters Button -->
  <div class="col-span-full flex justify-end">
    <button (click)="clearFilters()"
            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors">
      Clear Filters
    </button>
  </div>
</div>
```

**Important UX Patterns**:
- **Multi-select display**: "3 selected" instead of listing all values
- **Dropdown z-index**: Ensure dropdowns appear above table
- **Click outside to close**: Add `@HostListener` for dropdown close behavior

**Dropdown Close Handler** (TypeScript):
```typescript
@HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent): void {
  // Close all dropdowns when clicking outside
  const target = event.target as HTMLElement;
  if (!target.closest('.relative')) {
    this.showStatusFilter = false;
    this.showCategoryFilter = false;
    this.showPriorityFilter = false;
  }
}
```

### 6.4 Content Area States

#### 6.4.1 Loading State
```html
<div *ngIf="loading" class="flex items-center justify-center h-full">
  <div class="text-center">
    <i class="fas fa-spinner fa-spin text-4xl text-whatsapp-green mb-4"></i>
    <p class="text-gray-400">Loading tickets...</p>
  </div>
</div>
```

#### 6.4.2 Error State
```html
<div *ngIf="error && !loading" class="bg-red-900/20 border border-red-600 text-red-400 px-4 py-3 rounded-lg">
  <i class="fas fa-exclamation-circle mr-2"></i>
  {{ error }}
</div>
```

#### 6.4.3 Empty State
```html
<div *ngIf="!loading && !error && tickets.length === 0" class="flex items-center justify-center h-full">
  <div class="text-center">
    <i class="fas fa-ticket-alt text-6xl text-gray-600 mb-4"></i>
    <h3 class="text-xl font-semibold text-gray-300 mb-2">No tickets found</h3>
    <p class="text-gray-400 mb-4">Create your first ticket or adjust your filters</p>
    <button (click)="createTicket()"
            class="bg-whatsapp-green hover:bg-green-600 text-white px-6 py-2 rounded-lg inline-flex items-center gap-2">
      <i class="fas fa-plus"></i>
      <span>Create Ticket</span>
    </button>
  </div>
</div>
```

**Note**: Differentiate between "no tickets exist" vs "no results with current filters"
```typescript
get hasFiltersApplied(): boolean {
  return this.filters.status.length > 0 ||
         this.filters.category.length > 0 ||
         this.filters.priority.length > 0 ||
         this.filters.assignedAgent !== undefined ||
         this.filters.search !== '' ||
         this.filters.escalated !== undefined;
}
```

```html
<p *ngIf="hasFiltersApplied" class="text-gray-400 mb-4">
  No tickets match your current filters. Try clearing filters.
</p>
<p *ngIf="!hasFiltersApplied" class="text-gray-400 mb-4">
  Create your first ticket to get started.
</p>
```

### 6.5 Tickets Table

#### 6.5.1 Table Structure
```html
<div *ngIf="!loading && !error && tickets.length > 0"
     class="bg-whatsapp-gray rounded-lg border border-gray-700 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full min-w-[1000px]">
      <thead class="bg-whatsapp-dark border-b border-gray-700">
        <tr>
          <!-- Ticket ID (Sortable) -->
          <th class="px-4 py-3 text-left cursor-pointer hover:text-whatsapp-green min-w-[140px]"
              (click)="onSort('ticketId')">
            <div class="flex items-center gap-2">
              <span>Ticket ID</span>
              <i class="fas {{ getSortIcon('ticketId') }} text-xs"></i>
            </div>
          </th>

          <!-- Subject -->
          <th class="px-4 py-3 text-left min-w-[200px]">Subject</th>

          <!-- Customer -->
          <th class="px-4 py-3 text-left min-w-[180px]">Customer</th>

          <!-- Category -->
          <th class="px-4 py-3 text-left min-w-[150px]">Category</th>

          <!-- Priority (Sortable) -->
          <th class="px-4 py-3 text-left cursor-pointer hover:text-whatsapp-green min-w-[100px]"
              (click)="onSort('priority')">
            <div class="flex items-center gap-2">
              <span>Priority</span>
              <i class="fas {{ getSortIcon('priority') }} text-xs"></i>
            </div>
          </th>

          <!-- Status (Sortable) -->
          <th class="px-4 py-3 text-left cursor-pointer hover:text-whatsapp-green min-w-[140px]"
              (click)="onSort('status')">
            <div class="flex items-center gap-2">
              <span>Status</span>
              <i class="fas {{ getSortIcon('status') }} text-xs"></i>
            </div>
          </th>

          <!-- Assigned Agent -->
          <th class="px-4 py-3 text-left min-w-[150px]">Assigned To</th>

          <!-- Created At (Sortable) -->
          <th class="px-4 py-3 text-left cursor-pointer hover:text-whatsapp-green min-w-[120px]"
              (click)="onSort('createdAt')">
            <div class="flex items-center gap-2">
              <span>Created</span>
              <i class="fas {{ getSortIcon('createdAt') }} text-xs"></i>
            </div>
          </th>

          <!-- Actions -->
          <th class="px-4 py-3 text-center min-w-[80px]">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr *ngFor="let ticket of tickets"
            class="border-b border-gray-700 hover:bg-whatsapp-dark transition-colors cursor-pointer"
            (click)="viewTicket(ticket)">

          <!-- Ticket ID -->
          <td class="px-4 py-3">
            <div class="font-mono text-sm text-whatsapp-green">
              {{ ticket.ticketId }}
            </div>
            <div *ngIf="ticket.escalated" class="inline-flex items-center gap-1 mt-1">
              <i class="fas fa-exclamation-triangle text-red-400 text-xs"></i>
              <span class="text-xs text-red-400">Escalated</span>
            </div>
          </td>

          <!-- Subject -->
          <td class="px-4 py-3">
            <div class="font-medium text-gray-100 truncate max-w-[200px]" [title]="ticket.subject">
              {{ ticket.subject }}
            </div>
            <div class="text-xs text-gray-400 truncate max-w-[200px]" [title]="ticket.description">
              {{ ticket.description }}
            </div>
          </td>

          <!-- Customer -->
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs">
                {{ getCustomerName(ticket)[0] }}
              </div>
              <div>
                <div class="text-sm text-gray-100">{{ getCustomerName(ticket) }}</div>
                <div class="text-xs text-gray-400">{{ ticket.customerId.phoneNumber }}</div>
              </div>
            </div>
          </td>

          <!-- Category -->
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <i class="fas {{ getCategoryIcon(ticket.category) }}"
                 [style.color]="getCategoryColor(ticket.category)"></i>
              <span class="text-sm text-gray-300">{{ getCategoryLabel(ticket.category) }}</span>
            </div>
          </td>

          <!-- Priority -->
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <i class="fas {{ getPriorityIcon(ticket.priority) }}"
                 [ngClass]="{
                   'text-gray-500': ticket.priority === 'low',
                   'text-blue-500': ticket.priority === 'medium',
                   'text-orange-500': ticket.priority === 'high',
                   'text-red-500': ticket.priority === 'urgent'
                 }"></i>
              <span class="text-sm capitalize">{{ ticket.priority }}</span>
            </div>
          </td>

          <!-- Status -->
          <td class="px-4 py-3">
            <app-ticket-status-badge [status]="ticket.status" [showDot]="true"></app-ticket-status-badge>
          </td>

          <!-- Assigned Agent -->
          <td class="px-4 py-3">
            <div *ngIf="ticket.assignedAgent" class="text-sm text-gray-300">
              {{ ticket.assignedAgent.firstName }} {{ ticket.assignedAgent.lastName }}
            </div>
            <div *ngIf="!ticket.assignedAgent" class="text-sm text-gray-500 italic">
              Unassigned
            </div>
          </td>

          <!-- Created At -->
          <td class="px-4 py-3 text-sm text-gray-400">
            {{ formatDate(ticket.createdAt) }}
          </td>

          <!-- Actions -->
          <td class="px-4 py-3 text-center" (click)="$event.stopPropagation()">
            <button (click)="viewTicket(ticket)"
                    class="text-gray-400 hover:text-whatsapp-green transition-colors px-2"
                    title="View Details">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**Key Features**:
- **min-w-[XXXpx]**: Prevents column squashing on narrow screens
- **overflow-x-auto**: Horizontal scroll on small viewports
- **truncate + title**: Show full text on hover for long content
- **$event.stopPropagation()**: Prevent row click when clicking action button
- **cursor-pointer**: Visual feedback for clickable rows

**Required Helper Methods**:
```typescript
getCategoryIcon(categoryId: string): string {
  const category = this.categories.find(c => c.id === categoryId);
  return category?.icon || 'fa-tag';
}
```

### 6.6 Pagination Section

```html
<div *ngIf="!loading && tickets.length > 0"
     class="flex items-center justify-between">
  <!-- Showing text -->
  <div class="text-sm text-gray-400">
    Showing {{ showingFrom }} to {{ showingTo }} of {{ pagination.total }} tickets
  </div>

  <!-- Page buttons -->
  <div class="flex gap-2">
    <!-- Previous -->
    <button (click)="onPageChange(pagination.page - 1)"
            [disabled]="pagination.page === 1"
            class="px-3 py-1 rounded bg-whatsapp-dark text-gray-100 border border-gray-600 hover:border-whatsapp-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      <i class="fas fa-chevron-left"></i>
    </button>

    <!-- Page numbers -->
    <button *ngFor="let page of pageNumbers"
            (click)="onPageChange(page)"
            [class.bg-whatsapp-green]="page === pagination.page"
            [class.bg-whatsapp-dark]="page !== pagination.page"
            class="px-3 py-1 rounded text-gray-100 border border-gray-600 hover:border-whatsapp-green transition-colors">
      {{ page }}
    </button>

    <!-- Next -->
    <button (click)="onPageChange(pagination.page + 1)"
            [disabled]="pagination.page === pagination.totalPages"
            class="px-3 py-1 rounded bg-whatsapp-dark text-gray-100 border border-gray-600 hover:border-whatsapp-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
      <i class="fas fa-chevron-right"></i>
    </button>
  </div>
</div>
```

---

## 7. Styling (CSS)

### 7.1 Component-Specific Styles (ticket-list.component.css)

```css
/* Host element layout */
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Custom scrollbar for vertical scroll */
:host ::ng-deep .overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

:host ::ng-deep .overflow-y-auto::-webkit-scrollbar-track {
  background: #1f2937; /* whatsapp-gray equivalent */
}

:host ::ng-deep .overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

:host ::ng-deep .overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Custom scrollbar for horizontal scroll (table) */
:host ::ng-deep .overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

:host ::ng-deep .overflow-x-auto::-webkit-scrollbar-track {
  background: #1f2937;
}

:host ::ng-deep .overflow-x-auto::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

:host ::ng-deep .overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Smooth scrolling */
.overflow-x-auto,
.overflow-y-auto {
  -webkit-overflow-scrolling: touch;
}

/* Chevron rotation animation */
.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.3s ease;
}

/* Table hover effects */
table tbody tr {
  transition: background-color 0.2s ease;
}

/* Checkbox styling */
input[type="checkbox"] {
  cursor: pointer;
}

/* Button hover effects */
button:not(:disabled) {
  transition: all 0.2s ease;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Dropdown z-index management */
.relative {
  position: relative;
}

.z-10 {
  z-index: 10;
}

/* Text truncation with ellipsis */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Ensure dropdown doesn't get cut off */
.overflow-y-auto.max-h-60 {
  max-height: 15rem;
}
```

### 7.2 Tailwind Custom Colors

Ensure these are defined in `frontend/tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        'whatsapp-green': '#25D366',
        'whatsapp-dark': '#0b141a',
        'whatsapp-gray': '#111b21',
      }
    }
  }
}
```

---

## 8. Responsive Design Considerations

### 8.1 Breakpoint Strategy

**Tailwind Responsive Prefixes**:
- `sm:` - 640px and up (mobile landscape)
- `md:` - 768px and up (tablet)
- `lg:` - 1024px and up (desktop)

### 8.2 Mobile Optimizations

#### 8.2.1 Card View Alternative (Future Enhancement)
```html
<!-- Mobile: Card view instead of table -->
<div class="lg:hidden space-y-3">
  <div *ngFor="let ticket of tickets"
       (click)="viewTicket(ticket)"
       class="bg-whatsapp-gray border border-gray-700 rounded-lg p-4 cursor-pointer hover:bg-whatsapp-dark">

    <div class="flex items-start justify-between mb-2">
      <div>
        <div class="font-mono text-sm text-whatsapp-green">{{ ticket.ticketId }}</div>
        <div class="font-medium text-gray-100 mt-1">{{ ticket.subject }}</div>
      </div>
      <app-ticket-status-badge [status]="ticket.status"></app-ticket-status-badge>
    </div>

    <div class="text-sm text-gray-400 mb-3 line-clamp-2">
      {{ ticket.description }}
    </div>

    <div class="flex items-center justify-between text-xs text-gray-500">
      <div class="flex items-center gap-2">
        <i class="fas {{ getPriorityIcon(ticket.priority) }}"
           [ngClass]="{
             'text-gray-500': ticket.priority === 'low',
             'text-blue-500': ticket.priority === 'medium',
             'text-orange-500': ticket.priority === 'high',
             'text-red-500': ticket.priority === 'urgent'
           }"></i>
        <span>{{ getCategoryLabel(ticket.category) }}</span>
      </div>
      <div>{{ formatDate(ticket.createdAt) }}</div>
    </div>
  </div>
</div>

<!-- Desktop: Table view -->
<div class="hidden lg:block">
  <!-- Table from section 6.5 -->
</div>
```

**CSS for line-clamp** (if not in Tailwind config):
```css
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

#### 8.2.2 Collapsible Filters by Default on Mobile
```html
<!-- Show filters button only on mobile -->
<div class="lg:hidden">
  <button (click)="showFilters = !showFilters">
    <i class="fas fa-filter"></i>
    Filters
  </button>
</div>

<!-- Auto-show filters on desktop -->
<div class="hidden lg:grid grid-cols-4 gap-3">
  <!-- Filter inputs -->
</div>

<!-- Collapsible filters on mobile -->
<div *ngIf="showFilters" class="lg:hidden mt-3 space-y-3">
  <!-- Filter inputs -->
</div>
```

---

## 9. Performance Optimization

### 9.1 Change Detection Strategy

**Consider OnPush strategy** (future optimization):
```typescript
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  // ... other config
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

**Requirements for OnPush**:
- Use immutable data patterns (already using spread operator)
- Manually call `cdr.detectChanges()` after async updates (already implemented)
- All @Input properties must be immutable

### 9.2 Virtual Scrolling (for very large datasets)

**Future Enhancement** - Replace table with CDK Virtual Scroll:

```typescript
import { ScrollingModule } from '@angular/cdk/scrolling';

// In component imports
imports: [CommonModule, FormsModule, ScrollingModule, TicketStatusBadgeComponent]
```

```html
<cdk-virtual-scroll-viewport itemSize="60" class="h-full">
  <div *cdkVirtualFor="let ticket of tickets"
       class="h-[60px] border-b border-gray-700 hover:bg-whatsapp-dark px-4 py-3 cursor-pointer"
       (click)="viewTicket(ticket)">
    <!-- Ticket row content -->
  </div>
</cdk-virtual-scroll-viewport>
```

**Benefits**:
- Renders only visible rows (~20 DOM elements instead of 1000+)
- Smooth scrolling for 10,000+ tickets
- Reduced memory footprint

### 9.3 Lazy Loading

Ensure TicketList is part of a lazy-loaded module:

```typescript
// app.routes.ts
{
  path: 'tickets',
  loadComponent: () => import('./components/tickets/ticket-list/ticket-list.component')
    .then(m => m.TicketListComponent)
}
```

---

## 10. Error Handling

### 10.1 HTTP Error Scenarios

#### 10.1.1 Network Errors
```typescript
loadTickets(): void {
  this.ticketService.getTickets(...)
    .pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        if (error.status === 0) {
          // Network error or CORS issue
          this.error = 'Unable to connect to server. Check your internet connection.';
        } else if (error.status === 401) {
          // Unauthorized
          this.router.navigate(['/login']);
          this.toastService.error('Session expired. Please log in again.');
        } else if (error.status === 403) {
          // Forbidden
          this.error = 'You do not have permission to view tickets.';
        } else if (error.status === 500) {
          // Server error
          this.error = 'Server error. Please try again later.';
        } else {
          // Generic error
          this.error = error.message || 'An unexpected error occurred.';
        }
        this.loading = false;
        return of({ tickets: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      })
    )
    .subscribe(...);
}
```

### 10.2 Retry Mechanism

**For critical API calls**:
```typescript
import { retry, retryWhen, delay, take } from 'rxjs/operators';

this.ticketService.getTickets(...)
  .pipe(
    retry(2), // Retry up to 2 times
    // OR
    retryWhen(errors =>
      errors.pipe(
        delay(1000), // Wait 1 second before retry
        take(3)      // Max 3 retries
      )
    )
  )
```

---

## 11. Testing Strategy

### 11.1 Unit Tests (ticket-list.component.spec.ts)

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TicketListComponent } from './ticket-list.component';
import { TicketService } from '../../../services/ticket';
import { ConfigurationService } from '../../../services/configuration';
import { AgentService } from '../../../services/agent';
import { ToastService } from '../../../services/toast';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

describe('TicketListComponent', () => {
  let component: TicketListComponent;
  let fixture: ComponentFixture<TicketListComponent>;
  let mockTicketService: jasmine.SpyObj<TicketService>;
  let mockConfigService: jasmine.SpyObj<ConfigurationService>;
  let mockAgentService: jasmine.SpyObj<AgentService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    // Create mock services
    mockTicketService = jasmine.createSpyObj('TicketService', [
      'getTickets', 'tickets$', 'loading$', 'statistics$'
    ]);
    mockConfigService = jasmine.createSpyObj('ConfigurationService', [], {
      categories$: of([
        { id: 'test', label: 'Test Category', icon: 'fa-tag', color: '#000', description: 'Test' }
      ])
    });
    mockAgentService = jasmine.createSpyObj('AgentService', ['getAllAgents']);
    mockToastService = jasmine.createSpyObj('ToastService', ['error', 'success', 'info']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [TicketListComponent],
      providers: [
        { provide: TicketService, useValue: mockTicketService },
        { provide: ConfigurationService, useValue: mockConfigService },
        { provide: AgentService, useValue: mockAgentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TicketListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load tickets on init', () => {
    const mockResponse = {
      tickets: [
        { _id: '1', ticketId: 'TICKET-001', subject: 'Test', status: 'new' }
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1
    };

    mockTicketService.getTickets.and.returnValue(of(mockResponse));
    mockAgentService.getAllAgents.and.returnValue(of({ agents: [] }));

    component.ngOnInit();

    expect(mockTicketService.getTickets).toHaveBeenCalled();
    expect(component.tickets.length).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('should handle filter changes', () => {
    spyOn(component, 'loadTickets');

    component.filters.status = ['new'];
    component.onFilterChange();

    expect(component.pagination.page).toBe(1);
    expect(component.loadTickets).toHaveBeenCalledWith(true);
  });

  it('should toggle sort order when clicking same field', () => {
    component.sortBy = 'createdAt';
    component.sortOrder = 'desc';

    component.onSort('createdAt');

    expect(component.sortOrder).toBe('asc');
  });

  it('should navigate to ticket detail on viewTicket', () => {
    const ticket = { _id: 'test-123' } as any;

    component.viewTicket(ticket);

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/tickets', 'test-123']);
  });

  it('should handle error when loading tickets fails', () => {
    mockTicketService.getTickets.and.returnValue(
      throwError(() => new Error('Network error'))
    );

    component.loadTickets();

    expect(component.error).toBeTruthy();
    expect(component.loading).toBe(false);
    expect(mockToastService.error).toHaveBeenCalled();
  });

  it('should debounce search input', (done) => {
    spyOn(component, 'loadTickets');

    component.onSearchInput('test');
    component.onSearchInput('test query');

    setTimeout(() => {
      expect(component.loadTickets).toHaveBeenCalledTimes(1);
      done();
    }, 400);
  });

  it('should clear all filters', () => {
    component.filters = {
      status: ['new'],
      category: ['test'],
      priority: ['high'],
      assignedAgent: 'agent-123',
      search: 'search term',
      escalated: true
    };

    component.clearFilters();

    expect(component.filters.status.length).toBe(0);
    expect(component.filters.search).toBe('');
    expect(component.pagination.page).toBe(1);
  });
});
```

### 11.2 Integration Tests

**Test real-time updates**:
```typescript
it('should update tickets when Socket.io event fires', (done) => {
  const initialTickets = [/* ... */];
  const updatedTicket = { /* ... */ };

  // Mock TicketService observable
  const ticketsSubject = new BehaviorSubject(initialTickets);
  mockTicketService.tickets$ = ticketsSubject.asObservable();

  component.ngOnInit();

  // Simulate Socket.io update
  ticketsSubject.next([updatedTicket, ...initialTickets]);

  setTimeout(() => {
    expect(component.tickets[0]).toEqual(updatedTicket);
    done();
  }, 100);
});
```

### 11.3 E2E Tests (Cypress)

```typescript
// cypress/e2e/tickets/ticket-list.cy.ts
describe('Ticket List', () => {
  beforeEach(() => {
    cy.login(); // Custom command to authenticate
    cy.visit('/tickets');
  });

  it('should display tickets in table', () => {
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
  });

  it('should filter tickets by status', () => {
    cy.get('[data-cy=status-filter]').click();
    cy.contains('New').click();
    cy.get('table tbody tr').each($row => {
      cy.wrap($row).find('app-ticket-status-badge').should('contain', 'New');
    });
  });

  it('should search tickets', () => {
    cy.get('[data-cy=search-input]').type('installation{enter}');
    cy.get('table tbody tr').should('have.length.greaterThan', 0);
    cy.get('table tbody tr').first().should('contain', 'installation');
  });

  it('should navigate to ticket detail on row click', () => {
    cy.get('table tbody tr').first().click();
    cy.url().should('match', /\/tickets\/[a-f0-9]+/);
  });

  it('should paginate tickets', () => {
    cy.get('[data-cy=next-page]').click();
    cy.get('[data-cy=current-page]').should('contain', '2');
  });
});
```

---

## 12. Accessibility (WCAG 2.1 AA Compliance)

### 12.1 Keyboard Navigation

```html
<!-- Add tabindex and keyboard handlers -->
<tr *ngFor="let ticket of tickets"
    tabindex="0"
    (click)="viewTicket(ticket)"
    (keydown.enter)="viewTicket(ticket)"
    (keydown.space)="viewTicket(ticket)">
  <!-- ... -->
</tr>
```

### 12.2 ARIA Labels

```html
<!-- Search input -->
<input type="text"
       aria-label="Search tickets by ID, subject, or description"
       [ngModel]="filters.search">

<!-- Filter dropdowns -->
<button aria-label="Filter by status"
        aria-expanded="showStatusFilter"
        (click)="showStatusFilter = !showStatusFilter">
  Status
</button>

<!-- Pagination -->
<button aria-label="Previous page"
        [disabled]="pagination.page === 1">
  <i class="fas fa-chevron-left"></i>
</button>
```

### 12.3 Screen Reader Support

```html
<!-- Live region for dynamic updates -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  {{ tickets.length }} tickets loaded
</div>

<!-- Skip to content link -->
<a href="#tickets-table" class="sr-only focus:not-sr-only">
  Skip to tickets table
</a>

<table id="tickets-table">
  <!-- ... -->
</table>
```

**CSS for .sr-only**:
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.focus\:not-sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

---

## 13. Important Implementation Notes

### 13.1 Do NOT Patterns

1. **Do NOT use Angular signals** - Codebase uses RxJS BehaviorSubjects/Observables
2. **Do NOT use NgModules** - Angular 21 standalone components only
3. **Do NOT use constructor DI** - Use inject() function instead
4. **Do NOT forget takeUntil** - Memory leaks are critical in SPAs
5. **Do NOT block UI thread** - All API calls are async with loading states
6. **Do NOT mutate arrays directly** - Use spread operator for immutability
7. **Do NOT skip ChangeDetectorRef** - Required for Socket.io updates

### 13.2 Critical Requirements

1. **Real-time updates**: Component MUST subscribe to TicketService observables
2. **Pagination**: Backend API MUST support page/limit query params
3. **Filtering**: Backend API MUST support comma-separated filter values
4. **Sorting**: Backend API MUST support sortBy/sortOrder query params
5. **Socket.io**: TicketService already handles Socket connection
6. **Configuration**: Categories are dynamic, fetched from ConfigurationService
7. **Routing**: Ensure routes are configured for /tickets/:id and /tickets/new

### 13.3 Backend API Contract

**Expected GET /api/v2/tickets response**:
```json
{
  "tickets": [
    {
      "_id": "67890abc",
      "ticketId": "LUX-2025-000001",
      "subject": "Solar panel installation",
      "description": "Request for 10kW system",
      "category": "solar_installation",
      "priority": "high",
      "status": "open",
      "customerId": {
        "_id": "12345abc",
        "firstName": "John",
        "lastName": "Doe",
        "phoneNumber": "529991234567"
      },
      "assignedAgent": {
        "_id": "agent123",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@example.com"
      },
      "escalated": false,
      "createdAt": "2025-12-20T10:30:00Z",
      "updatedAt": "2025-12-20T15:45:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

**Query Parameters**:
```
?page=1
&limit=20
&status=new,open,in_progress
&category=solar_installation,maintenance
&priority=high,urgent
&assignedAgent=agent123
&search=installation
&escalated=true
&sortBy=createdAt
&sortOrder=desc
```

---

## 14. Future Enhancements

### 14.1 Bulk Actions
- Select multiple tickets via checkboxes
- Bulk assign to agent
- Bulk status change
- Bulk priority change

### 14.2 Advanced Filters
- Date range filter (createdAt, resolvedAt)
- SLA compliance filter (overdue, at-risk, on-track)
- Custom field filters (tags, location, subcategory)

### 14.3 Export Functionality
- Export to CSV/XLSX (similar to CustomerList)
- PDF report generation
- Email report scheduling

### 14.4 Saved Views
- Save filter combinations as "views"
- Quick access to "My Tickets", "Urgent Tickets", "Escalated"
- Per-user view preferences

### 14.5 Drag-and-Drop
- Drag tickets to change status (Kanban board view)
- Drag to assign to agent

---

## 15. Files to Create

### 15.1 File Checklist

1. **c:\laragon\www\nodejs\whatsapp-meta-bot\frontend\src\app\components\tickets\ticket-list\ticket-list.component.ts**
   - Export: `TicketListComponent`
   - ~400 lines of TypeScript
   - Implements: OnInit, OnDestroy

2. **c:\laragon\www\nodejs\whatsapp-meta-bot\frontend\src\app\components\tickets\ticket-list\ticket-list.component.html**
   - ~350 lines of HTML
   - Sections: Header, Filters, Table, Pagination

3. **c:\laragon\www\nodejs\whatsapp-meta-bot\frontend\src\app\components\tickets\ticket-list\ticket-list.component.css**
   - ~100 lines of CSS
   - Custom scrollbars, animations, responsive styles

### 15.2 Dependencies Check

**Ensure these files exist before implementation**:
- ✅ `frontend/src/app/services/ticket.ts` (TicketService)
- ✅ `frontend/src/app/services/configuration.ts` (ConfigurationService)
- ✅ `frontend/src/app/services/agent.ts` (AgentService)
- ✅ `frontend/src/app/services/toast.ts` (ToastService)
- ✅ `frontend/src/app/components/tickets/ticket-status-badge/ticket-status-badge.component.ts`

**Routing Configuration** (must be added to `app.routes.ts`):
```typescript
{
  path: 'tickets',
  loadComponent: () => import('./components/tickets/ticket-list/ticket-list.component')
    .then(m => m.TicketListComponent),
  canActivate: [AuthGuard]
}
```

---

## 16. Conclusion

This implementation plan provides a complete blueprint for building the TicketList component following Clean Architecture, Angular 21 best practices, and the established codebase patterns. The component is designed to be:

- **Maintainable**: Clear separation of concerns, well-documented methods
- **Scalable**: Supports pagination, virtual scrolling (future), lazy loading
- **Testable**: Comprehensive unit, integration, and E2E test coverage
- **Accessible**: WCAG 2.1 AA compliant with keyboard navigation and ARIA labels
- **Performant**: Debounced search, change detection optimization, efficient rendering
- **Real-time**: Socket.io integration for live ticket updates
- **Responsive**: Mobile-first design with Tailwind CSS

**Next Steps**:
1. Review this plan with the development team
2. Verify backend API compliance with expected response format
3. Implement the three files (TypeScript, HTML, CSS)
4. Write unit tests
5. Configure routing
6. Test real-time updates with Socket.io
7. Perform accessibility audit
8. Deploy and monitor performance

**Estimated Implementation Time**: 8-12 hours for experienced Angular developer

---

**Document End**
