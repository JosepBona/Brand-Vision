# Brand Vision

Real-time vehicle brand detection from live traffic camera streams — YOLO detection + a custom brand classifier, FastAPI backend, React dashboard.

- **`frontend/`** — React + Vite dashboard (TypeScript, shadcn/ui): live stream viewer, detection charts, and history.
- **`backend/`** — FastAPI service that detects vehicle brands from live traffic camera streams using YOLO + a custom brand classifier, with WebSocket live events and SQLite stats.
