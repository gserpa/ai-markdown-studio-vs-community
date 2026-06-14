(async () => {
  const bridge = window.__previewBridge;
  const mermaidModuleUri = window.__MERMAID_URI__;
  const previewMode = document.body.dataset.previewMode;
  const mermaidLightbox = initializeMermaidLightbox();
  enforceReadOnlyTaskCheckboxes();

  if (previewMode !== 'presentation') {
    wrapTablesForScroll();
  }

  const previewRoot = document.querySelector('.presentation-preview');
  const previewThemeRuntime = getPreviewThemeRuntime();
  const resolvePreviewThemeState = () => previewThemeRuntime.resolvePreviewThemeState({
    previewMode,
    body: document.body,
    previewRoot: previewRoot instanceof HTMLElement ? previewRoot : undefined,
  });
  const linkTooltips = initializeLinkHoverTooltips(document);
  let mermaidRenderSignature = '';
  let mermaidRefreshPending = false;

  let mermaid = window.mermaid;
  if (!mermaid && mermaidModuleUri) {
    try {
      const mermaidModule = await import(mermaidModuleUri);
      mermaid = mermaidModule.default ?? mermaidModule.mermaid ?? mermaidModule;
    } catch (mermaidError) {
      console.warn('[preview] Mermaid initialization failed:', mermaidError);
    }
  }

  if (mermaid) {
    mermaid.startOnLoad = false;

    const renderMermaidBlocks = async (force = false) => {
      const previewThemeState = resolvePreviewThemeState();
      const nextSignature = `${previewThemeState.mermaidTheme}:${previewThemeState.mermaidTransparentBackground ? '1' : '0'}`;
      if (!force && nextSignature === mermaidRenderSignature) {
        return;
      }

      mermaidRenderSignature = nextSignature;
      mermaid.initialize({
        startOnLoad: false,
        theme: previewThemeState.mermaidTheme,
        securityLevel: 'strict',
        htmlLabels: true,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        flowchart: {
          htmlLabels: true,
          useMaxWidth: true,
          padding: 10,
        },
      });

      const blocks = [...document.querySelectorAll('.mermaid, .mermaid-rendered[data-mermaid-source]')];
      for (const [index, block] of blocks.entries()) {
        const source = block.getAttribute('data-mermaid-source')?.trim() || block.textContent?.trim();
        if (!source) {
          continue;
        }

        try {
          const renderId = `preview-mermaid-${index + 1}`;
          const renderResult = await mermaid.render(renderId, source);
          const svg = typeof renderResult === 'string' ? renderResult : renderResult?.svg;
          if (typeof svg === 'string' && svg.trim()) {
            block.innerHTML = svg;
            block.classList.remove('mermaid');
            block.classList.add('mermaid-rendered');
            block.setAttribute('data-mermaid-source', source);
            normalizeRenderedMermaidSvgSizing(block);
            if (previewThemeState.mermaidTransparentBackground) {
              patchTransparentMermaidBackground(block);
            }
            decorateRenderedMermaid(block);
          }

          if (typeof renderResult?.bindFunctions === 'function') {
            renderResult.bindFunctions(block);
          }
        } catch (diagramError) {
          console.warn('[preview] Failed to render Mermaid diagram:', diagramError);
        }
      }
    };

    const scheduleMermaidRefresh = () => {
      if (mermaidRefreshPending) {
        return;
      }

      mermaidRefreshPending = true;
      queueMicrotask(() => {
        mermaidRefreshPending = false;
        void renderMermaidBlocks();
      });
    };

    await renderMermaidBlocks(true);

    const themeObserver = new MutationObserver(() => {
      scheduleMermaidRefresh();
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-document-theme-mode', 'data-document-mermaid-theme-light', 'data-document-mermaid-theme-dark', 'data-document-mermaid-transparent-background-light', 'data-document-mermaid-transparent-background-dark'],
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const checkbox = target.closest('input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      event.preventDefault();
      event.stopPropagation();
      checkbox.checked = checkbox.defaultChecked;
      checkbox.blur();
      return;
    }

    const mermaidAction = target.closest('[data-mermaid-action="open-lightbox"]');
    if (mermaidAction instanceof HTMLElement) {
      const block = mermaidAction.closest('.mermaid-rendered');
      if (block instanceof HTMLElement) {
        event.preventDefault();
        mermaidLightbox.open(block);
      }
      return;
    }

    const anchor = target.closest('a');
    if (!anchor) {
      return;
    }

    const linkedHref = anchor.getAttribute('data-href') ?? anchor.getAttribute('href');
    if (!linkedHref || linkedHref === '#' || linkedHref.startsWith('#')) {
      return;
    }

    event.preventDefault();
    linkTooltips.hide();

    bridge.openLink(linkedHref);
  });

  document.addEventListener('dblclick', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const block = target.closest('.mermaid-rendered');
    if (!(block instanceof HTMLElement)) {
      return;
    }

    if (target.closest('a') || target.closest('[data-mermaid-action="open-lightbox"]')) {
      return;
    }

    event.preventDefault();
    mermaidLightbox.open(block);
  });

  window.addEventListener('keydown', (event) => {
    const activeCheckbox = event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
      ? event.target
      : null;
    if (activeCheckbox && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      event.stopPropagation();
      activeCheckbox.checked = activeCheckbox.defaultChecked;
      return;
    }

    if (mermaidLightbox.handleKeydown(event)) {
      return;
    }
  });

  window.addEventListener('resize', () => {
    mermaidLightbox.handleResize();
  });

  if (previewMode === 'presentation') {
    initializePresentationPreview(bridge);
  }

  initializeImageFallback(bridge, previewMode === 'presentation');
})();

