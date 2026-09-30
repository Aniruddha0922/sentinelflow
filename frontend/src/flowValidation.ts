import type { Flow } from "./types";

export type NumericFeature = Exclude<keyof Flow, "protocol">;
export interface FieldDefinition {
  key: NumericFeature;
  label: string;
  min: number;
  max: number;
  step: string;
  unit: string;
  hint: string;
}
export const numericFields: FieldDefinition[] = [
  {
    key: "duration_ms",
    label: "Duration",
    min: 0,
    max: 3600000,
    step: "any",
    unit: "ms",
    hint: "Flow duration · 0–3,600,000 ms",
  },
  {
    key: "packets",
    label: "Packet count",
    min: 1,
    max: 10000000,
    step: "1",
    unit: "packets",
    hint: "Total packets · 1–10,000,000",
  },
  {
    key: "bytes_transferred",
    label: "Bytes transferred",
    min: 0,
    max: 1000000000000,
    step: "1",
    unit: "bytes",
    hint: "Payload volume · 0–1 trillion bytes",
  },
  {
    key: "src_port",
    label: "Source port",
    min: 0,
    max: 65535,
    step: "1",
    unit: "port",
    hint: "Originating port · 0–65,535",
  },
  {
    key: "dst_port",
    label: "Destination port",
    min: 0,
    max: 65535,
    step: "1",
    unit: "port",
    hint: "Target port · 0–65,535",
  },
  {
    key: "failed_logins",
    label: "Failed logins",
    min: 0,
    max: 100000,
    step: "1",
    unit: "attempts",
    hint: "Unsuccessful attempts · 0–100,000",
  },
  {
    key: "unique_dest_ports",
    label: "Unique destination ports",
    min: 1,
    max: 65535,
    step: "1",
    unit: "ports",
    hint: "Distinct target ports · 1–65,535",
  },
  {
    key: "syn_ratio",
    label: "SYN ratio",
    min: 0,
    max: 1,
    step: "any",
    unit: "ratio",
    hint: "SYN packets / total packets · 0–1",
  },
];
export type FlowInput = Record<NumericFeature, string> & {
  protocol: Flow["protocol"];
};
export const defaultFlow: FlowInput = {
  duration_ms: "180",
  packets: "14",
  bytes_transferred: "6400",
  src_port: "52000",
  dst_port: "443",
  failed_logins: "0",
  unique_dest_ports: "1",
  syn_ratio: "0.1",
  protocol: "TCP",
};

export function validateFlow(input: FlowInput): {
  errors: Partial<Record<keyof Flow, string>>;
  flow: Flow | null;
} {
  const errors: Partial<Record<keyof Flow, string>> = {};
  const values = {} as Flow;
  for (const field of numericFields) {
    const raw = input[field.key].trim();
    const value = Number(raw);
    if (!raw) errors[field.key] = `${field.label} is required.`;
    else if (!Number.isFinite(value) || value < field.min || value > field.max)
      errors[field.key] =
        `Enter a value from ${field.min.toLocaleString("en-US")} to ${field.max.toLocaleString("en-US")}.`;
    else if (field.step === "1" && !Number.isInteger(value))
      errors[field.key] = "Enter a whole number.";
    values[field.key] = value;
  }
  if (!["TCP", "UDP", "ICMP"].includes(input.protocol))
    errors.protocol = "Choose TCP, UDP, or ICMP.";
  values.protocol = input.protocol;
  return { errors, flow: Object.keys(errors).length ? null : values };
}

export function validateCsvFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv"))
    return "Choose a .csv file encoded as UTF-8.";
  if (file.size > 2 * 1024 * 1024)
    return "This file exceeds the 2 MiB upload limit. Choose a smaller CSV.";
  if (file.size === 0)
    return "This CSV is empty. Add a header and at least one flow.";
  return null;
}
