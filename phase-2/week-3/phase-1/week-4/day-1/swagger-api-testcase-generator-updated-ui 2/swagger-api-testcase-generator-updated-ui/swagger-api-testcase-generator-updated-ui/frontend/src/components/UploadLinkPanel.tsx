import { useState } from "react";

export function UploadLinkPanel({ busy, onUploadLink, onClear, visible }: { busy: boolean; onUploadLink: (url: string) => void; onClear: () => void; visible: boolean }) {
  const [url, setUrl] = useState("");
  const isValidUrl = /^https?:\/\/\S+$/i.test(url.trim());

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isValidUrl) onUploadLink(url.trim());
  };

  return (
    <section className="card upload-card">
      <div className="section-heading split">
        <div>
          <span className="eyebrow">Step 1</span>
          <h2>Import <mark className="hl hl-blue">Swagger</mark> from a link</h2>
          <p>Enter a publicly reachable OpenAPI or Swagger YAML or JSON URL.</p>
        </div>
        {visible && <button className="button ghost" type="button" onClick={onClear}>Clear</button>}
      </div>
      <form className="link-form" onSubmit={submit}>
        <label htmlFor="swagger-url">Specification URL</label>
        <div className="link-input-row">
          <input
            id="swagger-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/openapi.yaml"
            autoComplete="url"
            disabled={busy}
            required
          />
          <button className="button primary" type="submit" disabled={busy || !isValidUrl}>
            {busy ? "Fetching…" : "Fetch specification"}
          </button>
        </div>
        <small className="link-help">The backend validates the URL and fetches the specification securely.</small>
      </form>
    </section>
  );
}
