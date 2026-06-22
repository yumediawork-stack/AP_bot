/* ============================================================
   AutoPost Telegram Mini-App — app.js
   Vanilla JS single-page router. No build step, no dependencies.
   Talks to n8n webhooks defined in config.js.
   ============================================================ */

(() => {
  "use strict";

  const CFG = window.AUTOPOST_CONFIG;
  const tg = window.Telegram ? window.Telegram.WebApp : null;

  // ---- App state -------------------------------------------------------
  const state = {
    user: null,          // { id, first_name, username }
    initData: "",        // raw Telegram initData string (for signature check in n8n)
    cases: [],
    hasVisited: false
  };

  // ---- DOM handles -----------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const gate    = $("#tg-gate");
  const app     = $("#app");
  const view    = $("#view");
  const loader  = $("#loader");
  const toastEl = $("#toast");
  const btnBack = $("#btn-back");
  const btnHome = $("#btn-home");
  const userStrip = $("#user-strip");

  // ---- Tiny helpers ----------------------------------------------------
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  let toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  const busy = (on) => on ? show(loader) : hide(loader);

  // ---- n8n API layer ---------------------------------------------------
  async function api(endpointKey, payload) {
    const url = CFG.N8N_BASE_URL + CFG.ENDPOINTS[endpointKey];
    const body = Object.assign({
      telegram_id: state.user ? state.user.id : null,
      username: state.user ? state.user.username : null,
      initData: state.initData
    }, payload || {});
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("n8n " + endpointKey + " HTTP " + res.status);
    // n8n "Respond to Webhook" may return JSON or empty.
    const txt = await res.text();
    try { return txt ? JSON.parse(txt) : {}; } catch (_) { return { raw: txt }; }
  }

  // ---- Telegram bootstrap ---------------------------------------------
  function bootstrap() {
    if (CFG.DEV_MODE) {
      state.user = CFG.DEV_USER;
      state.initData = "dev";
      return true;
    }
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
      return false; // not opened inside Telegram
    }
    tg.ready();
    tg.expand();
    state.user = tg.initDataUnsafe.user;
    state.initData = tg.initData || "";
    return true;
  }

  // ============================================================
  //  ROUTER
  // ============================================================
  const routes = {};
  function route(name, render) { routes[name] = render; }
  function navigate(name, params) {
    window.scrollTo(0, 0);
    btnBack.classList.toggle("hidden", name === "home" || name === "cases");
    (routes[name] || routes.home)(params || {});
  }

  btnHome.addEventListener("click", () => navigate("home"));
  btnBack.addEventListener("click", () => navigate(state.hasVisited ? "cases" : "home"));

  // ============================================================
  //  VIEW: HOME
  // ============================================================
  route("home", () => {
    const count = state.cases.length;
    view.innerHTML = `
      <div class="page-title">Welcome${state.user.first_name ? ", " + esc(state.user.first_name) : ""}</div>
      <div class="page-sub">Schedule and auto-publish your posts to Telegram &amp; Instagram from one place.</div>
      <div class="tiles">
        <div class="tile accent" data-go="cases">
          ${iconLayers()}
          <div class="tile-num">${count}</div>
          <div class="tile-label">Active cases</div>
        </div>
        <div class="tile" data-go="new-case">
          ${iconPlus()}
          <div class="tile-num">+</div>
          <div class="tile-label">Add a case</div>
        </div>
      </div>
      <div class="section-label">Quick actions</div>
      <button class="btn btn-dark" data-go="cases" style="margin-bottom:12px">View my cases</button>
      <button class="btn btn-ghost" data-go="posts">Review scheduled posts</button>
    `;
    view.querySelectorAll("[data-go]").forEach(el =>
      el.addEventListener("click", () => navigate(el.dataset.go)));
  });

  // ============================================================
  //  VIEW: CASES LIST
  // ============================================================
  route("cases", async () => {
    state.hasVisited = true;
    view.innerHTML = `
      <div class="list-head">
        <div class="page-title">Cases</div>
        <button class="btn btn-primary" id="add-case" style="width:auto;padding:10px 16px">
          ${iconPlus()} Add Case
        </button>
      </div>
      <div id="cases-list"></div>`;
    $("#add-case").addEventListener("click", () => navigate("new-case"));

    const list = $("#cases-list");
    try {
      busy(true);
      const data = await api("LIST_CASES");
      state.cases = data.cases || [];
    } catch (e) {
      toast("Could not load cases", true);
    } finally { busy(false); }

    if (!state.cases.length) {
      list.innerHTML = `
        <div class="empty">
          ${iconLayers(40)}
          <p>No cases yet.<br/>Tap “Add Case” to create your first one.</p>
        </div>`;
      return;
    }
    list.innerHTML = state.cases.map(c => {
      const ig = c.platform === "instagram";
      return `
        <div class="card case-card" data-id="${esc(c.id)}">
          <div class="case-badge ${ig ? "ig" : ""}">${ig ? iconInstagram() : iconTelegram()}</div>
          <div class="case-info">
            <h3>${esc(c.name || "Untitled case")}</h3>
            <p>${esc(c.target || c.channel || "—")}</p>
          </div>
          <span class="case-pill ${ig ? "ig" : ""}">${ig ? "Instagram" : "Telegram"}</span>
        </div>`;
    }).join("");

    list.querySelectorAll(".case-card").forEach(el =>
      el.addEventListener("click", () => {
        const c = state.cases.find(x => String(x.id) === el.dataset.id);
        navigate("new-post", { case: c });
      }));
  });

  // ============================================================
  //  VIEW: NEW CASE  (platform slider + dynamic fields)
  // ============================================================
  route("new-case", () => {
    let platform = "telegram";
    view.innerHTML = `
      <div class="page-title">Add Case</div>
      <div class="page-sub">Choose a platform, then fill in where the posts should go.</div>

      <div class="slider" id="slider">
        <div class="thumb"></div>
        <button data-p="telegram" class="active">Telegram</button>
        <button data-p="instagram">Instagram</button>
      </div>

      <div class="field">
        <label>Case name</label>
        <input id="c-name" placeholder="e.g. Marketing channel" />
      </div>

      <div id="platform-fields"></div>

      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-ghost" id="cancel">Cancel</button>
        <button class="btn btn-primary" id="save-case">Save Case</button>
      </div>`;

    const slider = $("#slider");
    const fields = $("#platform-fields");

    function renderFields() {
      if (platform === "telegram") {
        fields.innerHTML = `
          <div class="field">
            <label>Telegram channel / chat ID</label>
            <input id="f-target" placeholder="@your_channel or -1001234567890" />
            <div class="hint">The channel where posts will be published. Your bot must be an admin.</div>
            <button class="guide-link" data-guide="tg-channel">${iconHelp()} How do I find this?</button>
          </div>
          <div class="field">
            <label>Bot token</label>
            <input id="f-token" placeholder="123456:ABC-DEF..." />
            <div class="hint">Created via @BotFather.</div>
            <button class="guide-link" data-guide="tg-token">${iconHelp()} How do I get a bot token?</button>
          </div>`;
      } else {
        fields.innerHTML = `
          <div class="field">
            <label>Instagram Business account ID</label>
            <input id="f-target" placeholder="178414...30" />
            <div class="hint">From your linked Facebook/Meta business account.</div>
            <button class="guide-link" data-guide="ig-account">${iconHelp()} Where do I find this?</button>
          </div>
          <div class="field">
            <label>Access token (long-lived)</label>
            <input id="f-token" placeholder="EAAG..." />
            <div class="hint">Meta Graph API long-lived token.</div>
            <button class="guide-link" data-guide="ig-token">${iconHelp()} How do I generate a token?</button>
          </div>`;
      }
      fields.querySelectorAll("[data-guide]").forEach(b =>
        b.addEventListener("click", () => showGuide(b.dataset.guide)));
    }
    renderFields();

    slider.querySelectorAll("button").forEach(b =>
      b.addEventListener("click", () => {
        platform = b.dataset.p;
        slider.classList.toggle("ig", platform === "instagram");
        slider.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        renderFields();
      }));

    $("#cancel").addEventListener("click", () => navigate("cases"));

    $("#save-case").addEventListener("click", async () => {
      const name = $("#c-name").value.trim();
      const target = $("#f-target").value.trim();
      const token = $("#f-token").value.trim();
      if (!name || !target || !token) { toast("Please fill in all fields", true); return; }
      try {
        busy(true);
        await api("CREATE_CASE", { name, platform, target, token });
        toast("Case created");
        navigate("cases");
      } catch (e) {
        toast("Could not save case", true);
      } finally { busy(false); }
    });
  });

  // ============================================================
  //  VIEW: NEW POST  (form differs by platform)
  // ============================================================
  route("new-post", ({ case: c }) => {
    if (!c) { navigate("cases"); return; }
    const ig = c.platform === "instagram";

    view.innerHTML = `
      <div class="list-head">
        <div class="page-title">New ${ig ? "Instagram" : "Telegram"} post</div>
        <button class="btn btn-ghost" id="view-posts" style="width:auto;padding:9px 14px">Review</button>
      </div>
      <div class="page-sub">Case: <b>${esc(c.name)}</b></div>

      <div class="field">
        <label>${ig ? "Image / video URL" : "File name or media URL"}</label>
        <input id="p-file" placeholder="${ig ? "https://.../photo.jpg" : "promo.jpg or https://..."}" />
        <div class="hint">${ig ? "Instagram requires a publicly reachable media URL." : "Leave blank for a text-only Telegram post."}</div>
      </div>

      <div class="field">
        <label>${ig ? "Caption" : "Message text"}</label>
        <textarea id="p-text" placeholder="Write your ${ig ? "caption" : "message"}..."></textarea>
      </div>

      ${ig ? `
      <div class="field">
        <label>First comment (optional)</label>
        <input id="p-extra" placeholder="#hashtags in first comment" />
      </div>` : `
      <div class="field">
        <label>Buttons (optional)</label>
        <input id="p-extra" placeholder="Label|https://link.com" />
        <div class="hint">Inline button as Label|URL. Leave blank for none.</div>
      </div>`}

      <div class="btn-row">
        <div class="field" style="flex:1;margin:0">
          <label>Date</label>
          <input id="p-date" type="date" />
        </div>
        <div class="field" style="flex:1;margin:0">
          <label>Time</label>
          <input id="p-time" type="time" />
        </div>
      </div>

      <button class="btn btn-primary" id="schedule" style="margin-top:18px">Schedule post</button>
    `;

    $("#view-posts").addEventListener("click", () => navigate("posts", { case: c }));

    $("#schedule").addEventListener("click", async () => {
      const file = $("#p-file").value.trim();
      const text = $("#p-text").value.trim();
      const extra = $("#p-extra").value.trim();
      const date = $("#p-date").value;
      const time = $("#p-time").value;
      if (!text && !file) { toast("Add some content first", true); return; }
      if (!date || !time)  { toast("Pick a date and time", true); return; }
      try {
        busy(true);
        await api("CREATE_POST", {
          case_id: c.id, platform: c.platform,
          file_name: file, message: text, extra, date, time
        });
        toast("Post scheduled");
        navigate("posts", { case: c });
      } catch (e) {
        toast("Could not schedule post", true);
      } finally { busy(false); }
    });
  });

  // ============================================================
  //  VIEW: SUBMITTED / SCHEDULED POSTS
  // ============================================================
  route("posts", async ({ case: c }) => {
    view.innerHTML = `
      <div class="page-title">Scheduled posts</div>
      <div class="page-sub">${c ? "Case: <b>" + esc(c.name) + "</b>" : "All your upcoming posts"}</div>
      <div id="posts-list"></div>`;
    const list = $("#posts-list");
    try {
      busy(true);
      const data = await api("LIST_POSTS", { case_id: c ? c.id : null });
      const posts = data.posts || [];
      if (!posts.length) {
        list.innerHTML = `<div class="empty">${iconClock(40)}<p>No scheduled posts yet.</p></div>`;
      } else {
        list.innerHTML = posts.map(p => `
          <div class="card post-item">
            <div>${esc(p.message || p.file_name || "(media)")}</div>
            <div class="meta">
              <span>${iconClock(14)} ${esc(p.date)} ${esc(p.time)}</span>
              <span>${esc(p.platform || (c && c.platform) || "")}</span>
              ${p.status ? `<span>• ${esc(p.status)}</span>` : ""}
            </div>
          </div>`).join("");
      }
    } catch (e) {
      list.innerHTML = `<div class="empty"><p>Could not load posts.</p></div>`;
    } finally { busy(false); }
  });

  // ============================================================
  //  GUIDE MODAL (reuses toast region as a simple alert)
  // ============================================================
  const GUIDES = {
    "tg-channel": "Open your Telegram channel → add your bot as an admin → forward any channel message to @username_to_id_bot to get the numeric ID, or use @your_channel for public channels.",
    "tg-token": "In Telegram open @BotFather → /newbot → follow prompts → copy the token it gives you (looks like 123456:ABC-DEF...).",
    "ig-account": "In Meta Business Suite → Settings → Accounts → Instagram accounts → the ID is shown in the URL / account details, or via the Graph API Explorer using me/accounts.",
    "ig-token": "In developers.facebook.com create an app → add Instagram Graph API → use the Graph API Explorer to generate a token, then exchange it for a long-lived token."
  };
  function showGuide(key) {
    if (tg && tg.showPopup) {
      tg.showPopup({ title: "Guide", message: GUIDES[key] || "No guide available.", buttons: [{ type: "close" }] });
    } else {
      alert(GUIDES[key] || "No guide available.");
    }
  }

  // ============================================================
  //  Inline SVG icon helpers (no emojis, monoline, currentColor)
  // ============================================================
  function svg(inner, s) { s = s || 22; return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`; }
  function iconPlus(s)     { return svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s); }
  function iconLayers(s)   { return svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>', s); }
  function iconClock(s)    { return svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', s); }
  function iconHelp(s)     { return svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>', s || 14); }
  function iconTelegram(s) { return svg('<path d="M21.5 4.5 2.5 12.5l6 2 2 6 3-4 5 4 3-16z"/>', s); }
  function iconInstagram(s){ return svg('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>', s); }

  // ============================================================
  //  INIT
  // ============================================================
  async function start() {
    if (!bootstrap()) {            // Not inside Telegram → show gate
      show(gate); hide(app); return;
    }
    hide(gate); show(app);
    userStrip.innerHTML = `Signed in as <b>${esc(state.user.first_name || state.user.username || "user")}</b> · ID ${esc(state.user.id)}`;

    try {
      busy(true);
      const init = await api("INIT");          // verify / create <id>-db
      state.cases = init.cases || [];
    } catch (e) {
      toast("Connection to server failed — check config.js", true);
    } finally { busy(false); }

    // Repeat visitors land on cases; first-time on home.
    navigate(state.cases.length ? "cases" : "home");
  }

  start();
})();