function getPreviewThemeRuntime() {
  const helper = window.__mfoPreviewThemeRuntime;
  if (helper && typeof helper.resolvePreviewThemeState === 'function') {
    return helper;
  }

  return {
    resolvePreviewThemeState({ previewMode, body, previewRoot }) {
      const hostIsDarkMode = Boolean(body?.classList?.contains('vscode-dark') || body?.classList?.contains('vscode-high-contrast'));
      if (previewMode === 'presentation') {
        const mermaidTheme = previewRoot instanceof HTMLElement
          ? (hostIsDarkMode
            ? (previewRoot.dataset.presentationMermaidThemeDark || 'dark')
            : (previewRoot.dataset.presentationMermaidThemeLight || 'default'))
          : (hostIsDarkMode ? 'dark' : 'default');
        const mermaidTransparentBackground = previewRoot instanceof HTMLElement
          ? (hostIsDarkMode
            ? previewRoot.dataset.presentationMermaidTransparentBackgroundDark === 'true'
            : previewRoot.dataset.presentationMermaidTransparentBackgroundLight === 'true')
          : false;

        return {
          mermaidTheme,
          isMermaidDark: mermaidTheme === 'dark',
          mermaidTransparentBackground,
        };
      }

      const documentThemeMode = body?.dataset?.documentThemeMode === 'dark' || body?.dataset?.documentThemeMode === 'light' || body?.dataset?.documentThemeMode === 'auto'
        ? body.dataset.documentThemeMode
        : 'auto';
      const useDarkDocumentTheme = documentThemeMode === 'dark' || (documentThemeMode === 'auto' && hostIsDarkMode);
      const mermaidTheme = useDarkDocumentTheme
        ? (body?.dataset?.documentMermaidThemeDark || 'dark')
        : (body?.dataset?.documentMermaidThemeLight || 'default');
      const mermaidTransparentBackground = useDarkDocumentTheme
        ? body?.dataset?.documentMermaidTransparentBackgroundDark === 'true'
        : body?.dataset?.documentMermaidTransparentBackgroundLight === 'true';

      return {
        mermaidTheme,
        isMermaidDark: mermaidTheme === 'dark',
        mermaidTransparentBackground,
      };
    },
  };
}

function wrapTablesForScroll() {
  const tables = document.querySelectorAll('.markdown-body table');
  for (const table of tables) {
    if (!(table instanceof HTMLTableElement)) {
      continue;
    }

    if (table.parentElement?.classList.contains('table-scroll-wrapper')) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll-wrapper';
    table.parentElement?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }
}

function initializeLinkHoverTooltips(rootDocument) {
  const delayMs = 1000;
  let tooltipEl = null;
  let hoveredAnchor = null;
  let activeAnchor = null;
  let showTimer = null;
  let pointerX = 0;
  let pointerY = 0;

  const ensureTooltipElement = () => {
    if (tooltipEl) {
      return tooltipEl;
    }

    tooltipEl = rootDocument.createElement('div');
    tooltipEl.className = 'link-hover-tooltip';
    tooltipEl.hidden = true;
    rootDocument.body.appendChild(tooltipEl);
    return tooltipEl;
  };

  const clearShowTimer = () => {
    if (!showTimer) {
      return;
    }

    clearTimeout(showTimer);
    showTimer = null;
  };

  const resolveTooltipText = (anchor) => {
    const href = anchor?.getAttribute('data-href')?.trim()
      || anchor?.getAttribute('href')?.trim()
      || anchor?.getAttribute('title')?.trim()
      || '';

    if (!href || href === '#' || href.startsWith('#')) {
      return null;
    }

    return href;
  };

  const positionTooltip = () => {
    if (!tooltipEl || tooltipEl.hidden) {
      return;
    }

    const offset = 14;
    const maxX = Math.max(12, window.innerWidth - tooltipEl.offsetWidth - 12);
    const maxY = Math.max(12, window.innerHeight - tooltipEl.offsetHeight - 12);
    tooltipEl.style.left = `${Math.min(pointerX + offset, maxX)}px`;
    tooltipEl.style.top = `${Math.min(pointerY + offset, maxY)}px`;
  };

  const hide = () => {
    clearShowTimer();
    activeAnchor = null;
    if (!tooltipEl) {
      return;
    }

    tooltipEl.hidden = true;
    tooltipEl.classList.remove('is-visible');
  };

  const show = (anchor) => {
    const text = resolveTooltipText(anchor);
    if (!text) {
      hide();
      return;
    }

    const element = ensureTooltipElement();
    element.textContent = text;
    element.hidden = false;
    element.classList.add('is-visible');
    activeAnchor = anchor;
    positionTooltip();
  };

  const schedule = (anchor, immediate) => {
    clearShowTimer();
    hoveredAnchor = anchor;
    if (immediate) {
      show(anchor);
      return;
    }

    showTimer = setTimeout(() => {
      if (hoveredAnchor === anchor) {
        show(anchor);
      }
    }, delayMs);
  };

  rootDocument.addEventListener('mouseover', (event) => {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[href], a[data-href]')
      : null;
    if (!(anchor instanceof HTMLAnchorElement)) {
      hoveredAnchor = null;
      hide();
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule(anchor, event.ctrlKey || event.metaKey);
  });

  rootDocument.addEventListener('mousemove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (activeAnchor) {
      positionTooltip();
    }

    const anchor = event.target instanceof Element
      ? event.target.closest('a[href], a[data-href]')
      : null;
    if (!(anchor instanceof HTMLAnchorElement)) {
      hoveredAnchor = null;
      hide();
      return;
    }

    if (anchor !== hoveredAnchor) {
      schedule(anchor, event.ctrlKey || event.metaKey);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && activeAnchor !== anchor) {
      schedule(anchor, true);
    }
  });

  rootDocument.addEventListener('mouseout', (event) => {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[href], a[data-href]')
      : null;
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) {
      return;
    }

    if (hoveredAnchor === anchor || activeAnchor === anchor) {
      hoveredAnchor = null;
      hide();
    }
  });

  rootDocument.addEventListener('keydown', (event) => {
    if ((event.key === 'Control' || event.key === 'Meta') && hoveredAnchor && activeAnchor !== hoveredAnchor) {
      schedule(hoveredAnchor, true);
    }
  });

  rootDocument.addEventListener('mousedown', hide, true);
  rootDocument.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);

  return { hide };
}

function enforceReadOnlyTaskCheckboxes() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    if (!(checkbox instanceof HTMLInputElement)) {
      continue;
    }

    checkbox.disabled = true;
    checkbox.setAttribute('disabled', '');
    checkbox.setAttribute('aria-disabled', 'true');
    checkbox.tabIndex = -1;
  }
}

function decorateRenderedMermaid(block) {
  if (!(block instanceof HTMLElement) || block.querySelector('[data-mermaid-action="open-lightbox"]')) {
    return;
  }

  block.setAttribute('tabindex', '0');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mermaid-zoom-trigger';
  trigger.setAttribute('data-mermaid-action', 'open-lightbox');
  trigger.setAttribute('aria-label', 'Zoom Mermaid diagram');
  trigger.textContent = 'Zoom';
  block.append(trigger);
}

function normalizeRenderedMermaidSvgSizing(block) {
  if (!(block instanceof HTMLElement)) {
    return;
  }

  const svg = block.querySelector('svg');
  if (!(svg instanceof SVGElement)) {
    return;
  }

  const viewBox = parseSvgViewBox(svg.getAttribute('viewBox'));
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
    return;
  }

  svg.setAttribute('width', String(viewBox.width));
  svg.setAttribute('height', String(viewBox.height));
  if (!svg.hasAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  svg.style.removeProperty('width');
  svg.style.removeProperty('height');
  svg.style.removeProperty('max-width');
}

