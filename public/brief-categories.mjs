/** Categories organize the brief without changing requirement IDs, evidence, or enforcement. */
export const BRIEF_CATEGORIES = ['requirements', 'submission', 'assessment', 'schedule'];

const wording = (item) => String(item?.text || item?.quote || '').trim();
// These are conservative legacy hints, not a substitute for reading a new brief.
// Match an instruction's function rather than isolated subject words such as PDF or weights.
const assessment =
  /^(?:评分(?:标准|要求|权重|方式|安排)?|评估标准|考核(?:标准|方式)?|成绩构成|分值|占比|权重)\s*[:：]|(?:本(?:次)?作业|本项作业).{0,12}(?:评分|计分|成绩)|(?:按|根据|依据).{0,30}(?:评分|计分)|^(?:assessment|grading|rubric|marking criteria|evaluation criteria|scoring(?: weights?|criteria)?)\s*:|\b(?:grading|assessment|scoring)\s+(?:criteria|weights?|rubric|method)\b|\b(?:is|are|be|will be)\s+(?:graded|marked|assessed)\s+(?:on|by|based|according)\b|\b(?:ungraded|not graded|not separately graded)\b/iu;
const submission =
  /提交|交付|上交|上传|^(?:不得|不能|禁止|不接受)(?:用|使用)?.{0,8}视频|\b(?:submit(?:ted)?|submission|deliverables?|upload(?:ed)?|hand in|turn in)\b|\binclude\b.{0,30}\b(?:artist statement|craft reflection)\b|^no\s+video\b|^(?:file|submission)\s+format\s*:/iu;
const calendarDay =
  '(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const schedule = new RegExp(
  '^(?:完成期限|截止(?:日期|时间)?|期限|交稿日期|完成时间)\\s*(?:[:：]|为|是)|[一二三四五六七八九十\\d]+(?:周|天|小时)内|\\d{1,2}月\\d{1,2}日(?:前|截止)|^(?:deadline|due date|schedule)\\s*:|\\b(?:deadline|due date)\\s+(?:is|on|by)\\b|\\bwithin (?:one|two|three|\\d+) (?:days?|weeks?|hours?)\\b|\\b(?:due|by|before)\\s+(?:on\\s+)?(?:' +
    calendarDay +
    '|\\d{1,2}[/-]\\d{1,2}|\\d{4}[/-]\\d{1,2})\\b',
  'iu',
);
const contentInstruction =
  /^(?:进行|撰写|讲述|叙述|使用|设计|开发|实现|构建|分析|比较|研究|计算|求解|制作|论证|测试|训练)|^(?:present|give|write|build|implement|create|make|design|compose|analyse|analyze|compare|discuss|explain|calculate|solve|conduct|use|develop|train|test)\b/iu;

function signals(text) {
  const parts = text
    .split(/[。；;\n]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const found = {
    assessment: assessment.test(text),
    submission: submission.test(text),
    schedule: schedule.test(text),
  };
  const hasContent = parts.some((part) => contentInstruction.test(part) && !assessment.test(part));
  const count = Object.values(found).filter(Boolean).length;
  // Preserve a mixed older record as a whole. The AI can split a new extraction with its evidence.
  return { ...found, mixed: count > 1 || (hasContent && count > 0) };
}

/** Conservative migration for older unclassified Chinese/English records. New AI results supply a category. */
export function inferBriefCategory(item) {
  const text = wording(item);
  const found = signals(text);
  if (found.mixed) return 'requirements';
  if (found.assessment) return 'assessment';
  if (found.submission) return 'submission';
  if (found.schedule) return 'schedule';
  return 'requirements';
}

/** Short labels for existing records; other languages use the localized UI fallback. */
export function inferBriefLabel(item, category = inferBriefCategory(item)) {
  const text = wording(item);
  const zh = /[\u3400-\u9fff]/u.test(text) && !/[\u3040-\u30ff]/u.test(text);
  const en = /^[\x00-\x7f\s\u2010-\u201f\u2026]+$/u.test(text);
  if (!zh && !en) return '';
  const label = (chinese, english) => (zh ? chinese : english);
  const sourceHeading = () => {
    const source = text.replace(/[。.!;；]+$/u, '').trim();
    return source.length <= (zh ? 30 : 65) ? source : label('作业要求', 'Assignment requirement');
  };
  if (signals(text).mixed) return sourceHeading();
  if (category === 'assessment') {
    if (/不.{0,4}(?:评分|计分)|\b(?:ungraded|not graded|not separately graded)\b/iu.test(text))
      return label('评分安排', 'Grading arrangements');
    return /%|％|权重|占比|\bweight/iu.test(text)
      ? label('评分权重', 'Assessment weights')
      : label('评分标准', 'Assessment criteria');
  }
  if (category === 'schedule') return label('完成期限', 'Deadline');
  if (category === 'submission') {
    if (/PDF/iu.test(text) && /说明|statement|reflection/iu.test(text))
      return label('提交内容', 'Deliverables');
    if (/创作说明|artist statement|craft reflection/iu.test(text))
      return label('创作说明', 'Written statement');
    if (/不得|禁止|不能|不接受|\b(?:no|not|cannot|must not)\b/iu.test(text)) {
      if (/视频|影片|文件格式|\b(?:video|format|pdf|file type)\b/iu.test(text))
        return label('格式限制', 'Format restrictions');
      return sourceHeading();
    }
    if (/PDF|文件|file/iu.test(text)) return label('提交文件', 'Submission file');
    return label('提交内容', 'Deliverables');
  }
  if (/\d\s*[—–-]\s*\d.*(?:图像|图片|照片|插画|images?|photographs?|illustrations?)/iu.test(text))
    return label('图像数量', 'Image count');
  if (
    /(?:讲述|叙述|创作|写).{0,40}(?:故事|叙事)|\b(?:tell|write|create|compose|make)\b.{0,24}\b(?:story|narrative)\b/iu.test(
      text,
    )
  )
    return label('叙事内容', 'Narrative content');
  if (/摄影|插画|拼贴|\b(?:photographs?|illustrations?|collage)\b/iu.test(text))
    return label('表现形式', 'Visual medium');
  if (/原创|\boriginal\s+(?:work|content|images?|photographs?|illustrations?)\b/iu.test(text))
    return label('原创性', 'Originality');
  return sourceHeading();
}
