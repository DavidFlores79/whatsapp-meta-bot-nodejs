import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { CRMSettingsService, CRMSettings } from '../../services/crm-settings';
import { ConfigurationService, AssistantConfiguration, InstructionsPreview, TicketBehavior } from '../../services/configuration';
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
  activeTab: 'general' | 'notifications' | 'preferences' | 'account' | 'crm' | 'assistant' = 'general';

  // Type guard to help Angular template compiler
  readonly tabType: 'general' | 'notifications' | 'preferences' | 'account' | 'crm' | 'assistant' = 'general';

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

  // CRM Settings
  crmSettings: CRMSettings | null = null;
  isSavingCRM = false;
  isLoadingCRM = false;

  // Ticket Behavior Settings
  ticketBehavior: TicketBehavior = { 
    attachmentHoursLimit: 48,
    allowReopening: true,
    reopenWindowDays: 30
  };
  isSavingTicketBehavior = false;

  // AI Assistant Settings
  assistantConfig: AssistantConfiguration | null = null;
  instructionsTemplate: string = '';
  instructionsPreview: InstructionsPreview | null = null;
  isLoadingAssistant = false;
  isSavingAssistant = false;
  isLoadingPreset = false;
  showPreview = false;
  activePreset: string | null = null;

  // Confirmation Modal
  showConfirmModal = false;
  confirmModalConfig = {
    title: '',
    message: '',
    iconClass: 'fas fa-question-circle',
    iconColor: '#3b82f6',
    iconBgColor: 'rgba(59, 130, 246, 0.2)',
    confirmText: 'Confirmar',
    confirmBtnClass: 'bg-teal-500 hover:bg-teal-600',
    onConfirm: () => {}
  };

  constructor(
    private translate: TranslateService,
    private authService: AuthService,
    private toastService: ToastService,
    private crmSettingsService: CRMSettingsService,
    private configurationService: ConfigurationService,
    private cdr: ChangeDetectorRef
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

  switchTab(tab: 'general' | 'notifications' | 'preferences' | 'account' | 'crm' | 'assistant') {
    console.log('[Settings] Switching to tab:', tab);
    this.activeTab = tab;

    // Load CRM settings when switching to CRM tab
    if (tab === 'crm' && !this.crmSettings && !this.isLoadingCRM) {
      this.loadCRMSettings();
      this.loadTicketBehavior();
    }

    // Load AI Assistant settings when switching to assistant tab
    if (tab === 'assistant' && !this.assistantConfig && !this.isLoadingAssistant) {
      this.loadAssistantSettings();
    }
  }

  // Helper method for template comparisons to avoid type narrowing issues
  isTab(tab: string): boolean {
    return this.activeTab === tab;
  }

  isAdminOrSupervisor(): boolean {
    return this.authService.isAdminOrSupervisor();
  }

  changeLanguage() {
    this.translate.use(this.selectedLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, this.selectedLanguage);

    // Update agent's language preference in backend
    if (this.currentAgent) {
      const languageCode = this.selectedLanguage === 'en-US' ? 'en' : 'es';
      this.authService.updateAgentLanguage(languageCode).subscribe({
        next: () => {
          console.log('[Settings] Agent language updated to:', languageCode);
          this.toastService.success(this.translate.instant('settings.languageChanged'));
        },
        error: (err) => {
          console.error('[Settings] Error updating agent language:', err);
          this.toastService.success(this.translate.instant('settings.languageChanged'));
        }
      });
    } else {
      this.toastService.success(this.translate.instant('settings.languageChanged'));
    }
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

  /**
   * Load CRM settings from backend
   */
  loadCRMSettings() {
    this.isLoadingCRM = true;
    this.crmSettingsService.getSettings().subscribe({
      next: (settings) => {
        this.crmSettings = settings;
        this.isLoadingCRM = false;
        console.log('[Settings] CRM settings loaded:', settings);
        // Ensure view updates if this subscription executed outside Angular zone
        try {
          this.cdr.detectChanges();
        } catch (e) {
          /* ignore */
        }
      },
      error: (err) => {
        console.error('[Settings] Error loading CRM settings:', err);
        this.isLoadingCRM = false;
        try {
          this.cdr.detectChanges();
        } catch (e) {
          /* ignore */
        }
        this.toastService.error('Failed to load CRM settings');
      }
    });
  }

  /**
   * Save CRM settings to backend
   */
  saveCRMSettings() {
    if (!this.crmSettings) {
      this.toastService.error('No settings to save');
      return;
    }

    this.isSavingCRM = true;
    this.crmSettingsService.updateSettings(this.crmSettings).subscribe({
      next: (response) => {
        this.crmSettings = response.settings;
        this.isSavingCRM = false;
        this.toastService.success(response.message || 'CRM settings saved successfully');
        console.log('[Settings] CRM settings saved');
      },
      error: (err) => {
        this.isSavingCRM = false;
        console.error('[Settings] Error saving CRM settings:', err);
        this.toastService.error('Failed to save CRM settings');
      }
    });
  }

  /**
   * Reset CRM settings to defaults
   */
  resetCRMSettings() {
    if (!confirm('Are you sure you want to reset all CRM settings to defaults? This cannot be undone.')) {
      return;
    }

    this.isSavingCRM = true;
    this.crmSettingsService.resetToDefaults().subscribe({
      next: (response) => {
        this.crmSettings = response.settings;
        this.isSavingCRM = false;
        this.toastService.success(response.message || 'CRM settings reset to defaults');
        console.log('[Settings] CRM settings reset');
      },
      error: (err) => {
        this.isSavingCRM = false;
        console.error('[Settings] Error resetting CRM settings:', err);
        this.toastService.error('Failed to reset CRM settings');
      }
    });
  }

  /**
   * Load ticket behavior settings from backend
   */
  loadTicketBehavior() {
    this.configurationService.getTicketBehavior().subscribe({
      next: (behavior) => {
        this.ticketBehavior = behavior;
        console.log('[Settings] Ticket behavior loaded:', behavior);
      },
      error: (err) => {
        console.error('[Settings] Error loading ticket behavior:', err);
        this.toastService.error('Failed to load ticket behavior settings');
      }
    });
  }

  /**
   * Save ticket behavior settings to backend
   */
  saveTicketBehavior() {
    if (!this.ticketBehavior) {
      this.toastService.error('No ticket behavior settings to save');
      return;
    }

    // Validate
    if (this.ticketBehavior.attachmentHoursLimit < 1 || this.ticketBehavior.attachmentHoursLimit > 168) {
      this.toastService.error('Attachment time limit must be between 1 and 168 hours');
      return;
    }

    this.isSavingTicketBehavior = true;
    this.configurationService.updateTicketBehavior(this.ticketBehavior).subscribe({
      next: (response) => {
        this.isSavingTicketBehavior = false;
        this.toastService.success(response.message || 'Ticket behavior settings saved successfully');
        console.log('[Settings] Ticket behavior saved');
      },
      error: (err) => {
        this.isSavingTicketBehavior = false;
        console.error('[Settings] Error saving ticket behavior:', err);
        this.toastService.error('Failed to save ticket behavior settings');
      }
    });
  }

  // ==================== AI Assistant Settings ====================

  /**
   * Load AI Assistant settings from backend
   */
  loadAssistantSettings() {
    this.isLoadingAssistant = true;

    // Load both assistant config and instructions template in parallel
    this.configurationService.getAssistantConfiguration(true).subscribe({
      next: (config) => {
        this.assistantConfig = config;
        this.detectActivePreset();
        console.log('[Settings] Assistant config loaded:', config);
      },
      error: (err) => {
        console.error('[Settings] Error loading assistant config:', err);
      }
    });

    this.configurationService.getInstructionsTemplate(true).subscribe({
      next: (template) => {
        this.instructionsTemplate = template;
        this.isLoadingAssistant = false;
        console.log('[Settings] Instructions template loaded');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingAssistant = false;
        console.error('[Settings] Error loading instructions template:', err);
        this.toastService.error('Failed to load AI assistant settings');
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Detect which preset is currently active based on assistant config
   */
  detectActivePreset() {
    if (!this.assistantConfig) {
      this.activePreset = null;
      return;
    }

    const companyName = this.assistantConfig.companyName?.toLowerCase() || '';
    const assistantName = this.assistantConfig.assistantName?.toLowerCase() || '';
    const primaryService = this.assistantConfig.primaryServiceIssue?.toLowerCase() || '';

    // Match based on company name or service type
    if (companyName.includes('luxfree') || assistantName.includes('lúmen')) {
      this.activePreset = 'luxfree';
    } else if (companyName.includes('restaurante') || primaryService.includes('food') || primaryService.includes('comida')) {
      this.activePreset = 'restaurant';
    } else if (companyName.includes('tienda') || companyName.includes('shop') || primaryService.includes('ecommerce')) {
      this.activePreset = 'ecommerce';
    } else if (companyName.includes('clínica') || companyName.includes('clinic') || primaryService.includes('medical')) {
      this.activePreset = 'healthcare';
    } else {
      this.activePreset = null; // Custom configuration
    }

    console.log('[Settings] Detected active preset:', this.activePreset);
  }

  /**
   * Check if a preset is currently active
   */
  isPresetActive(presetId: string): boolean {
    return this.activePreset === presetId;
  }

  /**
   * Load an industry preset configuration
   */
  loadPreset(presetId: string) {
    if (this.isLoadingPreset) return;

    const presetConfig: Record<string, { name: string; icon: string; iconColor: string; iconBgColor: string }> = {
      'luxfree': { name: 'LUXFREE (Solar & Lighting)', icon: 'fas fa-sun', iconColor: '#f59e0b', iconBgColor: 'rgba(245, 158, 11, 0.2)' },
      'restaurant': { name: 'Restaurant (Food Service)', icon: 'fas fa-utensils', iconColor: '#ef4444', iconBgColor: 'rgba(239, 68, 68, 0.2)' },
      'ecommerce': { name: 'E-commerce (Retail)', icon: 'fas fa-shopping-cart', iconColor: '#3b82f6', iconBgColor: 'rgba(59, 130, 246, 0.2)' },
      'healthcare': { name: 'Healthcare (Medical)', icon: 'fas fa-heartbeat', iconColor: '#22c55e', iconBgColor: 'rgba(34, 197, 94, 0.2)' }
    };

    const preset = presetConfig[presetId] || { name: presetId, icon: 'fas fa-cog', iconColor: '#6b7280', iconBgColor: 'rgba(107, 114, 128, 0.2)' };

    this.showConfirmation({
      title: `Load ${preset.name}?`,
      message: 'This will replace your current AI assistant configuration, categories, terminology, and instructions template.',
      iconClass: preset.icon,
      iconColor: preset.iconColor,
      iconBgColor: preset.iconBgColor,
      confirmText: 'Load Preset',
      confirmBtnClass: 'bg-teal-500 hover:bg-teal-600',
      onConfirm: () => this.executeLoadPreset(presetId, preset.name)
    });
  }

  /**
   * Execute the preset loading after confirmation
   */
  private executeLoadPreset(presetId: string, presetName: string) {
    this.isLoadingPreset = true;
    this.configurationService.loadPreset(presetId).subscribe({
      next: (response) => {
        this.isLoadingPreset = false;
        if (response.success) {
          this.activePreset = presetId; // Set immediately
          this.toastService.success(`${presetName} preset loaded successfully!`);
          // Reload all assistant settings to reflect the new preset
          this.loadAssistantSettings();
        } else {
          this.toastService.error(response.message || 'Failed to load preset');
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingPreset = false;
        console.error('[Settings] Error loading preset:', err);
        this.toastService.error('Failed to load preset. Please try again.');
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Show confirmation modal
   */
  showConfirmation(config: {
    title: string;
    message: string;
    iconClass?: string;
    iconColor?: string;
    iconBgColor?: string;
    confirmText?: string;
    confirmBtnClass?: string;
    onConfirm: () => void;
  }) {
    this.confirmModalConfig = {
      title: config.title,
      message: config.message,
      iconClass: config.iconClass || 'fas fa-question-circle',
      iconColor: config.iconColor || '#3b82f6',
      iconBgColor: config.iconBgColor || 'rgba(59, 130, 246, 0.2)',
      confirmText: config.confirmText || 'Confirmar',
      confirmBtnClass: config.confirmBtnClass || 'bg-teal-500 hover:bg-teal-600',
      onConfirm: config.onConfirm
    };
    this.showConfirmModal = true;
  }

  /**
   * Cancel confirmation modal
   */
  cancelConfirmation() {
    this.showConfirmModal = false;
  }

  /**
   * Execute confirmed action
   */
  confirmAction() {
    this.showConfirmModal = false;
    this.confirmModalConfig.onConfirm();
  }

  /**
   * Save assistant configuration
   */
  saveAssistantConfig() {
    if (!this.assistantConfig) {
      this.toastService.error('No configuration to save');
      return;
    }

    this.isSavingAssistant = true;
    this.configurationService.updateAssistantConfiguration(this.assistantConfig).subscribe({
      next: (response) => {
        this.isSavingAssistant = false;
        if (response.success) {
          this.toastService.success('Assistant configuration saved');
          // Refresh preview if visible
          if (this.showPreview) {
            this.loadInstructionsPreview();
          }
        } else {
          this.toastService.error('Failed to save assistant configuration');
        }
      },
      error: (err) => {
        this.isSavingAssistant = false;
        console.error('[Settings] Error saving assistant config:', err);
        this.toastService.error('Failed to save assistant configuration');
      }
    });
  }

  /**
   * Save instructions template
   */
  saveInstructionsTemplate() {
    if (!this.instructionsTemplate) {
      this.toastService.error('Instructions template cannot be empty');
      return;
    }

    this.isSavingAssistant = true;
    this.configurationService.updateInstructionsTemplate(this.instructionsTemplate).subscribe({
      next: (response) => {
        this.isSavingAssistant = false;
        if (response.success) {
          this.toastService.success('Instructions template saved - changes will affect new AI conversations immediately');
          // Refresh preview if visible
          if (this.showPreview) {
            this.loadInstructionsPreview();
          }
        } else {
          this.toastService.error('Failed to save instructions template');
        }
      },
      error: (err) => {
        this.isSavingAssistant = false;
        console.error('[Settings] Error saving instructions template:', err);
        this.toastService.error('Failed to save instructions template');
      }
    });
  }

  /**
   * Load and display the interpolated instructions preview
   */
  loadInstructionsPreview() {
    this.configurationService.getInstructionsPreview().subscribe({
      next: (preview) => {
        this.instructionsPreview = preview;
        this.showPreview = true;
        console.log('[Settings] Instructions preview loaded');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Settings] Error loading instructions preview:', err);
        this.toastService.error('Failed to load preview');
      }
    });
  }

  /**
   * Toggle preview visibility
   */
  togglePreview() {
    if (!this.showPreview) {
      this.loadInstructionsPreview();
    } else {
      this.showPreview = false;
    }
  }

  /**
   * Reset assistant settings to defaults
   */
  resetAssistantSettings() {
    this.showConfirmation({
      title: 'Reset to Defaults?',
      message: 'This will reset all AI assistant settings to their default values. This action cannot be undone.',
      iconClass: 'fas fa-exclamation-triangle',
      iconColor: '#ef4444',
      iconBgColor: 'rgba(239, 68, 68, 0.2)',
      confirmText: 'Reset All',
      confirmBtnClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: () => this.executeResetAssistantSettings()
    });
  }

  /**
   * Execute the reset after confirmation
   */
  private executeResetAssistantSettings() {
    this.isSavingAssistant = true;
    this.configurationService.resetToDefaults().subscribe({
      next: (response) => {
        this.isSavingAssistant = false;
        if (response.success) {
          this.toastService.success('AI assistant settings reset to defaults');
          // Reload settings
          this.loadAssistantSettings();
        } else {
          this.toastService.error('Failed to reset settings');
        }
      },
      error: (err) => {
        this.isSavingAssistant = false;
        console.error('[Settings] Error resetting assistant settings:', err);
        this.toastService.error('Failed to reset settings');
      }
    });
  }
}
