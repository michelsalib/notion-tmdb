import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { parse } from "yaml";

import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en"],
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.yaml",
      parse: (data: string) => parse(data),
    },
  });

export default i18n;
