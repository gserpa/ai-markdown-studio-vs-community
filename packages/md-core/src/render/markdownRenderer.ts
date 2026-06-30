import hljs from 'highlight.js';
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const markdownItAnchor = require('markdown-it-anchor');
const markdownItEmoji = require('markdown-it-emoji');
const markdownItFootnote = require('markdown-it-footnote');
const markdownItTaskLists = require('markdown-it-task-lists');
const markdownItTexmath = require('markdown-it-texmath');

type LinkRewriteResult = {
  href?: string;
  removeHref?: boolean;
  attributes?: Record<string, string>;
};

type MarkdownRendererOptions = {
  resolveImageSrc?: (rawPath: string) => string | null | undefined;
  rewriteLink?: (href: string) => LinkRewriteResult | undefined;
};

export function createMarkdownRenderer(options: MarkdownRendererOptions = {}): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    langPrefix: 'hljs language-',
    highlight: (code, language) => {
      const normalizedLanguage = language.trim().toLowerCase();

      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        const highlighted = hljs.highlight(code, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value;

        return `<pre class="hljs"><code class="hljs language-${normalizedLanguage}">${highlighted}</code></pre>`;
      }

      return `<pre class="hljs"><code class="hljs">${escapeHtml(code)}</code></pre>`;
    },
  });

  md.use(markdownItAnchor, {
    slugify: createSlug,
  });
  md.use(markdownItTaskLists, {
    enabled: true,
    disabled: true,
    label: true,
    labelAfter: true,
  });
  md.use(markdownItEmoji.full);
  md.use(markdownItFootnote);
  md.use(markdownItTexmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      strict: 'ignore',
    },
  });

  md.core.ruler.after('linkify', 'suppress-file-like-autolinks', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children?.length) {
        continue;
      }

      const rewrittenChildren: typeof token.children = [];
      for (let index = 0; index < token.children.length; index += 1) {
        const openToken = token.children[index];
        const textToken = token.children[index + 1];
        const closeToken = token.children[index + 2];

        if (
          openToken?.type === 'link_open'
          && openToken.markup === 'linkify'
          && openToken.info === 'auto'
          && textToken?.type === 'text'
          && closeToken?.type === 'link_close'
          && closeToken.markup === 'linkify'
          && closeToken.info === 'auto'
          && isFileLikeAutoLinkText(textToken.content)
        ) {
          const plainTextToken = new state.Token('text', '', 0);
          plainTextToken.content = textToken.content;
          rewrittenChildren.push(plainTextToken);
          index += 2;
          continue;
        }

        rewrittenChildren.push(openToken);
      }

      token.children = rewrittenChildren;
    }
  });

  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim().split(/\s+/u)[0]?.toLowerCase();

    if (info === 'mermaid') {
      return `<div class="mermaid">${md.utils.escapeHtml(token.content)}</div>`;
    }

    return defaultFence
      ? defaultFence(tokens, idx, renderOptions, env, self)
      : self.renderToken(tokens, idx, renderOptions);
  };

  const defaultImage = md.renderer.rules.image?.bind(md.renderer.rules);
  md.renderer.rules.image = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    if (srcIndex >= 0) {
      const originalSrc = token.attrs?.[srcIndex]?.[1];
      if (originalSrc) {
        token.attrSet('data-source-src', originalSrc);
      }
      const resolvedSrc = originalSrc ? options.resolveImageSrc?.(originalSrc) : undefined;
      if (resolvedSrc === null) {
        const altText = md.utils.escapeHtml(self.renderInlineAsText(token.children ?? [], renderOptions, env));
        const escapedSource = md.utils.escapeHtml(originalSrc ?? '');
        return [
          `<span class="remote-resource-placeholder" role="img" aria-label="${altText || 'Remote image blocked'}" data-source-src="${escapedSource}" data-remote-resource-blocked="true">`,
          '  <span class="remote-resource-placeholder-icon" aria-hidden="true"></span>',
          '  <span class="remote-resource-placeholder-copy">',
          `    <span class="remote-resource-placeholder-title">${altText || 'Remote image blocked'}</span>`,
          '    <span class="remote-resource-placeholder-message">Extension settings restrict access to remote resources.</span>',
          '  </span>',
          '</span>',
        ].join('\n');
      } else if (resolvedSrc !== undefined) {
        token.attrs![srcIndex][1] = resolvedSrc;
      }
    }

    return defaultImage
      ? defaultImage(tokens, idx, renderOptions, env, self)
      : self.renderToken(tokens, idx, renderOptions);
  };

  md.core.ruler.after('inline', 'rewrite-html-images', (state) => {
    for (const token of state.tokens) {
      if ((token.type !== 'html_block' && token.type !== 'html_inline') || !token.content.includes('<img')) {
        continue;
      }

      token.content = rewriteHtmlImageTags(token.content, options, md);
    }
  });

  const defaultLinkOpen = md.renderer.rules.link_open?.bind(md.renderer.rules);
  md.renderer.rules.link_open = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    const href = hrefIndex >= 0 ? token.attrs?.[hrefIndex]?.[1] : undefined;

    if (href) {
      const rewriteResult = options.rewriteLink?.(href);
      if (rewriteResult?.removeHref) {
        token.attrSet('data-href', rewriteResult.attributes?.['data-href'] ?? href);
        token.attrSet('href', '');
      } else if (rewriteResult?.href) {
        token.attrSet('href', rewriteResult.href);
      }

      if (rewriteResult?.attributes) {
        for (const [name, value] of Object.entries(rewriteResult.attributes)) {
          token.attrSet(name, value);
        }
      }
    }

    return defaultLinkOpen
      ? defaultLinkOpen(tokens, idx, renderOptions, env, self)
      : self.renderToken(tokens, idx, renderOptions);
  };

  return md;
}

