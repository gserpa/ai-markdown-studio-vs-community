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
  const iconButton = (path, label, onClick) => {
    const element = button('', onClick, label);
    element.classList.add('md-review-icon-button');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    element.append(svg);
    return element;
  };
  const icons = {
    resolve: 'M5 12l4 4L19 6',
    reopen: 'M4 10V4m0 6h6M4 10a8 8 0 1 1 1 7',
    delete: 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7',
    reattach: 'M8 12l6-6a4 4 0 0 1 6 6l-8 8a6 6 0 0 1-8-8l8-8',
  };
  const toolbar = make('div', 'md-review-toolbar');
  const overlays = make('div', 'md-review-overlays');
  toolbar.dataset.reviewUi = overlays.dataset.reviewUi = '';
  const presentationToolbar = root.querySelector('.presentation-header-controls');
  const presentation = root.matches('.presentation-preview');
  // Review navigation is provided by the VS Code title bar and sidebar.
  if (presentationToolbar) toolbar.classList.add('md-review-slide-toolbar');
  document.body.append(overlays);

  let reviewPanel;
  if (presentation) {
    const bottomBar = root.querySelector('[data-presentation-bottom-bar]');
    const tabs = bottomBar?.querySelector('.presentation-bottom-bar-tabs');
    if (bottomBar && tabs) {
      const tab = make('button', 'presentation-tab', 'Review Comments');
      tab.type = 'button';
      tab.dataset.panel = 'review';
      tab.dataset.reviewUi = '';
      tab.setAttribute('aria-label', 'Review Comments');
      tab.title = 'Review Comments';
      reviewPanel = make('div', 'presentation-bottom-panel md-review-panel');
      reviewPanel.dataset.panel = 'review';
      reviewPanel.dataset.reviewUi = '';
      const active = bridge.getState()?.presentationActivePanelTab === 'review';
      tab.classList.toggle('is-active', active);
      reviewPanel.hidden = !active;
      tabs.prepend(tab);
      bottomBar.append(reviewPanel);
    }
  }

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
  let composerForm;
  let activateComposer;
  let resumeComposer;
  let suppressOutsideClick = false;

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
      if (!state.contentKey || state.contentKey !== next.contentKey) {
        selection = undefined;
        if (!editing && !selectedComment) popover.hidden = true;
      } else if (editing) {
        editing.version = next.version;
      }
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
    if (reviewPanel) renderReviewPanel();
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
        updateCommentHighlight();
      } else if (selection) position(popover, selection.range);
    });
  }

  function activeContent() {
    return root.querySelector('.presentation-slide.is-active .presentation-slide-body') ?? root.querySelector('main.markdown-body');
  }

  function readSelection() {
    if (pressed || editing || state?.error || document.body.classList.contains('presentation-is-immersive')) return;
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

  function openComposer(comment, writable = true) {
    const form = make('form', 'md-review-composer');
    const header = make('div', 'md-review-composer-header');
    const title = make('strong', '', 'Review Comments');
    const hint = make('div', 'md-review-composer-hint');
    const text = make('textarea');
    text.value = comment?.body ?? '';
    text.maxLength = 20_000;
    text.rows = 3;
    text.placeholder = 'Write a review comment';
    text.setAttribute('aria-label', 'Review comment');
    const check = make('input');
    check.type = 'checkbox';
    check.checked = comment?.includeInAi ?? true;
    check.addEventListener('pointerdown', event => event.stopPropagation());
    check.addEventListener('click', event => {
      event.stopPropagation();
      if (!editing) activateComposer();
    });
    const label = make('label', 'md-review-ai-option');
    label.append('Include in AI review', check);
    header.append(title, label);
    const actions = make('div', 'md-review-actions');
    const tools = make('div', 'md-review-comment-tools');
    const saveActions = make('div', 'md-review-save-actions');
    const submit = button('Save', () => {});
    submit.type = 'submit';
    submit.disabled = !text.value.trim();
    text.addEventListener('input', () => {
      submit.disabled = !text.value.trim();
    });
    const cancel = button('Cancel', closePopover);
    saveActions.append(cancel, submit);
    let afterEdit;
    const performAction = action => {
      if (pending) return;
      if (editing) {
        if (!text.value.trim()) {
          status.textContent = 'Enter a comment of up to 20,000 characters.';
          text.focus();
          return;
        }
        afterEdit = action;
        form.requestSubmit();
      } else if (action === 'reattach') {
        beginReattach(comment.id);
      } else {
        send(action, { id: comment.id });
      }
    };
    if (comment) {
      const resolve = iconButton(comment.state === 'open' ? icons.resolve : icons.reopen,
        comment.state === 'open' ? 'Mark resolved' : 'Reopen comment', () =>
          performAction(comment.state === 'open' ? 'resolve' : 'reopen'));
      resolve.classList.add('md-review-resolve');
      tools.append(resolve, iconButton(icons.delete, 'Delete comment', () => performAction('delete')),
        iconButton(icons.reattach, 'Reattach comment', () => performAction('reattach')));
    }
    actions.append(tools, saveActions);
    form.append(header, text, hint, actions);
    activateComposer = () => {
      if (editing) return;
      cancelHide();
      editing = { version: state.version };
      text.readOnly = false;
      hint.textContent = 'Esc cancels · Ctrl+Enter saves · Click outside to save';
      saveActions.hidden = false;
      text.focus({ preventScroll: true });
    };
    text.readOnly = true;
    hint.textContent = 'Click to edit';
    saveActions.hidden = true;
    form.addEventListener('click', event => {
      if (!editing && !event.target.closest('button')) activateComposer();
    });
    text.addEventListener('keydown', event => {
      if (!editing && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        activateComposer();
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!text.value.trim()) {
        closePopover();
        return;
      }
      if (editing.version !== state.version) {
        afterEdit = undefined;
        status.textContent = 'The preview changed. Close this editor and select the text again.';
        return;
      }
      send(comment ? 'edit' : 'add', {
        id: comment?.id, body: text.value, includeInAi: check.checked, selection: selection?.slices, afterEdit,
      });
      afterEdit = undefined;
      if (pending) {
        text.disabled = check.disabled = cancel.disabled = submit.disabled = true;
        for (const control of tools.querySelectorAll('button')) control.disabled = true;
      }
    });
    composerForm = form;
    resumeComposer = () => {
      text.disabled = check.disabled = cancel.disabled = false;
      submit.disabled = !text.value.trim();
      for (const control of tools.querySelectorAll('button')) control.disabled = false;
    };
    popover.classList.add('is-composer');
    popover.style.width = '';
    popover.style.height = '';
    popover.replaceChildren(form);
    popover.hidden = false;
    if (selection) position(popover, selection.range);
    else if (comment) {
      const ranges = commentRanges(comment);
      if (ranges.length) position(popover, ranges[0]);
      else position(popover);
    }
    popover.style.minWidth = popover.offsetWidth + 'px';
    popover.style.minHeight = popover.offsetHeight + 'px';
    if (writable) activateComposer();
  }

  function closePopover() {
    cancelHide();
    composerForm = undefined;
    activateComposer = undefined;
    resumeComposer = undefined;
    popover.classList.remove('is-composer');
    popover.style.removeProperty('min-width');
    popover.style.removeProperty('min-height');
    popover.style.width = '';
    popover.style.height = '';
    editing = undefined;
    selection = undefined;
    selectedComment = undefined;
    popover.hidden = true;
    updateCommentHighlight();
  }

  function beginReattach(id) {
    if (reattach === id) return;
    closePopover();
    reattach = id;
    status.textContent = 'Select the text to reattach this comment. Press Escape to cancel.';
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

  function updateCommentHighlight() {
    if (!window.Highlight || !window.CSS?.highlights) return;
    const comment = state?.comments.find(item => item.id === selectedComment);
    if (!commentsVisible || popover.hidden || !comment || document.body.classList.contains('presentation-is-immersive')) {
      CSS.highlights.delete('markdown-review');
      return;
    }
    CSS.highlights.set('markdown-review', new Highlight(...commentRanges(comment)));
  }

  function renderMarkers() {
    const buttons = [];
    if (!commentsVisible || document.body.classList.contains('presentation-is-immersive')) {
      markers.replaceChildren();
      if (window.CSS?.highlights) CSS.highlights.delete('markdown-review');
      return;
    }
    const usedPositions = new Map();
    for (const comment of state.comments) {
      const ranges = commentRanges(comment);
      const rect = ranges[0]?.getClientRects()[0];
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
      const marker = button('', () => openComment(comment), 'Open review comment: ' + comment.body);
      marker.addEventListener('pointerenter', () => { cancelHide(); if (!editing) openComment(comment, false); });
      marker.addEventListener('pointerleave', () => { if (!editing) scheduleHide(); });
      marker.addEventListener('focus', () => { cancelHide(); if (!editing) openComment(comment, false); });
      marker.addEventListener('blur', event => { if (!popover.contains(event.relatedTarget) && !editing) scheduleHide(); });
      marker.classList.add('md-review-marker');
      marker.classList.toggle('is-resolved', comment.state === 'resolved');
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
    updateCommentHighlight();
  }

  function openComment(comment, focus = true) {
    if (selectedComment === comment.id && composerForm && !popover.hidden) {
      if (focus) activateComposer?.();
      return;
    }
    closePopover();
    selectedComment = comment.id;
    const ranges = commentRanges(comment);
    const block = ranges[0]?.startContainer.parentElement;
    if (block && focus) {
      const slide = block.closest('.presentation-slide');
      if (slide && !slide.classList.contains('is-active')) {
        root.querySelector('[data-slide-target="' + slide.dataset.slideIndex + '"]')?.click();
      }
      block.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    openComposer(comment, focus);
    updateCommentHighlight();
  }

  function renderList() {
    const header = make('div', 'md-review-actions');
    header.append(make('strong', '', 'Review Comments'), button('Close', () => listButton.click()));
    list.replaceChildren(header, ...state.comments.map(comment => commentCard(comment)));
  }

  function renderReviewPanel() {
    if (!state.comments.length) {
      reviewPanel.replaceChildren(make('p', 'md-review-panel-empty', 'No review comments.'));
      return;
    }
    reviewPanel.replaceChildren(...state.comments.map(comment => {
      const item = button('', () => openComment(comment));
      item.classList.add('md-review-panel-item');
      const lines = comment.placement ?? comment.originalLines;
      const location = !lines.startLine ? 'Location unavailable' : (lines.startLine === lines.endLine ? 'Line ' + lines.startLine : 'Lines ' + lines.startLine + '–' + lines.endLine);
      const caption = location + ' · ' + (comment.state === 'open' ? 'Open' : 'Resolved') + (comment.placement ? '' : ' · Detached');
      item.append(make('strong', '', caption), make('span', 'md-review-panel-quote', comment.originalQuote), make('span', '', comment.body));
      return item;
    }));
  }

  function commentCard(comment) {
    const card = make('div', 'md-review-card');
    const lines = comment.placement ?? comment.originalLines;
    const location = !lines.startLine ? 'Location unavailable' : (lines.startLine === lines.endLine ? 'Line ' + lines.startLine : 'Lines ' + lines.startLine + '–' + lines.endLine);
    const caption = location + ' · ' + (comment.state === 'open' ? 'Open' : 'Resolved') + (comment.placement ? '' : ' · Detached');
    card.append(button(caption, () => openComment(comment)));
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
      iconButton(comment.state === 'open' ? icons.resolve : icons.reopen,
        comment.state === 'open' ? 'Mark resolved' : 'Reopen comment', () =>
          send(comment.state === 'open' ? 'resolve' : 'reopen', { id: comment.id })),
      iconButton(icons.delete, 'Delete comment', () => send('delete', { id: comment.id })),
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
    } else if (data?.command === 'beginReviewReattach') {
      beginReattach(data.id);
    } else if (data?.command === 'reviewResult' && pending?.requestId === data.requestId) {
      const action = pending.action;
      pending = undefined;
      if (data.error) {
        resumeComposer?.();
        status.textContent = data.error;
      }
      else if (['add', 'edit', 'reattach', 'resolve', 'reopen', 'delete', 'toggle'].includes(action)) {
        reattach = undefined;
        window.getSelection()?.removeAllRanges();
        closePopover();
      }
    }
  });
  document.addEventListener('pointerdown', event => {
    suppressOutsideClick = false;
    if (!event.isPrimary || event.button !== 0) return;
    if (editing && composerForm && !popover.contains(event.target)) {
      suppressOutsideClick = true;
      event.preventDefault();
      if (pending) return;
      if (composerForm.querySelector('button[type="submit"]').disabled) {
        closePopover();
        return;
      }
      composerForm.requestSubmit();
      return;
    }
    if (event.target.closest?.('[data-review-ui]')) return;
    if (selectedComment) closePopover();
    pressed = true;
  });
  document.addEventListener('click', event => {
    if (!suppressOutsideClick) return;
    suppressOutsideClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  window.addEventListener('pointerup', () => {
    pressed = false;
    requestAnimationFrame(readSelection);
  });
  window.addEventListener('pointercancel', () => { pressed = false; suppressOutsideClick = false; });
  window.addEventListener('blur', () => { pressed = false; });
  document.addEventListener('selectionchange', readSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editing && pending) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && editing && composerForm) {
      event.preventDefault();
      event.stopPropagation();
      composerForm.requestSubmit();
      return;
    }
    if (event.key === 'Escape' && (reattach || !popover.hidden || !list.hidden)) {
      event.stopPropagation();
      if (reattach) bridge.review({ action: 'cancelReattach' });
      reattach = undefined;
      status.textContent = '';
      closePopover();
      if (!list.hidden) listButton.click();
      window.getSelection()?.removeAllRanges();
    }
  });
  document.addEventListener('md-document-updated', readState);
  document.addEventListener('md-slide-changed', scheduleLayout);
  if (presentation) {
    new MutationObserver(scheduleLayout).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const canvasObserver = new MutationObserver(scheduleLayout);
    for (const canvas of root.querySelectorAll('.presentation-canvas')) {
      canvasObserver.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }
  }
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('scroll', scheduleLayout, true);
  readState();
  bridge.review({ action: 'ready' });
})();
