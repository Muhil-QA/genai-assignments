# RecruitBot — Frontend Web Application Instructions (ingestion + Retrieval)

This document merges frontend ingestion flow with existing retrieval frontend phases.

> **Implementation intent:** Build the frontend phase by phase so that the learner can **see and verify a working result at the end of every ingestion phase**, instead of waiting until the later retrieval phases before the application becomes visible.
>
> **Do not change backend/business logic.** The backend is treated as already implemented. The ingestion endpoint, retrieval endpoints, payloads, storage flow, search logic, and all existing retrieval requirements remain unchanged.

## FINAL FLOW

```text
Resume ingestion
        ↓
MongoDB Storage
        ↓
Vector Search Ready
        ↓
Resume Retrieval/Search
```

---

## NON-NEGOTIABLE IMPLEMENTATION RULES

These rules apply to **PHASE 1 through PHASE 9** and to the handover into the existing retrieval phases.

1. **Do not redesign or replace working backend logic.** Frontend code only consumes the existing APIs.
2. **Use the same frontend codebase throughout.** Do not create a second frontend project for retrieval.
3. **Never delete or recreate an existing `src/` folder.** Create only missing folders/files and merge changes non-destructively.
4. **Never remove `src/features/ingestion/` when retrieval implementation starts.** The ingestion feature must remain available in the final codebase.
5. **Do not rename or change existing backend endpoints.** Ingestion continues to use `POST /v1/resume/inject`.
6. **Do not fake a successful ingestion response when the real backend is available.** UI state must reflect the actual API response/error.
7. **At the end of every phase, run the application and perform the phase checkpoint before continuing.**
8. **If a file already exists, update/merge only what is required for the current phase. Do not replace unrelated working code.**
9. **Do not remove a completed earlier-phase UI just because a later phase adds new components.** Extend the existing screen incrementally.
10. **Commit/checkpoint after every completed phase** so the learner has a known working state to return to.

---

# PHASE 1 — ingestion Frontend Setup

## Goal

Prepare the frontend project and ingestion folder structure so all later ingestion phases are implemented in the **same application** that will later contain retrieval.

This phase is about **project bootstrap + folder verification**. Do not wait until Phase 10 to create the React/Vite application.

## Step 1 — Reuse Existing Project or Bootstrap Once

First inspect the repository root.

### If `package.json`, `src/`, and Vite files already exist

- Reuse the existing project.
- **Do not run `npm create vite` again.**
- Continue by creating only the missing ingestion folders shown below.

### If no frontend project exists yet

Run once:

```bash
npm create vite@latest recruitbot-web -- --template react-ts
cd recruitbot-web
npm install
```

The `recruitbot-web/` folder created here is the **single frontend project** used by ingestion and retrieval.

## Step 2 — Install Shared Dependencies Early

The UI must be runnable from the early phases, so install the shared dependencies before building Phase 2.

```bash
npm install react-router-dom zustand axios
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react framer-motion
npm install react-hot-toast

npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node
npm install -D eslint prettier eslint-config-prettier
```

> If any dependency is already present, keep the installed version unless there is a genuine compatibility issue. Do not reset the project just to reproduce these commands.

## Step 3 — Create ingestion Folder Structure

Create the following folders **inside the existing `src/`**:

```text
src/
├── features/
│   ├── ingestion/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── types/
```

Recommended placeholder files for clean source control and incremental implementation:

```text
src/features/ingestion/
├── components/
├── pages/
│   └── IngestionPage.tsx
├── services/
├── hooks/
├── stores/
├── types/
└── index.ts
```

`IngestionPage.tsx` can initially contain only a minimal placeholder such as the application title and "Resume ingestion setup ready". It must not contain fake API logic.

## Phase 1 — Learner Verification Checkpoint

Before moving to Phase 2, verify:

- [ ] There is only **one** frontend project directory.
- [ ] `package.json` exists.
- [ ] `src/` exists.
- [ ] `src/features/ingestion/` exists.
- [ ] All six ingestion subfolders exist: components, pages, services, hooks, stores, types.
- [ ] No retrieval folder/file was deleted to create ingestion.
- [ ] No backend code was changed.

### Expected visible/physical result

At the end of Phase 1, the learner must be able to open the IDE explorer and clearly see the ingestion folder structure. The purpose of this checkpoint is **structure verification**, not final UI behaviour.

### Stop condition

Do not continue to Phase 2 until the above folders are present in the same codebase that will later be used for retrieval.

---

# PHASE 2 — Resume Upload UI

## Goal

Build the first visible ingestion screen and make sure the learner can launch it with `npm run dev` immediately in this phase.

From this phase onward, **every phase must end with a browser-visible verification**.

## Components

```text
ResumeUploadCard.tsx
UploadDropzone.tsx
UploadButton.tsx
UploadProgress.tsx
```

Place them under:

```text
src/features/ingestion/components/
```

The page component remains under:

```text
src/features/ingestion/pages/IngestionPage.tsx
```

## Features

- Drag and drop upload
- PDF validation entry point
- Upload progress area
- Upload success state area
- Upload error state area

At this phase, focus on the **UI shell and interaction surface**. Actual API submission is added in Phase 3.

## UI Assembly Requirement

`IngestionPage.tsx` should visibly compose:

```text
RecruitBot
Resume ingestion

[ Drag & Drop PDF Area ]
[ Browse / Select PDF ]
[ Upload Resume Button ]

Progress / status area
```

The Upload button may remain disabled until a PDF file is selected. Do not return a fake success message in Phase 2.

## Make the UI Launchable Now

Ensure the current `App.tsx` renders the ingestion page during the ingestion build stages. If routing already exists, preserve it and add the ingestion page without deleting existing routes.

Use the existing Vite script:

```bash
npm run dev
```

Expected development URL is normally:

```text
http://localhost:5173
```

Use the actual Vite URL printed in the terminal if the port differs.

## Phase 2 — Learner Verification Checkpoint

Run:

```bash
npm run dev
```

Then open the application in the browser and verify:

- [ ] Application loads with no blank screen.
- [ ] Resume ingestion heading is visible.
- [ ] Drag-and-drop/upload area is visible.
- [ ] PDF browse/select control is visible.
- [ ] Upload button is visible.
- [ ] Selecting a PDF updates the UI with the selected filename or ready state.
- [ ] No backend success is simulated yet.
- [ ] Browser console has no blocking error.

### Expected visible result

The learner can now **see the actual application from Phase 2**, rather than waiting until Phase 10+.

### Stop condition

Do not continue until `npm run dev` launches a visible working Resume Upload screen.

---

# PHASE 3 — ingestion API Integration

## Goal

Connect the already-visible Resume Upload UI to the existing ingestion backend without changing backend behaviour.

## Backend Endpoint

```http
POST /v1/resume/inject
```

## Responsibilities

- Upload PDF
- Send `multipart/form-data`
- Handle loading state
- Handle success response
- Handle error response

## Implementation Location

Use the ingestion service layer:

```text
src/features/ingestion/services/
```

For example:

```text
src/features/ingestion/services/ingestion.api.ts
```