function isFileLikeAutoLinkText(text: string): boolean {
  return /^(?:[\p{L}\p{N}._-]+\/)*[\p{L}\p{N}._-]+\.(?:md|markdown)$/iu.test(text.trim());
}

export function sanitizeRenderedHtml(html: string): string {
  const allowedTags = new Set([
    ...sanitizeHtml.defaults.allowedTags,
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'img',
    'input',
    'div',
    'span',
    'section',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'sup',
    'sub',
    'kbd',
    'math',
    'semantics',
    'annotation',
    'mrow',
    'mi',
    'mn',
    'mo',
    'msup',
    'msub',
    'mfrac',
    'msqrt',
    'mtext',
    'mspace',
    'mstyle',
    'munderover',
    'munder',
    'mover',
    'msubsup',
    'mtable',
    'mtr',
    'mtd',
  ]);

  return sanitizeHtml(html, {
    allowedTags: [...allowedTags],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title', 'aria-hidden', 'data-*'],
      a: ['href', 'name', 'target', 'rel', 'data-href'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      input: ['type', 'checked', 'disabled'],
      th: ['colspan', 'rowspan', 'align'],
      td: ['colspan', 'rowspan', 'align'],
      ol: ['start'],
      annotation: ['encoding'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data', 'file'],
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/iu, /^rgb\((?:[^()]+)\)$/iu, /^rgba\((?:[^()]+)\)$/iu, /^[a-z]+$/iu],
        'background-color': [/^#[0-9a-f]{3,8}$/iu, /^rgb\((?:[^()]+)\)$/iu, /^rgba\((?:[^()]+)\)$/iu, /^[a-z]+$/iu],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/iu],
        'font-style': [/^(?:normal|italic|oblique)$/iu],
        'font-size': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'text-align': [/^(?:left|right|center|justify)$/iu],
        'text-decoration': [/^(?:none|underline|line-through)$/iu],
        display: [/^(?:inline|inline-block|block|table|table-row|table-cell)$/iu],
        position: [/^(?:static|relative|absolute)$/iu],
        top: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        right: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        bottom: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        left: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        width: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu, /^calc\([^)]*\)$/iu],
        height: [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu, /^calc\([^)]*\)$/iu],
        'min-width': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'max-width': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'min-height': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'max-height': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'margin-left': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'margin-right': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'margin-top': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'margin-bottom': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'padding-left': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'padding-right': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'padding-top': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'padding-bottom': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu],
        'vertical-align': [/^-?(?:\d*\.)?\d+(?:px|em|rem|%)$/iu, /^(?:baseline|sub|super|middle|text-top|text-bottom|top|bottom)$/iu],
        'border-bottom-width': [/^(?:0|(?:\d*\.)?\d+(?:px|em|rem))$/iu],
        'border-right-width': [/^(?:0|(?:\d*\.)?\d+(?:px|em|rem))$/iu],
        'border-left-width': [/^(?:0|(?:\d*\.)?\d+(?:px|em|rem))$/iu],
        'border-top-width': [/^(?:0|(?:\d*\.)?\d+(?:px|em|rem))$/iu],
        'border-style': [/^(?:solid|dashed|dotted|none)$/iu],
        'white-space': [/^(?:normal|nowrap|pre|pre-wrap)$/iu],
      },
    },
  });
}

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function rewriteHtmlImageTags(html: string, options: MarkdownRendererOptions, md: MarkdownIt): string {
  return html.replace(/<img\b[^>]*>/giu, (tag) => rewriteSingleHtmlImageTag(tag, options, md));
}

