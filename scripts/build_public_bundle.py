#!/usr/bin/env python3
"""Build a compact, static PrefScope bundle for the public viewer.

The research export intentionally retains more transcripts than a public web
deployment should ship.  This script keeps all aggregate analysis artifacts,
caps per-feature evidence, retains only joint evidence referenced by exported
elicitation/significant conditional results, and omits the monolithic
``examples_by_model.json`` file (the viewer falls back to report_battles.json).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


OMIT = {"examples_by_model.json", "examples.json", "examples/", "joint_examples/"}

REDACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?"
            r"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
            re.IGNORECASE | re.DOTALL,
        ),
        "[REDACTED PRIVATE KEY]",
    ),
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*\Z",
            re.IGNORECASE | re.DOTALL,
        ),
        "[REDACTED PRIVATE KEY]",
    ),
    (re.compile(r"\bsk-or-v1-[A-Za-z0-9_-]{20,}\b"), "[REDACTED API KEY]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "[REDACTED API KEY]"),
    (re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b"), "[REDACTED GITHUB TOKEN]"),
    (re.compile(r"\bhf_[A-Za-z0-9]{20,}\b"), "[REDACTED HUGGING FACE TOKEN]"),
    (re.compile(r"\bAKIA[A-Z0-9]{16}\b"), "[REDACTED AWS ACCESS KEY]"),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{30,}\b"), "[REDACTED GOOGLE API KEY]"),
    (re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"), "[REDACTED EMAIL]"),
    (
        re.compile(
            r"/(?:Users|home)/[^/\s\"']+(?:/[^\s\"']*)?"
            r"|/(?:scratch|projappl|flash)/project_465002530(?:/[^\s\"']*)?"
        ),
        "[REDACTED LOCAL PATH]",
    ),
)


def _read(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))


def _sanitize(value: Any, counts: dict[str, int]) -> Any:
    if isinstance(value, str):
        result = value
        for pattern, replacement in REDACTIONS:
            result, n = pattern.subn(replacement, result)
            if n:
                counts[replacement] = counts.get(replacement, 0) + n
        return result
    if isinstance(value, list):
        return [_sanitize(item, counts) for item in value]
    if isinstance(value, dict):
        return {key: _sanitize(item, counts) for key, item in value.items()}
    return value


def _copy_json(source: Path, output: Path, counts: dict[str, int]) -> None:
    _write(output, _sanitize(_read(source), counts))


def _copy_coactivation(
    source: Path,
    output: Path,
    counts: dict[str, int],
    examples_per_pair: int,
) -> dict[str, int]:
    """Keep only the ranked evidence rows the public pair list can display."""
    data = _read(source)
    examples = data.get("examples", {})
    kept_rows: set[str] = set()
    for pair in data.get("pairs", []):
        rows = [int(row) for row in pair.get("rows", [])[:examples_per_pair]]
        pair["rows"] = rows
        kept_rows.update(str(row) for row in rows)
    data["examples"] = {
        row: examples[row]
        for row in sorted(kept_rows, key=int)
        if row in examples
    }
    _write(output, _sanitize(data, counts))
    return {
        "pairs": len(data.get("pairs", [])),
        "examples": len(data["examples"]),
    }


def _joint_pairs(source: Path) -> set[tuple[int, int]]:
    """Return raw prompt/response pairs that the public UI can display."""
    pairs: set[tuple[int, int]] = set()

    elicitation_path = source / "elicitation.json"
    if elicitation_path.exists():
        for edge in _read(elicitation_path).get("edges", []):
            pairs.add((int(edge["px"]), int(edge["cy"])))

    conditional_path = source / "conditional.json"
    if conditional_path.exists():
        conditional = _read(conditional_path)
        raw = conditional.get("raw", conditional)
        for cell in raw.get("cells", []):
            if cell.get("sig"):
                pairs.add((int(cell["pc"]), int(cell["f"])))

    return pairs


def build(
    source: Path,
    output: Path,
    feature_examples: int,
    joint_examples: int,
    coactivation_examples: int,
) -> dict[str, Any]:
    manifest = _read(source / "bundle_manifest.json")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    redactions: dict[str, int] = {}

    files: list[str] = []
    coactivation_stats = {"pairs": 0, "examples": 0}
    for name in manifest.get("files", []):
        if name in OMIT or name.endswith("/"):
            continue
        src = source / name
        if src.is_file():
            dst = output / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            if name == "coactivation.json":
                coactivation_stats = _copy_coactivation(
                    src, dst, redactions, coactivation_examples
                )
            else:
                _copy_json(src, dst, redactions)
            files.append(name)

    datasets = source / "datasets"
    if datasets.is_dir():
        for src in datasets.rglob("*.json"):
            _copy_json(src, output / "datasets" / src.relative_to(datasets), redactions)
    datasets_index = source / "datasets.json"
    if datasets_index.is_file():
        _copy_json(datasets_index, output / "datasets.json", redactions)

    examples_out = output / "examples"
    examples_written = 0
    for src in sorted((source / "examples").glob("*.json")):
        rows = _read(src)
        if not isinstance(rows, list) or not rows:
            continue
        _write(examples_out / src.name, _sanitize(rows[:feature_examples], redactions))
        examples_written += min(len(rows), feature_examples)
    if examples_written:
        files.append("examples/")

    allowed = _joint_pairs(source)
    joint_out = output / "joint_examples"
    joint_pairs_written = 0
    joint_examples_written = 0
    for src in sorted((source / "joint_examples").glob("*.json")):
        shard = _read(src)
        prompt_feature = int(shard.get("prompt_feature", src.stem))
        kept: dict[str, list[dict[str, Any]]] = {}
        for response_feature, rows in shard.get("examples", {}).items():
            pair = (prompt_feature, int(response_feature))
            if pair not in allowed or not rows:
                continue
            selected = rows[:joint_examples]
            kept[str(response_feature)] = _sanitize(selected, redactions)
            joint_pairs_written += 1
            joint_examples_written += len(selected)
        if kept:
            _write(
                joint_out / src.name,
                {"prompt_feature": prompt_feature, "examples": kept},
            )
    if joint_pairs_written:
        files.append("joint_examples/")

    compact_manifest = {
        **manifest,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": sorted(set(files)),
        "public_profile": {
            "feature_examples_per_feature": feature_examples,
            "joint_examples_per_pair": joint_examples,
            "joint_pairs": joint_pairs_written,
            "joint_examples": joint_examples_written,
            "coactivation_examples_per_pair": coactivation_examples,
            "coactivation_examples": coactivation_stats["examples"],
            "omitted": ["examples_by_model.json", "examples.json"],
            "redactions": redactions,
        },
    }
    _write(output / "bundle_manifest.json", compact_manifest)

    return {
        "source": str(source),
        "output": str(output),
        "artifacts": len(compact_manifest["files"]),
        "feature_examples": examples_written,
        "joint_pairs": joint_pairs_written,
        "joint_examples": joint_examples_written,
        "coactivation_examples": coactivation_stats["examples"],
        "redactions": redactions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--feature-examples", type=int, default=3)
    parser.add_argument("--joint-examples", type=int, default=1)
    parser.add_argument("--coactivation-examples", type=int, default=1)
    args = parser.parse_args()
    if min(args.feature_examples, args.joint_examples, args.coactivation_examples) < 1:
        parser.error("example limits must be positive")
    summary = build(
        args.source.resolve(),
        args.output.resolve(),
        args.feature_examples,
        args.joint_examples,
        args.coactivation_examples,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
