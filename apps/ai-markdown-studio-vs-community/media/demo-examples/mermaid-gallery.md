---
title: Mermaid Diagram Gallery
---

# Mermaid Diagram Gallery

A range of Mermaid diagram types for preview, zoom, and export (PDF/DOCX/PPTX)
testing. Each section is a self-contained diagram so individual cases can be
copied into other fixtures if needed.

## 1. Flowchart

A small flowchart for basic preview smoke-testing and zoom controls.

```mermaid
flowchart LR
    Start([Start]) --> Input[Capture Input]
    Input --> Validate{Valid?}
    Validate -->|Yes| Save[Save Record]
    Validate -->|No| Retry[Ask Again]
    Retry --> Input
    Save --> End([End])
```

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant WebApp
    participant API
    participant DB

    User->>WebApp: Submit form
    WebApp->>API: POST /items
    API->>DB: Insert row
    DB-->>API: Row ID
    API-->>WebApp: 201 Created
    WebApp-->>User: Show success
```

## 3. Class Diagram

```mermaid
classDiagram
    class Exporter {
        +String format
        +export(document)
    }

    class PdfExporter {
        +export(document)
    }

    class PptxExporter {
        +export(document)
    }

    Exporter <|-- PdfExporter
    Exporter <|-- PptxExporter
```

## 4. State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: Submit
    Review --> Draft: Request changes
    Review --> Approved: Approve
    Approved --> Published: Publish
    Published --> [*]
```

## 5. Pie Chart

```mermaid
%%{init: {'themeVariables': {'pie1': '#2a9d8f', 'pie2': '#f4a261'}}}%%
pie title Manual Test Coverage by Area
    "Community" : 17
    "Pro" : 10
```

## 6. Gantt Chart

```mermaid
gantt
    title Release Checklist
    dateFormat  YYYY-MM-DD
    section Authoring
    Write detail test files :done, a1, 2026-06-01, 5d
    Create fixtures         :active, a2, after a1, 3d
    section Verification
    Run community tests     : a3, after a2, 3d
    Run Pro export tests    : a4, after a3, 3d
```

## 7. Diagram with Click Directives and HTML-like Labels

Tests `securityLevel: 'strict'` during export — the click interactions and the
raw-looking tags in the label below should be neutralized rather than executed
or rendered as live HTML/links.

```mermaid
flowchart LR
    A["Node with <b>tags</b> in its label"] --> B[Result]
    click A "https://example.com" "Open example.com"
    click B call alert("clicked")
```

## 8. Large Diagram (Render-Time Stress Test)

A higher-complexity flowchart intended to push Mermaid's layout engine and
exercise the ~15 second render timeout used by export. If this diagram does
not finish rendering in time, document the resulting behavior (diagram
omitted vs. export failure).

```mermaid
flowchart TB
    subgraph Client Layer
        Browser[Customer Browser]
        Mobile[Mobile App]
        Desktop[Desktop App]
    end

    subgraph Edge
        CDN[CDN]
        WAF[Web Application Firewall]
        LB[Load Balancer]
    end

    subgraph Application Cluster
        Web1[Web Node A]
        Web2[Web Node B]
        Web3[Web Node C]
        Jobs[Worker Queue]
        Cache[(Redis Cache)]
    end

    subgraph Services
        Auth[Auth Service]
        Catalog[Catalog Service]
        Billing[Billing Service]
        Search[Search Service]
        Notify[Notification Service]
        Audit[Audit Service]
    end

    subgraph Data Layer
        SQL[(Primary SQL DB)]
        Replica[(Read Replica)]
        Blob[(Object Storage)]
        Metrics[(Telemetry Store)]
        Queue[(Message Bus)]
    end

    Browser --> CDN
    Mobile --> CDN
    Desktop --> CDN
    CDN --> WAF
    WAF --> LB
    LB --> Web1
    LB --> Web2
    LB --> Web3

    Web1 --> Auth
    Web1 --> Catalog
    Web1 --> Billing
    Web1 --> Search
    Web2 --> Auth
    Web2 --> Catalog
    Web2 --> Billing
    Web2 --> Notify
    Web3 --> Search
    Web3 --> Audit

    Web1 <--> Cache
    Web2 <--> Cache
    Web3 <--> Cache
    Web1 --> Jobs
    Web2 --> Jobs
    Web3 --> Jobs

    Auth --> SQL
    Catalog --> SQL
    Billing --> SQL
    Search --> Replica
    Notify --> Queue
    Audit --> Blob
    Jobs --> Blob
    Jobs --> Queue

    Auth --> Metrics
    Catalog --> Metrics
    Billing --> Metrics
    Search --> Metrics
    Notify --> Metrics
    Audit --> Metrics
```

## 9. Multiple Diagrams on One Page

The flowchart and sequence diagram above already demonstrate independent
rendering and zoom controls (markdown-rendering.md TC13) when both are open in
the same preview.

## 10. Entity Relationship Diagram

```mermaid
erDiagram
    USER {
        int user_id PK
        string email
        string full_name
    }

    ORDER {
        int order_id PK
        int user_id FK
        decimal total_amount
        string status
    }

    ORDER_ITEM {
        int order_item_id PK
        int order_id FK
        int product_id FK
        int quantity
    }

    PRODUCT {
        int product_id PK
        string sku
        string name
        decimal price
    }

    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : includes
```

## 11. Git Graph

```mermaid
gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "setup"
    branch feature/auth
    checkout feature/auth
    commit id: "login-ui"
    commit id: "token-refresh"
    checkout develop
    merge feature/auth
    branch hotfix/prod
    checkout hotfix/prod
    commit id: "patch"
    checkout main
    merge hotfix/prod
    checkout develop
    merge main
```
