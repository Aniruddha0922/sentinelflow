import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleHelp,
  Database,
  Radar,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  FlowTable,
  PanelHeader,
  Skeleton,
  Spinner,
} from "../components";
import { hour, labelColors, labelNames, number, timestamp } from "../format";
import type { Overview, Page } from "../types";

interface Props {
  data: Overview | null;
  loading: boolean;
  generating: boolean;
  onDemo: () => void;
  onSelect: (id: number) => void;
  onNavigate: (page: Page) => void;
}

export default function OverviewPage({
  data,
  loading,
  generating,
  onDemo,
  onSelect,
  onNavigate,
}: Props) {
  const distribution =
    data?.attack_distribution.filter((entry) => entry.count > 0) || [];
  const stats = [
    {
      name: "Total flows analyzed",
      value: data ? number(data.total_flows) : "—",
      icon: Activity,
      className: "teal",
      detail: "All retained analyses",
      foot: "Persisted locally",
    },
    {
      name: "Flagged flows",
      value: data ? number(data.flagged_flows) : "—",
      icon: ShieldAlert,
      className: "amber",
      detail: "Non-benign predictions",
      foot: data?.total_flows
        ? `${((data.flagged_flows / data.total_flows) * 100).toFixed(1)}% of total`
        : "Awaiting analyses",
    },
    {
      name: "High-risk flows",
      value: data ? number(data.high_risk_flows) : "—",
      icon: Radar,
      className: "rose",
      detail: "Elevated model risk scores",
      foot: "Review recommended",
    },
    {
      name: "Average risk score",
      value: data ? data.average_risk.toFixed(1) : "—",
      icon: ChartNoAxesCombined,
      className: "blue",
      detail: "Model score, not threat likelihood",
      foot: "Scale of 0–100",
    },
  ];
  const demoButton = (
    <button
      className="button button-primary button-small"
      onClick={onDemo}
      disabled={generating}
    >
      {generating ? <Spinner /> : <Sparkles size={15} />}Generate demo data
    </button>
  );

  return (
    <div className="page-content overview-page">
      <div className="stats-grid" aria-busy={loading}>
        {stats.map(({ name, value, icon: Icon, className, detail, foot }) => (
          <section
            className={`stat-card ${className}`}
            key={name}
            aria-label={name}
          >
            <div className="stat-top">
              <span>{name}</span>
              <span className={`stat-icon ${className}`}>
                <Icon size={18} strokeWidth={1.7} />
              </span>
            </div>
            <div
              className={`stat-value ${loading && !data ? "loading-value" : ""}`}
            >
              {value}
              {name === "Average risk score" && (
                <span className="stat-unit">/ 100</span>
              )}
            </div>
            <div className="stat-footer">
              <span>{detail}</span>
              <span className={`stat-foot ${className}`}>{foot}</span>
            </div>
          </section>
        ))}
      </div>

      <div className="charts-grid">
        <section className="panel timeline-panel">
          <PanelHeader
            title="Network traffic"
            subtitle="Persisted flow volume over time"
            action={
              <span className="period-chip">
                Last 24 hours <span>UTC</span>
              </span>
            }
          />
          <div className="chart-legend">
            <span>
              <i className="legend-dot teal" />
              All flows
            </span>
            <span>
              <i className="legend-dot amber" />
              Flagged flows
            </span>
            <span className="legend-right">Hourly aggregation</span>
          </div>
          {loading && !data ? (
            <Skeleton lines={4} />
          ) : data?.timeline.some((entry) => entry.total > 0) ? (
            <div
              className="traffic-chart"
              role="img"
              aria-label={`Hourly flow volume for the last 24 hours. ${data.timeline.map((entry) => `${hour(entry.hour)} UTC: ${entry.total} flows, ${entry.flagged} flagged`).join("; ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.timeline}
                  margin={{ top: 12, right: 12, left: -24, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#48d9b1"
                        stopOpacity={0.23}
                      />
                      <stop
                        offset="100%"
                        stopColor="#48d9b1"
                        stopOpacity={0.005}
                      />
                    </linearGradient>
                    <linearGradient
                      id="flaggedFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#f3b762"
                        stopOpacity={0.09}
                      />
                      <stop offset="100%" stopColor="#f3b762" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#263040"
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={hour}
                    tick={{ fill: "#8491a7", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: "#8491a7", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#172232",
                      border: "1px solid #334154",
                      borderRadius: 10,
                      color: "#e8eef5",
                      fontSize: 12,
                    }}
                    labelFormatter={(value) =>
                      `${timestamp(String(value))} UTC`
                    }
                  />
                  <Area
                    name="All flows"
                    type="monotone"
                    dataKey="total"
                    stroke="#48d9b1"
                    strokeWidth={2.5}
                    fill="url(#totalFill)"
                    dot={
                      data.timeline.length === 1
                        ? { r: 5, fill: "#48d9b1" }
                        : false
                    }
                    isAnimationActive={false}
                  />
                  <Area
                    name="Flagged flows"
                    type="monotone"
                    dataKey="flagged"
                    stroke="#f3b762"
                    strokeWidth={2}
                    fill="url(#flaggedFill)"
                    dot={
                      data.timeline.length === 1
                        ? { r: 4, fill: "#f3b762" }
                        : false
                    }
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-chart">
              <div className="empty-chart-grid" aria-hidden="true" />
              <EmptyState
                title={
                  data
                    ? "Your timeline starts here"
                    : "Waiting for saved analyses"
                }
                description={
                  data
                    ? "Analyze a flow or generate a synthetic batch to see activity. Older saved flows are not shown in this 24-hour view."
                    : "Connect to the local API to load your saved traffic timeline. No sample values are shown."
                }
                action={data ? demoButton : undefined}
                compact
              />
            </div>
          )}
          <div className="panel-bottom-note">
            <span className="small-dot" />
            Saved analyses, not a live network feed
            <CircleHelp size={13} aria-hidden="true" />
          </div>
        </section>
        <section className="panel distribution-panel">
          <PanelHeader
            title="Attack distribution"
            subtitle="Predicted classes · all saved flows"
          />
          {loading && !data ? (
            <Skeleton lines={5} />
          ) : (
            <>
              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  role="img"
                  aria-label={
                    data?.attack_distribution
                      .map(
                        (entry) => `${labelNames[entry.label]}: ${entry.count}`,
                      )
                      .join(", ") || "No classified flows"
                  }
                >
                  {distribution.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distribution}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={70}
                          outerRadius={87}
                          paddingAngle={distribution.length > 1 ? 5 : 0}
                          stroke="none"
                          cornerRadius={4}
                          isAnimationActive={false}
                        >
                          {distribution.map((entry) => (
                            <Cell
                              key={entry.label}
                              fill={labelColors[entry.label]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-donut" />
                  )}
                </div>
                <div className="donut-center">
                  <strong>{data ? number(data.total_flows) : "—"}</strong>
                  <span>total flows</span>
                </div>
              </div>
              <div className="distribution-legend">
                {(["benign", "port_scan", "brute_force", "dos"] as const).map(
                  (label) => {
                    const count =
                      data?.attack_distribution.find(
                        (entry) => entry.label === label,
                      )?.count || 0;
                    return (
                      <div key={label}>
                        <span>
                          <i
                            className="legend-dot"
                            style={{ background: labelColors[label] }}
                          />
                          {labelNames[label]}
                        </span>
                        <strong>{data ? number(count) : "—"}</strong>
                        <span className="distribution-percent">
                          {data?.total_flows
                            ? `${Math.round((count / data.total_flows) * 100)}%`
                            : "—"}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="panel alerts-panel">
        <PanelHeader
          title="Recent alerts"
          subtitle="Latest flows classified as non-benign"
          action={
            <button
              className="text-button"
              onClick={() => onNavigate("investigate")}
            >
              View all analyses <ArrowRight size={15} />
            </button>
          }
        />
        {loading && !data ? (
          <Skeleton />
        ) : data?.recent_alerts.length ? (
          <FlowTable items={data.recent_alerts} onSelect={onSelect} />
        ) : (
          <EmptyState
            compact
            title={
              !data
                ? "Alerts are not available yet"
                : data.total_flows
                  ? "No flagged flows to review"
                  : "No alerts yet. A clean starting point."
            }
            description={
              !data
                ? "Restore the API connection and refresh to retrieve your saved alerts."
                : data.total_flows
                  ? "Your saved flows are currently classified as benign. These predictions do not establish that real traffic is safe."
                  : "Your workspace is empty. Generate demo data to explore explainable detections, or analyze your own flow."
            }
            action={
              <button
                className="text-button"
                onClick={() => onNavigate("analyze")}
              >
                Analyze a flow <ArrowRight size={15} />
              </button>
            }
          />
        )}
        <div className="panel-bottom-note">
          Risk scores reflect model output, not a validated probability of a
          real-world attack.
        </div>
      </section>

      <div className="insight-strip">
        <span className="insight-icon">
          <Database size={20} />
        </span>
        <div>
          <strong>Understand the model behind each prediction.</strong>
          <p>
            Explore held-out synthetic evaluation, class-level metrics, and
            feature importance.
          </p>
        </div>
        <button
          className="button button-ghost button-small"
          onClick={() => onNavigate("model")}
        >
          Open Model Lab <ArrowUpRight size={15} />
        </button>
      </div>
    </div>
  );
}
