// Markdown rendering
export { createMarkdownRenderer, sanitizeRenderedHtml } from './render/markdownRenderer';

// Declarative visualization validation, shared with browser renderers and AI tools.
export { parseVisualizationBlock, VISUALIZATION_LIMITS } from './visualizations/visualizationSpec';
export type { VisualizationKind, VisualizationBlock, VisualizationParseResult, VegaLiteSpec, VegaLiteFieldDefinition, MetricSpec } from './visualizations/visualizationSpec';

// Presentation parsing
export {
  parseMarkdownPresentation,
  resolveMarkdownPresentation,
  isMarkdownPresentationSource,
  getMarkdownDocumentKind,
  extractMarkdownFrontMatterMeta,
  stripMarkdownFrontMatter,
} from './presentation/mpsParser';
export type {
  PresentationMetadata,
  MarkdownPresentationSlide,
  MarkdownPresentation,
  MarkdownDocumentKind,
} from './presentation/mpsParser';

// MPS language service
export {
  validateMpsSource,
  getMpsCompletions,
  getMpsHover,
  getMpsQuickFixes,
  getSlideTypeMigrations,
} from './presentation/mpsLanguageService';
export type {
  MpsValidationSeverity,
  MpsIssueCode,
  MpsValidationIssue,
  MpsCompletionKind,
  MpsCompletionEntry,
  MpsHoverEntry,
  MpsQuickFix,
} from './presentation/mpsLanguageService';

// MPS schema
export { createMpsDocumentSchema, createMarkdownDocumentSchema } from './presentation/mpsSchema';
export type {
  MpsFieldKind,
  MpsFrontMatterFieldSchema,
  MpsDirectiveSchema,
  MpsDocumentSchema,
} from './presentation/mpsSchema';

// Slide layout utilities
export { distributeItemsAcrossSlots } from './presentation/sectionDistribution';
export { PRESENTATION_SLIDE_TYPES, LEGACY_SLIDE_TYPE_REPLACEMENTS, normalizePresentationSlideType, splitPresentationColumns } from './presentation/slideTypes';
export type { PresentationSlideType, SlideTypeMigration } from './presentation/slideTypes';

// Table formatting
export { formatMarkdownTables } from './format/markdownTableFormatter';