The component must call the service. Do not duplicate Axios/API request logic across UI components.

## API Integration Rules

- Use the existing backend endpoint exactly as defined.
- Send the selected PDF as `multipart/form-data` using the field name expected by the existing backend.
- Do not alter the backend request contract from the frontend just to make the UI easier.
- Use the existing project API base URL/configuration if already available.
- If the project already contains a shared Axios client, reuse it rather than creating a conflicting second client.
- The UI must show real loading/success/error behaviour from the API call.

## Browser-Visible Behaviour in This Phase

When the user selects a PDF and clicks **Upload Resume**:

```text
Ready to upload
      ↓
Uploading...
      ↓
API response received
```

At this phase, a simple success/error message is sufficient. Detailed progress stages are added in Phase 5 and the result screen is refined in Phase 6.

## Phase 3 — Learner Verification Checkpoint

Run both existing backend and frontend, then:

1. Open the ingestion UI.
2. Select a valid PDF.
3. Click **Upload Resume**.
4. Open Browser DevTools → Network.
5. Verify the request is sent to `POST /v1/resume/inject`.

Verify:

- [ ] Request method is `POST`.
- [ ] Request is sent as multipart/form-data.
- [ ] UI enters a loading/uploading state while request is pending.
- [ ] Successful backend response produces a visible success state/message.
- [ ] Failed backend response produces a visible error state/message.
- [ ] No backend source code was changed.
- [ ] No retrieval source code was removed.

### Expected visible result

The learner can now see the UI submit a real resume to the existing backend and visibly observe success or failure.

### Stop condition

Do not continue until the Network tab proves the real ingestion endpoint is being called from the UI.

---

# PHASE 4 — ingestion State Management

## Goal

Move ingestion UI state into a predictable store without changing the working upload/API logic from Phase 3.

## Store Responsibilities

- Upload loading state
- Upload progress
- ingestion success
- ingestion error
- Uploaded file state

## Implementation Location

```text
src/features/ingestion/stores/
```

Example:

```text
src/features/ingestion/stores/ingestion.store.ts
```

Use the project's selected state-management approach. Since Zustand is already part of the frontend stack, use a dedicated ingestion store and keep it separate from retrieval/search state.

## State Ownership Rule

The ingestion store owns ingestion-specific state only. It must **not** overwrite or reset retrieval/search stores.

Recommended state shape:

```text
selectedFile
isUploading
uploadProgress
successResult
error
```

Do not move backend business logic into the store. The store coordinates frontend state; the existing API service remains responsible for the request.

## Browser-Visible State Verification

The learner must be able to trigger and observe each state in the existing upload screen:

```text
No file selected
      ↓
File selected / Ready
      ↓
Uploading
      ↓
Success
```

or

```text
No file selected
      ↓
File selected / Ready
      ↓
Uploading
      ↓
Error
```

## Phase 4 — Learner Verification Checkpoint

Verify in the browser:

- [ ] Before selection, the UI shows no selected file.
- [ ] After selecting a PDF, the filename/ready state appears.
- [ ] During upload, loading state becomes active and double-submit is prevented.
- [ ] On success, success state is stored and rendered.
- [ ] On failure, error state is stored and rendered.
- [ ] Selecting a new file clears only stale ingestion status required for the new attempt.
- [ ] Retrieval/search state is not modified.
- [ ] Refreshing/navigating does not physically remove `src/features/ingestion/` files.

### Expected visible result

The UI should clearly prove that file selection, loading, success, and error states are controlled consistently instead of being scattered across components.

---

# PHASE 5 — ingestion Progress UI

## Goal

Make the ingestion pipeline visibly understandable to the learner/user while the existing backend process runs.

## Progress Flow

```text
Resume Upload
      ↓
PDF Processing
      ↓
Resume Parsing
      ↓
Embedding Generation
      ↓
MongoDB ingestion
      ↓
Completed
```

## UI Requirement

Extend the existing `UploadProgress.tsx`; do not replace the upload screen.

Display the stages in order with clear visual states such as:

```text
✓ Resume Upload
● PDF Processing
○ Resume Parsing
○ Embedding Generation
○ MongoDB ingestion
○ Completed
```

Use only progress information that can be legitimately derived from the existing backend/API behaviour. If the current endpoint returns only a final response and does not stream individual backend stage events, do **not** invent fake backend completion events. In that case:

- show a real `Uploading / Processing` state while the request is pending;
- show the backend-confirmed completed stages only when the success response is received;
- keep the stage labels as a user-facing representation of the known ingestion flow.

## Phase 5 — Learner Verification Checkpoint

Run a valid upload and verify:

- [ ] Progress UI is visible before/during submission.
- [ ] Current processing state is visually identifiable.
- [ ] UI does not report `Completed` before the real backend success response.
- [ ] On success, progress reaches Completed.
- [ ] On failure, progress stops and the relevant error state remains visible.
- [ ] Existing Phase 2 upload controls still work.
- [ ] Existing Phase 3 API call still uses `POST /v1/resume/inject`.

### Expected visible result

The learner can explain what stage the ingestion UI represents and can immediately verify the working behaviour in the browser.

---

# PHASE 6 — ingestion Result Screen

## Goal

Show a clear completion/result state after the existing ingestion endpoint reports success.

## Success Information

- Resume uploaded successfully
- Embedding generated successfully
- MongoDB ingestion completed
- Vector search ready

## UI Requirement

After successful ingestion, keep the result within the same ingestion experience. Do not navigate to a different temporary application or delete the upload page.

Recommended visible structure:

```text
Resume ingestion completed

✓ Resume uploaded successfully
✓ Embedding generated successfully
✓ MongoDB ingestion completed
✓ Vector search ready

[ Upload Another Resume ]
```

Only display statements supported by the real successful backend contract. If the current API response does not confirm one of the detailed success items separately, display it as part of the documented completed ingestion flow rather than fabricating a separate backend response field.

## Phase 6 — Learner Verification Checkpoint

Perform a successful PDF upload and verify:

- [ ] Success/result section appears without manual page refresh.
- [ ] No stale error message remains after success.
- [ ] Result screen clearly shows the ingestion completed state.
- [ ] `Upload Another Resume` or equivalent reset action returns to a clean upload state.
- [ ] Resetting the ingestion screen clears frontend ingestion state only.
- [ ] Retrieval/search data and folders are untouched.

### Expected visible result

The learner can complete one real upload and immediately identify that the resume is ready for later retrieval/search.

---

# PHASE 7 — ingestion Validation Handling

## Goal

Add frontend validation while preserving the API integration and all previously working UI behaviour.

| Validation | Message |
|---|---|
| Invalid file | Only PDF allowed |
| Large file | Maximum 5MB allowed |
| Empty upload | Please select a file |

## Validation Behaviour

Validation must happen before unnecessary API submission where possible.

### Invalid file

Select a non-PDF file.

Expected:

```text
Only PDF allowed
```

The API must not be called for this invalid selection.

### Large file

Select a PDF larger than 5MB.

Expected:

```text
Maximum 5MB allowed
```

