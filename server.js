// Local development entry. Production uses the root Vercel entrypoint in index.js.
import { buildApp, ensureDb } from "./app.js";

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await ensureDb();
    const app = buildApp();
    app.listen(PORT, () => {
      console.log(`[myWorld API] Running on port ${PORT}`);
      console.log("[myWorld API] Social API ready");
    });
  } catch (err) {
    console.error("[myWorld API] Failed to start:", err);
    process.exit(1);
  }
})();