function patchTransparentMermaidBackground(block) {
  if (!(block instanceof HTMLElement)) {
    return;
  }

  const svg = block.querySelector('svg');
  if (!(svg instanceof SVGElement)) {
    return;
  }

  svg.classList.add('mermaid-background-transparent');
  svg.style.background = 'transparent';
  svg.style.backgroundColor = 'transparent';

  const viewBox = parseSvgViewBox(svg.getAttribute('viewBox'));
  const backgroundElements = block.querySelectorAll('svg > rect, svg .background, svg rect.background, svg .diagram-background');
  for (const element of backgroundElements) {
    if (!(element instanceof SVGElement) || !isMermaidBackgroundElement(element, viewBox)) {
      continue;
    }

    element.setAttribute('fill', 'transparent');
    element.style.fill = 'transparent';
    element.style.background = 'transparent';
    element.style.backgroundColor = 'transparent';
  }
}

function parseSvgViewBox(value) {
  const parts = (value || '').trim().split(/\s+/).map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return {
    width: parts[2],
    height: parts[3],
  };
}

function isMermaidBackgroundElement(element, viewBox) {
  const className = String(element.getAttribute('class') || '').toLowerCase();
  const id = String(element.getAttribute('id') || '').toLowerCase();
  if (className.includes('background') || id.includes('background')) {
    return true;
  }

  if (element.parentElement?.tagName.toLowerCase() !== 'svg') {
    return false;
  }

  const width = String(element.getAttribute('width') || '').trim();
  const height = String(element.getAttribute('height') || '').trim();
  if (width === '100%' || height === '100%') {
    return true;
  }

  if (!viewBox) {
    return false;
  }

  return Number(width) >= viewBox.width && Number(height) >= viewBox.height;
}

function readPreviewCssVariable(name, fallbackValue, element = document.body) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallbackValue;
}

