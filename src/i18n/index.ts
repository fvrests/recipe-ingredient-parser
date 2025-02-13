import {LangDeu} from './lang.deu.js';
import {LangEng} from './lang.eng.js';
import {LangIta} from './lang.ita.js';

export type SupportedLanguages = 'eng' | 'ita' | 'deu';

export const i18nMap = {
  deu: LangDeu,
  eng: LangEng,
  ita: LangIta,
};
