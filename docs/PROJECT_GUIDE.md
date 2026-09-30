# SentinelFlow — final-year project guide

## 1. Scope and objectives

**Research question:** How can a local application turn structured network-flow summaries into inspectable multi-class predictions, while clearly communicating the limits of synthetic-data evaluation?

SentinelFlow demonstrates an end-to-end software and machine-learning workflow. It is not a deployed intrusion-detection system and does not observe a live network. A flow is a supplied feature summary, not a captured packet stream. There is no authentication, so run the application only on your own machine using the documented loopback bindings.

### Measurable objectives

1. Accept nine validated flow features through manual JSON submission and bounded CSV import, with readable input errors.
2. Classify a flow as `benign`, `port_scan`, `brute_force`, or `dos`, reporting all class probabilities and the predicted label.
3. Train a reproducible Random Forest and compute metrics on a held-out subset that is not used for training.
4. Explain selected predictions through explicit, reproducible single-feature replacements against benign-training references.
5. Persist analyses and provide history, filtering, summary views, and a bounded CSV export.
6. Supply repeatable setup, tests, a containerized local demonstration, and documentation that distinguishes observed evidence from future work.

Success is a functioning, tested, honestly evaluated educational workflow—not a promised accuracy threshold or proof of protection from attacks.

## 2. Modules and responsibilities

| Module | Responsibilities | Evidence to demonstrate |
| --- | --- | --- |
| React/TypeScript interface | Dashboard, submission/import workflows, analysis inspection, model report, readable feedback | Successful requests and recovery from validation failures |
| FastAPI API | Enforce schema/bounds, coordinate inference, expose documented endpoints | `/docs`, health response, API test results |
| Synthetic data/model | Seeded data generation, deterministic training, class probabilities, computed evaluation | `GET /api/model`, split sizes, repeatability |
| Explanation module | Replace one feature with a benign-training median/mode and recompute risk | Inspect one prediction and compare the documented calculation |
| SQLite persistence | Save input/output records, paginate/filter, summarize, export, clear history | Records survive restart; confirmed clear removes analyses |
| Supporting tooling | Cross-platform development startup, Docker image, local-only Compose, CI | Fresh setup, test/build logs, health check |

The canonical interface is [`API_CONTRACT.md`](API_CONTRACT.md). Do not introduce a second incompatible schema in a presentation or report.

### Data path

1. Receive a manual flow batch, an explicitly requested synthetic demo, or an uploaded CSV.
2. Validate all required fields and bounds. A CSV import is all-or-nothing; one invalid row prevents the entire batch from being saved.
3. Compute class probabilities and choose the maximum-probability class.
4. Compute risk and positive single-feature ablation effects.
5. Persist feature summaries and predictions to SQLite with UTC timestamps and source (`manual`, `demo`, or `csv`).
6. Read saved results into the dashboard, history, and export views. No hidden collection runs in the background.

## 3. Feature and prediction semantics

The input fields are `duration_ms`, `packets`, `bytes_transferred`, `src_port`, `dst_port`, `failed_logins`, `unique_dest_ports`, `syn_ratio`, and `protocol` (`TCP`, `UDP`, or `ICMP`). Numeric bounds are in the contract.

`failed_logins` and `unique_dest_ports` require context beyond many ordinary individual flow records; future real-data work must specify how these aggregates are derived and over what time window. `syn_ratio` also needs a consistent definition and handling for non-TCP flows. Do not assume a public dataset maps directly to these fields.

For probabilities `P(class)`:

- `predicted_label = argmax P(class)`.
- `confidence = P(predicted_label)`.
- `risk_score = 100 × (1 - P(benign))`.

Risk is a ranking-oriented model score, not an independently validated threat probability. Do not conflate high confidence with high risk: a strongly benign prediction can have high confidence and low risk.

### Explainability method

For a candidate feature, replace its value with the benign **training-set** median (numeric) or mode (protocol), keeping all other features unchanged. Calculate:

```text
impact = original risk score - risk score after replacement
```

Report up to four positive impacts in descending order, measured in percentage points. A non-positive change is not presented as supporting maliciousness. An empty positive explanation list is valid.

This method is feature ablation, not SHAP and not a causal intervention. Correlated fields and unrealistic substituted combinations can make the result misleading. Impacts do not generally add up to the score, and a feature's local impact is different from its global Random Forest importance.

## 4. Current evaluation protocol

### Reproducible synthetic experiment

1. Record the source revision, Python version, dependency versions, and seed with your report.
2. Use the implementation's deterministic set of **3,000 synthetic examples**, seed **42**, with **2,400 training** and **600 held-out** examples.
3. Fit the model and any learned preprocessing/reference values on training data only. Explainability reference medians/modes must not use held-out data.
4. Obtain the actual report from `GET /api/model`; keep a copy alongside your experiment notes. Do not transcribe example scores from the contract as measured results.
5. Report accuracy, macro-F1, per-class precision/recall/F1 and support. Explain the confusion matrix: rows are actual classes, columns predicted classes, both ordered by the report's `labels` list.
6. Inspect false positives and false negatives rather than presenting only a summary number. Discuss whether a class with high support masks poor performance on another class.
7. Repeat on the same revision/environment to check determinism. If results differ, investigate dependency versions, randomness, or data changes rather than choosing the more favorable run.

Both sides of this split come from the same synthetic generator. A hold-out split prevents fitting directly to those examples, but does not establish independence from the generator's assumptions. High scores may mostly show that the forest recovered simple constructed rules.

### What is not an evaluation set

- `data/sample_flows.csv` is a small, manually authored demonstration. Its labels communicate intended scenarios, not audited ground truth or guaranteed predictions.
- `/api/demo` is for the UI demonstration. Truth labels are not supplied as model features. Repeated seeded demo batches may repeat examples and append more records; they are not an independent benchmark.
- Dashboard distributions describe accumulated predictions, not verified incident counts or the prevalence of attacks in a real organization.
- The contract's illustrative JSON is a schema example, not an experimental result.

### Software verification

Run the commands in the [README](../README.md#tests-and-build), record the actual test/build output, and review what the current test suite covers. A useful manual acceptance checklist is:

- Empty-state screens show useful next actions without invented data.
- A valid manual flow persists and appears in history; invalid fields receive a readable error.
- The sample CSV imports, while an invalid row rejects an entire batch without a partial save.
- CSV size/row limits and request limits are enforced; unexpected columns are rejected except optional CSV `label`.
- History filtering, pagination, overview totals, and CSV export agree with saved records.
- Records persist after restart; deleting records requires a UI confirmation and does not retrain/erase the model.
- Model probabilities are valid, risk matches the documented formula, and matrix orientation is explained correctly.
- Errors can be recovered from, keyboard navigation is usable, and narrow-screen layouts remain readable.
- The launcher stops both servers with Ctrl+C, and Compose publishes only loopback port 8000.

Treat this checklist as items to verify, not as a claim that each already has automated coverage. If measuring import/inference latency, record hardware, batch size, warm-up, and measurement method; do not report unmeasured throughput or call a refresh “real time.”

## 5. Suggested presentation walkthrough (8–10 minutes)

1. **Problem and boundaries (1 minute):** Explain flow classification and the four labels. State upfront: synthetic data, no live collection, no authentication, local educational use.
2. **Architecture (1 minute):** Show the UI → API → model/explanations → SQLite path. Distinguish developer Vite hosting from the single-service built UI.
3. **Demonstration (2 minutes):** Start with an empty or clearly identified existing database. Generate a demo batch and import the sample CSV. Explain that counts grow because these actions save records.
4. **Prediction inspection (2 minutes):** Open a flagged result, distinguish confidence from risk, and interpret a positive ablation in percentage points. Submit a changed feature as a new flow; do not promise its predicted label beforehand.
5. **Evaluation (1–2 minutes):** Show the current computed model report, split sizes, macro-F1, per-class recall, and matrix orientation. Explicitly say why synthetic hold-out performance is not real-world validation.
6. **Engineering and conclusion (1–2 minutes):** Demonstrate validation feedback, saved history/export, and test/build evidence. Close with ethical limitations and a realistic real-data evaluation plan.

Before presenting, install dependencies, run tests/build, check both ports, and verify the chosen environment works offline after installation. Avoid dependency downloads during the presentation. Use only genuine screenshots from your own running application and identify the scenario/time they depict. The README includes a genuine synthetic-demo screenshot from the running application; it is illustrative, not real-network evidence. The reproducible report is in `reports/evaluation.json`.

Suggested report chapters: introduction and scope; related work; requirements and threat/ethics boundaries; architecture; data generation and feature definitions; model and explanation method; software implementation; evaluation and error analysis; limitations; future work.

## 6. Future work: real datasets, done carefully

These are proposed extensions, **not current capabilities**:

1. **Choose an authorized source.** Evaluate public, licensed flow datasets or obtain documented permission for collection. Check license terms, known labeling defects, age, and relevance before naming a dataset as suitable.
2. **Define the unit of observation.** Document flow direction, aggregation windows, protocol semantics, and units. Map all nine fields explicitly. If the source lacks login failures or destination-port aggregates, derive them only from available authorized evidence or revise/retrain the feature contract; never invent those values.
3. **Prevent leakage.** Deduplicate before splitting and keep related hosts, sessions, capture runs, or time periods together. Fit encoders, imputers, scalers, reference values, and any feature selection on training data only. Prefer time-based or group-separated evaluation to random rows from the same capture.
4. **Use train/validation/test separation.** Tune hyperparameters and operating thresholds on training/validation only; freeze them before final test evaluation. Keep a separate final test set rather than repeatedly optimizing against it.
5. **Add baselines and uncertainty.** Compare with a majority-class predictor, interpretable rules, and a simple classifier. Report class balance, per-class errors, confidence intervals where appropriate, and results across seeds/datasets—not only a best score.
6. **Study operating tradeoffs.** Measure false positives on realistic benign traffic, precision/recall under imbalance, calibration, and degradation across time/environments. Evaluate unknown attacks separately; this closed-set model does not guarantee their detection.
7. **Evaluate explanations.** Check stability under small input changes, plausibility of reference substitutions, and the effect of correlated features. Compare additional explanation methods without turning model attribution into a causal claim.
8. **Plan privacy and deployment separately.** Obtain consent, minimize stored fields, restrict access, define retention/deletion and incident procedures, and review security controls before any shared deployment. Authentication, authorization, transport protection, auditability, backups, and capacity testing require explicit design and verification.

Packet capture, streaming ingestion, automatic response, or production deployment would each be a new subsystem needing its own safety review and tests. A working local dashboard does not make those additions safe by default.

## 7. Ethical and practical limitations

Use the project only with data you are entitled to process. Even summaries may contain sensitive behavioral information. Do not infer that a prediction proves malicious intent, use a model label as the sole basis for punitive action, or test the project by attacking a third-party system. Synthetic examples are sufficient for the supplied demonstration.

SQLite retains submitted summaries until cleared, and exports create additional copies outside the application. The provided packaging has no authentication, guaranteed service availability, automated retention, or managed backup. Ignore files help avoid accidental commits but cannot prevent all disclosure. Keep services on loopback, keep sensitive data out of presentations and repositories, and clearly label every conclusion according to the evidence actually collected.
