import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  public toasts$ = this.toastsSubject.asObservable();
  private nextId = 1;

  /**
   * Show a success toast
   */
  success(message: string, duration: number = 5000) {
    this.show(message, 'success', duration);
  }

  /**
   * Show an error toast
   */
  error(message: string, duration: number = 5000) {
    this.show(message, 'error', duration);
  }

  /**
   * Show an info toast
   */
  info(message: string, duration: number = 5000) {
    this.show(message, 'info', duration);
  }

  /**
   * Show a warning toast
   */
  warning(message: string, duration: number = 5000) {
    this.show(message, 'warning', duration);
  }

  /**
   * Show a toast notification
   */
  private show(message: string, type: Toast['type'], duration: number = 5000) {
    const toast: Toast = {
      id: this.nextId++,
      message,
      type,
      duration
    };

    const currentToasts = this.toastsSubject.value;
    this.toastsSubject.next([...currentToasts, toast]);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(toast.id);
      }, duration);
    }
  }

  /**
   * Remove a toast by ID
   */
  remove(id: number) {
    const currentToasts = this.toastsSubject.value;
    this.toastsSubject.next(currentToasts.filter(toast => toast.id !== id));
  }

  /**
   * Clear all toasts
   */
  clear() {
    this.toastsSubject.next([]);
  }
}
