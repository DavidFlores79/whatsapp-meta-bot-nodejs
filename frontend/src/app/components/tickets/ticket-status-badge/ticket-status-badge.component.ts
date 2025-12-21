import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="px-2 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1"
      [ngClass]="getStatusClass()">
      <span class="w-2 h-2 rounded-full" [ngClass]="getDotClass()" *ngIf="showDot"></span>
      {{ getStatusLabel() }}
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class TicketStatusBadgeComponent {
  @Input() status!: string;
  @Input() showDot = false;

  getStatusClass(): string {
    const statusMap: { [key: string]: string } = {
      'new': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      'open': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'in_progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'pending_customer': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'waiting_internal': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      'resolved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'closed': 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'
    };
    return statusMap[this.status] || statusMap['new'];
  }

  getDotClass(): string {
    const dotMap: { [key: string]: string } = {
      'new': 'bg-gray-500',
      'open': 'bg-blue-500',
      'in_progress': 'bg-yellow-500 animate-pulse',
      'pending_customer': 'bg-purple-500',
      'waiting_internal': 'bg-orange-500',
      'resolved': 'bg-green-500',
      'closed': 'bg-gray-400'
    };
    return dotMap[this.status] || dotMap['new'];
  }

  getStatusLabel(): string {
    const labelMap: { [key: string]: string } = {
      'new': 'New',
      'open': 'Open',
      'in_progress': 'In Progress',
      'pending_customer': 'Pending Customer',
      'waiting_internal': 'Waiting Internal',
      'resolved': 'Resolved',
      'closed': 'Closed'
    };
    return labelMap[this.status] || this.status;
  }
}
