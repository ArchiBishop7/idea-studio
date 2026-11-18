/** Navigation and confirmation controls for editing a starting point. */
export const ENTRY_MESSAGES = {
  en: {
    backToStartingPoint: 'Back to starting point',
    backToExploration: 'Back to exploration',
    updateAndContinue: 'Update and continue',
  },
  'zh-CN': {
    backToStartingPoint: '返回起点',
    backToExploration: '返回探索',
    updateAndContinue: '更新并继续',
  },
  'zh-TW': {
    backToStartingPoint: '返回起點',
    backToExploration: '返回探索',
    updateAndContinue: '更新並繼續',
  },
  ja: {
    backToStartingPoint: '出発点に戻る',
    backToExploration: '探索に戻る',
    updateAndContinue: '更新して続ける',
  },
  ko: {
    backToStartingPoint: '시작점으로 돌아가기',
    backToExploration: '탐색으로 돌아가기',
    updateAndContinue: '업데이트하고 계속',
  },
  es: {
    backToStartingPoint: 'Volver al punto de partida',
    backToExploration: 'Volver a la exploración',
    updateAndContinue: 'Actualizar y continuar',
  },
  fr: {
    backToStartingPoint: 'Revenir au point de départ',
    backToExploration: 'Revenir à l’exploration',
    updateAndContinue: 'Mettre à jour et continuer',
  },
  de: {
    backToStartingPoint: 'Zurück zum Ausgangspunkt',
    backToExploration: 'Zurück zur Erkundung',
    updateAndContinue: 'Aktualisieren und weiter',
  },
  pt: {
    backToStartingPoint: 'Voltar ao ponto de partida',
    backToExploration: 'Voltar à exploração',
    updateAndContinue: 'Atualizar e continuar',
  },
  ru: {
    backToStartingPoint: 'Вернуться к исходной точке',
    backToExploration: 'Вернуться к исследованию',
    updateAndContinue: 'Обновить и продолжить',
  },
  it: {
    backToStartingPoint: 'Torna al punto di partenza',
    backToExploration: 'Torna all’esplorazione',
    updateAndContinue: 'Aggiorna e continua',
  },
  ar: {
    backToStartingPoint: 'العودة إلى نقطة البداية',
    backToExploration: 'العودة إلى الاستكشاف',
    updateAndContinue: 'تحديث ومتابعة',
  },
};

export function entryText(locale, key) {
  return ENTRY_MESSAGES[locale]?.[key] ?? ENTRY_MESSAGES.en[key] ?? key;
}
