import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChatListComponent } from '../../chat/chat-list/chat-list';
import { ChatWindowComponent } from '../../chat/chat-window/chat-window';
import { AuthService, Agent } from '../../../services/auth';
import { ChatService, Chat } from '../../../services/chat';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, ChatListComponent, ChatWindowComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.css']
})
export class MainLayoutComponent implements OnInit {
  currentAgent: Agent | null = null;
  hasSelectedChat = false;
  showMenu = false;

  // Resizable sidebar
  sidebarWidth = 400;
  minSidebarWidth = 280;
  maxSidebarWidth = 600;
  isResizing = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    this.authService.currentAgent$.subscribe(agent => {
      this.currentAgent = agent;
    });

    // Track selected chat for mobile view
    this.chatService.selectedChat$.subscribe((chat: Chat | null) => {
      this.hasSelectedChat = chat !== null;
    });

    // Load saved sidebar width from localStorage
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
      this.sidebarWidth = parseInt(savedWidth, 10);
    }
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

  viewSettings() {
    this.closeMenu();
    // TODO: Implement settings view
    console.log('View settings');
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
        alert('Failed to update auto-assign setting');
      }
    });
  }

  logout() {
    this.closeMenu();
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout error:', err);
        // Navigate to login anyway
        this.router.navigate(['/login']);
      }
    });
  }

  backToList() {
    // Deselect chat to go back to list on mobile
    this.chatService.selectChat('');
  }

  startResize(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;

    const onMouseMove = (e: MouseEvent) => {
      if (this.isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= this.minSidebarWidth && newWidth <= this.maxSidebarWidth) {
          this.sidebarWidth = newWidth;
        }
      }
    };

    const onMouseUp = () => {
      this.isResizing = false;
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
