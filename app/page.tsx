import Image from "next/image"
import { LiquidEtherBackground } from "@/app/components/LiquidEtherBackground"
import { BlurredNavbar } from "@/app/components/BlurredNavbar"
import { ConversationWidget } from "@/app/components/ConversationWidget"

export default function Home() {
  return (
    <div className="text-foreground relative min-h-dvh overflow-x-hidden">
      <LiquidEtherBackground />
      <BlurredNavbar />

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-10 pt-24 sm:pb-14 sm:pt-28">
        <section
          aria-labelledby="hero"
          className="grid items-stretch gap-8 lg:grid-cols-[1fr_520px] lg:gap-8"
        >
          <div className="flex flex-col gap-8 lg:contents">
            {/* H1 block */}
            <div className="rounded-[32px] border bg-background/20 p-5 shadow-sm backdrop-blur-md lg:row-start-1 lg:col-start-1">
              <h1
                id="hero"
                className="text-balance font-[var(--font-nohemi)] text-[28px] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[48px]"
              >
                Du bist nicht sicher, welche IT-Weiterbildung zu dir passt?<br className="hidden lg:block" /> Sprich jetzt mit unserem KI-Berater&nbsp;&#x2B07;
              </h1>
              <Image
                src="/hero-it.webp"
                alt="IT Weiterbildung – 100% Kostenübernahme"
                width={1200}
                height={628}
                className="mt-5 hidden w-full h-auto rounded-2xl lg:block"
              />

              {/* Subtitle + bullets + CTA — hidden on mobile, shown on desktop */}
              <p className="text-pretty mt-4 hidden text-base leading-7 text-foreground/75 sm:text-lg lg:block">
                Unser KI-Berater hilft dir kostenlos und unverbindlich, die
                passende Entwicklung &amp; IT Weiterbildung zu finden – aus
                über 50.000 Angeboten von mehr als 2.500 zertifizierten
                Anbietern. Mit Bildungsgutschein bis zu 100&nbsp;% gefördert.
              </p>

              <ul className="mt-4 hidden list-disc pl-5 space-y-1 text-sm leading-6 text-foreground/75 lg:block">
                <li>Durchschnittliches IT-Gehalt: 65.000&nbsp;&euro;</li>
                <li>Sehr gute Jobaussichten – IT-Fachkräfte stark nachgefragt</li>
                <li>Bis zu 100&nbsp;% Förderung über den Bildungsgutschein</li>
              </ul>

            </div>

            {/* Chat widget */}
            <div
              id="chat"
              className="w-full lg:row-start-1 lg:col-start-2 lg:sticky lg:top-24"
              style={{ scrollMarginTop: 80 }}
            >
              <ConversationWidget />
            </div>

            {/* Subtitle + CTA + Stats — below chat on mobile only */}
            <div className="rounded-[32px] border bg-background/20 p-5 shadow-sm backdrop-blur-md lg:hidden">
              <Image
                src="/hero-it.webp"
                alt="IT Weiterbildung – 100% Kostenübernahme"
                width={1200}
                height={628}
                className="w-full h-auto rounded-2xl"
                priority
              />
              <div className="mt-5">
              <p className="text-pretty text-base leading-7 text-foreground/75 sm:text-lg">
                Unser KI-Berater hilft dir kostenlos und unverbindlich, die
                passende Entwicklung &amp; IT Weiterbildung zu finden – aus
                über 50.000 Angeboten von mehr als 2.500 zertifizierten
                Anbietern. Mit Bildungsgutschein bis zu 100&nbsp;% gefördert.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#chat"
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  Jetzt kostenlos beraten lassen
                </a>
              </div>

              <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-3">
                <div className="min-w-0 rounded-3xl border bg-background/10 p-4">
                  <div className="text-2xl font-bold">65.000&nbsp;&euro;</div>
                  <p className="mt-1 text-sm leading-6 text-foreground/70">
                    Durchschnittliches Gehalt im IT-Bereich
                  </p>
                </div>
                <div className="min-w-0 rounded-3xl border bg-background/10 p-4">
                  <div className="text-2xl font-bold">Sehr gut</div>
                  <p className="mt-1 text-sm leading-6 text-foreground/70">
                    Jobaussichten – IT-Fachkräfte sind stark nachgefragt
                  </p>
                </div>
                <div className="min-w-0 rounded-3xl border bg-background/10 p-4">
                  <div className="text-2xl font-bold">100&nbsp;%</div>
                  <p className="mt-1 text-sm leading-6 text-foreground/70">
                    Förderung möglich über den Bildungsgutschein
                  </p>
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="about"
          className="mt-12 grid gap-4 md:grid-cols-3"
        >
          <h2 id="about" className="md:col-span-3 font-[var(--font-nohemi)] text-xl font-bold tracking-tight sm:text-2xl">
            Warum GenauMeinKurs?
          </h2>
          <div className="rounded-3xl border bg-background/15 p-5 backdrop-blur-md">
            <div className="text-sm font-medium">Unabhängig</div>
            <p className="mt-2 text-sm leading-6 text-foreground/70">
              Neutrale Beratung ohne Anbieter-Bias – wir empfehlen nur, was
              wirklich zu deinen Zielen passt.
            </p>
          </div>
          <div className="rounded-3xl border bg-background/15 p-5 backdrop-blur-md">
            <div className="text-sm font-medium">100&nbsp;% kostenlos</div>
            <p className="mt-2 text-sm leading-6 text-foreground/70">
              Service komplett kostenlos. Bei Arbeitslosigkeit übernimmt der
              Bildungsgutschein die Kurskosten.
            </p>
          </div>
          <div className="rounded-3xl border bg-background/15 p-5 backdrop-blur-md">
            <div className="text-sm font-medium">
              &gt;2.500 zertifizierte Anbieter
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground/70">
              Zugriff auf über 50.000 Weiterbildungen von geprüften,
              AZAV-zertifizierten Bildungsträgern.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-[var(--font-nohemi)] text-xl font-bold tracking-tight sm:text-2xl">
            Beliebte IT-Weiterbildungen
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Softwareentwicklung", desc: "Python, Java, PHP – moderne Programmiersprachen lernen und professionelle Software entwickeln." },
              { title: "Webentwicklung", desc: "HTML, CSS, JavaScript – moderne Websites und Webanwendungen von Grund auf bauen." },
              { title: "App-Entwicklung", desc: "Native und Cross-Platform Apps für Android und iOS mit Swift, Kotlin, React Native oder Flutter." },
              { title: "DevOps & CI/CD", desc: "Entwicklung und Betrieb durch Automatisierung verbinden – Docker, Kubernetes, Cloud-Pipelines." },
              { title: "KI-gestützte Entwicklung", desc: "Tools wie GitHub Copilot nutzen, um effizienter und schneller Software zu entwickeln." },
              { title: "Cloud & Datenbanken", desc: "SQL, NoSQL und moderne Datenbank-Technologien für skalierbare Cloud-Anwendungen." },
              { title: "UI/UX Design", desc: "Benutzerfreundliche Interfaces gestalten und User Experience systematisch optimieren." },
              { title: "Scrum & Agile Methoden", desc: "IT-Projekte agil planen und durchführen – Scrum Master, Product Owner und mehr." },
            ].map((topic) => (
              <div
                key={topic.title}
                className="rounded-2xl border bg-background/10 p-4 backdrop-blur-md"
              >
                <div className="text-sm font-medium">{topic.title}</div>
                <p className="mt-1 text-xs leading-5 text-foreground/60">{topic.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-[32px] border bg-background/15 p-5 backdrop-blur-md">
          <h2 className="font-[var(--font-nohemi)] text-xl font-bold tracking-tight sm:text-2xl">
            Voraussetzungen &amp; Zielgruppe
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Das solltest du mitbringen</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground/70">
                <li>Logisches Denkvermögen</li>
                <li>Computer-Grundkenntnisse</li>
                <li>Grundlegende Englischkenntnisse</li>
                <li>Lernbereitschaft für neue Technologien</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium">Für wen ist das geeignet?</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground/70">
                <li>Arbeitssuchende mit oder ohne IT-Erfahrung</li>
                <li>Quereinsteiger mit Interesse an Technik</li>
                <li>Berufstätige, die sich weiterentwickeln möchten</li>
                <li>Entwickler, die sich spezialisieren wollen</li>
              </ul>
            </div>
          </div>
          <div className="mt-6">
            <a
              href="#chat"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Jetzt passende Kurse finden
            </a>
          </div>
        </section>

        <footer className="mt-12 text-xs text-foreground/60">
          GenauMeinKurs ist ein kostenloser und unabhängiger Suchagent für
          Weiterbildungen. Alle Kurse können bis zu 100&nbsp;% über den
          Bildungsgutschein gefördert werden.
        </footer>
      </main>
    </div>
  )
}