The API must not be called.

### Empty upload

Click Upload without selecting a file.

Expected:

```text
Please select a file
```

The API must not be called.

## Phase 7 — Learner Verification Checkpoint

Using Browser DevTools → Network, verify all three cases:

- [ ] Non-PDF shows `Only PDF allowed` and makes no ingestion request.
- [ ] PDF > 5MB shows `Maximum 5MB allowed` and makes no ingestion request.
- [ ] Empty submission shows `Please select a file` and makes no ingestion request.
- [ ] A valid PDF still passes validation and continues to the existing Phase 3 API flow.
- [ ] Validation messages clear appropriately when the user corrects the input.

### Expected visible result

The learner can deliberately trigger each validation rule and see exactly why the upload is blocked.

---

# PHASE 8 — ingestion Error Handling

## Goal

Make backend/processing failures visible and recoverable without changing the backend error logic.

## Error States

- PDF extraction failed
- Resume parsing failed
- Embedding generation failed
- MongoDB ingestion failed
- Network error

## Error Handling Rules

- Prefer the real backend error message/code when the current API provides one.
- Map known backend failures to the documented user-facing states above.
- Do not convert every error into a false success.
- Do not clear the selected file unexpectedly unless the user chooses to reset/retry.
- Keep retry behaviour frontend-only; do not duplicate records by silently auto-retrying a completed ingestion.
- A network error must not be shown as a MongoDB or parsing error.

## Browser-Visible Error Behaviour

The existing upload card/result area must show:

```text
Upload failed
<specific error message>

[ Retry ]   [ Choose Another File ]
```

where appropriate.

## Phase 8 — Learner Verification Checkpoint

Use safe test conditions available in the existing environment, for example an invalid backend response or temporarily unavailable backend, and verify:

- [ ] Network/backend failure produces a visible error message.
- [ ] UI exits the loading state after failure.
- [ ] Upload button becomes usable again when retry is allowed.
- [ ] Error does not erase the entire ingestion feature/folder or reset the application project.
- [ ] A subsequent valid upload can still succeed.
- [ ] No retrieval code is touched while handling ingestion errors.

### Expected visible result

The learner can see both successful and unsuccessful ingestion journeys and understands that errors are UI states, not reasons to rebuild the project.

---

# PHASE 9 — ingestion Final Validation

## Goal

Validate that Phases 1–8 work together as one stable frontend feature before beginning retrieval implementation.

## Original Validation Targets

- PDF upload works
- API integration works
- ingestion progress works
- Resume searchable after ingestion

## Full Phase 9 Verification Flow

Run the existing backend and frontend, then execute this sequence:

| Step | Action | Expected Result |
|---|---|---|
| 1 | Run `npm run dev` | Existing RecruitBot frontend starts successfully |
| 2 | Open ingestion UI | Resume upload screen is visible |
| 3 | Try empty upload | `Please select a file` |
| 4 | Try non-PDF | `Only PDF allowed` |
| 5 | Try PDF > 5MB | `Maximum 5MB allowed` |
| 6 | Select valid PDF | File/ready state visible |
| 7 | Click Upload | Real `POST /v1/resume/inject` request sent |
| 8 | Observe processing | Loading/progress UI visible |
| 9 | Backend succeeds | Completed/result UI visible |
| 10 | Verify persistence | Resume is stored by the existing backend/MongoDB flow |
| 11 | Verify search readiness | The ingested resume is available to the existing retrieval/search backend flow |

> At this point retrieval **frontend** phases have not yet been changed or rebuilt. "Resume searchable after ingestion" means the existing backend retrieval/search flow can find the newly ingested resume when tested through the already available backend/API mechanism. Do not prematurely rewrite retrieval frontend logic inside Phase 9.

## Phase 9 — Final Learner Checkpoint

Before continuing to the existing retrieval section, confirm:

- [ ] `npm run dev` still starts the same frontend project.
- [ ] ingestion UI remains visible and functional.
- [ ] Valid upload reaches the real backend.
- [ ] Frontend validation blocks invalid requests correctly.
- [ ] Success and error states are both visible.
- [ ] Browser console has no blocking error.
- [ ] `src/features/ingestion/` still exists with all completed code.
- [ ] No ingestion file is scheduled for deletion by retrieval setup.
- [ ] The project is committed/checkpointed before Phase 10 work begins.

---

# MANDATORY INGESTION → RETRIEVAL PRESERVATION GUARD

This guard fixes the integration risk where the completed ingestion feature can disappear when the later retrieval setup starts.

## Why this guard is required

The existing retrieval instructions begin with a project bootstrap step (`npm create vite ...`) in Phase 10. By the time Phase 10 is reached, however, the frontend project has already been created and used by ingestion Phases 1–9.

Therefore **Phase 10 must be applied to the existing project non-destructively**.

## Required behaviour when starting Phase 10

Before executing any Phase 10 command:

1. Confirm the current working directory contains the existing frontend `package.json`.
2. Confirm `src/features/ingestion/` exists.
3. Create a commit/checkpoint of the working ingestion frontend.
4. **Do not run `npm create vite@latest recruitbot-web -- --template react-ts` if `recruitbot-web` already exists.**
5. Treat Phase 10's project creation command as "already satisfied" and continue with missing dependency/configuration tasks only.
6. Never delete, replace, or regenerate the whole `src/` directory.
7. When Phase 10 says "set up folder structure", **merge the retrieval folders into the existing structure**. Do not use the retrieval tree as a delete-and-recreate template.
8. If a shared file such as `App.tsx`, `main.tsx`, `package.json`, `vite.config.ts`, or global CSS already exists, **merge the retrieval requirement into that file** and preserve the working ingestion wiring.
9. Keep ingestion-specific state separate from retrieval/search state.
10. Keep the ingestion API endpoint and retrieval API endpoints independent; adding retrieval must not rewrite `POST /v1/resume/inject`.

## Required route/integration interpretation

The later retrieval instructions can continue to use `/` for `ChatPage` as written. If the ingestion page has its own route or navigation entry by that stage, preserve it. **Do not make the ingestion source disappear just to satisfy the retrieval statement that ChatPage is at `/`.**

A safe integrated target can be:

```text
/            → Retrieval / ChatPage
/ingestion   → Resume ingestion page
```

If the project uses another already-working navigation pattern, preserve that pattern instead of forcing a route rewrite.

## Mandatory file-preservation check after every retrieval phase

After each later retrieval phase, verify:

```bash
# Conceptual verification — use the equivalent command for the environment
ls src/features/ingestion
```

Expected: the completed ingestion folders/files are still present.

Also run:

```bash
npm run dev
```

and confirm the application still starts without losing the ingestion feature.

> **Important:** The retrieval content below is preserved exactly from the supplied document. The guard above controls **how it is applied to the already-existing ingestion codebase**; it does not change the retrieval requirements themselves.

---

# RecruitBot — Frontend Web Application Instructions

## Project Overview

