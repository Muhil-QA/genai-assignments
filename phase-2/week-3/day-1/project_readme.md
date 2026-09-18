# Test Automation & Orchestration Workflow

## 📌 Architecture Overview

This project implements a multi-tiered architecture designed to efficiently process routing, page interactions, and test execution while maintaining strict control over token usage and API rate limits.

```
       +------------------------------------+
       |       Main Orchestrator           |
       |  (Routing & Page Level Workflows)  |
       +-----------------+------------------+
                         |
           +-------------+-------------+
           |                           |
           v                           v
+--------------------+       +--------------------+
|   Sub-Workflow A   |       |   Sub-Workflow B   |
| (Test Case Execution)      | (Test Case Execution)
+--------------------+       +--------------------+
```

### 1. Main Workflow (Routing & Page Navigation)
* **Responsibility:** High-level task orchestration, URL/Page routing, and overall workflow state management.
* **Functionality:** Inspects input directives, identifies target page components, and dispatches dynamic payloads to sub-workflows.

### 2. Sub-Workflow (Test Case Execution)
* **Responsibility:** Granular test assertion, element-level interaction, and response validation.
* **Functionality:** Runs independent, isolated test steps for individual test cases, returning execution results, metrics, and error logs back to the main workflow.

---

## 🤖 Model & Token Optimization

* **Model Used:** `openai/gpt-oss-20b` (via Groq API)
* **Optimization Strategy:**
  * **Token Efficiency:** The `gpt-oss-20b` model provides an optimal balance between reasoning capabilities and token footprint.
  * **Quota Management:** Selecting a lightweight, high-throughput model reduces prompt/completion overhead, helping prevent daily quota rate limit breaches while keeping execution latency low.

---

## ⏱️ Execution & Rate Limit Handling

To ensure smooth operation within API tier limits (specifically Groq's rate limits), the execution engine incorporates built-in throttling mechanics:

* **Pacing Delay:** A **35-second delay** is systematically introduced between batch sub-workflow dispatches / API calls.
* **Resilience:** This delay prevents `429 Too Many Requests` errors, mitigates burst limit penalties, and ensures predictable automated run completions without manual intervention.

---

## 🚀 Getting Started

1. **Environment Setup:** Ensure your API keys (e.g., `GROQ_API_KEY`) are properly exported in your environment variables.
2. **Execute Main Workflow:** Launch the top-level script or orchestrator process to initiate page routing and trigger sub-workflows.
```bash
python main_workflow.py
```