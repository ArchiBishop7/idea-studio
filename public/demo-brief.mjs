const excerpts = {
  en: [
    'Create a visual narrative in one week using 6–8 still images about an everyday subject.',
    'Use your own photographs or illustrations.',
    'No video.',
    'You have your own phone available.',
    'in one week',
  ],
  'zh-CN': [
    '请在一周内用 6–8 张静态图像，围绕一个日常主题讲述一个故事。',
    '使用自己拍摄的照片或绘制的插画。',
    '不得使用视频。',
    '可以使用自己的手机。',
    '一周内',
  ],
  'zh-TW': [
    '請在一週內用 6–8 張靜態圖像，圍繞一個日常主題說一個故事。',
    '使用自己拍攝的照片或繪製的插畫。',
    '不得使用影片。',
    '可以使用自己的手機。',
    '一週內',
  ],
  ja: [
    '1週間以内に、日常をテーマにした物語を6〜8枚の静止画で表現してください。',
    '自分で撮った写真か描いたイラストを使ってください。',
    '動画は使用できません。',
    '自分のスマートフォンを使えます。',
    '1週間以内',
  ],
  ko: [
    '일주일 안에 일상적인 소재로 정지 이미지 6~8장을 사용해 이야기를 전달하세요.',
    '직접 찍은 사진이나 그린 그림을 사용하세요.',
    '동영상은 사용할 수 없습니다.',
    '본인의 휴대전화를 사용할 수 있습니다.',
    '일주일 안에',
  ],
  es: [
    'En una semana, cuenta una historia sobre un tema cotidiano con 6–8 imágenes fijas.',
    'Usa fotografías o ilustraciones propias.',
    'No uses vídeo.',
    'Puedes utilizar tu teléfono.',
    'En una semana',
  ],
  fr: [
    'En une semaine, racontez une histoire du quotidien en 6 à 8 images fixes.',
    'Utilisez vos propres photographies ou illustrations.',
    'Les vidéos ne sont pas autorisées.',
    'Vous pouvez utiliser votre téléphone.',
    'En une semaine',
  ],
  de: [
    'Erzähle innerhalb einer Woche eine Geschichte aus dem Alltag mit 6–8 Standbildern.',
    'Verwende eigene Fotos oder Illustrationen.',
    'Videos sind nicht erlaubt.',
    'Dein eigenes Smartphone steht dir zur Verfügung.',
    'innerhalb einer Woche',
  ],
  pt: [
    'Em uma semana, conte uma história sobre um tema cotidiano com 6 a 8 imagens estáticas.',
    'Use fotografias ou ilustrações de sua autoria.',
    'Não use vídeo.',
    'Você pode usar seu próprio celular.',
    'Em uma semana',
  ],
  ru: [
    'За одну неделю расскажите историю на повседневную тему с помощью 6–8 статичных изображений.',
    'Используйте свои фотографии или иллюстрации.',
    'Видео использовать нельзя.',
    'Можно использовать свой телефон.',
    'За одну неделю',
  ],
  it: [
    'In una settimana, racconta una storia su un tema quotidiano con 6–8 immagini statiche.',
    'Usa fotografie o illustrazioni tue.',
    'Non usare video.',
    'Puoi usare il tuo telefono.',
    'In una settimana',
  ],
  ar: [
    'خلال أسبوع واحد، اروِ قصة عن موضوع من الحياة اليومية باستخدام 6 إلى 8 صور ثابتة.',
    'استخدم صورًا التقطتها بنفسك أو رسومًا من إنجازك.',
    'لا تستخدم الفيديو.',
    'يمكنك استخدام هاتفك الشخصي.',
    'خلال أسبوع واحد',
  ],
};
export function demoBrief(locale = 'en') {
  const parts = excerpts[locale] ?? excerpts.en;
  return parts.slice(0, 4).join(/^(zh|ja)/.test(locale) ? '' : ' ');
}
export function demoQuotes(text) {
  const source = Object.keys(excerpts).find(
    (locale) => demoBrief(locale) === String(text ?? '').trim(),
  );
  return source ? excerpts[source] : null;
}
