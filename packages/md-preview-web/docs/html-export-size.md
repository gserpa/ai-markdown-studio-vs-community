# HTML export size baseline

Measured on 2026-10-27 using the real renderer, bundled themes, fonts, and generated assets. The baseline includes the presentation changes already present in the working tree before this optimization. Sizes are UTF-8 bytes on disk, without HTTP compression. The fixtures contain no external images or chart libraries.

| Fixture | HTML before | HTML after | CSS before | CSS after | Embedded font files before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| System-font document (`light`) | 465,068 | 173,053 | 354,929 | 62,914 | 10 / 0 |
| Inter document with code (`autumn-ember`) | 465,741 | 361,976 | 355,581 | 251,816 | 10 / 6 |
| Fraunces document with code (`dark-aurora-noir`) | 465,686 | 328,644 | 355,518 | 218,476 | 10 / 6 |
| Two-slide presentation (`modern-blue`) | 523,147 | 224,327 | 407,142 | 108,322 | 10 / 0 |
| System-font document with math (`light`) | 493,950 | 201,935 | 381,641 | 89,626 | 10 / 0 |

The system-font document is 62.8% smaller; the presentation is 57.1% smaller. The unchanged preview JavaScript remains part of these HTML totals. CSS totals include inline font data, theme styles, and export overrides.

## Reproduce

From the Community repository, build the assets and run the integration fixtures:

```powershell
npm run compile
$env:AMS_REPORT_EXPORT_SIZE = '1'
npx vitest run apps/ai-markdown-studio-vs-community/test/export/html/htmlExportAssets.integration.test.ts --disableConsoleIntercept
```

The integration fixtures verify that inline and external exports carry equivalent CSS, and that required font families remain embedded. The optional report prints current sizes; the historical columns above capture the original implementation, which embedded all ten fonts and emitted unminified CSS.

## Scope

- Build assets use esbuild whitespace minification, preserving syntax, cascade order, and compatibility fallbacks. Built-in theme exports use their precompiled assets when their source hashes match. Custom theme CSS remains a generated fallback so workspace overrides stay current.
- Export font selection retains all available weights of every referenced bundled family. It considers shared styles, the resolved theme (including auto-mode alternatives), and rendered content such as chart font settings. Ambiguous CSS escapes keep the original font set.
- Only the selected preview mode and required optional libraries are read. Hashed assets share a bounded cache keyed by path and content hash. Vendor files and encoded fonts use file metadata to invalidate cached values. Concurrent requests share reads; failed reads can be retried.
- Selection by slide layout and website font externalization remain separate work. The module split is recorded below.

## Stage two: explicit CSS modules

The source stylesheet now consists of 20 modules ordered by `styles/modules.json`. The combined fallback stylesheet preserves the original source order. Preview and export share the same schema-v2 module plan; document-only modules are excluded from presentations, and media/lightbox modules are selected once when needed.

| Fixture | HTML after stage one | HTML after stage two | CSS after stage one | CSS after stage two |
| --- | ---: | ---: | ---: | ---: |
| System-font document | 173,053 | 172,165 | 62,914 | 62,026 |
| Inter document with code | 361,976 | 361,088 | 251,816 | 250,928 |
| Fraunces document with code | 328,644 | 327,756 | 218,476 | 217,588 |
| Two-slide presentation | 224,327 | 201,571 | 108,322 | 85,566 |
| Presentation with one embedded image | 232,183 | 207,686 | 117,221 | 92,724 |
| System-font document with math | 201,935 | 201,047 | 89,626 | 88,738 |

Presentation CSS is approximately 21% smaller than after stage one, for both plain and media fixtures. HTML is about 10% smaller because its JavaScript and content remain the same. Document exports also omit presentation-specific palette rules previously included in the compatibility tail.

The media fixture uses one embedded PNG and no chart libraries. Its byte count is specific to that fixture. The raw CSS extraction changed no rules: the module sources concatenate to the same combined stylesheet. Runtime selection changes which mode-specific and optional modules are emitted, while preserving their relative order.