Build a **modern, recruiter-focused web application** that enables users to:
- Search and discover candidates using three search modes (Vector, BM25, Hybrid)
- Interact with a conversational chat-style UI to query the resume database
- View ranked candidate cards with relevance scores
- Explore detailed candidate profiles via an interactive modal
- Configure hybrid search weights in real-time for fine-tuned results

**Target Users**: Recruiters, Hiring Managers, Talent Acquisition Teams, HR Business Partners

**Design Philosophy**: Dark-themed, modern chat UI, responsive, accessible (WCAG 2.1 AA), fast and interactive

---

## Current State (Vanilla Frontend)

The existing frontend lives in `public/` as three plain files:

| File | Purpose |
|------|---------|
| `public/index.html` | Static HTML shell |
| `public/styles.css` | ~1000 lines of hand-written CSS |
| `public/script.js` | ~640 lines of vanilla JavaScript |

**Backend API Endpoints consumed by the frontend**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/search/resumes` | POST | Execute search (vector / bm25 / hybrid) |
| `/candidate/:id` | GET | Fetch full candidate profile for modal |

---

## Technology Stack

### Core Framework
- **Build Tool**: Vite 5.x (fast HMR, optimized builds)
- **Framework**: React 18 + TypeScript
- **Routing**: React Router v6
- **State Management**: Zustand (lightweight, TypeScript-first)

### UI/UX Libraries
- **Component Library**: Shadcn/ui (TailwindCSS-based, accessible)
- **Styling**: TailwindCSS 3.x (utility-first, mobile-first)
- **Icons**: Lucide React (clean, consistent icon set)
- **Animations**: Framer Motion (smooth transitions and chat animations)

### Data & API
- **HTTP Client**: Axios with interceptors
- **Form Handling**: React Hook Form + Zod validation
- **Markdown / Code Display**: react-syntax-highlighter (for candidate content)

### Developer Tools
- **Linting**: ESLint + Prettier
- **Type Safety**: TypeScript strict mode
- **Testing**: Vitest + React Testing Library
- **Deployment**: Vercel (CI/CD, preview URLs)

---

## Project Structure

```
recruitbot-web/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── main.tsx                          # Entry point
│   ├── App.tsx                           # Root component with router
│   ├── config/
│   │   └── api.config.ts                 # API base URL, timeout, env vars
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                 # Axios instance with interceptors
│   │   │   ├── search.api.ts             # /search/resumes API calls
│   │   │   └── candidate.api.ts          # /candidate/:id API calls
│   │   ├── stores/
│   │   │   ├── chat.store.ts             # Chat messages state
│   │   │   ├── search.store.ts           # Search mode, weights, results
│   │   │   └── ui.store.ts               # Loading, modal, toast state
│   │   └── utils/
│   │       ├── formatters.ts             # Score formatters, date, duration
│   │       ├── sanitize.ts               # escapeHtml / XSS prevention
│   │       └── constants.ts              # Search modes, score colours, etc.
│   │
│   ├── hooks/
│   │   ├── use-search.ts                 # Search submission + result state
│   │   ├── use-chat.ts                   # Chat message management
│   │   ├── use-candidate-modal.ts        # Modal open/close + fetch
│   │   ├── use-hybrid-weights.ts         # Slider sync logic
│   │   └── use-mobile.ts                 # Mobile breakpoint detection
│   │
│   ├── components/
│   │   ├── ui/                           # Shadcn/ui primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── select.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── tooltip.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Outer flex container (sidebar + main)
│   │   │   ├── Sidebar.tsx               # Left sidebar with all controls
│   │   │   └── MobileDrawer.tsx          # Slide-out sidebar for mobile
│   │   ├── common/
│   │   │   ├── BrandAvatar.tsx           # RecruitBot SVG logo
│   │   │   ├── StatusDot.tsx             # Pulsing online indicator
│   │   │   ├── LoadingDots.tsx           # Three-dot typing animation
│   │   │   ├── Toast.tsx                 # Error/info toast notification
│   │   │   └── EmptyState.tsx            # No results illustration
│   │   └── features/
│   │       ├── sidebar/
│   │       │   ├── SearchModeNav.tsx     # Vector / BM25 / Hybrid buttons
│   │       │   ├── HybridWeightPanel.tsx # Sliders + preset pills
│   │       │   ├── ResultsLimitSelect.tsx# Top N results selector
│   │       │   └── ClearChatButton.tsx   # Clear thread button
│   │       ├── chat/
│   │       │   ├── ChatTopbar.tsx        # Name, mode badge, status
│   │       │   ├── ChatMessages.tsx      # Scrollable message thread
│   │       │   ├── UserBubble.tsx        # User query bubble
│   │       │   ├── BotBubble.tsx         # Bot response bubble wrapper
│   │       │   ├── WelcomeMessage.tsx    # Intro message on first load
│   │       │   ├── SuggestionChips.tsx   # Pre-canned query chips
│   │       │   └── ChatInputBar.tsx      # Textarea + send button
│   │       ├── results/
│   │       │   ├── ResultsList.tsx       # Grid/list of result cards
│   │       │   ├── ResultCard.tsx        # Single candidate result card
│   │       │   ├── ResultSummary.tsx     # Count + mode + duration header
│   │       │   ├── RankBadge.tsx         # #1, #2, #3 rank indicator
│   │       │   └── ScorePill.tsx         # Coloured score chip
│   │       └── candidate/
│   │           ├── CandidateModal.tsx    # Full-screen profile modal
│   │           ├── ModalHeader.tsx       # Name, title, close button
│   │           ├── ContactSection.tsx    # Email, phone, location
│   │           ├── SkillsSection.tsx     # Skill chips cloud
│   │           ├── ExperienceSection.tsx # Job timeline
│   │           ├── EducationSection.tsx  # Degree, institution
│   │           ├── ProjectsSection.tsx   # Projects list
│   │           └── CertificationsSection.tsx
│   │
│   ├── pages/
│   │   └── ChatPage.tsx                  # Single-page chat interface
│   │
│   └── types/
│       ├── search.types.ts               # SearchRequest, SearchResult, SearchMode
│       ├── candidate.types.ts            # CandidateProfile, Experience, Education
│       ├── chat.types.ts                 # Message, MessageType
│       └── api.types.ts                  # ApiResponse, ApiError
│
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## Development Phases

---

### Phase 10: Retrieval Frontend Integration & Core Infrastructure

**Objective**: Bootstrap the React + TypeScript project with all dependencies, config files, and the base layout shell.

#### Tasks

1. Initialise Vite + React + TypeScript project
2. Install all dependencies (see commands below)
3. Configure TailwindCSS with the RecruitBot dark design tokens
4. Initialise Shadcn/ui components (button, badge, slider, dialog, select, textarea)
5. Set up folder structure as defined above
6. Configure Axios API client with interceptors
7. Create skeleton Zustand stores
8. Build `AppShell` layout (sidebar + main columns)
9. Configure React Router v6 (single route: `/`)
10. Set up environment variable handling
11. Configure ESLint + Prettier

#### Commands