function initializeMermaidLightbox() {
  const root = document.querySelector('[data-mermaid-lightbox]');
  const viewport = root?.querySelector('[data-mermaid-lightbox-viewport]');
  const stage = root?.querySelector('[data-mermaid-lightbox-stage]');
  const zoomLabel = root?.querySelector('[data-mermaid-lightbox-zoom]');
  const shell = root?.querySelector('.mermaid-lightbox-shell');

  if (!(root instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement) || !(zoomLabel instanceof HTMLElement)) {
    return {
      open() { },
      close() { },
      handleKeydown() {
        return false;
      },
      handleResize() { },
    };
  }

  let active = false;
  let currentScale = 1;
  let fitScale = 1;
  let baseWidth = 0;
  let baseHeight = 0;
  let pendingFitReset = 0;
  let lastFocusedElement = null;
  let panState = null;
  const touchPointers = new Map();
  let touchGestureState = null;

  const clearPendingFitReset = () => {
    if (pendingFitReset !== 0) {
      cancelAnimationFrame(pendingFitReset);
      pendingFitReset = 0;
    }
  };

  const getViewportPointFromClient = (clientX, clientY) => {
    const viewportRect = viewport.getBoundingClientRect();
    return {
      x: clientX - viewportRect.left,
      y: clientY - viewportRect.top,
    };
  };

  const getTouchPoints = () => Array.from(touchPointers.values());

  const getTouchDistance = (firstPoint, secondPoint) => {
    const deltaX = secondPoint.clientX - firstPoint.clientX;
    const deltaY = secondPoint.clientY - firstPoint.clientY;
    return Math.hypot(deltaX, deltaY);
  };

  const getTouchMidpoint = (firstPoint, secondPoint) => ({
    clientX: (firstPoint.clientX + secondPoint.clientX) / 2,
    clientY: (firstPoint.clientY + secondPoint.clientY) / 2,
  });

  const beginTouchGesture = () => {
    const [firstPoint, secondPoint] = getTouchPoints();
    if (!firstPoint || !secondPoint) {
      return;
    }

    touchGestureState = {
      mode: 'pinch',
      startDistance: Math.max(getTouchDistance(firstPoint, secondPoint), 1),
      startScale: currentScale,
    };
  };

  const resetTouchState = () => {
    touchPointers.clear();
    touchGestureState = null;
  };

  const updateStage = () => {
    if (baseWidth <= 0 || baseHeight <= 0) {
      return;
    }

    stage.style.width = `${baseWidth * currentScale}px`;
    stage.style.height = `${baseHeight * currentScale}px`;
    zoomLabel.textContent = `${Math.round(currentScale * 100)}%`;
  };

  const resetViewportPosition = () => {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };

  const getStageVisualOrigin = (viewportRect = viewport.getBoundingClientRect()) => {
    const stageRect = stage.getBoundingClientRect();
    return {
      x: stageRect.left - viewportRect.left,
      y: stageRect.top - viewportRect.top,
    };
  };

  const getStageOrigin = () => {
    const viewportRect = viewport.getBoundingClientRect();
    const stageVisualOrigin = getStageVisualOrigin(viewportRect);
    return {
      x: viewport.scrollLeft + stageVisualOrigin.x,
      y: viewport.scrollTop + stageVisualOrigin.y,
    };
  };

  const setScale = (nextScale) => {
    const minScale = Math.min(fitScale, 0.25);
    const maxScale = Math.max(fitScale, 6);
    currentScale = Math.min(Math.max(nextScale, minScale), maxScale);
    updateStage();
    return currentScale;
  };

  const setScaleAroundPoint = (nextScale, viewportPoint) => {
    const previousScale = currentScale;
    const viewportRect = viewport.getBoundingClientRect();
    const pointerX = viewportPoint?.x ?? viewportRect.width / 2;
    const pointerY = viewportPoint?.y ?? viewportRect.height / 2;
    const stageVisualOriginBefore = getStageVisualOrigin(viewportRect);
    const stageX = pointerX - stageVisualOriginBefore.x;
    const stageY = pointerY - stageVisualOriginBefore.y;
    const appliedScale = setScale(nextScale);
    const fitThreshold = fitScale * 1.001;

    if (appliedScale > fitThreshold) {
      const scaleRatio = previousScale > 0 ? appliedScale / previousScale : 1;
      const desiredOriginX = pointerX - stageX * scaleRatio;
      const desiredOriginY = pointerY - stageY * scaleRatio;
      const stageOriginAfter = getStageOrigin();
      viewport.scrollLeft = stageOriginAfter.x - desiredOriginX;
      viewport.scrollTop = stageOriginAfter.y - desiredOriginY;
      return;
    }

    resetViewportPosition();
  };

  const computeFitScale = () => {
    if (baseWidth <= 0 || baseHeight <= 0) {
      fitScale = 1;
      return;
    }

    const horizontalPadding = 28;
    const verticalPadding = 28;
    const availableWidth = Math.max(viewport.clientWidth - horizontalPadding, 160);
    const availableHeight = Math.max(viewport.clientHeight - verticalPadding, 160);
    fitScale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      fitScale = 1;
    }
  };

  const scheduleFitReset = (relativeScale = 1, preserveRelativeScale = false) => {
    clearPendingFitReset();
    pendingFitReset = requestAnimationFrame(() => {
      pendingFitReset = requestAnimationFrame(() => {
        pendingFitReset = 0;
        if (!active) {
          return;
        }

        computeFitScale();
        if (preserveRelativeScale) {
          setScale(fitScale * relativeScale);
          if (currentScale <= fitScale * 1.001) {
            resetViewportPosition();
          }
          return;
        }

        setScale(fitScale);
        resetViewportPosition();
      });
    });
  };

  const close = () => {
    if (!active) {
      return;
    }

    stopPan();
    resetTouchState();
    active = false;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mermaid-lightbox-open');
    stage.replaceChildren();
    stage.style.removeProperty('width');
    stage.style.removeProperty('height');
    clearPendingFitReset();
    resetViewportPosition();

    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  };

  const open = (block) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }

    const svg = block.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) {
      return;
    }

    lastFocusedElement = document.activeElement;
    const clone = svg.cloneNode(true);
    if (!(clone instanceof SVGSVGElement)) {
      return;
    }

    const dimensions = getSvgDimensions(svg, block);
    baseWidth = dimensions.width;
    baseHeight = dimensions.height;

    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.style.width = '100%';
    clone.style.height = '100%';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    clone.classList.add('mermaid-lightbox-diagram');

    stage.replaceChildren(clone);
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mermaid-lightbox-open');
    active = true;

    scheduleFitReset();

    if (shell instanceof HTMLElement) {
      shell.focus();
    }
  };

  const stopPan = () => {
    if (!panState) {
      return;
    }

    viewport.dataset.panActive = 'false';
    if (panState.suppressContextMenu) {
      viewport.dataset.panSuppressContextMenu = 'true';
    }
    panState = null;
  };

  const syncTouchGestureState = () => {
    const points = getTouchPoints();
    if (points.length >= 2) {
      beginTouchGesture();
      return;
    }

    if (points.length === 1) {
      touchGestureState = {
        mode: 'pan',
        lastClientX: points[0].clientX,
        lastClientY: points[0].clientY,
      };
      return;
    }

    touchGestureState = null;
  };

  const beginTouchInteraction = (event) => {
    if (!active || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    touchPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    viewport.setPointerCapture?.(event.pointerId);
    syncTouchGestureState();
  };

  const updateTouchInteraction = (event) => {
    if (!active || !touchPointers.has(event.pointerId)) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    touchPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    const points = getTouchPoints();
    if (points.length >= 2) {
      if (!touchGestureState || touchGestureState.mode !== 'pinch') {
        beginTouchGesture();
      }

      const [firstPoint, secondPoint] = points;
      const nextDistance = Math.max(getTouchDistance(firstPoint, secondPoint), 1);
      const midpoint = getTouchMidpoint(firstPoint, secondPoint);
      const scaleRatio = nextDistance / Math.max(touchGestureState?.startDistance ?? 1, 1);
      setScaleAroundPoint(
        (touchGestureState?.startScale ?? currentScale) * scaleRatio,
        getViewportPointFromClient(midpoint.clientX, midpoint.clientY),
      );
      return;
    }

    if (points.length === 1 && currentScale > fitScale * 1.02) {
      const point = points[0];
      if (!touchGestureState || touchGestureState.mode !== 'pan') {
        touchGestureState = {
          mode: 'pan',
          lastClientX: point.clientX,
          lastClientY: point.clientY,
        };
        return;
      }

      viewport.scrollLeft -= point.clientX - touchGestureState.lastClientX;
      viewport.scrollTop -= point.clientY - touchGestureState.lastClientY;
      touchGestureState.lastClientX = point.clientX;
      touchGestureState.lastClientY = point.clientY;
    }
  };

  const endTouchInteraction = (event) => {
    if (!touchPointers.has(event.pointerId)) {
      return;
    }

    const wasPinchGesture = touchGestureState?.mode === 'pinch';
    touchPointers.delete(event.pointerId);
    viewport.releasePointerCapture?.(event.pointerId);
    if (wasPinchGesture && touchPointers.size < 2 && currentScale <= fitScale * 1.001) {
      resetToFit();
    }
    syncTouchGestureState();
  };

  const beginPan = (event) => {
    if (!active || event.button !== 2) {
      return;
    }

    event.preventDefault();
    panState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      suppressContextMenu: false,
    };
    viewport.dataset.panActive = 'true';
    viewport.dataset.panSuppressContextMenu = 'false';
  };

  const updatePan = (event) => {
    if (!panState) {
      return;
    }

    const deltaX = event.clientX - panState.startClientX;
    const deltaY = event.clientY - panState.startClientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      panState.suppressContextMenu = true;
    }

    viewport.scrollLeft = panState.startScrollLeft - deltaX;
    viewport.scrollTop = panState.startScrollTop - deltaY;
  };

  const resetToFit = () => {
    scheduleFitReset();
  };

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const action = target.closest('[data-mermaid-lightbox-action]');
    if (!(action instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    const actionName = action.getAttribute('data-mermaid-lightbox-action');
    if (actionName === 'close') {
      close();
      return;
    }

    if (actionName === 'zoom-in') {
      setScaleAroundPoint(currentScale * 1.2);
      return;
    }

    if (actionName === 'zoom-out') {
      setScaleAroundPoint(currentScale / 1.2);
      return;
    }

    if (actionName === 'reset') {
      resetToFit();
    }
  });

  viewport.addEventListener('wheel', (event) => {
    if (!active) {
      return;
    }

    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const viewportRect = viewport.getBoundingClientRect();
    setScaleAroundPoint(currentScale * zoomFactor, {
      x: event.clientX - viewportRect.left,
      y: event.clientY - viewportRect.top,
    });
  }, { passive: false });

  viewport.addEventListener('mousedown', (event) => {
    beginPan(event);
  });

  viewport.addEventListener('mousemove', (event) => {
    updatePan(event);
  });

  window.addEventListener('mouseup', (event) => {
    if (!panState || event.button !== 2) {
      return;
    }

    stopPan();
  });

  viewport.addEventListener('contextmenu', (event) => {
    if (viewport.dataset.panSuppressContextMenu === 'true') {
      event.preventDefault();
      viewport.dataset.panSuppressContextMenu = 'false';
    }
  });

  viewport.addEventListener('mouseleave', (event) => {
    if ((event.buttons & 2) !== 2) {
      stopPan();
    }
  });

  viewport.addEventListener('pointerdown', (event) => {
    beginTouchInteraction(event);
  });

  viewport.addEventListener('pointermove', (event) => {
    updateTouchInteraction(event);
  });

  viewport.addEventListener('pointerup', (event) => {
    endTouchInteraction(event);
  });

  viewport.addEventListener('pointercancel', (event) => {
    endTouchInteraction(event);
  });

  return {
    open,
    close,
    handleKeydown(event) {
      if (!active) {
        return false;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return true;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        event.stopPropagation();
        setScaleAroundPoint(currentScale * 1.2);
        return true;
      }

      if (event.key === '-') {
        event.preventDefault();
        event.stopPropagation();
        setScaleAroundPoint(currentScale / 1.2);
        return true;
      }

      if (event.key === '0') {
        event.preventDefault();
        event.stopPropagation();
        resetToFit();
        return true;
      }

      return false;
    },
    handleResize() {
      if (!active) {
        return;
      }

      const relativeScale = fitScale > 0 ? currentScale / fitScale : 1;
      scheduleFitReset(relativeScale, true);
    },
  };
}

