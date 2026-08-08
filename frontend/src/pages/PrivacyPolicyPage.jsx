import React from "react";
import Layout from "../components/Layout.jsx";

export default function PrivacyPolicyPage() {
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
              Privacy <span className="text-gradient">Policy</span>
            </h1>

            <p className="text-muted-foreground">
              Last Updated: August 8, 2026
            </p>
          </div>

          {/* Privacy Policy */}
          <article className="glass-panel rounded-3xl p-6 md:p-10 lg:p-12 space-y-10">
            {/* Introduction */}
            <section>
              <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
                Welcome to <strong className="text-foreground">myWorld</strong>{" "}
                ("myWorld", "we", "us", or "our").
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                This Privacy Policy explains how we collect, use, store,
                protect, and disclose information when you use the myWorld
                website, mobile application, and related services (collectively,
                the "Service").
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                By using myWorld, you agree to the practices described in this
                Privacy Policy. If you do not agree with this policy, please do
                not use the Service.
              </p>
            </section>

            {/* 1 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                1. Information We Collect
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Depending on how you use myWorld, we may collect the following
                categories of information.
              </p>

              <h3 className="text-xl font-semibold mb-3">
                1.1 Information You Provide
              </h3>

              <p className="text-muted-foreground leading-relaxed mb-3">
                When you create an account, use our services, or communicate
                with us, you may provide information such as:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Name or username</li>
                <li>Email address</li>
                <li>Phone number, where applicable</li>
                <li>Profile information</li>
                <li>Account credentials</li>
                <li>Profile picture or other information you choose to add</li>
                <li>Posts, comments, messages, or other content you submit</li>
                <li>Information provided when contacting support</li>
                <li>Other information you voluntarily provide</li>
              </ul>
            </section>

            {/* 2 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                2. Information Collected Automatically
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                When you access myWorld, certain technical information may be
                collected automatically, including:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>IP address</li>
                <li>Device type</li>
                <li>Operating system</li>
                <li>Browser type and version</li>
                <li>Application version</li>
                <li>Language and regional settings</li>
                <li>Time zone</li>
                <li>Approximate location derived from technical information</li>
                <li>Pages or screens visited</li>
                <li>Features used</li>
                <li>Date and time of access</li>
                <li>Error and diagnostic information</li>
                <li>General usage and performance information</li>
              </ul>

              <p className="text-muted-foreground leading-relaxed mt-4">
                This information may be used to maintain security, diagnose
                technical problems, understand how the Service is used, and
                improve performance.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                3. Cookies and Local Storage
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                myWorld may use cookies, local storage, session storage, and
                similar technologies to provide and maintain the Service.
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Keep you signed in</li>
                <li>Remember your preferences</li>
                <li>Remember your selected theme</li>
                <li>Maintain your session</li>
                <li>Improve application performance</li>
                <li>Store necessary application data</li>
                <li>Protect accounts and prevent abuse</li>
              </ul>

              <p className="text-muted-foreground leading-relaxed mt-4">
                For example, myWorld may store your light or dark theme
                preference on your device.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You can manage cookies and browser storage through your browser
                or device settings. Disabling certain storage technologies may
                affect some features of the Service.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                4. Account and Authentication Information
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If you create a myWorld account, information associated with
                your account may be stored and processed by our systems.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Authentication information is used to create and maintain your
                account, authenticate you, keep you signed in, protect your
                account, provide personalized features, and prevent unauthorized
                access.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You are responsible for keeping your account credentials
                confidential and for notifying us if you believe your account
                has been compromised.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                5. User-Generated Content
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                myWorld may allow users to create, upload, publish, or share
                content, including:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Text</li>
                <li>Images</li>
                <li>Videos</li>
                <li>Comments</li>
                <li>Posts</li>
                <li>Profile information</li>
                <li>Other content you choose to submit</li>
              </ul>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Information you voluntarily make public through myWorld may be
                visible to other users. Please do not publish sensitive personal
                information that you do not want others to see.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                6. How We Use Information
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                We may use information we collect to:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide and operate myWorld</li>
                <li>Create and manage user accounts</li>
                <li>Authenticate users</li>
                <li>Personalize the user experience</li>
                <li>Remember user preferences</li>
                <li>Provide customer support</li>
                <li>Improve the design and functionality of myWorld</li>
                <li>Monitor application performance</li>
                <li>Detect and prevent fraud, abuse, and spam</li>
                <li>Protect users and our systems</li>
                <li>Investigate violations of our Terms of Service</li>
                <li>Communicate important service-related information</li>
                <li>Develop new features and services</li>
                <li>Comply with applicable laws and legal obligations</li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                7. How We Share Information
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal information.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">
                Service Providers
              </h3>

              <p className="text-muted-foreground leading-relaxed">
                We may use trusted third-party service providers to help operate
                myWorld, including providers of cloud hosting, databases,
                authentication, analytics, security, storage, communications,
                and other technical services.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">
                Legal Requirements
              </h3>

              <p className="text-muted-foreground leading-relaxed">
                We may disclose information where reasonably necessary to comply
                with applicable law, respond to valid legal requests, protect
                our rights or property, protect the safety of users, investigate
                fraud or abuse, or enforce our Terms of Service.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">
                Business Transfers
              </h3>

              <p className="text-muted-foreground leading-relaxed">
                If myWorld or substantially all of its assets are involved in a
                merger, acquisition, restructuring, financing, or sale,
                information may be transferred as part of that transaction,
                subject to applicable privacy laws.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                8. Third-Party Services
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                myWorld may rely on third-party services to provide certain
                functionality. These services may process information according
                to their own privacy policies and terms.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Third-party services may include hosting, authentication,
                analytics, cloud infrastructure, notifications, payment
                processing, or other technical services.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                9. Android Application
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                The myWorld Android application may provide access to the
                myWorld service through a mobile application environment.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                The application may process certain technical information
                required for the application to function, including:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Device information</li>
                <li>Operating system information</li>
                <li>Application version</li>
                <li>Network information</li>
                <li>Diagnostic information</li>
                <li>Authentication and session information</li>
                <li>Preferences such as theme settings</li>
              </ul>
            </section>

            {/* 10 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                10. Camera, Photos, Files, and Device Permissions
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If myWorld features allow you to upload images, documents, or
                other files, the application may request access to the relevant
                device functionality.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Depending on the features available, myWorld may request access
                to the camera, photos or media, files and documents, microphone,
                notifications, or location.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Permissions are used only for the feature for which they are
                requested. You can manage application permissions through your
                Android device settings.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                11. Notifications
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If myWorld provides push notifications and you enable them, we
                may process information necessary to deliver notifications to
                your device.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Notifications may include account-related notifications,
                messages, updates, security alerts, service announcements, and
                other notifications associated with features you use.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                You can disable notifications through your device settings.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                12. Data Security
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We take reasonable technical and organizational measures to
                protect information against unauthorized access, loss, misuse,
                alteration, or disclosure.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                However, no method of transmitting or storing information over
                the internet is completely secure. Therefore, while we work to
                protect your information, we cannot guarantee absolute security.
              </p>
            </section>

            {/* 13 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                13. Data Retention
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                We retain personal information only for as long as reasonably
                necessary to:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide the Service</li>
                <li>Maintain your account</li>
                <li>Fulfill the purposes described in this policy</li>
                <li>Resolve disputes</li>
                <li>Enforce agreements</li>
                <li>Prevent fraud and abuse</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            {/* 14 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                14. Your Privacy Rights
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Depending on your location and applicable law, you may have
                rights regarding your personal information, including the right
                to:
              </p>

              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Request access to personal information</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your information</li>
                <li>Request restriction of certain processing</li>
                <li>Object to certain processing</li>
                <li>Request a copy of certain information</li>
                <li>Withdraw consent where applicable</li>
                <li>Close or delete your account</li>
              </ul>
            </section>

            {/* 15 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                15. Account Deletion
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If you have a myWorld account, you may request deletion of your
                account and associated personal information.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                When an account deletion request is received, we will process it
                in accordance with applicable law and our legitimate operational
                requirements.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Certain information may need to be retained where required by
                law, necessary to resolve disputes, prevent fraud or abuse, or
                protect our legal rights.
              </p>
            </section>

            {/* 16 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                16. Children's Privacy
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                myWorld is not intended for children where use of the Service
                would violate applicable age requirements.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not knowingly collect personal information from children
                in violation of applicable law.
              </p>
            </section>

            {/* 17 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                17. International Data Transfers
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                Depending on the infrastructure and service providers used by
                myWorld, your information may be processed or stored in
                countries other than the country where you live.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                Where required by applicable law, we will take appropriate
                measures to protect personal information when it is transferred
                internationally.
              </p>
            </section>

            {/* 18 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                18. Third-Party Websites and Services
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                myWorld may contain links to third-party websites, applications,
                or services. We are not responsible for the privacy practices,
                security, content, or policies of third-party services.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                When you leave myWorld or interact with a third-party service,
                we recommend reviewing that service's privacy policy before
                providing personal information.
              </p>
            </section>

            {/* 19 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                19. Changes to This Privacy Policy
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. When we
                make changes, we will update the "Last Updated" date at the top
                of this page.
              </p>

              <p className="text-muted-foreground leading-relaxed mt-4">
                If we make significant changes that require additional notice
                under applicable law, we may provide additional notice through
                the application, website, email, or another appropriate method.
              </p>
            </section>

            {/* 20 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                20. Contact Us
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                If you have questions, concerns, requests, or complaints
                regarding this Privacy Policy or the way myWorld handles
                personal information, please contact us.
              </p>

              <div className="mt-6 p-6 rounded-2xl bg-primary/5 border border-border">
                <p className="font-semibold text-foreground mb-2">myWorld</p>

                <p className="text-muted-foreground">
                  Website: myworld-app.vercel.app | myworld.dakta.name.ng
                </p>

                <p className="text-muted-foreground mt-1">
                  Privacy Contact: contact@dakta.name.ng
                </p>

                <p className="text-muted-foreground mt-1">
                  Developer/Company: Dakta Multipurpose Services
                </p>

                <p className="text-muted-foreground mt-1">Location: Nigeria</p>
              </div>
            </section>

            {/* 21 */}
            <section>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                21. Consent
              </h2>

              <p className="text-muted-foreground leading-relaxed">
                By using myWorld, you acknowledge that you have read and
                understood this Privacy Policy and agree to the collection and
                use of information as described herein, to the extent permitted
                by applicable law.
              </p>
            </section>

            {/* Footer */}
            <div className="pt-8 border-t border-border text-center">
              <p className="text-muted-foreground">
                Thank you for being part of{" "}
                <span className="text-gradient font-semibold">myWorld</span>. 🌍
              </p>
            </div>
          </article>
        </div>
      </main>
    </Layout>
  );
}
