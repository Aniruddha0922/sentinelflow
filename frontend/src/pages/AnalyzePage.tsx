import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  FlaskConical,
  Info,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  UploadCloud,
  X,
} from "lucide-react";
import { LabelBadge, PanelHeader, SafetyNote, Spinner } from "../components";
import {
  defaultFlow,
  numericFields,
  validateCsvFile,
  validateFlow,
  type FlowInput,
} from "../flowValidation";
import { flowId, number, percent } from "../format";
import type { BatchResult, Flow } from "../types";

interface Props {
  pending: string | null;
  onAnalyze: (flows: Flow[]) => Promise<BatchResult | null>;
  onImport: (file: File) => Promise<BatchResult | null>;
  onDemo: (count: number, seed: number) => Promise<BatchResult | null>;
  onSelect: (id: number) => void;
  onInvestigate: () => void;
}

export default function AnalyzePage({
  pending,
  onAnalyze,
  onImport,
  onDemo,
  onSelect,
  onInvestigate,
}: Props) {
  const [form, setForm] = useState<FlowInput>({ ...defaultFlow });
  const [errors, setErrors] = useState<Partial<Record<keyof Flow, string>>>({});
  const [result, setResult] = useState<BatchResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState("40");
  const [seed, setSeed] = useState("42");
  const [demoError, setDemoError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  async function submitFlow(event: FormEvent) {
    event.preventDefault();
    const validation = validateFlow(form);
    setErrors(validation.errors);
    if (!validation.flow) {
      document
        .getElementById(`field-${Object.keys(validation.errors)[0]}`)
        ?.focus();
      return;
    }
    setResult(null);
    const response = await onAnalyze([validation.flow]);
    if (response) setResult(response);
  }

  function selectFile(selected: File | undefined) {
    if (!selected) return;
    const error = validateCsvFile(selected);
    setFileError(error || "");
    setFile(error ? null : selected);
    if (uploadRef.current) uploadRef.current.value = "";
  }

  async function submitCsv() {
    if (!file) return;
    setResult(null);
    const response = await onImport(file);
    if (response) {
      setResult(response);
      setFile(null);
    }
  }

  async function submitDemo(event: FormEvent) {
    event.preventDefault();
    const parsedCount = Number(count);
    const parsedSeed = Number(seed);
    if (
      !count.trim() ||
      !Number.isInteger(parsedCount) ||
      parsedCount < 1 ||
      parsedCount > 100
    ) {
      setDemoError("Batch size must be a whole number from 1 to 100.");
      return;
    }
    if (
      !seed.trim() ||
      !Number.isInteger(parsedSeed) ||
      parsedSeed < 0 ||
      parsedSeed > 2147483647
    ) {
      setDemoError("Seed must be a whole number from 0 to 2,147,483,647.");
      return;
    }
    setDemoError("");
    setResult(null);
    const response = await onDemo(parsedCount, parsedSeed);
    if (response) setResult(response);
  }

  return (
    <div className="page-content">
      {result && (
        <div className="analysis-success" role="status">
          <span className="success-icon">
            <Check size={19} />
          </span>
          <div>
            <strong>
              {number(result.count)}{" "}
              {result.count === 1 ? "flow analyzed" : "flows analyzed"} and
              saved
            </strong>
            {result.count === 1 && result.items[0] ? (
              <div className="result-inline">
                <span>{flowId(result.items[0].id)}</span>
                <LabelBadge label={result.items[0].predicted_label} />
                <span>{percent(result.items[0].confidence)} confidence</span>
              </div>
            ) : (
              <p>Your results are available in the analysis explorer.</p>
            )}
          </div>
          <button
            className="text-button"
            onClick={() =>
              result.count === 1 && result.items[0]
                ? onSelect(result.items[0].id)
                : onInvestigate()
            }
          >
            {result.count === 1 ? "Inspect prediction" : "View results"}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="analyze-grid">
        <section className="panel manual-panel">
          <PanelHeader
            eyebrow="SINGLE FLOW"
            title="Manual analysis"
            subtitle="Nine features. One explainable prediction."
            action={
              <span className="panel-icon">
                <Terminal size={20} />
              </span>
            }
          />
          <form className="manual-form" onSubmit={submitFlow} noValidate>
            <div className="form-section-label">
              <span>01</span>Flow characteristics
            </div>
            <div className="fields-grid">
              {numericFields.map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={`field-${field.key}`}>{field.label}</label>
                  <div
                    className={`input-with-unit ${errors[field.key] ? "input-invalid" : ""}`}
                  >
                    <input
                      id={`field-${field.key}`}
                      name={field.key}
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      required
                      value={form[field.key]}
                      onChange={(event) => {
                        setForm({ ...form, [field.key]: event.target.value });
                        setErrors({ ...errors, [field.key]: undefined });
                      }}
                      aria-invalid={!!errors[field.key]}
                      aria-describedby={`${field.key}-hint${errors[field.key] ? ` ${field.key}-error` : ""}`}
                    />
                    <span>{field.unit}</span>
                  </div>
                  <small id={`${field.key}-hint`}>{field.hint}</small>
                  {errors[field.key] && (
                    <span
                      className="field-error"
                      id={`${field.key}-error`}
                      role="alert"
                    >
                      {errors[field.key]}
                    </span>
                  )}
                </div>
              ))}
              <div className="field">
                <label htmlFor="field-protocol">Protocol</label>
                <select
                  id="field-protocol"
                  value={form.protocol}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      protocol: event.target.value as Flow["protocol"],
                    })
                  }
                  aria-describedby="protocol-hint"
                >
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="ICMP">ICMP</option>
                </select>
                <small id="protocol-hint">Transport / network protocol</small>
              </div>
            </div>
            <div className="form-actions">
              <span className="form-action-note">
                <Info size={14} />
                Results are saved locally.
              </span>
              <button
                type="button"
                className="button button-ghost"
                disabled={!!pending}
                onClick={() => {
                  setForm({ ...defaultFlow });
                  setErrors({});
                }}
              >
                <RotateCcw size={15} />
                Reset
              </button>
              <button className="button button-primary" disabled={!!pending}>
                {pending === "manual" ? <Spinner /> : <Play size={15} />}Analyze
                flow
              </button>
            </div>
          </form>
        </section>
        <div className="analyze-side">
          <section className="panel upload-panel">
            <PanelHeader
              eyebrow="BATCH ANALYSIS"
              title="Import a CSV"
              subtitle="Bring your own network-flow features."
              action={<FileSpreadsheet size={20} className="muted" />}
            />
            <div className="upload-content">
              <input
                ref={uploadRef}
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose CSV file"
                onChange={(event) => selectFile(event.target.files?.[0])}
                disabled={!!pending}
              />
              <div
                className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!pending) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!pending) selectFile(event.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  {file ? (
                    <FileSpreadsheet size={26} />
                  ) : (
                    <UploadCloud size={28} strokeWidth={1.4} />
                  )}
                </span>
                {file ? (
                  <>
                    <strong className="file-name">{file.name}</strong>
                    <span>
                      {(file.size / 1024).toFixed(1)} KiB · ready to analyze
                    </span>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFile(null);
                        setFileError("");
                      }}
                      disabled={!!pending}
                    >
                      <X size={13} />
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="upload-browse"
                      onClick={() => uploadRef.current?.click()}
                      disabled={!!pending}
                    >
                      Click to upload <span>or drag and drop</span>
                    </button>
                    <span>UTF-8 CSV · up to 2 MiB · 500 flows</span>
                  </>
                )}
              </div>
              {fileError && (
                <p className="field-error" role="alert">
                  {fileError}
                </p>
              )}
              <details className="csv-format">
                <summary>View required CSV columns</summary>
                <p>
                  Include all nine columns, in any order. An optional{" "}
                  <code>label</code> column is accepted and ignored.
                </p>
                <code>
                  duration_ms, packets, bytes_transferred, src_port, dst_port,
                  failed_logins, unique_dest_ports, syn_ratio, protocol
                </code>
                <p>
                  Any invalid row rejects the entire batch. Nothing is saved
                  from a rejected upload.
                </p>
              </details>
              <button
                className="button button-secondary full-width"
                disabled={!file || !!pending}
                onClick={() => void submitCsv()}
              >
                {pending === "csv" ? <Spinner /> : <UploadCloud size={16} />}
                Import & analyze
              </button>
            </div>
          </section>
          <section className="panel demo-panel">
            <div className="demo-card-icon">
              <FlaskConical size={22} />
            </div>
            <span className="eyebrow">EXPLORE WITHOUT A DATASET</span>
            <h2>Take it for a test run.</h2>
            <p>
              Generate reproducible synthetic flows across benign traffic and
              attack-like patterns.
            </p>
            <form onSubmit={submitDemo} noValidate>
              <div className="demo-fields">
                <div className="field">
                  <label htmlFor="demo-count">Batch size</label>
                  <input
                    id="demo-count"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={count}
                    onChange={(event) => setCount(event.target.value)}
                  />
                  <small>1–100 flows</small>
                </div>
                <div className="field">
                  <label htmlFor="demo-seed">Random seed</label>
                  <input
                    id="demo-seed"
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                  />
                  <small>Reproducible inputs</small>
                </div>
              </div>
              {demoError && (
                <p className="field-error" role="alert">
                  {demoError}
                </p>
              )}
              <button
                className="button button-primary full-width"
                disabled={!!pending}
              >
                {pending === "demo" ? <Spinner /> : <Sparkles size={16} />}
                Generate synthetic flows
              </button>
            </form>
            <span className="demo-append-note">
              Each run appends a new batch. No live traffic is captured.
            </span>
          </section>
        </div>
      </div>
      <SafetyNote />
    </div>
  );
}