function getSvgDimensions(svg, fallbackElement) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return {
      width: viewBox.width,
      height: viewBox.height,
    };
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }

  const rect = fallbackElement instanceof HTMLElement ? fallbackElement.getBoundingClientRect() : undefined;
  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      width: rect.width,
      height: rect.height,
    };
  }

  return {
    width: 960,
    height: 720,
  };
}

function clearPresentationFrameStyles(slides) {
  for (const slide of slides) {
    const frame = slide.querySelector('.presentation-frame');
    const canvas = slide.querySelector('.presentation-canvas');
    if (frame instanceof HTMLElement) {
      frame.style.removeProperty('width');
      frame.style.removeProperty('height');
    }

    if (canvas instanceof HTMLElement) {
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
      canvas.style.removeProperty('left');
      canvas.style.removeProperty('top');
      canvas.style.removeProperty('transform');
    }
  }
}

function createPresentationFrameFitScheduler(slides) {
  let fitRequestId = 0;

  return {
    flush() {
      if (fitRequestId) {
        cancelAnimationFrame(fitRequestId);
        fitRequestId = 0;
      }

      fitPresentationFrames(slides);
    },
    queue() {
      if (fitRequestId) {
        cancelAnimationFrame(fitRequestId);
      }

      fitRequestId = requestAnimationFrame(() => {
        fitRequestId = requestAnimationFrame(() => {
          fitRequestId = 0;
          fitPresentationFrames(slides);
        });
      });
    },
  };
}

function updatePresentationBottomPanel({
  bottomBar,
  activePanelTab,
  currentIndex,
  slidePanelData,
  slideCount,
  notesContainer,
  infoContainer,
  fitMode,
  fitScheduler,
}) {
  if (!(bottomBar instanceof HTMLElement)) {
    return;
  }

  const panels = [...bottomBar.querySelectorAll('.presentation-bottom-panel')];
  const tabs = [...bottomBar.querySelectorAll('.presentation-tab')];
  const currentSlideData = Array.isArray(slidePanelData) ? slidePanelData[currentIndex] : null;

  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== activePanelTab;
  }

  for (const tab of tabs) {
    tab.classList.toggle('is-active', tab.dataset.panel === activePanelTab);
  }

  if (activePanelTab === 'notes' && notesContainer instanceof HTMLElement) {
    notesContainer.innerHTML = typeof currentSlideData?.notesHtml === 'string' ? currentSlideData.notesHtml : '';
  }

  if (activePanelTab === 'info' && infoContainer instanceof HTMLElement) {
    infoContainer.innerHTML = renderPresentationSlideInfoHtml(currentSlideData, currentIndex, slideCount);
  }

  if (fitMode === 'immediate') {
    fitScheduler.flush();
    return;
  }

  fitScheduler.queue();
}

