# Smart Onboarding & IT Asset Provisioning Workflow Engine — Phase 1: Core Engine & Automated Provisioning Pipeline
## Complete Phase-wise Implementation Guide

> **Execution rule:** This is the primary implementation document for Phase 1. Complete and verify every setup, validation, orchestration, and provisioning phase before attempting Phase 2 integrations.
>
> **Codebase rule:** All workflow management, employee data extraction, role-based asset determination, and IT ticket orchestration must live inside a **single Node.js + TypeScript + Express codebase**, use the **same MongoDB database**, and run from the **same backend server** with `npm run dev`.
>
> **Phase gate:** Do **not** implement secondary ticketing or hardware shipment automation until the core ingestion and provisioning verification gate passes.

---

# 1. Purpose

Build the backend foundation for a Smart Onboarding & IT Asset Provisioning Workflow Engine.

The engine accepts new hire details (via direct JSON submission or PDF offer letter ingestion), parses and standardizes employee role requirements, dynamically determines required IT assets and access permissions using a rules engine, generates setup tasks, and creates appropriate provisioning entries in MongoDB and third-party ITSM systems.

This guide provides a phase-by-phase execution path ensuring that:

1. A new deployment starts with data validation and role-based policy matching first.
2. Asset provisioning tasks and tickets are generated deterministically.
3. Every step runs inside a single, scalable backend codebase.
4. Every phase can be run and verified independently.
5. A developer can understand what request to send, what response to expect, what DB records to check, and when to move to the next phase.

---

# 2. Technology Stack

- Node.js
- TypeScript
- Express
- MongoDB / MongoDB Atlas
- Multer (for Offer Letter/HR Doc processing)
- `pdf-parse`
- Rule Engine / JSON-Logic evaluation module
- REST Client/Axios (for external ITSM / Active Directory / HRIS Mock Integrations)

---

# 3. Target Application Architecture

```text
onboarding-provisioning-backend/
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── multerConfig.ts
│   │   └── defaultMatrix.ts
│   │
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logger.ts
│   │   └── errorHandler.ts
│   │
│   ├── modules/
│   │   ├── onboarding/
│   │   │   ├── routes/
│   │   │   │   └── onboardingRoutes.ts
│   │   │   ├── controllers/
│   │   │   │   └── onboardingController.ts
│   │   │   ├── services/
│   │   │   │   ├── OfferLetterParserService.ts
│   │   │   │   ├── PolicyEngineService.ts
│   │   │   │   ├── ProvisioningService.ts
│   │   │   │   └── WorkflowEngineService.ts
│   │   │   ├── repositories/
│   │   │   │   └── OnboardingRepository.ts
│   │   │   ├── utils/
│   │   │   │   ├── regex.ts
│   │   │   │   └── dataSanitizer.ts
│   │   │   └── types/
│   │   │       └── onboarding.types.ts
│   │   │
│   │   └── hardwareTracking/
│   │       └── README.md
│   │       # Keep this module empty until core provisioning is complete.
│   │
│   ├── shared/
│   │   ├── services/
│   │   │   └── NotificationService.ts
│   │   └── types/
│   │
│   └── types/
│
├── uploads/
├── tests/
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

---

# 4. Final Backend Flow

```text
START APPLICATION
      ↓
Project + DB + Health Check
      ↓
Submit New Hire (JSON Payload / PDF Offer Letter)
      ↓
Extract & Sanitize Employee Data
      ↓
Evaluate Policy & Role Matrix
      ↓
Generate Required Hardware & Software Asset Profile
      ↓
Create Onboarding Ticket & Individual Provisioning Tasks
      ↓
Store Workflow Record in MongoDB
      ↓
Verify Provisioning Status
      ↓
PROVISIONING ENGINE READY
```

---

# 5. Environment Variables

Create `.env`:

```env
PORT=3000
NODE_ENV=development

MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
MONGODB_DB_NAME=smart_onboarding

MAX_UPLOAD_SIZE_MB=5
DEFAULT_ITSM_WEBHOOK_URL=http://localhost:3000/v1/mock/itsm
```

Create `.env.example` with the same keys but without secrets.

---

# 6. Phase-by-Phase Implementation

# PHASE 1 — Project Scaffold + Shared Backend

## Goal

Create the single backend application that hosts the workflow, parsing, and provisioning logic.

## Create

```text
src/app.ts
src/server.ts
src/config/env.ts
src/config/database.ts
src/middleware/requestId.ts
src/middleware/logger.ts
src/middleware/errorHandler.ts
```

## Install base dependencies

```bash
npm init -y
npm install express mongodb dotenv cors uuid multer pdf-parse
npm install -D typescript ts-node-dev @types/node @types/express @types/cors @types/multer @types/uuid
npx tsc --init
```

## Required scripts

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest"
  }
}
```

