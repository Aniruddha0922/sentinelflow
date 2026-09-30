# Data dictionary and evaluation protocol

## What a row means

A row is an **enriched traffic-window summary** for a source host, not a raw packet or a strictly defined five-tuple flow. The port fields describe representative connection endpoints within that window. Features such as distinct destination-port count aggregate several connections; failed login counts require authorized authentication-log enrichment. A packet capture alone does not automatically provide all nine features.

The educational generator does not simulate real hosts, timestamps, sessions, application protocols, or a physical network. The API records an **analysis timestamp**, not the traffic's original event time. Do not interpret the dashboard timeline as captured network activity.

| Feature | Meaning | Accepted range |
| --- | --- | --- |
| `duration_ms` | Observation/connection duration in milliseconds | 0–3,600,000 |
| `packets` | Packet count in the observation | 1–10,000,000 |
| `bytes_transferred` | Total transferred bytes | 0–1,000,000,000,000 |
| `src_port` | Representative source port; 0 can represent an unavailable port | 0–65,535 |
| `dst_port` | Representative destination port; 0 can represent an unavailable port | 0–65,535 |
| `failed_logins` | Failed authentication attempts joined to the observation window | 0–100,000 |
| `unique_dest_ports` | Distinct destination ports contacted by the source | 1–65,535 |
| `syn_ratio` | Fraction of observed packets with the TCP SYN flag (0 for non-TCP real observations) | 0–1 |
| `protocol` | Representative transport/network protocol | TCP, UDP, ICMP |

Bounds are validation limits, not a claim that every combination is physically plausible. The synthetic generator simplifies relationships among these fields. All features must be present. Do not invent missing values when adapting a real dataset; document a suitable feature mapping and retrain instead.

## Synthetic scenarios

`backend/app/dataset.py` uses NumPy's seeded generator. Class priors are 55% benign, 16% port scan, 14% brute force, and 15% denial of service. Actual finite-sample counts can differ from those proportions.

- **Benign:** varied web/service traffic, with occasional high-volume or automated activity to create overlap.
- **Port scan:** more destination ports, small payloads, often a larger SYN ratio.
- **Brute force:** more failed logins, often to authentication-related ports.
- **Denial of service:** larger packet counts over shorter intervals.

These are simplified illustrative patterns, not universal attack definitions. Because class labels directly select generating distributions, high performance on the generator is expected. The manually authored `data/sample_flows.csv` is an import demonstration, **not independent test data**. Its optional labels are discarded at inference time.

## Reproducible baseline experiment

Run from the project root using your installed virtual-environment Python:

```bash
python -m backend.app.evaluate --output reports/evaluation.json
```

On Windows without activating the environment, replace `python` with `.\.venv\Scripts\python.exe`; on macOS/Linux use `.venv/bin/python`.

1. Generate 3,000 examples with seed 42.
2. Perform one stratified 80/20 split using seed 42: 2,400 training, 600 holdout.
3. Fit one-hot protocol encoding on training data only. Numeric features pass through; Random Forest does not require scaling.
4. Fit 100 trees, maximum depth 12, minimum leaf size 3, class weighting `balanced_subsample`, seed 42. No hyperparameter selection on the holdout is performed.
5. Compare held-out accuracy and macro-F1 with a most-frequent-class dummy baseline. Report per-class precision/recall/F1/support and the full confusion matrix.
6. Compute global impurity-based feature importance, aggregating protocol dummy columns. This measure can favor high-cardinality features; use permutation importance in a future independent real-data experiment.
7. Compute benign-reference medians/mode **from training data only** for local single-feature sensitivity explanations.

The API trains the same deterministic model once per process at startup. The `/api/model` response and the CLI report are derived from that computation. The JSON report also records runtime versions; numerical results may vary with dependency versions. Tests verify consistency among the matrix, metrics, probability scores, and explanations rather than asserting a fabricated target accuracy.

## Research limitations and a defensible next step

A random split of synthetic observations is not a test of unseen networks or future attacks. There is no confidence interval, repeated cross-validation, temporal holdout, probability calibration, open-set detector, or external validation in this version.

For an extension, obtain a legally distributable intrusion-detection dataset (for example, an authorized CIC-IDS dataset), examine its license, document feature provenance and label mapping, remove identifiers/leaky columns, and create train/validation/test partitions by day or source scenario. Compare a dummy classifier, logistic regression, and Random Forest; tune only on training/validation, then evaluate the untouched test set once. Include false-positive rates, macro-F1, class imbalance, calibration, drift, and inference latency. Some current features will not exist in that dataset, so this requires a new adapter **and retraining**, not merely renaming CSV headers.
