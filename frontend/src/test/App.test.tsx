import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { api } from "../api";
import { analysis, emptyOverview, overview, report } from "./fixtures";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: Object.fromEntries(
      Object.keys(actual.api).map((key) => [key, vi.fn()]),
    ),
  };
});
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return { ...actual, ResponsiveContainer: () => <div data-testid="chart" /> };
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.health).mockResolvedValue({ status: "ok", version: "1.0.0" });
  vi.mocked(api.overview).mockResolvedValue(emptyOverview);
  vi.mocked(api.analyses).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.analysis).mockResolvedValue(analysis);
  vi.mocked(api.model).mockResolvedValue(report);
  vi.mocked(api.analyze).mockResolvedValue({ items: [analysis], count: 1 });
  vi.mocked(api.importCsv).mockResolvedValue({ items: [analysis], count: 1 });
  vi.mocked(api.demo).mockResolvedValue({ items: [analysis], count: 1 });
  vi.mocked(api.clear).mockResolvedValue({ deleted: 42 });
});

async function ready() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("API connected");
  return user;
}

function stat(name: string) {
  return within(screen.getByRole("region", { name }));
}

describe("workspace overview and global actions", () => {
  it("starts honestly empty, with no live-capture claims or invented metrics", async () => {
    await ready();
    expect(
      screen.getByText("No alerts yet. A clean starting point."),
    ).toBeInTheDocument();
    expect(screen.getByText("Your timeline starts here")).toBeInTheDocument();
    expect(screen.getByText("DEMO MODE")).toBeInTheDocument();
    expect(screen.getByText("No live capture")).toBeInTheDocument();
    expect(stat("Total flows analyzed").getByText("0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear saved data" }),
    ).toBeDisabled();
  });

  it("exposes accessible loading state until real API results arrive", async () => {
    let resolveOverview!: (value: typeof overview) => void;
    vi.mocked(api.overview).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOverview = resolve;
      }),
    );
    render(<App />);
    expect(
      screen.getAllByRole("status", { name: "Loading data" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Refresh workspace" }),
    ).toBeDisabled();
    resolveOverview(overview);
    await screen.findByText("API connected");
    expect(stat("Total flows analyzed").getByText("42")).toBeInTheDocument();
  });

  it("renders persisted totals and retrieves a saved flow with probabilities and sensitivity caveats", async () => {
    vi.mocked(api.overview).mockResolvedValue(overview);
    const user = await ready();
    expect(stat("Flagged flows").getByText("12")).toBeInTheDocument();
    expect(stat("Average risk score").getByText("26.7")).toBeInTheDocument();
    const flowButton = screen.getByRole("button", { name: "FL-00017" });
    await user.click(flowButton);
    const dialog = await screen.findByRole("dialog", { name: "Flow FL-00017" });
    await within(dialog).findByText("Class probabilities");
    expect(api.analysis).toHaveBeenCalledWith(17, expect.any(AbortSignal));
    expect(within(dialog).getByText("93.00%")).toBeInTheDocument();
    expect(within(dialog).getByText("31.2 pp")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/not causal or SHAP attributions/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Synthetic demo")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(flowButton).toHaveFocus();
  });

  it("generates a demo, then refreshes persisted overview values", async () => {
    vi.mocked(api.overview)
      .mockResolvedValueOnce(emptyOverview)
      .mockResolvedValue(overview);
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Generate demo" }));
    await waitFor(() => expect(api.demo).toHaveBeenCalledWith(40, 42));
    await waitFor(() =>
      expect(stat("Total flows analyzed").getByText("42")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "1 synthetic demo flow analyzed and saved to your workspace.",
      ),
    ).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledTimes(2);
  });

  it("shows API failure and retries without fabricating data", async () => {
    vi.mocked(api.overview)
      .mockRejectedValueOnce(new Error("Local API is unavailable."))
      .mockResolvedValue(overview);
    const user = await ready();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Local API is unavailable.",
    );
    expect(stat("Total flows analyzed").getByText("—")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(stat("Total flows analyzed").getByText("42")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires explicit destructive confirmation, supports cancellation, and refreshes after clearing", async () => {
    vi.mocked(api.overview)
      .mockResolvedValueOnce(overview)
      .mockResolvedValue(emptyOverview);
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Clear saved data" }));
    let dialog = screen.getByRole("dialog", { name: "Clear saved analyses?" });
    expect(api.clear).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Keep my data" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.clear).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear saved data" }));
    dialog = screen.getByRole("dialog", { name: "Clear saved analyses?" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete all analyses" }),
    );
    await waitFor(() => expect(api.clear).toHaveBeenCalledTimes(1));
    await screen.findByText(
      "42 saved analyses deleted. The trained model is unchanged.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(stat("Total flows analyzed").getByText("0")).toBeInTheDocument(),
    );
  });

  it("downloads server-provided CSV and reports export errors accessibly", async () => {
    const createObjectURL = vi.fn(() => "blob:sentinel-test");
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.mocked(api.exportCsv)
      .mockResolvedValueOnce(new Blob(["id\n17"], { type: "text/csv" }))
      .mockRejectedValueOnce(new Error("Export is unavailable. Retry export."));
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await screen.findByText(/CSV export downloaded/);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export is unavailable. Retry export.",
    );
  });
});

