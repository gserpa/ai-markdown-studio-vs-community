---
date: 2026-06-13
version: 0.2.0
---

# Security Review — AI Markdown Studio Community

**Document version:** 0.2.0 (document last updated 2026-06-13)

## Disclaimer and Scope of This Review

This review is part of the developer's ongoing due diligence to keep AI Markdown Studio secure, before and after release. It was produced with the assistance of an AI model (**Claude Opus**, Anthropic), which performed a structured static review of the Community source code, configuration, and dependency tree as they existed on the date above, alongside the developer's own manual review.

**What this review is:**

- A good-faith, point-in-time snapshot intended to help users and auditors understand Community's security posture and make an informed decision before installing or enabling its features.
- One part of the developer's normal release hygiene, alongside `npm audit`, the license inventory, and the automated Community boundary check.

**What this review is not:**

- A certification, warranty, or guarantee that the software is free of vulnerabilities.
- A substitute for an independent third-party security audit, particularly before use with sensitive, confidential, or regulated content.
- A living document — it reflects the code as of the document version and date above. Later code, dependency, or configuration changes are not automatically reflected here.

**No liability.** This review is provided "as is", without warranty of any kind. To the fullest extent permitted by applicable law, the developer disclaims all liability for any security incident, data loss, or other damages arising from use of AI Markdown Studio, whether or not the underlying issue is discussed in this document. Use of this software is governed by the [MIT License](../../../LICENSE).

## 1. Executive summary

This review covers the **AI Markdown Studio Community** VS Code extension: the MIT-licensed open-source core that provides preview-first Markdown authoring, live document and presentation previews, AI-assisted document/MPS generation, AI Paste to Markdown, HTML export, and basic DOCX export.

Community deliberately contains no PDF/PPTX export, Microsoft Word/PowerShell automation, broad file-conversion, agent-tool, or corporate-template code. Those surfaces live in the separate proprietary AI Markdown Studio Pro extension.

### Overall assessment

- **No critical or high-severity code-execution issue was identified in this review.**
- The extension ships with strong baseline controls:
  - HTML sanitization before preview and export
  - a restrictive webview Content Security Policy (CSP)
  - Mermaid `securityLevel: 'strict'`
  - scoped `localResourceRoots` rather than full-workspace exposure
  - an automated boundary check that rejects Pro source, Pro dependencies, Pro commands, and packaged source/test files from the Community VSIX
- `npm audit` reports **0 known vulnerabilities** at the time of this review.
- Some AI-supported features use only the GitHub Copilot service already configured in VS Code. If Copilot is not configured, those AI surfaces stay hidden. If Copilot is configured and the user has not explicitly denied access, the AI surfaces are shown and the consent flow appears when they are used. If the user denies access, the AI surfaces hide again except for **Enable AI Features...**. AI Markdown Studio does not connect to any other third-party AI service and does not bring its own AI account or credentials.
- The main residual risks are **content-trust risks** associated with rendering Markdown that references remote or local resources.

### Security posture summary

| Area                    | Assessment                         |
| ----------------------- | ---------------------------------- |
| Webview script safety   | Good                               |
| HTML sanitization       | Good, but intentionally permissive |
| Local file exposure     | Moderate, mostly by design         |
| Remote resource loading | Moderate                           |
| VS Code configured GitHub Copilot | Disabled by default; explicit consent required |
| Command execution       | Good, no child processes            |
| Dependency posture      | Good at time of review             |
| Edition boundary        | Enforced by automated check        |

## 2. Scope

Reviewed components:

- preview webview generation and the shared preview runtime
- presentation preview generation and client-side slide navigation
- Markdown rendering and sanitization
- standalone HTML export
- basic DOCX export via `html-to-docx`
- guided document and MPS presentation generation
- AI Paste to Markdown
- document and presentation theme loading
- local file and image resolution behavior
- the public Community API surface exposed to feature extensions
- the Community packaging boundary check
- dependency vulnerability and license posture

Out of scope (Pro only — not present in Community): PDF/PPTX export, broad file conversion, theme AI generation, Copilot Language Model Tools, PowerPoint template automation, and the Word/PowerShell automation path.

Key reviewed files:

