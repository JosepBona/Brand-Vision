# Portfolio

Single-repo hub for [Josep Bona](https://github.com/JosepBona)'s personal projects. The [home page](frontend/src/features/home-page.tsx) is the landing page and index for every project below.

## Structure

- **`frontend/`** — React + Vite + TypeScript app (shadcn/ui, Tailwind). Each project lives in its own folder under `frontend/src/projects/<slug>/`, and is wired up directly where it's needed: its route + lazy import in `frontend/src/routes.tsx`, its nav entry in `frontend/src/lib/data/sidebar-data.tsx`, and its card in `frontend/src/features/home-page.tsx`. Project pages are lazy-loaded, so visiting the home page never downloads another project's code or dependencies. A project only gets the shared sidebar shell if its own page imports `AppShell` from `frontend/src/App.tsx` — it's opt-in, not automatic.
- **`backend/`** — FastAPI service backing the **Brand Vision** project (see its own README below).

## Projects

- **Brand Vision** — real-time vehicle brand detection from public traffic camera streams (YOLO + a custom brand classifier). See [frontend/src/projects/brand-vision/README.md](frontend/src/projects/brand-vision/README.md).

