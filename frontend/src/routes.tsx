import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { createBrowserRouter } from "react-router-dom"
import HomePage from "./features/home-page"

const BrandVisionPage = lazy(() => import("@/projects/brand-vision/page"))

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
  {
    path: "/brand-vision",
    element: (
      <Suspense fallback={<ProjectFallback />}>
        <BrandVisionPage />
      </Suspense>
    ),
  },
])