## Required health endpoint

```http
GET /v1/health
```

### Request

```bash
curl http://localhost:3000/v1/health
```

### Expected response

```json
{
  "status": "ok",
  "app": "smart-onboarding-backend",
  "version": "1.0.0",
  "uptime": 8.5
}
```

## Phase gate

```text
PASS → Continue to Phase 2
FAIL → Fix project/server configuration before continuing
```

---

# PHASE 2 — MongoDB Connectivity

## Goal

Create a shared database connection for onboarding requests, hardware inventories, and ticketing workflow states.

## Endpoint

```http
GET /v1/health/db
```

## Request

```bash
curl http://localhost:3000/v1/health/db
```

## Expected response

```json
{
  "status": "ok",
  "database": "mongodb",
  "connected": true,
  "latencyMs": 14
}
```

## Phase gate

Do not implement onboarding workflows until database connectivity is verified.

---

# PHASE 3 — Module & Directory Setup

## Goal

Initialize the onboarding module structures inside `src/modules/onboarding/`.

## Create

```text
src/modules/onboarding/
├── routes/
│   └── onboardingRoutes.ts
├── controllers/
│   └── onboardingController.ts
├── services/
│   ├── OfferLetterParserService.ts
│   ├── PolicyEngineService.ts
│   ├── ProvisioningService.ts
│   └── WorkflowEngineService.ts
├── repositories/
│   └── OnboardingRepository.ts
├── utils/
│   ├── regex.ts
│   └── dataSanitizer.ts
└── types/
    └── onboarding.types.ts
```

## Route registration

In `src/app.ts`:

```ts
app.use("/v1/onboarding", onboardingRoutes);
```

## Verification endpoint

```http
GET /v1/onboarding/health
```

### Expected response

```json
{
  "status": "ok",
  "module": "onboarding-engine"
}
```

---

# PHASE 4 — Offer Letter Ingestion & Text Extraction

## Goal

Accept offer letters (PDF format) and parse raw contents to extract onboarding details.

## Endpoint

```http
POST /v1/onboarding/extract-document
```

## Request

```bash
curl -X POST \
  http://localhost:3000/v1/onboarding/extract-document \
  -F "file=@OfferLetter_JohnDoe_DevOps.pdf"
```

## Expected response shape

```json
{
  "success": true,
  "data": {
    "candidateName": "John Doe",
    "email": "john.doe@example.com",
    "designation": "DevOps Engineer",
    "department": "Engineering",
    "joiningDate": "2026-11-01",
    "location": "Remote"
  }
}
```

---

# PHASE 5 — Data Sanitization & Verification

## Goal

Normalize extracted inputs, validate emails, design dynamic role codes, and format joining dates.

## File

```text
src/modules/onboarding/utils/dataSanitizer.ts
```

## Endpoint

```http
POST /v1/onboarding/sanitize
```

## Request

```json
{
  "candidateName": " John Doe ",
  "email": "JOHN.DOE@EXAMPLE.COM ",
  "designation": "DevOps Engineer ",
  "department": "Engineering",
  "joiningDate": "01/11/2026"
}
```

## Expected response

```json
{
  "success": true,
  "sanitizedData": {
    "fullName": "John Doe",
    "workEmail": "john.doe@example.com",
    "role": "DEVOPS_ENGINEER",
    "department": "ENGINEERING",
    "joiningDateISO": "2026-11-01T00:00:00.000Z"
  }
}
```

---

# PHASE 6 — Role Matrix & Asset Determination Policy Engine

## Goal

Determine required hardware, cloud software licenses, and access rights based on the employee's role and department.

## File

```text
src/config/defaultMatrix.ts
```

## Setup Rules Mapping

