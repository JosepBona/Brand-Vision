import { DownloadIcon } from "lucide-react"
import { GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons"
import { projects } from "@/lib/projects"

export const data = {
  projects: [
    ...projects.map((project) => ({
      name: project.name,
      url: project.path,
      icon: project.icon,
    })),
    {
      name: "Github",
      url: "https://github.com/JosepBona",
      icon: (
        <GitHubLogoIcon
        />
      ),
      external: true,
    },
  ],
  aboutMe: [
    {
      name: "Download CV",
      url: "/CV%20Josep%20Bona.pdf",
      icon: (
        <DownloadIcon
        />
      ),
      download: true,
    },
    {
      name: "LinkedIn",
      url: "https://www.linkedin.com/in/bonadev/",
      icon: (
        <LinkedInLogoIcon
        />
      ),
      external: true,
    },
  ],
}
