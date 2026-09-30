import json

from backend.app.evaluate import main


def test_evaluation_cli_saves_reproducible_report(tmp_path, monkeypatch, capsys):
    output = tmp_path / "reports" / "evaluation.json"
    monkeypatch.setattr("sys.argv", ["evaluate", "--output", str(output)])
    main()
    report = json.loads(capsys.readouterr().out)
    assert json.loads(output.read_text(encoding="utf-8")) == report
    assert report["test_samples"] == 600
    assert report["environment"]["scikit_learn"]
    assert "training only" in report["method"]
    assert report["baseline_accuracy"] < report["accuracy"]