```ts
export const ROLE_ASSET_MATRIX = {
  DEVOPS_ENGINEER: {
    hardware: ["MacBook Pro 16-inch (32GB RAM)", "Dual 27-inch Monitors", "YubiKey 5C"],
    software: ["GitHub Enterprise", "AWS IAM Admin Access", "Datadog", "Slack", "1Password"],
    accessGroup: ["devops-prod-access", "engineering-core"]
  },
  QA_ENGINEER: {
    hardware: ["MacBook Pro 14-inch (16GB RAM)", "Single 27-inch Monitor"],
    software: ["BrowserStack", "Postman Enterprise", "Jira", "Slack", "1Password"],
    accessGroup: ["qa-testing-access", "engineering-core"]
  }
};
```

## Endpoint

```http
POST /v1/onboarding/evaluate-policy
```

## Request

```json
{
  "role": "DEVOPS_ENGINEER",
  "department": "ENGINEERING"
}
```

## Expected response

```json
{
  "success": true,
  "role": "DEVOPS_ENGINEER",
  "provisioningRequirements": {
    "hardware": [
      "MacBook Pro 16-inch (32GB RAM)",
      "Dual 27-inch Monitors",
      "YubiKey 5C"
    ],
    "software": [
      "GitHub Enterprise",
      "AWS IAM Admin Access",
      "Datadog",
      "Slack",
      "1Password"
    ],
    "accessGroups": [
      "devops-prod-access",
      "engineering-core"
    ]
  }
}
```

---

# PHASE 7 — Task Generation & ITSM Ticket Mock Integration

## Goal

Break down the required provisioning assets into action items and mock-create corresponding IT tickets.

## Endpoint

```http
POST /v1/onboarding/generate-tasks
```

## Request

```json
{
  "employeeId": "EMP-9021",
  "provisioningRequirements": {
    "hardware": ["MacBook Pro 16-inch (32GB RAM)"],
    "software": ["GitHub Enterprise", "Slack"]
  }
}
```

## Expected response

```json
{
  "success": true,
  "tasks": [
    {
      "taskId": "TSK-101",
      "category": "HARDWARE",
      "item": "MacBook Pro 16-inch (32GB RAM)",
      "status": "PENDING_DISPATCH"
    },
    {
      "taskId": "TSK-102",
      "category": "SOFTWARE_LICENSE",
      "item": "GitHub Enterprise",
      "status": "PENDING_INVITE"
    },
    {
      "taskId": "TSK-103",
      "category": "SOFTWARE_LICENSE",
      "item": "Slack",
      "status": "PENDING_INVITE"
    }
  ]
}
```

---

# PHASE 8 — Database Persistence & Onboarding State Record

## Goal

Persist the entire onboarding record, required assets, status tracking, and subtasks in MongoDB `onboarding_workflows`.

## File

```text
src/modules/onboarding/repositories/OnboardingRepository.ts
```

## Collection Schema (`onboarding_workflows`)

```json
{
  "_id": "651a2b3c4d5e6f7a8b9c0d1e",
  "employeeId": "EMP-9021",
  "fullName": "John Doe",
  "workEmail": "john.doe@example.com",
  "department": "ENGINEERING",
  "role": "DEVOPS_ENGINEER",
  "joiningDate": "2026-11-01T00:00:00.000Z",
  "status": "IN_PROGRESS",
  "provisioningPlan": {
    "hardware": ["MacBook Pro 16-inch (32GB RAM)", "Dual 27-inch Monitors", "YubiKey 5C"],
    "software": ["GitHub Enterprise", "AWS IAM Admin Access", "Slack"]
  },
  "tasks": [
    {
      "taskId": "TSK-101",
      "type": "HARDWARE",
      "description": "Procure and configure MacBook Pro 16-inch",
      "completed": false
    }
  ],
  "createdAt": "2026-10-02T10:00:00.000Z",
  "updatedAt": "2026-10-02T10:00:00.000Z"
}
```

## Endpoint

```http
POST /v1/onboarding/record
```

## Request

```json
{
  "employeeId": "EMP-9021",
  "fullName": "John Doe",
  "workEmail": "john.doe@example.com",
  "department": "ENGINEERING",
  "role": "DEVOPS_ENGINEER",
  "joiningDate": "2026-11-01T00:00:00.000Z",
  "provisioningPlan": {
    "hardware": ["MacBook Pro 16-inch (32GB RAM)"],
    "software": ["Slack"]
  }
}
```

## Expected response

```json
{
  "success": true,
  "message": "Onboarding record initialized successfully",
  "onboardingId": "651a2b3c4d5e6f7a8b9c0d1e"
}
```

---

# PHASE 9 — End-to-End Orchestrated Pipeline

## Goal

