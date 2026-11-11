import { isAlias, isMap, isScalar, isSeq, parseAllDocuments } from 'yaml';
import MarkdownIt from 'markdown-it';
import { bundledComponents, type BundledComponent } from '@mfo/bundled-components';

// The bundled catalog supplies component behavior through a shared contract.
type ComponentDefinition = BundledComponent;
const componentDefinitions = bundledComponents;
type ComponentResult = { valid: true; type: string; value: unknown; definition: ComponentDefinition } | { valid: false; error: string; offset: number };
const MAX_SOURCE = 32_768;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor', '<<']);

class ComponentError extends Error {
  constructor(message: string, readonly offset = 0) { super(message); }
}
function fail(message: string, offset = 0): never { throw new ComponentError(message, offset); }
function mapping(value: unknown, path: string, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be a mapping.`);
  const result = value as Record<string, unknown>;
  if (keys) for (const key of Object.keys(result)) if (!keys.includes(key)) fail(`${path}.${key} is not supported.`);
  return result;
}

export function parseComponent(source: string): ComponentResult {
  try {
    if (source.length > MAX_SOURCE) fail('Component exceeds the 32,768 character limit.');
    const documents = parseAllDocuments(source, { uniqueKeys: true, strict: true, merge: false, version: '1.2' });
    if (documents.length !== 1) fail('Use exactly one YAML document in a component.');
    const doc = documents[0];
    if (doc.errors.length) fail(doc.errors[0].message.split('\n')[0], doc.errors[0].pos[0]);
    const stack: { node: any; depth: number }[] = [{ node: doc.contents, depth: 0 }];
    let count = 0;
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      if (!node) continue;
      if (++count > 2_000 || depth > 12) fail('Component exceeds the nesting or item limit.', node.range?.[0]);
      if (isAlias(node) || node.anchor || node.tag) fail('Aliases, anchors and explicit tags are not supported.', node.range?.[0]);
      if (isMap(node)) {
        for (const pair of node.items) {
          if (!isScalar(pair.key) || typeof pair.key.value !== 'string') fail('Mapping keys must be text.', (pair.key as { range?: number[] } | null)?.range?.[0]);
          if (forbiddenKeys.has(pair.key.value)) fail('This mapping key is not supported.', pair.key.range?.[0]);
          stack.push({ node: pair.key, depth: depth + 1 }, { node: pair.value, depth: depth + 1 });
        }
      } else if (isSeq(node)) {
        for (const child of node.items) stack.push({ node: child, depth: depth + 1 });
      } else if (isScalar(node)) {
        const value = node.value;
        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) fail('Unsupported YAML value.', node.range?.[0]);
      } else fail('Unsupported YAML structure.');
    }
    const envelope = mapping(doc.toJS({ maxAliasCount: 0 }), 'component', ['type', 'version', 'data', 'options']);
    const definition = componentDefinitions.find(item => item.type === envelope.type);
    if (!definition) fail('Unknown component type. Supported types: ' + componentDefinitions.map(item => item.type).join(', ') + '.');
    if (envelope.version !== definition.version) fail('Use component version: ' + definition.version + '.');
    const options = envelope.options === undefined ? {} : mapping(envelope.options, 'options');
    return { valid: true, type: definition.type, definition, value: definition.parse(envelope.data, doc, options) };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid component.', offset: error instanceof ComponentError ? error.offset : error instanceof Error && 'fragment' in error && typeof error.fragment === 'string' ? Math.max(0, source.indexOf(error.fragment)) : 0 };
  }
}

function escape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}
export function renderComponent(source: string): string {
  const result = parseComponent(source);
  if (!result.valid) {
    const line = source.slice(0, result.offset).split(/\r?\n/u).length;
    const preview = source.slice(0, 16_384);
    return `<section class="md-component-error" role="group" aria-label="Invalid component"><p>Invalid component at component line ${line}: ${escape(result.error)}</p><pre><code>${escape(preview)}</code></pre>${source.length > preview.length ? '<p>Source preview truncated; the complete source remains in the document.</p>' : ''}</section>\n`;
  }
  return result.definition.render(result.value);
}

export function formatComponentTables(source: string): string {
  return componentDefinitions.reduce((text, definition) => definition.formatTables
    ? definition.formatTables(text, candidate => { const parsed = parseComponent(candidate); return parsed.valid && parsed.type === definition.type; })
    : text, source);
}

export function getComponentCompletions() {
  return componentDefinitions.flatMap(definition => definition.completion ? [definition.completion] : []);
}

export function prepareComponentsForPptx(document: globalThis.Document): void {
  for (const definition of componentDefinitions) definition.preparePptx?.(document);
}

export function getComponentPptxWarnings(source: string, template = false): string[] {
  if (!/(?:`{3,}|~{3,})[ \t]*component(?:[ \t]|$)/imu.test(source)) return [];
  const warnings = new Set<string>();
  for (const token of new MarkdownIt().parse(source, {})) {
    if (token.type !== 'fence' || token.info.trim().split(/\s+/u)[0]?.toLowerCase() !== 'component') continue;
    const result = parseComponent(token.content);
    if (!result.valid) continue;
    const warning = result.definition.pptxWarning?.(result.value);
    if (warning) warnings.add('Component: ' + warning);
    if (template && result.definition.templateWarning) warnings.add('Component: ' + result.definition.templateWarning);
  }
  return [...warnings];
}
