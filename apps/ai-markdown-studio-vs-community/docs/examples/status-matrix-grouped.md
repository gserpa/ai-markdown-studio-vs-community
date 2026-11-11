---
document: presentation
theme: midnight-delivery
---

# Delivery progress

~~~component
type: status-matrix
version: 1
data:
  markdown-table: |
    | Item  | Definition {2} | Build       |
    |       | Scope    | Sign-off      | Development |
    | ---   | ---      | ---           | ---         |
    | Alpha | Complete | Active :: 1/2 | Pending     |
    | Beta  | Pending  | 50%           | Complete    |
  statuses: { Complete: success, Active: info, Pending: neutral }
options:
  showLegend: true
~~~
