---
document: presentation
title: Example fact cards
theme: midnight-delivery
ratio: 16:9
---

<!--slide: content-->
# Example report snapshot

~~~component
type: fact-cards
version: 1
data:
  cards:
    - label: Teams reviewed
      value: { numerator: 6, denominator: 8 }
      detail: Two reviews remain.
      accent: info
    - label: Completed items
      value: 21
      unit: items
      accent: success
      icon: check
    - label: Next report
      value: "20 November"
      detail: Illustrative date
      icon: calendar
    - label: Shared folder
      value: "F:/reports/current"
      detail: Path displayed as text
      accent: warning
      icon: folder
~~~

---

<!--slide: content-->
# Example greenhouse facts

~~~component
type: fact-cards
version: 1
data:
  heading: Morning readings
  cards:
    - label: Temperature
      value: 18
      unit: °C
    - label: Ventilation
      value: Open
      accent: info
      icon: info
~~~
