import React from "react";
import Layout from "../components/Layout.jsx";

export default function TermsOfServicePage() {
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
              Terms of <span className="text-gradient">Service</span>
            </h1>

            <p className="text-muted-foreground">
              Last Updated: August 8, 2026
            </p>
          </div>

          {/* Terms Content */}
          <article className="glass-panel rounded-3xl p-6 md:p-10 lg:p-12 space-y-10">
            {/* Introduction */}
            <section>
              <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
                Welcome to <strong className="text-foreground">myWorld</strong>{" "}
                ("myWorld", "we", "us", or "our").
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                These Terms of Service ("Terms") govern your access to and use
                of the myWorld website, mobile application, and related services
                (collectively, the "Service").
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                By accessing or using myWorld, you agree to be bound by these
                Terms. If you do not agree with these Terms, you should not
                access or use the Service.
              </p>
            </section>

            {/* 1 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                1. Eligibility
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                You may use myWorld only if you are legally capable of entering
                into these Terms and your use of the Service is permitted by
                applicable laws.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                If you are using myWorld on behalf of an organization or other
                entity, you represent that you have the authority to accept
                these Terms on its behalf.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                If applicable law requires you to be a certain minimum age to
                use the Service, you must meet that requirement.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                2. Your myWorld Account
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                Some features of myWorld may require you to create an account.
                You agree to provide accurate and reasonably complete
                information when creating and maintaining your account.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You are responsible for maintaining the confidentiality of your
                login credentials and for activities performed through your
                account.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You should notify us promptly if you believe that your account
                has been accessed without authorization or that your credentials
                have been compromised.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                3. Using myWorld
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                You agree to use myWorld responsibly and only for lawful
                purposes.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                You must not use the Service to:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>
                  Violate any applicable law, regulation, or legal requirement.
                </li>
                <li>Infringe or violate another person's rights.</li>
                <li>Impersonate another person, organization, or entity.</li>
                <li>
                  Create accounts or identities for deceptive or fraudulent
                  purposes.
                </li>
                <li>Harass, threaten, intimidate, or abuse other users.</li>
                <li>
                  Publish or distribute unlawful, fraudulent, defamatory, or
                  malicious content.
                </li>
                <li>
                  Upload malware, viruses, malicious code, or other harmful
                  software.
                </li>
                <li>
                  Attempt to gain unauthorized access to accounts, systems, or
                  networks.
                </li>
                <li>Interfere with or disrupt the operation of the Service.</li>
                <li>
                  Scrape, crawl, or collect information from the Service through
                  unauthorized automated methods.
                </li>
                <li>
                  Circumvent security, access controls, or other technical
                  restrictions.
                </li>
                <li>Use the Service to facilitate illegal activities.</li>
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                4. User Content
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                myWorld may allow you to create, upload, post, send, store, or
                otherwise share content, including text, images, videos,
                comments, profile information, and other materials ("User
                Content").
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You retain ownership of the User Content that you create,
                subject to the rights and permissions necessary for myWorld to
                operate the Service.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                By submitting User Content to myWorld, you grant us a
                non-exclusive, worldwide, royalty-free license to host, store,
                reproduce, process, display, transmit, and distribute that
                content solely as reasonably necessary to provide, maintain,
                secure, and improve the Service.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You represent that you have the necessary rights and permissions
                to submit the content you provide through myWorld.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                5. Public and Shared Content
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                Some features may allow you to share content with other users or
                make content publicly accessible.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You are responsible for considering the privacy implications of
                publishing or sharing information through the Service.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Once you intentionally share information publicly, other users
                may be able to view, copy, save, or redistribute it.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                6. Content Standards
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Content submitted to myWorld must comply with applicable laws
                and these Terms.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                You must not submit content that:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Contains unlawful or fraudulent material.</li>
                <li>Promotes violence or credible threats of harm.</li>
                <li>
                  Harasses, intimidates, or targets individuals for abuse.
                </li>
                <li>
                  Infringes copyrights, trademarks, privacy rights, or other
                  intellectual property rights.
                </li>
                <li>Contains malware or malicious software.</li>
                <li>
                  Is intentionally deceptive or designed to facilitate fraud.
                </li>
                <li>Exploits or endangers children.</li>
                <li>Violates applicable laws or regulations.</li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                7. Content Moderation
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We may review, restrict, remove, or disable access to User
                Content that we reasonably believe violates these Terms,
                applicable law, or the safety and integrity of the Service.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We may also take action against accounts that repeatedly or
                seriously violate these Terms.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not guarantee that all inappropriate or prohibited content
                will be detected or removed immediately.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                8. Intellectual Property
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                The myWorld name, logo, software, interface, design, graphics,
                text, trademarks, service marks, and other materials provided by
                myWorld are owned by or licensed to us unless otherwise stated.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Except as expressly permitted by these Terms or applicable law,
                you may not copy, reproduce, modify, distribute, sell, lease,
                reverse engineer, or create derivative works from our
                proprietary materials without appropriate authorization.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                9. Third-Party Services and Links
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                myWorld may contain links to or integrations with third-party
                websites, applications, products, or services.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Third-party services are governed by their own terms and
                policies. We are not responsible for the content, availability,
                security, or practices of third-party services.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Your use of third-party services is at your own discretion and
                may be subject to additional terms.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                10. Availability of the Service
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We work to keep myWorld available and reliable, but we do not
                guarantee that the Service will always be available,
                uninterrupted, secure, or error-free.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                The Service may occasionally be unavailable due to maintenance,
                updates, technical problems, security incidents, network
                failures, or circumstances outside our reasonable control.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                11. Changes to the Service
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We may modify, add, suspend, or discontinue features of myWorld
                at any time.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We may also introduce new features that are subject to
                additional terms or requirements.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                12. Account Suspension and Termination
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We may suspend or terminate your account or restrict access to
                the Service if we reasonably believe that you have violated
                these Terms, applicable law, or policies designed to protect the
                Service and its users.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We may also take action where necessary to protect users,
                investigate security incidents, prevent fraud or abuse, or
                comply with legal obligations.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You may stop using myWorld at any time. If account deletion is
                available, you may use the available account deletion
                functionality or contact us.
              </p>
            </section>

            {/* 13 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                13. Disclaimer of Warranties
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                To the maximum extent permitted by applicable law, myWorld is
                provided on an "as is" and "as available" basis.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not guarantee that the Service will meet every user's
                requirements or that it will always operate without
                interruptions, errors, or security vulnerabilities.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Nothing in these Terms excludes or limits any warranty or right
                that cannot lawfully be excluded or limited under applicable
                law.
              </p>
            </section>

            {/* 14 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                14. Limitation of Liability
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                To the maximum extent permitted by applicable law, myWorld and
                its operators, developers, affiliates, and service providers
                will not be liable for indirect, incidental, special,
                consequential, exemplary, or punitive damages arising from or
                related to your use of the Service.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Nothing in these Terms limits liability that cannot legally be
                limited under applicable law.
              </p>
            </section>

            {/* 15 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                15. Indemnification
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                To the extent permitted by applicable law, you agree to
                reasonably indemnify and hold harmless myWorld and its
                operators, developers, affiliates, and service providers from
                claims, damages, liabilities, losses, and expenses arising from
                your unlawful use of the Service, violation of these Terms, or
                infringement of another person's rights.
              </p>
            </section>

            {/* 16 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                16. Privacy
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                Your use of myWorld is also governed by our Privacy Policy,
                which explains how we collect, use, store, and protect personal
                information.
              </p>

              <div className="mt-5">
                <a
                  href="/privacy-policy"
                  className="inline-flex items-center px-5 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                >
                  Read our Privacy Policy
                </a>
              </div>
            </section>

            {/* 17 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                17. Changes to These Terms
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We may update these Terms from time to time. When we make
                changes, we will update the "Last Updated" date at the top of
                this page.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Where appropriate, we may provide additional notice through
                myWorld, the website, email, or another reasonable method.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Your continued use of myWorld after updated Terms become
                effective constitutes acceptance of the updated Terms, to the
                extent permitted by applicable law.
              </p>
            </section>

            {/* 18 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                18. Governing Law
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be interpreted and applied in accordance with
                the applicable laws of the jurisdiction in which myWorld is
                legally established, except where applicable law requires
                otherwise.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Nothing in this section limits any mandatory consumer rights or
                protections that apply to you under the laws of your
                jurisdiction.
              </p>
            </section>

            {/* 19 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                19. Severability
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If any provision of these Terms is found to be invalid,
                unlawful, or unenforceable, that provision will be interpreted
                or modified to the minimum extent necessary, and the remaining
                provisions will continue to apply.
              </p>
            </section>

            {/* 20 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                20. Entire Agreement
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                These Terms, together with the Privacy Policy and any additional
                terms specifically applicable to particular features of myWorld,
                constitute the agreement between you and myWorld regarding your
                use of the Service.
              </p>
            </section>

            {/* 21 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                21. Contact Us
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If you have questions about these Terms, please contact us.
              </p>

              <div className="mt-6 p-6 rounded-2xl bg-primary/5 border border-border">
                <p className="font-semibold text-foreground mb-2">myWorld</p>

                <p className="text-muted-foreground">
                  Website: myworld-app.vercel.app | myworld.dakta.name.ng
                </p>

                <p className="text-muted-foreground mt-1">
                  Contact: contact@dakta.name.ng
                </p>

                <p className="text-muted-foreground mt-1">
                  Developer/Company: Dakta Multipurpose Services
                </p>

                <p className="text-muted-foreground mt-1">Location: Nigeria</p>
              </div>
            </section>

            {/* Acceptance */}
            <section className="pt-8 border-t border-border">
              <div className="text-center">
                <p className="text-muted-foreground leading-relaxed">
                  By using myWorld, you acknowledge that you have read,
                  understood, and agreed to these Terms of Service.
                </p>

                <p className="mt-5 text-lg font-semibold">
                  Welcome to <span className="text-gradient">myWorld</span>. 🌍
                </p>
              </div>
            </section>
          </article>
        </div>
      </main>
    </Layout>
  );
}
