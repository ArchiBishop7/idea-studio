import { combinationCopy } from './combination-i18n.mjs';
import { connectionGroups } from './connections.mjs';
let cleanup = () => {};
export function mountBoard({
  positions,
  links,
  onMove,
  onConnect,
  onAside,
  onLeaveGroup,
  onDisconnect,
}) {
  cleanup();
  const board = document.querySelector('.clue-grid');
  if (!board) return;
  const cards = [...board.querySelectorAll('[data-clue]')];
  if (!cards.length) return;
  const initial = new Map(cards.map((c, i) => [c, i]));
  cards.sort(
    (a, b) =>
      (positions[a.dataset.clue]?.order ?? initial.get(a)) -
      (positions[b.dataset.clue]?.order ?? initial.get(b)),
  );
  const members = new Set(links.flatMap((l) => [l.a, l.b]));
  cards.sort((a, b) => Number(members.has(b.dataset.clue)) - Number(members.has(a.dataset.clue)));
  cards.forEach((c) => {
    c.style.gridColumn = '';
    board.append(c);
  });
  const firstOutside = cards.find((c) => !members.has(c.dataset.clue));
  board.classList.add('pinboard-canvas');
  board.querySelector('.round-chalk')?.remove();
  const chalk = document.createElement('div');
  chalk.className = 'round-chalk';
  chalk.innerHTML = '<span class="round-chalk-label"></span>';
  board.append(chalk);
  const tip = document.createElement('div');
  tip.className = 'round-drop-message';
  tip.hidden = true;
  document.body.append(tip);
  function allowed(a, b) {
    return !members.size || members.has(a) || members.has(b);
  }
  function frameGroup() {
    const selected = cards.filter((c) => members.has(c.dataset.clue));
    chalk.hidden = selected.length < 2;
    if (chalk.hidden) return;
    const r = board.getBoundingClientRect(),
      rs = selected.map((c) => c.getBoundingClientRect());
    const left = Math.min(...rs.map((x) => x.left)) - r.left + board.scrollLeft - 12,
      top = Math.min(...rs.map((x) => x.top)) - r.top + board.scrollTop - 20;
    Object.assign(chalk.style, {
      left: left + 'px',
      top: top + 'px',
      width: Math.max(...rs.map((x) => x.right)) - r.left + board.scrollLeft - left + 12 + 'px',
      height: Math.max(...rs.map((x) => x.bottom)) - r.top + board.scrollTop - top + 12 + 'px',
    });
    chalk.firstElementChild.textContent = localized(
      'count',
      '本轮探索 · {n} 条线索',
      'This round · {n} clues',
      selected.length,
    );
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('red-threads');
  svg.setAttribute('aria-hidden', 'true');
  board.prepend(svg);
  let gesture = null,
    frame = 0,
    ghost = null,
    scrollFrame = 0;
  board.dataset.density = cards.length > 6 ? 'dense' : cards.length > 3 ? 'compact' : 'roomy';
  board.style.setProperty(
    '--card-min',
    cards.length > 6 ? '210px' : cards.length > 3 ? '235px' : '270px',
  );
  function localized(key, zh, en, n) {
    return combinationCopy(document.documentElement.lang, key, zh, en, n);
  }
  function removeGhost() {
    ghost?.remove();
    ghost = null;
  }
  function floatCard(e) {
    if (!ghost) {
      const r = gesture.card.getBoundingClientRect();
      ghost = gesture.card.cloneNode(true);
      ghost.removeAttribute('data-clue');
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      ghost.className += ' drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      gesture.offsetX = gesture.startX - r.left;
      gesture.offsetY = gesture.startY - r.top;
      document.body.append(ghost);
      gesture.card.classList.add('drag-origin');
    }
    ghost.style.left = e.clientX - gesture.offsetX + 'px';
    ghost.style.top = e.clientY - gesture.offsetY + 'px';
  }
  const cardById = (id) => cards.find((c) => c.dataset.clue === id);
  function point(c) {
    const p = c.querySelector('.board-pin').getBoundingClientRect(),
      r = board.getBoundingClientRect();
    return {
      x: p.left + p.width / 2 - r.left - board.clientLeft + board.scrollLeft,
      y: p.top + p.height / 2 - r.top - board.clientTop + board.scrollTop,
    };
  }
  function path(a, b) {
    return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 24} ${b.x} ${b.y}`;
  }
  function draw() {
    const available = Math.max(
      1,
      Math.floor((board.clientWidth - 64 + 18) / (cards.length > 6 ? 228 : 253)),
    );
    const count = available;
    if (firstOutside)
      firstOutside.style.gridColumn = members.size > count && members.size % count !== 0 ? '1' : '';
    const columns = `repeat(${Math.max(1, count)},minmax(0,1fr))`;
    if (board.style.gridTemplateColumns !== columns) board.style.gridTemplateColumns = columns;
    frameGroup();
    svg.setAttribute('width', board.clientWidth);
    svg.setAttribute('height', board.scrollHeight);
    svg.replaceChildren();
    for (const group of connectionGroups(
      cards.map((c) => ({ id: c.dataset.clue, status: 'active' })),
      links,
    )) {
      const points = group.clueIds.map((id) => point(cardById(id)));
      let lane = 0;
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const link = links.find(
            (l) =>
              (l.a === group.clueIds[i] && l.b === group.clueIds[j]) ||
              (l.b === group.clueIds[i] && l.a === group.clueIds[j]),
          );
          if (!link) continue;
          const a = points[i],
            b = points[j],
            offset = 14 + (lane++ % 6) * 7;
          const ay = Math.max(7, a.y - offset),
            by = Math.max(7, b.y - offset);
          const p = document.createElementNS(svg.namespaceURI, 'path');
          if (Math.abs(a.y - b.y) < 4) {
            p.setAttribute(
              'd',
              `M ${a.x} ${a.y} C ${a.x} ${ay} ${a.x + 8} ${ay} ${a.x + 14} ${ay} L ${b.x - 14} ${ay} Q ${b.x} ${ay} ${b.x} ${b.y}`,
            );
          } else {
            // The outside gutter is clear even when intermediate rows are full.
            const gutter = 8 + (lane % 5) * 3;
            p.setAttribute(
              'd',
              `M ${a.x} ${a.y} Q ${a.x} ${ay} ${a.x - 10} ${ay} L ${gutter + 5} ${ay} Q ${gutter} ${ay} ${gutter} ${ay + 5} L ${gutter} ${by - 5} Q ${gutter} ${by} ${gutter + 5} ${by} L ${b.x - 10} ${by} Q ${b.x} ${by} ${b.x} ${b.y}`,
            );
          }
          p.dataset.a = group.clueIds[i];
          p.dataset.b = group.clueIds[j];
          svg.append(p);
          const hit = p.cloneNode();
          hit.classList.add('thread-hit');
          hit.dataset.linkId = link.id;
          const title = document.createElementNS(svg.namespaceURI, 'title');
          title.textContent = localized('cut', '双击取消这条连接', 'Double-click to disconnect');
          hit.append(title);
          svg.append(hit);
        }
    }
    if (gesture?.type === 'connect' && gesture.moved) {
      const p = document.createElementNS(svg.namespaceURI, 'path'),
        r = board.getBoundingClientRect();
      p.setAttribute(
        'd',
        path(point(gesture.card), {
          x: gesture.cx - r.left + board.scrollLeft,
          y: gesture.cy - r.top + board.scrollTop,
        }),
      );
      p.classList.add('thread-preview');
      svg.append(p);
    }
  }
  function autoScroll() {
    if (!gesture?.moved) {
      scrollFrame = 0;
      return;
    }
    const r = board.getBoundingClientRect(),
      y = gesture.cy,
      x = gesture.cx,
      edge = 64;
    let speed = 0;
    if (x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20) {
      if (y < r.top + edge) speed = -Math.min(18, (18 * (r.top + edge - y)) / edge);
      else if (y > r.bottom - edge) speed = Math.min(18, (18 * (y - r.bottom + edge)) / edge);
    }
    const old = board.scrollTop;
    board.scrollTop += speed;
    board.dataset.scrolling = board.scrollTop !== old ? (speed < 0 ? 'up' : 'down') : '';
    if (board.scrollTop !== old) {
      const other = target({ clientX: x, clientY: y })?.closest('[data-clue]');
      cards.forEach((c) => c.classList.toggle('reorder-target', c === other && c !== gesture.card));
      draw();
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  function target(e) {
    return document.elementFromPoint(e.clientX, e.clientY);
  }
  function clear() {
    tip.hidden = true;
    cards.forEach((c) => c.classList.remove('drop-blocked'));
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    board.dataset.scrolling = '';
    removeGhost();
    cards.forEach((c) => c.classList.remove('reorder-target', 'board-selected', 'drag-origin'));
    document.querySelector('[data-drop-shelf]')?.classList.remove('drag-over');
  }
  function reorder(c, other) {
    const i = cards.indexOf(c),
      j = cards.indexOf(other);
    if (i < 0 || j < 0 || i === j) return;
    cards.splice(i, 1);
    cards.splice(j, 0, c);
    cards.forEach((card, n) => {
      board.append(card);
      positions[card.dataset.clue] = { order: n };
      onMove(card.dataset.clue, { order: n });
    });
    draw();
  }
  function down(e) {
    if (e.button !== 0 || document.querySelector('#main')?.inert) return;
    const c = e.target.closest('[data-clue]');
    if (!c || !board.contains(c) || c.querySelector('button')?.disabled) return;
    const pin = e.target.closest('.board-pin');
    if (!pin && e.target.closest('button,input,textarea,summary,a')) return;
    e.preventDefault();
    gesture = {
      card: c,
      type: pin ? 'connect' : 'move',
      startX: e.clientX,
      startY: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      moved: false,
      capture: pin || c,
    };
    gesture.capture.setPointerCapture(e.pointerId);
    c.classList.add('board-selected');
  }
  function move(e) {
    if (!gesture) return;
    gesture.cx = e.clientX;
    gesture.cy = e.clientY;
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) < 5 && !gesture.moved)
      return;
    gesture.moved = true;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
    if (gesture.type === 'move') floatCard(e);
    const other = target(e)?.closest('[data-clue]');
    cards.forEach((c) => {
      const hit = c === other && c !== gesture.card;
      c.classList.toggle('reorder-target', hit);
      const ok = allowed(gesture.card.dataset.clue, c.dataset.clue);
      c.classList.toggle('drop-blocked', hit && !ok);
      c.dataset.dropLabel = ok
        ? localized('drop', '松手加入本轮探索', 'Release to explore together')
        : localized('blocked', '已有组合，请先重新组合', 'Reset the current combination first');
    });
    document
      .querySelector('[data-drop-shelf]')
      ?.classList.toggle('drag-over', !!target(e)?.closest('[data-drop-shelf]'));
    const inside =
      members.size &&
      !members.has(gesture.card.dataset.clue) &&
      (() => {
        const r = chalk.getBoundingClientRect();
        return (
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        );
      })();
    tip.hidden = !other && !inside;
    tip.textContent =
      other && !allowed(gesture.card.dataset.clue, other.dataset.clue)
        ? localized(
            'blocked',
            '本轮已有探索组合。请加入当前组，或先点“重新组合”。',
            'Join the current combination, or reset it first.',
          )
        : localized('drop', '松手加入本轮探索', 'Release to join this round');
    tip.style.left = Math.min(e.clientX + 18, window.innerWidth - 330) + 'px';
    tip.style.top = Math.max(10, e.clientY - 65) + 'px';
    draw();
  }
  function end(e) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    clear();
    if (g.capture.hasPointerCapture(e.pointerId)) g.capture.releasePointerCapture(e.pointerId);
    if (g.moved) {
      g.card.dataset.suppressClick = 'true';
      setTimeout(() => delete g.card.dataset.suppressClick, 0);
      const el = target(e);
      let other = el?.closest('[data-clue]');
      if (!other && members.size) {
        const r = chalk.getBoundingClientRect();
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        )
          other = cards.find((c) => members.has(c.dataset.clue));
      }
      if (other && !allowed(g.card.dataset.clue, other.dataset.clue)) {
        draw();
        return;
      }
      if (g.type === 'connect') {
        if (other && other !== g.card) onConnect(g.card.dataset.clue, other.dataset.clue);
      } else if (el?.closest('[data-drop-shelf]')) onAside(g.card.dataset.clue);
      else if (other && other !== g.card) onConnect(g.card.dataset.clue, other.dataset.clue);
    }
    draw();
  }
  function cancel() {
    gesture = null;
    clear();
    draw();
  }
  function pinClick(e) {
    if (e.target.closest('.board-pin') && e.detail > 0) {
      e.stopPropagation();
    }
  }
  function pinDoubleClick(e) {
    if (
      document.querySelector('#main')?.inert ||
      cards.some((c) => c.querySelector('button')?.disabled)
    )
      return;
    const thread = e.target.closest('[data-link-id]');
    if (thread) {
      e.preventDefault();
      e.stopPropagation();
      onDisconnect?.(thread.dataset.linkId);
      return;
    }
    const pin = e.target.closest('.board-pin');
    if (!pin || pin.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
    onLeaveGroup?.(pin.closest('[data-clue]').dataset.clue);
  }
  cards.forEach((c) => {
    const pin = c.querySelector('.board-pin');
    pin.title = localized(
      'pin',
      '拖动红钉子建立连接；双击将这张卡移出连接组',
      'Drag to connect; double-click to remove this card from its group',
    );
  });
  function keys(e) {
    if (
      !e.target.matches('.clue-top') ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) ||
      e.target.querySelector('button')?.disabled
    )
      return;
    e.preventDefault();
    const c = e.target.closest('[data-clue]'),
      i = cards.indexOf(c),
      cols = getComputedStyle(board).gridTemplateColumns.split(' ').length;
    const delta =
      e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
    const other = cards[i + delta];
    if (other) reorder(c, other);
    e.target.focus();
  }
  const groupRoot = document.querySelector('#clue-board');
  function highlightGroup(el) {
    const ids = el ? JSON.parse(el.dataset.groupClues) : [];
    cards.forEach((c) => c.classList.toggle('group-highlight', ids.includes(c.dataset.clue)));
    svg
      .querySelectorAll('path')
      .forEach((p) =>
        p.classList.toggle(
          'group-thread-highlight',
          ids.includes(p.dataset.a) && ids.includes(p.dataset.b),
        ),
      );
  }
  function highlightThread(hit) {
    const ids = hit ? [hit.dataset.a, hit.dataset.b] : [];
    svg.classList.toggle('has-active-thread', !!hit);
    cards.forEach((c) => c.classList.toggle('thread-endpoint', ids.includes(c.dataset.clue)));
    svg
      .querySelectorAll('path:not(.thread-hit)')
      .forEach((p) =>
        p.classList.toggle(
          'active-thread',
          !!hit && p.dataset.a === hit.dataset.a && p.dataset.b === hit.dataset.b,
        ),
      );
  }
  function groupOver(e) {
    highlightGroup(e.target.closest('[data-group-clues]'));
    highlightThread(e.target.closest('.thread-hit'));
  }
  function groupOut(e) {
    highlightGroup(e.relatedTarget?.closest?.('[data-group-clues]'));
    highlightThread(e.relatedTarget?.closest?.('.thread-hit'));
  }
  const groupHandlers = {
    pointerover: groupOver,
    pointerout: groupOut,
    focusin: groupOver,
    focusout: groupOut,
  };
  Object.entries(groupHandlers).forEach(([name, fn]) => groupRoot?.addEventListener(name, fn));
  const handlers = {
    pointerdown: down,
    pointermove: move,
    pointerup: end,
    pointercancel: cancel,
    keydown: keys,
    click: pinClick,
    dblclick: pinDoubleClick,
  };
  Object.entries(handlers).forEach(([name, fn]) => board.addEventListener(name, fn));
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  observer.observe(board);
  cards.forEach((c) => observer.observe(c));
  draw();
  cleanup = () => {
    tip.remove();
    Object.entries(groupHandlers).forEach(([name, fn]) => groupRoot?.removeEventListener(name, fn));
    clear();
    observer.disconnect();
    cancelAnimationFrame(frame);
    Object.entries(handlers).forEach(([name, fn]) => board.removeEventListener(name, fn));
  };
}
