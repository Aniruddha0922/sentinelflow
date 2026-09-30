import { useEffect, useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Inbox,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { flowId, labelNames, number, percent, timestamp } from "./format";
import type { Analysis, Label } from "./types";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <LoaderCircle size={17} className="spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>Something needs your attention</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="button button-small button-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span className="empty-icon">
        <Inbox size={26} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LabelBadge({ label }: { label: Label }) {
  return (
    <span className={`label-badge ${label}`}>
      <span />
      {labelNames[label]}
    </span>
  );
}

export function RiskBar({ score }: { score: number }) {
  return (
    <span
      className={`risk-cell ${score >= 80 ? "risk-high" : score >= 40 ? "risk-medium" : "risk-low"}`}
    >
      <span className="risk-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </span>
      <span>{score.toFixed(1)}</span>
    </span>
  );
}

export function FlowTable({
  items,
  onSelect,
  showSource = false,
}: {
  items: Analysis[];
  onSelect: (id: number) => void;
  showSource?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="flow-table">
        <thead>
          <tr>
            <th>Flow ID</th>
            <th>Classification</th>
            <th>Protocol</th>
            {showSource && <th>Source</th>}
            <th>
              Risk score <span className="subtle">/ 100</span>
            </th>
            <th>Confidence</th>
            <th>
              Analyzed <span className="subtle">(UTC)</span>
            </th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} onClick={() => onSelect(item.id)}>
              <td>
                <button
                  className="flow-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                >
                  {flowId(item.id)}
                </button>
              </td>
              <td>
                <LabelBadge label={item.predicted_label} />
              </td>
              <td>
                <span className="protocol-tag">{item.flow.protocol}</span>
              </td>
              {showSource && (
                <td className="source-cell">
                  {item.source === "csv" ? "CSV" : item.source}
                </td>
              )}
              <td>
                <RiskBar score={item.risk_score} />
              </td>
              <td className="mono muted">{percent(item.confidence)}</td>
              <td className="muted nowrap">{timestamp(item.timestamp)}</td>
              <td>
                <ArrowUpRight size={16} className="subtle" aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    node?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !node) return;
      const elements = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      );
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === node)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === node)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${drawer ? "drawer-backdrop" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={drawer ? "detail-drawer" : "confirm-modal"}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              SENTINELFLOW / {drawer ? "INVESTIGATION" : "WORKSPACE"}
            </span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-block" role="status" aria-label="Loading data">
      {Array.from({ length: lines }, (_, index) => (
        <div className="skeleton" key={index} />
      ))}
    </div>
  );
}

export function SafetyNote({ children }: { children?: ReactNode }) {
  return (
    <div className="safety-note">
      <ShieldCheck size={15} />
      <span>
        {children ||
          "Local analysis only. No packet capture. No external telemetry."}
      </span>
    </div>
  );
}

export function Count({ value }: { value: number }) {
  return <span className="count-pill">{number(value)}</span>;
}
