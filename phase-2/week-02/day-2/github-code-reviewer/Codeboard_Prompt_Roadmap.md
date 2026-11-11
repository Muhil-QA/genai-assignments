# Codeboard Sentinel AI — Master Prompt & Execution Roadmap 🚀

> **Instruction for AI / Copilot**: Read each phase prompt sequentially. Execute **ONLY ONE PHASE AT A TIME**. After generating or updating code for a phase, pause completely and ask the user for approval before reading or executing the next phase.

---

## 📌 Instructions for the Human Developer
1. Save this file as `Codeboard_Prompt_Roadmap.md` in your VS Code workspace.
2. Open **GitHub Copilot Chat** in VS Code.
3. Paste the following master command to initiate the workflow:
   > *"Copilot, read `Codeboard_Prompt_Roadmap.md` and execute Phase 1 ONLY. Do not proceed to Phase 2 until I give explicit approval."*
4. Review the generated code, test it in your browser, and type **"Approved, proceed to Phase 2"** when you are ready to continue.

---

## Phase 1: Creating the Application & Visual Design System

### 🎯 Phase Goal
Build the initial visual layout establishing official **Codeboard Technology** branding, custom `<|>` logo mark, sky-blue/cyan theme, typography, professional header, and footer structure.

### 📋 Copy-Paste Prompt for AI Assistant
```text
Phase 1 - Build the Complete UI with Codeboard Technology Branding:

I am building an AI-powered GitHub Code Reviewer application for Codeboard Technology.

Please create a beautiful, responsive single-page web UI customized with my organization's exact brand identity:

1. Branding & Organization Identity:
   - Organization Name: Codeboard Technology
   - Logo Mark: Custom inline SVG displaying the signature Codeboard `<|>` icon with glowing cyan/sky-blue styling.
   - Application Title: Codeboard Sentinel AI — Enterprise GitHub Code Reviewer

2. Theme & Color Palette (Derived from Codeboard Logo):
   - Primary Background: Dark Slate / Obsidian (`#0B0F19`)
   - Card/Surface Background: Glassmorphism Dark Blue (`#111827` with `#1F2937` borders)
   - Accent Colors: Codeboard Sky Blue (`#00A3FF`) & Electric Cyan (`#00E5FF`)
   - Fonts: Google Fonts `Plus Jakarta Sans` for modern UI text and `Fira Code` for code blocks.

3. Header & Footer Layout:
   - Header: Top glassmorphism navigation bar containing the `<|>` logo, "Codeboard Technology" title, "Sentinel AI" badge, an n8n connection status pill ("n8n Engine: Active"), and an "Enterprise QA Edition" environment tag.
   - Footer: Professional corporate footer featuring "© 2026 Codeboard Technology Ltd. All Rights Reserved", system version "v2.4.0-release", and links for "Security Standards", "QA Policy", and "API Docs".

4. Layout & Content Sections:
   - 2-Column Grid Layout (Control Panel on Left, Review Canvas on Right).
   - Input Section:
     * GitHub PR / Repository URL field (e.g., [https://github.com/org/repo/pull/1](https://github.com/org/repo/pull/1))
     * Review Scope selector ("Full OWASP Security Audit", "Code Quality & Cleanliness", "Performance & Memory Optimization")
     * Raw Code Snippet textarea (optional fallback)
     * "Run Sentinel Analysis" action button with hover shimmer effect
   - Output Section: Initial placeholder card displaying "Waiting for code input to review..."

5. Message State Containers:
   - Pre-style containers for Loading, Success, Validation Error (red highlight borders), and System Connection Error states.

At this stage, create only the HTML structure and CSS styles. Do not write any JavaScript logic yet.