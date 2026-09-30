import type { Analysis, ModelReport, Overview } from "../types";

export const analysis: Analysis = {
  id: 17,
  timestamp: "2026-01-01T10:00:00+00:00",
  source: "demo",
  predicted_label: "port_scan",
  confidence: 0.93,
  risk_score: 98.1,
  probabilities: {
    benign: 0.019,
    port_scan: 0.93,
    brute_force: 0.031,
    dos: 0.02,
  },
  flow: {
    duration_ms: 180,
    packets: 14,
    bytes_transferred: 6400,
    src_port: 52000,
    dst_port: 443,
    failed_logins: 0,
    unique_dest_ports: 100,
    syn_ratio: 0.9,
    protocol: "TCP",
  },
  explanations: [
    {
      feature: "unique_dest_ports",
      value: 100,
      baseline: 2,
      impact: 31.2,
      description:
        "Replacing unique_dest_ports with the benign reference lowers estimated malicious probability by 31.2 percentage points.",
    },
  ],
};

export const emptyOverview: Overview = {
  total_flows: 0,
  flagged_flows: 0,
  high_risk_flows: 0,
  average_risk: 0,
  attack_distribution: [
    { label: "benign", count: 0 },
    { label: "port_scan", count: 0 },
    { label: "brute_force", count: 0 },
    { label: "dos", count: 0 },
  ],
  timeline: [],
  recent_alerts: [],
};

export const overview: Overview = {
  total_flows: 42,
  flagged_flows: 12,
  high_risk_flows: 9,
  average_risk: 26.7,
  attack_distribution: [
    { label: "benign", count: 30 },
    { label: "port_scan", count: 5 },
    { label: "brute_force", count: 4 },
    { label: "dos", count: 3 },
  ],
  timeline: [{ hour: "2026-01-01T10:00:00+00:00", total: 42, flagged: 12 }],
  recent_alerts: [analysis],
};

export const report: ModelReport = {
  name: "Random Forest",
  version: "1.0.0",
  dataset: "Seeded synthetic network flows",
  training_samples: 2400,
  test_samples: 600,
  seed: 42,
  accuracy: 0.953,
  macro_f1: 0.944,
  labels: ["benign", "port_scan", "brute_force", "dos"],
  confusion_matrix: [
    [200, 5, 3, 2],
    [2, 120, 3, 1],
    [1, 2, 130, 1],
    [0, 2, 4, 124],
  ],
  per_class: [
    { label: "benign", precision: 0.9, recall: 0.9, f1: 0.9, support: 210 },
  ],
  feature_importance: [
    { feature: "packets", importance: 0.3 },
    { feature: "syn_ratio", importance: 0.2 },
  ],
  limitations: ["Training distributions are synthetic and simplified."],
};
