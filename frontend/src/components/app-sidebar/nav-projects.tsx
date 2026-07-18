"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavProjectsProps } from "@/types/app-sidebar"

export function NavProjects({ label, projects }: NavProjectsProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="4xl:text-sm">{label}</SidebarGroupLabel>
      <SidebarMenu className="4xl:gap-1.5">
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              tooltip={item.name}
              className="4xl:h-11 4xl:gap-3 4xl:px-3 4xl:text-base 4xl:[&>svg]:size-5"
              render={
                <a
                  href={item.url}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  download={item.download}
                />
              }
            >
              {item.icon}
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
