# Deployment

FedShield has two parts with very different hosting needs:

| Part | What it needs | Where it can run |
|---|---|---|
| **UI** (`ui/`, React static build) | Static hosting | **Vercel**, Netlify, any CDN, or served by the API itself |
| **API** (`fedshield/api`, FastAPI) | Python 3.11, ~1.5 GB RAM, the model artefacts (~310 MB, see below), long-lived WebSockets (live pipeline, stream) | A container host: Render, Railway, Fly.io, a VM, or your laptop with a tunnel |

> **Vercel cannot run the API.** Its serverless functions have size and time limits and
> don't hold WebSockets. That's why the UI deploys to Vercel and calls the API wherever
> it runs, through `VITE_API_BASE`.

## 1. UI on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory = `ui`**. `ui/vercel.json` already
   sets the Vite build, the `dist` output and the single-page-app rewrites.
2. Under **Settings → Environment Variables**, set
   `VITE_API_BASE = https://<your-api-host>`. No trailing slash; it's used for both `https://` and `wss://`.
3. Deploy. Every push to `main` redeploys.

The API allows any origin (CORS `*`) and uses bearer tokens, not cookies, so the cross-origin setup needs nothing else.

## 2. API (container)

The API reads its artefacts from `FEDSHIELD_WORK` (default `work/`):

```
work/models/nfpc_full.pkl, nfpc_full_scores.parquet, nfpc_full_features.parquet,
            nfpc_full_local.parquet, nfpc_full_local_models.pkl, stream.pkl, stream_events.parquet
work/nfpc/monthly_full.parquet   (~90 MB)    work/nfpc/edges_full.parquet (~163 MB)
work/patterns.json   work/demo_cases.json
results/*.json
```

These are **not in git**. They're derived from the licensed NFPC competition data, and some are over GitHub's 100 MB limit.
Produce them with the pipeline in the README (or the Kaggle notebook), then make them available to the container:

- **Render / Railway / Fly**: build `docker/Dockerfile.api`, attach a persistent disk at `/data/work`,
  and upload the artefacts to it once. Set `FEDSHIELD_SECRET` to a long random string and
  `FEDSHIELD_DEMO_PASSWORD` to something other than the default.
- **Laptop + tunnel** (quickest for a live demo): `uvicorn fedshield.api.server:app --port 8000`,
  then `cloudflared tunnel --url http://localhost:8000` (or ngrok). Put the tunnel URL in `VITE_API_BASE`.

## 3. Everything together (Docker Compose)

```bash
python scripts/export_partitions.py
docker compose up --build        # UI + API on http://localhost:8000
```

Services: `bank-a/b/c` (each mounts only its own partition), `aggregator` (federates over HTTP with masked
histograms, then exits), `redis`, `redpanda`, `replayer` (publishes payments), `api` (UI + API).

**TLS-inspecting networks** (corporate proxies, Avast/Kaspersky web shields): if `pip install` or
`npm ci` fails with `CERTIFICATE_VERIFY_FAILED` inside the build, export the inspecting root CA as
PEM into `docker/certs/<name>.crt`. Both images trust any `*.crt` there. The folder is gitignored
because the certificate is specific to your machine.

## Security notes for a public deployment

- Demo personas and passwords are hardcoded on purpose, for the jury demo. Change `FEDSHIELD_DEMO_PASSWORD`,
  or put the API behind your identity provider before exposing real data.
- `FEDSHIELD_SECRET` signs session tokens and keys the pseudonyms on the RBI view. Set it; otherwise it's random per process.
- The "ground truth" panel in the officer console shows evaluation labels. Remove it for anything beyond a demo.
