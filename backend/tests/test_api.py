import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.app.main import MAX_CSV_BYTES, create_app
from backend.app.schemas import FEATURES, LABELS


def csv_bytes(rows, headers=FEATURES):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def upload(client, content):
    return client.post("/api/import", files={"file": ("flows.csv", content, "text/csv")})


def test_health_and_empty_dashboard(client):
    assert client.get("/health").json() == {"status": "ok", "version": "1.0.0"}
    overview = client.get("/api/overview").json()
    assert overview["total_flows"] == overview["flagged_flows"] == 0
    assert overview["average_risk"] == 0
    assert len(overview["timeline"]) == 24
    assert len(overview["attack_distribution"]) == 4
    assert client.get("/api/analyses").json() == {"items": [], "total": 0}
    assert client.get("/api/analyses/999").status_code == 404
    assert client.get("/").json()["name"] == "SentinelFlow"


def test_manual_analysis_persisted_with_consistent_scores(client, flow):
    response = client.post("/api/analyze", json={"flows": [flow]})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["source"] == "manual"
    assert item["flow"] == flow
    assert item["predicted_label"] == max(item["probabilities"], key=item["probabilities"].get)
    assert sum(item["probabilities"].values()) == pytest.approx(1, abs=0.00001)
    assert item["risk_score"] == pytest.approx(
        100 * (1 - item["probabilities"]["benign"]), abs=0.001
    )
    assert client.get(f"/api/analyses/{item['id']}").json() == item
    assert client.get("/api/overview").json()["total_flows"] == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("packets", 0),
        ("packets", 1.5),
        ("packets", 10_000_001),
        ("duration_ms", -1),
        ("duration_ms", "NaN"),
        ("duration_ms", "inf"),
        ("src_port", 65536),
        ("dst_port", -1),
        ("failed_logins", -1),
        ("unique_dest_ports", 0),
        ("syn_ratio", 1.1),
        ("syn_ratio", -0.1),
        ("protocol", "HTTP"),
        ("bytes_transferred", -1),
        ("unexpected", 1),
    ],
)
def test_invalid_flow_is_rejected_atomically(client, flow, field, value):
    invalid = {**flow, field: value}
    assert client.post("/api/analyze", json={"flows": [flow, invalid]}).status_code == 422
    assert client.get("/api/analyses").json()["total"] == 0


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_json_does_not_crash_error_response(client, flow, value):
    payload = json.dumps({"flows": [{**flow, "duration_ms": value}]})
    response = client.post(
        "/api/analyze", content=payload, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "duration_ms"


def test_analysis_batch_bounds(client, flow):
    assert client.post("/api/analyze", json={"flows": []}).status_code == 422
    assert client.post("/api/analyze", json={"flows": [flow] * 501}).status_code == 422
    assert client.post("/api/analyze", json={"flows": [{}]}).status_code == 422


def test_demo_filters_pagination_and_overview(client):
    items = client.post("/api/demo", json={"count": 40, "seed": 99}).json()["items"]
    assert len(items) == 40
    assert all(item["source"] == "demo" for item in items)
    overview = client.get("/api/overview").json()
    assert overview["total_flows"] == 40
    assert overview["flagged_flows"] == sum(item["predicted_label"] != "benign" for item in items)
    assert overview["high_risk_flows"] == sum(item["risk_score"] >= 80 for item in items)
    assert sum(point["total"] for point in overview["timeline"]) == 40
    assert sum(entry["count"] for entry in overview["attack_distribution"]) == 40
    assert all(item["predicted_label"] != "benign" for item in overview["recent_alerts"])
    page = client.get("/api/analyses?limit=3&offset=2").json()
    assert page["total"] == 40
    assert [item["id"] for item in page["items"]] == [item["id"] for item in items[::-1][2:5]]
    for label in LABELS:
        page = client.get("/api/analyses", params={"label": label}).json()
        assert all(item["predicted_label"] == label for item in page["items"])
        assert page["total"] == sum(item["predicted_label"] == label for item in items)


@pytest.mark.parametrize(
    "url",
    [
        "/api/analyses?limit=0",
        "/api/analyses?limit=101",
        "/api/analyses?offset=-1",
        "/api/analyses?label=unknown",
        "/api/analyses?label=';DROP TABLE analyses;--",
    ],
)
def test_query_boundaries(client, url):
    assert client.get(url).status_code == 422


@pytest.mark.parametrize("body", [{"count": 0}, {"count": 101}, {"seed": -1}, {"seed": 2147483648}])
def test_demo_bounds(client, body):
    assert client.post("/api/demo", json=body).status_code == 422


def test_csv_valid_reordered_bom_and_optional_truth_label(client, flow):
    content = b"\xef\xbb\xbf" + csv_bytes(
        [{**flow, "label": "untrusted-truth"}], ["label", *reversed(FEATURES)]
    )
    response = upload(client, content)
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["source"] == "csv"
    assert item["flow"] == flow
    assert "untrusted-truth" not in response.text


def test_csv_validation_is_atomic_and_useful(client, flow):
    response = upload(client, csv_bytes([flow, {**flow, "syn_ratio": 2}]))
    assert response.status_code == 422
    assert "row 3, syn_ratio" in response.json()["detail"]
    assert client.get("/api/analyses").json()["total"] == 0


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"packets,protocol\n1,TCP\n",
        b"\xff\xfe",
        (",".join(FEATURES) + "\n").encode(),
        (",".join(FEATURES) + ",packets\n").encode(),
        (",".join(FEATURES) + "\n1,2\n").encode(),
        (",".join(FEATURES) + '\n"unterminated\n').encode(),
        (",".join(FEATURES) + "\n1,1,1,1,1,1,1,0.5,TCP,extra\n").encode(),
    ],
)
def test_bad_csv(client, content):
    assert upload(client, content).status_code == 422


