import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastContainerComponent } from './components/shared/toast-container/toast-container';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from './config/translation.config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('frontend');

  constructor(private translate: TranslateService) {
    // Initialize translation service
    this.translate.addLangs(['es-MX', 'en-US']);
    this.translate.setDefaultLang(DEFAULT_LANGUAGE);

    // Load saved language preference or use default
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const languageToUse = savedLanguage || DEFAULT_LANGUAGE;
    this.translate.use(languageToUse);
  }

  ngOnInit() {
    // Translation service is initialized in constructor
  }
}
