import numpy as np
import pytest

from backend.app.dataset import generate_flows
from backend.app.ml import get_model
from backend.app.schemas import FEATURES, LABELS, Flow


def test_generator_is_reproducible_and_valid():
    first, labels = generate_flows(100, seed=123)
    second, second_labels = generate_flows(100, seed=123)
    assert first == second
    assert labels == second_labels
    assert set(labels) == set(LABELS)
    assert first != generate_flows(100, seed=124)[0]
    for flow in first:
        assert Flow.model_validate(flow.model_dump()) == flow


def test_evaluation_is_complete_and_beats_majority_baseline(client):
    report = client.get("/api/model").json()
    assert report["training_samples"] == 2400
    assert report["test_samples"] == 600
    assert report["accuracy"] > report["baseline_accuracy"]
    assert report["macro_f1"] > report["baseline_macro_f1"]
    matrix = np.asarray(report["confusion_matrix"])
    assert matrix.shape == (4, 4)
    assert matrix.sum() == 600
    assert np.trace(matrix) / 600 == pytest.approx(report["accuracy"])
    assert [entry["support"] for entry in report["per_class"]] == matrix.sum(axis=1).tolist()
    assert sum(item["importance"] for item in report["feature_importance"]) == pytest.approx(1)
    assert {item["feature"] for item in report["feature_importance"]} == set(FEATURES)
    assert "synthetic" in report["limitations"][0].lower()
    assert len(report["limitations"]) >= 4


def test_predict_is_repeatable_and_explanations_match_actual_ablation():
    model = get_model()
    flows, _ = generate_flows(20, seed=127)
    predictions = model.predict(flows)
    assert predictions == model.predict(flows)
    assert model.predict([]) == []
    explained = 0
    for flow, result in zip(flows, predictions, strict=True):
        assert 0 <= result["risk_score"] <= 100
        assert 0 <= result["confidence"] <= 1
        impacts = [entry["impact"] for entry in result["explanations"]]
        assert impacts == sorted(impacts, reverse=True)
        for explanation in result["explanations"]:
            explained += 1
            modified = model._matrix([flow])
            modified[0, FEATURES.index(explanation["feature"])] = explanation["baseline"]
            altered_risk = (1 - model.pipeline.predict_proba(modified)[0, model.benign_index]) * 100
            assert result["risk_score"] - altered_risk == pytest.approx(
                explanation["impact"], abs=0.0011
            )
            assert explanation["impact"] > 0
    assert explained > 0
