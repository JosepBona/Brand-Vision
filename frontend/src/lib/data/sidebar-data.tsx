import { CarIcon, BookOpenIcon, DownloadIcon } from "lucide-react"
import linkedin_logo from "@/assets/linkeding-logo.png"

// lucide-react doesn't include third-party brand logos (same thing
// happened with LinkedIn): inline octocat SVG instead of a separate
// image asset.
function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.81-.01 3.19 0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  )
}

export const data = {
  projects: [
    {
      name: "Brand Vision",
      url: "/",
      icon: (
        <CarIcon
        />
      ),
    },
    {
      name: "Documentation",
      url: "#",
      icon: (
        <BookOpenIcon
        />
      ),
    },
    {
      name: "Github",
      url: "https://github.com/JosepBona/Brand-Vision",
      icon: (
        <GithubIcon
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
        <img src={linkedin_logo} alt="" className="size-4" />
      ),
      external: true,
    },
  ],
}
