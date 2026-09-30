export const LABELS = ["benign", "port_scan", "brute_force", "dos"] as const;
export type Label = (typeof LABELS)[number];
export type Page = "overview" | "investigate" | "analyze" | "model";

export interface Flow {
  duration_ms: number;
  packets: number;
  bytes_transferred: number;
  src_port: number;
  dst_port: number;
  failed_logins: number;
  unique_dest_ports: number;
  syn_ratio: number;
  protocol: "TCP" | "UDP" | "ICMP";
}

export interface Explanation {
  feature: string;
  value: number | string;
  baseline: number | string;
  impact: number;
  description: string;
}

export interface Analysis {
  id: number;
  timestamp: string;
  source: "manual" | "demo" | "csv";
  predicted_label: Label;
  confidence: number;
  risk_score: number;
  probabilities: Record<Label, number>;
  flow: Flow;
  explanations: Explanation[];
}

export interface Overview {
  total_flows: number;
  flagged_flows: number;
  high_risk_flows: number;
  average_risk: number;
  attack_distribution: { label: Label; count: number }[];
  timeline: { hour: string; total: number; flagged: number }[];
  recent_alerts: Analysis[];
}

export interface ModelReport {
  name: string;
  version: string;
  dataset: string;
  training_samples: number;
  test_samples: number;
  seed: number;
  accuracy: number;
  macro_f1: number;
  labels: Label[];
  confusion_matrix: number[][];
  per_class: {
    label: Label;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }[];
  feature_importance: { feature: string; importance: number }[];
  limitations: string[];
}

export interface AnalysisPage {
  items: Analysis[];
  total: number;
}
export interface BatchResult {
  items: Analysis[];
  count: number;
}
