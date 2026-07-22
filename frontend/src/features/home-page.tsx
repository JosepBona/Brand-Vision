import { useEffect, useState } from "react"
import { CheckIcon, DownloadIcon, SparklesIcon } from "lucide-react"
import { GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons"
import {
  SiFastapi,
  SiOpencv,
  SiPython,
  SiReact,
  SiTailwindcss,
  SiTypescript,
  SiVite,
} from "react-icons/si"

import { Badge } from "@/components/ui/badge"
import BorderGlow from "@/components/ui/border-glow"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import Particles from "@/components/Particles"
import LogoLoop, { type LogoItem } from "@/components/ui/logo-loop"
import image_3 from "@/assets/image_3.jpg"

const techLogos: LogoItem[] = [
  { node: <SiReact />, title: "React", href: "https://react.dev" },
  {
    node: <SiTypescript />,
    title: "TypeScript",
    href: "https://www.typescriptlang.org",
  },
  {
    node: <SiTailwindcss />,
    title: "Tailwind CSS",
    href: "https://tailwindcss.com",
  },
  { node: <SiVite />, title: "Vite", href: "https://vite.dev" },
  { node: <SiPython />, title: "Python", href: "https://www.python.org" },
  {
    node: <SiFastapi />,
    title: "FastAPI",
    href: "https://fastapi.tiangolo.com",
  },
  { node: <SiOpencv />, title: "OpenCV", href: "https://opencv.org" },
]

interface Project {
  name: string
  tags: string[]
  description: string
  features: string[]
  image?: string
  url?: string
  comingSoon?: boolean
}

const projects: Project[] = [
  {
    name: "Brand Vision",
    tags: ["Python", "Computer Vision", "React"],
    description:
      "Real-time vehicle brand detection over live streams, powered by computer vision.",
    features: [
      "Real-time detection over live streams",
      "YOLO-based vehicle recognition",
      "Brand filtering & live stats",
      "FastAPI backend",
    ],
    image: image_3,
    url: "/brand-vision",
  },
  {
    name: "New project",
    tags: [],
    description: "",
    features: [],
    comingSoon: true,
  },
]

export function HomePage() {
  const [api, setApi] = useState<CarouselApi>()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!api) return
    setIndex(api.selectedScrollSnap())
    api.on("select", () => setIndex(api.selectedScrollSnap()))
  }, [api])

  return (
    <div
      style={{
        backgroundColor: "#050714",
      }}
      className="relative min-h-screen w-full overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <Particles
          particleColors={["#ffffff"]}
          particleCount={250}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={45}
          alphaParticles={true}
          disableRotation={true}
          pixelRatio={2}
        />
      </div>

      {/* Hero */}
      <section
        id="about"
        className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-10 py-16 sm:py-24 lg:grid-cols-2 xl:max-w-7xl xl:px-16"
      >
        <div className="flex flex-col items-start gap-3 text-left">
          <Badge variant="secondary" className="gap-2 px-3 py-1 text-sm">
            <span className="size-2 rounded-full bg-emerald-400" />
            Available for work
          </Badge>
          <h1
            className="bg-clip-text font-heading text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl"
            style={{ backgroundImage: "var(--gradient-teal-blue)" }}
          >
            Josep Bona
          </h1>
          <p className="max-w-xl text-xl text-muted-foreground sm:text-2xl">
            Software developer building interactive web applications with{" "}
            <span className="font-semibold text-foreground">React</span> and
            modern web technologies.
          </p>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Here's a look at what I've been working on.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              nativeButton={false}
              className="border-none text-white"
              style={{ backgroundImage: "var(--gradient-teal-blue)" }}
              render={
                <a
                  href="https://www.linkedin.com/in/bonadev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                />
              }
            >
              <LinkedInLogoIcon className="size-5" />
              LinkedIn
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href="https://github.com/JosepBona"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                />
              }
            >
              <GitHubLogoIcon className="size-5" />
              GitHub
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="lg" variant="outline" aria-label="Download CV">
                    <DownloadIcon className="size-5" />
                    Download CV
                  </Button>
                }
              />
              <DropdownMenuContent align="center">
                <DropdownMenuItem
                  render={
                    <a href="/CV%20Josep%20Bona.pdf" download>
                      Español
                    </a>
                  }
                />
                <DropdownMenuItem
                  render={
                    <a href="/EN_Josep_Bona_CV.pdf" download>
                      English
                    </a>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className="mt-7 w-full"
            style={{ height: "80px", position: "relative", overflow: "hidden" }}
          >
            <LogoLoop
              logos={techLogos}
              speed={60}
              direction="left"
              logoHeight={32}
              gap={56}
              pauseOnHover
              scaleOnHover
              fadeOut
              fadeOutColor="#050714"
              ariaLabel="Technologies I use"
              className="text-muted-foreground"
            />
          </div>
        </div>

        {/* Featured Projects carousel */}
        <div id="projects" className="w-full">
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent>
              {projects.map((p, i) => (
                <CarouselItem key={p.name + i}>
                  {p.comingSoon ? (
                    <Card className="mx-auto h-[32rem] w-full max-w-[27rem] justify-center gap-3 border-dashed p-6 opacity-60">
                      <Badge variant="secondary" className="w-fit">
                        Coming soon
                      </Badge>
                      <h3 className="font-heading text-xl font-bold text-muted-foreground">
                        {p.name}
                      </h3>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <SparklesIcon className="size-4 shrink-0" />
                        Something new is on the way.
                      </p>
                    </Card>
                  ) : (
                    <BorderGlow
                      className="mx-auto h-[32rem] max-w-[27rem]"
                      borderRadius={12}
                      glowRadius={24}
                      backgroundColor="transparent"
                      glowColor="195 80% 70%"
                      colors={["#5eead4", "#38bdf8", "#818cf8"]}
                    >
                      <Card className="h-full w-full gap-0 overflow-hidden pt-0">
                        <img
                          src={p.image}
                          alt={`${p.name} cover`}
                          className="h-auto w-full object-cover"
                        />
                        <div className="flex flex-col gap-2 p-5 pb-6">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {p.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <h3 className="font-heading text-lg font-bold">
                            {p.name}
                          </h3>
                          <p
                            className="mb-2 text-sm font-medium"
                            style={{ color: "oklch(0.78 0.15 255)" }}
                          >
                            {p.description}
                          </p>
                          <ul className="mb-2 flex flex-col gap-1.5">
                            {p.features.map((feature) => (
                              <li
                                key={feature}
                                className="flex items-center gap-2 text-xs text-muted-foreground"
                              >
                                <CheckIcon className="size-3.5 shrink-0 text-primary" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              nativeButton={false}
                              className="flex-1 rounded-md border-none text-white"
                              style={{
                                backgroundImage: "var(--gradient-teal-blue)",
                              }}
                              render={
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                />
                              }
                            >
                              View project
                            </Button>
                            <Button
                              variant="outline"
                              nativeButton={false}
                              render={
                                <a
                                  href="https://github.com/JosepBona/Brand-Vision"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="GitHub"
                                />
                              }
                            >
                              <GitHubLogoIcon className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </BorderGlow>
                  )}
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-3 sm:left-3" />
            <CarouselNext className="right-3 sm:right-3" />
          </Carousel>

          <div className="mt-4 flex items-center justify-center gap-2">
            {projects.map((p, i) => (
              <button
                key={p.name + i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage
