import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { analysis, emptyOverview } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("API contract", () => {
  it("sends all nine flow features in the required flows envelope", async () => {
    respond({ items: [analysis], count: 1 });
    const result = await api.analyze([analysis.flow]);
    expect(result.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flows: [analysis.flow] }),
    });
  });

  it("uses relative API URLs, and /health outside the API prefix", async () => {
    respond(emptyOverview);
    respond({ status: "ok", version: "1.0.0" });
    await api.overview();
    await api.health();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/overview", {
      signal: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/health", {
      signal: undefined,
    });
  });

  it("uses server-side pagination and omits absent filters", async () => {
    respond({ items: [], total: 0 });
    respond({ items: [], total: 0 });
    await api.analyses(10, 20, "port_scan");
    await api.analyses(10, 0);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/analyses?limit=10&offset=20&label=port_scan",
    );
    expect(fetchMock.mock.calls[1][0]).toBe("/api/analyses?limit=10&offset=0");
  });

  it("requests individual saved analyses", async () => {
    respond(analysis);
    expect(await api.analysis(17)).toEqual(analysis);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/analyses/17");
  });

  it("generates reproducible demos without sending truth labels", async () => {
    respond({ items: [], count: 40 });
    await api.demo();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/demo",
      expect.objectContaining({
        method: "POST",
        body: '{"count":40,"seed":42}',
      }),
    );
  });

  it("uploads CSV as multipart file and lets the browser set the boundary", async () => {
    respond({ items: [analysis], count: 1 });
    const file = new File(["duration_ms,packets\n180,14"], "flows.csv", {
      type: "text/csv",
    });
    await api.importCsv(file);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/import");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("file")).toBe(file);
    expect(options?.headers).toBeUndefined();
  });

  it("surfaces readable FastAPI field-validation errors", async () => {
    respond(
      {
        detail: [
          {
            loc: ["body", "flows", 0, "packets"],
            msg: "Input should be greater than 0",
          },
        ],
      },
      422,
    );
    await expect(api.analyze([analysis.flow])).rejects.toThrow(
      "flows → 0 → packets: Input should be greater than 0",
    );
  });

  it("preserves backend error messages and status codes", async () => {
    respond({ detail: "CSV file is too large" }, 413);
    await expect(api.importCsv(new File(["x"], "large.csv"))).rejects.toEqual(
      new ApiError("CSV file is too large", 413),
    );
  });

  it("gives a recovery instruction when the API cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.overview()).rejects.toThrow(
      "Check that the backend is running on port 8000",
    );
  });

  it("does not turn intentional cancellation into an offline error", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(api.overview()).rejects.toBe(abort);
  });

  it("handles non-JSON server errors and malformed success responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>unavailable</html>", { status: 503 }),
    );
    await expect(api.model()).rejects.toThrow("The request failed (503)");
    fetchMock.mockResolvedValueOnce(
      new Response("<html>not an API</html>", { status: 200 }),
    );
    await expect(api.overview()).rejects.toThrow("unreadable response");
  });

  it("downloads export data as a blob", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("id,predicted_label\n17,port_scan", {
        headers: { "Content-Type": "text/csv" },
      }),
    );
    const blob = await api.exportCsv();
    expect(blob.size).toBe("id,predicted_label\n17,port_scan".length);
    expect(blob.type).toBe("text/csv");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/export");
  });

  it("clears analyses with DELETE, not model data", async () => {
    respond({ deleted: 42 });
    expect(await api.clear()).toEqual({ deleted: 42 });
    expect(fetchMock).toHaveBeenCalledWith("/api/analyses", {
      method: "DELETE",
    });
  });
});
