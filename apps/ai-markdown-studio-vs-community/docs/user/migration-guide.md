# Migrating presentations and preview assets

This guide applies to the changes in version 1.4.0.

## Why migration is needed

Markdown slide directives now describe content purpose. The eight current types are `content`, `cover`, `two-column`, `illustrated-text`, `featured-visual`, `brief`, `divider`, and `thanks`. Placement belongs to the preview theme or the selected PowerPoint template. For example, `illustrated-text` describes supporting text and a visual; it does not promise that the visual stays on the right.

Retired directives are translated temporarily in memory so existing decks can open. This does **not** preserve every historical layout: the active theme/template may move content before you apply a source migration. Updating the source makes the intended content type explicit, removes retired-name warnings, and keeps the deck aligned with current autocomplete, validation, and AI guidance. There is no separate legacy renderer. Do not rely on the temporary translation as the permanent authoring contract.

## Migrate an existing Markdown deck

1. Commit or copy the original `.md` file so you can compare the result.
2. Open its presentation preview. The warning reports how many slides use retired types. Choose **Review migration**, or run **AI Markdown Studio: Review Slide Type Migration** from the Command Palette while the deck is open.
3. Choose the purpose of ambiguous slides. `table-legend` can become `two-column` or `content`; `side-banner` and `side-picture` can become `illustrated-text` or `featured-visual`; `default-side` can become `brief` or `content`. **Keep legacy type** leaves that slide for later review. Cancelling a picker applies nothing.
4. Review the source diff. Direct mappings are proposed automatically; the command changes directive names, not slide bodies or front matter. Choose **Apply migration** only after reviewing it. Dismissing the warning or diff without applying does not rewrite the deck. If the document changes during review, run the command again.
5. Save the edited file. Use normal editor Undo if you need to reverse the applied edits.
6. Check every slide with the selected theme, including light/dark mode, aspect ratio, images, diagrams, tables, and overflow. Re-export HTML or PowerPoint and inspect the output. A renamed type is not a promise of the former pixel placement.

| Retired directive | Temporary replacement | Review guidance |
| --- | --- | --- |
| `default`, `table` | `content` | Keep mixed content and tables in one ordered body. |
| `two-columns` | `two-column` | Check both groups; add one `<!--column-break-->` when you want an explicit boundary. |
| `table-legend` | `two-column` | Choose `content` if the table needs the full body width. |
| `image-right`, `side-banner` | `illustrated-text` | Use when explanation and a supporting visual both need space. `side-banner` also offers `featured-visual`. |
| `image-center`, `side-picture` | `featured-visual` | Use when the visual carries the message. `side-picture` also offers `illustrated-text`. |
| `default-side` | `brief` | Choose `content` for a longer, flowing body. |
| `section-divider`, `divider-b`, `divider-c` | `divider` | The theme/template selects the divider design. |
| `cover`, `divider`, `thanks` | Same name | No rename is needed. |

Unknown directive names are errors rather than migration candidates. Replace them with a current content type after reviewing their content. Existing H2-based column grouping remains readable; new decks should use a single `<!--column-break-->` between their two groups. The migration command does not insert column markers or restructure content.

For example, replace `<!--slide: image-right-->` with `<!--slide: illustrated-text-->`, then select placement through the presentation theme. Custom preview themes can set a `layouts` map, such as `"illustrated-text": "media-left"`, using a supported layout for that type. Existing color-token themes remain usable without adding a layout map. Refresh any installed workspace presentation skills using the updated bundled instructions; the installer preserves existing skill files, so review and replace old copies deliberately.

## HTML exports

No source migration is required for ordinary Markdown documents. HTML export embeds only referenced bundled font families, loads optional libraries when needed, and includes shared CSS modules once. Existing exported HTML files remain as they were; export again to receive the size reductions. Fonts needed by a selected family keep their available weights.
