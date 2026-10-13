import Link from "next/link";
import { ArrowRight, GraduationCap, Search, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureAccordion } from "@/components/landing/FeatureAccordion";
import { FeatureMarquee } from "@/components/landing/FeatureMarquee";
import { HeroTypewriter } from "@/components/landing/HeroTypewriter";
import { Reveal } from "@/components/landing/Reveal";
import { WorkflowShowcase } from "@/components/landing/WorkflowShowcase";
import { ROLE_HOME } from "@/utils/auth/dal";
import { getSession } from "@/utils/auth/session";

async function resolveConsoleHref(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return ROLE_HOME[session.role] ?? "/onboarding";
}

const NAV_ITEMS = [
  { label: "Student recorder", href: "#hero" },
  { label: "Teacher workflow", href: "#practice" },
  { label: "Deployment", href: "#deployment" },
  { label: "Get started", href: "#cta" },
];

const DEPLOYMENT_TIERS = [
  {
    name: "Manual",
    detail: "Teacher-ready fallback",
    body: "Use the recorder, upload pipeline, and grade review flow before provisioning AI infrastructure.",
  },
  {
    name: "CPU-assisted",
    detail: "Low-cost automation",
    body: "Add transcription and baseline scoring for smaller classrooms where throughput is modest and hardware budgets are tight.",
  },
  {
    name: "GPU-accelerated",
    detail: "Full inference path",
    body: "Run the complete pronunciation and fluency stack with the worker queue constrained to safe GPU concurrency.",
  },
];

