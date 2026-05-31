# Meridian — True Cost of Ownership Agent

Takes a Toronto address, list price, and buyer profile and returns the **true 10-year cost of ownership** by pulling live data from Toronto Open Data and the TRCA. Runs entirely local on NVIDIA DGX Spark (GB10 Blackwell). No data leaves the device.

- **Architecture diagram:** [`docs/architecture-diagram.svg`](docs/architecture-diagram.svg)
- **Pipeline diagram:** [`docs/pipeline-diagram.svg`](docs/pipeline-diagram.svg)
- **NVIDIA services used:** [`docs/nvidia-services.md`](docs/nvidia-services.md)
- **Number parameters:** [`docs/frontend-parameters.md`](docs/frontend-parameters.md)
- **Agent / contributor guides:** [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`SKILLS.md`](SKILLS.md), [`SOUL.md`](SOUL.md)

---

## Quick start (TL;DR)

```bash
# 1. Backend  (terminal 1)
cd backend && uv sync
uv run uvicorn app.main:app --reload --port 8000      # http://localhost:8000/api/v1/health

# 2. Frontend (terminal 2)
cd frontend && npm install && npm run dev              # http://localhost:3000

# 3. (optional) Local Nemotron via NIM — see "AI narrative" below.
#    If skipped, the app falls back to the hosted NVIDIA API (NIM_API_KEY),
#    or set NIM_ENABLED=false to skip the narrative entirely.
```

Open **http://localhost:3000**, enter an address + list price + buyer profile, and generate a report.

---

## Linux System Installation & Setup

If you are setting up and running Meridian on a fresh **Linux machine (e.g., Ubuntu 22.04 / 24.04)**, follow these instructions to install all prerequisites and launch the application.

### 1. System Packages & Python 3.11+

Update your package lists and install standard build tools, `curl`, and Python development packages:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install curl build-essential python3 python3-pip python3-venv -y
```

### 2. Node.js & npm (Frontend Runtime)

Install Node.js (v18+ recommended) using the NodeSource repository:
```bash
# Set up NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs
```

### 3. Docker & NVIDIA Container Toolkit (For Local NIM/Nemotron GPUs)

To leverage on-device NVIDIA GPUs (e.g. Blackwell GB10/ASUS GB10 or RTX cards) to run local **NVIDIA NIMs** with the `--gpus all` flag, install Docker and the **NVIDIA Container Toolkit**:

```bash
# 1. Install Docker (if not installed)
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER  # Log out and log back in to apply group changes!

# 2. Configure NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit

# 3. Configure and restart Docker container runtime
sudo nvidia-container-toolkit-config --mode=docker
sudo systemctl restart docker
```

### 4. Running the Full Stack

Now you are ready to run both backend and frontend.

**Terminal 1: Backend**
```bash
# Install uv package manager
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env  # refresh shell env to load 'uv'

cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open your browser at **http://localhost:3000** to access the property configurator.

---

## Running locally

### Backend setup

