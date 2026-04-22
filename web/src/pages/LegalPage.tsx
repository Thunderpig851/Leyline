const LAST_UPDATED = "April 21, 2026";

const sections = [
  {
    title: "General",
    body: [
      "Leyline is a fan-built web application designed to help players organize games, manage live table information, and identify cards during play.",
      "By using Leyline, you agree to use the service lawfully, respectfully, and at your own risk. You are responsible for the information you submit, the rooms you create, and the actions you take while using the platform.",
    ],
  },
  {
    title: "Independent Project",
    body: [
      "Leyline is not affiliated with, endorsed by, sponsored by, or specifically approved by Wizards of the Coast LLC.",
      "Magic: The Gathering, card names, mana symbols, set names, card images, and related marks are the property of Wizards of the Coast LLC and their respective owners.",
    ],
  },
  {
    title: "Accounts And Conduct",
    body: [
      "You agree not to abuse the service, interfere with other players, impersonate another person, scrape or attack the platform, or use Leyline to violate another party's rights.",
      "We may limit access, remove content, or suspend use of the platform if behavior appears harmful, abusive, unlawful, or disruptive to other users or to the service itself.",
    ],
  },
  {
    title: "Game Data And Availability",
    body: [
      "Features such as card recognition, room state, media controls, and live game tools are provided on an as-is and as-available basis. They may be unavailable, delayed, inaccurate, or changed without notice.",
      "You should independently verify important game information. OCR and card-matching results are assistive tools and should not be treated as guaranteed authoritative rulings or game-state truth.",
    ],
  },
  {
    title: "Third-Party Content And Links",
    body: [
      "Leyline may display or link to third-party resources such as Scryfall, TCGplayer, and external media or card data providers. Those services are governed by their own terms, policies, and availability.",
      "We are not responsible for third-party pricing, listings, content accuracy, uptime, or any purchase or interaction that occurs outside Leyline.",
    ],
  },
  {
    title: "Privacy And User Content",
    body: [
      "Leyline may process account details, room activity, media-session metadata, and uploaded card-capture images as needed to operate the product. Avoid uploading or sharing content you do not have the right to use.",
      "Do not upload sensitive personal, financial, or private information into rooms, chat, or card-capture workflows unless you are comfortable with that information being processed to provide the feature.",
    ],
  },
  {
    title: "Changes",
    body: [
      "We may update this page as the product evolves. Continued use of Leyline after changes are posted means you accept the revised terms and notices.",
    ],
  },
] as const;

export default function LegalPage()
{
  return (
    <div className="min-h-full text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[2rem] border border-teal-400/18 bg-slate-950/52 p-6 shadow-[0_0_0_1px_rgba(45,212,191,0.08),0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-8">
          <div className="max-w-3xl">

            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Legal And Platform Notice
              </span>
            </h1>

            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
              Last updated {LAST_UPDATED}
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border border-white/10 bg-slate-900/72 p-5 shadow-[0_18px_50px_-36px_rgba(0,0,0,0.85)]"
              >
                <h2 className="text-lg font-semibold text-slate-50">
                  {section.title}
                </h2>

                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
