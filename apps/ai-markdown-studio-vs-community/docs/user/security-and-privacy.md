# Security and privacy for Community users

Community has no product account or server component and does not collect product telemetry. Ordinary authoring, preview, bundled themes, HTML export, and basic DOCX export do not require a sign-in to AI Markdown Studio.

AI commands can send the content you provide to the GitHub Copilot service configured in VS Code after you enable native AI access or accept its disclosure. Copying a prompt or installing a presentation skill is local; sharing that prompt with another assistant is governed by that service. Review sensitive material before using an AI command.

Markdown, charts, media, and exported HTML may reference remote resources. To prevent remote loading while reviewing an untrusted document or working in a restricted environment, set `markdownAiStudio.allowRemoteResources` to `false` in VS Code settings. Local file links and images may also reveal files you choose to reference.

For a product problem, use [Support](../../SUPPORT.md). **Do not report a suspected vulnerability in a public issue.** Use the private contact route described in Support. For command and setting details, see the [user guide](user-guide.md#privacy-and-remote-resources).
