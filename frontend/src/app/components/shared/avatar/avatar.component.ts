import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Reusable avatar component that displays an image or initials fallback.
 *
 * @example
 * <app-avatar [url]="user.avatar" [name]="user.name" size="md" [indicator]="'online'"></app-avatar>
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [ngClass]="containerClass" class="rounded-full overflow-hidden flex-shrink-0 relative select-none">
      <img *ngIf="resolvedUrl" [src]="resolvedUrl" [alt]="name" class="w-full h-full object-cover">
      <div *ngIf="!resolvedUrl" class="w-full h-full flex items-center justify-center text-white font-semibold" [style.background-color]="color">{{ initials }}</div>
      <div *ngIf="indicator" [ngClass]="dotClass" class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-whatsapp-dark"></div>
    </div>
  `
})
export class AvatarComponent implements OnChanges {
  @Input() url?: string | null;
  @Input() name: string = '';
  @Input() size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() indicator?: 'assigned' | 'online' | 'offline' | null;

  resolvedUrl: string | undefined;
  initials: string = '?';
  color: string = '#546E7A';
  containerClass: string = 'w-12 h-12 text-base';
  dotClass: string = '';

  private readonly colors = [
    '#1E88E5', '#43A047', '#E53935', '#8E24AA',
    '#F4511E', '#039BE5', '#00897B', '#FB8C00',
    '#6D4C41', '#546E7A'
  ];

  private readonly sizeMap: Record<string, string> = {
    xs: 'w-8 h-8 text-xs',
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl'
  };

  private readonly dotColorMap: Record<string, string> = {
    assigned: 'bg-blue-500',
    online: 'bg-green-500',
    offline: 'bg-gray-500'
  };

  ngOnChanges(changes: SimpleChanges): void {
    this.computeAll();
  }

  private computeAll(): void {
    this.resolvedUrl = this.computeResolvedUrl();
    this.initials = this.computeInitials();
    this.color = this.computeColor();
    this.containerClass = this.sizeMap[this.size] || this.sizeMap['md'];
    this.dotClass = this.indicator ? (this.dotColorMap[this.indicator] || '') : '';
  }

  private computeResolvedUrl(): string | undefined {
    if (!this.url) return undefined;
    if (this.url.includes('pravatar.cc') || this.url.includes('ui-avatars.com')) return undefined;
    return this.url;
  }

  private computeInitials(): string {
    if (!this.name || this.name.trim() === '') return '?';
    const parts = this.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  private computeColor(): string {
    const seed = this.name || '';
    if (!seed) return this.colors[this.colors.length - 1];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.colors[Math.abs(hash) % this.colors.length];
  }
}
