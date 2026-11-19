# `@mfo/review`

Host-neutral preview mapping and comment actions shared by Markdown review
hosts. The package uses `@mfo/core` for comment parsing and serialization; it
does not access VS Code, storage, or AI services.

`createReviewPreviewTools` takes host adapters for DOM parsing, anchor
rendering, and sanitization. Use the same Markdown renderer for anchor
mapping as the preview. When building preview state, supply the parsed
review snapshot and a deterministic content key derived from
`reviewContentKeySource`. Dispose of any DOM resources in the adapter's
`dispose` callback.
`createReviewActionHandler` accepts the resulting selection mapper and returns
a function that validates a session and revision, generates updated Markdown,
and passes it to the host's conditional edit operation.
`createReviewCommentActions` exposes the underlying comment actions when a host
needs to manage serialization separately.

The host must treat preview messages as untrusted, supply a current snapshot and
preview, and implement the edit operation so it returns `false` if the expected
revision or session no longer matches at application time. A successful
operation returns `true`; failures may also reject with a descriptive error.
The package does not save documents or enforce a host's revision check.
