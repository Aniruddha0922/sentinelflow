#!/usr/bin/env python3
"""Exercise the built UI against a temporary database in a real browser.

Install optional tools: python -m pip install playwright==1.63.0
Install Chromium: python -m playwright install chromium
Run after frontend build: python scripts/smoke_browser.py
Use existing Microsoft Edge on Windows: add --channel msedge
"""

from __future__ import annotations

import argparse
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_checks(url: str, channel: str | None, screenshot: Path | None) -> None:
    from playwright.sync_api import expect, sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=channel, headless=True)
        context = browser.new_context(
            viewport={"width": 1512, "height": 1100}, reduced_motion="reduce"
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)
        expect(page.get_by_role("heading", name="Network overview", exact=True)).to_be_visible()
        expect(page.get_by_text("API connected", exact=True)).to_be_visible()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 0
        page.get_by_role("button", name="Generate demo", exact=True).click()
        expect(
            page.get_by_text("40 synthetic demo flows analyzed and saved to your workspace.")
        ).to_be_visible()
        expect(page.get_by_role("button", name="Generate demo", exact=True)).to_be_enabled()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 40
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot), full_page=True, animations="disabled")

        navigation = page.get_by_role("navigation", name="Main navigation")
        navigation.get_by_role("button", name=re.compile("^Investigate")).click()
        expect(page.get_by_text("Showing 1–10 of 40 flows")).to_be_visible()
        page.get_by_role("button", name="Next", exact=True).click()
        expect(page.get_by_text("Showing 11–20 of 40 flows")).to_be_visible()
        with page.expect_response(
            lambda response: "/api/analyses?" in response.url and "label=port_scan" in response.url
        ) as filtered:
            page.get_by_label("Classification", exact=True).select_option("port_scan")
        filtered_count = len(filtered.value.json()["items"])
        assert filtered_count > 0
        expect(page.locator(".flow-table .label-badge")).to_have_text(
            ["Port scan"] * filtered_count
        )
        expect(page.locator(".flow-link").first).to_be_visible()
        page.locator(".flow-link").first.click()
        expect(page.get_by_role("dialog")).to_be_visible()
        expect(page.get_by_role("heading", name="Class probabilities")).to_be_visible()
        expect(page.get_by_role("heading", name="Why this prediction?")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog")).to_have_count(0)

        navigation.get_by_role("button", name="Analyze traffic", exact=True).click()
        page.get_by_label("Packet count", exact=True).fill("0")
        page.get_by_role("button", name="Analyze flow", exact=True).click()
        expect(page.get_by_label("Packet count", exact=True)).to_have_attribute(
            "aria-invalid", "true"
        )
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 40
        page.get_by_label("Packet count", exact=True).fill("14")
        page.get_by_role("button", name="Analyze flow", exact=True).click()
        expect(page.get_by_role("button", name="Inspect prediction")).to_be_visible()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 41
        page.get_by_label("Choose CSV file").set_input_files(
            str(ROOT / "data" / "sample_flows.csv")
        )
        page.get_by_role("button", name="Import & analyze", exact=True).click()
        expect(page.get_by_text("12 flows analyzed and saved", exact=True)).to_be_visible()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 53

        navigation.get_by_role("button", name="Model Lab", exact=True).click()
        expect(page.get_by_role("heading", name="Confusion matrix", exact=True)).to_be_visible()
        expect(
            page.get_by_text("Synthetic benchmark. Not real-world validation.", exact=True)
        ).to_be_visible()
        with page.expect_download() as download:
            page.get_by_role("button", name="Export CSV", exact=True).click()
        assert download.value.suggested_filename.endswith(".csv")
        assert download.value.failure() is None

        navigation.get_by_role("button", name="Overview", exact=True).click()
        page.set_viewport_size({"width": 390, "height": 844})
        expect(page.get_by_role("button", name="Open navigation")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), (
            "Mobile page overflows horizontally"
        )
        if screenshot:
            page.screenshot(
                path=str(screenshot.with_stem(screenshot.stem + "-mobile")),
                full_page=True,
                animations="disabled",
            )
        page.get_by_role("button", name="Open navigation").click()
        navigation.get_by_role("button", name="Analyze traffic", exact=True).click()
        expect(page.get_by_role("heading", name="Manual analysis", exact=True)).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        page.set_viewport_size({"width": 1512, "height": 1100})
        page.get_by_role("button", name="Clear saved data").click()
        expect(page.get_by_role("dialog", name="Clear saved analyses?")).to_be_visible()
        page.get_by_role("button", name="Keep my data").click()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 53
        page.get_by_role("button", name="Clear saved data").click()
        page.get_by_role("button", name="Delete all analyses").click()
        expect(
            page.get_by_text("53 saved analyses deleted. The trained model is unchanged.")
        ).to_be_visible()
        assert page.request.get(f"{url}/api/overview").json()["total_flows"] == 0
        assert not errors, f"Browser JavaScript errors: {errors}"
        browser.close()
    print(
        "PASS: demo, pagination/filtering, detail, manual validation, CSV, model, export, mobile, safe clear; no JavaScript errors."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--channel", help="Installed browser channel, e.g. msedge; default: Playwright Chromium"
    )
    parser.add_argument("--screenshot", type=Path, help="Save real desktop/mobile demo screenshots")
    args = parser.parse_args()
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        parser.error("Run npm run build in frontend/ first.")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="sentinelflow-browser-") as directory:
        env = {
            **os.environ,
            "SENTINEL_DB_PATH": str(Path(directory) / "test.db"),
            "SENTINEL_CORS_ORIGINS": url,
        }
        with (Path(directory) / "server.log").open("w+", encoding="utf-8") as log:
            server = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "backend.app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    if server.poll() is not None:
                        raise RuntimeError("API exited before it was ready.")
                    try:
                        with urllib.request.urlopen(f"{url}/health", timeout=1):
                            break
                    except (urllib.error.URLError, TimeoutError):
                        time.sleep(0.2)
                else:
                    raise RuntimeError("API startup timed out.")
                run_checks(url, args.channel, args.screenshot)
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
            finally:
                if os.name == "nt":
                    # A Windows venv python.exe can be a redirector with a child interpreter.
                    subprocess.run(
                        ["taskkill", "/PID", str(server.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
                else:
                    server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
