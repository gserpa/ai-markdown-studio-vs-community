---
date: 2026-06-12
version: 0.2.0
---

# Community API

AI Markdown Studio Community exports `CommunityApiV1` from its VS Code `activate()` function.

Feature extensions obtain it through:

```ts
const extension = vscode.extensions.getExtension<CommunityApiV1>('GustavoSerpa.markdown-ai-studio');
const api = await extension?.activate();
```

Consumers must verify `api.apiVersion === "1.0"` before use. The API provides sanitised rendering, presentation parsing, theme discovery, table formatting, resource resolution, and command-launcher feature registration.
