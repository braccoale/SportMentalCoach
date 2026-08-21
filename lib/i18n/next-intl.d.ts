import type { Locale as KaiPaiLocale } from './locales';
import italianMessages from '@/messages/it.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: KaiPaiLocale;
    Messages: typeof italianMessages;
  }
}
