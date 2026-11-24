"""Build an offline recognition corpus from a Cube Studio diagnostic ZIP.

Usage: python scripts/import-diagnostics.py REPORT.zip OUTPUT_DIRECTORY
       [--frame SCAN_ID:frame-003.jpg ...]

Only recognition evidence is copied; environment, notes and client logs are
excluded. Original videos stay in the private source archive. Optional pixel
fixtures need ffmpeg at import time; the test runner needs no external decoder.
Expectations must be annotated separately, never inferred from a failing scan.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frame", action="append", default=[])
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; choose a new directory to preserve annotations")

    with zipfile.ZipFile(args.archive) as archive:
        report = json.loads(archive.read("report.json"))
        if report.get("schema") != 1:
            parser.error("Unsupported diagnostic schema")
        corpus = {
            "schema": 1,
            "archiveSha256": hashlib.sha256(args.archive.read_bytes()).hexdigest(),
            "build": report["build"],
            "scans": [],
            "pixels": [],
        }
        # Build in a temporary directory: a failed decode must not leave a
        # partially imported corpus that looks ready to test.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=args.output.parent) as temporary:
            target = Path(temporary) / "dataset"
            target.mkdir()
            for scan in report["scans"]:
                corpus["scans"].append({
                    "id": scan["id"], "source": scan["source"], "size": scan["size"],
                    "calibrations": next(event["data"]["calibrations"] for event in scan["events"] if event["type"] == "scan.start"),
                    "frames": [{"time": event["data"]["time"], "detection": event["data"]["detection"]}
                               for event in scan["events"] if event["type"] == "scan.frame"],
                    "workerInputs": [event["data"] for event in scan["events"] if event["type"] == "scan.worker.input"],
                })
            for requested in args.frame:
                scan_id, filename = requested.split(":", 1)
                scan = next(scan for scan in report["scans"] if scan["id"] == scan_id)
                name = f"scans/{scan_id}/{filename}"
                metadata = next(event["data"] for event in scan["events"]
                                if event["type"] == "scan.image" and event["data"]["name"] == name)
                width, height = metadata["width"], metadata["height"]
                rgb = subprocess.run(
                    ["ffmpeg", "-v", "error", "-i", "pipe:0", "-frames:v", "1",
                     "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
                    input=archive.read(name), check=True, capture_output=True,
                ).stdout
                if len(rgb) != width * height * 3:
                    raise ValueError(f"Unexpected dimensions for {name}")
                file = f"{scan_id[:8]}-{Path(filename).stem}.rgb.gz"
                (target / file).write_bytes(gzip.compress(rgb, mtime=0))
                corpus["pixels"].append({"file": file, "scanId": scan_id, "time": metadata["time"],
                                         "width": width, "height": height, "source": name,
                                         "encoding": "diagnostic-jpeg-decoded-rgb"})
            (target / "readings.json").write_text(json.dumps(corpus, separators=(",", ":")) + "\n")
            target.rename(args.output)
    print(f"Imported {len(corpus['scans'])} scans and {len(corpus['pixels'])} pixel fixtures into {args.output}")


if __name__ == "__main__":
    main()
