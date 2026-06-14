(function (global) {
  function isHostDarkMode(body) {
    return Boolean(body?.classList?.contains('vscode-dark') || body?.classList?.contains('vscode-high-contrast'));
  }

  function normalizeDocumentThemeMode(value) {
    return value === 'dark' || value === 'light' || value === 'auto'
      ? value
      : 'auto';
  }

  function normalizeMermaidTheme(value, fallbackValue) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallbackValue;
  }

  function normalizeBooleanData(value) {
    return value === true || value === 'true';
  }

  function resolveDocumentThemeState(options) {
    var documentThemeMode = normalizeDocumentThemeMode(options?.documentThemeMode);
    var hostIsDark = Boolean(options?.hostIsDarkMode);
    var useDarkDocumentTheme = documentThemeMode === 'dark' || (documentThemeMode === 'auto' && hostIsDark);
    var lightMermaidTheme = normalizeMermaidTheme(options?.lightMermaidTheme, 'default');
    var darkMermaidTheme = normalizeMermaidTheme(options?.darkMermaidTheme, 'dark');
    var mermaidTheme = useDarkDocumentTheme ? darkMermaidTheme : lightMermaidTheme;
    var mermaidTransparentBackground = useDarkDocumentTheme
      ? normalizeBooleanData(options?.darkMermaidTransparentBackground)
      : normalizeBooleanData(options?.lightMermaidTransparentBackground);

    return {
      themeMode: documentThemeMode,
      mermaidTheme: mermaidTheme,
      isMermaidDark: mermaidTheme === 'dark',
      mermaidTransparentBackground: mermaidTransparentBackground,
    };
  }

  function resolvePresentationThemeState(options) {
    var hostIsDark = Boolean(options?.hostIsDarkMode);
    var mermaidTheme = hostIsDark
      ? normalizeMermaidTheme(options?.darkMermaidTheme, 'dark')
      : normalizeMermaidTheme(options?.lightMermaidTheme, 'default');
    var mermaidTransparentBackground = hostIsDark
      ? normalizeBooleanData(options?.darkMermaidTransparentBackground)
      : normalizeBooleanData(options?.lightMermaidTransparentBackground);

    return {
      mermaidTheme: mermaidTheme,
      isMermaidDark: mermaidTheme === 'dark',
      mermaidTransparentBackground: mermaidTransparentBackground,
    };
  }

  function resolvePreviewThemeState(options) {
    var previewMode = options?.previewMode === 'presentation' ? 'presentation' : 'document';
    var body = options?.body;
    var previewRoot = options?.previewRoot;
    var hostIsDark = typeof options?.hostIsDarkMode === 'boolean'
      ? options.hostIsDarkMode
      : isHostDarkMode(body);

    if (previewMode === 'presentation') {
      var presentationThemeState = resolvePresentationThemeState({
        hostIsDarkMode: hostIsDark,
        lightMermaidTheme: previewRoot?.dataset?.presentationMermaidThemeLight,
        darkMermaidTheme: previewRoot?.dataset?.presentationMermaidThemeDark,
        lightMermaidTransparentBackground: previewRoot?.dataset?.presentationMermaidTransparentBackgroundLight,
        darkMermaidTransparentBackground: previewRoot?.dataset?.presentationMermaidTransparentBackgroundDark,
      });

      return {
        previewMode: previewMode,
        hostIsDarkMode: hostIsDark,
        mermaidTheme: presentationThemeState.mermaidTheme,
        isMermaidDark: presentationThemeState.isMermaidDark,
        mermaidTransparentBackground: presentationThemeState.mermaidTransparentBackground,
      };
    }

    var documentThemeState = resolveDocumentThemeState({
      hostIsDarkMode: hostIsDark,
      documentThemeMode: body?.dataset?.documentThemeMode,
      lightMermaidTheme: body?.dataset?.documentMermaidThemeLight,
      darkMermaidTheme: body?.dataset?.documentMermaidThemeDark,
      lightMermaidTransparentBackground: body?.dataset?.documentMermaidTransparentBackgroundLight,
      darkMermaidTransparentBackground: body?.dataset?.documentMermaidTransparentBackgroundDark,
    });

    return {
      previewMode: previewMode,
      hostIsDarkMode: hostIsDark,
      themeMode: documentThemeState.themeMode,
      mermaidTheme: documentThemeState.mermaidTheme,
      isMermaidDark: documentThemeState.isMermaidDark,
      mermaidTransparentBackground: documentThemeState.mermaidTransparentBackground,
    };
  }

  global.__mfoPreviewThemeRuntime = {
    isHostDarkMode: isHostDarkMode,
    normalizeDocumentThemeMode: normalizeDocumentThemeMode,
    normalizeBooleanData: normalizeBooleanData,
    resolveDocumentThemeState: resolveDocumentThemeState,
    resolvePresentationThemeState: resolvePresentationThemeState,
    resolvePreviewThemeState: resolvePreviewThemeState,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
