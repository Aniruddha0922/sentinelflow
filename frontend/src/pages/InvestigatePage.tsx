import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, ScanLine } from "lucide-react";
import { api, messageOf } from "../api";
import { EmptyState, ErrorNotice, FlowTable, Skeleton } from "../components";
import { labelNames, number } from "../format";
import { LABELS, type AnalysisPage, type Label } from "../types";

const PAGE_SIZE = 10;

export default function InvestigatePage({
  revision,
  onSelect,
  onAnalyze,
}: {
  revision: number;
  onSelect: (id: number) => void;
  onAnalyze: () => void;
}) {
  const [label, setLabel] = useState<Label | "">("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<AnalysisPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .analyses(PAGE_SIZE, offset, label || undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (offset > 0 && offset >= data.total) {
          setOffset(
            Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1) * PAGE_SIZE,
          );
          return;
        }
        setResult(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [label, offset, revision, retry]);

  return (
    <div className="page-content">
      <section className="panel investigation-panel">
        <div className="investigate-toolbar">
          <div className="toolbar-title">
            <ScanLine size={19} />
            <h2>Analysis explorer</h2>
            {result && !loading && (
              <span className="count-pill">{number(result.total)}</span>
            )}
          </div>
          <div className="filter-control">
            <Filter size={15} />
            <label htmlFor="class-filter">Classification</label>
            <select
              id="class-filter"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value as Label | "");
                setOffset(0);
              }}
            >
              {<option value="">All classifications</option>}
              {LABELS.map((value) => (
                <option key={value} value={value}>
                  {labelNames[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="explorer-caption">
          <span>
            <span className="small-dot" />
            Newest first
          </span>
          <span>Select a flow to inspect its prediction</span>
        </div>
        {error ? (
          <div className="panel-padding">
            <ErrorNotice
              message={error}
              onRetry={() => setRetry((value) => value + 1)}
            />
          </div>
        ) : loading ? (
          <Skeleton lines={6} />
        ) : result?.items.length ? (
          <FlowTable items={result.items} onSelect={onSelect} showSource />
        ) : (
          <EmptyState
            title={
              label
                ? `No ${labelNames[label].toLowerCase()} flows found`
                : "Nothing to investigate yet"
            }
            description={
              label
                ? "Try another classification or analyze more flows. Filters apply to all saved analyses."
                : "Manual analyses, CSV imports, and generated demos appear here after they are saved."
            }
            action={
              label ? (
                <button
                  className="button button-ghost"
                  onClick={() => {
                    setLabel("");
                    setOffset(0);
                  }}
                >
                  Clear filter
                </button>
              ) : (
                <button className="button button-primary" onClick={onAnalyze}>
                  Analyze traffic
                </button>
              )
            }
          />
        )}
        <div className="pagination">
          <span role="status">
            {loading
              ? "Loading analyses…"
              : error
                ? "Unable to load analyses"
                : result?.total
                  ? `Showing ${number(offset + 1)}–${number(Math.min(offset + PAGE_SIZE, result.total))} of ${number(result.total)} flows`
                  : "0 saved flows"}
          </span>
          <div>
            <button
              className="button button-small button-ghost"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span className="page-counter">
              {result?.total
                ? `Page ${Math.floor(offset / PAGE_SIZE) + 1} of ${Math.ceil(result.total / PAGE_SIZE)}`
                : "Page 1"}
            </span>
            <button
              className="button button-small button-ghost"
              disabled={
                loading || !result || offset + PAGE_SIZE >= result.total
              }
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <div className="explainer-note">
        <span className="eyebrow">A NOTE ON INTERPRETATION</span>
        <p>
          A flag is a model prediction, not a confirmed attack. Inspect class
          probabilities and feature sensitivities in each flow’s detail panel
          before drawing conclusions.
        </p>
      </div>
    </div>
  );
}
