// Local dev entry. On Vercel this file is NOT used — see api/index.js.
import { buildApp, ensureDb } from './app.js';

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await ensureDb();
    const app = buildApp();
    app.listen(PORT, () => {
      console.log(`[myWorld API] Running on port ${PORT}`);
      console.log('[myWorld API] No system wallet (using user wallets)');
    });
  } catch (err) {
    console.error('[myWorld API] Failed to start:', err);
    process.exit(1);
  }
})();