function updatePresentationActiveSlideUi({
  slides,
  thumbnails,
  currentIndex,
  currentLabel,
  previousButton,
  nextButton,
}) {
  slides.forEach((slide, index) => {
    const active = index === currentIndex;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  thumbnails.forEach((thumbnail, index) => {
    thumbnail.classList.toggle('is-active', index === currentIndex);
  });

  if (currentLabel) {
    currentLabel.textContent = String(currentIndex + 1);
  }

  if (previousButton instanceof HTMLButtonElement) {
    previousButton.disabled = currentIndex === 0;
  }

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = currentIndex === slides.length - 1;
  }

  const activeThumbnail = thumbnails[currentIndex];
  if (activeThumbnail instanceof HTMLElement) {
    activeThumbnail.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

function updatePresentationFullscreenButton(fullscreenButton, enabled) {
  if (!(fullscreenButton instanceof HTMLButtonElement)) {
    return;
  }

  const label = enabled ? 'Exit full screen' : 'Enter full screen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('title', label);
  fullscreenButton.classList.toggle('is-active', enabled);
}

function observePresentationPreviewResize(previewRoot, slides, onResize) {
  if (typeof ResizeObserver !== 'function') {
    return;
  }

  const resizeObserver = new ResizeObserver(() => {
    onResize();
  });

  if (previewRoot instanceof HTMLElement) {
    resizeObserver.observe(previewRoot);
  }

  for (const slide of slides) {
    const shell = slide.querySelector('.presentation-slide-shell');
    if (shell instanceof HTMLElement) {
      resizeObserver.observe(shell);
    }
  }
}

function parsePresentationSlideData(previewRoot) {
  const slideDataElement = previewRoot instanceof HTMLElement
    ? previewRoot.querySelector('[data-presentation-slide-data]')
    : null;
  if (!(slideDataElement instanceof HTMLScriptElement)) {
    return [];
  }

  try {
    const parsed = JSON.parse(slideDataElement.textContent ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderPresentationSlideInfoHtml(slideData, currentIndex, slideCount) {
  const templateName = typeof slideData?.templateName === 'string' ? slideData.templateName : '';
  const title = typeof slideData?.title === 'string' ? slideData.title : '';
  return `
    <dl class="presentation-info-list">
      <div class="presentation-info-row">
        <dt>slide</dt>
        <dd>${escapePresentationHtml(templateName)}</dd>
      </div>
      <div class="presentation-info-row">
        <dt>position</dt>
        <dd>${currentIndex + 1} / ${slideCount}</dd>
      </div>
      <div class="presentation-info-row">
        <dt>title</dt>
        <dd>${escapePresentationHtml(title)}</dd>
      </div>
    </dl>`;
}

function escapePresentationHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initializePresentationPreview(bridge) {
  const slides = [...document.querySelectorAll('.presentation-slide')];
  if (slides.length === 0) {
    return;
  }

  const thumbnails = [...document.querySelectorAll('.presentation-thumb')];
  const currentLabel = document.querySelector('[data-presentation-current]');
  const previousButton = document.querySelector('[data-presentation-action="previous"]');
  const nextButton = document.querySelector('[data-presentation-action="next"]');
  const fullscreenButton = document.querySelector('[data-presentation-action="fullscreen"]');
  const bottomBar = document.querySelector('[data-presentation-bottom-bar]');
  const notesContainer = document.querySelector('[data-presentation-panel-notes]');
  const infoContainer = document.querySelector('[data-presentation-panel-info]');
  const previewRoot = document.querySelector('.presentation-preview');
  const stage = document.querySelector('.presentation-stage');
  const slidePanelData = parsePresentationSlideData(previewRoot);
  const state = bridge.getState() ?? {};
  const fitScheduler = createPresentationFrameFitScheduler(slides);
  let currentIndex = clampIndex(Number.isInteger(state.presentationSlideIndex) ? state.presentationSlideIndex : 0, slides.length);
  let activePanelTab = typeof state.presentationActivePanelTab === 'string' ? state.presentationActivePanelTab : null;
  let immersiveMode = state.presentationImmersiveMode === true;
  let pendingStageTapId = null;

  const updateBottomPanel = (fitMode = 'deferred') => {
    updatePresentationBottomPanel({
      bottomBar,
      activePanelTab,
      currentIndex,
      slidePanelData,
      slideCount: slides.length,
      notesContainer,
      infoContainer,
      fitMode,
      fitScheduler,
    });
  };

  let isSlideZoomed = false;

  const updateSlideZoomClass = () => {
    stage?.classList.toggle('is-slide-zoomed', isSlideZoomed);
  };

  const persistState = () => {
    bridge.setState({
      ...state,
      presentationSlideIndex: currentIndex,
      presentationActivePanelTab: activePanelTab,
      presentationImmersiveMode: immersiveMode,
      presentationSlideZoomed: isSlideZoomed,
    });
  };

  const setImmersiveMode = (enabled) => {
    immersiveMode = enabled;
    document.body.classList.toggle('presentation-is-immersive', enabled);
    clearPresentationFrameStyles(slides);
    void document.body.offsetHeight;

    updatePresentationFullscreenButton(fullscreenButton, enabled);
    fitScheduler.queue();
  };

  const setActiveSlide = (nextIndex) => {
    currentIndex = clampIndex(nextIndex, slides.length);

    for (const slide of slides) {
      const canvas = slide.querySelector('.presentation-canvas');
      if (canvas instanceof HTMLElement) {
        canvas.dataset.userZoom = '1';
        canvas.dataset.panX = '0';
        canvas.dataset.panY = '0';
      }
    }
    isSlideZoomed = false;
    updateSlideZoomClass();

    updatePresentationActiveSlideUi({
      slides,
      thumbnails,
      currentIndex,
      currentLabel,
      previousButton,
      nextButton,
    });

    updateBottomPanel('immediate');
    persistState();
  };

  const clearPendingStageTap = () => {
    if (pendingStageTapId !== null) {
      window.clearTimeout(pendingStageTapId);
      pendingStageTapId = null;
    }
  };

  const isInteractiveTapTarget = (target) => {
    return Boolean(target.closest('a, button, input, textarea, select, label, summary, [data-mermaid-action], .mermaid-rendered, .presentation-thumb'));
  };

  const navigateFromStageTap = (event) => {
    if (!(event.target instanceof Element) || isInteractiveTapTarget(event.target)) {
      return;
    }

    const activeSlide = slides[currentIndex];
    const activeFrame = activeSlide?.querySelector('.presentation-frame');
    const referenceElement = activeFrame instanceof HTMLElement
      ? activeFrame
      : (stage instanceof HTMLElement ? stage : null);
    if (!(referenceElement instanceof HTMLElement)) {
      return;
    }

    const rect = referenceElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const runSingleTapNavigation = () => {
      pendingStageTapId = null;
      const relativeX = (event.clientX - rect.left) / rect.width;
      if (relativeX <= 0.35) {
        setActiveSlide(currentIndex - 1);
        return;
      }

      setActiveSlide(currentIndex + 1);
    };

    if (pendingStageTapId !== null) {
      clearPendingStageTap();
      const activeCanvas = slides[currentIndex]?.querySelector('.presentation-canvas');
      const zoom = activeCanvas instanceof HTMLElement ? (parseFloat(activeCanvas.dataset.userZoom ?? '1') || 1) : 1;
      if (zoom > 1) {
        if (activeCanvas instanceof HTMLElement) {
          activeCanvas.dataset.userZoom = '1';
          activeCanvas.dataset.panX = '0';
          activeCanvas.dataset.panY = '0';
        }
        isSlideZoomed = false;
        updateSlideZoomClass();
        fitScheduler.flush();
        persistState();
        return;
      }
      runSingleTapNavigation();
      return;
    }

    pendingStageTapId = window.setTimeout(runSingleTapNavigation, 220);
  };

  previousButton?.addEventListener('click', () => {
    setActiveSlide(currentIndex - 1);
  });

  nextButton?.addEventListener('click', () => {
    setActiveSlide(currentIndex + 1);
  });

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
      const target = Number.parseInt(thumbnail.getAttribute('data-slide-target') ?? '0', 10);
      setActiveSlide(target);
    });
  });

  bottomBar?.addEventListener('click', (event) => {
    const tab = event.target instanceof Element ? event.target.closest('.presentation-tab') : null;
    if (!(tab instanceof HTMLElement)) {
      return;
    }

    const panel = tab.dataset.panel ?? null;
    activePanelTab = panel === activePanelTab ? null : panel;
    updateBottomPanel('immediate');
    persistState();
  });

  fullscreenButton?.addEventListener('click', () => {
    setImmersiveMode(!immersiveMode);
    persistState();
  });

  stage?.addEventListener('click', navigateFromStageTap);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      setActiveSlide(currentIndex - 1);
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      setActiveSlide(currentIndex + 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveSlide(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveSlide(slides.length - 1);
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setImmersiveMode(!immersiveMode);
      persistState();
      return;
    }

    if (event.key === 'Escape' && immersiveMode) {
      event.preventDefault();
      setImmersiveMode(false);
      persistState();
    }
  });

  window.addEventListener('resize', () => {
    clearPendingStageTap();
    fitScheduler.queue();
  });

  observePresentationPreviewResize(previewRoot, slides, () => {
    clearPendingStageTap();
    fitScheduler.queue();
  });

  window.__setPresentationImmersiveMode = (enabled) => {
    clearPendingStageTap();
    setImmersiveMode(Boolean(enabled));
    persistState();
  };

  window.__resetPresentationSlideZoom = () => {
    for (const slide of slides) {
      const canvas = slide.querySelector('.presentation-canvas');
      if (canvas instanceof HTMLElement) {
        canvas.dataset.userZoom = '1';
        canvas.dataset.panX = '0';
        canvas.dataset.panY = '0';
      }
    }
    isSlideZoomed = false;
    updateSlideZoomClass();
    fitScheduler.flush();
    persistState();
  };

  // Pinch-to-zoom (centered) + single-finger pan on the active slide canvas
  {
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchStartPanX = 0;
    let pinchStartPanY = 0;
    let pinchCenterCanvasX = 0;
    let pinchCenterCanvasY = 0;
    let pinchBaseScale = 1;
    let pinchOffsetLeft = 0;
    let pinchOffsetTop = 0;
    let pinchCanvas = null;
    let isPinching = false;

    let panStartX = 0;
    let panStartY = 0;
    let panStartPanX = 0;
    let panStartPanY = 0;
    let panCanvas = null;
    let isPanning = false;
    let panMoved = false;

    const getPinchDist = (touches) =>
      Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY
      );

    const getPinchCenter = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const buildTransform = (panX, panY, scale) =>
      scale === 1 ? `scale(1)` : `translate(${panX}px, ${panY}px) scale(${scale})`;

    // Compute base fit-scale and centering offsets for the active slide
    const computeFitGeometry = (active, canvas) => {
      const shell = active.querySelector('.presentation-slide-shell');
      const frame = active.querySelector('.presentation-frame');
      if (!(shell instanceof HTMLElement) || !(frame instanceof HTMLElement)) {
        return { baseScale: 1, offsetLeft: 0, offsetTop: 0 };
      }
      const ratio = parsePresentationRatio(frame.dataset.presentationRatio);
      const dw = parsePresentationDimension(canvas.dataset.designWidth, ratio * 720);
      const dh = parsePresentationDimension(canvas.dataset.designHeight, dw / ratio);
      const aw = shell.clientWidth;
      const ah = shell.clientHeight;
      const wfh = ah * ratio;
      const fw = Math.min(aw, wfh);
      const fh = fw / ratio;
      const baseScale = Math.min(fw / dw, fh / dh);
      const offsetLeft = (fw - dw * baseScale) / 2;
      const offsetTop = (fh - dh * baseScale) / 2;
      return { baseScale, offsetLeft, offsetTop };
    };

    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // --- Pinch start ---
        isPanning = false;
        isPinching = true;
        pinchStartDist = getPinchDist(e.touches);
        const active = slides[currentIndex];
        const canvas = active instanceof HTMLElement
          ? active.querySelector('.presentation-canvas')
          : null;
        pinchCanvas = canvas instanceof HTMLElement ? canvas : null;
        pinchStartZoom = pinchCanvas
          ? (parseFloat(pinchCanvas.dataset.userZoom ?? '1') || 1)
          : 1;
        pinchStartPanX = pinchCanvas ? (parseFloat(pinchCanvas.dataset.panX ?? '0') || 0) : 0;
        pinchStartPanY = pinchCanvas ? (parseFloat(pinchCanvas.dataset.panY ?? '0') || 0) : 0;

        if (pinchCanvas && active instanceof HTMLElement) {
          const geo = computeFitGeometry(active, pinchCanvas);
          pinchBaseScale = geo.baseScale;
          pinchOffsetLeft = geo.offsetLeft;
          pinchOffsetTop = geo.offsetTop;

          // Map pinch center to canvas coordinates
          const canvasRect = pinchCanvas.parentElement?.getBoundingClientRect() ?? pinchCanvas.getBoundingClientRect();
          const pc = getPinchCenter(e.touches);
          const S = pinchBaseScale * pinchStartZoom;
          pinchCenterCanvasX = (pc.x - canvasRect.left - pinchOffsetLeft - pinchStartPanX) / S;
          pinchCenterCanvasY = (pc.y - canvasRect.top - pinchOffsetTop - pinchStartPanY) / S;
        }
        e.preventDefault();
        return;
      }

      if (e.touches.length === 1 && !isPinching) {
        // --- Pan start (only when zoomed) ---
        const active = slides[currentIndex];
        const canvas = active instanceof HTMLElement
          ? active.querySelector('.presentation-canvas')
          : null;
        if (!(canvas instanceof HTMLElement)) { return; }
        const zoom = parseFloat(canvas.dataset.userZoom ?? '1') || 1;
        if (zoom <= 1) { return; }
        panCanvas = canvas;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panStartPanX = parseFloat(canvas.dataset.panX ?? '0') || 0;
        panStartPanY = parseFloat(canvas.dataset.panY ?? '0') || 0;
        if (active instanceof HTMLElement) {
          pinchBaseScale = computeFitGeometry(active, canvas).baseScale;
        }
        isPanning = true;
        panMoved = false;
      }
    }, { passive: false });

    stage.addEventListener('touchmove', (e) => {
      // --- Pinch move ---
      if (isPinching && e.touches.length === 2 && pinchCanvas) {
        const dist = getPinchDist(e.touches);
        const rawZoom = pinchStartZoom * (dist / pinchStartDist);
        const clampedZoom = Math.min(4, Math.max(1, rawZoom));
        const S_new = pinchBaseScale * clampedZoom;

        // Translate so the pinch center stays fixed on screen
        const S_start = pinchBaseScale * pinchStartZoom;
        const newPanX = pinchStartPanX + pinchCenterCanvasX * (S_start - S_new);
        const newPanY = pinchStartPanY + pinchCenterCanvasY * (S_start - S_new);

        pinchCanvas.dataset.userZoom = String(clampedZoom);
        pinchCanvas.dataset.panX = String(newPanX);
        pinchCanvas.dataset.panY = String(newPanY);
        pinchCanvas.style.transform = buildTransform(newPanX, newPanY, S_new);
        // Only enable overflow:visible during pinch — never remove it mid-gesture
        // (removing it mid-pinch clips the canvas while it still has a translate).
        // isSlideZoomed is finalized in onTouchEnd.
        if (!isSlideZoomed && clampedZoom > 1) {
          isSlideZoomed = true;
          updateSlideZoomClass();
        }
        e.preventDefault();
        return;
      }

      // --- Pan move ---
      if (isPanning && e.touches.length === 1 && panCanvas) {
        const dx = e.touches[0].clientX - panStartX;
        const dy = e.touches[0].clientY - panStartY;
        if (!panMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) { return; }
        panMoved = true;
        const newPanX = panStartPanX + dx;
        const newPanY = panStartPanY + dy;
        const zoom = parseFloat(panCanvas.dataset.userZoom ?? '1') || 1;
        const S = pinchBaseScale * zoom;
        panCanvas.dataset.panX = String(newPanX);
        panCanvas.dataset.panY = String(newPanY);
        panCanvas.style.transform = buildTransform(newPanX, newPanY, S);
        e.preventDefault();
      }
    }, { passive: false });

    const onTouchEnd = (e) => {
      if (isPinching) {
        // Only end pinch when fewer than 2 fingers remain
        if (e.touches.length < 2) {
          if (pinchCanvas) {
            const endZoom = parseFloat(pinchCanvas.dataset.userZoom ?? '1') || 1;
            if (endZoom <= 1) {
              // Zero out stale pan so the next pinch starts from a clean state
              // (non-zero panX/panY at zoom=1 would cause a teleport jump on
              // the next gesture because buildTransform ignores translate at zoom=1
              // but pinchStartPanX would pick it up).
              pinchCanvas.dataset.panX = '0';
              pinchCanvas.dataset.panY = '0';
              isSlideZoomed = false;
            } else {
              isSlideZoomed = true;
            }
            updateSlideZoomClass();
          }
          pinchCanvas = null;
          isPinching = false;
          fitScheduler.flush();
          persistState();
        }
      }
      if (isPanning && e.touches.length === 0) {
        if (panMoved) {
          fitScheduler.flush();
          persistState();
        }
        panCanvas = null;
        isPanning = false;
      }
    };

    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', (e) => {
      isPinching = false;
      pinchCanvas = null;
      isPanning = false;
      panCanvas = null;
    });
  }

  setImmersiveMode(immersiveMode);
  setActiveSlide(currentIndex);
}

