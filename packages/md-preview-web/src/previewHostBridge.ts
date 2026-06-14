/**
 * Platform-agnostic bridge between the browser-side preview runtime
 * and the host application (VS Code extension, Android WebView, etc.).
 *
 * Each host environment provides its own implementation of this interface.
 * The browser preview code calls these methods instead of platform-specific
 * APIs like `acquireVsCodeApi()` or Android `JavascriptInterface`.
 */
export type PreviewHostBridge = {
  /**
   * Open a link in the host's default handler.
   * External URLs open in a browser; local paths open via the host's file system.
   */
  openLink(href: string): void;

  /**
   * Request the host to resolve an image path to a data URL.
   * The host calls `onResolveImageResult` when ready.
   */
  resolveImage(requestId: string, src: string): void;

  /**
   * Persist preview state (current slide index, active panel, immersive mode, etc.).
   * The host stores this and returns it via `getState()` on next load.
   */
  setState(state: PreviewState): void;

  /**
   * Retrieve the last persisted preview state, or `undefined` if none exists.
   */
  getState(): PreviewState | undefined;
};

export type PreviewState = {
  presentationSlideIndex?: number;
  presentationActivePanelTab?: string | null;
  presentationImmersiveMode?: boolean;
};

/**
 * Callback signature for receiving resolved image data from the host.
 */
export type ResolveImageResultCallback = (requestId: string, dataUrl: string | undefined) => void;