```bash
# Create project
npm create vite@latest recruitbot-web -- --template react-ts
cd recruitbot-web

# Core dependencies
npm install
npm install react-router-dom zustand axios
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react framer-motion
npm install react-hot-toast

# Dev dependencies
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node
npm install -D eslint prettier eslint-config-prettier

# Initialise Tailwind
npx tailwindcss init -p

# Add Shadcn/ui
npx shadcn-ui@latest init

# Add required Shadcn components
npx shadcn-ui@latest add button badge dialog select slider textarea card tooltip
```

#### Configuration Files

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/search': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/candidate': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**tailwind.config.js** (RecruitBot dark theme tokens):
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // RecruitBot brand
        primary: '#6366f1',
        accent: '#ec4899',
        // Backgrounds
        'bg-base': '#0f0f13',
        'bg-surface': '#18181f',
        'bg-card': '#1e1e28',
        // Text
        'text-primary': '#f1f1f5',
        'text-muted': '#8b8ba0',
        // Search mode scores
        'score-vector': '#818cf8',
        'score-bm25': '#f472b6',
        'score-hybrid': '#34d399',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        bounce: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '0%': { backgroundPosition: '-200%' }, '100%': { backgroundPosition: '200%' } },
      },
      animation: {
        'status-pulse': 'pulse 2s ease-in-out infinite',
        'dot-bounce': 'bounce 0.6s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

**.env.development**:
```
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_NAME=RecruitBot
VITE_ENABLE_MOCK=false
```

**.env.production**:
```
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_APP_NAME=RecruitBot
VITE_ENABLE_MOCK=false
```

#### API Client (src/lib/api/client.ts)
```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-Request-ID'] = crypto.randomUUID();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      const message = (error.response.data as any)?.error || 'An error occurred';
      if (status === 404) toast.error(`Not found: ${message}`);
      else if (status === 500) toast.error('Server error. Please try again later.');
      else toast.error(message);
    } else if (error.request) {
      toast.error('Network error. Check your connection.');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

#### Zustand Store Skeletons

**src/lib/stores/search.store.ts**:
```typescript
import { create } from 'zustand';
import { SearchMode, SearchResult } from '@/types/search.types';

interface SearchState {
  searchType: SearchMode;
  bm25Weight: number;
  vectorWeight: number;
  topK: number;
  results: SearchResult[];
  isSearching: boolean;
  lastQuery: string;
  setSearchType: (mode: SearchMode) => void;
  setWeights: (bm25: number, vector: number) => void;
  setTopK: (k: number) => void;
  setResults: (results: SearchResult[], query: string) => void;
  setSearching: (v: boolean) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  searchType: 'vector',
  bm25Weight: 50,
  vectorWeight: 50,
  topK: 5,
  results: [],
  isSearching: false,
  lastQuery: '',
  setSearchType: (mode) => set({ searchType: mode }),
  setWeights: (bm25, vector) => set({ bm25Weight: bm25, vectorWeight: vector }),
  setTopK: (k) => set({ topK: k }),
  setResults: (results, query) => set({ results, lastQuery: query }),
  setSearching: (v) => set({ isSearching: v }),
}));
```

#### Deliverables
- ✅ Running Vite dev server on port 5173
- ✅ AppShell layout (sidebar 260 px + full-height chat main)
- ✅ React Router configured (ChatPage at `/`)
- ✅ Axios client with interceptors
- ✅ Zustand store skeletons (chat, search, ui)
- ✅ TailwindCSS with RecruitBot dark tokens
- ✅ Shadcn/ui primitives installed

---

### Phase 11: Sidebar Module

**Objective**: Build the full left sidebar with brand, search mode switching, hybrid weight controls, results limit, and clear button.

#### Components to Build

1. **BrandAvatar.tsx**
   - Inline SVG circle avatar with indigo → pink gradient
   - Brand name "RecruitBot" + "Online" status
   - `StatusDot.tsx` — 6 px green dot with `animate-status-pulse`

2. **SearchModeNav.tsx**
   - Three `<button>` cards: Vector Search | BM25 Keyword | Hybrid
   - Each button: SVG icon + mode name + mode description + checkmark (shown when active)
   - Click handler calls `setSearchType()` from search store
   - Active button: indigo tinted background + border
   - Props: `activeMode`, `onChange`

3. **HybridWeightPanel.tsx** (hidden unless mode === `'hybrid'`)
   - Section title "Search Weights"
   - Two rows: BM25 slider + Vector slider (Shadcn `<Slider>`)
   - Sliders linked: `vectorWeight = 100 - bm25Weight` (complementary)
   - Live percentage displays: "50%"
   - Three preset pills: 50/50 | 70/30 | 30/70
   - Uses `use-hybrid-weights.ts` hook for sync logic
   - Animated: `AnimatePresence` + `motion.div` slide-down when hybrid selected

4. **ResultsLimitSelect.tsx**
   - Label "Show top" + Shadcn `<Select>` with options 3, 5 (default), 10, 20 + "results"
   - Updates `topK` in search store

5. **ClearChatButton.tsx**
   - Full-width button with ✕ icon
   - Calls `clearMessages()` from chat store + re-renders welcome message

6. **Sidebar.tsx** (composes all above)
   - Fixed 260 px width, `overflow-y: auto`
   - Order from top: Brand → Section label → SearchModeNav → HybridWeightPanel → Section label → ResultsLimitSelect → ClearChatButton → Footer

**Sidebar.tsx skeleton**:
```tsx
export function Sidebar() {
  const { searchType, setSearchType } = useSearchStore();
  
  return (
    <aside className="w-[260px] shrink-0 bg-bg-surface border-r border-white/[0.07] flex flex-col p-5 gap-4 overflow-y-auto">
      <BrandAvatar />
      <SectionLabel>Search Mode</SectionLabel>
      <SearchModeNav activeMode={searchType} onChange={setSearchType} />
      <AnimatePresence>
        {searchType === 'hybrid' && <HybridWeightPanel />}
      </AnimatePresence>
      <SectionLabel className="mt-auto">Results limit</SectionLabel>
      <ResultsLimitSelect />
      <ClearChatButton />
      <footer className="text-xs text-text-muted pt-2">RecruitBot v2.0</footer>
    </aside>
  );
}
```

#### Custom Hook (src/hooks/use-hybrid-weights.ts)
```typescript
export function useHybridWeights() {
  const { bm25Weight, vectorWeight, setWeights } = useSearchStore();
  
  function handleBm25Change(value: number) {
    setWeights(value, 100 - value);
  }
  
  function handleVectorChange(value: number) {
    setWeights(100 - value, value);
  }
  
  function applyPreset(bm25: number, vector: number) {
    setWeights(bm25, vector);
  }
  
  return { bm25Weight, vectorWeight, handleBm25Change, handleVectorChange, applyPreset };
}
```

#### Deliverables
- ✅ Brand avatar with pulsing status dot
- ✅ Search mode buttons with active state
- ✅ Hybrid weight panel animates in/out
- ✅ Sliders are complementary (sum to 100)
- ✅ Preset pills set both sliders atomically
- ✅ Results limit select wired to store
- ✅ Clear chat button wired to chat store

---

### Phase 12: Chat Interface Module

**Objective**: Build the chat topbar, scrollable message thread, suggestion chips, welcome message, and the input bar.

#### Components to Build

1. **ChatTopbar.tsx**
   - Left: Mini avatar + "RecruitBot" name + mode sub-label (e.g. "Vector Search · Semantic similarity")
   - Right: Mode badge pill — colour changes with active mode:
     - Vector → indigo (`bg-score-vector/20 text-score-vector`)
     - BM25 → pink (`bg-score-bm25/20 text-score-bm25`)
     - Hybrid → green (`bg-score-hybrid/20 text-score-hybrid`)
   - Mode label updates reactively from search store

2. **WelcomeMessage.tsx**
   - Bot bubble shown on first load (or after clear)
   - Content: greeting + explanation of three modes with icons
   - Rendered as a `BotBubble` with no timestamp

3. **SuggestionChips.tsx**
   - Visible only when message thread is empty (before first search)
   - Four preset chips:
     - 🔍 Selenium QA 3 yrs → `"Selenium automation engineer 3 years"`
     - 🐍 Python ML dev → `"Python developer with machine learning"`
     - ☁️ Java AWS backend → `"Java backend developer AWS cloud"`
     - ⚡ Lead QA Cypress → `"Lead QA engineer with Cypress and CI/CD"`
   - Click: ingest query into input, auto-submit

4. **UserBubble.tsx**
   - Right-aligned message bubble
   - Gradient background (indigo → pink from CSS vars)
   - Timestamp (formatted as `HH:mm`)
   - Framer Motion: slide in from right

5. **BotBubble.tsx**
   - Left-aligned message bubble
   - `bg-bg-card` background
   - Accepts `children` (plain text OR ResultsList component)
   - Framer Motion: slide in from left

6. **ChatMessages.tsx**
   - `flex-1 overflow-y-auto` scroll container
   - List of `UserBubble` and `BotBubble` messages from chat store
   - Auto-scrolls to bottom on new message using `useEffect` + `scrollIntoView`
   - Renders `LoadingDots` (typing indicator) while `isSearching === true`

7. **ChatInputBar.tsx**
   - `<textarea>` that auto-resizes (1 → max 6 lines) using `onInput` height reset
   - Send button: disabled when empty or `isSearching`
   - Keyboard: `Enter` → submit, `Shift+Enter` → newline
   - Input hint: "Press Enter to search · Shift+Enter for new line"

8. **LoadingDots.tsx**
   - Three `<span>` dots with staggered `animate-dot-bounce`
   - Shown inside a `BotBubble` while search is in progress

**Chat store (src/lib/stores/chat.store.ts)**:
```typescript
import { create } from 'zustand';
import { Message } from '@/types/chat.types';

