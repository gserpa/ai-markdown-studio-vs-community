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
  const icon = path => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  };
  const iconButton = (path, label, onClick) => {
    const element = button('', onClick, label);
    element.classList.add('md-review-icon-button');
    element.append(icon(path));
    return element;
  };
  const icons = {
    comment: 'M4 5h16v11H9l-5 4V5zm4 4h8m-8 3h5',
    resolution: 'M13 4H5v16h14v-8m-11 2 3 3 10-11',
    resolve: 'M5 12l4 4L19 6',
    reopen: 'M4 10V4m0 6h6M4 10a8 8 0 1 1 1 7',
    delete: 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7',
    reattach: 'M8 12l6-6a4 4 0 0 1 6 6l-8 8a6 6 0 0 1-8-8l8-8',
  };
  const resolvedDraftMessage = 'This comment was resolved while editing. Reopen it to continue, or cancel to discard the draft.';
  const toolbar = make('div', 'md-review-toolbar');
  const overlays = make('div', 'md-review-overlays');
  toolbar.dataset.reviewUi = overlays.dataset.reviewUi = '';
  const presentation = root.matches('.presentation-preview');
  const standalone = bridge.reviewStandalone === true;
  document.body.append(overlays);

  let reviewPanel;
  let reviewPanelContents;
  let visibilityButton;
  let reviseButton;
  if (presentation) {
    const bottomBar = root.querySelector('[data-presentation-bottom-bar]');
    const tabs = bottomBar?.querySelector('.presentation-bottom-bar-tabs');
    if (bottomBar && tabs) {
      const tab = make('button', 'presentation-tab');
      tab.type = 'button';
      tab.dataset.panel = 'review';
      tab.dataset.reviewUi = '';
      tab.setAttribute('aria-label', 'Review Comments');
      tab.title = 'Review Comments';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'presentation-icon md-review-tab-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', 'M4 4h16v12H9l-5 4V4zm4 5h8m-8 3h6');
      icon.append(shape);
      tab.append(icon, 'Review Comments');
      reviewPanel = make('div', 'presentation-bottom-panel md-review-panel');
      reviewPanel.dataset.panel = 'review';
      reviewPanel.dataset.reviewUi = '';
      visibilityButton = button('', () => send('toggleVisibility'));
      visibilityButton.classList.add('md-review-visibility');
      if (!standalone) {
        reviseButton = button('AI: Revise from Comments', () => send('revise'));
        reviseButton.classList.add('md-review-revise');
      }
      reviewPanelContents = make('div');
      reviewPanel.append(visibilityButton);
      if (reviseButton) reviewPanel.append(reviseButton);
      reviewPanel.append(reviewPanelContents);
      const active = bridge.getState()?.presentationActivePanelTab === 'review';
      tab.classList.toggle('is-active', active);
      reviewPanel.hidden = !active;
      const notesTab = tabs.querySelector('.presentation-tab[data-panel="notes"]');
      if (notesTab) notesTab.after(tab);
      else tabs.append(tab);
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
  let selection;
  let editing;
  let reattach;
  let pressed = false;
  let frame;
  let composerFrame;
  let selectedComment;
  let pending;
  let requestId = 0;
  let commentsVisible = true;
  let hideTimer;
  let composerForm;
  let activateComposer;
  let resumeComposer;
  let resizeObserver;

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
  if (standalone && !presentation) {
    toolbar.append(listButton);
    document.body.append(toolbar);
  }
  function send(action, details = {}, retainComposer = false) {
    if (pending) {
      if (pending.outside) pending.followUp = () => send(action, details);
      return;
    }
    if (!state) return;
    if (editing && selectedComment && state.comments.find(comment => comment.id === selectedComment)?.state === 'resolved'
      && !retainComposer) {
      status.textContent = resolvedDraftMessage;
      return;
    }
    status.textContent = '';
    pending = { requestId: ++requestId, action, version: state.version, retainComposer };
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
    if (composerForm && selectedComment) updateComposerDetails(state.comments.find(comment => comment.id === selectedComment));
    if (reattach && !state.comments.some(comment => comment.id === reattach)) reattach = undefined;
    if (state.error) status.textContent = state.error;
    refresh();
  }

  function refresh() {
    listButton.hidden = state.comments.length === 0;
    if (!list.hidden) renderList();
    if (reviewPanel) {
      visibilityButton.hidden = state.comments.length === 0;
      visibilityButton.textContent = commentsVisible ? 'Hide Review Comments' : 'Show Review Comments';
      if (reviseButton) reviseButton.hidden = !state.comments.some(comment => comment.eligibleForAi);
      renderReviewPanel();
    }
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
    const heading = make('div', 'md-review-composer-heading');
    heading.append(make('strong', '', comment ? 'Review comment' : 'New review comment'));
    if (comment) heading.append(make('span', 'md-review-composer-state'));
    const hint = make('div', 'md-review-composer-hint');
    const commentField = make('label', 'md-review-composer-field');
    const text = make('textarea');
    text.value = comment?.body ?? '';
    text.maxLength = 20_000;
    text.rows = 1;
    text.placeholder = 'Write a review comment';
    commentField.append(composerFieldLabel('Comment', icons.comment), text);
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
    header.append(heading);
    if (!standalone) header.append(label);
    const actions = make('div', 'md-review-actions');
    const tools = make('div', 'md-review-comment-tools');
    const saveActions = make('div', 'md-review-save-actions');
    const edit = button('Edit', () => activateComposer());
    const submit = button('Save', () => {});
    submit.type = 'submit';
    submit.disabled = !text.value.trim();
    text.addEventListener('input', () => {
      submit.disabled = !text.value.trim();
      resizeText();
    });
    const cancel = button('Cancel', closePopover);
    saveActions.append(cancel, submit);
    let afterEdit;
    const performAction = action => {
      if (pending) return;
      if (editing && action === 'reopen') {
        send('reopen', { id: comment.id }, true);
        return;
      }
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
          performAction(state.comments.find(item => item.id === comment.id)?.state === 'open' ? 'resolve' : 'reopen'));
      resolve.classList.add('md-review-resolve');
      tools.append(resolve, iconButton(icons.delete, 'Delete comment', () => performAction('delete')),
        iconButton(icons.reattach, 'Reattach comment', () => performAction('reattach')));
    }
    actions.append(tools, edit, saveActions);
    form.append(header, commentField, hint, actions);
    activateComposer = () => {
      if (editing || (comment && state.comments.find(item => item.id === comment.id)?.state !== 'open')) return;
      cancelHide();
      editing = { version: state.version };
      text.readOnly = false;
      hint.hidden = false;
      edit.hidden = true;
      saveActions.hidden = false;
      resizeText();
      text.focus({ preventScroll: true });
    };
    text.readOnly = true;
    hint.textContent = 'Esc cancels · Ctrl+Enter saves · Click outside to save';
    hint.hidden = true;
    saveActions.hidden = true;
    text.addEventListener('click', () => activateComposer());
    text.addEventListener('keydown', event => {
      if (!editing && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        activateComposer();
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (comment && state.comments.find(item => item.id === comment.id)?.state !== 'open') {
        status.textContent = 'This comment is resolved. Reopen it before editing.';
        return;
      }
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
    if (comment) updateComposerDetails(comment);
    popover.style.width = '';
    popover.style.height = '';
    popover.replaceChildren(form);
    popover.hidden = false;
    const resizeText = () => {
      text.style.height = 'auto';
      text.style.height = (text.scrollHeight + text.offsetHeight - text.clientHeight) + 'px';
      if (composerFrame !== undefined) return;
      composerFrame = requestAnimationFrame(() => {
        composerFrame = undefined;
        if (composerForm !== form || popover.hidden) return;
        if (selection) position(popover, selection.range);
        else if (selectedComment) {
          const ranges = commentRanges(state.comments.find(item => item.id === selectedComment));
          if (ranges.length) position(popover, ranges[0]);
        }
      });
    };
    resizeText();
    if (window.ResizeObserver) {
      let width = popover.clientWidth;
      resizeObserver = new ResizeObserver(() => {
        if (width === popover.clientWidth) return;
        width = popover.clientWidth;
        resizeText();
      });
      resizeObserver.observe(popover);
    }
    if (selection) position(popover, selection.range);
    else if (comment) {
      const ranges = commentRanges(comment);
      if (ranges.length) position(popover, ranges[0]);
      else position(popover);
    }
    if (writable) activateComposer();
  }

  function composerFieldLabel(text, path) {
    const label = make('strong');
    label.append(icon(path), text);
    return label;
  }

  function updateComposerDetails(comment) {
    const badge = composerForm.querySelector('.md-review-composer-state');
    badge.textContent = comment.state === 'resolved' ? 'Resolved' : 'Open';
    composerForm.dataset.commentState = comment.state;
    const resolved = comment.state === 'resolved';
    const text = composerForm.querySelector('textarea');
    const checkbox = composerForm.querySelector('input[type="checkbox"]');
    const resolve = composerForm.querySelector('.md-review-resolve');
    const label = resolved ? 'Reopen comment' : 'Mark resolved';
    resolve.setAttribute('aria-label', label);
    resolve.title = label;
    resolve.querySelector('path').setAttribute('d', resolved ? icons.reopen : icons.resolve);
    if (!pending) {
      text.readOnly = resolved || !editing;
      if (checkbox) checkbox.disabled = resolved;
      composerForm.querySelector('button[type="submit"]').disabled = resolved || !text.value.trim();
      for (const control of composerForm.querySelectorAll('.md-review-comment-tools button:not(.md-review-resolve)')) {
        control.disabled = resolved && !!editing;
      }
    }
    if (!editing) composerForm.querySelector('.md-review-actions > button').hidden = resolved;
    else if (resolved) status.textContent = resolvedDraftMessage;
    else if (status.textContent === resolvedDraftMessage) status.textContent = '';
    let resolution = composerForm.querySelector('.md-review-resolution');
    if (comment.resolution) {
      if (!resolution) {
        resolution = make('div', 'md-review-composer-field md-review-resolution');
        resolution.append(composerFieldLabel('Resolution', icons.resolution), make('div', 'md-review-resolution-text'));
        composerForm.querySelector('.md-review-composer-hint').before(resolution);
      }
      resolution.lastElementChild.textContent = comment.resolution;
      resolution.lastElementChild.classList.toggle('is-reopened', comment.state === 'open' && comment.resolutionReopened === true);
      resolution.lastElementChild.title = comment.state === 'open' && comment.resolutionReopened
        ? 'Previous resolution; this comment was reopened.' : '';
    } else {
      resolution?.remove();
    }
  }

  function closePopover() {
    cancelHide();
    if (composerFrame !== undefined) cancelAnimationFrame(composerFrame);
    composerFrame = undefined;
    resizeObserver?.disconnect();
    resizeObserver = undefined;
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
    if (editing && selectedComment && state.comments.find(comment => comment.id === selectedComment)?.state === 'resolved') {
      status.textContent = resolvedDraftMessage;
      return;
    }
    if (pending?.outside) {
      pending.followUp = () => beginReattach(id);
      return;
    }
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

  function openComment(comment, focus = true, navigate = true) {
    if (editing && selectedComment !== comment.id
      && state.comments.find(item => item.id === selectedComment)?.state === 'resolved') {
      status.textContent = resolvedDraftMessage;
      return;
    }
    if (pending?.outside) {
      pending.followUp = () => {
        const current = state.comments.find(item => item.id === comment.id);
        if (current) openComment(current, focus, navigate);
        else status.textContent = 'This comment is no longer in the document.';
      };
      return;
    }
    if (selectedComment === comment.id && composerForm && !popover.hidden) {
      if (focus) activateComposer?.();
      return;
    }
    closePopover();
    selectedComment = comment.id;
    const ranges = commentRanges(comment);
    const block = ranges[0]?.startContainer.parentElement;
    if (block && focus && navigate) {
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
      reviewPanelContents.replaceChildren(make('p', 'md-review-panel-empty', 'No review comments.'));
      return;
    }
    reviewPanelContents.replaceChildren(...state.comments.map(comment => {
      const item = button('', () => openComment(comment));
      item.classList.add('md-review-panel-item');
      const lines = comment.placement ?? comment.originalLines;
      const location = !lines.startLine ? 'Location unavailable' : (lines.startLine === lines.endLine ? 'Line ' + lines.startLine : 'Lines ' + lines.startLine + '–' + lines.endLine);
      const caption = location + ' · ' + (comment.state === 'open' ? 'Open' : 'Resolved') + (comment.placement ? '' : ' · Detached');
      item.append(make('strong', '', caption), make('span', 'md-review-panel-quote', comment.originalQuote),
        summaryField('Comment', icons.comment, comment.body, 'span', 'md-review-comment'));
      if (comment.resolution) item.append(resolutionSummary(comment, 'span'));
      return item;
    }));
  }

  function commentCard(comment) {
    const card = make('div', 'md-review-card');
    const lines = comment.placement ?? comment.originalLines;
    const location = !lines.startLine ? 'Location unavailable' : (lines.startLine === lines.endLine ? 'Line ' + lines.startLine : 'Lines ' + lines.startLine + '–' + lines.endLine);
    const caption = location + ' · ' + (comment.state === 'open' ? 'Open' : 'Resolved') + (comment.placement ? '' : ' · Detached');
    card.append(button(caption, () => openComment(comment)));
    card.append(make('blockquote', '', comment.originalQuote),
      summaryField('Comment', icons.comment, comment.body, 'p', 'md-review-comment'));
    if (comment.resolution) card.append(resolutionSummary(comment, 'p'));
    const check = make('input');
    check.type = 'checkbox';
    check.checked = comment.includeInAi;
    check.addEventListener('change', () => send('toggle', { id: comment.id, includeInAi: check.checked }));
    const label = make('label');
    label.append(check, ' Include in AI review');
    const actions = make('div', 'md-review-actions');
    actions.append(
      button(comment.state === 'resolved' ? 'View' : 'Edit', () => {
        openComment(comment, true, false);
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
    if (!standalone) card.append(label);
    card.append(actions);
    return card;
  }

  function summaryField(label, path, value, tag, className) {
    const summary = make(tag, 'md-review-summary-field ' + className);
    const heading = make('strong', '', label + ': ');
    heading.prepend(icon(path));
    summary.append(heading, make('span', 'md-review-summary-text', value));
    return summary;
  }

  function resolutionSummary(comment, tag) {
    const summary = summaryField('Resolution', icons.resolution, comment.resolution, tag, 'md-review-resolution');
    const text = summary.lastElementChild;
    if (comment.state === 'open' && comment.resolutionReopened) {
      text.classList.add('is-reopened');
      text.title = 'Previous resolution; this comment was reopened.';
    }
    return summary;
  }

  window.addEventListener('message', ({ data }) => {
    if (data?.command === 'reviewVisibility') {
      commentsVisible = data.visible !== false;
      if (!commentsVisible && selectedComment && !editing) closePopover();
      refresh();
    } else if (data?.command === 'revealReviewComment') {
      const comment = state.comments.find(item => item.id === data.id);
      if (comment) openComment(comment);
    } else if (data?.command === 'beginReviewReattach') {
      beginReattach(data.id);
    } else if (data?.command === 'reviewResult' && pending?.requestId === data.requestId) {
      const completed = pending;
      const action = completed.action;
      pending = undefined;
      if (data.error) {
        resumeComposer?.();
        if (composerForm && selectedComment) updateComposerDetails(state.comments.find(comment => comment.id === selectedComment));
        status.textContent = data.error + (completed.followUp ? ' The selected review action was not performed.' : '');
      }
      else if (completed.retainComposer && composerForm && selectedComment) {
        updateComposerDetails(state.comments.find(comment => comment.id === selectedComment));
      }
      else if (['add', 'edit', 'reattach', 'resolve', 'reopen', 'delete', 'toggle'].includes(action)) {
        reattach = undefined;
        if (!completed.outside) window.getSelection()?.removeAllRanges();
        closePopover();
        if (completed.followUp) completed.followUp();
        else if (completed.outside) requestAnimationFrame(readSelection);
      }
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    if (editing && composerForm && !popover.contains(event.target)) {
      window.getSelection()?.removeAllRanges();
    }
    if (event.target.closest?.('[data-review-ui]')) return;
    if (selectedComment && !editing) closePopover();
    pressed = true;
  }, true);
  document.addEventListener('click', event => {
    if (event.button !== 0 || !editing || !composerForm || popover.contains(event.target) || pending) return;
    if (selectedComment && state.comments.find(comment => comment.id === selectedComment)?.state === 'resolved') {
      status.textContent = resolvedDraftMessage;
      return;
    }
    if (composerForm.querySelector('button[type="submit"]').disabled) {
      closePopover();
    } else {
      composerForm.requestSubmit();
      if (pending) pending.outside = true;
    }
  }, true);
  window.addEventListener('pointerup', () => {
    pressed = false;
    requestAnimationFrame(readSelection);
  });
  window.addEventListener('pointercancel', () => { pressed = false; });
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
