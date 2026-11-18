// Display translations never overwrite the canonical project or student records.
export function generatedTextFields(project) {
  const fields = [];
  const add = (path, value) => {
    if (typeof value === 'string' && value.trim())
      fields.push({ key: JSON.stringify(path), text: value });
  };
  const record = (path, value, keys) => {
    for (const key of keys) add([...path, key], value?.[key]);
  };
  const question = (path, value) => {
    record(path, value, ['text']);
    value?.options?.forEach((text, i) => add([...path, 'options', i], text));
  };
  const directions = (path, items) =>
    items?.forEach((value, i) =>
      record([...path, i], value, ['title', 'priority', 'summary', 'fit', 'tradeoff']),
    );
  question(['question'], project.question);
  project.clues?.forEach((value, i) => {
    if (value.origin === 'ai') record(['clues', i], value, ['title', 'detail']);
  });
  directions(['directions'], project.directions);
  project.directionHistory?.forEach((value, i) =>
    directions(['directionHistory', i, 'directions'], value.directions),
  );
  project.directionQuestions?.forEach((value, i) =>
    record(['directionQuestions', i], value, ['answer', 'directionTitle']),
  );
  record(['review'], project.review, ['reason']);
  project.review?.issues?.forEach((value, i) =>
    record(['review', 'issues', i], value, ['message']),
  );
  return fields;
}

export function translatedProject(project, sourceFields, translations) {
  if (!Array.isArray(translations) || translations.length !== sourceFields.length)
    throw new Error('Incomplete translation');
  const byKey = new Map();
  for (const item of translations) {
    if (
      !item ||
      typeof item.key !== 'string' ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      byKey.has(item.key)
    )
      throw new Error('Invalid translation');
    byKey.set(item.key, item.text);
  }
  // Re-enumerate eligible fields: never accept arbitrary model-provided paths.
  const eligible = new Map(generatedTextFields(project).map((item) => [item.key, item.text]));
  const result = structuredClone(project);
  for (const field of sourceFields) {
    if (!eligible.has(field.key) || eligible.get(field.key) !== field.text || !byKey.has(field.key))
      throw new Error('Translation no longer matches this project');
    const path = JSON.parse(field.key);
    let parent = result;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)] = byKey.get(field.key);
  }
  return result;
}
