import {LanguageConfig} from './interfaces';
import {LangEng} from './lang.eng';
import {LangIta} from './lang.ita';

export type SupportedLanguages = 'eng' | 'ita' | 'deu';

export const i18nMap = new Map<SupportedLanguages, LanguageConfig>();

i18nMap.set('eng', LangEng);
i18nMap.set('ita', LangIta);
