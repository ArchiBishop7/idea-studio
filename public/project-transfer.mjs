import { migrateProject } from './state.mjs';
const labels = {
  en: [
    'Restore backup',
    'Restore this project?',
    'Restoring replaces this browser’s current project with the backup shown below.',
    'Choose a valid Idea Studio JSON backup.',
    'Export chosen direction',
    'Could not restore the backup. Your current project is still saved.',
    'This backup contains damaged card connections. Your current project is still saved.',
  ],
  'zh-CN': [
    '从备份恢复',
    '恢复这个项目？',
    '确认后，下面的备份将替换此浏览器中的当前项目。',
    '请选择有效的 Idea Studio JSON 备份文件。',
    '导出所选方向',
    '恢复失败，当前项目仍保存在浏览器中。',
    '备份中的卡片连接已损坏，无法恢复。你的当前项目已保留。',
  ],
  'zh-TW': [
    '從備份還原',
    '還原這個專案？',
    '確認後，下方備份將取代此瀏覽器中的目前專案。',
    '請選擇有效的 Idea Studio JSON 備份。',
    '匯出所選方向',
    '還原失敗，目前專案仍保存在瀏覽器中。',
    '備份中的卡片連結已損壞，無法還原。你目前的專案已保留。',
  ],
  ja: [
    'バックアップから復元',
    'このプロジェクトを復元しますか？',
    '下記のバックアップで現在のプロジェクトを置き換えます。',
    '有効な Idea Studio の JSON バックアップを選んでください。',
    '選んだ方向性を書き出す',
    '復元できませんでした。現在のプロジェクトは保存されています。',
    'バックアップ内のカードのつながりが壊れているため、復元できません。現在のプロジェクトは保存されています。',
  ],
  ko: [
    '백업 복원',
    '이 프로젝트를 복원할까요?',
    '아래 백업으로 이 브라우저의 현재 프로젝트를 교체합니다.',
    '유효한 Idea Studio JSON 백업을 선택하세요.',
    '선택한 방향 내보내기',
    '복원하지 못했습니다. 현재 프로젝트는 저장되어 있습니다.',
    '백업의 카드 연결이 손상되어 복원할 수 없습니다. 현재 프로젝트는 그대로 보관됩니다.',
  ],
  es: [
    'Restaurar copia',
    '¿Restaurar este proyecto?',
    'Esta copia sustituirá al proyecto actual del navegador.',
    'Selecciona una copia JSON válida de Idea Studio.',
    'Exportar la dirección elegida',
    'No se pudo restaurar la copia. El proyecto actual sigue guardado.',
    'Los enlaces entre las tarjetas de esta copia están dañados. Tu proyecto actual sigue guardado.',
  ],
  fr: [
    'Restaurer une sauvegarde',
    'Restaurer ce projet ?',
    'La sauvegarde ci-dessous remplacera le projet actuel du navigateur.',
    'Choisissez une sauvegarde JSON valide d’Idea Studio.',
    'Exporter la direction choisie',
    'Restauration impossible. Le projet actuel reste enregistré.',
    'Les liens entre les cartes de cette sauvegarde sont endommagés. Votre projet actuel est conservé.',
  ],
  de: [
    'Sicherung laden',
    'Dieses Projekt wiederherstellen?',
    'Diese Sicherung ersetzt das aktuelle Projekt in diesem Browser.',
    'Wähle eine gültige JSON-Sicherung von Idea Studio.',
    'Gewählte Richtung exportieren',
    'Laden fehlgeschlagen. Das aktuelle Projekt bleibt gespeichert.',
    'Die Kartenverbindungen in dieser Sicherung sind beschädigt. Dein aktuelles Projekt bleibt gespeichert.',
  ],
  pt: [
    'Restaurar backup',
    'Restaurar este projeto?',
    'O backup abaixo substituirá o projeto atual deste navegador.',
    'Selecione um backup JSON válido do Idea Studio.',
    'Exportar direção escolhida',
    'Falha na restauração. O projeto atual continua salvo.',
    'As ligações entre os cartões desta cópia estão danificadas. O projeto atual continua guardado.',
  ],
  ru: [
    'Восстановить копию',
    'Восстановить проект?',
    'Эта копия заменит текущий проект в браузере.',
    'Выберите действительную резервную копию Idea Studio в формате JSON.',
    'Скачать выбранное направление',
    'Не удалось восстановить копию. Текущий проект сохранён.',
    'Связи между карточками в резервной копии повреждены. Текущий проект сохранён.',
  ],
  it: [
    'Ripristina backup',
    'Ripristinare il progetto?',
    'Il backup qui sotto sostituirà il progetto corrente nel browser.',
    'Seleziona un backup JSON valido di Idea Studio.',
    'Esporta la direzione scelta',
    'Ripristino non riuscito. Il progetto corrente è ancora salvato.',
    'I collegamenti tra le schede di questo backup sono danneggiati. Il progetto attuale rimane salvato.',
  ],
  ar: [
    'استعادة نسخة احتياطية',
    'استعادة هذا المشروع؟',
    'ستحل النسخة التالية محل المشروع الحالي في هذا المتصفح.',
    'اختر نسخة JSON احتياطية صالحة من Idea Studio.',
    'تصدير الاتجاه المختار',
    'تعذرت الاستعادة. ما زال مشروعك الحالي محفوظًا.',
    'تعذرت الاستعادة بسبب تلف الروابط بين البطاقات في النسخة الاحتياطية. ما زال مشروعك الحالي محفوظًا.',
  ],
};
export const transferText = (locale, index) => (labels[locale] || labels.en)[index];
export function readBackup(text) {
  const file = JSON.parse(text),
    p = file?.project;
  const strings = (x) => Array.isArray(x) && x.every((v) => typeof v === 'string');
  const records = (x) =>
    Array.isArray(x) && x.every((v) => v && typeof v === 'object' && !Array.isArray(v));
  const direction = (d) =>
    typeof d.id === 'string' &&
    typeof d.title === 'string' &&
    typeof d.summary === 'string' &&
    typeof d.fit === 'string' &&
    typeof d.tradeoff === 'string' &&
    strings(d.sourceIds) &&
    strings(d.requirementIds);
  if (
    file.application !== 'Idea Studio' ||
    !p ||
    ![1, 2].includes(p.schemaVersion) ||
    typeof p.id !== 'string' ||
    !Number.isSafeInteger(p.revision) ||
    !['brief', 'entry', 'explore', 'directions', 'chosen'].includes(p.screen) ||
    typeof p.brief?.text !== 'string' ||
    !records(p.brief.requirements) ||
    !p.start ||
    !p.review ||
    !records(p.review.issues) ||
    typeof p.draft?.id !== 'string' ||
    ![p.inputs, p.clues, p.links, p.events, p.directions].every(records) ||
    !p.events.every((e) => typeof e.type === 'string') ||
    !p.clues.every(
      (c) => typeof c.id === 'string' && typeof c.title === 'string' && strings(c.sourceIds),
    ) ||
    !p.directions.every(direction) ||
    (p.screen === 'chosen' && !p.directions.some((d) => d.id === p.selectedDirectionId)) ||
    !records(p.directionHistory ?? []) ||
    !(p.directionHistory ?? []).every(
      (h) => records(h.directions) && h.directions.every(direction),
    ) ||
    !records(p.combinationHistory ?? []) ||
    !(p.combinationHistory ?? []).every(
      (h) => records(h.clues) && records(h.links) && records(h.results),
    )
  )
    throw Error('Invalid backup');
  if (
    p.question != null &&
    (typeof p.question.text !== 'string' || !p.question.text.trim() || !strings(p.question.options))
  )
    throw Error('Invalid question');
  if (!['answer', 'choice', 'thought'].every((field) => typeof p.draft[field] === 'string'))
    throw Error('Invalid draft');
  if (!Number.isSafeInteger(p.round) || p.round < 0 || !strings(p.preferences ?? []))
    throw Error('Invalid progress');
  if (![p.directionQuestions ?? [], p.rejections ?? [], p.corrections ?? []].every(records))
    throw Error('Invalid project history');
  for (const entry of p.directionQuestions ?? []) {
    if (
      ![entry.id, entry.directionId, entry.question, entry.answer].every(
        (value) => typeof value === 'string' && value.trim().length > 0,
      )
    )
      throw Error('Invalid direction question or answer');
  }
  const clueIds = new Set(p.clues.map((clue) => clue.id));
  if (clueIds.size !== p.clues.length)
    throw Object.assign(Error('Duplicate clue IDs'), { code: 'invalid_connections' });
  if (!p.links.every((link) => link.a !== link.b && clueIds.has(link.a) && clueIds.has(link.b)))
    throw Object.assign(Error('Invalid connections'), { code: 'invalid_connections' });
  const questionDrafts = file.questionDrafts ?? {};
  if (
    !questionDrafts ||
    typeof questionDrafts !== 'object' ||
    Array.isArray(questionDrafts) ||
    Object.values(questionDrafts).some((v) => typeof v !== 'string')
  )
    throw Error('Invalid drafts');
  const explanationHistory = file.explanationHistory ?? {};
  if (
    typeof explanationHistory !== 'object' ||
    Array.isArray(explanationHistory) ||
    Object.values(explanationHistory).some(
      (turns) =>
        !Array.isArray(turns) ||
        turns.some(
          (turn) => typeof turn?.question !== 'string' || typeof turn?.answer !== 'string',
        ),
    )
  ) {
    throw Error('Invalid explanation history');
  }
  return {
    project: migrateProject(p),
    mode: file.mode === 'preview' ? 'preview' : 'live',
    questionDrafts,
    explanationHistory,
    extractedBriefText: typeof file.extractedBriefText === 'string' ? file.extractedBriefText : '',
    fileName: typeof file.fileName === 'string' ? file.fileName : null,
    savedAt: new Date().toISOString(),
  };
}
