import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatListComponent } from '../../chat/chat-list/chat-list';
import { ChatWindowComponent } from '../../chat/chat-window/chat-window';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, ChatListComponent, ChatWindowComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.css']
})
export class MainLayoutComponent { }
