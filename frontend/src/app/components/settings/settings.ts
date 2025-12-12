import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { AVAILABLE_LANGUAGES, LANGUAGE_STORAGE_KEY } from '../../config/translation.config';

interface Language {
  code: string;
  name: string;
  flag: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './settings.html',
  styleUrls: ['./settings.css']
})
export class SettingsComponent implements OnInit {
  activeTab: 'general' | 'notifications' | 'preferences' | 'account' = 'general';

  // General settings
  selectedLanguage: string = 'es-MX';
  availableLanguages: Language[] = AVAILABLE_LANGUAGES;

  // Theme settings
  selectedTheme: 'light' | 'dark' | 'auto' = 'auto';

  // Notification settings
  notificationsEnabled = true;
  soundEnabled = true;
  desktopNotificationsEnabled = false;

  // Preferences
  autoAssignEnabled = false;
  maxConcurrentChats = 5;

  // Account
  currentAgent: any = null;

  // Password change
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  constructor(
    private translate: TranslateService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Load current language
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    this.selectedLanguage = savedLanguage || this.translate.currentLang || 'es-MX';

    // Load current agent
    this.authService.currentAgent$.subscribe(agent => {
      if (agent) {
        this.currentAgent = agent;
        this.autoAssignEnabled = agent.autoAssign || false;
      }
    });

    // Load other preferences from localStorage
    this.loadPreferences();
  }

  switchTab(tab: 'general' | 'notifications' | 'preferences' | 'account') {
    this.activeTab = tab;
  }

  changeLanguage() {
    this.translate.use(this.selectedLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, this.selectedLanguage);
    this.toastService.success(this.translate.instant('settings.languageChanged'));
  }

  changeTheme() {
    // TODO: Implement theme switching
    localStorage.setItem('app-theme', this.selectedTheme);
    this.toastService.info('Theme feature coming soon!');
  }

  toggleNotifications() {
    localStorage.setItem('notifications-enabled', JSON.stringify(this.notificationsEnabled));
    this.savePreferences();
  }

  toggleSound() {
    localStorage.setItem('sound-enabled', JSON.stringify(this.soundEnabled));
    this.savePreferences();
  }

  toggleDesktopNotifications() {
    if (this.desktopNotificationsEnabled && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          localStorage.setItem('desktop-notifications', 'true');
          this.savePreferences();
        } else {
          this.desktopNotificationsEnabled = false;
          this.toastService.warning('Notification permission denied');
        }
      });
    } else {
      localStorage.setItem('desktop-notifications', 'false');
      this.savePreferences();
    }
  }

  toggleAutoAssign() {
    if (this.currentAgent) {
      this.authService.toggleAutoAssign(this.autoAssignEnabled).subscribe({
        next: () => {
          this.toastService.success(
            this.autoAssignEnabled
              ? 'Auto-assign enabled'
              : 'Auto-assign disabled'
          );
        },
        error: (err) => {
          console.error('Error toggling auto-assign:', err);
          this.autoAssignEnabled = !this.autoAssignEnabled; // Revert
          this.toastService.error('Error updating auto-assign setting');
        }
      });
    }
  }

  updateMaxConcurrentChats() {
    if (this.maxConcurrentChats < 1) {
      this.maxConcurrentChats = 1;
    } else if (this.maxConcurrentChats > 20) {
      this.maxConcurrentChats = 20;
    }
    localStorage.setItem('max-concurrent-chats', this.maxConcurrentChats.toString());
    this.savePreferences();
  }

  updatePassword() {
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.toastService.error(this.translate.instant('settings.passwordMismatch'));
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.toastService.error('Password must be at least 6 characters');
      return;
    }

    // TODO: Implement password change API
    this.toastService.info('Password change feature coming soon!');

    // Reset form
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }

  private loadPreferences() {
    const notifications = localStorage.getItem('notifications-enabled');
    const sound = localStorage.getItem('sound-enabled');
    const desktop = localStorage.getItem('desktop-notifications');
    const theme = localStorage.getItem('app-theme') as 'light' | 'dark' | 'auto';
    const maxChats = localStorage.getItem('max-concurrent-chats');

    if (notifications !== null) {
      this.notificationsEnabled = JSON.parse(notifications);
    }
    if (sound !== null) {
      this.soundEnabled = JSON.parse(sound);
    }
    if (desktop !== null) {
      this.desktopNotificationsEnabled = desktop === 'true';
    }
    if (theme) {
      this.selectedTheme = theme;
    }
    if (maxChats) {
      this.maxConcurrentChats = parseInt(maxChats, 10);
    }
  }

  private savePreferences() {
    this.toastService.success(this.translate.instant('settings.updateSuccess'));
  }
}
