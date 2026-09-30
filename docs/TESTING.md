# Verification guide

Run all commands from the repository root after `python scripts/dev.py --install`. Use `.venv\Scripts\python.exe` on Windows or `.venv/bin/python` on macOS/Linux where the examples below say `python`.

## Backend

```bash
python -m ruff check backend scripts
python -m ruff format --check backend scripts
python -m pytest backend/tests --cov=backend/app --cov-report=term-missing --cov-fail-under=95
```

Tests use temporary SQLite databases and a deterministic process-cached model. They do **not** clear your workspace database. Coverage includes valid/invalid requests, finite-number handling, file encoding/schema/size/row limits, atomic rejection, chunked oversized requests, CORS/origin rejection, parallel writes, pagination, persistence across restart, export/deletion, frontend static hosting, evaluation consistency, reproducibility, and numerical verification of explanation effects.

## Frontend

```bash
cd frontend
npm ci
npm test
npm run build
```

Vitest/Testing Library checks UI behavior with mocked API responses; the TypeScript compiler and Vite verify the production build. Mocked frontend tests are complemented by the real-API browser check below.

## Full application in a real browser

Build the frontend first. Then, from the repository root:

```bash
python -m pip install playwright==1.63.0
python -m playwright install chromium
python scripts/smoke_browser.py
```

On Windows with Microsoft Edge already installed, the browser download is optional:

```powershell
.\.venv\Scripts\python.exe scripts/smoke_browser.py --channel msedge
```

Use `--screenshot browser-artifacts/dashboard.png` to save desktop and mobile screenshots from the actual running app. These are synthetic demonstrations, not real incidents. The script:

1. Starts an API on an available loopback port with a new **temporary** database.
2. Opens the built dashboard, generates 40 flows, checks pagination/filtering and an explanation drawer.
3. Tests invalid and valid manual submissions, then imports all 12 bundled CSV rows.
4. Opens real model metrics and downloads an export.
5. Checks mobile navigation and horizontal overflow at a 390-pixel viewport.
6. Verifies both canceling and confirming a clear-history action.
7. Asserts that no uncaught browser JavaScript error occurred, stops the server, and removes its temporary database.

It never targets an existing service or your normal saved analyses. A failed smoke check prints API logs for diagnosis. Screenshots are illustrations only; tests verify functionality rather than pixel-perfect appearance.

## GitHub Actions

The backend job runs lint/format checks and tests with a 95% coverage floor. The frontend job runs `npm ci`, component/unit tests, and the production build, then installs headless Chromium and runs the integrated browser check on Ubuntu. Screenshots are attached to the workflow run when available.

## Dependency and container checks

Optional dependency audits:

```bash
python -m pip install pip-audit
python -m pip_audit -r backend/requirements.txt
cd frontend
npm audit
```

An audit checks known advisories at the time of execution, not the absence of all vulnerabilities. Direct backend versions and the frontend lockfile are pinned; review upgrades and rerun tests.

Docker requires a separate Docker installation. Validate it with `docker compose config`, then `docker compose up --build`; confirm `http://127.0.0.1:8000/health` and the UI. Browser and unit-test success alone do not establish that an image was built or run.
