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
}