Provide a single master endpoint to execute document extraction/submission, policy lookup, task creation, and database persistence in one continuous flow.

## Endpoint

```http
POST /v1/onboarding/process
```

## Request (Multipart Form Data or JSON)

```bash
curl -X POST \
  http://localhost:3000/v1/onboarding/process \
  -F "file=@OfferLetter_JohnDoe_DevOps.pdf" \
  -F "employeeId=EMP-9021"
```

## Expected response

```json
{
  "success": true,
  "message": "Smart Onboarding Workflow execution completed",
  "onboardingId": "651a2b3c4d5e6f7a8b9c0d1e",
  "summary": {
    "employee": "John Doe",
    "assignedRole": "DEVOPS_ENGINEER",
    "totalHardwareItems": 3,
    "totalSoftwareLicenses": 5,
    "status": "IN_PROGRESS"
  },
  "executionTimings": {
    "extractMs": 110,
    "policyEvalMs": 12,
    "taskGenMs": 25,
    "dbInsertMs": 40,
    "totalMs": 187
  }
}
```

---

# PHASE 10 — Workflow Status Query API

## Goal

Provide endpoints to check, inspect, and update provisioned tasks for individual new hires.

## Endpoint

```http
GET /v1/onboarding/workflow/:id
```

## Request

```bash
curl http://localhost:3000/v1/onboarding/workflow/651a2b3c4d5e6f7a8b9c0d1e
```

## Expected response

```json
{
  "success": true,
  "workflow": {
    "onboardingId": "651a2b3c4d5e6f7a8b9c0d1e",
    "employeeId": "EMP-9021",
    "fullName": "John Doe",
    "status": "IN_PROGRESS",
    "completionPercentage": 33,
    "tasks": [
      { "taskId": "TSK-101", "description": "Hardware Dispatch", "completed": true },
      { "taskId": "TSK-102", "description": "GitHub Provisioning", "completed": false },
      { "taskId": "TSK-103", "description": "Slack Provisioning", "completed": false }
    ]
  }
}
```

---

# PHASE 11 — Error Handling & Fallbacks

## Standard Error Codes

| Case | HTTP Code | Error Code | Message |
|---|---:|---|---|
| Missing Document/Field | 400 | `INVALID_INPUT` | Employee details or PDF file required |
| Unmapped Role | 422 | `ROLE_NOT_CONFIGURED` | No asset template found for provided role |
| DB Write Error | 500 | `DATABASE_ERROR` | Unable to create onboarding workflow record |
| Internal Failure | 500 | `WORKFLOW_EXECUTION_FAILED` | Pipeline failed during asset matrix mapping |

## Standard Error Response Format

```json
{
  "success": false,
  "requestId": "req-9912",
  "errorCode": "ROLE_NOT_CONFIGURED",
  "message": "No asset matrix policy found for role: INTERN_UNMAPPED"
}
```

---

# PHASE 12 — Automated Verification & Tests

## Tests Checklist

- [ ] `GET /v1/health` and `GET /v1/health/db` return 200 OK.
- [ ] Direct execution of policy engine returns correct hardware/software list.
- [ ] Offer letter parser handles invalid/corrupted files gracefully.
- [ ] Task creation converts assets into discrete sub-actions.
- [ ] End-to-end `/v1/onboarding/process` updates MongoDB collection `onboarding_workflows`.
- [ ] Status fetch endpoint reflects updated completion state correctly.

---

# 7. Final Verification Checklist

Complete every item before declaring the Phase 1 backend engine production-ready.

- [ ] `npm run dev` starts the Express backend without error.
- [ ] Mongo connection connects to `smart_onboarding` database.
- [ ] Multi-part PDF offer letter processing works cleanly.
- [ ] Policy engine accurately maps roles to assets and access entitlements.
- [ ] MongoDB stores full workflow state and generated task list.
- [ ] Request IDs and execution timings are consistently logged.
- [ ] Status updates and progress checks operate via REST endpoints.

---

# 8. Completion Gate

Core workflow engine verification proof structure:

```json
{
  "engineReady": true,
  "server": "onboarding-provisioning-backend",
  "collection": "onboarding_workflows",
  "policyEngineConfigured": true,
  "sampleRecordCreated": true,
  "tasksGenerated": true
}
```

---

# 9. Next Step

After all core workflow and provisioning checkpoints pass, continue with:

```text
02_Hardware_Shipment_And_Identity_Integration_Implementation.md
```