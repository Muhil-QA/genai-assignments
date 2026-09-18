import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STANDARD_TEST_TYPES, type ApiTestCase, type StandardTestType, type TestcaseSummary } from "../types";
import { StatusPill } from "./StatusPill";

export function TestcasePanel({
  testCases, summary, generationSource, generationModel, onDownload, onGeneratePostman, postmanReady, busy, onClear, visible
}: {
  testCases: ApiTestCase[];
  summary: TestcaseSummary;
  generationSource: string;
  generationModel?: string;
  onDownload: (type: "json" | "excel" | "swagger" | "postman") => void;
  onGeneratePostman: () => void;
  postmanReady: boolean;
  busy: boolean;
  onClear: () => void;
  visible: boolean;
}) {
  const usesGroq = generationSource.includes("groq");
  const engineLabel = usesGroq
    ? `Groq LLM${generationModel ? ` · ${generationModel}` : ""}`
    : "Built-in generator (no LLM)";

  const [category, setCategory] = useState("all");
  const [standardType, setStandardType] = useState<StandardTestType | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ApiTestCase | null>(null);
  const filtered = useMemo(() => testCases.filter((item) => {
    const categoryMatch = category === "all" || item.category === category;
    const standardTypeMatch = standardType === "all" || (item.standardTestTypes ?? []).includes(standardType);
    const haystack = `${item.testCaseId} ${item.method} ${item.endpoint} ${item.title}`.toLowerCase();
    return categoryMatch && standardTypeMatch && haystack.includes(query.toLowerCase());
  }), [testCases, category, standardType, query]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [selected]);

  return (
    <section className="card testcase-card">
      <div className="section-heading split">
        <div>
          <span className="eyebrow">Step 3</span>
          <h2>Generated <mark className="hl hl-green">API testcases</mark></h2>
          <p>Grounded in the validated OpenAPI operations and schemas.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusPill tone={usesGroq ? "success" : "warning"} title={`Generation source: ${generationSource}`}>
            {engineLabel}
          </StatusPill>
          {visible && <button className="button ghost" type="button" onClick={onClear}>Clear</button>}
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric hero"><span>Total testcases</span><strong>{summary.totalTestCases}</strong></div>
        {Object.entries(summary).filter(([key, value]) => key !== "totalTestCases" && key !== "standardTestTypes" && typeof value === "number" && value > 0).slice(0, 6).map(([key, value]) => (
          <div className="metric" key={key}><span>{key.replace("-", " ")}</span><strong>{typeof value === "number" ? value : 0}</strong></div>
        ))}
      </div>

      <div className="classification-summary">
        <div>
          <h3>Standard QA coverage</h3>
          <p>Each testcase can belong to more than one testing type.</p>
        </div>
        <div className="classification-metrics">
          {STANDARD_TEST_TYPES.filter((type) => summary.standardTestTypes?.[type] > 0).map((type) => (
            <div className="classification-metric" key={type}><span>{type}</span><strong>{summary.standardTestTypes[type]}</strong></div>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <input aria-label="Search testcases" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, endpoint, method, or title" />
        <select aria-label="Filter scenario category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {[...new Set(testCases.map((item) => item.category))].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filter standard test type" value={standardType} onChange={(e) => setStandardType(e.target.value as StandardTestType | "all")}>
          <option value="all">All standard types</option>
          {STANDARD_TEST_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Method</th><th>Endpoint</th><th>Category</th><th>Standard types</th><th>Title</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.testCaseId}>
                <td><strong>{item.testCaseId}</strong></td>
                <td><span className={`method ${item.method.toLowerCase()}`}>{item.method}</span></td>
                <td><code>{item.endpoint}</code></td>
                <td>{item.category}</td>
                <td><div className="standard-type-list">{(item.standardTestTypes ?? []).map((type) => <StatusPill key={type} tone="neutral">{type}</StatusPill>)}</div></td>
                <td>{item.title}</td>
                <td><StatusPill tone={item.priority === "High" ? "danger" : item.priority === "Medium" ? "warning" : "neutral"}>{item.priority}</StatusPill></td>
                <td><button className="link-button" onClick={() => setSelected(item)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="download-panel">
        <div><h3>Download results</h3><p>Export the generated testcases and validated specification.</p></div>
        <div className="download-actions">
          <button className="button secondary" onClick={() => onDownload("json")}>JSON</button>
          <button className="button secondary" onClick={() => onDownload("excel")}>Excel</button>
          <button className="button secondary" onClick={() => onDownload("swagger")}>Swagger</button>
          {!postmanReady ? <button className="button primary" disabled={busy} onClick={onGeneratePostman}>{busy ? "Generating…" : "Generate Postman"}</button> : <button className="button primary" onClick={() => onDownload("postman")}>Download Postman</button>}
        </div>
      </div>

      {selected && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Testcase ${selected.testCaseId}`} onClick={() => setSelected(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div className="modal-title">
                <div className="modal-id">
                  <span className={`method ${selected.method.toLowerCase()}`}>{selected.method}</span>
                  <strong>{selected.testCaseId}</strong>
                </div>
                <h3>{selected.title}</h3>
                <code className="modal-endpoint">{selected.endpoint}</code>
              </div>
              <button className="modal-close" aria-label="Close" onClick={() => setSelected(null)}>×</button>
            </header>

            <div className="modal-tags">
              <StatusPill tone="neutral">{selected.category}</StatusPill>
              {(selected.standardTestTypes ?? []).map((type) => <StatusPill key={type} tone="success">{type}</StatusPill>)}
              <StatusPill tone={selected.priority === "High" ? "danger" : selected.priority === "Medium" ? "warning" : "neutral"}>{selected.priority} priority</StatusPill>
              <StatusPill tone="success">HTTP {selected.expectedStatusCode}</StatusPill>
              {selected.operationId && <StatusPill tone="neutral">{selected.operationId}</StatusPill>}
            </div>

            <div className="modal-body">
              <div className="modal-section">
                <h4>Preconditions</h4>
                {selected.preconditions.length ? <ol>{selected.preconditions.map((step, i) => <li key={i}>{step}</li>)}</ol> : <p className="muted">None</p>}
              </div>
              <div className="modal-section">
                <h4>Steps</h4>
                <ol>{selected.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
              </div>
              <div className="modal-section full">
                <h4>Expected result</h4>
                <p><strong>HTTP {selected.expectedStatusCode}</strong> — {selected.expectedResult}</p>
              </div>
              <div className="modal-section full">
                <h4>Request data</h4>
                <pre>{JSON.stringify({ headers: selected.headers, pathParameters: selected.pathParameters, queryParameters: selected.queryParameters, requestBody: selected.requestBody }, null, 2)}</pre>
              </div>
              <div className="modal-section full">
                <h4>Source references</h4>
                <ul className="ref-list">{selected.sourceReferences.map((ref, i) => <li key={i}><code>{ref}</code></li>)}</ul>
              </div>
            </div>

            <footer className="modal-foot">
              <button className="button ghost" onClick={() => setSelected(null)}>Close</button>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
