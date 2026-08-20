---
title: Presentation Table Wrapping
subtitle: Default-layout regression example
author: Markdown AI Studio QA
document: presentation
ratio: 16:9
---

# Presentation Table Wrapping

This short deck verifies that a regular Markdown table in a slide content area
uses wrap mode by default when its wide layout would overflow the slide.

---

<!--slide: default-->
# Wide Table in a Default Slide

This is intentionally a standard `default` slide, not a `table` or
`table-legend` slide. In wide mode the table exceeds the content area; by
default, its cell text should wrap so the table remains within the slide.

| Workstream          | Responsible team              | Decision required                                | Target milestone              | Customer impact                                                           | Implementation detail                                                              | Validation approach                                                                 | Release readiness                                                      |
| ------------------- | ----------------------------- | ------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Identity and access | Platform security engineering | Approve passwordless account recovery safeguards | September planning checkpoint | Customers can regain access without a support escalation                  | Recovery tokens rotate after each use and are bound to the verified device session | Run accessibility, threat-model, and account-recovery integration tests             | Ready after the support runbook and monitoring alerts are approved     |
| Data export         | Document platform experience  | Confirm the portable package naming convention   | October release candidate     | Teams can move completed reports between workspaces without losing assets | Export bundles Markdown, images, themes, and review metadata into one archive      | Compare exported content with the source workspace and reopen it in a clean profile | Ready when large documents and presentations complete without clipping |

<!--notes: Regression fixture: confirm the regular Markdown table wraps inside the default slide content area. It must not be extracted into the specialized table slide layout. -->