function fitPresentationFrames(slides = [...document.querySelectorAll('.presentation-slide')]) {
  for (const slide of slides) {
    if (!(slide instanceof Element) || !slide.classList.contains('is-active')) {
      continue;
    }

    const shell = slide.querySelector('.presentation-slide-shell');
    const frame = slide.querySelector('.presentation-frame');
    const canvas = slide.querySelector('.presentation-canvas');
    if (!(shell instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
      continue;
    }

    const ratio = parsePresentationRatio(frame.dataset.presentationRatio);
    const designWidth = parsePresentationDimension(canvas.dataset.designWidth, ratio * 720);
    const designHeight = parsePresentationDimension(canvas.dataset.designHeight, designWidth / ratio);
    const availableWidth = shell.clientWidth;
    const availableHeight = shell.clientHeight;

    if (availableWidth <= 0 || availableHeight <= 0 || ratio <= 0 || designWidth <= 0 || designHeight <= 0) {
      frame.style.removeProperty('width');
      frame.style.removeProperty('height');
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
      canvas.style.removeProperty('left');
      canvas.style.removeProperty('top');
      canvas.style.removeProperty('transform');
      continue;
    }

    const widthFromHeight = availableHeight * ratio;
    const fittedWidth = Math.min(availableWidth, widthFromHeight);
    const fittedHeight = fittedWidth / ratio;
    const scale = Math.min(fittedWidth / designWidth, fittedHeight / designHeight);
    const userZoom = parseFloat(canvas.dataset.userZoom ?? '1') || 1;
    const panX = parseFloat(canvas.dataset.panX ?? '0') || 0;
    const panY = parseFloat(canvas.dataset.panY ?? '0') || 0;
    const offsetLeft = (fittedWidth - designWidth * scale) / 2;
    const offsetTop = (fittedHeight - designHeight * scale) / 2;

    frame.style.width = `${fittedWidth}px`;
    frame.style.height = `${fittedHeight}px`;
    canvas.style.width = `${designWidth}px`;
    canvas.style.height = `${designHeight}px`;
    canvas.style.left = `${offsetLeft}px`;
    canvas.style.top = `${offsetTop}px`;
    canvas.style.transform = userZoom === 1
      ? `scale(${scale})`
      : `translate(${panX}px, ${panY}px) scale(${scale * userZoom})`;
  }
}

function parsePresentationDimension(value, fallback) {
  const parsed = Number.parseFloat(value ?? '');
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parsePresentationRatio(value) {
  if (typeof value !== 'string') {
    return 16 / 9;
  }

  const parts = value.split(':').map((part) => Number.parseFloat(part));
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part) && part > 0)) {
    return parts[0] / parts[1];
  }

  return 16 / 9;
}

