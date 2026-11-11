# Codeboard Sentinel AI — Implementation Plan 🚀

## Executive Overview
**Codeboard Sentinel AI** is an enterprise-grade, AI-powered GitHub Code Reviewer application designed for **Codeboard Technology**. It accepts GitHub Pull Request URLs, subfolder/repository paths, or raw code snippets, processes them via an n8n webhook workflow using an LLM chain, and returns structured code security and quality audits inside a customized dark-mode interface.

---

## Architecture Blueprint

```
+------------------------------------+         +---------------------------------------+
|  Frontend UI (Vanilla HTML/CSS/JS) |         |     n8n Backend Workflow Engine       |
|                                    |         |                                       |
|  - Obsidian Dark Theme             |  POST   |  1. Webhook Trigger                   |
|  - Codeboard `<|>` Branding        |  ====>  |  2. HTTP Request (GitHub API)          |
|  - Input Validation & Tickers      | Payload |  3. LLM Chain (Groq / Llama-3)        |
|  - Markdown & Table Renderer       |  <====  |  4. Respond to Webhook (JSON)         |
|                                    |  JSON   |                                       |
+------------------------------------+         +---------------------------------------+
```

---

## Implementation Phases

### Phase 1: Brand System & Core Layout Design
* Establish Codeboard Technology brand parameters:
  * **Primary Background:** Dark Obsidian (`#0B0F19`)
  * **Accents:** Codeboard Sky Blue (`#00A3FF`) and Cyan (`#00E5FF`)
  * **Typography:** `Plus Jakarta Sans` for UI, `Fira Code` for code blocks.
  * **Logo:** Custom SVG `<|>` code mark with glowing CSS effects.
* Build responsive 2-column grid dashboard layout (Control Panel on Left, Review Workspace on Right).

### Phase 2: Navigation & Status Mechanics
* Implement fixed glassmorphism header with pulsing `<|>` brand mark.
* Add environmental pills ("n8n Engine: Active", "Enterprise QA Edition").
* Add professional corporate footer ("© 2026 Codeboard Technology Ltd.").

### Phase 3: Input Controls & UI Validation
* Add GitHub URL input field supporting PRs (`/pull/`), Folders (`/tree/main/`), and Commits (`/commits`).
* Add Review Scope dropdown options (*Full OWASP Security Audit*, *Code Quality*, *Performance Optimization*).
* Add Raw Code snippet textarea as a fallback.
* Add form validation shaking animations and banner error alerts for empty submissions.

### Phase 4: n8n Backend Workflow Integration
* **Webhook Node:** Set to `POST` method on `/webhook/github-code-reviewer`.
* **HTTP Request Node:**
  * Configure Header Authentication (`Authorization: Bearer <GITHUB_PAT>`) for private repo access.
  * Implement dynamic JavaScript URL routing logic:
    * *Pull Requests* $\rightarrow$ `.diff` endpoint.
    * *Subfolders* $\rightarrow$ `/contents/` API endpoint.
    * *Repositories* $\rightarrow$ `/commits` API endpoint.
  * Set **On Error** behavior to `Continue (using error output)`.
* **LLM Chain Node:** Connect Groq / Llama-3 model with specialized code analysis system prompts.
* **Respond to Webhook Node:** Escape dynamic markdown output safely using `JSON.stringify()`.

### Phase 5: Client-Side Webhook Async Handler & Status Ticker
* Trigger asynchronous `fetch()` `POST` requests to the n8n endpoint.
* Implement status rotation ticker updating status messages every 1.5 seconds (*"Parsing git diff..."*, *"Checking OWASP standards..."*, *"Generating report..."*).
* Add error handling for timeout or unreachable server conditions.

### Phase 6: Markdown Engine & Workspace Formatting
* Parse returned AI evaluation strings into styled HTML:
  * Convert markdown headings into glowing Sky Blue section titles.
  * Format markdown tables (`| Parameter | Score |`) into glassmorphism data tables.
  * Render code recommendations inside high-contrast dark code containers with syntax highlighting styles.
* Display success toast notifications and pop up a "REVIEW COMPLETE" badge upon completion.
