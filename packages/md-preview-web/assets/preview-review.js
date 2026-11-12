(() => {
  const bridge = window.__previewBridge;
  const root = document.querySelector('[data-review-state]');
  if (!bridge?.review || !root) return;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const button = (text, onClick, label) => {
    const element = make('button', 'md-review-button', text);
    element.type = 'button';
    if (label) {
      element.setAttribute('aria-label', label);
      element.title = label;
    }
    element.addEventListener('click', onClick);
    return element;
  };
  const toolbar = make('div', 'md-review-toolbar');
  const overlays = make('div', 'md-review-overlays');
  toolbar.dataset.reviewUi = overlays.dataset.reviewUi = '';
  const presentationToolbar = root.querySelector('.presentation-header-controls');
  // Review navigation is provided by the VS Code title bar and sidebar.
  if (presentationToolbar) toolbar.classList.add('md-review-slide-toolbar');
  document.body.append(overlays);

  const list = make('aside', 'md-review-list');
  list.setAttribute('aria-label', 'Review Comments');
  list.hidden = true;
  const status = make('div', 'md-review-status');
  status.setAttribute('role', 'status');
  const markers = make('div');
  const popover = make('div', 'md-review-popover');
  popover.hidden = true;
  overlays.append(markers, list, popover, status);

  let state;
  let enabled = false;
  let selection;
  let editing;
  let reattach;
  let pressed = false;
  let frame;
  let selectedComment;
  let pending;
  let requestId = 0;
  let commentsVisible = true;
  let hideTimer;

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(() => {
      if (!editing) closePopover();
    }, 5000);
  }

  popover.addEventListener('pointerenter', cancelHide);
  popover.addEventListener('pointerleave', () => { if (selectedComment && !editing) scheduleHide(); });
  popover.addEventListener('focusin', cancelHide);
  popover.addEventListener('focusout', event => {
    if (selectedComment && !editing && !popover.contains(event.relatedTarget)) scheduleHide();
  });

  const listButton = button('☰', () => {
    list.hidden = !list.hidden;
    listButton.setAttribute('aria-expanded', String(!list.hidden));
    if (!list.hidden) renderList();
  }, 'Review Comments');
  listButton.setAttribute('aria-expanded', 'false');
  const runButton = button('✦', () => send('run'), 'Run AI Review');


  function send(action, details = {}) {
    if (pending || !state) return;
    status.textContent = '';
    pending = { requestId: ++requestId, action, version: state.version };
    bridge.review({ action, version: state.version, requestId, ...details });
  }

  function readState() {
    const next = JSON.parse(root.dataset.reviewState);
    if (state && state.version !== next.version) {
      selection = undefined;
      if (!editing && !selectedComment) popover.hidden = true;
    }
    state = next;
    if (selectedComment && !state.comments.some(comment => comment.id === selectedComment)) closePopover();
    if (reattach && !state.comments.some(comment => comment.id === reattach)) reattach = undefined;
    if (state.error) status.textContent = state.error;
    refresh();
  }

  function refresh() {
    const count = state.comments.filter(comment => comment.state === 'open' && comment.includeInAi && comment.placement).length;
    listButton.hidden = state.comments.length === 0;
    const label = count === 1 ? 'Run AI Review for 1 comment' : 'Run AI Review for ' + count + ' comments';
    runButton.hidden = !enabled || !count;
    runButton.title = label;
    runButton.setAttribute('aria-label', label);
    if (!list.hidden) renderList();
    scheduleLayout();
  }

  function scheduleLayout() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      renderMarkers();
      if (editing && selection) position(popover, selection.range);
      else if (selectedComment) {
        const ranges = commentRanges(state.comments.find(comment => comment.id === selectedComment));
        if (ranges.length) position(popover, ranges[0]);
        else if (!editing) popover.hidden = true;
      } else if (selection) position(popover, selection.range);
    });
  }

  function activeContent() {
    return root.querySelector('.presentation-slide.is-active .presentation-slide-body') ?? root.querySelector('main.markdown-body');
  }

  function readSelection() {
    if (pressed || editing || state?.error) return;
    const browserSelection = window.getSelection();
    const content = activeContent();
    if (!content || !browserSelection || browserSelection.isCollapsed || !browserSelection.rangeCount) {
      selection = undefined;
      if (!selectedComment) popover.hidden = true;
      return;
    }
    const range = browserSelection.getRangeAt(0);
    if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return;
    const slices = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let node = walker.root.nodeType === Node.TEXT_NODE ? walker.root : walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.length || !range.intersectsNode(node)) continue;
      const parent = node.parentElement;
      const block = parent?.closest('[data-review-block]');
      if (!block || !content.contains(block)
        || parent.closest('.mermaid, .mermaid-rendered, [data-md-visualization], .katex, [aria-hidden="true"], button')) continue;
      const start = range.startContainer === node ? range.startOffset : 0;
      const end = range.endContainer === node ? range.endOffset : node.length;
      if (start >= end) continue;
      const prefix = document.createRange();
      prefix.selectNodeContents(block);
      prefix.setEnd(node, start);
      const offset = prefix.toString().length;
      const id = block.dataset.reviewBlock;
      const previous = slices.at(-1);
      if (previous?.id === id) previous.end = offset + end - start;
      else slices.push({ id, start: offset, end: offset + end - start });
    }
    if (!slices.length || !range.toString().trim()) {
      selection = undefined;
      if (!selectedComment) popover.hidden = true;
      return;
    }
    selectedComment = undefined;
    selection = { range: range.cloneRange(), slices, version: state.version };
    const action = button(reattach ? 'Reattach Review Comment' : 'Add Review Comment', () => {
      if (reattach) {
        send('reattach', { id: reattach, selection: selection.slices });
      } else {
        openComposer();
      }
    });
    action.addEventListener('pointerdown', event => event.preventDefault());
    popover.replaceChildren(action);
    popover.hidden = false;
    position(popover, selection.range);
  }

  function openComposer(comment) {
    editing = { version: state.version };
    const form = make('form', 'md-review-composer');
    const text = make('textarea');
    text.value = comment?.body ?? '';
    text.required = true;
    text.maxLength = 20_000;
    text.rows = 3;
    text.placeholder = 'Write a review comment';
    text.setAttribute('aria-label', 'Review comment');
    const check = make('input');
    check.type = 'checkbox';
    check.checked = comment?.includeInAi ?? true;
    const label = make('label');
    label.append(check, ' Include in AI review');
    const actions = make('div', 'md-review-actions');
    const submit = button('Save Comment', () => {});
    submit.type = 'submit';
    actions.append(button('Cancel', closePopover), submit);
    form.append(text, label, actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (editing.version !== state.version) {
        status.textContent = 'The preview changed. Close this editor and select the text again.';
        return;
      }
      send(comment ? 'edit' : 'add', {
        id: comment?.id, body: text.value, includeInAi: check.checked, selection: selection?.slices,
      });
    });
    popover.replaceChildren(form);
    popover.hidden = false;
    if (selection) position(popover, selection.range);
    else if (comment) {
      const ranges = commentRanges(comment);
      if (ranges.length) position(popover, ranges[0]);
      else position(popover);
    }
    text.focus({ preventScroll: true });
  }

  function closePopover() {
    cancelHide();
    editing = undefined;
    selection = undefined;
    selectedComment = undefined;
    popover.hidden = true;
  }

  function position(element, range) {
    const rect = range?.getBoundingClientRect();
    if (range && !rect?.height) {
      element.hidden = true;
      return;
    }
    element.style.left = Math.max(8, Math.min(rect?.left ?? window.innerWidth - 320, window.innerWidth - element.offsetWidth - 8)) + 'px';
    const above = (rect?.top ?? 16) - element.offsetHeight - 8;
    const below = (rect?.bottom ?? 16) + 8;
    element.style.top = Math.max(8, Math.min(above > 8 ? above : below, window.innerHeight - element.offsetHeight - 8)) + 'px';
  }

  function commentRanges(comment) {
    if (!comment?.placement) return [];
    return comment.placement.slices.flatMap(slice => {
      const block = root.querySelector('[data-review-block="' + slice.id + '"]');
      if (!block) return [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let start;
      let offset = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const next = offset + node.length;
        if (!start && slice.start < next) start = { node, offset: slice.start - offset };
        if (start && slice.end <= next) {
          const range = document.createRange();
          range.setStart(start.node, start.offset);
          range.setEnd(node, slice.end - offset);
          return [range];
        }
        offset = next;
      }
      return [];
    });
  }

  function renderMarkers() {
    const highlights = [];
    const buttons = [];
    if (!commentsVisible) {
      markers.replaceChildren();
      if (window.CSS?.highlights) CSS.highlights.delete('markdown-review');
      return;
    }
    const usedPositions = new Map();
    for (const comment of state.comments) {
      const ranges = commentRanges(comment);
      const rect = ranges[0]?.getClientRects()[0];
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
      highlights.push(...ranges);
      const marker = button('', () => openComment(comment), 'Open review comment: ' + comment.body);
      marker.addEventListener('pointerenter', () => { cancelHide(); if (!editing) openComment(comment, false); });
      marker.addEventListener('pointerleave', () => { if (!editing) scheduleHide(); });
      marker.addEventListener('focus', () => { cancelHide(); if (!editing) openComment(comment, false); });
      marker.addEventListener('blur', event => { if (!popover.contains(event.relatedTarget) && !editing) scheduleHide(); });
      marker.classList.add('md-review-marker');
      marker.classList.toggle('is-revised', comment.state === 'revised');
      const x = Math.max(2, Math.min(rect.right + 2, window.innerWidth - 22));
      const y = Math.max(2, rect.top - 8);
      const key = Math.round(x) + ':' + Math.round(y);
      const stack = usedPositions.get(key) ?? 0;
      usedPositions.set(key, stack + 1);
      marker.style.left = x + 'px';
      marker.style.top = Math.min(y + stack * 19, window.innerHeight - 22) + 'px';
      buttons.push(marker);
    }
    markers.replaceChildren(...buttons);
    if (window.Highlight && window.CSS?.highlights) CSS.highlights.set('markdown-review', new Highlight(...highlights));
  }

  function openComment(comment, focus = true) {
    closePopover();
    selectedComment = comment.id;
    const ranges = commentRanges(comment);
    const block = ranges[0]?.startContainer.parentElement;
    if (block) {
      const slide = block.closest('.presentation-slide');
      if (slide && !slide.classList.contains('is-active')) {
        root.querySelector('[data-slide-target="' + slide.dataset.slideIndex + '"]')?.click();
      }
      block.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const content = commentCard(comment, false);
    popover.replaceChildren(content, button('Close', closePopover));
    popover.hidden = false;
    position(popover, ranges[0]);
    if (focus) popover.querySelector('button')?.focus({ preventScroll: true });
  }

  function renderList() {
    const header = make('div', 'md-review-actions');
    header.append(make('strong', '', 'Review Comments'), button('Close', () => listButton.click()));
    list.replaceChildren(header, ...state.comments.map(comment => commentCard(comment, true)));
  }

  function commentCard(comment, inList) {
    const card = make('div', 'md-review-card');
    const lines = comment.placement ?? comment.originalLines;
    const location = (lines.startLine === lines.endLine ? 'Line ' + lines.startLine : 'Lines ' + lines.startLine + '–' + lines.endLine);
    const caption = location + ' · ' + (comment.state === 'open' ? 'Open' : 'Revised') + (comment.placement ? '' : ' · Detached');
    card.append(inList ? button(caption, () => openComment(comment)) : make('small', '', caption));
    card.append(make('blockquote', '', comment.originalQuote), make('p', '', comment.body));
    const check = make('input');
    check.type = 'checkbox';
    check.checked = comment.includeInAi;
    check.addEventListener('change', () => send('toggle', { id: comment.id, includeInAi: check.checked }));
    const label = make('label');
    label.append(check, ' Include in AI review');
    const actions = make('div', 'md-review-actions');
    actions.append(
      button('Edit', () => {
        closePopover();
        selectedComment = comment.id;
        openComposer(comment);
      }),
      button(comment.state === 'open' ? 'Mark Revised' : 'Reopen', () =>
        send(comment.state === 'open' ? 'revise' : 'reopen', { id: comment.id })),
      button('Resolve', () => send('resolve', { id: comment.id })),
      button('Reattach', () => {
        closePopover();
        reattach = comment.id;
        status.textContent = 'Select the text to reattach this comment. Press Escape to cancel.';
      }),
    );
    card.append(label, actions);
    return card;
  }

  window.addEventListener('message', ({ data }) => {
    if (data?.command === 'reviewVisibility') {
      commentsVisible = data.visible !== false;
      if (!commentsVisible && selectedComment && !editing) closePopover();
      refresh();
    } else if (data?.command === 'revealReviewComment') {
      const comment = state.comments.find(item => item.id === data.id);
      if (comment) openComment(comment);
    } else if (data?.command === 'reviewAvailability') {
      enabled = data.enabled === true;
      refresh();
    } else if (data?.command === 'reviewResult' && pending?.requestId === data.requestId) {
      const action = pending.action;
      pending = undefined;
      if (data.error) status.textContent = data.error;
      else if (['add', 'edit', 'reattach', 'resolve', 'reopen', 'revise', 'toggle'].includes(action)) {
        reattach = undefined;
        window.getSelection()?.removeAllRanges();
        closePopover();
      }
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest?.('[data-review-ui]')) return;
    pressed = true;
  });
  window.addEventListener('pointerup', () => {
    pressed = false;
    requestAnimationFrame(readSelection);
  });
  window.addEventListener('pointercancel', () => { pressed = false; });
  window.addEventListener('blur', () => { pressed = false; });
  document.addEventListener('selectionchange', readSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (reattach || !popover.hidden || !list.hidden)) {
      event.stopPropagation();
      reattach = undefined;
      status.textContent = '';
      closePopover();
      if (!list.hidden) listButton.click();
      window.getSelection()?.removeAllRanges();
    }
  });
  document.addEventListener('md-document-updated', readState);
  document.addEventListener('md-slide-changed', scheduleLayout);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('scroll', scheduleLayout, true);
  readState();
  bridge.review({ action: 'ready' });
})();
