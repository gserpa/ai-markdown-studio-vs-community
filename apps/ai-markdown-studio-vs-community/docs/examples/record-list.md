---
document: presentation
title: Example record lists
theme: midnight-delivery
ratio: 16:9
---

<!--slide: content-->
# Decisions and issues

~~~component
type: record-list
version: 1
data:
  heading: Decisions
  records:
    - id: D-01
      title: Select a review route
      detail: Confirm the approach for the next checkpoint.
      metadata: { Owner: Team North, Due: "20 October" }
      status: { label: Open, style: info }
    - id: D-02
      title: Agree the release window
      metadata: { Owner: Team East }
      status: { label: Pending, style: warning }
options:
  variant: compact
~~~

<!-- region-break -->

~~~component
type: record-list
version: 1
data:
  heading: Issues
  records:
    - id: I-01
      title: Access is awaiting review
      detail: Follow up with the service owner.
      metadata: { Owner: Team West }
      status: { label: Open, style: warning }
options:
  variant: compact
~~~

---

<!--slide: content-->
# Example capability review

~~~component
type: record-list
version: 1
data:
  groups:
    - label: Practice
      records:
        - title: Shared guidance
          detail: Guidance is available to the team.
          scale: { value: 2, max: 4, label: Stage }
        - title: Review cadence
          detail: A recurring review has been proposed.
          scale: { value: 1, max: 4, label: Stage }
    - label: Tools
      records:
        - title: Shared workspace
          tags: [Documentation, Collaboration]
          status: { label: Available, style: success }
options:
  variant: rows
~~~
