# Portfolio

Single-repo hub for [Josep Bona](https://github.com/JosepBona)'s personal projects. The [home page](frontend/src/features/home-page.tsx) is the landing page and index for every project below.

## Structure

- **`frontend/`** — React + Vite + TypeScript app (shadcn/ui, Tailwind). Each project lives in its own folder under `frontend/src/projects/<slug>/`, wired up through a single registry at `frontend/src/lib/projects.tsx` — routes, sidebar nav, and the home page carousel are all derived from that one file. Project pages are lazy-loaded, so visiting the home page never downloads another project's code or dependencies.
- **`backend/`** — FastAPI service backing the **Brand Vision** project (see its own README below).

## Projects

- **Brand Vision** — real-time vehicle brand detection from public traffic camera streams (YOLO + a custom brand classifier). See [frontend/src/projects/brand-vision/README.md](frontend/src/projects/brand-vision/README.md).

## Adding a new project

1. Create `frontend/src/projects/<slug>/`.
2. Add an entry to `frontend/src/lib/projects.tsx`: route path, sidebar icon, home page card copy, and a `lazy(() => import("@/projects/<slug>/page"))` component.

That's it — the new project automatically appears in routing, the sidebar, and the home page.
