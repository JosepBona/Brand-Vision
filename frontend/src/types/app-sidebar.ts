import type { ReactNode } from "react"

export interface NavProjectsProps {
  label: string
  projects: {
    name: string
    url: string
    icon: ReactNode
    external?: boolean
    download?: boolean
  }[]
}
