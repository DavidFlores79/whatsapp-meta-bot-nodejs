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
      'new': 'bg-gray-700 text-gray-300',
      'open': 'bg-blue-900/50 text-blue-400',
      'in_progress': 'bg-yellow-900/50 text-yellow-400',
      'pending_customer': 'bg-purple-900/50 text-purple-400',
      'waiting_internal': 'bg-orange-900/50 text-orange-400',
      'resolved': 'bg-green-900/50 text-green-400',
      'closed': 'bg-gray-600 text-gray-400'
    };
    return statusMap[this.status] || statusMap['new'];
  }

  getDotClass(): string {
    const dotMap: { [key: string]: string } = {
      'new': 'bg-gray-400',
      'open': 'bg-blue-400',
      'in_progress': 'bg-yellow-400 animate-pulse',
      'pending_customer': 'bg-purple-400',
      'waiting_internal': 'bg-orange-400',
      'resolved': 'bg-green-400',
      'closed': 'bg-gray-500'
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