The backend requires **Python 3.11+** and uses [`uv`](https://github.com/astral-sh/uv) for dependency management.

**1. Install uv** (if not already installed)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**2. Install dependencies**
```bash
cd backend
uv sync
```

**3. Configure environment**

Copy the example env file and fill in your values:
```bash
cp .env.example .env   # if .env.example exists, otherwise create .env manually
```

Minimum `.env` for local development (NIM disabled):
```env
NIM_ENABLED=false
```

See the [Configuration](#configuration) section below for all available variables.

**4. Start the backend**
```bash
uv run uvicorn app.main:app --reload --port 8000
```

Or, if you activated the virtual environment manually (`source .venv/bin/activate`):
```bash
uvicorn app.main:app --reload --port 8000
```

Confirm healthy: `http://localhost:8000/api/v1/health`

> The first report request takes 10–20 s while heritage and development datasets load from CKAN into memory. Subsequent requests are fast.

---

### Full stack (all terminals)

You need two terminals (three if running NIM).

**Terminal 1 — backend**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend**
```bash
cd frontend
npm install   # first time only
npm run dev
```
Open `http://localhost:3000`

**Terminal 3 — Nemotron via NIM (optional, for the AI narrative)**

The buyer narrative is generated by **NVIDIA Nemotron** (`nvidia/nemotron-nano-12b-v2-vl`). The synthesis service is **local-first with a hosted-API fallback** (see `backend/app/services/synthesis/service.py`):

1. **Default — local NIM container** on `http://localhost:8080/v1`:
   ```bash
   docker login nvcr.io                       # needs an NGC key with NIM entitlement
   docker run --gpus all -p 8080:8000 \
     nvcr.io/nim/nvidia/nemotron-nano-12b-v2-vl:latest
   ```
2. **Fallback — hosted NVIDIA API** (`https://integrate.api.nvidia.com/v1`): used automatically when the local container is unreachable. Set `NIM_API_KEY` in `backend/.env`.
3. **Disabled:** set `NIM_ENABLED=false` — the full report still works, only the narrative summary is blank.

> Note: if your NGC credentials lack NIM container entitlement, the local image pull returns `DENIED: Payment Required`. In that case the app runs on the hosted-API fallback (same model) with no code change — and auto-prefers the local container the moment one is serving on `:8080`. See [`docs/nvidia-services.md`](docs/nvidia-services.md) for details.

---

## What's implemented

### Backend (FastAPI + Python 3.11)

**Agent 1 — Intake**
- Address geocoding via Nominatim (OpenStreetMap)
- Returns lat/lon used by all downstream services

**Agent 2 — Data retrieval (live, async)**
- **Heritage Register** — loads all ~12k records from Toronto CKAN at startup; spatial match within 80 m; classifies as Part IV (red), Part V (yellow), or Listed (info)
- **Flood zone** — live point-in-polygon query against TRCA ArcGIS REST API; flags property if it intersects a flood polygon
- **Development applications** — loads all ~26k records from Toronto CKAN at startup; counts active applications within 500 m using haversine; classifies as high (≥10), medium (≥5), or low pressure
- All three services fall back to a heuristic if the live API is unreachable

**Agent 3 — Cost computation (deterministic)**
- Ontario + Toronto land transfer tax (progressive brackets, hardcoded 2026 rates)
- First-time buyer rebate: $8,475
- Property tax 10-year projection (rate 0.00767311, assessed value proxy 60% of list price, 3% annual growth)
- CMHC insured mortgage premium (tiered by down payment %)
- Two-term mortgage model over 10 years (base / bull −0.5% / bear +1.5% renewal scenarios)
- Risk-weighted loadings: flood (+$3,500/yr), heritage (+$12,000), development pressure (+$7,000–$17,000)
- Transit Dividend: estimated 10-year savings vs. car-dependent baseline based on proximity to downtown TTC stations

**Agent 4 — Synthesis (local LLM)**
- Calls NVIDIA NIM (OpenAI-compatible API) with structured engine output
- Generates a 3-paragraph buyer narrative: verdict, cost drivers, actionable steps
- Gracefully skipped if NIM is unavailable; rest of report is unaffected

### Frontend (Next.js 15 + TypeScript)
- Address, list price, buyer profile, down payment, mortgage rate, amortization input form
- True 10-year cost summary with above-list percentage
- Cost breakdown bar chart (mortgage, transfer tax, property tax, risk loadings, transit dividend)
- Mortgage scenario ladder (bull / base / bear)
- Red / yellow / green flag display
- Falls back to client-side calculation if backend is unreachable

---

## Configuration

All settings can be overridden via environment variables in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NIM_ENABLED` | `true` | Set to `false` to skip the LLM narrative |
| `NIM_LOCAL_URL` | `http://localhost:8080/v1` | Local NIM container (primary / default) |
| `NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | Hosted NVIDIA API (fallback) |
| `NIM_MODEL` | `nvidia/nemotron-nano-12b-v2-vl` | Nemotron model served by NIM / the API |
| `NIM_API_KEY` | _(empty)_ | Bearer key for the hosted-API fallback |
| `NIM_TIMEOUT_SECONDS` | `60.0` | LLM request timeout |
| `TRCA_FLOOD_QUERY_URL` | TRCA ArcGIS REST URL | Flood polygon service endpoint |

The full set of tunables (financial constants, RAG, GPU/Monte Carlo) lives in `backend/app/core/config.py`. See [`docs/nvidia-services.md`](docs/nvidia-services.md) for the NVIDIA-specific configuration.

---

## Data sources

| Source | Dataset | Refresh |
|--------|---------|---------|
| Toronto Open Data (CKAN) | Heritage Register | Quarterly |
| Toronto Open Data (CKAN) | Development Applications | Weekly |
| TRCA ArcGIS REST | Floodline polygon | External |
| Hardcoded (2026) | Ontario + Toronto LTT brackets | Annual |
| Hardcoded (2026) | Property tax rate 0.00767311 | Annual |
