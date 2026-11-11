import type { Document as YamlDocument } from 'yaml';
import { statusMatrixComponent } from '@mfo/component-status-matrix';
import { recordListComponent } from '@mfo/component-record-list';
import { factCardsComponent } from '@mfo/component-fact-cards';

export type BundledComponent = {
  type: string; version: number; stylesheet?: string;
  completion?: { label: string; detail: string; documentation?: string; insertText: string };
  authoringInstructions?: string[];
  parse(data: unknown, document: YamlDocument, options: unknown): unknown;
  render(value: any): string;
  formatTables?(source: string, validate: (source: string) => boolean): string;
  preparePptx?(document: globalThis.Document): void;
  pptxWarning?(value: any): string | undefined;
  templateWarning?: string;
};

/** Static composition of the components included in this application. */
export const bundledComponents: BundledComponent[] = [statusMatrixComponent, recordListComponent, factCardsComponent];
