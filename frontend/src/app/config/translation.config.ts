import { HttpClient } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable } from 'rxjs';

/**
 * Custom translation loader
 * Loads translation files from assets/i18n/
 */
export class CustomTranslateLoader implements TranslateLoader {
  constructor(private http: HttpClient) {}

  getTranslation(lang: string): Observable<any> {
    return this.http.get(`/assets/i18n/${lang}.json`);
  }
}

/**
 * Translation loader factory
 */
export function HttpLoaderFactory(http: HttpClient): TranslateLoader {
  return new CustomTranslateLoader(http);
}

/**
 * Available languages in the application
 */
export const AVAILABLE_LANGUAGES = [
  { code: 'es-MX', name: 'Español (México)', flag: '🇲🇽' },
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' }
];

/**
 * Default language (Spanish Mexico)
 */
export const DEFAULT_LANGUAGE = 'es-MX';

/**
 * Storage key for language preference
 */
export const LANGUAGE_STORAGE_KEY = 'app-language';
