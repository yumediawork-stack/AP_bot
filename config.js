/* ============================================================
   AutoPost Telegram Mini-App — config.js
   Edit these values to point the front end at YOUR n8n instance.
   ============================================================ */

window.AUTOPOST_CONFIG = {
  // Base URL of your n8n instance (no trailing slash).
  // Example: "https://n8n.yourdomain.com"
  N8N_BASE_URL: "https://alexmess.app.n8n.cloud",

  // Webhook PATHS you create inside n8n (Webhook node "Path" field).
  // The front end POSTs to N8N_BASE_URL + the path below.
  ENDPOINTS: {
    // 1. Called on launch. Verifies/creates the <telegram_id>-db sheet.
    //    Returns { ok: true, exists: bool, cases: [...] }
    INIT:          "/webhook/autopost-init",
    // 2. Returns the list of cases for this user.
    LIST_CASES:    "/webhook/autopost-cases",
    // 3. Creates a new case (and the <telegram_id>-<platform> sheet + headers).
    CREATE_CASE:   "/webhook/autopost-create-case",
    // 4. Saves a scheduled post into the case sheet.
    CREATE_POST:   "/webhook/autopost-create-post",
    // 5. Returns submitted/scheduled posts for review.
    LIST_POSTS:    "/webhook/autopost-posts"
  },

  // Set true while developing in a browser (bypasses the Telegram-only gate
  // and injects a fake user). ALWAYS set false in production.
  DEV_MODE: false,

  // Fake identity used only when DEV_MODE === true.
  DEV_USER: { id: 999000111, first_name: "Dev", username: "dev_user" }
};
