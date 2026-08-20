// Preview host bridge
export type {
  PreviewHostBridge,
  PreviewState,
  ResolveImageResultCallback,
} from './previewHostBridge';

// Presentation preview rendering
export { renderPresentationPreview } from './presentation/presentationPreview';
export type { PresentationPreview, CreateDocument } from './presentation/presentationPreview';

// Presentation theme registry
export {
  loadPreviewThemeRegistry,
  loadPreviewThemeRegistryFromDirectories,
  loadPreviewThemeRegistryFromData,
  buildPreviewThemeStylesheet,
  buildPreviewThemeCssArtifact,
  resolvePreviewThemeSelection,
  getPreviewThemeTokenContract,
} from './presentation/previewThemeRegistry';
export type {
  PreviewThemeMode,
  PreviewThemeDefinition,
  ResolvedPreviewTheme,
  PreviewThemeRegistry,
  PreviewThemeSelection,
} from './presentation/previewThemeRegistry';

// Document theme registry
export {
  loadDocumentThemeRegistryFromDirectories,
  loadDocumentThemeRegistryFromData,
  buildDocumentThemeStylesheet,
  buildDocumentThemeCssArtifact,
  resolveDocumentThemeSelection,
  getDocumentThemeTokenContract,
} from './document/documentThemeRegistry';
export type { ThemeCssArtifact } from './themeCssArtifact';
export type {
  DocumentThemeMode,
  DocumentThemeDefinition,
  ResolvedDocumentTheme,
  DocumentThemeRegistry,
  DocumentThemeSelection,
} from './document/documentThemeRegistry';
