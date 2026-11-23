/* TravelTogether: Packing script.
   The "Shared helpers" block at the top is the same in every page's script. This page's own code starts
   at the heading comment with its name. Pages talk to each other only through localStorage keys
   (see README.md), never by importing each other. */
(function () {
  "use strict";

  /* ======================================================================
     Shared helpers. This block is repeated at the top of every page's script
     so each page stays self-contained (the contract is the localStorage keys,
     not shared files).
     ====================================================================== */
  const TRIP_KEY = "tp:trip";
  const THEME_KEY = "tp:theme";
  const MAX_TRIP_DAYS = 366;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    up: ["M10 16V4M5 9l5-5 5 5"],
    down: ["M10 4v12M5 11l5 5 5-5"],
    edit: ["M3 17l.8-3.6L13.6 3.6a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6L6.6 16.2 3 17z", "M12 5.2l2.8 2.8"],
    delete: ["M4 6h12M8 6V4h4v2M6 6l.7 11h6.6L14 6M8.5 9v5M11.5 9v5"],
    location: ["M10 17s6-4.6 6-9a6 6 0 1 0-12 0c0 4.4 6 9 6 9z", "M10 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"],
    plus: ["M10 4v12M4 10h12"],
    close: ["M5 5l10 10M15 5L5 15"],
    check: ["M4 10.5l4 4 8-9"],
    clock: ["M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M10 6.5V10l2.5 1.5"],
    upload: ["M10 13V3M6.5 6.5L10 3l3.5 3.5M4 12.5v3h12v-3"],
    download: ["M10 3v10M6.5 9.5L10 13l3.5-3.5M4 12.5v3h12v-3"],
    printer: ["M5 7V3h10v4M5 14H3V8h14v6h-2M5 11h10v6H5z"],
    alert: ["M10 3l8 14H2L10 3z", "M10 8v4M10 14.5v.01"]
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    (ICONS[name] || []).forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  function plural(count, one, many) {
    return count + " " + (count === 1 ? one : many);
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function slugify(text, fallback) {
    const slug = String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || fallback || "trip";
  }

  /* ---- storage: never throws ---- */
  function storageGet(key) {
    try { return { ok: true, value: window.localStorage.getItem(key) }; }
    catch (error) { return { ok: false, value: null }; }
  }
  function storageSet(key, text) {
    try { window.localStorage.setItem(key, text); }
    catch (error) { return false; }
    queueSync(key);
    return true;
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); }
    catch (error) { return false; }
    queueSync(key);
    return true;
  }

  /* ---- calendar dates (YYYY-MM-DD) without timezone shifts ---- */
  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(2000, 0, 1, 0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }
  function dateKey(date) {
    return String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function dayNumber(key) {
    const date = parseDate(key);
    return date ? Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) : NaN;
  }
  function daysBetween(startKey, endKey) {
    const first = dayNumber(startKey);
    const last = dayNumber(endKey);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
    const days = [];
    const cursor = parseDate(startKey);
    for (let index = first; index <= last; index += 1) {
      days.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
  function tripLength(trip) {
    return dayNumber(trip.endDate) - dayNumber(trip.startDate) + 1;
  }
  /* Where today falls against the trip: before it, during it, or after it. */
  function tripWhen(trip) {
    const today = dayNumber(todayKey());
    const start = dayNumber(trip.startDate);
    const end = dayNumber(trip.endDate);
    if (today < start) {
      const left = start - today;
      return { phase: "upcoming", text: left === 1 ? "Starts tomorrow" : "Starts in " + left + " days" };
    }
    if (today > end) {
      const gone = today - end;
      return { phase: "past", text: gone === 1 ? "Ended yesterday" : "Ended " + gone + " days ago" };
    }
    return { phase: "now", text: "Happening now: day " + (today - start + 1) + " of " + (end - start + 1) };
  }
  function todayKey() {
    return dateKey(new Date());
  }
  function formatDate(key, options) {
    const date = parseDate(key);
    return date ? new Intl.DateTimeFormat(undefined, options).format(date) : String(key || "");
  }
  function formatRange(startKey, endKey) {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    if (!start || !end) return "";
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
    return typeof formatter.formatRange === "function" ? formatter.formatRange(start, end) : formatter.format(start) + " to " + formatter.format(end);
  }

  /* ---- the shared trip contract (read-only here) ---- */
  function isValidTrip(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.id !== "string" || !value.id.trim()) return false;
    if (typeof value.title !== "string" || !value.title.trim()) return false;
    if (typeof value.destination !== "string" || !value.destination.trim()) return false;
    if (!parseDate(value.startDate) || !parseDate(value.endDate) || value.endDate < value.startDate) return false;
    if (tripLength(value) > MAX_TRIP_DAYS) return false;
    if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return false;
    return Number.isInteger(value.travelers) && value.travelers > 0;
  }
  function readActiveTrip() {
    const raw = storageGet(TRIP_KEY);
    if (!raw.ok) return { trip: null, status: "unavailable" };
    if (raw.value === null) return { trip: null, status: "none" };
    try {
      const parsed = JSON.parse(raw.value);
      return isValidTrip(parsed) ? { trip: parsed, status: "ok" } : { trip: null, status: "invalid" };
    } catch (error) {
      return { trip: null, status: "invalid" };
    }
  }
  function fillTripStrip(trip) {
    const set = (name, text) => {
      document.querySelectorAll('[data-trip="' + name + '"]').forEach((node) => { node.textContent = text; });
    };
    set("title", trip.title);
    set("destination", trip.destination);
    set("dates", formatRange(trip.startDate, trip.endDate));
    set("length", plural(tripLength(trip), "day", "days"));
    const when = tripWhen(trip);
    document.querySelectorAll('[data-trip="when"]').forEach((node) => {
      node.textContent = when.text;
      node.dataset.phase = when.phase;
    });
    set("travelers", plural(trip.travelers, "traveler", "travelers"));
    set("currency", "Budget in " + trip.currency);
  }

  /* ---- messages ---- */
  function announce(message) {
    const live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 40);
  }
  function showNotice(message, kind, action) {
    const box = document.getElementById("notice");
    if (!box) return;
    box.querySelector(".notice-text").textContent = message;
    box.dataset.kind = kind || "info";
    const old = box.querySelector(".notice-action");
    if (old) old.remove();
    if (action) {
      const button = el("button", "button button-secondary button-small notice-action", action.label);
      button.type = "button";
      button.addEventListener("click", action.onClick);
      box.querySelector(".notice-text").after(button);
    }
    box.hidden = false;
    announce(message);
  }
  function hideNotice() {
    const box = document.getElementById("notice");
    if (box) box.hidden = true;
  }
  function wireNotice() {
    const close = document.getElementById("notice-close");
    if (close) close.addEventListener("click", hideNotice);
  }

  /* ---- accessible dialogs (fall back to window.confirm) ---- */
  // choiceDialog resolves with the value of the chosen button, or null when cancelled.
  function choiceDialog(options) {
    return new Promise((resolve) => {
      if (typeof HTMLDialogElement === "undefined" || typeof HTMLDialogElement.prototype.showModal !== "function") {
        resolve(window.confirm(options.message) ? options.choices[0].value : null);
        return;
      }
      const stamp = String(Date.now());
      const dialog = el("dialog", "dialog");
      dialog.setAttribute("aria-labelledby", "dlg-title-" + stamp);
      dialog.setAttribute("aria-describedby", "dlg-text-" + stamp);
      const form = el("form", "dialog-body");
      form.method = "dialog";
      const title = el("h2", "", options.title);
      title.id = "dlg-title-" + stamp;
      const text = el("p", "", options.message);
      text.id = "dlg-text-" + stamp;
      const actions = el("div", "dialog-actions");
      const cancel = el("button", "button button-secondary", options.cancelLabel || "Cancel");
      cancel.type = "submit";
      cancel.value = "";
      actions.append(cancel);
      options.choices.forEach((choice) => {
        const button = el("button", "button " + (choice.danger ? "button-danger" : "button-primary"), choice.label);
        button.type = "submit";
        button.value = choice.value;
        actions.append(button);
      });
      form.append(title, text, actions);
      dialog.append(form);
      document.body.append(dialog);
      dialog.addEventListener("close", () => {
        const value = dialog.returnValue || null;
        dialog.remove();
        resolve(value);
      });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(""); });
      dialog.showModal();
      cancel.focus();
    });
  }

  function confirmDialog(options) {
    return choiceDialog({
      title: options.title,
      message: options.message,
      cancelLabel: options.cancelLabel,
      choices: [{ value: "confirm", label: options.confirmLabel || "Confirm", danger: options.danger }]
    }).then((value) => value === "confirm");
  }

  /* ---- JSON files ---- */
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---- theme: follows the system, switchable, remembered ---- */
  function applyTheme(theme, remember) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#060b18" : "#f8fafc");
    const button = document.getElementById("theme-toggle");
    if (button) {
      const label = "Switch to " + (theme === "dark" ? "light" : "dark") + " theme";
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    if (remember) storageSet(THEME_KEY, theme);
  }
  /* Switch theme. Where the browser supports view transitions, the new theme is revealed
     in a circle that grows from the button; otherwise (or with reduced motion) it is instant. */
  let reveals = 0;
  function switchTheme(button) {
    const root = document.documentElement;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    };
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof document.startViewTransition !== "function") { apply(); return; }
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    root.style.setProperty("--reveal-x", x + "px");
    root.style.setProperty("--reveal-y", y + "px");
    root.style.setProperty("--reveal-r", Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))) + "px");
    root.classList.add("theme-reveal");
    reveals += 1;
    const done = () => {
      reveals -= 1;
      if (reveals > 0) return;
      reveals = 0;
      root.classList.remove("theme-reveal");
      ["--reveal-x", "--reveal-y", "--reveal-r"].forEach((name) => root.style.removeProperty(name));
    };
    try {
      const transition = document.startViewTransition(apply);
      transition.ready.catch(() => {}); /* a quick second click skips this one: not an error */
      transition.finished.then(done, done);
    } catch (error) {
      apply();
      done();
    }
  }

  /* ======================================================================
     Accounts and the database (Supabase, used through its REST API).
     When CLOUD_CONFIG is filled in, visitors can create an account and log
     in. Their trips and plans are then saved in the database's "user_data"
     table and follow them to any browser, and destinations added on the
     Admin page are stored in the "destinations" table for every visitor.
     With CLOUD_CONFIG empty the site works as before, in this browser only.
     The key is the project's PUBLIC (anon/publishable) key, which is meant
     to be in the page: row-level security in the database decides what it
     may read and write (see database.sql). Never put the secret key here.
     ====================================================================== */
  const CLOUD_CONFIG = { url: "https://izrjmpqbbtbantlhqrct.supabase.co", key: "sb_publishable_17Jau0Uj5lEfiJ68padrnA_DSfy2JMo" };
  const SESSION_KEY = "tp:session";
  const SYNCED = /^tp:(trip|trips|favorites|itinerary:[\w:-]+|budget:[\w:-]+|packing:[\w:-]+)$/;
  function cloudConfig() { return window.__tpCloudConfig || CLOUD_CONFIG; }
  function cloudReady() {
    const conf = cloudConfig();
    return Boolean(conf.url && conf.key) && typeof fetch === "function" && (window.__tpCloud === true || !navigator.webdriver);
  }
  function rawSet(key, text) { try { window.localStorage.setItem(key, text); return true; } catch (error) { return false; } }
  function rawRemove(key) { try { window.localStorage.removeItem(key); return true; } catch (error) { return false; } }
  function readSession() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_KEY));
      return value && typeof value.access_token === "string" && value.user && typeof value.user.id === "string" ? value : null;
    } catch (error) { return null; }
  }
  function writeSession(session) {
    if (session) rawSet(SESSION_KEY, JSON.stringify(session));
    else rawRemove(SESSION_KEY);
  }
  function sessionFrom(data, previous) {
    if (!data || typeof data.access_token !== "string" || !data.user || typeof data.user.id !== "string") return null;
    const meta = data.user.user_metadata || {};
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
      user: { id: data.user.id, email: data.user.email || "", name: cleanName(meta.display_name) || (previous ? previous.user.name : "") },
      admin: previous ? previous.admin === true : false
    };
  }
  function cleanName(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : ""; }
  function cloudError(data, status) {
    const text = data && (data.error_description || data.msg || data.message || data.error);
    const error = new Error(typeof text === "string" && text ? text : "The server answered " + status + ".");
    error.status = status;
    return error;
  }
  function cloudFetch(path, options, token) {
    const conf = cloudConfig();
    const opts = options || {};
    /* A logged-in request carries the user's token. Publishable keys (sb_publishable_...) are not tokens,
       so a visitor's request sends only the apikey header; older anon keys are sent both ways. */
    const headers = { apikey: conf.key };
    if (token) headers.Authorization = "Bearer " + token;
    else if (!/^sb_/.test(conf.key)) headers.Authorization = "Bearer " + conf.key;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(conf.url.replace(/\/+$/, "") + path, {
      method: opts.method || "GET", headers, keepalive: opts.keepalive === true,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then((response) => response.text().then((text) => {
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
      if (!response.ok) throw cloudError(data, response.status);
      return data;
    }), () => { throw new Error("Couldn't reach the server. Check your connection."); });
  }
  let refreshing = null;
  function freshSession() {
    const session = readSession();
    if (!session) return Promise.resolve(null);
    if (session.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(session);
    if (!refreshing) {
      refreshing = cloudFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } })
        .then((data) => { const next = sessionFrom(data, session); writeSession(next); return next; })
        .catch((error) => { if (error.status) writeSession(null); return error.status ? null : session; })
        .then((value) => { refreshing = null; return value; });
    }
    return refreshing;
  }
  function cloudData(path, options) {
    return freshSession().then((session) => {
      if (!session) throw new Error("You're logged out. Log in again to save to your account.");
      return cloudFetch(path, options, session.access_token);
    });
  }
  /* Compare stored JSON by meaning: the database may reorder object keys. */
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function localSyncedKeys() {
    const keys = [];
    try { for (let index = 0; index < window.localStorage.length; index += 1) { const key = window.localStorage.key(index); if (SYNCED.test(key)) keys.push(key); } }
    catch (error) { /* storage blocked */ }
    return keys;
  }

  /* ---- saving changes to the account: every write of a synced key is queued and sent shortly after ---- */
  const pendingKeys = new Set();
  let syncTimer = 0;
  let cloudSyncState = { state: "saved", message: "" };
  function setSyncState(state, message) {
    cloudSyncState = { state, message: message || "" };
    const line = document.getElementById("account-sync");
    if (line) {
      line.dataset.state = state;
      line.textContent = state === "saving" ? "Saving to your account…" : state === "error" ? "Not saved: " + cloudSyncState.message : "Everything is saved to your account.";
    }
  }
  function queueSync(key) {
    if (!SYNCED.test(key) || !cloudReady() || !readSession()) return;
    pendingKeys.add(key);
    setSyncState("saving");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => flushSync(false), 600);
  }
  function flushSync(leaving) {
    clearTimeout(syncTimer);
    const session = readSession();
    if (!session || !pendingKeys.size) return Promise.resolve();
    const keys = Array.from(pendingKeys);
    pendingKeys.clear();
    const upserts = [];
    const removals = [];
    keys.forEach((key) => {
      const raw = storageGet(key);
      if (raw.value === null) { removals.push(key); return; }
      try { upserts.push({ user_id: session.user.id, key, value: JSON.parse(raw.value) }); } catch (error) { /* not JSON: skip */ }
    });
    const send = (path, options) => (leaving ? cloudFetch(path, Object.assign({ keepalive: true }, options), session.access_token) : cloudData(path, options));
    const jobs = [];
    if (upserts.length) jobs.push(send("/rest/v1/user_data?on_conflict=user_id,key", { method: "POST", body: upserts, prefer: "resolution=merge-duplicates,return=minimal" }));
    if (removals.length) jobs.push(send("/rest/v1/user_data?key=in." + encodeURIComponent("(" + removals.map((key) => '"' + key + '"').join(",") + ")"), { method: "DELETE", prefer: "return=minimal" }));
    return Promise.all(jobs).then(() => { if (!pendingKeys.size) setSyncState("saved"); }, (error) => {
      keys.forEach((key) => pendingKeys.add(key));
      setSyncState("error", error.message);
    });
  }
  /* Bring the account's saved data into this browser. "merge" (right after logging in) keeps
     what was made here before logging in and uploads it; "mirror" makes this browser match the account. */
  function applyRows(rows, mode) {
    const inCloud = new Set();
    let changed = false;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !SYNCED.test(row.key) || row.value === undefined) return;
      inCloud.add(row.key);
      let local = null;
      try { local = JSON.parse(storageGet(row.key).value); } catch (error) { local = null; }
      if (canonical(local) !== canonical(row.value)) { rawSet(row.key, JSON.stringify(row.value)); changed = true; }
    });
    localSyncedKeys().forEach((key) => {
      if (inCloud.has(key) || pendingKeys.has(key)) return;
      if (mode === "merge") pendingKeys.add(key);
      else { rawRemove(key); changed = true; }
    });
    return changed;
  }
  function loadProfile(session) {
    return cloudData("/rest/v1/profiles?select=display_name,is_admin&id=eq." + encodeURIComponent(session.user.id)).then((rows) => {
      const profile = Array.isArray(rows) && rows[0] ? rows[0] : {};
      const current = readSession() || session;
      current.admin = profile.is_admin === true;
      current.user.name = cleanName(profile.display_name) || current.user.name;
      writeSession(current);
      return current;
    });
  }
  function afterLogin(data) {
    const session = sessionFrom(data, null);
    if (!session) return Promise.reject(new Error("The server sent an answer the site didn't understand."));
    writeSession(session);
    return loadProfile(session)
      .then(() => cloudData("/rest/v1/user_data?select=key,value"))
      .then((rows) => { applyRows(rows, "merge"); return flushSync(false); })
      .then(() => readSession());
  }
  function logIn(email, password) {
    return cloudFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }).then(afterLogin);
  }
  function signUp(name, email, password) {
    return cloudFetch("/auth/v1/signup", { method: "POST", body: { email, password, data: { display_name: name } } })
      .then((data) => (data && data.access_token ? afterLogin(data) : { needsConfirmation: true }));
  }
  function logOut() {
    return flushSync(false).catch(() => null).then(() => {
      const session = readSession();
      return session ? cloudFetch("/auth/v1/logout", { method: "POST" }, session.access_token).catch(() => null) : null;
    }).then(() => {
      /* leave nothing of this account behind in a shared browser */
      localSyncedKeys().forEach(rawRemove);
      writeSession(null);
      window.location.href = "./index.html";
    });
  }

  /* ---- the account button in the header ---- */
  function initialsFor(text) {
    return String(text || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";
  }
  function renderAccount() {
    const host = document.getElementById("account");
    if (!host) return;
    host.replaceChildren();
    host.hidden = !cloudReady();
    if (host.hidden) return;
    const session = readSession();
    const page = window.location.pathname.split("/").pop() || "index.html";
    if (!session) {
      const link = el("a", "account-login", "Log in");
      link.href = "./login.html" + (page === "login.html" ? "" : "?next=" + encodeURIComponent(page));
      host.append(link);
      return;
    }
    const name = session.user.name || session.user.email;
    const menu = el("details", "account-menu");
    const summary = el("summary", "account-button");
    summary.setAttribute("aria-label", "Account menu for " + name);
    summary.append(el("span", "account-avatar", initialsFor(name)), el("span", "account-name", name));
    const panel = el("div", "account-panel");
    panel.append(el("p", "account-who", name), el("p", "account-email", session.user.email));
    const sync = el("p", "account-sync");
    sync.id = "account-sync";
    sync.setAttribute("role", "status");
    panel.append(sync);
    if (session.admin) {
      const admin = el("a", "account-item", "Destination admin");
      admin.href = "./admin.html";
      panel.append(admin);
    }
    const out = el("button", "account-item account-out", "Log out");
    out.type = "button";
    out.addEventListener("click", () => { out.disabled = true; out.textContent = "Logging out…"; logOut(); });
    panel.append(out);
    menu.append(summary, panel);
    menu.addEventListener("keydown", (event) => { if (event.key === "Escape" && menu.open) { menu.open = false; summary.focus(); } });
    document.addEventListener("click", (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
    host.append(menu);
    setSyncState(cloudSyncState.state, cloudSyncState.message);
  }
  let pulledThisPage = false;
  function cloudBoot() {
    if (!cloudReady()) return;
    renderAccount();
    window.addEventListener("pagehide", () => { flushSync(true); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSync(true); });
    if (!readSession() || pulledThisPage) return;
    pulledThisPage = true;
    freshSession().then((session) => {
      if (!session) { renderAccount(); return null; }
      return Promise.all([loadProfile(session), cloudData("/rest/v1/user_data?select=key,value")]).then((results) => {
        renderAccount();
        if (!applyRows(results[1], "mirror")) return;
        /* this browser was behind the account: show the account's data (once) */
        let last = 0;
        try { last = Number(window.sessionStorage.getItem("tp:pulled")) || 0; } catch (error) { last = 0; }
        if (Date.now() - last < 8000) return;
        try { window.sessionStorage.setItem("tp:pulled", String(Date.now())); } catch (error) { /* ignore */ }
        window.location.reload();
      });
    }).catch((error) => setSyncState("error", error.message));
  }

  /* iPhone-style tab press: the glass bubble squishes over to the tapped tab first,
     then the next page loads (and the header shows a loading shine until it does). */
  function initNavLens() {
    const root = document.documentElement;
    const nav = document.querySelector(".primary-nav");
    const calm = () => Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const isPageLink = (link, event) => link && link.href && !link.hasAttribute("download") && (!link.target || link.target === "_self") &&
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
      link.origin === window.location.origin && link.pathname !== window.location.pathname;
    let going = false;
    /* arrived from a bubble move: the bubble is already over this tab, so the page just crossfades */
    try {
      if (window.sessionStorage.getItem("tp:lens")) {
        window.sessionStorage.removeItem("tp:lens");
        root.classList.add("lens-arrived");
        window.setTimeout(() => root.classList.remove("lens-arrived"), 1200);
      }
    } catch (error) { /* storage blocked */ }

    /* any link to another page of the site: show the loading shine straight away */
    document.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!event.defaultPrevented && isPageLink(link, event)) root.classList.add("is-navigating");
    });
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;   /* came back with the Back button: undo the half-finished move */
      going = false;
      root.classList.remove("is-navigating");
      if (nav) {
        nav.classList.remove("lens-moving");
        nav.querySelectorAll(".nav-lens").forEach((lens) => lens.remove());
        nav.querySelectorAll(".is-target, .is-pressed").forEach((link) => link.classList.remove("is-target", "is-pressed"));
      }
    });
    if (!nav) return;

    const release = () => nav.querySelectorAll(".is-pressed").forEach((link) => link.classList.remove("is-pressed"));
    nav.addEventListener("pointerdown", (event) => {
      const link = event.target.closest("a");
      if (link && event.button === 0) link.classList.add("is-pressed");
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => nav.addEventListener(type, release));

    nav.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!isPageLink(link, event)) return;
      if (going) { event.preventDefault(); return; }
      const from = nav.querySelector('a[aria-current="page"]');
      if (calm() || !from || typeof link.animate !== "function") return;   /* plain, instant navigation */
      event.preventDefault();
      going = true;
      const a = { x: from.offsetLeft, y: from.offsetTop, w: from.offsetWidth, h: from.offsetHeight };
      const b = { x: link.offsetLeft, y: link.offsetTop, w: link.offsetWidth, h: link.offsetHeight };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 + Math.abs(b.x - a.x) * 0.45 };
      const lens = document.createElement("span");
      lens.className = "nav-lens";
      lens.setAttribute("aria-hidden", "true");
      Object.assign(lens.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
      nav.append(lens);
      nav.classList.add("lens-moving");
      link.classList.add("is-target");
      const at = (box, w, sx, sy, offset) => Object.assign({ left: box.x + "px", top: box.y + "px", width: w + "px", transform: "scale(" + sx + ", " + sy + ")" }, offset === undefined ? {} : { offset });
      lens.animate([
        at(a, a.w, 1, 1),
        at(a, a.w, 1.08, 1.1, 0.14),                                   /* lifts as it lets go */
        { left: mid.x - (mid.w - (a.w + b.w) / 2) / 2 + "px", top: mid.y + "px", width: mid.w + "px", transform: "scale(1.04, 0.86)", offset: 0.5 }, /* stretches while it travels */
        at(b, b.w, 0.97, 1.06, 0.8),                                   /* lands with a little wobble */
        at(b, b.w, 1, 1)
      ], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
      window.setTimeout(() => {
        root.classList.add("is-navigating");
        try { window.sessionStorage.setItem("tp:lens", "1"); } catch (error) { /* private mode: only the hand-off is less smooth */ }
        window.location.assign(link.href);
      }, 300);
    });
  }

  /* Liquid Glass highlight: a soft light follows the mouse across glass surfaces */
  function initGlint() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const GLASS = ".button, .choice, .theme-toggle, .account-button, .account-login, .header-inner, .header-cta, .hero-pick";
    let lit = null;
    let frame = 0;
    let last = null;
    const dim = () => { if (lit) { lit.classList.remove("glint"); lit = null; } };
    const paint = () => {
      frame = 0;
      const event = last;
      const target = event.target instanceof Element ? event.target.closest(GLASS) : null;
      if (target !== lit) { dim(); if (target) { lit = target; lit.classList.add("glint"); } }
      if (!lit) return;
      const box = lit.getBoundingClientRect();
      lit.style.setProperty("--gx", Math.round(event.clientX - box.left) + "px");
      lit.style.setProperty("--gy", Math.round(event.clientY - box.top) + "px");
    };
    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      last = event;
      if (!frame) frame = window.requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener("pointerleave", dim);
    window.addEventListener("blur", dim);
  }

  function initTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
    cloudBoot();
    /* the header turns into a floating glass capsule once the page scrolls */
    const markScrolled = () => document.documentElement.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", markScrolled, { passive: true });
    markScrolled();
    /* pages slide up under the floating header by exactly its height */
    const header = document.querySelector(".site-header");
    if (header) {
      const measure = () => document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
      measure();
      if ("ResizeObserver" in window) new ResizeObserver(measure).observe(header);
    }
    initNavLens();
    initGlint();
    const button = document.getElementById("theme-toggle");
    if (button) button.addEventListener("click", () => switchTheme(button));
    /* A page-to-page transition that gets skipped (hidden tab, quick second click) is not an error. */
    window.addEventListener("pagereveal", (event) => {
      if (event.viewTransition) event.viewTransition.ready.catch(() => {});
    });
    const query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (query && query.addEventListener) {
      query.addEventListener("change", (event) => {
        const saved = storageGet(THEME_KEY).value;
        if (saved !== "light" && saved !== "dark") applyTheme(event.matches ? "dark" : "light", false);
      });
    }
    window.addEventListener("storage", (event) => {
      if (event.key === THEME_KEY && (event.newValue === "light" || event.newValue === "dark")) applyTheme(event.newValue, false);
    });
  }

  /* ---- keep a second tab honest ---- */
  function watchActiveTrip() {
    window.addEventListener("storage", (event) => {
      if (event.key !== TRIP_KEY && event.key !== null) return;
      showNotice("The active trip was changed in another tab.", "warning", { label: "Reload this page", onClick: () => window.location.reload() });
    });
  }

  /* ======================================================================
     Packing page.
     Reads the active trip (it never writes it) and keeps this trip's list
     under localStorage["tp:packing:" + trip.id] as
     { version: 1, travelers: [name, ...], items: [{ id, name, category,
     quantity, traveler, packed }] }.
     "travelers" holds one name per person on the trip ("Traveler 1" ... until
     they are renamed); items point at a traveler by name.
     ====================================================================== */
  const STORAGE_PREFIX = "tp:packing:";
  const MAX_ITEMS = 5000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_NAME = 120;
  const MAX_TRAVELER = 80;
  const MAX_QUANTITY = 999;
  const CATEGORIES = ["documents", "clothing", "toiletries", "electronics", "health", "other"];
  const CATEGORY_LABELS = { documents: "Documents", clothing: "Clothing", toiletries: "Toiletries", electronics: "Electronics", health: "Health", other: "Other" };
  const FIELD_IDS = { name: "item-name", quantity: "item-quantity", traveler: "item-traveler" };
  const ACTION_TITLES = { edit: "Edit", delete: "Delete" };

  // Personal things are added once per traveler; shared things (marked) once for the group.
  const TEMPLATES = {
    city: {
      label: "City",
      items: [
        { name: "Passport or ID card", category: "documents", quantity: 1 },
        { name: "Travel insurance", category: "documents", quantity: 1 },
        { name: "Comfortable walking shoes", category: "clothing", quantity: 1 },
        { name: "Toiletry bag", category: "toiletries", quantity: 1 },
        { name: "Phone charger", category: "electronics", quantity: 1 },
        { name: "Reusable water bottle", category: "other", quantity: 1 },
        { name: "Power adapter", category: "electronics", quantity: 1, shared: true },
        { name: "Snacks", category: "other", quantity: 1, shared: true }
      ]
    },
    beach: {
      label: "Beach",
      items: [
        { name: "Swimwear", category: "clothing", quantity: 2 },
        { name: "Beach towel", category: "other", quantity: 1 },
        { name: "Flip-flops", category: "clothing", quantity: 1 },
        { name: "Sun hat", category: "clothing", quantity: 1 },
        { name: "Sunglasses", category: "other", quantity: 1 },
        { name: "Water bottle", category: "other", quantity: 1 },
        { name: "Sunscreen", category: "toiletries", quantity: 1, shared: true },
        { name: "After-sun lotion", category: "toiletries", quantity: 1, shared: true }
      ]
    },
    hiking: {
      label: "Hiking",
      items: [
        { name: "Hiking shoes", category: "clothing", quantity: 1 },
        { name: "Rain jacket", category: "clothing", quantity: 1 },
        { name: "Water filter bottle", category: "other", quantity: 1 },
        { name: "Headlamp", category: "electronics", quantity: 1 },
        { name: "Trail snacks", category: "other", quantity: 1, shared: true },
        { name: "First aid kit", category: "health", quantity: 1, shared: true },
        { name: "Blister plasters", category: "health", quantity: 1, shared: true },
        { name: "Trail map or offline maps", category: "documents", quantity: 1, shared: true }
      ]
    },
    winter: {
      label: "Winter",
      items: [
        { name: "Thermal layers", category: "clothing", quantity: 2 },
        { name: "Winter coat", category: "clothing", quantity: 1 },
        { name: "Gloves", category: "clothing", quantity: 1 },
        { name: "Warm hat", category: "clothing", quantity: 1 },
        { name: "Wool socks", category: "clothing", quantity: 3 },
        { name: "Lip balm", category: "toiletries", quantity: 1 },
        { name: "Hand warmers", category: "health", quantity: 2 },
        { name: "Portable charger", category: "electronics", quantity: 1, shared: true }
      ]
    }
  };

  const $ = (id) => document.getElementById(id);

  const state = {
    trip: null,
    names: [],
    items: [],
    editingId: "",
    storageKey: "",
    canSave: true
  };

  /* ---- names ---- */
  const clean = (text) => String(text === undefined || text === null ? "" : text).replace(/\s+/g, " ").trim();
  const keyOf = (text) => clean(text).toLocaleLowerCase();
  const fold = (text) => String(text).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
  const defaultName = (number) => "Traveler " + number;

  // One name per person on the trip: stored names first, then "Traveler k" for anyone still unnamed.
  function normalizeNames(stored, count) {
    const names = [];
    const used = new Set();
    (Array.isArray(stored) ? stored : []).forEach((value) => {
      const name = typeof value === "string" ? clean(value) : "";
      if (name && name.length <= MAX_TRAVELER && !used.has(keyOf(name)) && names.length < count) {
        names.push(name);
        used.add(keyOf(name));
      }
    });
    for (let slot = names.length; slot < count; slot += 1) {
      let number = slot + 1;
      while (used.has(keyOf(defaultName(number)))) number += 1;
      names.push(defaultName(number));
      used.add(keyOf(defaultName(number)));
    }
    return names;
  }
  // The people on the trip, plus anyone else an imported item refers to.
  function allNames() {
    const list = state.names.slice();
    const seen = new Set(list.map(keyOf));
    state.items.forEach((item) => {
      if (!seen.has(keyOf(item.traveler))) {
        seen.add(keyOf(item.traveler));
        list.push(item.traveler);
      }
    });
    return list;
  }
  // "traveler 1", "Traveler 1" and " Traveler  1 " are the same person: use the first spelling we know.
  function canonicalizeTravelers(items, names) {
    const known = new Map(names.map((name) => [keyOf(name), name]));
    items.forEach((item) => {
      const key = keyOf(item.traveler);
      if (!known.has(key)) known.set(key, item.traveler);
      item.traveler = known.get(key);
    });
  }

  /* ---- one place that decides what a valid item is (storage and import) ---- */
  function readItem(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "it is not an item" };
    const name = typeof raw.name === "string" ? clean(raw.name) : "";
    if (!name) return { error: "the name is empty" };
    if (name.length > MAX_NAME) return { error: "the name is longer than " + MAX_NAME + " characters" };
    const traveler = typeof raw.traveler === "string" ? clean(raw.traveler) : "";
    if (!traveler) return { error: "the traveler is empty" };
    if (traveler.length > MAX_TRAVELER) return { error: "the traveler name is longer than " + MAX_TRAVELER + " characters" };
    if (CATEGORIES.indexOf(raw.category) < 0) return { error: "the category must be one of " + CATEGORIES.join(", ") };
    if (!Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > MAX_QUANTITY) return { error: "the quantity must be a whole number from 1 to " + MAX_QUANTITY };
    if (typeof raw.packed !== "boolean") return { error: "packed must be true or false" };
    const id = typeof raw.id === "string" && raw.id.trim() && raw.id.length <= 100 ? raw.id : "";
    return { item: { id, name, category: raw.category, quantity: raw.quantity, traveler, packed: raw.packed } };
  }
  function ensureIds(list) {
    const seen = new Set();
    list.forEach((item) => {
      if (!item.id || seen.has(item.id)) item.id = makeId("item");
      seen.add(item.id);
    });
  }
  // The same thing for the same person (quantity and packed state do not make it a different item).
  function signature(item) { return keyOf(item.name) + "\u0001" + item.category + "\u0001" + keyOf(item.traveler); }
  function findItem(id) { return state.items.find((item) => item.id === id) || null; }
  function rowFor(id) { return Array.from(document.querySelectorAll("#packing-list .pack-item")).find((row) => row.dataset.id === id) || null; }
  function sameList(item) { return "“" + item.name + "” for " + item.traveler; }

  /* ---- storage ---- */
  function loadChecklist() {
    state.items = [];
    state.names = normalizeNames([], state.trip.travelers);
    const raw = storageGet(state.storageKey);
    if (!raw.ok) { state.canSave = false; return { problem: "storage", skipped: 0 }; }
    state.canSave = true;
    if (raw.value === null) return { problem: "", skipped: 0 };
    let parsed;
    try { parsed = JSON.parse(raw.value); } catch (error) { return { problem: "unreadable", skipped: 0 }; }
    const doc = Array.isArray(parsed) ? { items: parsed } : parsed;
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.items) || (doc.version !== undefined && doc.version !== 1)) return { problem: "unreadable", skipped: 0 };
    state.names = normalizeNames(doc.travelers, state.trip.travelers);
    let skipped = Math.max(0, doc.items.length - MAX_ITEMS);
    doc.items.slice(0, MAX_ITEMS).forEach((entry) => {
      const result = readItem(entry);
      if (result.item) state.items.push(result.item);
      else skipped += 1;
    });
    ensureIds(state.items);
    canonicalizeTravelers(state.items, state.names);
    return { problem: skipped ? "skipped" : "", skipped };
  }

  function save() {
    const ok = storageSet(state.storageKey, JSON.stringify({ version: 1, travelers: state.names, items: state.items }));
    state.canSave = ok;
    renderStorageNote();
    if (!ok) showNotice("This change could not be saved because the browser blocked storage or it is full. Use Export to keep a copy.", "warning");
    return ok;
  }
  function renderStorageNote() {
    $("storage-note").textContent = state.canSave
      ? "Changes save automatically in this browser. Use Export to back up or share this checklist."
      : "Storage is unavailable, so changes will be lost when you leave this page. Use Export to keep a copy.";
  }

  /* ---- progress ---- */
  // Never 100% unless everything is packed, never 0% once something is.
  function percentOf(done, total) {
    if (!total || !done) return 0;
    if (done >= total) return 100;
    return Math.min(99, Math.max(1, Math.round(done / total * 100)));
  }
  function tally() {
    const rows = new Map();
    allNames().forEach((name) => rows.set(keyOf(name), { name, total: 0, packed: 0 }));
    let packed = 0;
    state.items.forEach((item) => {
      const row = rows.get(keyOf(item.traveler));
      row.total += 1;
      if (item.packed) { row.packed += 1; packed += 1; }
    });
    return { total: state.items.length, packed, rows: Array.from(rows.values()) };
  }
  function progressSentence() {
    const sums = tally();
    return " " + sums.packed + " of " + plural(sums.total, "item", "items") + " packed.";
  }
  function setBar(bar, percent, text) {
    bar.setAttribute("aria-valuenow", String(percent));
    bar.setAttribute("aria-valuetext", text);
    bar.firstElementChild.style.setProperty("--w", percent + "%");
  }

  /* ---- progress by category: also a one-tap filter for the checklist ---- */
  function renderCategories() {
    const host = $("category-progress");
    const chosen = $("filter-category").value;
    host.replaceChildren();
    CATEGORIES.forEach((category) => {
      const mine = state.items.filter((item) => item.category === category);
      if (!mine.length) return;
      const packed = mine.filter((item) => item.packed).length;
      const tile = el("button", "cat-tile");
      tile.type = "button";
      tile.dataset.category = category;
      tile.setAttribute("aria-pressed", chosen === category ? "true" : "false");
      const meter = el("i", "cat-meter");
      meter.setAttribute("aria-hidden", "true");
      const fill = el("b", "");
      fill.style.width = percentOf(packed, mine.length) + "%";
      meter.append(fill);
      tile.append(el("strong", "", CATEGORY_LABELS[category]), el("span", "", packed + " of " + mine.length + " packed"), meter);
      const item = el("li", "");
      item.append(tile);
      host.append(item);
    });
    host.hidden = host.children.length === 0;
  }
  function syncCategoryTiles() {
    const chosen = $("filter-category").value;
    document.querySelectorAll("#category-progress .cat-tile").forEach((tile) => {
      tile.setAttribute("aria-pressed", tile.dataset.category === chosen ? "true" : "false");
    });
  }
  function onCategoryClick(event) {
    const tile = event.target.closest(".cat-tile");
    if (!tile) return;
    const select = $("filter-category");
    select.value = select.value === tile.dataset.category ? "all" : tile.dataset.category;
    renderList();
    $("items-title").scrollIntoView({ block: "start" });
  }

  /* ---- rendering ---- */
  function renderSummary() {
    const sums = tally();
    const percent = percentOf(sums.packed, sums.total);
    const caption = sums.total ? sums.packed + " of " + plural(sums.total, "item", "items") + " packed" : "No items yet";
    $("overall-percent").textContent = percent + "%";
    $("overall-caption").textContent = caption;
    setBar($("overall-bar"), percent, caption);
    const done = sums.total > 0 && sums.packed === sums.total;
    $("overall-block").dataset.state = !sums.total ? "empty" : done ? "done" : "partial";
    const message = $("overall-message");
    message.replaceChildren();
    if (!sums.total) message.append(document.createTextNode("Add items one by one, or start from a template."));
    else if (done) message.append(icon("check"), document.createTextNode("Everything is packed. Have a great trip!"));
    else {
      /* Close to departure (or already travelling), say so next to what is left. */
      const when = tripWhen(state.trip);
      const daysLeft = dayNumber(state.trip.startDate) - dayNumber(todayKey());
      const soon = when.phase === "now" ? " The trip has started." : when.phase === "upcoming" && daysLeft <= 7 ? " " + when.text.replace("Starts", "The trip starts") + "." : "";
      message.append(document.createTextNode(plural(sums.total - sums.packed, "item", "items") + " still to pack." + soon));
    }
    $("total-items").textContent = String(sums.total);
    $("packed-items").textContent = String(sums.packed);
    $("remaining-items").textContent = String(sums.total - sums.packed);
    renderCategories();

    const list = $("traveler-progress");
    list.replaceChildren();
    sums.rows.forEach((row) => {
      const share = percentOf(row.packed, row.total);
      const text = row.total ? row.packed + " of " + plural(row.total, "item", "items") + " packed" : "No items yet";
      const item = el("li", "traveler-row");
      const head = el("div", "traveler-head");
      head.append(el("span", "traveler-name", row.name));
      const count = el("span", "traveler-count");
      if (row.total) count.append(el("strong", "", row.packed + " of " + row.total), document.createTextNode(" packed · " + share + "%"));
      else count.textContent = text;
      head.append(count);
      const bar = el("div", "bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", "Progress for " + row.name);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.append(el("span"));
      setBar(bar, share, text);
      item.append(head, bar);
      list.append(item);
    });
  }

  function renderTravelerControls(rename) {
    const names = allNames();
    const fill = (select, withAll) => {
      let current = select.value;
      if (rename && rename.has(keyOf(current))) current = rename.get(keyOf(current));
      select.replaceChildren();
      if (withAll) {
        const all = document.createElement("option");
        all.value = "all";
        all.textContent = "All travelers";
        select.append(all);
      }
      names.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.append(option);
      });
      if (names.indexOf(current) >= 0 || (withAll && current === "all")) select.value = current;
      else select.value = withAll ? "all" : names[0];
    };
    fill($("filter-traveler"), true);
    fill($("item-traveler"), false);
  }

  function filterValues() {
    return {
      search: fold(clean($("search-items").value)),
      traveler: $("filter-traveler").value,
      category: $("filter-category").value,
      packed: $("filter-packed").value
    };
  }
  function filtersActive() {
    const f = filterValues();
    return f.search !== "" || f.traveler !== "all" || f.category !== "all" || f.packed !== "all";
  }
  function matches(item, f) {
    if (f.traveler !== "all" && item.traveler !== f.traveler) return false;
    if (f.category !== "all" && item.category !== f.category) return false;
    if (f.packed === "packed" && !item.packed) return false;
    if (f.packed === "unpacked" && item.packed) return false;
    if (f.search && fold(item.name).indexOf(f.search) < 0 && fold(item.traveler).indexOf(f.search) < 0) return false;
    return true;
  }
  function visibleItems() {
    const f = filterValues();
    const order = new Map(allNames().map((name, index) => [name, index]));
    return state.items
      .filter((item) => matches(item, f))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || order.get(a.traveler) - order.get(b.traveler));
  }

  function iconButton(name, label) {
    const button = el("button", "icon-button" + (name === "delete" ? " delete" : ""));
    button.type = "button";
    button.dataset.action = name;
    button.setAttribute("aria-label", label);
    button.title = ACTION_TITLES[name];
    button.append(icon(name));
    return button;
  }

  function itemRow(item, number) {
    const row = el("li", "pack-item");
    row.dataset.id = item.id;
    row.dataset.packed = String(item.packed);
    if (state.editingId === item.id) row.dataset.editing = "true";
    const label = el("label", "pack-check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = item.packed;
    box.setAttribute("aria-describedby", "pack-meta-" + number);
    label.append(box, el("span", "pack-name", item.name));
    const meta = el("p", "pack-meta");
    meta.id = "pack-meta-" + number;
    meta.append(el("span", "", "Qty " + item.quantity), el("span", "meta-person", item.traveler));
    const actions = el("div", "pack-actions");
    actions.append(iconButton("edit", "Edit " + sameList(item)), iconButton("delete", "Delete " + sameList(item)));
    row.append(label, meta, actions);
    return row;
  }

  function groupCountText(rows) {
    const packed = rows.filter((row) => row.dataset.packed === "true").length;
    return packed + " of " + rows.length + " packed";
  }
  function updateGroupCounts() {
    document.querySelectorAll("#packing-list .pack-group").forEach((group) => {
      group.querySelector(".group-count").textContent = groupCountText(Array.from(group.querySelectorAll(".pack-item")));
    });
  }

  function renderList() {
    syncCategoryTiles();
    const list = visibleItems();
    const root = $("packing-list");
    root.replaceChildren();
    let number = 0;
    CATEGORIES.forEach((category) => {
      const inGroup = list.filter((item) => item.category === category);
      if (!inGroup.length) return;
      const group = el("div", "pack-group");
      const title = el("h3", "group-title");
      title.id = "group-" + category;
      title.append(el("span", "group-name", CATEGORY_LABELS[category]), el("span", "group-count"));
      const ul = el("ul", "pack-list");
      ul.setAttribute("aria-label", CATEGORY_LABELS[category]);
      inGroup.forEach((item) => { ul.append(itemRow(item, number)); number += 1; });
      title.querySelector(".group-count").textContent = groupCountText(Array.from(ul.children));
      group.append(title, ul);
      root.append(group);
    });
    $("item-count").textContent = String(state.items.length);
    $("clear-button").disabled = state.items.length === 0;
    const filtered = filtersActive();
    $("clear-filters").hidden = !filtered;
    root.hidden = list.length === 0;
    $("list-empty").hidden = list.length > 0;
    if (!list.length) {
      const none = state.items.length === 0;
      $("empty-title").textContent = none ? "Nothing on the list yet" : "No items match these filters";
      $("empty-text").textContent = none ? "Add your first item, or start from a template above." : "Try a different search, traveler, category or status.";
      const action = $("empty-action");
      action.textContent = none ? "Add an item" : "Clear filters";
      action.dataset.mode = none ? "add" : "clear";
    }
    let line;
    if (!state.items.length) line = "";
    else if (filtered) line = "Showing " + list.length + " of " + plural(state.items.length, "item", "items");
    else line = plural(state.items.length, "item", "items");
    $("results-line").textContent = line;
    $("results-line").parentElement.hidden = !line && !filtered;
  }

  function refresh(rename) {
    renderTravelerControls(rename);
    renderSummary();
    renderList();
    syncEveryone();
  }

  /* ---- checking things off ---- */
  function onListChange(event) {
    const box = event.target;
    if (!box.matches || !box.matches('input[type="checkbox"]')) return;
    const row = box.closest(".pack-item");
    const item = row ? findItem(row.dataset.id) : null;
    if (!item) return;
    item.packed = box.checked;
    row.dataset.packed = String(item.packed);
    save();
    renderSummary();
    const sums = tally();
    const sentence = sameList(item) + " marked as " + (item.packed ? "packed" : "not packed") + "." + progressSentence() + (sums.total > 0 && sums.packed === sums.total ? " Everything is packed." : "");
    if (matches(item, filterValues())) {
      updateGroupCounts();
      announce(sentence);
      return;
    }
    // The status filter no longer shows this item: take it out and hand focus to its neighbour.
    const sibling = row.nextElementSibling || row.previousElementSibling;
    const next = sibling ? sibling.dataset.id : "";
    renderList();
    const target = next && rowFor(next) ? rowFor(next).querySelector("input") : $("items-title");
    target.focus();
    announce(sentence + " It is hidden by the current filters.");
  }

  function onListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest(".pack-item");
    const item = row ? findItem(row.dataset.id) : null;
    if (!item) return;
    if (button.dataset.action === "edit") beginEdit(item);
    else removeItem(item);
  }

  /* ---- the item form ---- */
  function setFieldError(name, message) {
    const input = $(FIELD_IDS[name]);
    const error = $(FIELD_IDS[name] + "-error");
    if (!error) return;
    if (message) {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
    } else {
      error.textContent = "";
      error.hidden = true;
      input.removeAttribute("aria-invalid");
    }
  }
  function clearErrors() {
    Object.keys(FIELD_IDS).forEach((name) => setFieldError(name, ""));
    const box = $("form-error");
    box.textContent = "";
    box.hidden = true;
  }
  function setStatus(message) { $("form-status").textContent = message; }

  function syncEveryone() {
    const field = $("everyone-field");
    const many = state.names.length > 1;
    field.hidden = !many || Boolean(state.editingId);
    const on = !field.hidden && $("item-everyone").checked;
    $("item-traveler").disabled = on;
    const hint = $("item-traveler-hint");
    hint.hidden = !on;
    hint.textContent = on ? "One item is added for every traveler (" + state.names.length + ")." : "";
  }

  function resetForm(keepChoices) {
    const keep = keepChoices ? { category: $("item-category").value, traveler: $("item-traveler").value, everyone: $("item-everyone").checked } : null;
    state.editingId = "";
    $("packing-form").reset();
    clearErrors();
    $("item-category").value = keep ? keep.category : "documents";
    if (keep && keep.traveler) $("item-traveler").value = keep.traveler;
    else if ($("item-traveler").options.length) $("item-traveler").selectedIndex = 0;
    $("item-everyone").checked = Boolean(keep && keep.everyone);
    $("item-quantity").value = "1";
    $("form-title").textContent = "Add an item";
    $("form-sub").textContent = "One line per thing and per traveler.";
    $("save-item").textContent = "Add item";
    $("cancel-edit").hidden = true;
    syncEveryone();
  }

  function beginEdit(item) {
    state.editingId = item.id;
    clearErrors();
    setStatus("");
    $("item-name").value = item.name;
    $("item-category").value = item.category;
    $("item-quantity").value = String(item.quantity);
    $("item-traveler").value = item.traveler;
    $("item-packed").checked = item.packed;
    $("item-everyone").checked = false;
    $("form-title").textContent = "Edit item";
    $("form-sub").textContent = "Press Save changes when you are done.";
    $("save-item").textContent = "Save changes";
    $("cancel-edit").hidden = false;
    syncEveryone();
    document.querySelectorAll(".pack-item[data-editing]").forEach((row) => row.removeAttribute("data-editing"));
    const row = rowFor(item.id);
    if (row) row.dataset.editing = "true";
    $("item-name").focus();
  }

  function cancelEdit() {
    const id = state.editingId;
    resetForm(false);
    document.querySelectorAll(".pack-item[data-editing]").forEach((row) => row.removeAttribute("data-editing"));
    announce("Editing cancelled.");
    const row = id ? rowFor(id) : null;
    const button = row && row.querySelector('[data-action="edit"]');
    if (button) button.focus();
    else $("item-name").focus();
  }

  function parseQuantity(text, badInput) {
    const value = String(text).trim();
    if (badInput) return { error: "Use a whole number from 1 to " + MAX_QUANTITY + "." };
    if (!value) return { error: "Enter a quantity." };
    if (!/^\d+$/.test(value)) return { error: value.charAt(0) === "-" ? "Quantity must be at least 1." : "Use a whole number from 1 to " + MAX_QUANTITY + "." };
    const number = Number(value);
    if (number < 1) return { error: "Quantity must be at least 1." };
    if (number > MAX_QUANTITY) return { error: "Quantity can't be more than " + MAX_QUANTITY + "." };
    return { value: number };
  }

  function validateForm() {
    const errors = {};
    const name = clean($("item-name").value);
    if (!name) errors.name = "Enter an item name.";
    else if (name.length > MAX_NAME) errors.name = "Use " + MAX_NAME + " characters or fewer.";
    const quantity = parseQuantity($("item-quantity").value, $("item-quantity").validity.badInput);
    if (quantity.error) errors.quantity = quantity.error;
    const everyone = !$("everyone-field").hidden && $("item-everyone").checked;
    const traveler = $("item-traveler").value;
    if (!everyone && !traveler) errors.traveler = "Choose a traveler.";
    return {
      errors,
      values: { name, category: $("item-category").value, quantity: quantity.value, traveler, everyone, packed: $("item-packed").checked }
    };
  }

  function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    setStatus("");
    const result = validateForm();
    const names = Object.keys(FIELD_IDS).filter((name) => result.errors[name]);
    if (names.length) {
      names.forEach((name) => setFieldError(name, result.errors[name]));
      $(FIELD_IDS[names[0]]).focus();
      return;
    }
    if (state.editingId) updateItem(state.editingId, result.values);
    else addItems(result.values);
  }

  function addItems(values) {
    const taken = new Set(state.items.map(signature));
    const fresh = [];
    const had = [];
    (values.everyone ? state.names.slice() : [values.traveler]).forEach((traveler) => {
      const item = { id: "", name: values.name, category: values.category, quantity: values.quantity, traveler, packed: values.packed };
      if (taken.has(signature(item))) { had.push(traveler); return; }
      item.id = makeId("item");
      taken.add(signature(item));
      fresh.push(item);
    });
    if (!fresh.length) {
      setFieldError("name", values.everyone
        ? "Every traveler already has “" + values.name + "” on their list."
        : "“" + values.name + "” is already on the list for " + values.traveler + ". Edit that item to change its quantity.");
      $("item-name").focus();
      return;
    }
    if (state.items.length + fresh.length > MAX_ITEMS) {
      const box = $("form-error");
      box.textContent = "This checklist can hold " + MAX_ITEMS.toLocaleString() + " items and adding this would go past that. Delete some first.";
      box.hidden = false;
      return;
    }
    state.items.push(...fresh);
    save();
    resetForm(true);
    refresh();
    let message;
    if (fresh.length === 1 && !values.everyone) message = "Added “" + values.name + "” for " + fresh[0].traveler + ".";
    else message = "Added “" + values.name + "” for " + plural(fresh.length, "traveler", "travelers") + (had.length ? " (" + had.join(", ") + " already had it)" : "") + ".";
    const hidden = filtersActive() && fresh.some((item) => !rowFor(item.id));
    setStatus(message + progressSentence() + (hidden ? " Some of it is hidden by the current filters." : ""));
    $("item-name").focus();
  }

  function updateItem(id, values) {
    const item = findItem(id);
    if (!item) {
      resetForm(false);
      refresh();
      showNotice("That item no longer exists, so nothing was changed.", "warning");
      return;
    }
    const next = { name: values.name, category: values.category, quantity: values.quantity, traveler: values.traveler, packed: values.packed };
    const clash = state.items.some((other) => other.id !== id && signature(other) === signature(next));
    if (clash) {
      setFieldError("name", "“" + next.name + "” is already on the list for " + next.traveler + ". Edit that item instead, or pick another name.");
      $("item-name").focus();
      return;
    }
    Object.assign(item, next);
    save();
    resetForm(false);
    refresh();
    const hidden = filtersActive() && !rowFor(id);
    setStatus("Saved changes to " + sameList(item) + "." + progressSentence() + (hidden ? " It is hidden by the current filters." : ""));
    const row = rowFor(id);
    const button = row && row.querySelector('[data-action="edit"]');
    if (button) button.focus();
    else $("items-title").focus();
  }

  function removeItem(item) {
    const id = item.id;
    confirmDialog({
      title: "Delete this item?",
      message: sameList(item) + " will be removed from the checklist. This can't be undone.",
      confirmLabel: "Delete item",
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return;
      const index = state.items.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const removed = state.items.splice(index, 1)[0];
      if (state.editingId === id) resetForm(false);
      save();
      refresh();
      announce("Deleted " + sameList(removed) + "." + progressSentence());
      $("items-title").focus();
    });
  }

  function clearChecklist() {
    if (!state.items.length) return;
    const count = state.items.length;
    confirmDialog({
      title: "Clear the whole checklist?",
      message: "All " + plural(count, "item", "items") + " will be removed for every traveler. Traveler names stay as they are. This can't be undone.",
      confirmLabel: "Clear checklist",
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return;
      state.items = [];
      resetForm(false);
      save();
      refresh();
      announce("Checklist cleared. " + plural(count, "item was", "items were") + " removed.");
      $("items-title").focus();
    });
  }

  function clearFilters() {
    $("search-items").value = "";
    $("filter-traveler").value = "all";
    $("filter-category").value = "all";
    $("filter-packed").value = "all";
    renderList();
  }

  /* ---- templates ---- */
  function applyTemplate(name) {
    const template = TEMPLATES[name];
    if (!template) return;
    const taken = new Set(state.items.map(signature));
    const fresh = [];
    let skipped = 0;
    let sharedTurn = 0;
    template.items.forEach((entry) => {
      const owners = entry.shared ? [state.names[sharedTurn++ % state.names.length]] : state.names;
      owners.forEach((traveler) => {
        const item = { id: "", name: entry.name, category: entry.category, quantity: entry.quantity, traveler, packed: false };
        if (taken.has(signature(item))) { skipped += 1; return; }
        item.id = makeId("item");
        taken.add(signature(item));
        fresh.push(item);
      });
    });
    const status = $("template-status");
    if (!fresh.length) {
      status.textContent = "Nothing new to add: everything in the " + template.label + " template is already on your list.";
    } else if (state.items.length + fresh.length > MAX_ITEMS) {
      status.textContent = "The " + template.label + " template would take the checklist past " + MAX_ITEMS.toLocaleString() + " items, so nothing was added.";
    } else {
      state.items.push(...fresh);
      save();
      refresh();
      status.textContent = "Added " + plural(fresh.length, "item", "items") + " from the " + template.label + " template" + (skipped ? "; " + skipped + (skipped === 1 ? " was" : " were") + " already on your list" : "") + ".";
    }
    announce(status.textContent);
  }

  /* ---- traveler names ---- */
  function buildNameFields() {
    const box = $("names-fields");
    box.replaceChildren();
    state.names.forEach((name, index) => {
      const field = el("div", "field");
      const label = el("label", "", "Traveler " + (index + 1));
      label.htmlFor = "name-" + index;
      const input = el("input");
      input.id = "name-" + index;
      input.type = "text";
      input.maxLength = MAX_TRAVELER;
      input.value = name;
      input.setAttribute("aria-describedby", "name-" + index + "-error");
      const error = el("p", "field-error");
      error.id = "name-" + index + "-error";
      error.setAttribute("role", "alert");
      error.hidden = true;
      field.append(label, input, error);
      box.append(field);
    });
    $("names-error").hidden = true;
    $("names-status").textContent = "";
  }

  function onNamesSubmit(event) {
    event.preventDefault();
    const inputs = Array.from($("names-fields").querySelectorAll("input"));
    const values = inputs.map((input) => clean(input.value));
    const seen = new Set();
    let first = -1;
    values.forEach((value, index) => {
      const error = $("name-" + index + "-error");
      let message = "";
      if (!value) message = "Enter a name for traveler " + (index + 1) + ".";
      else if (value.length > MAX_TRAVELER) message = "Use " + MAX_TRAVELER + " characters or fewer.";
      else if (seen.has(keyOf(value))) message = "Another traveler is already called “" + value + "”.";
      seen.add(keyOf(value));
      error.textContent = message;
      error.hidden = !message;
      if (message) { inputs[index].setAttribute("aria-invalid", "true"); if (first < 0) first = index; }
      else inputs[index].removeAttribute("aria-invalid");
    });
    $("names-status").textContent = "";
    if (first >= 0) { inputs[first].focus(); return; }
    const activeId = document.activeElement && document.activeElement.id;
    const before = state.names.slice();
    if (values.every((value, index) => value === before[index])) {
      $("names-status").textContent = "No changes to save.";
      return;
    }
    const rename = new Map(before.map((old, index) => [keyOf(old), values[index]]));
    let moved = 0;
    state.items.forEach((item) => {
      const to = rename.get(keyOf(item.traveler));
      if (to !== undefined && to !== item.traveler) { item.traveler = to; moved += 1; }
    });
    state.names = values;
    canonicalizeTravelers(state.items, state.names);
    save();
    refresh(rename);
    buildNameFields();
    $("names-status").textContent = "Names saved." + (moved ? " " + plural(moved, "item now shows", "items now show") + " the new names." : "");
    announce($("names-status").textContent);
    const again = activeId ? $(activeId) : null;
    (again && $("names-fields").contains(again) ? again : $("save-names")).focus();
  }

  /* ---- export / import ---- */
  function exportJson() {
    const payload = {
      version: 1,
      tripId: state.trip.id,
      tripTitle: state.trip.title,
      exportedAt: new Date().toISOString(),
      travelers: state.names.slice(),
      items: state.items.map((item) => ({ id: item.id, name: item.name, category: item.category, quantity: item.quantity, traveler: item.traveler, packed: item.packed }))
    };
    downloadText("packing-" + slugify(state.trip.title, "trip") + "-" + todayKey() + ".json", JSON.stringify(payload, null, 2));
    showNotice(state.items.length ? "Exported " + plural(state.items.length, "item", "items") + " as a JSON file." : "Exported an empty checklist as a JSON file.", "success");
  }

  function readFileText(file) {
    if (typeof file.text === "function") return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (error) { return { error: "This file is not valid JSON." }; }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "This does not look like a packing export." };
    if (data.version !== undefined && data.version !== 1) return { error: "This file uses format version " + String(data.version).slice(0, 20) + ", which this page can't read." };
    if (!Array.isArray(data.items)) return { error: "This does not look like a packing export: it has no items list." };
    if (data.items.length > MAX_ITEMS) return { error: "This file has more than " + MAX_ITEMS.toLocaleString() + " items." };
    let names = null;
    if (data.travelers !== undefined) {
      if (!Array.isArray(data.travelers) || data.travelers.length > 200) return { error: "The list of traveler names in this file is not valid." };
      for (let i = 0; i < data.travelers.length; i += 1) {
        const name = typeof data.travelers[i] === "string" ? clean(data.travelers[i]) : "";
        if (!name || name.length > MAX_TRAVELER) return { error: "Traveler name " + (i + 1) + " in this file is not valid: it must be text of 1 to " + MAX_TRAVELER + " characters." };
      }
      names = data.travelers.map(clean);
    }
    const items = [];
    for (let i = 0; i < data.items.length; i += 1) {
      const result = readItem(data.items[i]);
      if (result.error) return { error: "Item " + (i + 1) + " can't be imported because " + result.error + "." };
      items.push(result.item);
    }
    return {
      items,
      names,
      tripId: typeof data.tripId === "string" ? data.tripId : "",
      tripTitle: typeof data.tripTitle === "string" ? data.tripTitle.slice(0, 100) : ""
    };
  }

  function onImportFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showNotice("That file is larger than 2 MB, so it can't be a packing export. Nothing was changed.", "warning");
      return;
    }
    readFileText(file).then(handleImport).catch(() => {
      showNotice("That file could not be read. Nothing was changed.", "warning");
    });
  }

  function handleImport(text) {
    const parsed = parseImport(text);
    if (parsed.error) {
      showNotice(parsed.error + " Nothing was changed.", "warning");
      return;
    }
    if (!parsed.items.length) {
      showNotice("That file has no items, so there was nothing to import.", "info");
      return;
    }
    const existing = state.items.length;
    const foreign = Boolean(parsed.tripId) && parsed.tripId !== state.trip.id;
    const source = foreign && parsed.tripTitle ? " It was exported from “" + parsed.tripTitle + "”." : foreign ? " It was exported from a different trip." : "";
    if (!existing && !foreign) {
      applyImport(parsed, "replace");
      return;
    }
    const count = plural(parsed.items.length, "item", "items");
    choiceDialog({
      title: "Import " + count + "?",
      message: existing
        ? "You already have " + plural(existing, "item", "items") + ". Merge adds the items from the file that you do not have yet (the same item for the same traveler counts as the same) and keeps everything else. Replace deletes your current items first and uses the file's traveler names." + source
        : "The file has " + count + "." + source + " Add them to this trip?",
      choices: existing
        ? [{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace all", danger: true }]
        : [{ value: "replace", label: "Import" }]
    }).then((choice) => {
      if (!choice) { announce("Import cancelled."); return; }
      applyImport(parsed, choice);
    });
  }

  function applyImport(parsed, mode) {
    const wasEmpty = state.items.length === 0;
    const names = mode === "replace" && parsed.names ? normalizeNames(parsed.names, state.trip.travelers) : state.names;
    const next = mode === "replace" ? [] : state.items.slice();
    const ids = new Set(next.map((item) => item.id));
    const seen = new Set(next.map(signature));
    let added = 0;
    let skipped = 0;
    parsed.items.forEach((item) => {
      if (seen.has(signature(item))) { skipped += 1; return; }
      const copy = Object.assign({}, item);
      if (!copy.id || ids.has(copy.id)) copy.id = makeId("item");
      ids.add(copy.id);
      seen.add(signature(copy));
      next.push(copy);
      added += 1;
    });
    if (next.length > MAX_ITEMS) {
      showNotice("Importing would take this checklist past " + MAX_ITEMS.toLocaleString() + " items. Nothing was changed.", "warning");
      return;
    }
    canonicalizeTravelers(next, names);
    state.names = names;
    state.items = next;
    resetForm(false);
    save();
    refresh();
    if ($("rename-details").open) buildNameFields();
    let message;
    if (mode === "replace" && !wasEmpty) message = "Replaced your checklist with " + plural(added, "item", "items") + " from the file.";
    else message = "Imported " + plural(added, "item", "items") + (skipped ? " and skipped " + skipped + " you already had" : "") + ".";
    showNotice(message + progressSentence(), "success");
  }

  /* ---- print ---- */
  function renderPrint() {
    const root = $("print-packing");
    root.replaceChildren();
    if (!state.trip) return;
    const trip = state.trip;
    const sums = tally();
    const head = el("header", "print-head");
    head.append(el("h2", "", "Packing checklist · " + trip.title));
    head.append(el("p", "print-sub", trip.destination + " · " + formatRange(trip.startDate, trip.endDate) + " · " + plural(trip.travelers, "traveler", "travelers")));
    head.append(el("p", "print-sub", sums.total ? sums.packed + " of " + plural(sums.total, "item", "items") + " packed (" + percentOf(sums.packed, sums.total) + "%)" : "No items yet"));
    root.append(head);
    if (!sums.total) {
      root.append(el("p", "print-empty", "The checklist is empty."));
      return;
    }
    sums.rows.forEach((row) => {
      const section = el("section", "print-person");
      section.append(el("h3", "", row.name + " · " + (row.total ? row.packed + " of " + row.total + " packed" : "no items")));
      const mine = state.items
        .filter((item) => keyOf(item.traveler) === keyOf(row.name))
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
      if (!mine.length) {
        section.append(el("p", "print-empty", "Nothing assigned."));
      } else {
        const table = el("table", "print-table");
        const header = el("thead");
        const headRow = el("tr");
        ["Packed", "Item", "Qty", "Category"].forEach((label) => headRow.append(el("th", "", label)));
        header.append(headRow);
        const body = el("tbody");
        mine.forEach((item) => {
          const tr = el("tr");
          const cell = el("td");
          cell.append(el("span", "print-box", item.packed ? "✓" : ""));
          tr.append(cell, el("td", "", item.name), el("td", "", String(item.quantity)), el("td", "", CATEGORY_LABELS[item.category]));
          body.append(tr);
        });
        table.append(header, body);
        section.append(table);
      }
      root.append(section);
    });
  }

  /* ---- other tabs ---- */
  function reloadFromStorage() {
    resetForm(false);
    loadChecklist();
    refresh();
    if ($("rename-details").open) buildNameFields();
    renderStorageNote();
    hideNotice();
    announce("Loaded the latest checklist.");
  }
  function onStorage(event) {
    if (event.key !== state.storageKey && event.key !== null) return;
    showNotice("This checklist was changed in another tab.", "warning", { label: "Load the latest", onClick: reloadFromStorage });
  }

  /* ---- start ---- */
  function showEmptyTrip(status) {
    $("packing-app").hidden = true;
    $("no-trip").hidden = false;
    if (status === "invalid") {
      $("no-trip-text").textContent = "The saved trip is incomplete or damaged, so it can't be used. Create it again on Explore and your packing list will be ready here.";
    } else if (status === "unavailable") {
      $("no-trip-text").textContent = "This browser is blocking site storage, so the trip can't be loaded. Allow storage for this site, then reload.";
      showNotice("Site storage is blocked in this browser, so your trip and plans can't be loaded or saved.", "warning");
    }
  }

  function reportLoad(loaded) {
    if (loaded.problem === "storage") {
      showNotice("Site storage is blocked in this browser. You can still work here, but nothing will be saved. Use Export to keep a copy.", "warning");
    } else if (loaded.problem === "unreadable") {
      showNotice("The saved checklist for this trip could not be read, so you are starting fresh. Your first change will replace the unreadable data.", "warning");
    } else if (loaded.problem === "skipped") {
      showNotice(plural(loaded.skipped, "saved item was", "saved items were") + " incomplete or invalid and left out.", "warning");
    }
  }

  function wire() {
    $("category-progress").addEventListener("click", onCategoryClick);
    const form = $("packing-form");
    form.addEventListener("submit", onSubmit);
    form.addEventListener("input", (event) => {
      const id = event.target.id || "";
      const name = Object.keys(FIELD_IDS).find((key) => FIELD_IDS[key] === id);
      if (name) setFieldError(name, "");
      setStatus("");
    });
    $("item-everyone").addEventListener("change", syncEveryone);
    $("cancel-edit").addEventListener("click", cancelEdit);
    $("packing-list").addEventListener("click", onListClick);
    $("packing-list").addEventListener("change", onListChange);
    $("search-items").addEventListener("input", renderList);
    ["filter-traveler", "filter-category", "filter-packed"].forEach((id) => $(id).addEventListener("change", renderList));
    $("clear-filters").addEventListener("click", () => { clearFilters(); $("search-items").focus(); });
    $("empty-action").addEventListener("click", (event) => {
      if (event.currentTarget.dataset.mode === "clear") { clearFilters(); $("search-items").focus(); }
      else $("item-name").focus();
    });
    document.querySelectorAll(".template-button").forEach((button) => {
      button.addEventListener("click", () => applyTemplate(button.dataset.template));
    });
    $("rename-details").addEventListener("toggle", () => { if ($("rename-details").open) buildNameFields(); });
    $("names-form").addEventListener("submit", onNamesSubmit);
    $("names-cancel").addEventListener("click", () => {
      $("rename-details").open = false;
      $("rename-details").querySelector("summary").focus();
    });
    $("clear-button").addEventListener("click", clearChecklist);
    $("jump-add").addEventListener("click", () => { $("item-name").focus(); });
    $("import-button").addEventListener("click", () => { $("import-file").click(); });
    $("import-file").addEventListener("change", onImportFile);
    $("export-button").addEventListener("click", exportJson);
    $("print-button").addEventListener("click", () => { renderPrint(); window.print(); });
    window.addEventListener("beforeprint", renderPrint);
    window.addEventListener("afterprint", () => { $("print-packing").replaceChildren(); });
    window.addEventListener("storage", onStorage);
  }

  function start() {
    initTheme();
    wireNotice();
    const result = readActiveTrip();
    watchActiveTrip();
    if (result.status !== "ok") {
      showEmptyTrip(result.status);
      return;
    }
    state.trip = result.trip;
    state.storageKey = STORAGE_PREFIX + result.trip.id;
    $("no-trip").hidden = true;
    $("packing-app").hidden = false;
    fillTripStrip(result.trip);
    const loaded = loadChecklist();
    resetForm(false);
    refresh();
    renderStorageNote();
    wire();
    reportLoad(loaded);
  }

  start();
})();
