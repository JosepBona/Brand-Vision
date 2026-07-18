"use client"

import * as React from "react"

import { NavProjects } from "@/components/app-sidebar/nav-projects"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import me_logo from "@/assets/me_logo.png"
import { data } from "@/lib/data/sidebar-data"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="icon"
      className="4xl:[--sidebar-width:18.67rem]"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<div />}
              className="4xl:h-16 4xl:gap-3 4xl:p-3"
            >
              <Avatar size="lg" className="4xl:!size-14">
                <AvatarImage src={me_logo} alt="BonaDev" />
                <AvatarFallback>BD</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium 4xl:text-base">
                  BonaDev
                </span>
                <span className="truncate text-xs 4xl:text-sm">
                  Portfolio
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavProjects label="Project" projects={data.projects} />
        <NavProjects label="About me" projects={data.aboutMe} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
