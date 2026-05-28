import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <span
      [ngClass]="getBadgeClasses()"
      [title]="getStatusTooltip()"
      class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors">
      <i [ngClass]="getIconClass()" class="text-xs"></i>
      <span>{{ 'status.' + status | translate }}</span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `]
})
export class StatusBadgeComponent {
  @Input() status: string = 'open';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  getBadgeClasses(): string {
    const baseClasses = 'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors';

    const sizeClasses = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-xs',
      lg: 'px-4 py-1.5 text-sm'
    };

    const statusClasses: { [key: string]: string } = {
      'open': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'assigned': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'waiting': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'resolved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'closed': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    };

    return `${baseClasses} ${sizeClasses[this.size]} ${statusClasses[this.status] || statusClasses['open']}`;
  }

  getIconClass(): string {
    const icons: { [key: string]: string } = {
      'open': 'fas fa-circle text-blue-500',
      'assigned': 'fas fa-user-tie text-yellow-500',
      'waiting': 'fas fa-clock text-orange-500',
      'resolved': 'fas fa-check-circle text-green-500',
      'closed': 'fas fa-lock text-gray-500'
    };

    return icons[this.status] || icons['open'];
  }

  getStatusTooltip(): string {
    const tooltips: { [key: string]: string } = {
      'open': 'Conversation is open and handled by AI',
      'assigned': 'Assigned to an agent',
      'waiting': 'Waiting for response',
      'resolved': 'Conversation resolved, awaiting confirmation',
      'closed': 'Conversation closed'
    };

    return tooltips[this.status] || '';
  }
}
