from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


@pytest.fixture
def flow():
    return {
        "duration_ms": 180.0,
        "packets": 14,
        "bytes_transferred": 6400,
        "src_port": 52000,
        "dst_port": 443,
        "failed_logins": 0,
        "unique_dest_ports": 1,
        "syn_ratio": 0.1,
        "protocol": "TCP",
    }


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(tmp_path / "test.db", static_dir=tmp_path / "no-frontend")
    with TestClient(app) as client:
        yield client
