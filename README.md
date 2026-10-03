# LinkSnip

A URL shortener with click analytics. Shorten any link, optionally set a custom alias and an expiry (by date or click limit), then track clicks over time — with referrers, device/browser breakdown, and a country map. Includes signup/login (JWT) and per-user dashboards, plus QR codes for your links.

**Tech stack:** FastAPI + SQLModel + SQLite (backend) · React + Vite + TypeScript (frontend)

---

## Prerequisites

Install these first (any OS):

| Tool | Version | Check with |
|------|---------|-----------|
| **Python** | 3.10 or newer | `python3 --version` (Windows: `python --version`) |
| **Node.js** | 18 or newer (20 recommended) | `node --version` |
| **npm** | comes with Node | `npm --version` |

> No database to install — the backend creates a local SQLite file (`linksnip.db`) automatically on first run.

---

## Project structure

```
LinkSnip/
├── backend/     # FastAPI API (run from THIS folder)
│   ├── main.py
│   ├── requirements.txt
│   └── ...
└── frontend/    # React + Vite app
    ├── package.json
    └── ...
```

You need **two terminals** running at the same time: one for the backend, one for the frontend.

---

## 1. Backend (API) — port 8000

Open a terminal in the project root and go into the `backend` folder.

### Linux / macOS

```bash
cd backend
python3 -m venv myenv
source myenv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Windows (PowerShell)

```powershell
cd backend
python -m venv myenv
myenv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

> If PowerShell blocks the activate script, run this once, then activate again:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### Windows (Command Prompt / CMD)

```cmd
cd backend
python -m venv myenv
myenv\Scripts\activate.bat
pip install -r requirements.txt
uvicorn main:app --reload
```

The API is now running at **http://127.0.0.1:8000**
Interactive API docs (Swagger): **http://127.0.0.1:8000/docs**

> ⚠️ Run the backend from **inside the `backend/` folder** (the imports are flat, e.g. `from database import ...`). Running it from the project root will fail.

---

## 2. Frontend (web app) — port 5173

Open a **second** terminal in the project root and go into the `frontend` folder. The commands are the same on Linux, macOS, and Windows.

```bash
cd frontend
npm install
npm run dev
```

Now open the app in your browser: **http://localhost:5173**

> The frontend expects the backend at `http://127.0.0.1:8000`, so make sure the backend (step 1) is running first.

### Production build (optional)

```bash
npm run build      # outputs to frontend/dist/
npm run preview    # serves the built app locally
```

---

## Quick start (TL;DR)

**Terminal 1 — backend**

| OS | Commands |
|----|----------|
| Linux / macOS | `cd backend && python3 -m venv myenv && source myenv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload` |
| Windows (PowerShell) | `cd backend; python -m venv myenv; myenv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn main:app --reload` |
| Windows (CMD) | `cd backend && python -m venv myenv && myenv\Scripts\activate.bat && pip install -r requirements.txt && uvicorn main:app --reload` |

**Terminal 2 — frontend** (same on every OS)

```bash
cd frontend && npm install && npm run dev
```

Then visit **http://localhost:5173**.

---

## Notes

- **Ports:** backend `8000`, frontend `5173`. If a port is busy, stop the process using it or change it (`uvicorn main:app --reload --port 8001`, and update `BASE` in `frontend/src/api.ts` to match).
- **Database:** `backend/linksnip.db` is created automatically. Delete it anytime to start fresh — it will be recreated on the next backend start.
- **Fresh install:** after changing computers, always recreate the virtual environment (`myenv`) and rerun `npm install` — these folders are OS-specific and should not be copied between machines.
- **Stopping the servers:** press `Ctrl + C` in each terminal.

---

