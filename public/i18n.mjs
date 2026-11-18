import { productText } from './product-i18n.mjs';
import { EN, TRANSLATIONS } from './locale-catalog.mjs';

export const LANGUAGES = [
  { code: 'en', label: 'English', name: 'English' },
  { code: 'zh-CN', label: 'Simplified Chinese', name: '简体中文' },
  { code: 'zh-TW', label: 'Traditional Chinese', name: '繁體中文' },
  { code: 'ja', label: 'Japanese', name: '日本語' },
  { code: 'ko', label: 'Korean', name: '한국어' },
  { code: 'es', label: 'Spanish', name: 'Español' },
  { code: 'fr', label: 'French', name: 'Français' },
  { code: 'de', label: 'German', name: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', name: 'Português' },
  { code: 'ru', label: 'Russian', name: 'Русский' },
  { code: 'it', label: 'Italian', name: 'Italiano' },
  { code: 'ar', label: 'Arabic', name: 'العربية', dir: 'rtl' },
];
const STORAGE = 'idea-studio-locale-v1';
function matchLanguage(value) {
  const valueLower = String(value || '').toLowerCase();
  const exact = LANGUAGES.find((x) => x.code.toLowerCase() === valueLower);
  if (exact) return exact.code;
  if (valueLower.startsWith('zh')) return /tw|hk|mo|hant/.test(valueLower) ? 'zh-TW' : 'zh-CN';
  return LANGUAGES.find((x) => x.code === valueLower.split('-')[0])?.code || null;
}
function initialLocale() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (LANGUAGES.some((x) => x.code === saved)) return saved;
  } catch {}
  for (const value of globalThis.navigator?.languages || [globalThis.navigator?.language]) {
    const code = matchLanguage(value);
    if (code) return code;
  }
  return 'en';
}
let locale = initialLocale();
export function getLocale() {
  return locale;
}
export function getLanguage() {
  const item = LANGUAGES.find((x) => x.code === locale);
  return { code: item.code, label: item.label };
}
export function setLocale(code) {
  if (!LANGUAGES.some((x) => x.code === code)) return false;
  locale = code;
  try {
    localStorage.setItem(STORAGE, code);
  } catch {}
  applyDocumentLanguage();
  return true;
}
export function applyDocumentLanguage() {
  if (!globalThis.document) return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.title = t('A little space to find your direction — Idea Studio');
}
const keyIndex = new Map(EN.map((value, index) => [value, index]));
export function t(key, params = {}) {
  const index = keyIndex.get(key),
    value = index === undefined ? key : TRANSLATIONS[locale]?.[index] || EN[index];
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : '{' + name + '}',
  );
}
const regexEscape = (s) =>
  s
    .split('')
    .map((c) => ('\\.^$|?*+()[]{}'.includes(c) ? '\\' + c : c))
    .join('');
const patterns = EN.filter((x) => /\{\w+\}/.test(x)).map((key) => {
  const names = [],
    parts = key.split(/(\{\w+\})/).map((part) => {
      const match = /^\{(\w+)\}$/.exec(part);
      if (!match) return regexEscape(part);
      names.push(match[1]);
      return ['n', 'm', 'k'].includes(match[1]) ? '(\\d+)' : '(.+?)';
    });
  return { key, names, regex: new RegExp('^' + parts.join('') + '$', 's') };
});
export function translateText(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const leading = value.match(/^\s*/)[0],
    trailing = value.match(/\s*$/)[0],
    trimmed = value.trim();
  if (keyIndex.has(trimmed)) return leading + t(trimmed) + trailing;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(trimmed);
    if (match) {
      const params = {};
      pattern.names.forEach((name, i) => (params[name] = match[i + 1]));
      if (pattern.key === 'Your chosen direction · {label}') params.label = t(params.label);
      return leading + t(pattern.key, params) + trailing;
    }
  }
  if (trimmed.endsWith(' ·') && keyIndex.has(trimmed.slice(0, -2)))
    return leading + t(trimmed.slice(0, -2)) + ' ·' + trailing;
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (keyIndex.has(normalized)) return leading + t(normalized) + trailing;
  return value;
}
const originals = new WeakMap(),
  attributeOriginals = new WeakMap();
