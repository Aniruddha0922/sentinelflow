"""FastAPI application. Run: python -m uvicorn backend.app.main:app --reload."""

import csv
import io
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Receive, Scope, Send

from .dataset import generate_flows
from .ml import get_model
from .schemas import (
    FEATURES,
    Analysis,
    AnalysisBatch,
    AnalysisPage,
    AnalyzeRequest,
    DemoRequest,
    Flow,
    Label,
)
from .storage import Store

ROOT = Path(__file__).resolve().parents[2]
MAX_CSV_BYTES = 2 * 1024 * 1024
DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"
)


class BodySizeLimit:
    """Bound even chunked request bodies before JSON or multipart parsing."""

    def __init__(self, app: ASGIApp, limit: int = MAX_CSV_BYTES + 65536) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.limit:
                await JSONResponse(
                    status_code=413, content={"detail": "Request body is too large."}
                )(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        sent = False

        async def replay() -> dict:
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)


def parse_csv(content: bytes) -> list[Flow]:
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(413, "CSV exceeds the 2 MiB limit.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(422, "CSV must be UTF-8 encoded.") from error
    try:
        reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
        headers = reader.fieldnames or []
        if len(set(headers)) != len(headers) or set(headers) not in (
            set(FEATURES),
            {*FEATURES, "label"},
        ):
            raise HTTPException(
                422,
                "CSV headers must be the nine flow features, with an optional label column. See data/sample_flows.csv.",
            )
        flows = []
        for number, row in enumerate(reader, start=2):
            if len(flows) >= 500:
                raise HTTPException(422, "CSV is limited to 500 data rows per import.")
            if None in row or any(value is None for value in row.values()):
                raise HTTPException(422, f"CSV row {number} has an incorrect number of columns.")
            row.pop("label", None)
            try:
                flows.append(Flow.model_validate(row))
            except ValidationError as error:
                first = error.errors()[0]
                field = ".".join(map(str, first["loc"]))
                raise HTTPException(422, f"CSV row {number}, {field}: {first['msg']}") from error
        if not flows:
            raise HTTPException(422, "CSV must contain at least one data row.")
        return flows
    except csv.Error as error:
        raise HTTPException(
            422, "Malformed CSV. Check delimiters, quotes and field lengths."
        ) from error


def create_app(db_path: str | Path | None = None, static_dir: Path | None = None) -> FastAPI:
    store = Store(
        Path(
            db_path or os.environ.get("SENTINEL_DB_PATH", ROOT / "backend" / "data" / "sentinel.db")
        )
    )
    origins = [
        origin.strip()
        for origin in os.environ.get("SENTINEL_CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
        if origin.strip()
    ]

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        store.initialize()
        application.state.model = await run_in_threadpool(get_model)
        yield

    application = FastAPI(
        title="SentinelFlow API",
        version="1.0.0",
        description="Local, educational network-flow analytics. Synthetic benchmark, not a production IDS.",
        lifespan=lifespan,
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, error: RequestValidationError):
        # Do not echo uploaded data; also keep non-finite JSON numbers out of error serialization.
        details = [{key: item[key] for key in ("type", "loc", "msg")} for item in error.errors()]
        return JSONResponse(status_code=422, content={"detail": details})

    application.state.store = store
    application.add_middleware(BodySizeLimit)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @application.middleware("http")
    async def local_browser_guard(request: Request, call_next):
        # CORS alone does not prevent a malicious website from submitting a form.
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin not in origins:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Origin is not allowed. Configure SENTINEL_CORS_ORIGINS for your local UI."
                },
            )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def analyze_and_save(flows: list[Flow], source: str) -> dict:
        items = store.insert(application.state.model.predict(flows), source)
        return {"items": items, "count": len(items)}

    @application.get("/health", tags=["System"])
    def health():
        return {"status": "ok", "version": "1.0.0"}

    @application.get("/api/model", tags=["Model"])
    def model_report():
        return application.state.model.report

    @application.get("/api/overview", tags=["Analytics"])
    def overview():
        return store.overview()

    @application.get("/api/analyses", response_model=AnalysisPage, tags=["Analytics"])
    def analyses(
        limit: Annotated[int, Query(ge=1, le=100)] = 25,
        offset: Annotated[int, Query(ge=0)] = 0,
        label: Label | None = None,
    ):
        return store.list(limit, offset, label)

    @application.get("/api/analyses/{identifier}", response_model=Analysis, tags=["Analytics"])
    def analysis(identifier: int):
        item = store.get(identifier)
        if item is None:
            raise HTTPException(404, "Analysis not found.")
        return item

    @application.post("/api/analyze", response_model=AnalysisBatch, tags=["Analysis"])
    def analyze(body: AnalyzeRequest):
        return analyze_and_save(body.flows, "manual")

    @application.post("/api/demo", response_model=AnalysisBatch, tags=["Analysis"])
    def demo(body: DemoRequest):
        flows, _ = generate_flows(body.count, body.seed)
        return analyze_and_save(flows, "demo")

    @application.post("/api/import", response_model=AnalysisBatch, tags=["Analysis"])
    async def import_csv(file: Annotated[UploadFile, File()]):
        try:
            content = await file.read(MAX_CSV_BYTES + 1)
        finally:
            await file.close()
        flows = parse_csv(content)
        return await run_in_threadpool(analyze_and_save, flows, "csv")

    @application.get("/api/export", tags=["Analytics"])
    def export():
        output = io.StringIO(newline="")
        columns = [
            "id",
            "timestamp",
            "source",
            "predicted_label",
            "confidence",
            "risk_score",
            *FEATURES,
        ]
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        for item in store.list(10_000)["items"]:
            writer.writerow(
                {**{key: item[key] for key in columns if key not in FEATURES}, **item["flow"]}
            )
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="sentinelflow-analyses.csv"'},
        )

    @application.delete("/api/analyses", tags=["Analytics"])
    def clear():
        return {"deleted": store.clear()}

    dist = static_dir if static_dir is not None else ROOT / "frontend" / "dist"
    if dist.is_dir() and (dist / "index.html").is_file():
        application.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    else:

        @application.get("/", include_in_schema=False)
        def index():
            return {
                "name": "SentinelFlow",
                "docs": "/docs",
                "message": "Start the frontend with npm run dev in frontend/, or run npm run build there and restart this API.",
            }

    return application


app = create_app()
