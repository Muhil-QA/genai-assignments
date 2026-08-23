type InputMode = "file" | "link" | undefined;

export function InputModePanel({ mode, onChange }: { mode: InputMode; onChange: (mode: InputMode) => void }) {
  return (
    <fieldset className="input-mode-panel">
      <legend>Choose an input source</legend>
      <label className={`mode-option ${mode === "file" ? "selected" : ""}`}>
        <input type="radio" name="input-mode" value="file" checked={mode === "file"} onChange={() => onChange("file")} />
        <span>
          <strong>Upload File</strong>
          <small>Use a local YAML, YML, or JSON specification</small>
        </span>
      </label>
      <label className={`mode-option ${mode === "link" ? "selected" : ""}`}>
        <input type="radio" name="input-mode" value="link" checked={mode === "link"} onChange={() => onChange("link")} />
        <span>
          <strong>Upload Link</strong>
          <small>Fetch a specification from an HTTP or HTTPS URL</small>
        </span>
      </label>
    </fieldset>
  );
}
