import { browser } from 'wxt/browser';

export type Translator = (key: string, substitutions?: string | string[]) => string;

export const translate: Translator = (key, substitutions) =>
  browser.i18n.getMessage(key as never, substitutions) || key;
