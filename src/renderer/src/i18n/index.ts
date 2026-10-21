import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readPreference, writePreference } from '@renderer/lib/utils'
import en from './en.json'
import km from './km.json'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'km', label: 'ខ្មែរ' }
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'ci.lang'
const stored = readPreference(STORAGE_KEY)
const initial: LanguageCode = stored === 'km' ? 'km' : 'en'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, km: { translation: km } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false } // React already escapes output
})

document.documentElement.lang = initial
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  writePreference(STORAGE_KEY, lng)
})

export default i18n
