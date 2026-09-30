"""Deterministic holdout evaluation and single-feature reference sensitivity."""

from collections import Counter
from functools import lru_cache
from typing import Any

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .dataset import generate_flows
from .schemas import FEATURES, LABELS, Flow


class ThreatModel:
    def __init__(self) -> None:
        flows, labels = generate_flows(3000, seed=42)
        x = self._matrix(flows)
        y = np.asarray(labels)
        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=0.2, random_state=42, stratify=y
        )
        self.pipeline = Pipeline(
            [
                (
                    "features",
                    ColumnTransformer(
                        [
                            ("numeric", "passthrough", list(range(8))),
                            (
                                "protocol",
                                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                                [8],
                            ),
                        ]
                    ),
                ),
                (
                    "forest",
                    RandomForestClassifier(
                        n_estimators=100,
                        max_depth=12,
                        min_samples_leaf=3,
                        class_weight="balanced_subsample",
                        random_state=42,
                        n_jobs=1,
                    ),
                ),
            ]
        )
        self.pipeline.fit(x_train, y_train)
        forest = self.pipeline.named_steps["forest"]
        self.classes = list(forest.classes_)
        self.benign_index = self.classes.index("benign")
        benign = x_train[y_train == "benign"]
        self.reference = [float(np.median(benign[:, i].astype(float))) for i in range(8)]
        self.reference.append(Counter(benign[:, 8]).most_common(1)[0][0])
        predictions = self.pipeline.predict(x_test)
        report = classification_report(
            y_test, predictions, labels=list(LABELS), output_dict=True, zero_division=0
        )
        baseline = DummyClassifier(strategy="most_frequent").fit(x_train, y_train)
        baseline_predictions = baseline.predict(x_test)
        importance = forest.feature_importances_
        importances = [float(v) for v in importance[:8]] + [float(sum(importance[8:]))]
        self.report: dict[str, Any] = {
            "name": "Random Forest",
            "version": "1.0.0",
            "dataset": "Seeded synthetic network flows",
            "training_samples": len(x_train),
            "test_samples": len(x_test),
            "seed": 42,
            "accuracy": float(accuracy_score(y_test, predictions)),
            "macro_f1": float(f1_score(y_test, predictions, average="macro")),
            "baseline_accuracy": float(accuracy_score(y_test, baseline_predictions)),
            "baseline_macro_f1": float(f1_score(y_test, baseline_predictions, average="macro")),
            "labels": list(LABELS),
            "confusion_matrix": confusion_matrix(y_test, predictions, labels=list(LABELS)).tolist(),
            "per_class": [
                {
                    "label": label,
                    "precision": report[label]["precision"],
                    "recall": report[label]["recall"],
                    "f1": report[label]["f1-score"],
                    "support": int(report[label]["support"]),
                }
                for label in LABELS
            ],
            "feature_importance": sorted(
                [
                    {"feature": f, "importance": i}
                    for f, i in zip(FEATURES, importances, strict=True)
                ],
                key=lambda item: item["importance"],
                reverse=True,
            ),
            "limitations": [
                "Evaluation uses a stratified held-out split from a synthetic generator, not captured traffic. High scores do not demonstrate real-world detection quality.",
                "Demo samples use the same generator as training; familiar patterns and repeated seeds can make the demo look easier than deployment.",
                "Risk is 100 × (1 − P(benign)), not a calibrated probability of a real threat. Confidence is the model's largest class probability.",
                "Explanations are one-feature reference sensitivities, not causal effects or additive SHAP values. Correlated features can hide or exaggerate effects.",
                "Global importance is impurity-based and may favor continuous or high-cardinality features.",
                "No packet capture, automated blocking, authentication, or production intrusion prevention is included. Analyze only authorized data.",
            ],
        }

    @staticmethod
    def _matrix(flows: list[Flow]) -> np.ndarray:
        return np.asarray(
            [[getattr(flow, name) for name in FEATURES] for flow in flows], dtype=object
        )

    def predict(self, flows: list[Flow]) -> list[dict[str, Any]]:
        if not flows:
            return []
        x = self._matrix(flows)
        probabilities = self.pipeline.predict_proba(x)
        # One vectorized model call for all counterfactuals avoids 9N small calls.
        alternatives = np.repeat(x, len(FEATURES), axis=0)
        for row in range(len(flows)):
            for feature in range(len(FEATURES)):
                alternatives[row * len(FEATURES) + feature, feature] = self.reference[feature]
        altered_benign = self.pipeline.predict_proba(alternatives)[:, self.benign_index]
        altered_benign = altered_benign.reshape(len(flows), len(FEATURES))
        results = []
        for row, flow in enumerate(flows):
            probs = probabilities[row]
            benign_probability = float(probs[self.benign_index])
            explanations = []
            for feature, name in enumerate(FEATURES):
                impact = float((altered_benign[row, feature] - benign_probability) * 100)
                if impact <= 0.05:
                    continue
                explanations.append(
                    {
                        "feature": name,
                        "value": getattr(flow, name),
                        "baseline": self.reference[feature],
                        "impact": round(impact, 3),
                        "description": f"Replacing {name} with the benign reference lowers estimated malicious probability by {impact:.1f} percentage points.",
                    }
                )
            explanations.sort(key=lambda explanation: explanation["impact"], reverse=True)
            winner = int(np.argmax(probs))
            results.append(
                {
                    "predicted_label": self.classes[winner],
                    "confidence": round(float(probs[winner]), 6),
                    "risk_score": round((1 - benign_probability) * 100, 3),
                    "probabilities": {
                        label: round(float(probs[self.classes.index(label)]), 6) for label in LABELS
                    },
                    "flow": flow.model_dump(),
                    "explanations": explanations[:4],
                }
            )
        return results


@lru_cache(maxsize=1)
def get_model() -> ThreatModel:
    """One trained model per process; the database and request state are not cached."""
    return ThreatModel()
