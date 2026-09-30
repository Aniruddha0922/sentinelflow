"""Shared validation boundaries for HTTP, CSV and generated traffic."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LABELS = ("benign", "port_scan", "brute_force", "dos")
Label = Literal["benign", "port_scan", "brute_force", "dos"]


class Flow(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    duration_ms: float = Field(ge=0, le=3_600_000)
    packets: int = Field(ge=1, le=10_000_000)
    bytes_transferred: int = Field(ge=0, le=1_000_000_000_000)
    src_port: int = Field(ge=0, le=65_535)
    dst_port: int = Field(ge=0, le=65_535)
    failed_logins: int = Field(ge=0, le=100_000)
    unique_dest_ports: int = Field(ge=1, le=65_535)
    syn_ratio: float = Field(ge=0, le=1)
    protocol: Literal["TCP", "UDP", "ICMP"]


FEATURES = tuple(Flow.model_fields)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flows: list[Flow] = Field(min_length=1, max_length=500)


class DemoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    count: int = Field(default=40, ge=1, le=100)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)


class Explanation(BaseModel):
    feature: str
    value: float | int | str
    baseline: float | int | str
    impact: float
    description: str


class Analysis(BaseModel):
    id: int
    timestamp: str
    source: Literal["manual", "demo", "csv"]
    predicted_label: Label
    confidence: float
    risk_score: float
    probabilities: dict[str, float]
    flow: Flow
    explanations: list[Explanation]


class AnalysisBatch(BaseModel):
    items: list[Analysis]
    count: int


class AnalysisPage(BaseModel):
    items: list[Analysis]
    total: int