function rewriteSingleHtmlImageTag(tag: string, options: MarkdownRendererOptions, md: MarkdownIt): string {
  const src = readHtmlAttribute(tag, 'src');
  if (!src) {
    return tag;
  }

  const altText = readHtmlAttribute(tag, 'alt') ?? '';
  const resolvedSrc = options.resolveImageSrc?.(src);
  if (resolvedSrc === null) {
    const escapedAltText = md.utils.escapeHtml(altText);
    const escapedSource = md.utils.escapeHtml(src);
    return [
      `<span class="remote-resource-placeholder" role="img" aria-label="${escapedAltText || 'Remote image blocked'}" data-source-src="${escapedSource}" data-remote-resource-blocked="true">`,
      '  <span class="remote-resource-placeholder-icon" aria-hidden="true"></span>',
      '  <span class="remote-resource-placeholder-copy">',
      `    <span class="remote-resource-placeholder-title">${escapedAltText || 'Remote image blocked'}</span>`,
      '    <span class="remote-resource-placeholder-message">Extension settings restrict access to remote resources.</span>',
      '  </span>',
      '</span>',
    ].join('\n');
  }

  let rewritten = setHtmlAttribute(tag, 'data-source-src', src);
  if (resolvedSrc !== undefined) {
    rewritten = setHtmlAttribute(rewritten, 'src', resolvedSrc);
  }

  return rewritten;
}

function readHtmlAttribute(tag: string, attributeName: string): string | undefined {
  const quotedPattern = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, 'iu');
  const quotedMatch = quotedPattern.exec(tag);
  if (quotedMatch) {
    return quotedMatch[2];
  }

  const barePattern = new RegExp(`${attributeName}\\s*=\\s*([^\\s>]+)`, 'iu');
  const bareMatch = barePattern.exec(tag);
  return bareMatch?.[1];
}

function setHtmlAttribute(tag: string, attributeName: string, value: string): string {
  const escapedValue = escapeHtml(value);
  const replacement = `${attributeName}="${escapedValue}"`;
  const quotedPattern = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, 'iu');
  if (quotedPattern.test(tag)) {
    return tag.replace(quotedPattern, replacement);
  }

  const barePattern = new RegExp(`${attributeName}\\s*=\\s*([^\\s>]+)`, 'iu');
  if (barePattern.test(tag)) {
    return tag.replace(barePattern, replacement);
  }

  return tag.replace(/\/?>$/u, (suffix) => ` ${replacement}${suffix}`);
}
