import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Beaker,
  Check,
  ChevronRight,
  CircleDot,
  Download,
  FlaskConical,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Radio,
  RefreshCw,
  ScanLine,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { api, messageOf } from "./api";
import AnalysisDetail from "./AnalysisDetail";
import { ErrorNotice, Modal, Spinner } from "./components";
import { number } from "./format";
import OverviewPage from "./pages/OverviewPage";
import InvestigatePage from "./pages/InvestigatePage";
import AnalyzePage from "./pages/AnalyzePage";
import ModelPage from "./pages/ModelPage";
import type { BatchResult, Overview, Page } from "./types";

const navigation = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "investigate" as const, label: "Investigate", icon: ScanLine },
  { id: "analyze" as const, label: "Analyze traffic", icon: Upload },
  { id: "model" as const, label: "Model Lab", icon: Beaker },
];
const pageInfo: Record<
  Page,
  { title: string; description: string; path: string }
> = {
  overview: {
    title: "Network overview",
    description: "Clarity in every flow. Confidence in every investigation.",
    path: "Overview",
  },
  investigate: {
    title: "Follow the signal.",
    description:
      "Explore saved flows and understand what shaped each prediction.",
    path: "Investigate",
  },
  analyze: {
    title: "Turn traffic into insight.",
    description:
      "Analyze a single flow, import a dataset, or explore synthetic examples.",
    path: "Analyze traffic",
  },
  model: {
    title: "Open the black box.",
    description:
      "A transparent look at the model, its performance, and its limitations.",
    path: "Model Lab",
  },
};

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<"checking" | "connected" | "offline">(
    "checking",
  );
  const [version, setVersion] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const loadWorkspace = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setWorkspaceError("");
    const [overviewResult, healthResult] = await Promise.allSettled([
      api.overview(controller.signal),
      api.health(controller.signal),
    ]);
    if (controller.signal.aborted) return;
    if (overviewResult.status === "fulfilled") {
      setOverview(overviewResult.value);
      setUpdated(new Date());
    } else setWorkspaceError(messageOf(overviewResult.reason));
    if (
      healthResult.status === "fulfilled" &&
      healthResult.value.status === "ok"
    ) {
      setHealth("connected");
      setVersion(healthResult.value.version);
    } else setHealth("offline");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkspace();
    return () => controllerRef.current?.abort();
  }, [loadWorkspace]);

  async function refresh() {
    await loadWorkspace();
    setRevision((value) => value + 1);
  }

  function navigate(next: Page) {
    setPage(next);
    setSidebarOpen(false);
    setActionError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function runBatch(
    action: string,
    task: () => Promise<BatchResult>,
  ): Promise<BatchResult | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setPending(action);
    setActionError("");
    setNotice("");
    try {
      const result = await task();
      setNotice(
        `${number(result.count)} ${action === "demo" ? "synthetic demo " : ""}${result.count === 1 ? "flow" : "flows"} analyzed and saved to your workspace.`,
      );
      await refresh();
      return result;
    } catch (error) {
      setActionError(messageOf(error));
      return null;
    } finally {
      setPending(null);
      busyRef.current = false;
    }
  }

  const generateDemo = (count = 40, seed = 42) =>
    runBatch("demo", () => api.demo(count, seed));

  async function exportCsv() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending("export");
    setActionError("");
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentinelflow-analyses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "CSV export downloaded. Exports include up to the 10,000 most recent saved analyses.",
      );
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setPending(null);
      busyRef.current = false;
    }
  }

  async function clearData() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending("clear");
    setActionError("");
    try {
      const result = await api.clear();
      setSelected(null);
      setConfirmClear(false);
      setSidebarOpen(false);
      setPage("overview");
      setNotice(
        `${number(result.deleted)} saved ${result.deleted === 1 ? "analysis" : "analyses"} deleted. The trained model is unchanged.`,
      );
      await refresh();
    } catch (error) {
      setConfirmClear(false);
      setActionError(messageOf(error));
    } finally {
      setPending(null);
      busyRef.current = false;
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
          aria-label="SentinelFlow home"
        >
          <span className="brand-mark">
            <Shield size={31} strokeWidth={1.5} />
            <Zap size={14} fill="currentColor" />
          </span>
          <span>
            Sentinel<span className="brand-flow">Flow</span>
            <small>NETWORK INTELLIGENCE</small>
          </span>
        </a>
        <button
          className="sidebar-mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        >
          <PanelLeftClose size={19} />
        </button>
        <div className="workspace-selector">
          <span className="workspace-avatar">
            <Activity size={18} />
          </span>
          <div>
            <strong>Local workspace</strong>
            <span>Personal environment</span>
          </div>
          <span className="small-dot" />
        </div>
        <span className="nav-section-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {page === id && <span className="nav-active-dot" />}
              {id === "investigate" &&
                page !== id &&
                !!overview?.flagged_flows && (
                  <span className="nav-count">
                    {number(overview.flagged_flows)}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <span className="sandbox-icon">
              <FlaskConical size={19} />
            </span>
            <span className="eyebrow">SAFE TO EXPLORE</span>
            <h3>Intelligence, explained.</h3>
            <p>
              A local playground for network-flow analysis. Synthetic demos.
              Real model predictions.
            </p>
            <button className="sandbox-link" onClick={() => navigate("model")}>
              Understand the model
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="clear-data-button"
            onClick={() => setConfirmClear(true)}
            disabled={!!pending || !overview?.total_flows}
          >
            <Trash2 size={16} />
            Clear saved data
          </button>
          <div className="sidebar-footer">
            <span className="local-lock">
              <Shield size={13} />
              Local only
            </span>
            <span>{version ? `v${version}` : "SentinelFlow"}</span>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} />
            <strong>{pageInfo[page].path}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-status ${health}`}>
              <span className="small-dot" />
              {health === "connected"
                ? "API connected"
                : health === "offline"
                  ? "API unavailable"
                  : "Connecting…"}
            </span>
            <span className="topbar-divider" />
            <button
              className={`icon-button ${loading ? "refreshing" : ""}`}
              onClick={() => void refresh()}
              disabled={loading || !!pending}
              aria-label="Refresh workspace"
              title="Refresh saved analyses"
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button
              className="button button-ghost button-small export-button"
              onClick={() => void exportCsv()}
              disabled={!!pending}
              title="Download up to 10,000 recent analyses"
            >
              {pending === "export" ? <Spinner /> : <Download size={15} />}
              <span>Export CSV</span>
            </button>
            <div
              className="profile-avatar"
              title="Local, single-user workspace"
            >
              SF
            </div>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span className="eyebrow">YOUR NETWORK, IN FOCUS</span>
                <span className="demo-mode-label">
                  <CircleDot size={10} />
                  DEMO MODE
                </span>
              </div>
              <h1>{pageInfo[page].title}</h1>
              <p>{pageInfo[page].description}</p>
            </div>
            <button
              className="button button-primary generate-button"
              onClick={() => void generateDemo()}
              disabled={!!pending}
            >
              {pending === "demo" ? <Spinner /> : <Sparkles size={16} />}
              Generate demo
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="environment-banner">
            <span className="environment-icon">
              <FlaskConical size={17} />
            </span>
            <p>
              <strong>A sandbox, not a surveillance tool.</strong> Explore saved
              flow analyses and synthetic demo traffic.
            </p>
            <span className="no-capture">
              <Radio size={13} />
              No live capture
            </span>
          </div>
          {workspaceError && (
            <div className="global-notice">
              <ErrorNotice
                message={workspaceError}
                onRetry={() => void refresh()}
              />
              {overview && (
                <p className="stale-note">
                  Showing the last successfully loaded overview. Refresh to
                  retrieve current records.
                </p>
              )}
            </div>
          )}
          {actionError && (
            <div className="global-notice">
              <ErrorNotice message={actionError} />
              <button
                className="text-button error-dismiss"
                onClick={() => setActionError("")}
              >
                Dismiss message <X size={13} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast-notice" role="status">
              <Check size={16} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {page === "overview" && (
            <OverviewPage
              data={overview}
              loading={loading}
              generating={!!pending}
              onDemo={() => void generateDemo()}
              onSelect={setSelected}
              onNavigate={navigate}
            />
          )}
          {page === "investigate" && (
            <InvestigatePage
              revision={revision}
              onSelect={setSelected}
              onAnalyze={() => navigate("analyze")}
            />
          )}
          {page === "analyze" && (
            <AnalyzePage
              pending={pending}
              onAnalyze={(flows) =>
                runBatch("manual", () => api.analyze(flows))
              }
              onImport={(file) => runBatch("csv", () => api.importCsv(file))}
              onDemo={generateDemo}
              onSelect={setSelected}
              onInvestigate={() => navigate("investigate")}
            />
          )}
          {page === "model" && <ModelPage revision={revision} />}
          <footer className="main-footer">
            <span>
              <Shield size={13} />
              Built for understanding. Not production security.
            </span>
            <span>
              {updated
                ? `Last synced ${updated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Waiting for the local API"}
              <span className="footer-dot">·</span>All analysis times in UTC
            </span>
          </footer>
        </main>
      </div>
      {selected !== null && (
        <AnalysisDetail id={selected} onClose={() => setSelected(null)} />
      )}
      {confirmClear && (
        <Modal
          title="Clear saved analyses?"
          onClose={() => {
            if (pending !== "clear") setConfirmClear(false);
          }}
        >
          <div className="confirm-content">
            <span className="delete-icon">
              <Trash2 size={24} />
            </span>
            <p>
              This permanently removes{" "}
              <strong>
                {number(overview?.total_flows || 0)} saved analyses
              </strong>
              , including manual inputs, CSV imports, and demo batches.
            </p>
            <p>
              The trained model and its evaluation are not affected. Export your
              data first if you need a copy. This action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="button button-ghost"
                disabled={pending === "clear"}
                onClick={() => setConfirmClear(false)}
              >
                Keep my data
              </button>
              <button
                className="button button-danger"
                disabled={!!pending}
                onClick={() => void clearData()}
              >
                {pending === "clear" ? <Spinner /> : <Trash2 size={15} />}Delete
                all analyses
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
