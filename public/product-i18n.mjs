const labels = {
  en: [
    'Project settings',
    'Export project backup',
    'Try again in a moment.',
    'Guided example · sample responses',
    'Start my own project',
  ],
  'zh-CN': [
    '项目设置',
    '导出项目备份',
    '请稍后重试。',
    '引导示例 · 使用示例回答',
    '开始自己的项目',
  ],
  'zh-TW': [
    '專案設定',
    '匯出專案備份',
    '請稍後再試。',
    '引導範例 · 使用範例回答',
    '開始自己的專案',
  ],
  ja: [
    'プロジェクト設定',
    'プロジェクトのバックアップを保存',
    'しばらくしてからもう一度お試しください。',
    'ガイド付きの例 · サンプル回答',
    '自分のプロジェクトを始める',
  ],
  ko: [
    '프로젝트 설정',
    '프로젝트 백업 내보내기',
    '잠시 후 다시 시도하세요.',
    '안내 예시 · 예시 응답',
    '내 프로젝트 시작',
  ],
  es: [
    'Ajustes del proyecto',
    'Exportar copia del proyecto',
    'Vuelve a intentarlo en unos momentos.',
    'Ejemplo guiado · respuestas de muestra',
    'Crear mi propio proyecto',
  ],
  fr: [
    'Paramètres du projet',
    'Exporter une sauvegarde',
    'Réessayez dans un instant.',
    'Exemple guidé · réponses prédéfinies',
    'Créer mon propre projet',
  ],
  de: [
    'Projekteinstellungen',
    'Projektsicherung exportieren',
    'Versuche es gleich noch einmal.',
    'Geführtes Beispiel · Beispielantworten',
    'Eigenes Projekt starten',
  ],
  pt: [
    'Configurações do projeto',
    'Exportar cópia do projeto',
    'Tente novamente em instantes.',
    'Exemplo guiado · respostas de exemplo',
    'Criar meu próprio projeto',
  ],
  ru: [
    'Настройки проекта',
    'Экспорт резервной копии',
    'Попробуйте ещё раз чуть позже.',
    'Учебный пример · готовые ответы',
    'Создать свой проект',
  ],
  it: [
    'Impostazioni del progetto',
    'Esporta backup del progetto',
    'Riprova tra poco.',
    'Esempio guidato · risposte di esempio',
    'Crea il mio progetto',
  ],
  ar: [
    'إعدادات المشروع',
    'تصدير نسخة احتياطية',
    'حاول مجددًا بعد قليل.',
    'مثال إرشادي · إجابات نموذجية',
    'بدء مشروعي الخاص',
  ],
};
export function productText(locale, index) {
  return (labels[locale] || labels.en)[index];
}

const readinessLabels = {
  en: 'What is still needed?',
  'zh-CN': '还需要哪些信息？',
  'zh-TW': '還需要哪些資訊？',
  ja: 'あと何が必要？',
  ko: '어떤 정보가 더 필요한가요?',
  es: '¿Qué falta?',
  fr: 'Que manque-t-il ?',
  de: 'Was fehlt noch?',
  pt: 'O que falta?',
  ru: 'Чего ещё не хватает?',
  it: 'Che cosa manca?',
  ar: 'ما المعلومات المطلوبة؟',
};
export function readinessLabel(locale) {
  return readinessLabels[locale] || readinessLabels.en;
}
