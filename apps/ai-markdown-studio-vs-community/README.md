# AI Markdown Studio Community

<p align="center">
  <img src="media/markdown-ai-studio-logo.png" alt="AI Markdown Studio" width="520" />
</p>

The open-source core of AI Markdown Studio: a VS Code extension for authoring Markdown with a live preview panel, Mermaid diagram support, KaTeX math, syntax highlighting, table formatting, document and presentation preview themes, a slide-based presentation preview, AI-assisted document and presentation generation, AI Paste to Markdown, HTML export, and basic DOCX export.

AI Markdown Studio Community is licensed under the MIT License and is useful entirely on its own. It includes AI-assisted document and presentation generation, AI Paste to Markdown, HTML export, and basic DOCX. PDF/PPTX export, high-fidelity DOCX, broad file conversion, theme AI workflows, shared custom theme folders, agent tools, and corporate PowerPoint template automation are provided separately by **AI Markdown Studio Pro**.

For a complete end-user walkthrough, see [docs/user-guide.md](./docs/user-guide.md). For the public extension API consumed by Pro and other feature extensions, see [docs/community-api.md](./docs/community-api.md). For a focused comparison of what Pro adds, see [docs/upgrade-to-pro.md](./docs/upgrade-to-pro.md).

## User Guide Index