interface ChatState {
  messages: Message[];
  addUserMessage: (text: string) => void;
  addBotMessage: (content: React.ReactNode) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addUserMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: crypto.randomUUID(), type: 'user', text, timestamp: new Date() }],
    })),
  addBotMessage: (content) =>
    set((s) => ({
      messages: [...s.messages, { id: crypto.randomUUID(), type: 'bot', content, timestamp: new Date() }],
    })),
  clearMessages: () => set({ messages: [] }),
}));
```

#### Deliverables
- ✅ Topbar mode badge updates reactively
- ✅ Welcome message renders on first load / after clear
- ✅ Suggestion chips auto-submit query
- ✅ User/bot bubbles animate in with Framer Motion
- ✅ Textarea auto-resizes to content
- ✅ Enter to submit, Shift+Enter for newline
- ✅ Loading typing dots display during search
- ✅ Auto-scroll to latest message

---

### Phase 13: Search & Results Module

**Objective**: Wire up the search API call, build result cards, and render ranked results inside bot bubbles.

#### Components to Build

1. **ResultSummary.tsx**
   - Displays: "Found **5** candidates · Vector Search · 243 ms"
   - Mode badge (coloured per search type)
   - Duration in ms formatted neatly

2. **RankBadge.tsx**
   - Circle chip: `#1`, `#2`, `#3`, etc.
   - Gradient fill for top 3, muted for rest

3. **ScorePill.tsx**
   - Shows score value + label (Similarity / BM25 Score / Hybrid)
   - Colour: `text-score-vector` | `text-score-bm25` | `text-score-hybrid`
   - Props: `score: number`, `searchType: SearchMode`

4. **ResultCard.tsx**
   - Clickable card — triggers `openCandidateModal(candidateId)` from `use-candidate-modal`
   - Layout:
     - Top row: `RankBadge` + candidate name + `ScorePill`
     - Second row: experience years chip + email + phone (if available)
     - Bottom: content snippet (first 200 chars, truncated, HTML-escaped)
   - Hover: subtle box-shadow lift + border colour tint
   - Framer Motion: staggered `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`
   - Stagger delay: `index * 0.06s`

5. **ResultsList.tsx**
   - Renders `ResultSummary` + a vertical list of `ResultCard` components
   - "No candidates found" `EmptyState` if results array is empty
   - Props: `results: SearchResult[]`, `searchType: SearchMode`, `duration: number`, `query: string`

6. **EmptyState.tsx**
   - Icon + heading + sub-text
   - Used when no results returned

#### API Integration (src/lib/api/search.api.ts)
```typescript
import apiClient from './client';
import { SearchRequest, SearchResponse } from '@/types/search.types';

export const searchApi = {
  async searchResumes(params: SearchRequest): Promise<SearchResponse> {
    const response = await apiClient.post('/search/resumes', params);
    return response.data;
  },
};
```

#### Custom Hook (src/hooks/use-search.ts)
```typescript
export function useSearch() {
  const { searchType, bm25Weight, vectorWeight, topK, setSearching } = useSearchStore();
  const { addUserMessage, addBotMessage } = useChatStore();
  
  async function submitQuery(query: string) {
    if (!query.trim()) return;
    
    addUserMessage(query);
    setSearching(true);
    
    try {
      const data = await searchApi.searchResumes({
        query: query.trim(),
        searchType: searchType === 'bm25' ? 'keyword' : searchType,  // API expects 'keyword'
        topK,
        bm25Weight: bm25Weight / 100,
        vectorWeight: vectorWeight / 100,
      });
      
      addBotMessage(
        <ResultsList
          results={data.results}
          searchType={searchType}
          duration={data.duration}
          query={data.query}
        />
      );
    } catch (err) {
      addBotMessage(<p className="text-red-400">Search failed. Please try again.</p>);
    } finally {
      setSearching(false);
    }
  }
  
  return { submitQuery };
}
```

#### Type Definitions (src/types/search.types.ts)
```typescript
export type SearchMode = 'vector' | 'bm25' | 'hybrid';

export interface SearchRequest {
  query: string;
  searchType: 'vector' | 'keyword' | 'hybrid';
  topK: number;
  bm25Weight?: number;
  vectorWeight?: number;
}

export interface SearchResult {
  candidateId: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  score: number;
  experienceYears?: number;
  content: string;
}

export interface SearchResponse {
  query: string;
  searchType: string;
  topK: number;
  resultCount: number;
  duration: number;
  results: SearchResult[];
  metadata?: Record<string, any>;
}
```

