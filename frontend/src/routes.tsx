import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { createBrowserRouter } from "react-router-dom"
import App from "./App"
import HomePage from "./features/home-page"
import { projects } from "@/lib/projects"

function ProjectFallback() {
  return (
    <div className="flex w-full flex-1 items-center justify-center p-16">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  ...projects.map((project) => ({
    path: project.path,
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<ProjectFallback />}>
            <project.Component />
          </Suspense>
        ),
      },
    ],
  })),
])