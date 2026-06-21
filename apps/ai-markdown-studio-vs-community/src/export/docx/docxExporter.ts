import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as vscode from 'vscode';
import HtmlToDocx from 'html-to-docx';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { buildExportHtmlString } from '../html/htmlExporter';
import { guessMimeType } from '../../util/imageMime';

type BookmarkTarget = {
  id: string;
  text: string;
};

export async function exportMarkdownAsBasicDocx(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
  const defaultTarget = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${path.parse(document.fileName).name}.docx`));
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri: defaultTarget,
    filters: {
      Word: ['docx'],
    },
    saveLabel: 'Export DOCX',
  });

  if (!targetUri) {
    return undefined;
  }

  const preparedHtml = prepareHtmlForBasicDocx(await buildExportHtmlString(extensionUri, document));
  const html = await inlineLocalFileImagesForBasicDocx(preparedHtml);
  const result = await HtmlToDocx(html, null, { decodeUnicode: true });
  const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer);
  await writeFile(targetUri.fsPath, await finalizeBasicDocxBuffer(buffer, preparedHtml));
  return targetUri;
}

export function prepareHtmlForBasicDocx(html: string): string {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const contentRoot = document.querySelector('main.markdown-body') ?? document.body;

  contentRoot
    .querySelectorAll('div.mermaid, div.mermaid-rendered')
    .forEach((block) => replaceMermaidBlockWithCode(document, block));

  return `<!DOCTYPE html><html><body>${contentRoot.innerHTML}</body></html>`;
}

export async function finalizeBasicDocxBuffer(buffer: Buffer, html: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXmlFile = zip.file('word/document.xml');

  if (!documentXmlFile) {
    return buffer;
  }

  const documentXml = await documentXmlFile.async('string');
  const bookmarkTargets = extractBookmarkTargetsForBasicDocx(html);
  const relationshipsXmlFile = zip.file('word/_rels/document.xml.rels');
  const fragmentRelationships = relationshipsXmlFile
    ? collectInternalFragmentRelationships(await relationshipsXmlFile.async('string'))
    : new Map<string, string>();
  const patchedDocument = patchBasicDocxDocumentXml(documentXml, bookmarkTargets, fragmentRelationships);

  zip.file('word/document.xml', patchedDocument.xml);

  if (relationshipsXmlFile) {
    const relationshipsXml = await relationshipsXmlFile.async('string');
    zip.file(
      'word/_rels/document.xml.rels',
      stripInternalFragmentRelationships(relationshipsXml, fragmentRelationships, patchedDocument.bookmarkNames),
    );
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

export function extractBookmarkTargetsForBasicDocx(html: string): BookmarkTarget[] {
  const dom = new JSDOM(html);
  const headings = [...dom.window.document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')];

  return headings
    .map((heading) => ({
      id: heading.id.trim(),
      text: heading.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
    }))
    .filter((heading) => heading.id.length > 0 && heading.text.length > 0);
}

export function collectInternalFragmentRelationships(relationshipsXml: string): Map<string, string> {
  const matches = relationshipsXml.matchAll(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="#([^"]+)"[^>]*\bTargetMode="External"[^>]*\/>/gu,
  );

  return new Map(
    [...matches].map((match) => [match[1], match[2]]),
  );
}

export function patchBasicDocxDocumentXml(
  documentXml: string,
  bookmarkTargets: BookmarkTarget[],
  fragmentRelationships: Map<string, string>,
): {
  xml: string;
  bookmarkNames: Set<string>;
  bookmarkAnchors: Map<string, string>;
} {
  let xml = removeLeadingEmptyParagraphs(documentXml);
  const bookmarkNames = new Set<string>();
  const bookmarkAnchors = new Map<string, string>();
  const usedBookmarkAnchors = new Set<string>();
  let nextBookmarkId = 1;

  for (const target of bookmarkTargets) {
    const bookmarkAnchor = createWordBookmarkName(target.id, nextBookmarkId, usedBookmarkAnchors);
    const result = insertBookmarkIntoHeadingParagraph(xml, target, nextBookmarkId, bookmarkAnchor);
    if (!result.inserted) {
      continue;
    }

    xml = result.xml;
    bookmarkNames.add(target.id);
    bookmarkAnchors.set(target.id, bookmarkAnchor);
    nextBookmarkId += 1;
  }

  for (const [relationshipId, target] of fragmentRelationships.entries()) {
    const bookmarkAnchor = bookmarkAnchors.get(target);
    if (!bookmarkAnchor) {
      continue;
    }

    const hyperlinkPattern = new RegExp(
      `<w:hyperlink\\b([^>]*)\\br:id="${escapeRegex(relationshipId)}"([^>]*)>`,
      'gu',
    );
    xml = xml.replace(
      hyperlinkPattern,
      `<w:hyperlink$1 w:anchor="${escapeXml(bookmarkAnchor)}" w:history="1"$2>`,
    );
  }

  return {
    xml,
    bookmarkNames,
    bookmarkAnchors,
  };
}

export function stripInternalFragmentRelationships(
  relationshipsXml: string,
  fragmentRelationships: Map<string, string>,
  bookmarkNames: Set<string>,
): string {
  let xml = relationshipsXml;

  for (const [relationshipId, target] of fragmentRelationships.entries()) {
    if (!bookmarkNames.has(target)) {
      continue;
    }

    const relationshipPattern = new RegExp(
      `\\s*<Relationship\\b[^>]*\\bId="${escapeRegex(relationshipId)}"[^>]*\\bTarget="#${escapeRegex(target)}"[^>]*/>`,
      'gu',
    );
    xml = xml.replace(relationshipPattern, '');
  }

  return xml;
}

export async function inlineLocalFileImagesForBasicDocx(html: string): Promise<string> {
  const dom = new JSDOM(html);
  const images = [...dom.window.document.querySelectorAll('img[src]')];

  for (const image of images) {
    const src = image.getAttribute('src')?.trim();
    if (!src || !src.toLowerCase().startsWith('file://')) {
      continue;
    }

    try {
      const filePath = fileURLToPath(src);
      const mimeType = guessMimeType(filePath);
      if (!mimeType.startsWith('image/')) {
        continue;
      }

      const content = await readFile(filePath);
      image.setAttribute('src', `data:${mimeType};base64,${content.toString('base64')}`);
    } catch {
      // Keep the original src so the export can continue even if a local image
      // cannot be resolved for some reason.
    }
  }

  return dom.serialize();
}

function replaceMermaidBlockWithCode(document: Document, block: Element): void {
  const source = (block.getAttribute('data-mermaid-source') ?? block.textContent ?? '').trim();
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  code.className = 'language-mermaid';
  pre.appendChild(code);
  block.replaceWith(pre);
}

function insertBookmarkIntoHeadingParagraph(
  documentXml: string,
  target: BookmarkTarget,
  bookmarkId: number,
  bookmarkName: string,
): {
  xml: string;
  inserted: boolean;
} {
  if (documentXml.includes(`w:name="${escapeXml(bookmarkName)}"`)) {
    return {
      xml: documentXml,
      inserted: false,
    };
  }

  const paragraphMatch = [...documentXml.matchAll(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/gu)]
    .find((match) => isHeadingParagraphForBookmark(match[0], target.text));
  if (!paragraphMatch) {
    return {
      xml: documentXml,
      inserted: false,
    };
  }

  const paragraphXml = paragraphMatch[0];
  const bookmarkStart = `<w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(bookmarkName)}"/>`;
  const bookmarkEnd = `<w:bookmarkEnd w:id="${bookmarkId}"/>`;
  const updatedParagraphXml = paragraphXml.includes('</w:pPr>')
    ? paragraphXml
      .replace('</w:pPr>', `</w:pPr>${bookmarkStart}`)
      .replace('</w:p>', `${bookmarkEnd}</w:p>`)
    : paragraphXml
      .replace('<w:p>', `<w:p>${bookmarkStart}`)
      .replace('</w:p>', `${bookmarkEnd}</w:p>`);

  return {
    xml: documentXml.replace(paragraphXml, updatedParagraphXml),
    inserted: true,
  };
}