def test_csv_limits(client, flow):
    assert upload(client, b"x" * (MAX_CSV_BYTES + 1)).status_code == 413
    assert upload(client, csv_bytes([flow] * 501)).status_code == 422
    assert client.get("/api/analyses").json()["total"] == 0


def test_chunked_oversized_body_rejected(client):
    chunks = (b"x" * 65536 for _ in range(35))
    assert (
        client.post(
            "/api/analyze", content=chunks, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )


def test_export_and_clear(client, flow):
    client.post("/api/analyze", json={"flows": [flow]})
    response = client.get("/api/export")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 1
    assert rows[0]["protocol"] == "TCP"
    assert rows[0]["source"] == "manual"
    assert client.delete("/api/analyses").json() == {"deleted": 1}
    assert client.delete("/api/analyses").json() == {"deleted": 0}
    assert client.get("/api/overview").json()["total_flows"] == 0


def test_security_headers_and_browser_origin_guard(client, flow):
    response = client.get("/api/overview")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    response = client.post(
        "/api/analyze", json={"flows": [flow]}, headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403
    assert client.delete("/api/analyses", headers={"Origin": "null"}).status_code == 403
    response = client.post(
        "/api/analyze", json={"flows": [flow]}, headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_database_survives_restart(tmp_path, flow):
    path = tmp_path / "persistent.db"
    with TestClient(create_app(path)) as first:
        first.post("/api/analyze", json={"flows": [flow]})
    with TestClient(create_app(path)) as second:
        assert second.get("/api/analyses").json()["total"] == 1


def test_parallel_writes_are_not_lost(client, flow):
    def write_one(_):
        return client.post("/api/analyze", json={"flows": [flow]}).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(write_one, range(8))) == [200] * 8
    assert client.get("/api/analyses").json()["total"] == 8


def test_static_frontend_and_unknown_api(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>SentinelFlow</h1>", encoding="utf-8")
    with TestClient(create_app(tmp_path / "test.db", static_dir=dist)) as browser:
        assert "<h1>SentinelFlow</h1>" in browser.get("/").text
        assert browser.get("/api/missing").status_code == 404
        assert browser.get("/health").json()["status"] == "ok"
        assert browser.get("/docs").status_code == 200