- `apps/ai-markdown-studio-vs-community/src/extension.ts`
- `apps/ai-markdown-studio-vs-community/src/panel/MarkdownPreviewPanel.ts`
- `apps/ai-markdown-studio-vs-community/src/panel/MarkdownPreviewCustomEditor.ts`
- `apps/ai-markdown-studio-vs-community/src/panel/previewHtmlBuilder.ts`
- `apps/ai-markdown-studio-vs-community/src/panel/frontMatterDisplayState.ts`
- `apps/ai-markdown-studio-vs-community/src/presentation/mpsEditorSupport.ts`
- `apps/ai-markdown-studio-vs-community/src/export/html/htmlExporter.ts`
- `apps/ai-markdown-studio-vs-community/src/export/docx/docxExporter.ts`
- `apps/ai-markdown-studio-vs-community/src/generate/documentGenerationCommand.ts`
- `apps/ai-markdown-studio-vs-community/src/generate/presentationGenerationCommand.ts`
- `apps/ai-markdown-studio-vs-community/src/generate/generationMode.ts`
- `apps/ai-markdown-studio-vs-community/src/ai/aiConsent.ts`
- `apps/ai-markdown-studio-vs-community/src/commands/aiCommands.ts`
- `apps/ai-markdown-studio-vs-community/src/util/documentResourceResolver.ts`
- `apps/ai-markdown-studio-vs-community/src/api/communityApi.ts`
- `packages/md-core/*` and `packages/md-preview-web/*` (rendering, sanitization, presentation parsing, preview runtime, themes)
- `apps/ai-markdown-studio-vs-community/package.json`
- `scripts/check-community-boundary.mjs`

## 3. Review methodology

This review used:

1. manual static code inspection
2. dependency inspection from the workspace and extension manifests
3. `npm audit --json`
4. a third-party license inventory across the packaged dependency tree
5. architecture and trust-boundary analysis
6. attack-surface review for preview, export, AI generation/paste, theme-loading, and API flows

### Automated dependency result

`npm audit` reported **0 vulnerabilities** (0 critical / 0 high / 0 moderate / 0 low). This is a point-in-time result and should be re-run before each release.

### License inventory result

A scan of the packaged dependency tree found only permissive licenses (MIT, ISC, BSD-2/3-Clause, Apache-2.0, Python-2.0, and SIL OFL-1.1 for bundled fonts). DOMPurify is dual-licensed Apache-2.0 OR MPL-2.0 and is used unmodified. No GPL/LGPL/AGPL or other strong-copyleft code is bundled. See `THIRD_PARTY_NOTICES.md`.

## 4. Trust boundaries and attack surface

### 4.1 Untrusted input

The primary untrusted input is Markdown document content, including:

- raw HTML embedded in Markdown
- Mermaid diagram definitions
- presentation front matter and slide directives (`<!--slide:-->`, `<!--notes:-->`)
- local links and images
- remote links and images
- absolute file paths
- document and presentation theme JSON loaded from the workspace or a configured theme directory

### 4.2 Sensitive execution surfaces

#### Webview runtime

The preview uses a VS Code webview with JavaScript enabled for rendering, slide navigation, Mermaid, KaTeX, and the immersive presentation UI.

#### Extension host

The extension host resolves links and images, loads theme files, invokes the VS Code Language Model API for explicit AI commands, and writes generated Markdown and exported HTML/DOCX files. Community launches no browser or external application.

#### Network access

Network activity can occur after a user enables and invokes Generate Document, Generate Presentation, or Paste as New Markdown File. It can also occur when the preview or an exported HTML file loads remote resources referenced by the Markdown. There is no AI Markdown Studio server component and no telemetry.

#### VS Code Language Model API

AI-supported functionality is controlled by a simple three-state model. If GitHub Copilot is not configured in VS Code, the AI surfaces stay hidden. If Copilot is configured and the user has not explicitly denied access, the AI surfaces stay visible and the consent flow appears when the user invokes them. If the user denies access, the AI surfaces hide again except for **Enable AI Features...**. The persisted `markdownAiStudio.aiFeaturesEnabled` setting records whether the user accepted AI access, and the persisted denial state records an explicit refusal. AI Markdown Studio does not connect to any other third-party AI service and does not bring its own AI account or credentials. The extension stores no provider API key. The copy-prompt path calls no model.

## 5. Existing security controls

### 5.1 Webview CSP

The preview HTML sets a restrictive content security policy:

- `default-src 'none'`
- scripts limited to extension resources with a per-load nonce
- images limited to the extension origin, `https:`, and `data:`
- fonts limited to the extension origin

This is a strong baseline for webview hardening. The presentation preview runs inside the same webview trust model and inherits the same CSP while adding slide navigation and immersive-mode UI behavior in the shared preview runtime at `packages/md-preview-web/assets`.

### 5.2 Sanitization

Rendered Markdown is sanitized before preview and export.

Security-positive aspects:

- scripts are not allowed
- event-handler (`on*`) attributes are not allowed
- the tag allow-list is explicit
- the style allow-list is regex-constrained

### 5.3 Mermaid strict mode

Preview Mermaid initialization uses `securityLevel: 'strict'`, which reduces script and HTML-injection risk inside diagrams.

### 5.4 Resource scoping

The preview panel limits local resource access through `localResourceRoots` to:

- the extension `assets/` folder
- `node_modules/`
- the directory of the current Markdown file

This is more restrictive than exposing the full workspace by default.

### 5.5 Presentation preview safety controls

Presentation-spec Markdown files are rendered through the same sanitizer used by the standard preview and export paths before slide HTML is composed.

Security-positive aspects:

- slide bodies and speaker notes are sanitized before insertion into the presentation webview
- fullscreen mode is an in-webview layout mode, not an external browser launch
- failed local image loads can be retried through the extension host rather than broadening the webview CSP
- the slide preview uses a fixed-canvas scaling model, which changes layout sizing without introducing a new script-execution surface

### 5.6 Edition boundary enforcement

`scripts/check-community-boundary.mjs` runs in `npm run verify` and in CI. It rejects Pro-only commands, dependencies, source paths, and packaged source/test files while explicitly allowing Community-owned document/presentation generation, AI Paste, and basic DOCX implementations. PDF export and its Puppeteer dependency remain Pro-only.

## 6. Findings

### Finding 1: AI-supported features share user-supplied content with VS Code configured GitHub Copilot

- **Severity:** Medium
- **Status:** Accepted / By design

#### Description

Generate Document, Generate Presentation, and Paste as New Markdown File are examples of AI-supported functionality that use only the GitHub Copilot service already configured in VS Code and share the user-supplied brief or clipboard text with that embedded AI service for processing. If GitHub Copilot is not configured, those commands stay hidden. If Copilot is configured and access has not been explicitly denied, the commands are visible and prompt for consent when used. If the user denies access, the commands hide again except for **Enable AI Features...**. Calls are explicit and command-driven; the extension does not upload documents in the background. AI Markdown Studio does not connect to any other third-party AI service and does not bring its own AI account or credentials. The copy-prompt option does not call Copilot.

#### Security impact

Content supplied to these commands is processed by the user's configured GitHub Copilot service. By enabling AI features, the user confirms that they are authorized to share the submitted content through that service and agrees to that processing.

#### Recommendation

Keep the feature list and data-sharing notice clear. Preserve default-off consent gating, immediate revocation through Settings, the user-invoked model, and the non-network copy-prompt alternative.

### Finding 2: Remote resources can trigger outbound network access

- **Severity:** Medium
- **Status:** Open (mitigated by setting)

#### Description

Untrusted Markdown can reference remote images. During preview, remote `https:` images are permitted by the CSP and may be loaded. Exported HTML may also reference remote resources that load when the file is later opened.

#### Security impact

Opening or exporting an attacker-controlled Markdown file may reveal the user's IP address, request timing, and intranet reachability patterns. This is primarily a **privacy** and **network-egress** concern rather than code execution.

#### Recommendation

The `markdownAiStudio.allowRemoteResources` setting lets privacy-sensitive users disable remote resource loading. Keep it documented and continue to apply it consistently across the standard preview, presentation preview, and HTML export so behavior does not differ by output path. Consider a future per-document `prompt` mode.

### Finding 3: Local file rendering is intentionally allowed and may expose adjacent files

- **Severity:** Low to Medium
- **Status:** Open / expected behavior

#### Description

The extension resolves local relative paths, workspace-root paths, and absolute paths for links and images. This is useful, but a Markdown file can cause the preview or export to include nearby files the current user can read.

#### Security impact

This does **not** bypass OS permissions, but it increases the chance of accidental disclosure when opening untrusted Markdown that references sensitive local files.

#### Recommendation

Consider a safety mode for untrusted workspaces that blocks absolute local paths, blocks parent-directory traversal outside the workspace, and optionally honors VS Code Workspace Trust before resolving local resources.

## 7. Non-findings / positive observations

- **No webview XSS path from Markdown to script execution was found.** Sanitization, the nonce-based CSP, and `default-src 'none'` substantially reduce classic webview XSS risk.
- **Mermaid configuration is security-aware.** Strict mode is the correct default for untrusted diagrams.
- **No telemetry or network beacon.** The extension does not collect usage data or send background requests. Its Copilot requests are explicit user-invoked feature actions.
- **Edition boundary is machine-enforced.** The boundary check prevents proprietary or higher-risk Pro code from silently entering the open-source package.

## 8. Recommended remediation plan

### Priority 1

1. Keep `markdownAiStudio.allowRemoteResources` documented and consistently applied across preview, presentation preview, and HTML export.
2. Maintain the sanitization, link-handling, and presentation-asset regression tests.

### Priority 2

3. Add optional restrictions for absolute local file references and Workspace-Trust-aware gating of local resource resolution.
4. Add theme-token validation tests for workspace-provided theme files.

### Priority 3

5. Re-review whether `file:` must remain an allowed sanitized scheme in all contexts.
6. Keep `npm audit` and the license inventory as release-checklist items.

## 9. Bottom line

AI Markdown Studio Community uses scoped resources, strict Mermaid mode, sanitization, and a machine-enforced edition boundary to reduce content-trust risks. AI-supported features use only the GitHub Copilot service already configured in VS Code, appear only when Copilot is configured and access has not been explicitly denied, and can be revoked at any time in Settings. AI Markdown Studio does not connect to any other third-party AI service or bring its own AI account or credentials.

> This is a point-in-time engineering review, not a guarantee. Re-run dependency and audit checks before each release.
