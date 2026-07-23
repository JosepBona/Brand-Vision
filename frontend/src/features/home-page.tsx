import { useEffect, useState } from "react"
import { CheckIcon, DownloadIcon, SparklesIcon } from "lucide-react"
import { GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons"
import {
  SiFastapi,
  SiOpencv,
  SiPython,
  SiReact,
  SiTailwindcss,
  SiShadcnui,
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

import ShinyText from "@/components/ShinyText"
import Particles from "@/components/Particles"
import LogoLoop, { type LogoItem } from "@/components/ui/logo-loop"
import TextType from "@/components/TextType"
import { projects } from "@/lib/projects"

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
  {
    node: <SiShadcnui />,
    title: "shadcn/ui",
    href: "https://ui.shadcn.com",
  },
  { node: <SiPython />, title: "Python", href: "https://www.python.org" },
  {
    node: <SiFastapi />,
    title: "FastAPI",
    href: "https://fastapi.tiangolo.com",
  },
  { node: <SiOpencv />, title: "OpenCV", href: "https://opencv.org" },
]

const comingSoonSlide = {
  slug: "coming-soon",
  name: "New project",
  comingSoon: true as const,
}

type CarouselSlide = (typeof projects)[number] | typeof comingSoonSlide

const slides: CarouselSlide[] = [...projects, comingSoonSlide]

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
          particleCount={1200}
          particleSpread={15}
          speed={0.1}
          particleBaseSize={42}
          alphaParticles={true}
          disableRotation={true}
          pixelRatio={2}
        />
      </div>

      {/* Hero */}
      <section
        id="about"
        className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-10 py-16 sm:py-24 lg:grid-cols-2 xl:max-w-7xl xl:px-16 3xl:max-w-[110rem] 3xl:gap-14 3xl:px-24 3xl:py-32 4xl:max-w-[150rem] 4xl:gap-14 4xl:px-32 4xl:py-40"
      >
        <div className="flex flex-col items-start gap-3 text-left 3xl:pl-12 4xl:gap-5 4xl:pl-20">
          <Badge
            variant="secondary"
            className="gap-2 px-3 py-1 text-sm 3xl:gap-3 3xl:px-5 3xl:py-2 3xl:text-lg 4xl:gap-4 4xl:px-6 4xl:py-2.5 4xl:text-xl"
          >
            <span className="size-2 rounded-full bg-emerald-400" />
            Open to Work
          </Badge>

          <div className="flex"></div>
          <h1
            className="bg-clip-text font-heading text-4xl font-bold text-transparent sm:text-6xl lg:text-4xl 3xl:text-6xl 4xl:text-7xl"
            style={{ backgroundImage: "var(--gradient-teal-blue)" }}
          >
            <TextType
              text={["Hello, I'm Josep Bona"]}
              typingSpeed={75}
              pauseDuration={10500}
            
              cursorCharacter=""
              deletingSpeed={50}
              cursorBlinkDuration={0.5}
              cursorClassName="bg-clip-text text-transparent"
            />
          </h1>
          <p className="max-w-xl text-xl text-muted-foreground sm:text-2xl 3xl:max-w-3xl 3xl:text-4xl 4xl:max-w-4xl 4xl:text-5xl 4xl:leading-[1.15]">
            Software developer building interactive web applications with
            <span className="font-semibold text-foreground">
              <ShinyText
                text="✨React "
                speed={2}
                delay={0}
                color="#b5b5b5"
                shineColor="#ffffff"
                spread={120}
                direction="left"
                yoyo={false}
                pauseOnHover={false}
                disabled={false}
              />
            </span>{" "}
            and modern technologies.
          </p>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg 3xl:max-w-3xl 3xl:text-2xl 4xl:max-w-4xl 4xl:text-3xl">
            Here's a look at what I've been working on.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 3xl:gap-4">
            <Button
              size="lg"
              nativeButton={false}
              className="border-none text-white 3xl:h-14 3xl:px-8 3xl:text-xl 4xl:h-16 4xl:px-10 4xl:text-2xl"
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
              className="3xl:h-14 3xl:px-8 3xl:text-xl 4xl:h-16 4xl:px-10 4xl:text-2xl"
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
                  <Button
                    size="lg"
                    variant="outline"
                    aria-label="Download CV"
                    className="3xl:h-14 3xl:px-8 3xl:text-xl 4xl:h-16 4xl:px-10 4xl:text-2xl"
                  >
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
            className="mt-7 w-full 3xl:mt-10"
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
        <div id="projects" className="mx-auto w-full max-w-[27rem] 4xl:max-w-[44rem]">
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent>
              {slides.map((p, i) => (
                <CarouselItem key={p.slug + i}>
                  {"comingSoon" in p ? (
                    <Card className="mx-auto h-[32rem] w-full max-w-[27rem] justify-center gap-3 border-dashed p-6 opacity-60 4xl:h-[50rem] 4xl:max-w-[44rem] 4xl:p-11">
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
                      className="mx-auto h-[32rem] max-w-[27rem] 4xl:h-[50rem] 4xl:max-w-[44rem]"
                      borderRadius={12}
                      glowRadius={24}
                      backgroundColor="transparent"
                      glowColor="195 80% 70%"
                      colors={["#5eead4", "#38bdf8", "#818cf8"]}
                    >
                      <Card className="h-full w-full gap-0 overflow-hidden pt-0">
                        <img
                          src={p.card.image}
                          alt={`${p.name} cover`}
                          className="h-auto w-full object-cover"
                        />
                        <div className="flex flex-col gap-2 p-5 pb-6 3xl:gap-3 3xl:p-7 3xl:pb-8 4xl:gap-4 4xl:p-9 4xl:pb-10">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {p.card.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="3xl:px-4 3xl:py-1.5 3xl:text-base 4xl:px-5 4xl:py-2 4xl:text-lg"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <h3 className="font-heading text-lg font-bold 3xl:text-3xl 4xl:text-4xl">
                            {p.name}
                          </h3>
                          <p
                            className="mb-2 text-sm font-medium 3xl:text-lg 4xl:text-xl"
                            style={{ color: "oklch(0.78 0.15 255)" }}
                          >
                            {p.card.description}
                          </p>
                          <ul className="mb-2 flex flex-col gap-1.5 3xl:gap-2">
                            {p.card.features.map((feature) => (
                              <li
                                key={feature}
                                className="flex items-center gap-2 text-xs text-muted-foreground 3xl:text-base 4xl:text-lg"
                              >
                                <CheckIcon className="size-3.5 shrink-0 text-primary" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex items-center gap-2 3xl:mt-3 3xl:gap-3">
                            <Button
                              nativeButton={false}
                              className="flex-1 rounded-md border-none text-white 3xl:h-12 3xl:text-lg 4xl:h-14 4xl:text-xl"
                              style={{
                                backgroundImage: "var(--gradient-teal-blue)",
                              }}
                              render={
                                <a
                                  href={p.path}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                />
                              }
                            >
                              View project
                            </Button>
                            {p.repoUrl && (
                              <Button
                                variant="outline"
                                nativeButton={false}
                                render={
                                  <a
                                    href={p.repoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="GitHub"
                                  />
                                }
                              >
                                <GitHubLogoIcon className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </BorderGlow>
                  )}
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="-left-10 sm:-left-10 3xl:-left-14 3xl:size-5 4xl:-left-16 4xl:size-9" />
            <CarouselNext className="-right-10 sm:-right-10 3xl:-right-14 3xl:size-5 4xl:-right-16 4xl:size-9" />
          </Carousel>

          <div className="mt-4 flex items-center justify-center gap-2">
            {slides.map((p, i) => (
              <button
                key={p.slug + i}
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
