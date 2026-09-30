import type {
  Analysis,
  AnalysisPage,
  BatchResult,
  Flow,
  Label,
  ModelReport,
  Overview,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorDetail(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = body.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item: { loc?: (string | number)[]; msg?: string }) => {
          const location = item.loc
            ?.filter((part) => part !== "body")
            .join(" → ");
          return `${location ? `${location}: ` : ""}${item.msg || "Invalid value"}`;
        })
        .join("; ");
    }
  }
  return status >= 500
    ? `The request failed (${status}). Check that the local backend is running on port 8000, then try again.`
    : `The request failed (${status}). Please try again.`;
}

async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError"
    )
      throw error;
    throw new ApiError(
      "Cannot reach the local API. Check that the backend is running on port 8000, then try again.",
      0,
    );
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(errorDetail(body, response.status), response.status);
  }
  return response;
}

async function json<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "The API returned an unreadable response. Check the backend and try again.",
      response.status,
    );
  }
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: (signal?: AbortSignal) =>
    json<{ status: string; version: string }>("/health", { signal }),
  overview: (signal?: AbortSignal) =>
    json<Overview>("/api/overview", { signal }),
  analyses: (
    limit: number,
    offset: number,
    label?: Label,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (label) params.set("label", label);
    return json<AnalysisPage>(`/api/analyses?${params}`, { signal });
  },
  analysis: (id: number, signal?: AbortSignal) =>
    json<Analysis>(`/api/analyses/${id}`, { signal }),
  analyze: (flows: Flow[]) =>
    json<BatchResult>("/api/analyze", post({ flows })),
  demo: (count = 40, seed = 42) =>
    json<BatchResult>("/api/demo", post({ count, seed })),
  importCsv: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return json<BatchResult>("/api/import", { method: "POST", body });
  },
  model: (signal?: AbortSignal) => json<ModelReport>("/api/model", { signal }),
  clear: () => json<{ deleted: number }>("/api/analyses", { method: "DELETE" }),
  exportCsv: async () => (await request("/api/export")).blob(),
};

export function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