describe("manual analysis, upload, and synthetic generation", () => {
  it("validates missing/out-of-bounds fields and sends an exact nine-feature request after correction", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Analyze traffic" }));
    const packets = screen.getByLabelText("Packet count");
    const ratio = screen.getByLabelText("SYN ratio");
    await user.clear(packets);
    await user.clear(ratio);
    await user.type(ratio, "2");
    await user.click(screen.getByRole("button", { name: "Analyze flow" }));
    expect(screen.getByText("Packet count is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a value from 0 to 1.")).toBeInTheDocument();
    expect(packets).toHaveFocus();
    expect(api.analyze).not.toHaveBeenCalled();
    await user.type(packets, "14");
    await user.clear(ratio);
    await user.type(ratio, "0.1");
    await user.selectOptions(screen.getByLabelText("Protocol"), "UDP");
    await user.click(screen.getByRole("button", { name: "Analyze flow" }));
    await screen.findByText("1 flow analyzed and saved");
    expect(api.analyze).toHaveBeenCalledWith([
      {
        duration_ms: 180,
        packets: 14,
        bytes_transferred: 6400,
        src_port: 52000,
        dst_port: 443,
        failed_logins: 0,
        unique_dest_ports: 1,
        syn_ratio: 0.1,
        protocol: "UDP",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "Inspect prediction" }),
    ).toBeInTheDocument();
  });

  it("imports a selected CSV file and resets the successful file selection", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Analyze traffic" }));
    const file = new File(
      ["duration_ms,packets\n180,14"],
      "network-flows.csv",
      { type: "text/csv" },
    );
    await user.upload(screen.getByLabelText("Choose CSV file"), file);
    expect(screen.getByText("network-flows.csv")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import & analyze" }));
    await screen.findByText("1 flow analyzed and saved");
    expect(api.importCsv).toHaveBeenCalledWith(file);
    expect(
      screen.getByRole("button", { name: "Import & analyze" }),
    ).toBeDisabled();
  });

  it("rejects oversized uploads before contacting the backend", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Analyze traffic" }));
    const file = new File(["x"], "too-large.csv");
    Object.defineProperty(file, "size", { value: 2097153 });
    fireEvent.change(screen.getByLabelText("Choose CSV file"), {
      target: { files: [file] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("2 MiB");
    expect(api.importCsv).not.toHaveBeenCalled();
  });

  it("keeps failed import data available for retry and explains atomic backend validation", async () => {
    vi.mocked(api.importCsv)
      .mockRejectedValueOnce(new Error("Row 2: packets must be positive."))
      .mockResolvedValueOnce({ items: [analysis], count: 1 });
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Analyze traffic" }));
    await user.upload(
      screen.getByLabelText("Choose CSV file"),
      new File(["header\ninvalid"], "bad-row.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Import & analyze" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Row 2: packets must be positive.",
    );
    expect(screen.getByText("bad-row.csv")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import & analyze" }),
    ).toBeEnabled();
  });

  it("validates custom demo parameters and appends a reproducible requested batch", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Analyze traffic" }));
    const count = screen.getByLabelText("Batch size");
    const seed = screen.getByLabelText("Random seed");
    await user.clear(count);
    await user.type(count, "101");
    await user.click(
      screen.getByRole("button", { name: "Generate synthetic flows" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("1 to 100");
    expect(api.demo).not.toHaveBeenCalled();
    await user.clear(count);
    await user.type(count, "25");
    await user.clear(seed);
    await user.type(seed, "7");
    await user.click(
      screen.getByRole("button", { name: "Generate synthetic flows" }),
    );
    await waitFor(() => expect(api.demo).toHaveBeenCalledWith(25, 7));
  });
});

describe("investigation and model evaluation", () => {
  it("paginates on the server and resets the offset when filtering classification", async () => {
    vi.mocked(api.analyses).mockImplementation(async (_limit, offset, label) =>
      label
        ? { items: [], total: 0 }
        : {
            items: Array.from({ length: 10 }, (_, index) => ({
              ...analysis,
              id: offset + index + 1,
            })),
            total: 22,
          },
    );
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Investigate" }));
    await screen.findByText("Showing 1–10 of 22 flows");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Showing 11–20 of 22 flows");
    expect(api.analyses).toHaveBeenCalledWith(
      10,
      10,
      undefined,
      expect.any(AbortSignal),
    );
    await user.selectOptions(screen.getByLabelText("Classification"), "dos");
    await screen.findByText("No denial of service flows found");
    expect(api.analyses).toHaveBeenLastCalledWith(
      10,
      0,
      "dos",
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    await screen.findByText("Showing 1–10 of 22 flows");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("shows model metrics from the API with prominent synthetic-only limitations and matrix orientation", async () => {
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "Model Lab" }));
    await screen.findByText("Random Forest");
    expect(screen.getByText("95.3%")).toBeInTheDocument();
    expect(screen.getByText("0.944")).toBeInTheDocument();
    expect(
      screen.getByText("Synthetic benchmark. Not real-world validation."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Training distributions are synthetic and simplified."),
    ).toBeInTheDocument();
    expect(screen.getByText("Packet count")).toBeInTheDocument();
    const matrix = screen.getByRole("table", {
      name: /Rows are actual classes; columns are predicted classes/,
    });
    expect(within(matrix).getByText("200")).toBeInTheDocument();
    expect(api.model).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("handles a deleted or missing analysis with a visible retry action", async () => {
    vi.mocked(api.overview).mockResolvedValue(overview);
    vi.mocked(api.analysis)
      .mockRejectedValueOnce(new Error("Analysis not found."))
      .mockResolvedValueOnce(analysis);
    const user = await ready();
    await user.click(screen.getByRole("button", { name: "FL-00017" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Analysis not found.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    await within(dialog).findByText("Class probabilities");
    expect(api.analysis).toHaveBeenCalledTimes(2);
  });
});
