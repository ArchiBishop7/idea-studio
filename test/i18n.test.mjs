import test from 'node:test';
import assert from 'node:assert/strict';
import { EN as english, TRANSLATIONS as dictionaries } from '../public/locale-catalog.mjs';
import {
  LANGUAGES,
  getLocale,
  getLanguage,
  setLocale,
  t,
  translateText,
  localize,
  applyDocumentLanguage,
} from '../public/i18n.mjs';

const expectedLocales = [
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'ru',
  'it',
  'ar',
];
const placeholders = (text) =>
  [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

async function withGlobals(values, run) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    return await run();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
let freshImport = 0;
async function initialLanguage(languages, saved = null) {
  return withGlobals(
    {
      navigator: { languages },
      localStorage: { getItem: () => saved, setItem() {} },
      document: undefined,
    },
    async () => {
      const url = new URL('../public/i18n.mjs', import.meta.url);
      url.searchParams.set('locale-test', String(++freshImport));
      return (await import(url.href)).getLocale();
    },
  );
}

test('all twelve supported locales have a complete nonempty dictionary with the same placeholders', () => {
  assert.deepEqual(
    LANGUAGES.map((language) => language.code),
    expectedLocales,
  );
  assert.equal(new Set(LANGUAGES.map((language) => language.code)).size, 12);
  assert.ok(english.includes('Clue summary'));
  assert.ok(!english.some((key) => key.startsWith('Your original words and AI interpretations')));
  for (const language of LANGUAGES) {
    assert.ok(language.name.trim(), `${language.code}: native name is missing`);
    assert.ok(language.label.trim(), `${language.code}: model language label is missing`);
    const entries = language.code === 'en' ? english : dictionaries[language.code];
    assert.ok(Array.isArray(entries), `${language.code}: dictionary is missing`);
    assert.equal(entries.length, english.length, `${language.code}: dictionary is incomplete`);
    entries.forEach((entry, index) => {
      assert.equal(typeof entry, 'string', `${language.code}[${index}] must be a string`);
      assert.ok(entry.trim(), `${language.code}[${index}] is empty`);
      assert.ok(
        !entry.includes('\uFFFD'),
        `${language.code}[${index}] contains a broken character`,
      );
      assert.deepEqual(
        placeholders(entry),
        placeholders(english[index]),
        `${language.code}[${index}] changed placeholders`,
      );
    });
  }
});

test('critical controls and recovery messages use each selected language instead of English fallback', () => {
  const critical = [
    'Confirm brief',
    'Start exploring',
    'Continue exploring',
    'View directions',
    'Choose this direction',
    'What’s saved',
    'Choose your language',
    'The latest changes need another review before you can continue.',
  ];
  for (const { code } of LANGUAGES) {
    assert.equal(setLocale(code), true);
    assert.equal(getLocale(), code);
    assert.equal(getLanguage().code, code);
    for (const key of critical) {
      const index = english.indexOf(key);
      assert.notEqual(index, -1, `Missing source key: ${key}`);
      const expected = code === 'en' ? english[index] : dictionaries[code]?.[index];
      assert.equal(t(key), expected, `${code}: unexpected fallback for ${key}`);
      if (code !== 'en')
        assert.notEqual(t(key), key, `${code}: untranslated critical control ${key}`);
    }
  }
  setLocale('en');
});

test('template values, filenames, model names, and unknown user text are preserved exactly', () => {
  const values = {
    n: 12,
    m: 3,
    k: 7,
    text: 'Continue exploring <私の言葉> {unchanged}',
    file: '原始作业_نسخة A.pdf',
    model: 'model-name-1.2',
    label: 'A student-provided label',
  };
  for (const { code } of LANGUAGES) {
    setLocale(code);
    for (const key of english.filter((key) => placeholders(key).length)) {
      const expectedTemplate = code === 'en' ? key : dictionaries[code]?.[english.indexOf(key)];
      assert.equal(typeof expectedTemplate, 'string', `${code}: missing template ${key}`);
      const expected = expectedTemplate.replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
      assert.equal(t(key, values), expected, `${code}: modified an interpolated value`);
    }
    assert.equal(
      translateText('An original student sentence: XYZ 123 — 未翻译'),
      'An original student sentence: XYZ 123 — 未翻译',
    );
    assert.equal(t('Unknown {text}', { text: values.text }), `Unknown ${values.text}`);
    assert.equal(
      t('Requirement {n}'),
      (code === 'en' ? english : dictionaries[code])[english.indexOf('Requirement {n}')],
    );
  }
  setLocale('en');
});

test('browser language detection normalizes regional tags and Chinese script variants', async () => {
  const cases = [
    [['ja-JP'], 'ja'],
    [['ko-KR'], 'ko'],
    [['es-MX'], 'es'],
    [['FR-ca'], 'fr'],
    [['pt-BR'], 'pt'],
    [['it-IT'], 'it'],
    [['ru-RU'], 'ru'],
    [['ar-EG'], 'ar'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['ZH-hAnT-HK'], 'zh-TW'],
    [['zh-MO'], 'zh-TW'],
    [['zz-ZZ', 'de-AT'], 'de'],
  ];
  for (const [browserLanguages, expected] of cases)
    assert.equal(await initialLanguage(browserLanguages), expected, browserLanguages.join(', '));
});

test('saved supported language wins, unsupported locales fall back safely, and invalid switches preserve the selection', async () => {
  assert.equal(await initialLanguage(['ja-JP'], 'zh-TW'), 'zh-TW');
  assert.equal(await initialLanguage(['ko-KR'], 'unsupported'), 'ko');
  assert.equal(await initialLanguage(['zz-ZZ', 'xx']), 'en');
  assert.equal(await initialLanguage([]), 'en');
  setLocale('fr');
  assert.equal(setLocale('unsupported'), false);
  assert.equal(getLocale(), 'fr');
  assert.equal(setLocale(''), false);
  assert.equal(getLocale(), 'fr');
  setLocale('en');
});

test('Arabic sets RTL and every other language restores LTR with a localized document title', async () => {
  const document = { documentElement: { lang: '', dir: '' }, title: '' };
  await withGlobals({ document }, async () => {
    for (const { code } of LANGUAGES) {
      setLocale('ar');
      assert.equal(document.documentElement.dir, 'rtl');
      setLocale(code);
      applyDocumentLanguage();
      assert.equal(document.documentElement.lang, code);
      assert.equal(document.documentElement.dir, code === 'ar' ? 'rtl' : 'ltr');
      assert.equal(document.title, t('A little space to find your direction — Idea Studio'));
      assert.ok(document.title.includes('Idea Studio'));
    }
  });
  setLocale('en');
});

// A minimal DOM fixture exercises the public localizer without launching a browser.
class TestElement {
  constructor(tag, attributes = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this.children = children;
    this.parentElement = null;
    for (const child of children) child.parentElement = this;
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  querySelectorAll() {
    return this.children.flatMap((child) =>
      child instanceof TestElement ? [child, ...child.querySelectorAll('*')] : [],
    );
  }
  closest(selector) {
    const matches = selector.split(',').some((part) => {
      const attribute = /^\[([^\]]+)\]$/.exec(part);
      return attribute ? this.hasAttribute(attribute[1]) : this.tagName.toLowerCase() === part;
    });
    return matches ? this : this.parentElement?.closest(selector) || null;
  }
}
const textNode = (nodeValue) => ({ nodeValue, parentElement: null });
function fixtureDocument(root) {
  return {
    documentElement: { lang: '', dir: '' },
    title: '',
    createTreeWalker() {
      const nodes = [];
      const visit = (element) => {
        for (const child of element.children)
          child instanceof TestElement ? visit(child) : nodes.push(child);
      };
      visit(root);
      let index = 0;
      return { nextNode: () => nodes[index++] || null };
    },
  };
}

test('switching languages localizes chrome while data-raw, source attributes, and written values stay intact', async () => {
  const chromeText = textNode('Continue exploring');
  const rawText = textNode('Continue exploring');
  const nestedRawText = textNode('View directions');
  const writtenText = textNode('Start exploring');
  const skippedText = textNode('English');
  const card = new TestElement(
    'article',
    {
      'data-raw-attrs': 'aria-label',
      'aria-label': 'Continue exploring',
      title: 'Drag to connect or set aside',
    },
    [],
  );
  const textarea = new TestElement(
    'textarea',
    { placeholder: 'A memory, an observation, a half-formed thought…' },
    [writtenText],
  );
  textarea.value = 'My own words: Continue exploring';
  const root = new TestElement('div', {}, [
    new TestElement('button', {}, [chromeText]),
    new TestElement('span', { 'data-raw': '' }, [
      rawText,
      new TestElement('strong', {}, [nestedRawText]),
    ]),
    new TestElement('span', { 'data-i18n-skip': '' }, [skippedText]),
    card,
    textarea,
  ]);
  await withGlobals(
    { document: fixtureDocument(root), Element: TestElement, NodeFilter: { SHOW_TEXT: 4 } },
    async () => {
      for (const code of ['zh-CN', 'ar', 'ja', 'en']) {
        setLocale(code);
        localize(root);
        assert.equal(chromeText.nodeValue, t('Continue exploring'));
        assert.equal(rawText.nodeValue, 'Continue exploring');
        assert.equal(nestedRawText.nodeValue, 'View directions');
        assert.equal(writtenText.nodeValue, 'Start exploring');
        assert.equal(skippedText.nodeValue, 'English');
        assert.equal(textarea.value, 'My own words: Continue exploring');
        assert.equal(card.getAttribute('aria-label'), 'Continue exploring');
        assert.equal(card.getAttribute('title'), t('Drag to connect or set aside'));
        assert.equal(
          textarea.getAttribute('placeholder'),
          t('A memory, an observation, a half-formed thought…'),
        );
      }
    },
  );
  setLocale('en');
});

test('existing rendered count and chosen-direction labels localize without altering their values', () => {
  for (const { code } of LANGUAGES) {
    setLocale(code);
    assert.equal(translateText('  Requirement 12  '), `  ${t('Requirement {n}', { n: 12 })}  `);
    assert.equal(
      translateText('Your chosen direction · High grades'),
      t('Your chosen direction · {label}', { label: t('High grades') }),
    );
    assert.equal(
      translateText('From your brief: “Original English source quote”'),
      t('From your brief: “{text}”', { text: 'Original English source quote' }),
    );
  }
  setLocale('en');
});

// Small frontend source guards shared by real upload/review handlers.
import { textWithoutAttachmentExcerpt, isCurrentBriefSource } from '../public/app.mjs';

test('replacing attachment A with B removes only A auto-extracted text from the next review', () => {
  const excerptA =
    'Extracted from A.pdf (selected requirements, not the full original document)\\nSix still images.';
  const currentTextForB = textWithoutAttachmentExcerpt(excerptA, excerptA);
  assert.equal(currentTextForB, '');
  assert.equal(textWithoutAttachmentExcerpt(currentTextForB, ''), '');
  const excerptB =
    'Extracted from B.pdf (selected requirements, not the full original document)\\nA printed poster.';
  assert.equal(textWithoutAttachmentExcerpt(excerptB, excerptB), '');
  // Prior text is an immutable source record, not erased or rewritten by the guard.
  assert.equal(
    excerptA,
    'Extracted from A.pdf (selected requirements, not the full original document)\\nSix still images.',
  );
});

test('attachment replacement preserves manual text and any user edits to an extracted brief', () => {
  const generated = 'Extracted from A.pdf\\nSix still images.';
  const edited = generated + '\\nInstructor clarification: illustrations are allowed.';
  assert.equal(textWithoutAttachmentExcerpt(edited, generated), edited);
  assert.equal(
    textWithoutAttachmentExcerpt('My own assignment text', ''),
    'My own assignment text',
  );
  assert.equal(textWithoutAttachmentExcerpt('High grades', generated), 'High grades');
  assert.equal(textWithoutAttachmentExcerpt(generated + ' ', generated), generated + ' ');
});

test('brief reviews require both the same text revision and the same attachment source', () => {
  assert.equal(isCurrentBriefSource(12, 3, 12, 3), true);
  assert.equal(
    isCurrentBriefSource(12, 3, 13, 3),
    false,
    'editing the text invalidates a pending review',
  );
  assert.equal(
    isCurrentBriefSource(12, 3, 12, 4),
    false,
    'replacing A with B invalidates A even without a text change',
  );
  assert.equal(isCurrentBriefSource(12, 3, 14, 5), false);
});