export default async function Home() {
  const consoleHref = await resolveConsoleHref();
  const primaryHref = consoleHref ?? "/login";
  const primaryLabel = consoleHref ? "Open your console" : "Start with RoutLang";

  return (
    <div className="min-h-full flex-1 bg-[linear-gradient(180deg,rgba(20,18,17,1)_0%,rgba(17,17,17,1)_48%,rgba(12,12,12,1)_100%)] text-white">
      {/* load-time cover: fades off over 0.4s, first beat of the hero sequence */}
      <div aria-hidden className="lp-cover" />

      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(251,146,60,0.13),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(245,158,11,0.08),transparent_24%),radial-gradient(circle_at_50%_92%,rgba(16,185,129,0.1),transparent_34%)]"
        />

        <header className="relative z-20">
          <div className="mx-auto flex w-full max-w-[1380px] items-center justify-between gap-6 px-5 pt-7 sm:px-8 lg:px-10">
            <div className="flex items-center gap-4 lg:gap-9">
              <Link href="/" className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full border border-white/14 bg-white/6 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
                  <GraduationCap className="size-5 text-orange-300" />
                </span>
                <span className="text-sm font-semibold tracking-tight">RoutLang</span>
              </Link>

              <nav className="hidden items-center gap-6 lg:flex">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-1 text-[0.88rem] font-medium text-white/92 transition hover:text-white"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3 lg:hidden">
              {consoleHref ? (
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-xl bg-primary px-4 text-[0.82rem] text-primary-foreground hover:bg-primary/92"
                >
                  <Link href={consoleHref}>Console</Link>
                </Button>
              ) : (
                <>
                  <Link href="/login" className="text-[0.85rem] font-medium text-white/88">
                    Sign in
                  </Link>
                  <Button
                    asChild
                    size="sm"
                    className="h-10 rounded-xl bg-primary px-4 text-[0.82rem] text-primary-foreground hover:bg-primary/92"
                  >
                    <Link href="/login">Start</Link>
                  </Button>
                </>
              )}
            </div>

            <div className="hidden items-center gap-4 lg:flex">
              <div className="flex h-12 min-w-[290px] items-center gap-3 rounded-xl border border-white/12 bg-white/6 px-4 text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Search className="size-4" />
                <span className="flex-1 text-sm">Search recorder, review, or deployment...</span>
                <span className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/45">
                  /
                </span>
              </div>

              {consoleHref ? (
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/92"
                >
                  <Link href={consoleHref}>Go to console</Link>
                </Button>
              ) : (
                <>
                  <Link href="/login" className="px-2 text-[0.92rem] font-medium text-white/90">
                    Sign in
                  </Link>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl border-white/24 bg-transparent px-5 text-white hover:bg-white/8 hover:text-white"
                  >
                    <Link href="/login">Sign up</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="relative z-10">
          {/* ============ HERO: cover → borders draw in (1s) → visual (0.4s @ 1.2s) ============ */}
          <section id="hero" className="relative isolate overflow-hidden">
            <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10">
              <div className="lp-hero-frame mx-auto flex flex-col items-center px-4 pt-16 pb-0 text-center sm:px-10 sm:pt-20 sm:pb-0">
                <div className="flex min-h-[30px] items-center gap-2 rounded-full border border-white/12 bg-black/25 px-4 py-1.5">
                  <span className="lp-glow-pulse size-1.5 rounded-full bg-orange-400" aria-hidden />
                  <HeroTypewriter />
                </div>

                <h1 className="mt-7 max-w-[680px] text-balance text-[2.1rem] leading-[1.04] font-semibold tracking-[-0.035em] sm:text-[3rem] lg:text-[3.6rem]">
                  Spoken practice, scoring, and review in one platform.
                </h1>

                <p className="mt-5 max-w-[520px] text-[0.92rem] leading-6 text-white/72 sm:text-[0.98rem] sm:text-balance">
                  Record against a reference track, review submissions fast, and
                  keep the workflow live across manual, CPU, or GPU deployments.
                </p>

                <div className="mt-8 flex w-full max-w-[460px] flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button
                    asChild
                    size="lg"
                    className="h-[54px] rounded-xl bg-primary px-6 text-[0.88rem] font-semibold text-primary-foreground hover:bg-primary/92 sm:min-w-[220px]"
                  >
                    <Link href={primaryHref}>
                      {primaryLabel}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-[54px] rounded-xl border-white/30 bg-transparent px-6 text-[0.88rem] text-white hover:bg-white/8 hover:text-white sm:min-w-[200px]"
                  >
                    <a href="#practice">See how it works</a>
                  </Button>
                </div>

                <div className="lp-hero-visual relative mt-14 -mb-10 w-full max-w-[1280px] sm:mt-16 sm:-mb-12">
                  {/* orange halo — GitHub's hero glow recipe, recolored */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 -top-6 -bottom-8 rounded-[1.4rem] bg-[radial-gradient(141%_114%_at_87%_55%,rgba(249,115,22,0.42)_36%,transparent_100%)] opacity-80 mix-blend-plus-lighter blur-[36px]"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-x-[-6%] bottom-[-18%] h-[55%] bg-[linear-gradient(rgba(39,50,231,0)_45%,rgba(16,185,129,0.22)_113%)] blur-2xl"
                  />
                  <div className="relative">
                    <WorkflowShowcase />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ============ MARQUEE band (LogoSuite pattern) ============ */}
          <section className="relative z-20 border-y border-white/10 bg-[rgba(8,8,8,0.72)] py-9 backdrop-blur-md">
            <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10">
              <FeatureMarquee />
            </div>
          </section>

          {/* ============ FEATURES: reveal intro + accordion with crossfade ============ */}
          <section id="practice" className="relative z-20 overflow-hidden">
            {/* section beam — GitHub's rotated radial glow, in orange */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-[22%] h-72 w-[56%] -translate-y-2/3 rotate-[-45deg] bg-[radial-gradient(circle_at_0_100%,rgba(254,215,170,0.4)_10%,rgba(234,88,12,0.32)_22%,transparent_60%)] blur-[40px]"
            />
            <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:px-10">
              <Reveal className="mx-auto mb-14 flex max-w-[760px] flex-col items-center gap-4 text-center">
                <span className="lp-float flex size-12 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-xl">
                  🎙️
                </span>
                <h2 className="text-balance text-[1.8rem] font-semibold tracking-tight text-white sm:text-[2.4rem]">
                  Built for school constraints, not demo-day assumptions
                </h2>
                <p className="max-w-[620px] text-sm leading-7 text-white/62">
                  The recorder, review workflow, and deployment tiers were shaped
                  around what a school can actually run, not around a requirement
                  that every deployment start with a live GPU stack.
                </p>
              </Reveal>

              <FeatureAccordion />
            </div>
          </section>

          {/* ============ DEPLOYMENT TIERS: staggered reveal + hover frames ============ */}
          <section
            id="deployment"
            className="relative z-20 border-y border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]"
          >
            <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:px-10">
              <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-orange-300 uppercase">
                    Deployment tiers
                  </p>
                  <h2 className="mt-3 text-[1.8rem] font-semibold tracking-tight text-white sm:text-[2.4rem]">
                    Start with the tier your school can actually support
                  </h2>
                </div>
                <p className="max-w-xl text-sm leading-7 text-white/62">
                  Manual review, CPU-assisted scoring, and GPU-accelerated grading
                  all preserve the same product shape. The school chooses the
                  infrastructure threshold, not the other way around.
                </p>
              </Reveal>

              <Reveal className="mt-12 grid gap-5 lg:grid-cols-3">
                {DEPLOYMENT_TIERS.map((tier) => (
                  <div
                    key={tier.name}
                    className="lp-hover-parent relative rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-sm"
                  >
                    <span aria-hidden className="lp-hover-frame rounded-[2rem]" />
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-2xl font-semibold tracking-tight text-white">
                        {tier.name}
                      </h3>
                      <Server className="size-5 text-orange-300" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-orange-200">{tier.detail}</p>
                    <p className="mt-4 text-sm leading-7 text-white/66">{tier.body}</p>
                  </div>
                ))}
              </Reveal>
            </div>
          </section>

          {/* ============ CTA banner: floating mascots + reveal ============ */}
          <section id="cta" className="relative z-20 overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(249,115,22,0.22),transparent_70%)] blur-2xl"
            />
            <div className="mx-auto max-w-[900px] px-5 py-24 text-center sm:px-8">
              <div className="mb-8 flex items-end justify-center gap-8" aria-hidden>
                <span className="lp-float-slow block size-10 rounded-[46%_54%_52%_48%/54%_46%_54%_46%] bg-[radial-gradient(circle_at_32%_28%,#fed7aa,#f97316_55%,#9a3412)] shadow-[0_0_34px_rgba(249,115,22,0.35)]" />
                <span className="lp-float lp-glow-pulse block size-12 rounded-full bg-[radial-gradient(circle_at_35%_30%,#a7f3c0,#10b981_60%,#065f46)] shadow-[0_0_38px_rgba(16,185,129,0.3)]" />
                <span
                  className="lp-float block size-9 rounded-xl bg-[linear-gradient(135deg,#fde68a,#f59e0b)] shadow-[0_0_30px_rgba(245,158,11,0.3)]"
                  style={{ animationDelay: "0.8s" }}
                />
              </div>

              <Reveal className="flex flex-col items-center gap-6">
                <h2 className="max-w-[640px] text-balance text-[1.9rem] font-semibold tracking-tight text-white sm:text-[2.6rem]">
                  Every classroom calls a different tier home. The product stays
                  the same.
                </h2>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="h-[54px] rounded-xl bg-primary px-8 text-[0.88rem] font-semibold text-primary-foreground hover:bg-primary/92"
                  >
                    <Link href={primaryHref}>
                      {primaryLabel}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-[54px] rounded-xl border-white/30 bg-transparent px-8 text-[0.88rem] text-white hover:bg-white/8 hover:text-white"
                  >
                    <a href="#deployment">Compare tiers</a>
                  </Button>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-4 px-5 py-10 text-center sm:px-8 lg:flex-row lg:px-10 lg:text-left">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-white/14 bg-white/6">
                <GraduationCap className="size-4 text-orange-300" />
              </span>
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">RoutLang</div>
                <div className="text-xs tracking-[0.16em] text-white/45 uppercase">
                  Self-hosted school speaking platform
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/58">
              <a href="#practice" className="transition hover:text-white">
                Workflow
              </a>
              <a href="#deployment" className="transition hover:text-white">
                Deployment
              </a>
              <Link href="/login" className="transition hover:text-white">
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
