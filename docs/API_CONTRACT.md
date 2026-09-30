# SentinelFlow API contract

Base URL: `/api`. All timestamps are UTC ISO 8601 strings. This is a local, single-user educational application; no authentication is provided. Do not expose it directly to the internet.

## Flow

```json
{"duration_ms":180.0,"packets":14,"bytes_transferred":6400,"src_port":52000,"dst_port":443,"failed_logins":0,"unique_dest_ports":1,"syn_ratio":0.1,"protocol":"TCP"}
```

Numeric bounds: duration_ms 0..3600000; packets 1..10000000; bytes_transferred 0..1000000000000; ports 0..65535; failed_logins 0..100000; unique_dest_ports 1..65535; syn_ratio 0..1. Protocol: TCP, UDP, ICMP. Unknown fields are rejected. All nine fields are required.

## Endpoints

- `GET /health`: `{ "status": "ok", "version": "1.0.0" }` (outside `/api`).
- `GET /api/overview`: `{ "total_flows": 0, "flagged_flows": 0, "high_risk_flows": 0, "average_risk": 0.0, "attack_distribution": [{"label":"benign","count":0}], "timeline": [{"hour":"2026-01-01T10:00:00+00:00","total":0,"flagged":0}], "recent_alerts": [Analysis] }`. Distribution includes all four labels, timeline groups persisted analyses by UTC hour (last 24 hours); totals cover all retained records.
- `GET /api/analyses?limit=25&offset=0&label=port_scan`: `{ "items": [Analysis], "total": 0 }`, newest first; optional label one of benign/port_scan/brute_force/dos, limit 1..100.
- `GET /api/analyses/{id}`: one Analysis or 404.
- `POST /api/analyze`: body `{ "flows": [Flow] }` (1..500), returns `{ "items": [Analysis], "count": 1 }`. Each item is persisted.
- `POST /api/demo`: body `{ "count": 40, "seed": 42 }` (count 1..100, seed 0..2147483647). Generates labeled synthetic examples but does NOT pass truth labels to the model. Returns `{ "items": [Analysis], "count": 40 }`. Re-running appends another batch.
- `POST /api/import`: multipart form `file`, UTF-8 CSV with exactly the Flow column names above (any order). Maximum 2 MiB and 500 rows. Returns `{ "items": [Analysis], "count": N }`. Rejects entire batch on invalid input (422), oversized upload (413). Optional `label` column is accepted and ignored, allowing the bundled demo dataset.
- `GET /api/export`: CSV download of the most recent up to 10,000 persisted analyses, with id, timestamp, source, predicted_label, confidence, risk_score and input feature columns.
- `GET /api/model`: ModelReport (below).
- `DELETE /api/analyses`: clears saved analyses only; `{ "deleted": N }`. UI must request confirmation.

## Analysis

```json
{
  "id":1,"timestamp":"2026-01-01T10:00:00+00:00","source":"manual",
  "predicted_label":"port_scan","confidence":0.93,"risk_score":98.1,
  "probabilities":{"benign":0.019,"port_scan":0.93,"brute_force":0.031,"dos":0.02},
  "flow":{"duration_ms":180.0,"packets":14,"bytes_transferred":6400,"src_port":52000,"dst_port":443,"failed_logins":0,"unique_dest_ports":100,"syn_ratio":0.9,"protocol":"TCP"},
  "explanations":[{"feature":"unique_dest_ports","value":100,"baseline":2,"impact":31.2,"description":"Replacing unique_dest_ports with the benign reference lowers estimated malicious probability by 31.2 percentage points."}]
}
```

`source`: manual, demo, csv. Confidence/probabilities: 0..1. Risk: 0..100 = `(1 - P(benign)) * 100`; this is a model score, not a validated real-world threat likelihood. An explanation impact is the percentage-point drop in risk after replacing one feature with its benign-training median (numeric) or mode (protocol), retaining other inputs. Return up to four positive effects in descending order. Effects are model sensitivities, not causal or SHAP attributions. `predicted_label` is the highest-probability class.

## ModelReport

```json
{
  "name":"Random Forest","version":"1.0.0","dataset":"Seeded synthetic network flows",
  "training_samples":2400,"test_samples":600,"seed":42,
  "accuracy":0.95,"macro_f1":0.94,
  "labels":["benign","port_scan","brute_force","dos"],
  "confusion_matrix":[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
  "per_class":[{"label":"benign","precision":0.9,"recall":0.9,"f1":0.9,"support":240}],
  "feature_importance":[{"feature":"packets","importance":0.3}],
  "limitations":["..."]
}
```

Matrix rows = actual class, columns = predicted class, in `labels` order. Metrics are computed on a deterministic held-out split, never hard-coded. Do not present synthetic scores as real-network validation.

Errors use FastAPI's `{"detail": "message"}` or validation-error list. Frontend should display a readable error and recovery action. Vite proxies `/api` and `/health` to `http://127.0.0.1:8000` in development; production FastAPI serves the built frontend from `frontend/dist` when available.