const RAW = '[data-raw],[data-i18n-skip],textarea,script,style,code';
export function localize(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest(RAW)) continue;
    let original = originals.get(node);
    if (original === undefined) {
      original = node.nodeValue;
      originals.set(node, original);
    }
    const value = translateText(original);
    if (node.nodeValue !== value) node.nodeValue = value;
  }
  const elements =
    root instanceof Element
      ? [root, ...root.querySelectorAll('*')]
      : [...root.querySelectorAll('*')];
  for (const el of elements) {
    if (el.closest('[data-i18n-skip]')) continue;
    const skip = (el.getAttribute('data-raw-attrs') || '').split(' ');
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      if (!el.hasAttribute(attribute) || skip.includes(attribute)) continue;
      let map = attributeOriginals.get(el);
      if (!map) {
        map = {};
        attributeOriginals.set(el, map);
      }
      if (!(attribute in map)) map[attribute] = el.getAttribute(attribute);
      const translated = translateText(map[attribute]);
      if (el.getAttribute(attribute) !== translated) el.setAttribute(attribute, translated);
    }
  }
  applyDocumentLanguage();
}
import { PREVIEW_LOCALES } from './preview-locales.mjs';
const errorGroups = {
  question_quality: 'retry',
  api_key_missing: 'setup',
  demo_only: 'demo',
  provider_network: 'network',
  provider_timeout: 'timeout',
  provider_auth: 'auth',
  provider_busy: 'busy',
  provider_unavailable: 'retry',
  provider_response_large: 'retry',
  provider_invalid_json: 'retry',
  provider_incomplete: 'retry',
  provider_invalid_shape: 'retry',
  brief_quote_invalid: 'retry',
  wrong_action: 'retry',
  invalid_directions: 'retry',
};
const errorDetails = {
  en: {
    setup:
      'OpenAI is not connected yet. Use the guided example to test the interface now; once connected, it can review your own assignment. Your inputs are saved.',
    auth: 'The AI connection was not authorized. Check the server API key and model access. Your inputs are saved.',
    busy: 'The AI service is busy or its usage limit was reached. Your inputs are saved; try again later.',
  },
  'zh-CN': {
    setup:
      '尚未连接 OpenAI。现在可用引导示例测试界面；连接后即可处理自己的作业说明。你的输入已保存。',
    auth: 'AI连接未获授权。请检查服务器上的API密钥及模型访问权限。你的输入已保存。',
    busy: 'AI服务繁忙或已达到使用限额。你的输入已保存，请稍后重试。',
  },
  'zh-TW': {
    setup:
      '尚未連接 OpenAI。現在可用引導範例測試介面；連接後即可處理自己的作業說明。你的輸入已儲存。',
    auth: 'AI連線未獲授權。請檢查伺服器上的API金鑰及模型存取權限。你的輸入已儲存。',
    busy: 'AI服務忙碌或已達使用上限。你的輸入已儲存，請稍後重試。',
  },
  ja: {
    setup:
      'OpenAIにはまだ接続されていません。今はガイド付きの例で画面を試せます。接続後は自分の課題を確認できます。入力は保存されています。',
    auth: 'AI接続が承認されませんでした。サーバーのAPIキーとモデルへのアクセス権を確認してください。入力は保存されています。',
    busy: 'AIサービスが混雑しているか、利用上限に達しました。入力は保存されています。しばらくしてから再試行してください。',
  },
  ko: {
    setup:
      '아직 OpenAI에 연결되지 않았습니다. 지금은 안내 예시로 화면을 시험할 수 있고, 연결 후에는 자신의 과제를 검토할 수 있습니다. 입력은 저장되었습니다.',
    auth: 'AI 연결이 승인되지 않았습니다. 서버의 API 키와 모델 접근 권한을 확인하세요. 입력은 저장되었습니다.',
    busy: 'AI 서비스가 혼잡하거나 사용 한도에 도달했습니다. 입력은 저장되었습니다. 나중에 다시 시도하세요.',
  },
  es: {
    setup:
      'OpenAI aún no está conectado. Puedes probar la interfaz con el ejemplo guiado; al conectarlo, podrás revisar tu propio trabajo. Tus datos están guardados.',
    auth: 'La conexión con la IA no fue autorizada. Revisa la clave API del servidor y el acceso al modelo. Tus datos están guardados.',
    busy: 'El servicio de IA está ocupado o alcanzó su límite de uso. Tus datos están guardados; vuelve a intentarlo más tarde.',
  },
  fr: {
    setup:
      'OpenAI n’est pas encore connecté. Vous pouvez tester l’interface avec l’exemple guidé ; une fois connecté, il pourra examiner votre propre devoir. Vos saisies sont enregistrées.',
    auth: 'La connexion à l’IA n’a pas été autorisée. Vérifiez la clé API du serveur et l’accès au modèle. Vos saisies sont enregistrées.',
    busy: 'Le service d’IA est occupé ou sa limite d’utilisation est atteinte. Vos saisies sont enregistrées ; réessayez plus tard.',
  },
  de: {
    setup:
      'OpenAI ist noch nicht verbunden. Du kannst die Oberfläche jetzt mit dem angeleiteten Beispiel testen. Nach dem Verbinden kann OpenAI deine eigene Aufgabe prüfen. Deine Eingaben sind gespeichert.',
    auth: 'Die KI-Verbindung wurde nicht autorisiert. Prüfe den API-Schlüssel des Servers und den Modellzugriff. Deine Eingaben sind gespeichert.',
    busy: 'Der KI-Dienst ist ausgelastet oder sein Nutzungslimit wurde erreicht. Deine Eingaben sind gespeichert; versuche es später erneut.',
  },
  pt: {
    setup:
      'OpenAI ainda não está conectado. Você pode testar a interface com o exemplo guiado; após a conexão, será possível analisar seu próprio trabalho. Suas entradas estão salvas.',
    auth: 'A conexão com a IA não foi autorizada. Verifique a chave API do servidor e o acesso ao modelo. Suas entradas estão salvas.',
    busy: 'O serviço de IA está ocupado ou atingiu o limite de uso. Suas entradas estão salvas; tente novamente mais tarde.',
  },
  ru: {
    setup:
      'OpenAI ещё не подключён. Сейчас можно проверить интерфейс на примере с подсказками; после подключения можно будет разобрать своё задание. Введённые данные сохранены.',
    auth: 'Подключение к ИИ не авторизовано. Проверьте ключ API сервера и доступ к модели. Введённые данные сохранены.',
    busy: 'Сервис ИИ занят или достигнут лимит использования. Введённые данные сохранены; повторите попытку позже.',
  },
  it: {
    setup:
      'OpenAI non è ancora connesso. Puoi provare l’interfaccia con l’esempio guidato; dopo la connessione, potrà esaminare la tua consegna. I dati inseriti sono salvati.',
    auth: 'La connessione all’IA non è stata autorizzata. Controlla la chiave API del server e l’accesso al modello. I dati inseriti sono salvati.',
    busy: 'Il servizio IA è occupato o ha raggiunto il limite di utilizzo. I dati inseriti sono salvati; riprova più tardi.',
  },
  ar: {
    setup:
      'لم يتم الاتصال بـOpenAI بعد. يمكنك الآن تجربة الواجهة باستخدام المثال الإرشادي؛ وبعد الاتصال، يمكنه مراجعة تكليفك الخاص. مدخلاتك محفوظة.',
    auth: 'لم يُصرّح باتصال الذكاء الاصطناعي. تحقّق من مفتاح API على الخادم ومن صلاحية الوصول إلى النموذج. مدخلاتك محفوظة.',
    busy: 'خدمة الذكاء الاصطناعي مشغولة أو بلغت حد الاستخدام. مدخلاتك محفوظة؛ حاول مرة أخرى لاحقًا.',
  },
};
const knownProviderErrors = new Map();
for (const strings of Object.values(PREVIEW_LOCALES))
  for (const [group, value] of Object.entries(strings.errors))
    knownProviderErrors.set(value, group);