#### Deliverables
- ✅ Search API call wired to search store
- ✅ Result cards render inside bot bubbles
- ✅ Score pills colour by search type
- ✅ Rank badges for all results
- ✅ Card click opens candidate modal
- ✅ Empty state when no results
- ✅ Staggered card entrance animation
- ✅ Search type mapped correctly (bm25 → keyword for API)

---

### Phase 14: Candidate Profile Modal

**Objective**: Build the full candidate profile modal that fetches and displays a complete candidate record.

#### Components to Build

1. **ModalHeader.tsx**
   - Candidate name (`<h2>`)
   - Meta span: job title + company
   - Close button (✕) — top-right
   - Sticky position inside modal

2. **ContactSection.tsx**
   - Email with mail icon
   - Phone with phone icon
   - Location with map-pin icon
   - Only render rows where data exists

3. **SkillsSection.tsx**
   - Section label "Skills"
   - Flex-wrap cloud of `<span>` skill chips
   - Each chip: `bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded text-xs`

4. **ExperienceSection.tsx**
   - Section label "Experience"
   - Ordered list: company name + title + duration + description paragraph
   - Left border timeline decoration

5. **EducationSection.tsx**
   - Section label "Education"
   - Degree name + institution + year (if available)

6. **ProjectsSection.tsx**
   - Section label "Projects" (hidden if empty array)
   - Each project: bold title + description

7. **CertificationsSection.tsx**
   - Section label "Certifications" (hidden if empty array)
   - Each cert: cert name as a badge or list item

8. **CandidateModal.tsx** (composes all above)
   - Fixed fullscreen overlay — `backdrop-blur-md bg-black/50`
   - Centred `<div>` modal card — max 640 px wide, max 88 vh tall, `overflow-y: auto`
   - Loading skeleton while `GET /candidate/:id` is in flight
   - All text ingested from API must be rendered safely (use `textContent` or DOMPurify)
   - Close on: close button click, overlay click, `Escape` key
   - Focus trap inside modal (accessibility)

#### API Integration (src/lib/api/candidate.api.ts)
```typescript
import apiClient from './client';
import { CandidateProfile } from '@/types/candidate.types';

export const candidateApi = {
  async getCandidate(id: string): Promise<CandidateProfile> {
    const response = await apiClient.get(`/candidate/${id}`);
    return response.data;
  },
};
```

#### Custom Hook (src/hooks/use-candidate-modal.ts)
```typescript
import { useState } from 'react';
import { candidateApi } from '@/lib/api/candidate.api';
import { CandidateProfile } from '@/types/candidate.types';
import toast from 'react-hot-toast';

export function useCandidateModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(false);
  
  async function openCandidateModal(id: string) {
    setIsOpen(true);
    setLoading(true);
    try {
      const data = await candidateApi.getCandidate(id);
      setCandidate(data);
    } catch {
      toast.error('Failed to load candidate profile.');
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }
  
  function closeModal() {
    setIsOpen(false);
    setCandidate(null);
  }
  
  return { isOpen, candidate, loading, openCandidateModal, closeModal };
}
```

#### Type Definitions (src/types/candidate.types.ts)
```typescript
export interface Experience {
  company: string;
  title: string;
  duration?: string;
  description?: string;
}

export interface Education {
  degree: string;
  institution: string;
  year?: string;
}

export interface CandidateProfile {
  _id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  location?: string;
  title?: string;
  company?: string;
  education?: Education[];
  experience?: Experience[];
  skills?: string[];
  projects?: { title: string; description: string }[];
  certifications?: string[];
  text?: string;
  processedAt?: string;
}
```

#### Deliverables
- ✅ Modal opens with loading skeleton
- ✅ All candidate sections rendered (contact, skills, experience, education, projects, certs)
- ✅ Empty sections hidden gracefully
- ✅ Close on button, overlay click, and Escape key
- ✅ Focus trap for accessibility
- ✅ Framer Motion enter/exit animation (`scale` + `opacity`)

---

### Phase 15: Layout Integration & Full Page Assembly

**Objective**: Compose all modules into the single `ChatPage`, wire all state, and verify end-to-end flow.

#### Tasks

1. **ChatPage.tsx** — compose `AppShell` → `Sidebar` + `ChatMain`
   ```tsx
   export function ChatPage() {
     return (
       <AppShell>
         <Sidebar />
         <ChatMain />
       </AppShell>
     );
   }
   ```

2. **ChatMain.tsx** — compose `ChatTopbar` + `ChatMessages` + `SuggestionChips` + `ChatInputBar`
   - Show `SuggestionChips` only when `messages.length === 0 || allMessagesAreWelcome`
   - Pass `submitQuery` from `use-search` hook to both `SuggestionChips` and `ChatInputBar`

3. **App.tsx** — set up router and toast provider
   ```tsx
   import { Toaster } from 'react-hot-toast';
   import { BrowserRouter, Routes, Route } from 'react-router-dom';
   import { ChatPage } from './pages/ChatPage';
   
   export default function App() {
     return (
       <BrowserRouter>
         <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e1e28', color: '#f1f1f5' } }} />
         <Routes>
           <Route path="/" element={<ChatPage />} />
         </Routes>
       </BrowserRouter>
     );
   }
   ```

4. **Global CSS** (`src/index.css`) — import Inter font + Tailwind directives:
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   
   html, body, #root {
     height: 100%;
     overflow: hidden;
     background-color: #0f0f13;
     color: #f1f1f5;
   }
   ```

#### End-to-End Flow Verification

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open app | Welcome message + suggestion chips visible |
| 2 | Click suggestion chip | Query auto-fills, search fires |
| 3 | Results render | Bot bubble with summary header + ranked cards |
| 4 | Switch to BM25 mode | Badge updates to pink "BM25" |
| 5 | Search again | Cards show pink score pills |
| 6 | Switch to Hybrid | Weight panel animates in |
| 7 | Adjust sliders | Percentages update, sliders stay complementary |
| 8 | Click a result card | Modal opens with full profile |
| 9 | Press Escape | Modal closes |
| 10 | Click "Clear chat" | Thread resets, welcome message reappears |

#### Deliverables
- ✅ All modules composed into single ChatPage
- ✅ Full search → results → modal flow working
- ✅ Search mode switching reactive across sidebar + topbar
- ✅ Hybrid weight panel in sync with sliders
- ✅ Toast provider configured
- ✅ No console errors

---
## Design System

### Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#6366f1` | Active states, brand, send button |
| `--accent` | `#ec4899` | Brand secondary, gradient end |
| `--bg-base` | `#0f0f13` | Page background |
| `--bg-surface` | `#18181f` | Sidebar, modal backdrop card |
| `--bg-card` | `#1e1e28` | Message bubbles, result cards |
| `--text-primary` | `#f1f1f5` | Main text |
| `--text-muted` | `#8b8ba0` | Labels, hints, secondary text |
| `--score-vector` | `#818cf8` | Vector search score pill |
| `--score-bm25` | `#f472b6` | BM25 search score pill |
| `--score-hybrid` | `#34d399` | Hybrid search score pill |
| `--border` | `rgba(255,255,255,0.07)` | Card and panel borders |

