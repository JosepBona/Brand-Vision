import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from "react"
import { CarIcon } from "lucide-react"

import image_3 from "@/assets/image_3.jpg"

export interface ProjectCard {
  tags: string[]
  description: string
  features: string[]
  image?: string
}

export interface ProjectEntry {
  slug: string
  name: string
  path: string
  icon: ReactNode
  Component: LazyExoticComponent<ComponentType>
  repoUrl?: string
  card: ProjectCard
}

/**
 * Single source of truth for every project in the portfolio.
 * Adding a project here wires it into routing, the sidebar nav,
 * and the home page carousel automatically.
 */
export const projects: ProjectEntry[] = [
  {
    slug: "brand-vision",
    name: "Brand Vision",
    path: "/brand-vision",
    icon: <CarIcon />,
    Component: lazy(() => import("@/projects/brand-vision/page")),
    repoUrl: "https://github.com/JosepBona/Portfolio",
    card: {
      tags: ["Python", "Computer Vision", "React"],
      description:
        "Find the vehicle brand you're looking for — powered by computer vision technology.",
      features: [
        "Real-time detection over live streams",
        "YOLO-based vehicle recognition",
        "Brand filtering & live stats",
        "FastAPI backend",
      ],
      image: image_3,
    },
  },
]
