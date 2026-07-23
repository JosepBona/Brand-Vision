import { CarIcon, DownloadIcon } from "lucide-react"
import { GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons"

export const data = {
  projects: [
    {
      name: "Brand Vision",
      url: "/brand-vision",
      icon: (
        <CarIcon
        />
      ),
    },
    {
      name: "Github",
      url: "https://github.com/JosepBona/Portfolio/tree/main/frontend/src/projects/brand-vision",
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