for (const strings of Object.values(errorDetails))
  for (const [group, value] of Object.entries(strings)) knownProviderErrors.set(value, group);
const legacySetupKey =
  'OpenAI is not configured. Add OPENAI_API_KEY to the local server’s .env file and restart the server, or use the guided example.';
knownProviderErrors.set(legacySetupKey, 'setup');
for (const values of Object.values(TRANSLATIONS))
  knownProviderErrors.set(values[keyIndex.get(legacySetupKey)], 'setup');
const translatedKeys = new Map();
for (const values of Object.values(TRANSLATIONS))
  values.forEach((value, index) => translatedKeys.set(value, EN[index]));
function errorText(group) {
  if (['setup', 'auth'].includes(group)) return productText(locale, 2);
  return PREVIEW_LOCALES[locale]?.errors[group] || errorDetails[locale]?.[group];
}
export function friendlyError(message, code = '') {
  const value = String(message || '');
  const group = Object.hasOwn(errorGroups, code)
    ? errorGroups[code]
    : knownProviderErrors.get(value);
  if (group) return errorText(group);
  for (const lang of LANGUAGES)
    for (const key of [2, 3])
      if (value === productText(lang.code, key)) return productText(locale, key);
  if (
    /OPENAI_API_KEY|API key|\.env|local server|server is unavailable|Restart it|live OpenAI/i.test(
      value,
    )
  )
    return productText(locale, 2);

  if (translatedKeys.has(value)) return t(translatedKeys.get(value));
  if (keyIndex.has(value) || patterns.some((p) => p.regex.test(value))) return translateText(value);
  if (/OPENAI_API_KEY|API key|not configured|no key/i.test(value)) return errorText('setup');
  if (/preview.*(brief|assignment|guided)|sample.*assignment/i.test(value))
    return t(
      'The sample preview works with the guided example assignment. Use the guided example or switch to live OpenAI for your own brief.',
    );
  if (/out of date|latest information|review.*before|Confirm.*brief|stale/i.test(value))
    return t('The latest changes need another review before you can continue.');
  if (/fetch|network|ECONNREFUSED|server is unavailable/i.test(value))
    return t(
      'The local server is unavailable. Restart it, then try again. Your saved project is still here.',
    );
  return t('Something went wrong. Your work is saved. Try again.');
}
applyDocumentLanguage();