function isHeadingParagraphForBookmark(paragraphXml: string, targetText: string): boolean {
  if (!/<w:pStyle w:val="Heading[1-6]"\/>/u.test(paragraphXml)) {
    return false;
  }

  const paragraphText = [...paragraphXml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => unescapeXml(match[1]))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();

  return paragraphText === targetText;
}

function createWordBookmarkName(originalName: string, index: number, usedNames: Set<string>): string {
  const normalized = originalName
    .replace(/[^A-Za-z0-9_]/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+/u, '');
  const baseName = /^[A-Za-z]/u.test(normalized)
    ? normalized
    : `bookmark_${normalized || index}`;
  let bookmarkName = baseName.slice(0, 40);
  let suffix = 2;

  while (usedNames.has(bookmarkName)) {
    const suffixText = `_${suffix}`;
    bookmarkName = `${baseName.slice(0, Math.max(1, 40 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  usedNames.add(bookmarkName);
  return bookmarkName;
}

function removeLeadingEmptyParagraphs(documentXml: string): string {
  return documentXml.replace(
    /(<w:body>\s*<w:sectPr[\s\S]*?<\/w:sectPr>)(?:\s*<w:p>\s*<w:pPr>\s*<w:spacing w:lineRule="auto"\/>\s*<\/w:pPr>\s*<w:r>\s*<w:rPr\/>\s*(?:<w:t(?:\s+[^>]*)?\s*\/>|<w:t(?:\s+[^>]*)?>\s*<\/w:t>)\s*<\/w:r>\s*<\/w:p>)+/u,
    '$1',
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&gt;/gu, '>')
    .replace(/&lt;/gu, '<')
    .replace(/&amp;/gu, '&');
}