- [Installation](#installation)
- [Features](#features)
- [Usage & Commands](#usage)
- [Feature Details](#feature-details)
  - [Markdown Preview](#markdown-preview)
  - [Presentation Preview](#presentation-preview)
  - [Table Formatting](#table-formatting)
  - [HTML Export](#html-export)
  - [AI-Assisted Generation](#ai-assisted-generation)
  - [AI Paste to Markdown](#ai-paste-to-markdown)
  - [Basic DOCX Export](#basic-docx-export)
  - [Command List](#command-list)
  - [Mermaid Diagram Example](#mermaid-example)
- [Running Tests](#running-tests)
- [Security](#security)
- [AI Markdown Studio Pro](#markdown-ai-studio-pro)
- [Acknowledgments & Third-Party Licenses](#acknowledgments--third-party-licenses)

## Installation

1. Open VS Code.
2. Go to the **Extensions** view (`Ctrl+Shift+X`).
3. Search for **AI Markdown Studio Community**.
4. Click **Install**.

Alternatively, install from the command line:

```bash
code --install-extension GustavoSerpa.markdown-ai-studio
```

Or install a packaged build directly from a `.vsix` file:

```bash
code --install-extension markdown-ai-studio-0.2.0.vsix
```

## Features

- **Preview-first custom editor** - opening a Markdown file uses the extension's preview custom editor by default, and switching to edit mode closes the preview surface for that file.
- **Live preview** - renders standard Markdown documents and presentation-style Markdown decks in a panel as you type.
- **Mermaid diagrams** - fenced ` ```mermaid ``` ` blocks are rendered as diagrams, with strict-mode initialization for untrusted content.
- **Mermaid diagram zoom** - zoom a rendered diagram in place from the preview through an overlay viewer.
- **Syntax highlighting** - code blocks highlighted via highlight.js.
- **Math equations** - KaTeX-rendered inline and block math (`$...$` / `$$...$$`).
- **Task lists, footnotes, and emoji** - common Markdown extensions are enabled by default.
- **Local image resolution** - images are resolved relative to the source Markdown file.
- **Document themes** - standard document preview can follow VS Code automatically or use bundled themes.
- **Presentation themes** - presentation preview can load bundled slide themes.
- **Presentation preview** - presentation-style Markdown files open in a slide viewer with slide navigation, a collapsible filmstrip, immersive fullscreen mode, fixed-canvas scaling, and speaker-note display.
- **AI-assisted document generation** - create Markdown documents from prompts through the GitHub Copilot service already configured in VS Code, with consent gating.
- **AI-assisted presentation generation** - generate presentation-style Markdown decks from prompts through the same Copilot-backed workflow.
- **AI Paste to Markdown** - convert clipboard text into a new Markdown file.
- **Basic DOCX export** - export rendered Markdown to DOCX through the Community DOCX path.
- **Front matter toggle** - show or hide a rendered front-matter summary in the preview.
- **Table formatting** - auto-align Markdown tables with a single command, also available through **Format Document**.
- **HTML export** - save the rendered document as a standalone, self-contained HTML file.
- **Command launcher** - quick access to the extension's main actions from the editor title bar. The launcher is extensible: when a compatible feature extension such as AI Markdown Studio Pro is installed, its commands appear alongside the Community commands.
- **Command palette settings shortcut** - jump directly to the extension's settings with **Change Settings...**.
- **Single-tab per file** - always one tab per file; switching modes closes the other surface.

## App Layout

- `src/` - extension source
- `out/` - compiled extension output
- `docs/` - extension-specific documentation
- `media/` - command icons referenced by the extension manifest
- `config/` - extension metadata used to generate the command launcher entries

## Usage

**Preview-first and mode switching:**

- Opening a Markdown file uses the `markdownAiStudio.markdownPreview` custom editor by default.
- **Preview Markdown** is available from the editor title bar and command list when a Markdown text editor is active.
- **Edit Markdown** is available from the preview title bar and the command list. Switching modes closes the other surface for that file.

All commands are available from the **Command Palette** (`Ctrl+Shift+P`), and the most common ones appear as icons in the **editor title bar** when a `.md` file is open.

| Command | Description | Where |
| --- | --- | --- |
| **Preview Markdown** | Opens or focuses preview for the current Markdown file | Title bar, command palette, command list |
| **Edit Markdown** | Switches the current file to the text editor, closing the preview surface first | Preview title bar, Explorer file context menu, command palette, command list |
| **Format Markdown Tables** | Auto-aligns all tables in the active file | Command palette, command list, Format Document |
| **`markdownAiStudio.formatTablesOnSave`** | `false` | Automatically formats Markdown tables when you save a Markdown file. |
| **Generate Document (AI)** | Creates a new Markdown document from a prompt | Command palette, command list |
| **Generate Presentation (AI)** | Creates a presentation-style Markdown deck from a prompt | Command palette, command list |
| **Paste as New Markdown File** | Converts clipboard text into a new Markdown file | Explorer folder context menu, command palette |
| **Export Markdown as HTML** | Saves the rendered document as a standalone `.html` file | Command palette, command list |
| **Export Markdown as DOCX (Basic)** | Saves the rendered document as a DOCX file | Command palette, command list |
| **Enable AI Features...** | Reviews the AI data-sharing notice and can enable or re-enable AI features | Command palette, command list |
| **Toggle Frontmatter** | Shows or hides the rendered front-matter summary in the active preview | Title bar, command palette, command list when applicable |
| **Show AI Markdown Studio Commands** | Lists the extension's main actions in a quick-pick menu | Title bar, command palette |
| **Change Settings...** | Opens the VS Code Settings UI filtered to this extension | Command palette, command list |

## Feature Details

### Markdown Preview

The live preview renders your Markdown document in real time as you edit. By default, opening a `.md` file uses the extension's preview custom editor. Only one surface per file is kept open; switching modes closes the other.

To switch between preview and edit modes:

- Use **Preview Markdown** from the editor title bar or command list when a Markdown text editor is active.
- Use the pencil icon (**Edit Markdown**) in the preview tab's title bar, or the Explorer file context menu, to switch to edit mode.
- Use the command list (**Show AI Markdown Studio Commands**) to switch modes from anywhere.

The preview supports:

- Standard Markdown (headings, lists, links, images, bold, italic, etc.)
- Fenced code blocks with syntax highlighting
- Mermaid diagrams (` ```mermaid ``` ` blocks)
- Mermaid diagram zoom in-place from the preview via an overlay viewer
- Math equations (`$inline$` and `$$block$$`)
- Task lists, footnotes, and emoji
- Local images resolved relative to the source file
- Theme-aware styling with selectable document themes

Theme selection lives in Settings under the **Theme Selection** section. Community includes the bundled document themes only; custom theme folders are a Pro feature.

When a Markdown file declares `document: presentation` in front matter, the preview switches to a slide-based presentation viewer instead of the standard scrolling document preview. Files without that explicit front-matter value stay on the standard text preview path.

Preview-specific settings:

| Setting | Default | Description |
| --- | --- | --- |
| **`markdownAiStudio.previewPageWidth`** | `full` | Uses `full` width for standard Markdown preview pages by default. Set to `readable` to constrain the page to a centred readable column. |
| **`markdownAiStudio.documentPreviewTheme`** | `auto` | Selects the default document preview theme. Bundled options include `light`, `light-modern-blue`, `dark`, `dark-aurora-noir`, `dark-modern-aurora`, and `night-sky`. Can be overridden per file with the `theme` front matter field. Find it in Settings under **Theme Selection**. |

Mermaid diagrams in the standard document preview include a zoom control. Use the on-diagram **Zoom** button or double-click the rendered diagram to open it in an overlay viewer. Inside the viewer, use **+**, **-**, **Fit**, or the keyboard shortcuts `+`, `-`, `0`, and `Esc`.

### Presentation Preview

When the current Markdown file declares `document: presentation` in front matter, the preview switches into a slide-based presentation mode.

Presentation preview features include:

- slide-by-slide navigation with previous and next controls
- keyboard navigation with arrow keys, `Page Up`, `Page Down`, `Home`, and `End`
- a collapsible filmstrip of slides for quick navigation
- immersive fullscreen mode, toggled with the on-screen control or the `F` key
- fixed-canvas scaling so fullscreen preserves the same slide composition you see in the smaller preview panel
- template-aware layouts for supported slide types such as `cover`, `default`, `two-columns`, `image-right`, and `divider`
- speaker notes displayed below the active slide when notes are present

Presentation preview themes are bundled only in Community (`black`, `galaxy`, `modern-blue`). Custom presentation theme folders are available in Pro.

Use `Esc` to exit immersive mode.

The presentation preview follows the same Markdown structure used by AI Markdown Studio Pro's PPTX export:

- top-level YAML front matter must include `document: presentation`, plus optional deck metadata like `title`, `author`, `theme`, and `ratio`
- `---` separates slides
- `<!--slide: template-name-->` optionally overrides the renderer layout for a slide
- `<!--notes: ...-->` and `<!--speaker notes: ...-->` comments become speaker notes for that slide

### Table Formatting

The **Format Markdown Tables** command automatically aligns all Markdown tables in the active file for consistent, readable source formatting.
If you want tables formatted automatically on save, enable **`markdownAiStudio.formatTablesOnSave`** in the settings.

1. Open a `.md` file containing one or more Markdown tables.
2. Run **Format Markdown Tables** from the Command Palette or the command list.
3. All tables in the file are reformatted in place.

This command is also registered as a document formatter, so it can be invoked via **Format Document** (`Shift+Alt+F`) when a `.md` file is active.

### HTML Export

Run **Export Markdown as HTML** from the Command Palette or the command list to save the current Markdown file as a self-contained `.html` file. The exported file includes the extension's styling and rendered content for sharing outside VS Code.

The setting **`markdownAiStudio.allowRemoteResources`** controls whether remote `http(s)` resources referenced in your Markdown may be loaded. Set it to `false` in privacy-sensitive environments.

### AI-Assisted Generation

When GitHub Copilot is configured in VS Code, AI Markdown Studio Community can create new Markdown documents or presentation decks from prompts. With the default `markdownAiStudio.aiAccess: "ask"` state, the commands stay visible and the disclosure appears only when an AI feature actually tries to run. If `markdownAiStudio.aiAccess` is `denied`, the AI commands hide again except for **Enable AI Features...**.

- **Generate Document (AI)** creates a new Markdown document from a prompt.
- **Generate Presentation (AI)** creates a new presentation-style Markdown deck from a prompt.

Use **Enable AI Features...** if you need to review or re-enable the AI data-sharing notice, or change `markdownAiStudio.aiAccess` directly in Settings.

### AI Paste to Markdown

Use **Paste as New Markdown File** to turn clipboard text into a new Markdown file. This follows the same AI consent workflow as document generation: it is visible when Copilot is configured unless `markdownAiStudio.aiAccess` is `denied`, and it prompts on first real AI use while the state is `ask`.

### Basic DOCX Export

Use **Export Markdown as DOCX (Basic)** to save the current Markdown file as a DOCX document. This is the Community DOCX path; AI Markdown Studio Pro provides the higher-fidelity DOCX export workflow.

### Command List

The **Show AI Markdown Studio Commands** action is available from the editor title bar when a Markdown file is open.

Use it as a single entry point to:

- open the preview
- edit the current Markdown file
- toggle front matter when the active preview has front matter
- format tables
- generate a document or presentation with AI
- export HTML
- export basic DOCX
- enable AI features
- open extension settings

When a compatible feature extension such as AI Markdown Studio Pro is installed, its registered commands appear in the same launcher, so Pro features look integrated without Community depending on Pro.

## Running Tests

The extension includes automated unit tests covering table formatting, HTML sanitization, presentation parsing and preview rendering, front-matter display state, and HTML export helpers.

Install dependencies and run the verification pipeline:

```bash
npm install
npm run verify
```

`npm run verify` runs the Community boundary check, compiles the workspace packages, runs the [Vitest](https://vitest.dev/) suite, and packages the VSIX. Tests run entirely in Node.js - no VS Code instance is required.

> Note: `npm test` on its own assumes the workspace packages (`@mfo/core`, `@mfo/preview-web`) are already compiled. Run `npm run compile` first, or use `npm run verify`, which compiles before testing.

## Security

> **Security & Privacy Notice:**
> This extension renders and exports Markdown content, including embedded HTML, images, and diagrams. Untrusted Markdown may reference remote or local resources. If AI features are enabled, user-supplied prompts or clipboard content may also be sent to the GitHub Copilot service already configured in VS Code. See below for safe usage and risk-mitigation guidance.

**Risk mitigation:**
- For privacy-sensitive or secure environments, set `markdownAiStudio.allowRemoteResources` to `false` to prevent outbound network requests for remote resources.
- Avoid opening Markdown files from untrusted sources, as they may reference local files or remote resources.
- The extension does not collect or transmit user data on its own. AI features stay locked until the user explicitly enables them and accepts that AI requests use the GitHub Copilot service already configured in VS Code.
- Rendered and exported documents may include content from referenced resources.
- HTML sanitization and a restrictive webview Content Security Policy (CSP) are applied to reduce XSS and script-injection risks. Mermaid runs in `securityLevel: 'strict'` mode.
- All dependencies are permissively licensed and regularly audited for vulnerabilities. If you discover a security issue, please report it via the project repository.

See [docs/security-review.md](./docs/security-review.md) for a detailed security assessment and mitigation strategies.

## AI Markdown Studio Pro

AI Markdown Studio Community is the open-source core. **AI Markdown Studio Pro** extends Community with advanced, proprietary features:

- AI-assisted **Convert to Markdown** and AI theme generation
- Adds PDF and PPTX export; Improved DOCX export.
- Corporate PowerPoint template-backed export with manifest inference/validation/generation and placeholder mapping
- GitHub Copilot agent-mode tools and prompt builders

Pro is packaged as a standalone extension built from a pinned Community revision plus a private Pro overlay, and it consumes Community's public `CommunityApiV1` surface internally. Installing Pro therefore gives you the complete AI Markdown Studio experience without a separate Community install. Community remains MIT-licensed; Pro features and assets are governed by the AI Markdown Studio Pro EULA, and nothing in that EULA limits the rights granted under the MIT License for Community components.

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software. See the [LICENSE](../../LICENSE) file for more details.

## License

This project is licensed under the MIT License. See the [LICENSE](../../LICENSE) file for details.

## Acknowledgments & Third-Party Licenses

This extension is built on the following open-source libraries:

- [markdown-it](https://github.com/markdown-it/markdown-it) (MIT License)
- [markdown-it-anchor](https://github.com/valeriangalliat/markdown-it-anchor) (MIT License)
- [markdown-it-emoji](https://github.com/markdown-it/markdown-it-emoji) (MIT License)
- [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote) (MIT License)
- [markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists) (ISC License)
- [markdown-it-texmath](https://github.com/rogers0/markdown-it-texmath) (MIT License)
- [mermaid](https://github.com/mermaid-js/mermaid) (MIT License)
- [sanitize-html](https://github.com/apostrophecms/sanitize-html) (MIT License)
- [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 OR MPL-2.0)
- [highlight.js](https://github.com/highlightjs/highlight.js) (BSD 3-Clause License)
- [katex](https://github.com/KaTeX/KaTeX) (MIT License)
- [html-to-docx](https://github.com/privateOmega/html-to-docx) (MIT License)
- [jsdom](https://github.com/jsdom/jsdom) (MIT License)
- [yaml](https://github.com/eemeli/yaml) (ISC License)
- [Inter](https://github.com/rsms/inter), [Fraunces](https://github.com/undercasetype/Fraunces), and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) fonts (SIL Open Font License 1.1)

All libraries are used in accordance with their license terms. See [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and `package-lock.json` for the authoritative dependency and version list. Bundled font license texts are distributed under `packages/md-preview-web/assets/fonts`.
