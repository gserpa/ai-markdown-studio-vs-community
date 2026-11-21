# AI Markdown Studio Community

<p align="center">
  <img src="apps/ai-markdown-studio-vs-community/media/markdown-ai-studio-logo.png" alt="AI Markdown Studio" width="520" />
</p>

AI Markdown Studio Community is the MIT-licensed open-source core of AI Markdown Studio.

It provides preview-first Markdown authoring, live document and presentation previews, Mermaid, KaTeX, syntax highlighting, table formatting, document and presentation themes, speaker notes in presentation view, AI-assisted document and presentation generation, MPS agent tools and provider-specific skills, AI Paste to Markdown, HTML export, and basic DOCX export.

AI Markdown Studio Pro is a separate product that extends Community with AI theme generation, file conversion, PDF/PPTX export, high-fidelity DOCX, additional document/theme Copilot tools, shared custom theme folders, and corporate PowerPoint template automation. Pro is a standalone extension; users do not need to install Community alongside it.

## Start Here

- [Documentation](docs/README.md) - tutorials, task help, syntax reference, privacy, and examples
- [Extension README](./apps/ai-markdown-studio-vs-community/README.md) - feature tour and user-facing overview
- [Why Upgrade to Pro?](./apps/ai-markdown-studio-vs-community/docs/user/upgrade-to-pro.md) - Community-to-Pro comparison focused on advanced conversion, export, theming, and Copilot workflows

## Installation

Install from the VS Code Marketplace:

```powershell
code --install-extension GustavoSerpa.markdown-ai-studio
```

Or install a packaged build directly from a `.vsix` file:

```powershell
code --install-extension markdown-ai-studio-1.3.0.vsix
```

## Highlights

- Preview-first custom editor for Markdown files
- Live Markdown and presentation previews
- Mermaid diagrams with strict-mode rendering
- KaTeX math rendering
- Theme support for document and presentation views
- AI-assisted document generation through the GitHub Copilot service already configured in VS Code
- Presentation generation with native Copilot generation or a complete portable prompt for any AI assistant
- Local MPS prompt, validation, and safe-save tools, plus installable skills for GitHub Copilot, Claude, and Codex
- AI Paste to Markdown
- HTML export and basic DOCX export
- Command launcher and settings shortcuts built into the editor UI

## License

MIT. See [LICENSE](LICENSE).
