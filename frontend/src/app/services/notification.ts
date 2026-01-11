import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface NotificationSettings {
  soundEnabled: boolean;
  desktopNotificationsEnabled: boolean;
  vibrationEnabled: boolean;
  titleBadgeEnabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private settings: NotificationSettings = {
    soundEnabled: true,
    desktopNotificationsEnabled: true,
    vibrationEnabled: true,
    titleBadgeEnabled: true
  };

  private audioContext: AudioContext | null = null;
  private notificationAudio: HTMLAudioElement | null = null;
  private originalTitle = document.title;
  private titleBadgeInterval: any;
  private unreadCount = 0;
  private isBlinking = false;

  // Observable for permission status
  private permissionStatusSubject = new BehaviorSubject<NotificationPermission>('default');
  public permissionStatus$ = this.permissionStatusSubject.asObservable();

  constructor() {
    this.loadSettings();
    this.initializeAudio();
    this.checkNotificationPermission();

    // Save original title
    this.originalTitle = document.title;

    // Stop blinking when user focuses on the tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.stopTitleBadge();
      }
    });
  }

  /**
   * Load notification settings from localStorage
   */
  private loadSettings() {
    const soundEnabled = localStorage.getItem('sound-enabled');
    const desktopEnabled = localStorage.getItem('desktop-notifications');
    const vibrationEnabled = localStorage.getItem('vibration-enabled');
    const titleBadgeEnabled = localStorage.getItem('title-badge-enabled');

    if (soundEnabled !== null) {
      this.settings.soundEnabled = JSON.parse(soundEnabled);
    }
    if (desktopEnabled !== null) {
      this.settings.desktopNotificationsEnabled = JSON.parse(desktopEnabled);
    }
    if (vibrationEnabled !== null) {
      this.settings.vibrationEnabled = JSON.parse(vibrationEnabled);
    }
    if (titleBadgeEnabled !== null) {
      this.settings.titleBadgeEnabled = JSON.parse(titleBadgeEnabled);
    }
  }

  /**
   * Initialize audio for notifications
   */
  private initializeAudio() {
    // Create audio element for notification sound
    this.notificationAudio = new Audio();

    // Create a data URL for a notification sound (using Web Audio API)
    // This is a simple beep sound
    this.createNotificationSound();
  }

  /**
   * Create a notification sound using Web Audio API
   */
  private createNotificationSound() {
    try {
      // Create audio context on first user interaction
      const createContext = () => {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          document.removeEventListener('click', createContext);
          document.removeEventListener('keydown', createContext);
          console.log('🔊 Audio context created');
        }
      };

      // Wait for user interaction to create audio context (Chrome policy)
      document.addEventListener('click', createContext, { once: true });
      document.addEventListener('keydown', createContext, { once: true });
    } catch (error) {
      console.error('Error creating audio context:', error);
    }
  }

  /**
   * Play notification sound
   */
  async playSound() {
    if (!this.settings.soundEnabled) {
      return;
    }

    try {
      // Try using Audio element first (more reliable)
      if (!this.notificationAudio) {
        this.notificationAudio = new Audio();
      }

      // Create a simple notification sound using data URI
      // This is a 440Hz tone (A note) for 200ms
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Two-tone notification
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      // Second tone
      setTimeout(() => {
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();

        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);

        oscillator2.frequency.value = 1000;
        oscillator2.type = 'sine';

        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator2.start(audioContext.currentTime);
        oscillator2.stop(audioContext.currentTime + 0.2);
      }, 150);

      console.log('🔊 Played notification sound');
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  /**
   * Vibrate device (mobile only)
   */
  vibrate() {
    if (!this.settings.vibrationEnabled || !('vibrate' in navigator)) {
      return;
    }

    try {
      // Short vibration pattern: vibrate 200ms, pause 100ms, vibrate 200ms
      navigator.vibrate([200, 100, 200]);
    } catch (error) {
      console.error('Error vibrating:', error);
    }
  }

  /**
   * Show desktop notification
   */
  async showDesktopNotification(title: string, body: string, icon?: string, data?: any) {
    if (!this.settings.desktopNotificationsEnabled) {
      return;
    }

    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return;
    }

    // Request permission if not granted
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
      this.permissionStatusSubject.next(permission);
    }

    // Show notification if permitted
    if (permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body,
          icon: icon || '/favicon.ico',
          badge: icon || '/favicon.ico',
          tag: 'whatsapp-bot-notification',
          requireInteraction: true, // Keep notification visible until user interacts
          data: data
        });

        // Focus window when notification is clicked
        notification.onclick = () => {
          window.focus();
          notification.close();

          // If data contains conversationId, navigate to it
          if (data?.conversationId) {
            // You can emit an event here to navigate to the conversation
            console.log('Navigate to conversation:', data.conversationId);
          }
        };

        console.log('✅ Desktop notification shown:', title);
      } catch (error) {
        console.error('Error showing desktop notification:', error);
      }
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    this.permissionStatusSubject.next(permission);
    return permission;
  }

  /**
   * Check current notification permission
   */
  private checkNotificationPermission() {
    if ('Notification' in window) {
      this.permissionStatusSubject.next(Notification.permission);
    }
  }

  /**
   * Start title badge blinking
   */
  startTitleBadge(count: number = 1, message: string = 'New Message') {
    if (!this.settings.titleBadgeEnabled) {
      return;
    }

    this.unreadCount = count;
    this.isBlinking = true;

    // Stop any existing interval
    if (this.titleBadgeInterval) {
      clearInterval(this.titleBadgeInterval);
    }

    let showBadge = true;
    this.titleBadgeInterval = setInterval(() => {
      if (showBadge) {
        document.title = `(${this.unreadCount}) ${message} - ${this.originalTitle}`;
      } else {
        document.title = this.originalTitle;
      }
      showBadge = !showBadge;
    }, 1000);
  }

  /**
   * Stop title badge blinking
   */
  stopTitleBadge() {
    this.isBlinking = false;
    this.unreadCount = 0;

    if (this.titleBadgeInterval) {
      clearInterval(this.titleBadgeInterval);
      this.titleBadgeInterval = null;
    }

    document.title = this.originalTitle;
  }

  /**
   * Update title badge count without restarting blink
   */
  updateTitleBadgeCount(count: number) {
    this.unreadCount = count;
  }

  /**
   * Show all notifications for a new conversation
   */
  async notifyNewConversation(customerName: string, message: string, conversationId: string) {
    console.log('🔔 Showing notifications for new conversation:', customerName);

    // Play sound
    await this.playSound();

    // Vibrate
    this.vibrate();

    // Show desktop notification if tab is not focused
    if (document.hidden || !document.hasFocus()) {
      await this.showDesktopNotification(
        `New Conversation: ${customerName}`,
        message || 'New conversation assigned to you',
        undefined,
        { conversationId }
      );

      // Start title badge
      this.startTitleBadge(1, 'New Chat');
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<NotificationSettings>) {
    this.settings = { ...this.settings, ...settings };

    // Save to localStorage
    localStorage.setItem('sound-enabled', JSON.stringify(this.settings.soundEnabled));
    localStorage.setItem('desktop-notifications', JSON.stringify(this.settings.desktopNotificationsEnabled));
    localStorage.setItem('vibration-enabled', JSON.stringify(this.settings.vibrationEnabled));
    localStorage.setItem('title-badge-enabled', JSON.stringify(this.settings.titleBadgeEnabled));
  }

  /**
   * Get current settings
   */
  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  /**
   * Test notification system
   */
  async testNotification() {
    console.log('🧪 Testing notification system...');

    await this.playSound();
    this.vibrate();

    if (document.hidden || !document.hasFocus()) {
      await this.showDesktopNotification(
        'Test Notification',
        'This is a test notification from WhatsApp Bot',
        undefined,
        { test: true }
      );
    }

    this.startTitleBadge(1, 'Test');

    // Stop badge after 5 seconds
    setTimeout(() => {
      this.stopTitleBadge();
    }, 5000);
  }
}
