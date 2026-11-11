# 🌌 DeepEval & RAGAS Learning Playground

A multi-tier evaluation and learning-first system that teaches developers how to evaluate, benchmark, debug, and optimize Retrieval-Augmented Generation (RAG) pipelines in production.

---

## 🏗️ Architecture & Directories

The platform is designed with three main components:
1. **Frontend (React + Vite)**: Interactive playground UI where you specify queries, retrieve context, toggle providers, and visualize metrics.
2. **Backend (Node.js + Express)**: API Gateway that orchestrates requests, performs metric validations, and routes them to the evaluation judges.
3. **Python Sidecar (FastAPI + DeepEval/RAGAS)**: Execution engine that invokes Python judge models to perform evaluations and return scores and AI-generated reasoning.

```
llm-evaluation-metrics/
├── frontend/                # React (TypeScript) + Vite (Port 5175/5176)
│   ├── src/                 # Application codebase
│   │   ├── components/      # UI components (Form, ContextList, ResponsePanel)
│   │   ├── services/        # API service clients
│   │   └── styles/          # Dark-theme and provider-toggle styles
│   └── package.json
│
├── backend/                 # Node.js + Express + TypeScript (Port 3002)
│   ├── src/                 # REST API endpoints, routing to Python server
│   └── package.json
│
├── llm-eval-providers/      # Python FastAPI Sidecar (Port 8002)
│   └── deepeval_server.py   # Runs DeepEval & RAGAS judgments
│
├── run-python-server.js     # Helper executing Python under correct virtualenv
├── package.json             # Root folder orchestrator
├── requirements.txt         # Python sidecar dependencies
└── .env                     # Global configuration parameters
```

---

## 🛠️ Step-by-Step Installation Guide

Follow these steps to configure your environment and run the playground.

### 1️⃣ Setup API Keys in `.env`
In the root directory, create/edit the `.env` file to configure your evaluation API keys:

```env
PORT=3002
VITE_API_URL=http://localhost:3002
DEEPEVAL_URL=http://localhost:8002/eval

# Groq Configuration (Recommended - Free Tier Llama 3)
GROQ_API_KEY=your_groq_api_key_here
EVAL_MODEL=llama-3.3-70b-versatile

# OpenAI Configuration (Alternative)
# OPENAI_API_KEY=your_openai_api_key_here
# EVAL_MODEL=gpt-4o-mini
```

### 2️⃣ Install Node.js Workspaces (Frontend & Backend)
Run the workspace install command from the root directory to download and link all required package dependencies:
```bash
npm run setup:workspaces
```

### 3️⃣ Set Up Python Virtual Environment (`.venv`)
The Python server requires a virtual environment named `.venv` to run the evaluation frameworks safely. 

#### **For Windows Systems (PowerShell / CMD)**
1. **Create the virtual environment**:
   ```powershell
   python -m venv .venv
   ```
2. **Activate the virtual environment**:
   - *In PowerShell:*
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - *In standard Command Prompt:*
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
3. **Install the dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

#### **For macOS / Linux Systems (Terminal)**
1. **Create the virtual environment**:
   ```bash
   python3 -m venv .venv
   ```
2. **Activate the virtual environment**:
   ```bash
   source .venv/bin/activate
   ```
3. **Install the dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

## 🚀 How to Run the Platform

You can spin up all tiers together or start them individually.

### Option A: Run Everything Concurrently (Recommended)
From the root directory, start the entire playground stack:
```bash
npm run dev
```
This concurrent script automatically spins up the frontend, backend, and the Python judge server in parallel, handling `.venv` resolving for both Windows and macOS/Linux.

- **React Frontend**: `http://localhost:5175`
- **Express Backend**: `http://localhost:3002`
- **FastAPI Python Server**: `http://localhost:8002` (Docs at `http://localhost:8002/docs`)

### Option B: Run Services Individually
To debug or monitor output streams in separate terminals:

1. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```
2. **Backend**:
   ```bash
   cd backend
   npm run dev
   ```
3. **Python FastAPI Server**:
   Ensure your `.venv` is activated first:
   - *Windows:*
     ```powershell
     .\.venv\Scripts\python.exe llm-eval-providers/deepeval_server.py
     ```
   - *macOS/Linux:*
     ```bash
     ./.venv/bin/python llm-eval-providers/deepeval_server.py
     ```

---

## 🎨 Interactive Learning Workspaces

The playground features 5 interactive modules designed to teach production readiness:

1. **Playground Workspace**:
   - Compare DeepEval vs RAGAS metrics instantly.
   - Visualise scorecard diagnostics, entity hallucination reports, and AI coach cards.
2. **Metric Dashboard**:
   - Tune metrics using sliders and interact with an live **SVG Radar Chart**.
3. **RAG Debugging Lab**:
   - Diagnose common failures (Hallucination, Context Drift, etc.).
   - Interactive **Troubleshooting Matrix** maps scores to recommended solutions.
   - **Metric Dependency Visualizer** shows how quality drops cascade.
4. **Strategy & Cases**:
   - Custom threshold presets for Customer Support, Healthcare, Banking, and Legal.
   - Real-world case study logs with lessons learned.
5. **Interactive Simulator & Quiz**:
   - **Challenge Mode**: Answer questions on evaluation logs.
   - **Cost vs. Quality Simulator**: Test chunk tokens vs costs/recall.
   - **Production Monitoring**: Simulated charts representing metrics over 30 days.
