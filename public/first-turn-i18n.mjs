/** The first question starts automatically after the student chooses a starting point. */
export const FIRST_TURN_MESSAGES = {
  en: {
    otherTab: 'Another tab is already processing this round.',
    preparing: 'Preparing your first question…',
    copy: 'Your assignment is ready. A starting question will appear here.',
    ready: 'Your first question is ready.',
  },
  'zh-CN': {
    otherTab: '另一个标签页正在处理这一轮。',
    preparing: '正在准备第一个问题…',
    copy: '作业要求已确认，准备好的第一个问题会显示在这里。',
    ready: '第一个问题已准备好。',
  },
  'zh-TW': {
    otherTab: '另一個分頁正在處理這一輪。',
    preparing: '正在準備第一個問題…',
    copy: '作業要求已確認，準備好的第一個問題會顯示在這裡。',
    ready: '第一個問題已準備好。',
  },
  ja: {
    otherTab: '別のタブでこのラウンドを処理しています。',
    preparing: '最初の質問を準備しています…',
    copy: '課題の内容を確認しました。最初の質問がここに表示されます。',
    ready: '最初の質問の準備ができました。',
  },
  ko: {
    otherTab: '다른 탭에서 이번 단계를 처리하고 있어요.',
    preparing: '첫 질문을 준비하고 있어요…',
    copy: '과제 요구사항을 확인했어요. 첫 질문이 여기에 표시됩니다.',
    ready: '첫 질문이 준비되었어요.',
  },
  es: {
    otherTab: 'Otra pestaña ya está procesando esta ronda.',
    preparing: 'Preparando tu primera pregunta…',
    copy: 'Tu tarea está confirmada. La primera pregunta aparecerá aquí.',
    ready: 'Tu primera pregunta está lista.',
  },
  fr: {
    otherTab: 'Un autre onglet traite déjà cette étape.',
    preparing: 'Préparation de votre première question…',
    copy: 'Votre consigne est confirmée. La première question apparaîtra ici.',
    ready: 'Votre première question est prête.',
  },
  de: {
    otherTab: 'Dieser Schritt wird bereits in einem anderen Tab verarbeitet.',
    preparing: 'Deine erste Frage wird vorbereitet…',
    copy: 'Deine Aufgabenstellung ist bestätigt. Die erste Frage erscheint hier.',
    ready: 'Deine erste Frage ist bereit.',
  },
  pt: {
    otherTab: 'Outra aba já está processando esta rodada.',
    preparing: 'Preparando sua primeira pergunta…',
    copy: 'Os requisitos da tarefa estão confirmados. A primeira pergunta aparecerá aqui.',
    ready: 'Sua primeira pergunta está pronta.',
  },
  ru: {
    otherTab: 'Этот этап уже обрабатывается в другой вкладке.',
    preparing: 'Готовим первый вопрос…',
    copy: 'Требования задания подтверждены. Первый вопрос появится здесь.',
    ready: 'Первый вопрос готов.',
  },
  it: {
    otherTab: 'Questa fase è già in corso in una seconda scheda.',
    preparing: 'Preparazione della prima domanda…',
    copy: 'La consegna è confermata. La prima domanda apparirà qui.',
    ready: 'La prima domanda è pronta.',
  },
  ar: {
    otherTab: 'تجري معالجة هذه الجولة في علامة تبويب أخرى.',
    preparing: 'جارٍ إعداد سؤالك الأول…',
    copy: 'تم تأكيد متطلبات التكليف. سيظهر السؤال الأول هنا.',
    ready: 'سؤالك الأول جاهز.',
  },
};

export function firstTurnText(locale, key) {
  return FIRST_TURN_MESSAGES[locale]?.[key] ?? FIRST_TURN_MESSAGES.en[key] ?? key;
}
