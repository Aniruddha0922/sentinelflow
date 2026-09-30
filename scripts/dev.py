#!/usr/bin/env python3
"""Install dependencies or run SentinelFlow locally; standard library only."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
VENV = ROOT / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def find_npm() -> str:
    # npm is a batch shim on Windows, not a native executable.
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise RuntimeError(
            "Node.js/npm was not found. Install Node.js 22 LTS and reopen your terminal."
        )
    return npm


def command_options(command: list[str]) -> dict:
    # shell=True is needed for Windows .cmd shims. All arguments here are fixed
    # by this script; never pass user-supplied command strings through this path.
    return {"shell": os.name == "nt" and command[0].lower().endswith((".cmd", ".bat"))}


def run(command: list[str], cwd: Path = ROOT) -> None:
    subprocess.run(command, cwd=cwd, check=True, **command_options(command))


def install(npm: str) -> None:
    requirements = ROOT / "backend" / "requirements-dev.txt"
    if not requirements.is_file() or not (FRONTEND / "package-lock.json").is_file():
        raise RuntimeError(
            "Backend requirements-dev.txt and frontend/package-lock.json must be present."
        )
    if not PYTHON.is_file():
        print("Creating .venv...", flush=True)
        run([sys.executable, "-m", "venv", str(VENV)])
    print("Installing backend development dependencies...", flush=True)
    run([str(PYTHON), "-m", "pip", "install", "-r", str(requirements)])
    print("Installing frontend dependencies from the lockfile...", flush=True)
    run([npm, "ci"], cwd=FRONTEND)
    print("Installed. Run this script again without --install to start both servers.")


def start(command: list[str], cwd: Path) -> subprocess.Popen:
    options = command_options(command)
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    return subprocess.Popen(command, cwd=cwd, **options)


def stop_children(children: list[tuple[str, subprocess.Popen]]) -> None:
    """Stop entire process trees, including uvicorn reload and npm/Vite children."""
    for name, child in reversed(children):
        try:
            if os.name == "nt":
                # terminate() only kills cmd.exe and leaves node/uvicorn behind.
                # taskkill /T covers descendants; /F also works without a console.
                subprocess.run(
                    ["taskkill", "/PID", str(child.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
            else:
                os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except OSError as exc:
            print(f"Warning: could not stop {name}'s process group: {exc}", file=sys.stderr)
            if child.poll() is None:
                child.terminate()
    for _, child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
        finally:
            if os.name != "nt":
                # The launcher may have exited before a descendant; reap stragglers.
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


def serve(npm: str) -> int:
    if not PYTHON.is_file() or not (FRONTEND / "node_modules").is_dir():
        raise RuntimeError("Dependencies are missing. Run this script with --install first.")
    check = subprocess.run(
        [str(PYTHON), "-c", "import uvicorn; import fastapi"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if check.returncode:
        raise RuntimeError(
            "Backend dependencies are missing. Run this script with --install again."
        )
    children: list[tuple[str, subprocess.Popen]] = []
    try:
        children.append(
            (
                "API",
                start(
                    [
                        str(PYTHON),
                        "-m",
                        "uvicorn",
                        "backend.app.main:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "8000",
                        "--reload",
                        "--reload-dir",
                        str(ROOT / "backend" / "app"),
                    ],
                    ROOT,
                ),
            )
        )
        children.append(
            (
                "Frontend",
                start(
                    [
                        npm,
                        "run",
                        "dev",
                        "--",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "5173",
                        "--strictPort",
                    ],
                    FRONTEND,
                ),
            )
        )
        print("\nSentinelFlow: http://127.0.0.1:5173", flush=True)
        print("API docs:     http://127.0.0.1:8000/docs", flush=True)
        print("Wait for both servers to report ready. Press Ctrl+C to stop both.\n", flush=True)
        while True:
            for name, child in children:
                result = child.poll()
                if result is not None:
                    print(
                        f"{name} exited (code {result}); stopping the other server.",
                        file=sys.stderr,
                    )
                    return result if result > 0 else 1
            time.sleep(0.3)
    except KeyboardInterrupt:
        print("\nStopping SentinelFlow...", flush=True)
        return 0
    finally:
        # A second Ctrl+C must not interrupt cleanup and leave child servers alive.
        previous_handler = signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            stop_children(children)
        finally:
            signal.signal(signal.SIGINT, previous_handler)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--install", action="store_true", help="Create .venv and install dependencies, then exit"
    )
    args = parser.parse_args()
    if sys.version_info < (3, 11):  # noqa: UP036 - give older-Python users a useful error
        parser.error("Python 3.11 or newer is required.")
    try:
        npm = find_npm()
        if args.install:
            install(npm)
            return 0
        return serve(npm)
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
