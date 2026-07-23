import { CarIcon, DownloadIcon, HomeIcon } from "lucide-react"
import { GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons"

export const data = {
  projects: [
    {
      name: "Home",
      url: "/",
      icon: (
        <HomeIcon
        />
      ),
    },
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
      url: "https://github.com/JosepBona/Brand-Vision",
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
