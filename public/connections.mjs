export function connectionGroups(clues, links) {
  const activeIds = new Set(
    clues.filter((clue) => clue.status === 'active').map((clue) => clue.id),
  );
  const activeLinks = links.filter((link) => activeIds.has(link.a) && activeIds.has(link.b));
  const neighbors = new Map();
  for (const { a, b } of activeLinks) {
    if (!neighbors.has(a)) neighbors.set(a, []);
    if (!neighbors.has(b)) neighbors.set(b, []);
    neighbors.get(a).push(b);
    neighbors.get(b).push(a);
  }

  // Visit each connected group in board order, including indirect connections.
  const visited = new Set();
  const groups = [];
  for (const { id } of clues) {
    if (!neighbors.has(id) || visited.has(id)) continue;
    const clueIds = [id];
    visited.add(id);
    for (const clueId of clueIds) {
      for (const neighbor of neighbors.get(clueId)) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        clueIds.push(neighbor);
      }
    }
    const members = new Set(clueIds);
    const connectionIds = activeLinks.filter((link) => members.has(link.a)).map((link) => link.id);
    groups.push({ clueIds, connectionIds });
  }
  return groups;
}

export function connectionGroupLabel(locale, count, index = 1) {
  const words = {
    en: ['Connection group', 'clues'],
    'zh-CN': ['连接组', '条线索'],
    'zh-TW': ['連接組', '條線索'],
    ja: ['接続グループ', 'ヒント'],
    ko: ['연결 그룹', '단서'],
    es: ['Grupo', 'pistas'],
    fr: ['Groupe', 'pistes'],
    de: ['Gruppe', 'Hinweise'],
    pt: ['Grupo', 'pistas'],
    ru: ['Группа', 'подсказок'],
    it: ['Gruppo', 'indizi'],
    ar: ['مجموعة', 'أفكار'],
  };
  const [group, unit] = words[locale] || words.en;
  return `${group} ${index} · ${count} ${unit}`;
}
