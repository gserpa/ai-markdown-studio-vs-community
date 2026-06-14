// Markdown rendering
export { createMarkdownRenderer, sanitizeRenderedHtml } from './render/markdownRenderer';

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

// Table formatting
export { formatMarkdownTables } from './format/markdownTableFormatter';

