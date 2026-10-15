# myWorld UI/UX Phase 5 — Regression QA

This checklist covers the UI/UX changes from Phases 1–4. It is a repeatable manual QA plan for the browser and the Android Expo Router WebView wrapper. It does not add product features or change backend behavior.

## Test environments

- [ ] Desktop browser, current Chromium-based browser
- [ ] Mobile browser, Android
- [ ] Installed Android app / WebView wrapper
- [ ] Dark theme
- [ ] Light theme
- [ ] Narrow viewport (320–360 CSS px) and a typical desktop viewport
- [ ] Slow network / offline and reconnect, where practical

Record device/browser, app build, date, and any failing steps in the PR or an issue.

## 1. Theme and accessibility

- [ ] Dark remains the default for a clean browser storage profile.
- [ ] Switching to light updates the current screen without a reload.
- [ ] Theme survives refresh and app relaunch.
- [ ] Saved invalid theme values recover to a valid theme.
- [ ] Header, navigation, feed cards, composer, empty/error states, modals, and photo viewer remain readable in both themes.
- [ ] Focus indicators are visible when navigating by keyboard.
- [ ] Buttons/links have understandable accessible names and touch targets are comfortable on mobile.
- [ ] Reduced-motion preference avoids unnecessary animation.

## 2. Responsive layout and Feed

- [ ] Feed header, discovery rail, status tray, composer, sorting controls, and posts do not overlap at mobile and desktop widths.
- [ ] Mobile bottom navigation respects the device safe-area inset and does not cover the last feed item or composer actions.
- [ ] Feed loading, error, and empty states are usable.
- [ ] For You / Latest sorting still works.
- [ ] Pagination loads the next page without duplicating posts.
- [ ] Like and delete actions update the feed as expected.
- [ ] Scrolling does not cause horizontal overflow.

## 3. Photos and videos

- [ ] Tapping a post image opens the immersive photo viewer, not a separate tab.
- [ ] Photo viewer close button, Escape (browser), and Android/browser Back close the viewer correctly.
- [ ] Closing the photo viewer restores the prior scroll position and page scrolling.
- [ ] Large portrait and landscape images fit without being stretched or clipped.
- [ ] Inline videos remain responsive and can play on mobile.
- [ ] Video controls remain usable and media errors do not break the feed.

## 4. Reels — Phase 4 regression

- [ ] Reels opens edge-to-edge without the regular app header or mobile bottom navigation.
- [ ] Top controls respect status-bar / safe-area spacing.
- [ ] Swiping vertically snaps to the next Reel.
- [ ] Only the sufficiently visible Reel plays; scrolling away pauses the previous video.
- [ ] Mute/unmute and play/pause controls work.
- [ ] Like state and count update; unauthenticated interactions follow the existing sign-in flow.
- [ ] Watch tracking still records views and completion as expected.
- [ ] Load more Reels works without duplicate items.
- [ ] For You / Trending / Latest sorting still loads the appropriate list.
- [ ] Analytics, Create, creator profile, post/comments, and share actions still navigate/work.
- [ ] The visible Back control returns to the prior in-app screen when available.
- [ ] Opening /reels directly and pressing Back safely returns to Feed.
- [ ] Browser Back and Android system Back behave sensibly; no back-button loop.
- [ ] Light theme elsewhere remains correct; Reels intentionally keeps its dark immersive surface.
- [ ] Empty, loading, and error states fit the screen and keep exit navigation available.

## 5. Account and app-wide smoke test

- [ ] Sign in, sign out, and session persistence behave as before.
- [ ] Profile and account navigation still work.
- [ ] Messages and notifications open and remain usable.
- [ ] Opening and closing authentication / invite modals works from the relevant screens.
- [ ] Switching between Feed, Reels, profiles, messages, and notifications does not leave stale overlays or lock page scrolling.

## 6. Android WebView checks

- [ ] App opens and renders the web app at the expected viewport size.
- [ ] Status/navigation bars and safe-area spacing do not cover content.
- [ ] Android Back closes an open photo viewer first, then follows normal route navigation.
- [ ] Android Back from Reels returns to the previous screen, or Feed for a direct entry.
- [ ] Backgrounding and restoring the app does not leave media playing over an unrelated screen.
- [ ] Refresh/relaunch retains the signed-in session and chosen theme as intended.
- [ ] External links and share behavior fail gracefully if the native/browser capability is unavailable.
- [ ] A network interruption shows a recoverable state; reconnecting does not create duplicate posts/messages or trigger a navigation loop.

## 7. Release decision

- [ ] All critical checks pass on desktop browser.
- [ ] All critical checks pass on Android browser.
- [ ] All critical checks pass in the installed Android app.
- [ ] No new console errors, failed API requests, or React warnings observed during the smoke test.
- [ ] Any failures are fixed or tracked with a clear issue before calling the redesign complete.

**Important:** Do not mark a checkbox complete until it has been run on the target environment. Automated deployment checks alone do not replace the manual Android/WebView checks above.