function initializeImageFallback(bridge, eagerlyResolvePresentationImages) {
  const pendingRequests = new Map();

  const requestResolution = (image) => {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    if (image.dataset.imageResolved === 'true' || image.dataset.imageResolveRequested === 'true') {
      return;
    }

    const source = image.getAttribute('data-source-src') ?? image.getAttribute('src');
    if (!source) {
      image.classList.add('image-load-failed');
      return;
    }

    const requestId = `image-${Math.random().toString(36).slice(2, 10)}`;
    image.dataset.imageResolveRequested = 'true';
    pendingRequests.set(requestId, image);
    bridge.resolveImage(requestId, source);
  };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.command !== 'resolveImageResult' || typeof message.requestId !== 'string') {
      return;
    }

    const image = pendingRequests.get(message.requestId);
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    pendingRequests.delete(message.requestId);
    if (typeof message.dataUrl === 'string' && message.dataUrl) {
      image.src = message.dataUrl;
      image.dataset.imageResolved = 'true';
      image.dataset.imageResolveRequested = 'false';
      image.classList.remove('image-load-failed');
      return;
    }

    image.classList.add('image-load-failed');
  });

  document.addEventListener('error', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    if (target.dataset.imageResolved === 'true' || target.dataset.imageResolveRequested === 'true') {
      target.classList.add('image-load-failed');
      return;
    }

    requestResolution(target);
  }, true);

  if (eagerlyResolvePresentationImages) {
    const presentationImages = [...document.querySelectorAll('.presentation-slide img[data-source-src]')];
    for (const image of presentationImages) {
      requestResolution(image);
    }
  }
}

function clampIndex(index, totalSlides) {
  if (totalSlides <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), totalSlides - 1);
}
