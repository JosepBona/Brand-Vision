import type { ReactNode } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./features/app-sidebar"

/**
 * Opt-in layout: a project wraps its own page with this if it wants the
 * shared sidebar shell. Not applied automatically by the router.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex w-full flex-1 flex-col min-w-0">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )
}

export default AppShell