### Typography

| Role | Class | Size |
|------|-------|------|
| Candidate name | `text-base font-semibold` | 16 px |
| Section label | `text-xs font-medium uppercase tracking-widest` | 12 px |
| Mode name | `text-sm font-medium` | 14 px |
| Mode description | `text-xs text-text-muted` | 12 px |
| Score value | `text-sm font-semibold` | 14 px |
| Snippet text | `text-xs text-text-muted` | 12 px |
| Input placeholder | `text-sm text-text-muted` | 14 px |

### Component Spacing
- Sidebar padding: `p-5` (20 px)
- Card padding: `p-4` (16 px)
- Gap between cards: `gap-3` (12 px)
- Section gap: `gap-4` (16 px)
- Modal padding: `p-6` (24 px)

### State Colours

| State | Class |
|-------|-------|
| Mode button active | `bg-indigo-500/12 border-indigo-400/30` |
| Send button enabled | `bg-gradient-to-r from-primary to-accent` |
| Send button disabled | `opacity-40 cursor-not-allowed` |
| Card hover | `hover:shadow-lg hover:border-white/[0.12]` |
| Score — Vector | `text-score-vector bg-score-vector/10` |
| Score — BM25 | `text-score-bm25 bg-score-bm25/10` |
| Score — Hybrid | `text-score-hybrid bg-score-hybrid/10` |

---

## API Reference (Backend Endpoints)

### POST /search/resumes

**Request**:
```json
{
  "query": "Python developer with machine learning",
  "searchType": "vector",
  "topK": 5,
  "bm25Weight": 0.5,
  "vectorWeight": 0.5
}
```
> Note: `searchType` accepts `"vector"`, `"keyword"` (not `"bm25"`), `"hybrid"`

**Response**:
```json
{
  "query": "Python developer with machine learning",
  "searchType": "vector",
  "topK": 5,
  "resultCount": 5,
  "duration": 243,
  "results": [
    {
      "candidateId": "abc123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phoneNumber": "+1-555-123-4567",
      "score": 0.92,
      "experienceYears": 5,
      "content": "Experienced Python developer with expertise in..."
    }
  ]
}
```

### GET /candidate/:id

**Response**:
```json
{
  "_id": "abc123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phoneNumber": "+1-555-123-4567",
  "location": "San Francisco, CA",
  "title": "Senior Software Engineer",
  "company": "TechCorp",
  "skills": ["Python", "TensorFlow", "AWS", "Docker"],
  "experience": [
    { "company": "TechCorp", "title": "Senior SWE", "duration": "2021-Present", "description": "..." }
  ],
  "education": [
    { "degree": "B.S. Computer Science", "institution": "UC Berkeley", "year": "2018" }
  ],
  "projects": [],
  "certifications": ["AWS Certified Solutions Architect"],
  "processedAt": "2025-01-15T10:30:00Z"
}
```

---

## Testing Strategy

### Unit Tests

**Search store**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from '@/lib/stores/search.store';

describe('searchStore', () => {
  beforeEach(() => useSearchStore.getState().setSearchType('vector'));
  
  it('sets search type', () => {
    useSearchStore.getState().setSearchType('hybrid');
    expect(useSearchStore.getState().searchType).toBe('hybrid');
  });
  
  it('updates weights', () => {
    useSearchStore.getState().setWeights(70, 30);
    expect(useSearchStore.getState().bm25Weight).toBe(70);
    expect(useSearchStore.getState().vectorWeight).toBe(30);
  });
});
```

**ResultCard component**:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultCard } from '@/components/features/results/ResultCard';

const mockResult = {
  candidateId: 'c1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  score: 0.92,
  experienceYears: 5,
  content: 'Experienced Python developer…',
};

describe('ResultCard', () => {
  it('renders candidate name and score', () => {
    render(<ResultCard result={mockResult} rank={1} searchType="vector" onSelect={vi.fn()} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('0.92')).toBeInTheDocument();
  });
  
  it('calls onSelect with candidateId on click', () => {
    const onSelect = vi.fn();
    render(<ResultCard result={mockResult} rank={1} searchType="vector" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
```

### E2E Critical Flow 
```
1. Open http://localhost:5173/
2. Assert welcome message visible
3. Click "Selenium QA 3 yrs" chip
4. Assert result cards appear with rank badges
5. Click first result card
6. Assert candidate modal opens with correct name
7. Press Escape
8. Assert modal closed
9. Click "Clear chat"
10. Assert welcome message reappears
```

---

## Deployment

### Vercel Deployment

1. Push `recruitbot-web/` to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard:
   - `VITE_API_BASE_URL` → your backend URL
4. Deploy on push to `main`

**vercel.json**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "env": {
    "VITE_API_BASE_URL": "@recruitbot_api_base_url"
  }
}
```

---

## Final Pre-Launch Checklist

- [ ] All pages render on 375 px width without overflow
- [ ] Vector / BM25 / Hybrid modes all return results
- [ ] Score pills correctly coloured per mode
- [ ] Hybrid sliders stay complementary (sum = 100)
- [ ] Preset pills (50/50, 70/30, 30/70) set both sliders
- [ ] Result card click opens candidate modal
- [ ] Modal loads all sections (contact, skills, experience, education)
- [ ] Empty sections hidden gracefully in modal
- [ ] Escape key and overlay click close modal
- [ ] "Clear chat" resets to welcome + shows chips again
- [ ] Suggestion chips auto-submit query
- [ ] Loading dots appear during search
- [ ] Toast shown on network error
- [ ] No `dangerouslySetInnerHTML` without sanitisation
- [ ] All buttons have `aria-label`
- [ ] Focus trap active in modal
- [ ] `aria-live` announces new results
- [ ] Keyboard navigation works through all controls
- [ ] Vite build completes with no errors (`npm run build`)
- [ ] No console errors in production build
- [ ] Lighthouse score ≥ 85 (Performance + Accessibility)

---

## Resources

### Documentation
- [React 18 Docs](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Shadcn/ui Components](https://ui.shadcn.com)
- [Zustand Guide](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Framer Motion](https://www.framer.com/motion/)
- [Lucide Icons](https://lucide.dev/icons)

### Design Inspiration
- Current `public/` vanilla implementation (reference for UI layout and behaviour)
- [Linear](https://linear.app) — clean sidebar + main split
- [Claude.ai](https://claude.ai) — dark chat UI patterns

---

## Development Workflow

1. **Branch**: create `feature/<phase-name>` from `main`
2. **Implement**: build components, add types, wire stores
3. **Test**: run `npm run dev`, test all interactions in browser (mobile + desktop)
4. **Lint**: `npm run lint` must pass
5. **Commit**: `feat: <concise description>` (e.g., `feat: add hybrid weight panel`)
6. **Push**: create PR → merge to `main` → auto-deploy to Vercel

---

*End of RecruitBot Frontend Web Instructions*
