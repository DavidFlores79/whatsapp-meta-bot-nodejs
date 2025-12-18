import { Component, OnInit, OnDestroy, HostListener, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ChatListComponent } from '../../chat/chat-list/chat-list';
import { ChatWindowComponent } from '../../chat/chat-window/chat-window';
import { AuthService, Agent } from '../../../services/auth';
import { ChatService, Chat } from '../../../services/chat';
import { ToastService } from '../../../services/toast';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, ChatListComponent, ChatWindowComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.css']
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  currentAgent: Agent | null = null;
  hasSelectedChat = false;
  showMenu = false;
  currentView: 'chat' | 'customers' | 'templates' | 'agents' | 'reports' | 'settings' = 'chat';
  sidebarCollapsed = false;
  mobileMenuOpen = false;

  // Resizable sidebar
  sidebarWidth = 400;
  minSidebarWidth = 280;
  maxSidebarWidth = 600;
  isResizing = false;
  isDesktop = false;

  // Unattended conversations tracking
  unattendedCount = 0;
  private reminderInterval: any;
  private chatSubscription?: Subscription;
  private selectedChatSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private chatService: ChatService,
    private toastService: ToastService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.authService.currentAgent$.subscribe(agent => {
      this.currentAgent = agent;
    });

    // Track selected chat for mobile view
    this.chatService.selectedChat$.subscribe((chat: Chat | null) => {
      this.hasSelectedChat = chat !== null;
    });

    // Detect desktop vs mobile for sidebar width
    this.checkIfDesktop();

    // Load saved sidebar width from localStorage
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
      this.sidebarWidth = parseInt(savedWidth, 10);
    }

    // Detect current route on init
    this.updateCurrentView();

    // Subscribe to router events to update view on navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.updateCurrentView();
    });

    // Load sidebar collapsed state
    const collapsed = localStorage.getItem('sidebarCollapsed');
    if (collapsed === 'true') {
      this.sidebarCollapsed = true;
    }

    // Track unattended conversations
    this.chatSubscription = this.chatService.chats$.subscribe(chats => {
      this.updateUnattendedCount(chats);
    });

    // Track selected chat to update unattended count
    this.selectedChatSubscription = this.chatService.selectedChat$.subscribe(() => {
      this.chatService.chats$.subscribe(chats => {
        this.updateUnattendedCount(chats);
      }).unsubscribe();
    });

    // Start reminder sound check (every 5 seconds)
    this.startReminderSound();
  }

  ngOnDestroy() {
    // Clear reminder interval
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
    }

    // Unsubscribe from observables
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }
    if (this.selectedChatSubscription) {
      this.selectedChatSubscription.unsubscribe();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.checkIfDesktop();
  }

  private checkIfDesktop() {
    // md breakpoint in Tailwind is 768px
    this.isDesktop = window.innerWidth >= 768;
  }

  private updateUnattendedCount(chats: Chat[]) {
    // Get current agent ID
    const currentAgentId = this.currentAgent?._id;
    if (!currentAgentId) {
      this.unattendedCount = 0;
      return;
    }

    // Count assigned conversations that are not currently being viewed
    const selectedChatId = this.chatService.getSelectedChatId();

    this.unattendedCount = chats.filter(chat => {
      // Check if conversation is assigned to current agent
      const assignedAgentId = typeof chat.assignedAgent === 'string'
        ? chat.assignedAgent
        : chat.assignedAgent?._id;

      const isAssignedToMe = assignedAgentId === currentAgentId;
      const isNotCurrentlyViewed = chat.id !== selectedChatId;
      const hasStatus = chat.status === 'assigned';

      return isAssignedToMe && isNotCurrentlyViewed && hasStatus;
    }).length;
  }

  private startReminderSound() {
    // Check every 5 seconds for unattended conversations
    this.reminderInterval = setInterval(() => {
      if (this.unattendedCount > 0) {
        this.playReminderSound();
      }
    }, 5000); // 5 seconds
  }

  private playReminderSound() {
    try {
      // Create a gentle reminder sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Two-tone reminder (less intrusive than notification)
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Second tone
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 700;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.15, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.3);
      }, 150);
    } catch (error) {
      console.warn('Could not play reminder sound:', error);
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed.toString());
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  updateCurrentView() {
    const url = this.router.url;
    if (url.includes('/customers')) {
      this.currentView = 'customers';
    } else if (url.includes('/templates')) {
      this.currentView = 'templates';
    } else if (url.includes('/agents')) {
      this.currentView = 'agents';
    } else if (url.includes('/reports')) {
      this.currentView = 'reports';
    } else if (url.includes('/settings')) {
      this.currentView = 'settings';
    } else {
      this.currentView = 'chat';
    }
  }

  navigateToConversations() {
    this.currentView = 'chat';
    this.router.navigate(['/']);
  }

  navigateToCustomers() {
    this.currentView = 'customers';
    this.router.navigate(['/customers']);
  }

  navigateToTemplates() {
    this.currentView = 'templates';
    this.router.navigate(['/templates']);
  }

  navigateToAgents() {
    this.currentView = 'agents';
    this.router.navigate(['/agents']);
  }

  navigateToReports() {
    this.currentView = 'reports';
    this.router.navigate(['/reports']);
  }

  navigateToSettings() {
    this.currentView = 'settings';
    this.router.navigate(['/settings']);
  }

  toggleMenu() {
    this.showMenu = !this.showMenu;
  }

  closeMenu() {
    this.showMenu = false;
  }

  viewProfile() {
    this.closeMenu();
    // TODO: Implement profile view
    console.log('View profile');
  }

  viewCustomers() {
    this.closeMenu();
    this.router.navigate(['/customers']);
  }

  viewSettings() {
    this.closeMenu();
    this.router.navigate(['/settings']);
  }

  toggleAutoAssign() {
    if (!this.currentAgent) return;

    const newValue = !this.currentAgent.autoAssign;
    this.authService.toggleAutoAssign(newValue).subscribe({
      next: () => {
        console.log(`Auto-assign ${newValue ? 'enabled' : 'disabled'}`);
      },
      error: (err) => {
        console.error('Failed to toggle auto-assign:', err);
        this.toastService.error('Failed to update auto-assign setting');
      }
    });
  }

  logout() {
    this.closeMenu();
    // Logout now clears auth immediately and handles navigation
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }

  backToList() {
    // Deselect chat to go back to list on mobile
    this.chatService.selectChat('');
  }

  startResize(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;

    // Get the left navigation sidebar width (w-60 = 240px when expanded, w-20 = 80px when collapsed)
    const navSidebarWidth = this.sidebarCollapsed ? 80 : 240;

    const onMouseMove = (e: MouseEvent) => {
      if (this.isResizing) {
        // Calculate width relative to the left navigation sidebar
        const newWidth = e.clientX - navSidebarWidth;
        if (newWidth >= this.minSidebarWidth && newWidth <= this.maxSidebarWidth) {
          // Use NgZone to trigger Angular change detection
          this.ngZone.run(() => {
            this.sidebarWidth = newWidth;
          });
        }
      }
    };

    const onMouseUp = () => {
      this.ngZone.run(() => {
        this.isResizing = false;
      });
      localStorage.setItem('sidebarWidth', this.sidebarWidth.toString());
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
}
