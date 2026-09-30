"""Recompute the synthetic holdout report: python -m backend.app.evaluate."""

import argparse
import json
import platform
from pathlib import Path

import numpy
import sklearn

from .ml import get_model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Also save the report as a JSON file")
    args = parser.parse_args()
    report = {
        **get_model().report,
        "environment": {
            "python": platform.python_version(),
            "numpy": numpy.__version__,
            "scikit_learn": sklearn.__version__,
        },
        "method": "Stratified random 80/20 split, seed 42. Preprocessor and forest fit on training only. Benign reference statistics use training only. No hyperparameter search on the holdout.",
    }
    text = json.dumps(report, indent=2, ensure_ascii=True)
    print(text)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
