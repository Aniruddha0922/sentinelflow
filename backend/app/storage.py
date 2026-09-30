"""SQLite persistence with per-operation connections and atomic batch insertion."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .schemas import LABELS


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    source TEXT NOT NULL,
                    predicted_label TEXT NOT NULL,
                    risk_score REAL NOT NULL,
                    payload TEXT NOT NULL
                )
            """)
            db.execute("CREATE INDEX IF NOT EXISTS idx_label_id ON analyses(predicted_label, id)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON analyses(timestamp)")
            db.execute("PRAGMA user_version=1")

    def insert(self, results: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
        timestamp = datetime.now(UTC).isoformat(timespec="milliseconds")
        saved = []
        with self.connect() as db:
            for result in results:
                item = {**result, "timestamp": timestamp, "source": source}
                cursor = db.execute(
                    "INSERT INTO analyses(timestamp, source, predicted_label, risk_score, payload) VALUES(?, ?, ?, ?, ?)",
                    (
                        timestamp,
                        source,
                        item["predicted_label"],
                        item["risk_score"],
                        json.dumps(item),
                    ),
                )
                saved.append({**item, "id": cursor.lastrowid})
        return saved

    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        return {**json.loads(row["payload"]), "id": row["id"]}

    def list(self, limit: int, offset: int = 0, label: str | None = None) -> dict[str, Any]:
        where = " WHERE predicted_label = ?" if label else ""
        params: tuple = (label,) if label else ()
        with self.connect() as db:
            # Keep count and results in one read snapshot under concurrent writers.
            db.execute("BEGIN")
            total = db.execute("SELECT COUNT(*) FROM analyses" + where, params).fetchone()[0]
            rows = db.execute(
                "SELECT id, payload FROM analyses" + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
        return {"items": [self._decode(row) for row in rows], "total": total}

    def get(self, identifier: int) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT id, payload FROM analyses WHERE id = ?", (identifier,)
            ).fetchone()
        return self._decode(row) if row else None

    def clear(self) -> int:
        with self.connect() as db:
            cursor = db.execute("DELETE FROM analyses")
            return cursor.rowcount

    def overview(self) -> dict[str, Any]:
        current_hour = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        start = current_hour - timedelta(hours=23)
        with self.connect() as db:
            db.execute("BEGIN")
            stats = db.execute("""
                SELECT COUNT(*) AS total_flows,
                    COALESCE(SUM(predicted_label != 'benign'), 0) AS flagged_flows,
                    COALESCE(SUM(risk_score >= 80), 0) AS high_risk_flows,
                    COALESCE(AVG(risk_score), 0) AS average_risk
                FROM analyses
            """).fetchone()
            distribution = dict(
                db.execute(
                    "SELECT predicted_label, COUNT(*) FROM analyses GROUP BY predicted_label"
                ).fetchall()
            )
            hourly = db.execute(
                """
                SELECT substr(timestamp, 1, 13) AS hour, COUNT(*) AS total,
                    SUM(predicted_label != 'benign') AS flagged
                FROM analyses WHERE timestamp >= ? GROUP BY hour
            """,
                (start.isoformat(timespec="milliseconds"),),
            ).fetchall()
            alerts = db.execute("""
                SELECT id, payload FROM analyses WHERE predicted_label != 'benign'
                ORDER BY id DESC LIMIT 6
            """).fetchall()
        hour_map = {row["hour"]: row for row in hourly}
        timeline = []
        for index in range(24):
            hour = start + timedelta(hours=index)
            row = hour_map.get(hour.isoformat()[:13])
            timeline.append(
                {
                    "hour": hour.isoformat(),
                    "total": row["total"] if row else 0,
                    "flagged": row["flagged"] if row else 0,
                }
            )
        return {
            **dict(stats),
            "average_risk": round(stats["average_risk"], 3),
            "attack_distribution": [
                {"label": label, "count": distribution.get(label, 0)} for label in LABELS
            ],
            "timeline": timeline,
            "recent_alerts": [self._decode(row) for row in alerts],
        }
