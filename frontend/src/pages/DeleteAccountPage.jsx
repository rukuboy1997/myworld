import React, { useState } from "react";
import Layout from "../components/Layout.jsx";

export default function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    // Temporary request handling.
    // Connect this form to your backend/account-deletion API
    // before using this page as your production deletion system.

    setSubmitted(true);
  };

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
              Delete Your <span className="text-gradient">myWorld</span> Account
            </h1>

            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              You can use this page to request the deletion of your myWorld
              account and associated personal data.
            </p>
          </div>

          {/* Main Content */}
          <article className="glass-panel rounded-3xl p-6 md:p-10 lg:p-12 space-y-10">

            {/* Introduction */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Account Deletion
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We respect your right to control your personal information.
                If you no longer want to use myWorld, you can request that your
                account and associated personal data be deleted.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Please make sure that you understand the consequences of
                account deletion before submitting your request.
              </p>
            </section>

            {/* What Gets Deleted */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                What Will Be Deleted
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                When an account deletion request is completed, we intend to
                delete or anonymize personal information associated with your
                myWorld account, where applicable.
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Your myWorld account and account credentials.</li>
                <li>Your profile information.</li>
                <li>Personal information associated with your account.</li>
                <li>User-generated content associated with your account, where applicable.</li>
                <li>Other account-related information that is no longer required.</li>
              </ul>
            </section>

            {/* Data That May Be Retained */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Information That May Be Retained
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                Certain information may need to be retained for a limited
                period where required for legal, security, fraud-prevention,
                dispute-resolution, or other legitimate purposes.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Where information must be retained, it will be kept only for
                the period reasonably necessary to satisfy the applicable
                requirement and will be securely deleted or anonymized when it
                is no longer needed.
              </p>
            </section>

            {/* Before You Delete */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Before You Submit a Request
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Account deletion may be permanent and may not be reversible.
                Before submitting your request, make sure you have saved any
                information or content that you may want to keep.
              </p>

              <div className="rounded-2xl border border-border bg-primary/5 p-5">
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">
                    Important:
                  </strong>{" "}
                  Deleting your account may result in the permanent loss of
                  access to your profile, posts, messages, connections, and
                  other account-related information.
                </p>
              </div>
            </section>

            {/* Request Form */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Request Account Deletion
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-6">
                Enter the email address associated with your myWorld account
                and submit your request. We may need to verify ownership of the
                account before processing the deletion request.
              </p>

              {submitted ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 text-primary">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-bold mb-2">
                    Request Submitted
                  </h3>

                  <p className="text-muted-foreground leading-relaxed">
                    Your account deletion request has been received. We may
                    contact you to verify ownership of the account before
                    processing the request.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-6"
                >
                  {/* Email */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-semibold mb-2"
                    >
                      Account Email Address
                    </label>

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-4 py-3 rounded-2xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>

                  {/* Reason */}
                  <div>
                    <label
                      htmlFor="reason"
                      className="block text-sm font-semibold mb-2"
                    >
                      Reason for Leaving
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (Optional)
                      </span>
                    </label>

                    <textarea
                      id="reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Tell us why you are leaving, if you would like to..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-2xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                    />
                  </div>

                  {/* Confirmation */}
                  <div className="rounded-2xl border border-border bg-primary/5 p-5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        className="mt-1 w-4 h-4 accent-primary"
                      />

                      <span className="text-sm text-muted-foreground leading-relaxed">
                        I understand that account deletion may permanently
                        remove my myWorld account and associated data, and that
                        the process may not be reversible.
                      </span>
                    </label>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Request Account Deletion
                  </button>
                </form>
              )}
            </section>

            {/* Processing */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                What Happens Next?
              </h2>

              <div className="space-y-5">

                <div className="flex gap-4">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                    1
                  </div>

                  <div>
                    <h3 className="font-bold mb-1">
                      Request received
                    </h3>

                    <p className="text-muted-foreground leading-relaxed">
                      We receive your account deletion request and review the
                      information provided.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                    2
                  </div>

                  <div>
                    <h3 className="font-bold mb-1">
                      Account verification
                    </h3>

                    <p className="text-muted-foreground leading-relaxed">
                      We may verify that the request was submitted by the
                      account owner to help prevent unauthorized deletion.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                    3
                  </div>

                  <div>
                    <h3 className="font-bold mb-1">
                      Deletion processing
                    </h3>

                    <p className="text-muted-foreground leading-relaxed">
                      Once verified, eligible account information will be
                      deleted or anonymized in accordance with our policies.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
                    4
                  </div>

                  <div>
                    <h3 className="font-bold mb-1">
                      Completion
                    </h3>

                    <p className="text-muted-foreground leading-relaxed">
                      You may receive confirmation when the deletion process
                      has been completed.
                    </p>
                  </div>
                </div>

              </div>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Need Help?
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If you are unable to access your account or cannot submit a
                deletion request through this page, please contact the myWorld
                support team.
              </p>

              <div className="mt-6 p-6 rounded-2xl bg-primary/5 border border-border">
                <p className="font-semibold text-foreground mb-2">
                  myWorld
                </p>

                <p className="text-muted-foreground">
                  Website: myworld-app.vercel.app | myworld.dakta.name.ng
                </p>

                <p className="text-muted-foreground mt-1">
                  Contact: contact@dakta.name.ng
                </p>
              </div>
            </section>

            {/* Privacy Policy */}
            <section className="pt-8 border-t border-border">
              <p className="text-muted-foreground leading-relaxed">
                For more information about how myWorld handles personal
                information, please review our Privacy Policy.
              </p>

              <div className="mt-5">
                <a
                  href="/privacy-policy"
                  className="inline-flex items-center px-5 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                >
                  Read Privacy Policy
                </a>
              </div>
            </section>

          </article>

          {/* Footer Note */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            © {new Date().getFullYear()} myWorld. All rights reserved.
          </p>

        </div>
      </main>
    </Layout>
  );
}
