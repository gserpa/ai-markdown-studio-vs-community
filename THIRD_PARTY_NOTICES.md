# Third-Party Notices

AI Markdown Studio Community is distributed under the MIT License and bundles third-party
software, all under permissive open-source licenses. No GPL/LGPL/AGPL or other
strong-copyleft components are included, and no AI Markdown Studio Pro dependencies or
proprietary source are included.

The list below covers the primary libraries shipped in the extension. The **authoritative**
and complete dependency and version list is recorded in `package-lock.json`. Bundled font
license texts are distributed alongside the fonts under
`packages/md-preview-web/assets/fonts/`.

## Primary runtime libraries

| Library | License |
| --- | --- |
| markdown-it | MIT |
| markdown-it-anchor | MIT |
| markdown-it-emoji | MIT |
| markdown-it-footnote | MIT |
| markdown-it-task-lists | ISC |
| markdown-it-texmath | MIT |
| mermaid | MIT |
| sanitize-html | MIT |
| DOMPurify | Apache-2.0 OR MPL-2.0 (used unmodified; distributed under the Apache-2.0 option) |
| highlight.js | BSD-3-Clause |
| katex | MIT |
| html-to-docx | MIT |
| jsdom | MIT |
| yaml | ISC |
| d3 and related modules (via mermaid) | BSD-3-Clause / ISC |
| cytoscape, roughjs, dagre-d3-es, marked (via mermaid) | MIT |
| argparse (via js-yaml/mermaid) | Python-2.0 |

## Bundled fonts

The following fonts are bundled and licensed under the **SIL Open Font License 1.1**. Their
full license texts ship under `packages/md-preview-web/assets/fonts/`:

- Inter — `LICENSE-Inter-OFL-1.1.txt`
- Fraunces — `LICENSE-Fraunces-OFL-1.1.txt`
- JetBrains Mono — `LICENSE-JetBrains-Mono-OFL-1.1.txt`

## License notes

- **DOMPurify** is dual-licensed `Apache-2.0 OR MPL-2.0`. It is used as an unmodified
  dependency; AI Markdown Studio Community relies on the Apache-2.0 option. No MPL-covered
  source has been modified or copied into first-party code.
- **khroma** (a transitive dependency of mermaid) does not declare a `license` field in its
  `package.json`, but ships an MIT `license` file in its package. It is therefore treated as
  MIT-licensed.

## License compatibility

All bundled licenses (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Python-2.0, and
SIL OFL-1.1 for fonts) are permissive and compatible with distribution of this extension
under the MIT License.

For full license texts, see each library's repository or its package directory under
`node_modules/`. Questions about attribution or compliance can be directed to the project
maintainer.
