import type { VisualizationBlock, VisualizationKind } from '@mfo/core';

export type VisualizationTheme = {
  foreground: string;
  muted: string;
  border: string;
  background: string;
  accent: string;
  palette: string[];
  fontFamily: string;
};

export type VisualizationContext = { theme: VisualizationTheme; signal: AbortSignal };

/** The coordinator owns DOM/lifecycle concerns; adapters own library instances. */
export interface VisualizationAdapter {
  readonly kind: VisualizationKind;
  mount(container: HTMLElement, block: VisualizationBlock, context: VisualizationContext): Promise<VisualizationHandle>;
}

export interface VisualizationHandle {
  resize(width: number): void | Promise<void>;
  /** Safe to call repeatedly, including after cancellation. */
  dispose(): void;
}
