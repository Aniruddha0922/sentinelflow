import { useEffect, useState } from "react";
import {
  Beaker,
  BrainCircuit,
  ChartColumnIncreasing,
  CircleCheck,
  FlaskConical,
  GitBranch,
  Info,
  TriangleAlert,
} from "lucide-react";
import { api, messageOf } from "../api";
import { ErrorNotice, PanelHeader, Skeleton } from "../components";
import {
  featureName,
  labelColors,
  labelNames,
  number,
  percent,
} from "../format";
import type { ModelReport } from "../types";

export default function ModelPage({ revision }: { revision: number }) {
  const [report, setReport] = useState<ModelReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .model(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, retry]);

  const maxMatrix = Math.max(1, ...(report?.confusion_matrix.flat() || []));
  const importances = [...(report?.feature_importance || [])].sort(
    (a, b) => b.importance - a.importance,
  );
  const maxImportance = Math.max(
    0.01,
    ...importances.map((entry) => entry.importance),
  );

  return (
    <div className="page-content model-page">
      <div className="benchmark-warning">
        <span className="warning-icon">
          <TriangleAlert size={23} />
        </span>
        <div>
          <strong>Synthetic benchmark. Not real-world validation.</strong>
          <p>
            These metrics come from a deterministic held-out split of generated
            network flows. High scores do not demonstrate performance on real
            networks, novel attacks, or production traffic.
          </p>
        </div>
        <span className="warning-tag">EDUCATIONAL ONLY</span>
      </div>
      {error ? (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      ) : loading ? (
        <section className="panel">
          <Skeleton lines={8} />
        </section>
      ) : (
        report && (
          <>
            <section className="panel model-identity">
              <span className="model-avatar">
                <BrainCircuit size={30} strokeWidth={1.4} />
              </span>
              <div className="model-name">
                <span className="eyebrow">CLASSIFICATION ENGINE</span>
                <h2>
                  {report.name}
                  <span className="version-tag">v{report.version}</span>
                </h2>
                <p>{report.dataset}</p>
              </div>
              <div className="model-metadata">
                <span>
                  <GitBranch size={14} />
                  Seed {number(report.seed)}
                </span>
                <span>
                  <FlaskConical size={14} />
                  Deterministic split
                </span>
                <span>
                  <CircleCheck size={14} />
                  4-class classification
                </span>
              </div>
            </section>
            <div className="stats-grid model-stats">
              <section className="stat-card teal">
                <span className="stat-label">Held-out accuracy</span>
                <div className="stat-value">
                  {percent(report.accuracy)}
                  <span className="stat-icon teal">
                    <ChartColumnIncreasing size={18} />
                  </span>
                </div>
                <span className="stat-description">
                  Synthetic test set only
                </span>
              </section>
              <section className="stat-card blue">
                <span className="stat-label">Macro F1 score</span>
                <div className="stat-value">
                  {report.macro_f1.toFixed(3)}
                  <span className="stat-icon blue">
                    <BrainCircuit size={18} />
                  </span>
                </div>
                <span className="stat-description">
                  Equal weight across classes
                </span>
              </section>
              <section className="stat-card">
                <span className="stat-label">Training samples</span>
                <div className="stat-value">
                  {number(report.training_samples)}
                </div>
                <span className="stat-description">
                  Generated training partition
                </span>
              </section>
              <section className="stat-card">
                <span className="stat-label">Test samples</span>
                <div className="stat-value">{number(report.test_samples)}</div>
                <span className="stat-description">
                  Held out from model training
                </span>
              </section>
            </div>
            <div className="model-charts-grid">
              <section className="panel matrix-panel">
                <PanelHeader
                  title="Confusion matrix"
                  subtitle="Held-out synthetic predictions vs. true labels"
                  action={<Beaker size={19} className="muted" />}
                />
                <div className="matrix-content">
                  <div className="matrix-axis-label">PREDICTED CLASS →</div>
                  <div className="matrix-table-scroll">
                    <table className="matrix-table">
                      <caption className="sr-only">
                        Confusion matrix. Rows are actual classes; columns are
                        predicted classes.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Actual ↓</th>
                          {report.labels.map((label) => (
                            <th key={label} scope="col">
                              {labelNames[label]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.confusion_matrix.map((row, rowIndex) => (
                          <tr key={report.labels[rowIndex]}>
                            <th scope="row">
                              {labelNames[report.labels[rowIndex]]}
                            </th>
                            {row.map((value, colIndex) => (
                              <td
                                key={colIndex}
                                style={{
                                  background:
                                    rowIndex === colIndex
                                      ? `rgba(72, 217, 177, ${0.07 + (value / maxMatrix) * 0.31})`
                                      : `rgba(242, 119, 133, ${value ? 0.08 + (value / maxMatrix) * 0.4 : 0.025})`,
                                }}
                              >
                                <span>{number(value)}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="matrix-key">
                    <span>Fewer samples</span>
                    <span className="matrix-gradient" />
                    <span>More samples</span>
                  </div>
                  <p className="micro-note">
                    <Info size={13} />
                    Diagonal cells are correct predictions. Counts are actual
                    held-out results.
                  </p>
                </div>
              </section>
              <section className="panel importance-panel">
                <PanelHeader
                  title="Feature importance"
                  subtitle="Global model importance · relative contribution"
                />
                <div className="importance-list">
                  {importances.map((entry, index) => (
                    <div className="importance-row" key={entry.feature}>
                      <div className="bar-label">
                        <span>
                          <span className="feature-rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {featureName(entry.feature)}
                        </span>
                        <strong>{percent(entry.importance)}</strong>
                      </div>
                      <div className="horizontal-track">
                        <span
                          style={{
                            width: `${(entry.importance / maxImportance) * 100}%`,
                            opacity: 1 - index * 0.055,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="panel-bottom-note">
                  Global importance is not an explanation of any individual
                  flow.
                </div>
              </section>
            </div>
            <section className="panel">
              <PanelHeader
                title="Per-class performance"
                subtitle="Precision, recall, and F1 measured on the synthetic test partition"
              />
              <div className="table-scroll">
                <table className="class-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1 score</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.per_class.map((entry) => (
                      <tr key={entry.label}>
                        <td>
                          <span className="class-name">
                            <i
                              className="legend-dot"
                              style={{ background: labelColors[entry.label] }}
                            />
                            {labelNames[entry.label]}
                          </span>
                        </td>
                        <td>{percent(entry.precision)}</td>
                        <td>{percent(entry.recall)}</td>
                        <td>{entry.f1.toFixed(3)}</td>
                        <td>{number(entry.support)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="limitations-card">
              <div className="section-title">
                <Info size={19} />
                <h2>Know the boundaries</h2>
              </div>
              <p>
                SentinelFlow is an educational, local analysis workspace—not a
                production intrusion-detection system.
              </p>
              <ul>
                {report.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
                <li>
                  No live packet capture, automated blocking, or real-network
                  validation is provided.
                </li>
                <li>
                  Risk scores are model outputs; feature sensitivities are not
                  causal explanations or SHAP values.
                </li>
              </ul>
            </section>
          </>
        )
      )}
    </div>
  );
}
