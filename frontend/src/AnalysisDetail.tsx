import { useEffect, useState } from "react";
import { ArrowDownRight, Info, SlidersHorizontal } from "lucide-react";
import { api, messageOf } from "./api";
import { ErrorNotice, LabelBadge, Modal, Skeleton } from "./components";
import {
  featureName,
  flowId,
  labelColors,
  labelNames,
  number,
  percent,
  timestamp,
} from "./format";
import { LABELS, type Analysis } from "./types";

export default function AnalysisDetail({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .analysis(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(reason));
      });
    return () => controller.abort();
  }, [id, retry]);
  return (
    <Modal title={`Flow ${flowId(id)}`} onClose={onClose} drawer>
      {error ? (
        <div className="panel-padding">
          <ErrorNotice
            message={error}
            onRetry={() => setRetry((value) => value + 1)}
          />
        </div>
      ) : !data ? (
        <Skeleton lines={8} />
      ) : (
        <div className="detail-content">
          <div className="detail-meta">
            <span>{timestamp(data.timestamp)} UTC</span>
            <span className="source-tag">
              {data.source === "demo"
                ? "Synthetic demo"
                : data.source === "csv"
                  ? "CSV import"
                  : "Manual input"}
            </span>
          </div>
          <div className="prediction-summary">
            <div>
              <span className="eyebrow">PREDICTED CLASS</span>
              <LabelBadge label={data.predicted_label} />
              <span className="muted">
                {percent(data.confidence)} confidence
              </span>
            </div>
            <div className="detail-score">
              <span className="eyebrow">RISK SCORE</span>
              <strong>
                {data.risk_score.toFixed(1)}
                <small>/100</small>
              </strong>
            </div>
          </div>
          <p className="micro-note">
            <Info size={14} />
            Risk = (1 − P(benign)) × 100. This is a model score, not a validated
            real-world threat likelihood.
          </p>
          <section className="detail-section">
            <h3>Class probabilities</h3>
            <p>Probability assigned to each possible classification.</p>
            <div className="probability-list">
              {[...LABELS]
                .sort((a, b) => data.probabilities[b] - data.probabilities[a])
                .map((label) => (
                  <div key={label}>
                    <div className="bar-label">
                      <span>
                        <i
                          className="legend-dot"
                          style={{ background: labelColors[label] }}
                        />
                        {labelNames[label]}
                      </span>
                      <strong>{percent(data.probabilities[label], 2)}</strong>
                    </div>
                    <div className="horizontal-track">
                      <span
                        style={{
                          width: percent(data.probabilities[label], 3),
                          background: labelColors[label],
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title">
              <SlidersHorizontal size={17} />
              <h3>Why this prediction?</h3>
            </div>
            <p>
              Single-feature sensitivity against a benign training reference.
            </p>
            {data.explanations.length ? (
              <div className="sensitivity-list">
                {data.explanations.map((explanation) => (
                  <div className="sensitivity-card" key={explanation.feature}>
                    <div>
                      <strong>{featureName(explanation.feature)}</strong>
                      <span className="impact">
                        <ArrowDownRight size={14} />
                        {explanation.impact.toFixed(1)} pp
                      </span>
                    </div>
                    <p>{explanation.description}</p>
                    <div className="reference-values">
                      <span>
                        Input <b>{String(explanation.value)}</b>
                      </span>
                      <span>
                        Benign reference <b>{String(explanation.baseline)}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="inline-empty">
                No positive risk-reducing feature sensitivities were returned
                for this flow.
              </div>
            )}
            <div className="sensitivity-caveat">
              <Info size={15} />
              <p>
                Each effect replaces one feature with its benign-training median
                (or mode), holding the rest fixed. These are model
                sensitivities, not causal or SHAP attributions. Effects need not
                add up.
              </p>
            </div>
          </section>
          <section className="detail-section">
            <h3>Input features</h3>
            <p>The nine features used for this prediction.</p>
            <dl className="feature-list">
              {Object.entries(data.flow).map(([key, value]) => (
                <div key={key}>
                  <dt>{featureName(key)}</dt>
                  <dd>
                    {typeof value === "number" ? number(value) : value}
                    {key === "duration_ms"
                      ? " ms"
                      : key === "bytes_transferred"
                        ? " B"
                        : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </Modal>
  );
}
