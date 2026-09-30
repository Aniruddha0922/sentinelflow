import type { Flow, Label } from "./types";

export const labelNames: Record<Label, string> = {
  benign: "Benign",
  port_scan: "Port scan",
  brute_force: "Brute force",
  dos: "Denial of service",
};
export const labelColors: Record<Label, string> = {
  benign: "#48d9b1",
  port_scan: "#8a9cff",
  brute_force: "#f3b762",
  dos: "#f27785",
};
export const featureNames: Record<keyof Flow, string> = {
  duration_ms: "Duration",
  packets: "Packet count",
  bytes_transferred: "Bytes transferred",
  src_port: "Source port",
  dst_port: "Destination port",
  failed_logins: "Failed logins",
  unique_dest_ports: "Unique destination ports",
  syn_ratio: "SYN ratio",
  protocol: "Protocol",
};
export const number = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
export const percent = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`;
export const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
export const hour = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
export const featureName = (key: string) =>
  featureNames[key as keyof Flow] || key.replaceAll("_", " ");
export const flowId = (id: number) => `FL-${String(id).padStart(5, "0")}`;
