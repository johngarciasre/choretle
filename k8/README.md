# ─── Choretle Kubernetes Deployment ────────────────────────────────

## Quick Start

```bash
# 1. Build the image
./k8/build.sh choretle latest

# 2. Apply manifests (order matters — namespace first)
kubectl apply -f k8/namespace.yaml
kubectl apply -f k8/configmap.yaml
kubectl apply -f k8/secret.yaml
kubectl apply -f k8/deployment.yaml
kubectl apply -f k8/service.yaml
kubectl apply -f k8/ingress.yaml

# 3. Watch rollout
kubectl rollout status deployment/choretle -n choretle
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Node environment |
| `AUTH_MODE` | No | `dev` | `dev` for cookie-based auth, omit Supabase vars for local |
| `PORT` | No | `3000` | HTTP listen port |
| `NEXT_PUBLIC_SUPABASE_URL` | Prod only | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod only | — | Supabase anon key |
| `POSTGRES_URL` | Optional | — | PostgreSQL connection string (omit for SQLite) |
| `WEBSUDO_SECRET` | Optional | — | Secret for websudo superadmin |

## Image Tagging

For production, pin to a specific tag:

```bash
./k8/build.sh choretle v1.2.3
# Update deployment.yaml image: choretle:v1.2.3
kubectl rollout restart deployment/choretle -n choretle
```

## Health Checks

- **Startup probe**: HTTP GET `/` — allows 60s (30 × 2s) for the build to finish
- **Liveness probe**: HTTP GET `/` — restarts if the process is unresponsive after 15s warmup
- **Readiness probe**: HTTP GET `/api/auth/me` — removes pod from service endpoints if auth middleware fails

## Resource Limits

| | CPU | Memory |
|--|-----|--------|
| Request | 100m | 128Mi |
| Limit | 1 core | 512Mi |

Adjust based on your family size and traffic.

## SQLite Mode (no database required)

Omit `POSTGRES_URL` from the ConfigMap or Secret. The app falls back to SQLite via `better-sqlite3` automatically — suitable for development or small families.
