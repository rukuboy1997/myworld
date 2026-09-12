import React from "react";
import Layout from "../components/Layout.jsx";

export default function ChildSafetyPage() {
return (
<Layout>
<main className="flex-1 px-4 pt-10 pb-20 md:pt-16">
<div className="max-w-4xl mx-auto">
{/* Header */}
<div className="text-center mb-10">
<div className="w-20 h-20 mx-auto mb-6">
<img
src="/logo.png"
alt="myWorld Logo"
className="w-full h-full rounded-3xl object-contain drop-shadow-[0_0_25px_rgba(56,189,248,0.4)]"
/>
</div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Child Safety <span className="text-gradient">Standards</span>
        </h1>

        <p className="text-muted-foreground">
          Last Updated: September 12, 2026
        </p>
      </div>

      {/* Child Safety Standards */}
      <article className="glass-panel rounded-3xl p-6 md:p-10 lg:p-12 space-y-10">

        {/* Introduction */}
        <section>
          <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
            At <strong className="text-foreground">myWorld</strong>, we
            are committed to maintaining a safe and respectful environment
            for our users. We have{" "}
            <strong className="text-foreground">
              zero tolerance for child sexual abuse and exploitation (CSAE)
            </strong>{" "}
            and child sexual abuse material (CSAM).
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            These Child Safety Standards explain the types of conduct that
            are prohibited on myWorld, how users can report child-safety
            concerns, and how we may respond to violations.
          </p>
        </section>

        {/* 1 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            1. Zero Tolerance for Child Sexual Abuse and Exploitation
          </h2>

          <p className="text-muted-foreground leading-relaxed mb-4">
            myWorld strictly prohibits any activity involving the sexual
            abuse, exploitation, or endangerment of children.
          </p>

          <p className="text-muted-foreground leading-relaxed mb-4">
            Prohibited conduct includes, but is not limited to:
          </p>

          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Child sexual abuse and exploitation.</li>
            <li>
              Creating, uploading, sharing, requesting, soliciting, or
              distributing child sexual abuse material (CSAM).
            </li>
            <li>Sexual content involving minors.</li>
            <li>Sexual solicitation or grooming of minors.</li>
            <li>
              Using myWorld to facilitate the sexual exploitation or
              trafficking of children.
            </li>
            <li>
              Attempting to arrange sexual contact with a minor.
            </li>
            <li>
              Any other behavior that sexually exploits, harms, or
              endangers a child.
            </li>
          </ul>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            2. Child Sexual Abuse Material (CSAM)
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            myWorld does not permit users to create, upload, request,
            distribute, promote, or facilitate child sexual abuse
            material.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            Any suspected CSAM or other material involving the sexual
            exploitation of children may be subject to immediate
            enforcement action and, where appropriate or legally required,
            reporting to relevant authorities.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            3. Prohibited Grooming and Sexual Solicitation
          </h2>

          <p className="text-muted-foreground leading-relaxed mb-4">
            Users must not use myWorld to establish or maintain contact
            with a child for the purpose of sexual exploitation or abuse.
          </p>

          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Sexual grooming of minors.</li>
            <li>Soliciting sexual images or videos from minors.</li>
            <li>
              Encouraging or facilitating sexual activity involving minors.
            </li>
            <li>
              Attempting to arrange sexual encounters with minors.
            </li>
            <li>
              Directing minors toward sexual or exploitative services,
              content, or activities.
            </li>
          </ul>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            4. Reporting Child-Safety Concerns
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            myWorld provides users with an in-app mechanism for reporting
            content, accounts, or behavior that may violate our community
            standards, including child-safety concerns.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            If you encounter content or behavior that you believe involves
            the sexual abuse or exploitation of a child, please report it
            as soon as possible using the available reporting feature in
            the app.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            When making a report, users should provide relevant information
            that can help us understand and investigate the concern,
            including the username or account involved and the relevant
            content or interaction where applicable.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            5. Action Against Violations
          </h2>

          <p className="text-muted-foreground leading-relaxed mb-4">
            When myWorld becomes aware of activity that violates these
            standards, we may take appropriate enforcement action.
          </p>

          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Remove prohibited content.</li>
            <li>Restrict access to content or platform features.</li>
            <li>Suspend an account.</li>
            <li>Permanently terminate an account.</li>
            <li>
              Preserve relevant information where appropriate and legally
              permitted.
            </li>
            <li>
              Report suspected illegal activity to appropriate authorities
              where required or appropriate under applicable law.
            </li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            6. User Responsibility
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            Every user is responsible for using myWorld lawfully and in
            accordance with our Terms of Service and community standards.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            Users must not use myWorld to exploit, abuse, threaten, groom,
            sexually solicit, or otherwise endanger children.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            Users should report suspected child-safety violations through
            the available reporting mechanisms rather than attempting to
            investigate or confront suspected offenders themselves.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            7. Cooperation With Authorities
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            myWorld is committed to complying with applicable child-safety
            laws and regulations.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            Where legally required, we may cooperate with appropriate
            law-enforcement, regulatory, or child-protection authorities
            regarding suspected child sexual abuse and exploitation.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            Where appropriate and legally permitted, information may be
            preserved or disclosed in response to valid legal requests or
            applicable reporting obligations.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            8. Child Safety Contact
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            For questions, concerns, or reports specifically related to
            child safety, child sexual abuse and exploitation (CSAE), or
            child sexual abuse material (CSAM), please contact us at:
          </p>

          <div className="mt-6 p-6 rounded-2xl bg-primary/5 border border-border">
            <p className="font-semibold text-foreground mb-2">
              myWorld Child Safety Contact
            </p>

            <p className="text-muted-foreground">
              Email: farouksaffas@gmail.com
            </p>

            <p className="text-muted-foreground mt-1">
              Website: myworld-app.vercel.app
            </p>

            <p className="text-muted-foreground mt-1">
              Location: Nigeria
            </p>
          </div>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            9. Protection of Children
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            myWorld takes reports concerning the sexual exploitation or
            abuse of children seriously. We are committed to reviewing
            reported concerns and taking appropriate action consistent with
            our policies, available information, and applicable law.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            We also encourage parents, guardians, and other concerned
            individuals to report suspected child-safety violations
            promptly.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            10. Updates to These Standards
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            We may update these Child Safety Standards from time to time
            to reflect changes to myWorld, applicable laws, safety
            practices, or platform requirements.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            When changes are made, the "Last Updated" date at the top of
            this page will be updated accordingly.
          </p>
        </section>

        {/* Commitment */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Our Commitment
          </h2>

          <p className="text-muted-foreground leading-relaxed">
            myWorld is committed to maintaining a safer online environment
            and to taking child sexual abuse and exploitation seriously.
          </p>

          <p className="text-muted-foreground leading-relaxed mt-4">
            If you encounter suspected child sexual exploitation or abuse
            on myWorld, please use the available in-app reporting
            mechanism and provide relevant information so the concern can
            be appropriately reviewed.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-border text-center">
          <p className="text-muted-foreground">
            Keeping{" "}
            <span className="text-gradient font-semibold">myWorld</span>{" "}
            safer for everyone. 🌍
          </p>
        </div>
      </article>
    </div>
  </main>
</Layout>

);
}
