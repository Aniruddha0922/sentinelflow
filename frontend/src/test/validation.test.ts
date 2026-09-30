import { describe, expect, it } from "vitest";
import {
  defaultFlow,
  numericFields,
  validateCsvFile,
  validateFlow,
} from "../flowValidation";

describe("nine-feature validation", () => {
  it("normalizes valid strings to the exact numeric API shape", () => {
    const { errors, flow } = validateFlow(defaultFlow);
    expect(errors).toEqual({});
    expect(flow).toEqual({
      duration_ms: 180,
      packets: 14,
      bytes_transferred: 6400,
      src_port: 52000,
      dst_port: 443,
      failed_logins: 0,
      unique_dest_ports: 1,
      syn_ratio: 0.1,
      protocol: "TCP",
    });
  });

  it.each(numericFields)(
    "rejects missing, below-bound, and above-bound $key",
    (field) => {
      for (const value of ["", String(field.min - 1), String(field.max + 1)]) {
        const result = validateFlow({ ...defaultFlow, [field.key]: value });
        expect(result.flow).toBeNull();
        expect(result.errors[field.key]).toBeTruthy();
      }
    },
  );

  it.each(numericFields)(
    "accepts both exact numeric bounds for $key",
    (field) => {
      expect(
        validateFlow({ ...defaultFlow, [field.key]: String(field.min) }).flow,
      ).not.toBeNull();
      expect(
        validateFlow({ ...defaultFlow, [field.key]: String(field.max) }).flow,
      ).not.toBeNull();
    },
  );

  it("rejects nonfinite input and fractional counts but accepts fractional durations and ratios", () => {
    expect(validateFlow({ ...defaultFlow, syn_ratio: "NaN" }).flow).toBeNull();
    expect(
      validateFlow({ ...defaultFlow, duration_ms: "Infinity" }).flow,
    ).toBeNull();
    expect(
      validateFlow({ ...defaultFlow, packets: "1.5" }).errors.packets,
    ).toBe("Enter a whole number.");
    expect(
      validateFlow({
        ...defaultFlow,
        duration_ms: "180.5",
        syn_ratio: "0.12345",
      }).flow,
    ).not.toBeNull();
  });
});

describe("CSV upload validation", () => {
  it("accepts a nonempty CSV and rejects wrong extension, empty, or oversized files", () => {
    expect(validateCsvFile(new File(["header\nrow"], "flows.CSV"))).toBeNull();
    expect(validateCsvFile(new File(["x"], "flows.txt"))).toContain(".csv");
    expect(validateCsvFile(new File([], "flows.csv"))).toContain("empty");
    const oversized = new File(["x"], "flows.csv");
    Object.defineProperty(oversized, "size", { value: 2 * 1024 * 1024 + 1 });
    expect(validateCsvFile(oversized)).toContain("2 MiB");
  });
});
