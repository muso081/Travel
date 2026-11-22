/* TravelTogether: Budget script.
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
     Budget page.
     Reads the active trip (it never writes it) and keeps this trip's money
     under localStorage["tp:budget:" + trip.id] as
     { version: 1, totalBudgetMinor, expenses: [{ id, description,
     amountMinor, category, date, status }] }.
     Amounts are whole numbers of the currency's smallest unit (cents), so
     totals are exact. Money is only ever formatted in trip.currency, never
     converted.
     ====================================================================== */
  const STORAGE_PREFIX = "tp:budget:";
  const MAX_EXPENSES = 5000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_MINOR = 1000000000000;
  const MAX_DESCRIPTION = 100;
  const CATEGORIES = ["transport", "accommodation", "food", "activities", "shopping", "other"];
  const CATEGORY_LABELS = { transport: "Transport", accommodation: "Accommodation", food: "Food", activities: "Activities", shopping: "Shopping", other: "Other" };
  const FIELD_IDS = { description: "description", amount: "amount", date: "expense-date" };
  const ACTION_TITLES = { edit: "Edit", delete: "Delete" };

  const $ = (id) => document.getElementById(id);

  const state = {
    trip: null,
    digits: 2,
    currency: "",
    formatter: null,
    plainFormatter: null,
    expenses: [],
    budgetMinor: null,
    editingId: "",
    storageKey: "",
    canSave: true
  };

  /* ---- money ---- */
  function setupMoney(currency) {
    state.currency = currency;
    try {
      const probe = new Intl.NumberFormat(undefined, { style: "currency", currency });
      state.digits = probe.resolvedOptions().maximumFractionDigits;
      state.formatter = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: state.digits, maximumFractionDigits: state.digits });
    } catch (error) {
      state.digits = 2;
      state.formatter = null;
    }
    state.plainFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: state.digits, maximumFractionDigits: state.digits });
  }
  function digitsFor(code) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; }
    catch (error) { return 2; }
  }
  function money(minor) {
    const value = minor / Math.pow(10, state.digits);
    return state.formatter ? state.formatter.format(value) : state.currency + " " + state.plainFormatter.format(value);
  }
  function decimalText(minor) {
    return (minor / Math.pow(10, state.digits)).toFixed(state.digits);
  }
  // A number input reports "" for half-typed junk such as "1e" or "-"; badInput says that is what happened,
  // so it counts as a format problem rather than as an empty field.
  function parseAmount(text, allowZero, badInput) {
    const value = String(text).trim();
    if (badInput) return { error: "format" };
    if (!value) return { error: "empty" };
    if (value.charAt(0) === "-") return { error: "negative" };
    const places = state.digits;
    const pattern = places === 0 ? /^\d+$/ : new RegExp("^(?:\\d+(?:\\.\\d{1," + places + "})?|\\.\\d{1," + places + "})$");
    if (!pattern.test(value)) return { error: "format" };
    const parts = value.split(".");
    const minor = Number(parts[0] || "0") * Math.pow(10, places) + (places ? Number((parts[1] || "").padEnd(places, "0")) : 0);
    if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return { error: "range" };
    if (!allowZero && minor <= 0) return { error: "zero" };
    return { minor };
  }
  function amountMessage(error) {
    if (error === "empty") return "Enter an amount.";
    if (error === "zero") return "Enter an amount greater than 0.";
    if (error === "range") return "That amount is too large.";
    if (error === "negative") return "Amounts can't be negative.";
    return state.digits === 0
      ? "Use whole numbers only; " + state.currency + " has no decimals."
      : "Use numbers only, with at most " + state.digits + " decimal places.";
  }

  /* ---- one place that decides what a valid expense / budget is (storage and import) ---- */
  function readExpense(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "it is not an expense" };
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    if (!description) return { error: "the description is empty" };
    if (description.length > MAX_DESCRIPTION) return { error: "the description is longer than " + MAX_DESCRIPTION + " characters" };
    if (!Number.isSafeInteger(raw.amountMinor) || raw.amountMinor <= 0 || raw.amountMinor > MAX_MINOR) {
      return { error: "amountMinor must be a whole number from 1 to 1,000,000,000,000 (the amount in the smallest unit, such as cents)" };
    }
    if (CATEGORIES.indexOf(raw.category) < 0) return { error: "the category must be one of " + CATEGORIES.join(", ") };
    if (!parseDate(raw.date)) return { error: "the date must look like 2026-03-04" };
    if (raw.status !== "planned" && raw.status !== "paid") return { error: "the status must be planned or paid" };
    const id = typeof raw.id === "string" && raw.id.trim() && raw.id.length <= 100 ? raw.id : "";
    return { expense: { id, description, amountMinor: raw.amountMinor, category: raw.category, date: raw.date, status: raw.status } };
  }
  function readBudget(value) {
    if (value === undefined || value === null) return { value: null };
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR) return { error: "totalBudgetMinor must be empty or a whole number from 0 to 1,000,000,000,000" };
    return { value };
  }
  function ensureIds(list) {
    const seen = new Set();
    list.forEach((expense) => {
      if (!expense.id || seen.has(expense.id)) expense.id = makeId("exp");
      seen.add(expense.id);
    });
  }
  function fingerprint(expense) {
    return [expense.description, expense.amountMinor, expense.category, expense.date, expense.status].join("\u0001");
  }
  function findExpense(id) { return state.expenses.find((expense) => expense.id === id) || null; }
  function rowFor(id) { return Array.from(document.querySelectorAll("#expense-list .expense")).find((row) => row.dataset.id === id) || null; }

  /* ---- storage ---- */
  function loadBudget() {
    state.expenses = [];
    state.budgetMinor = null;
    const raw = storageGet(state.storageKey);
    if (!raw.ok) { state.canSave = false; return { problem: "storage", skipped: 0 }; }
    state.canSave = true;
    if (raw.value === null) return { problem: "", skipped: 0 };
    let parsed;
    try { parsed = JSON.parse(raw.value); } catch (error) { return { problem: "unreadable", skipped: 0 }; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.expenses) || (parsed.version !== undefined && parsed.version !== 1)) {
      return { problem: "unreadable", skipped: 0 };
    }
    const budget = readBudget(parsed.totalBudgetMinor);
    let skipped = budget.error ? 1 : 0;
    state.budgetMinor = budget.error ? null : budget.value;
    skipped += Math.max(0, parsed.expenses.length - MAX_EXPENSES);
    parsed.expenses.slice(0, MAX_EXPENSES).forEach((item) => {
      const result = readExpense(item);
      if (result.expense) state.expenses.push(result.expense);
      else skipped += 1;
    });
    ensureIds(state.expenses);
    // The saved numbers keep their face value if the trip's currency was changed later: nothing is converted,
    // only re-scaled when the two currencies use a different number of decimals (EUR 620.00 becomes JPY 620).
    const saved = typeof parsed.currency === "string" ? parsed.currency : "";
    let relabeled = "";
    if (/^[A-Z]{3}$/.test(saved) && saved !== state.currency) {
      relabeled = saved;
      const shift = state.digits - digitsFor(saved);
      if (shift !== 0) {
        const factor = Math.pow(10, Math.abs(shift));
        const rescale = (minor, floorAtOne) => (shift > 0 ? minor * factor : Math.max(floorAtOne ? 1 : 0, Math.round(minor / factor)));
        if (state.budgetMinor !== null) state.budgetMinor = rescale(state.budgetMinor, false);
        state.expenses = state.expenses.filter((expense) => {
          expense.amountMinor = rescale(expense.amountMinor, true);
          if (expense.amountMinor > MAX_MINOR) { skipped += 1; return false; }
          return true;
        });
        if (state.budgetMinor !== null && state.budgetMinor > MAX_MINOR) { state.budgetMinor = null; skipped += 1; }
      }
    }
    return { problem: skipped ? "skipped" : "", skipped, relabeled };
  }

  function save() {
    const ok = storageSet(state.storageKey, JSON.stringify({ version: 1, currency: state.currency, totalBudgetMinor: state.budgetMinor, expenses: state.expenses }));
    state.canSave = ok;
    renderStorageNote();
    if (!ok) showNotice("This change could not be saved because the browser blocked storage or it is full. Use Export to keep a copy.", "warning");
    return ok;
  }
  function renderStorageNote() {
    $("storage-note").textContent = state.canSave
      ? "Changes save automatically in this browser. Use Export to back up or share this budget."
      : "Storage is unavailable, so changes will be lost when you leave this page. Use Export to keep a copy.";
  }

  /* ---- totals ---- */
  function totals() {
    const result = { planned: 0, paid: 0, total: 0, byCategory: {} };
    CATEGORIES.forEach((category) => { result.byCategory[category] = 0; });
    state.expenses.forEach((expense) => {
      if (expense.status === "paid") result.paid += expense.amountMinor;
      else result.planned += expense.amountMinor;
      result.byCategory[expense.category] += expense.amountMinor;
    });
    result.total = result.planned + result.paid;
    return result;
  }
  // The consequence of the latest change, as a sentence for the status line.
  function remainingSentence() {
    if (state.budgetMinor === null) return "";
    const left = state.budgetMinor - totals().total;
    return left < 0 ? " You are over budget by " + money(-left) + "." : " Remaining: " + money(left) + ".";
  }

  /* ---- rendering ---- */
  function renderSummary() {
    const sums = totals();
    const budget = state.budgetMinor;
    $("planned-total").textContent = money(sums.planned);
    $("paid-total").textContent = money(sums.paid);
    const share = Math.round(sums.total / state.trip.travelers);
    $("traveler-total").textContent = money(share);
    $("traveler-caption").textContent = budget === null
      ? "Shared evenly by " + plural(state.trip.travelers, "traveler", "travelers")
      : "of " + money(Math.round(budget / state.trip.travelers)) + " each";

    const card = $("remaining-card");
    const block = $("meter-block");
    const text = $("meter-text");
    text.replaceChildren();
    $("budget-meter").hidden = budget === null;
    if (budget === null) {
      card.dataset.state = "none";
      block.dataset.state = "none";
      $("remaining-total").textContent = "Not set";
      $("remaining-caption").textContent = "Add a total budget to see what is left";
      text.append(document.createTextNode("Set a total budget to see how much is left."));
      return;
    }
    const left = budget - sums.total;
    const over = left < 0;
    const scale = Math.max(budget, sums.total) || 1;
    $("meter-paid").style.width = (sums.paid / scale * 100) + "%";
    $("meter-planned").style.width = (sums.planned / scale * 100) + "%";
    card.dataset.state = over ? "over" : "ok";
    block.dataset.state = over ? "over" : "ok";
    $("remaining-total").textContent = money(left);
    if (over) {
      $("remaining-caption").textContent = "Over budget by " + money(-left);
      const percentOver = budget > 0 ? Math.ceil((sums.total - budget) / budget * 100) : null;
      text.append(icon("alert"), document.createTextNode("Over budget by " + money(-left) + (percentOver ? " (" + percentOver + "% over the limit)." : ".")));
    } else {
      $("remaining-caption").textContent = "Left after planned and paid expenses";
      if (budget === 0) text.append(document.createTextNode("The budget is set to zero, so anything you add will be over it."));
      else if (left === 0) text.append(document.createTextNode("The whole budget is spoken for."));
      else text.append(document.createTextNode(Math.min(99, Math.floor(sums.total / budget * 100)) + "% of the budget is spoken for."));
    }
  }

  // Whole-number shares that always add up to 100 (largest remainder), so the labels never read as 101%.
  function sharePercents(amounts, total) {
    const exact = amounts.map((amount) => (total ? amount / total * 100 : 0));
    const whole = exact.map(Math.floor);
    let spare = total ? 100 - whole.reduce((sum, value) => sum + value, 0) : 0;
    exact
      .map((value, index) => ({ index, rest: value - whole[index] }))
      .sort((a, b) => b.rest - a.rest || a.index - b.index)
      .forEach((item) => {
        if (spare > 0 && amounts[item.index] > 0) { whole[item.index] += 1; spare -= 1; }
      });
    return whole;
  }

  function renderChart() {
    const sums = totals();
    const list = $("category-chart");
    list.replaceChildren();
    $("chart-total").textContent = money(sums.total);
    $("chart-empty").hidden = sums.total > 0;
    list.hidden = sums.total === 0;
    if (!sums.total) return;
    const shares = sharePercents(CATEGORIES.map((category) => sums.byCategory[category]), sums.total);
    CATEGORIES.forEach((category, index) => {
      const amount = sums.byCategory[category];
      const percent = amount / sums.total * 100;
      const row = el("li", "chart-row");
      row.style.setProperty("--cat", "var(--cat-" + category + ")");
      row.dataset.empty = amount ? "false" : "true";
      const label = el("span", "chart-label");
      const swatch = el("span", "chart-swatch");
      swatch.setAttribute("aria-hidden", "true");
      label.append(swatch, el("span", "", CATEGORY_LABELS[category]));
      const track = el("span", "chart-track");
      track.setAttribute("aria-hidden", "true");
      const bar = el("span", "chart-bar");
      bar.style.setProperty("--w", percent + "%");
      track.append(bar);
      const value = el("span", "chart-value", money(amount));
      value.append(el("small", "", amount ? (shares[index] < 1 ? "<1%" : shares[index] + "%") : "0%"));
      row.append(label, track, value);
      list.append(row);
    });
  }

  /* ---- when it's spent: one column per day of the trip (per week on long trips) ---- */
  function compactMoney(minor) {
    const value = minor / Math.pow(10, state.digits);
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: Math.abs(value) < 1000 ? 0 : 1 }).format(value);
    } catch (error) {
      return money(minor);
    }
  }
  function dayBuckets() {
    const days = daysBetween(state.trip.startDate, state.trip.endDate);
    const buckets = [];
    const add = (top, bottom, long, outside) => {
      const bucket = { top, bottom, long, outside: outside === true, amount: 0, count: 0 };
      buckets.push(bucket);
      return bucket;
    };
    const before = add("Before", "trip", "Before the trip", true);
    const byDay = new Map();
    if (days.length > 14) {
      for (let index = 0; index < days.length; index += 7) {
        const week = index / 7 + 1;
        const bucket = add("Week", String(week), "Week " + week + " (" + formatRange(days[index], days[Math.min(index + 6, days.length - 1)]) + ")");
        days.slice(index, index + 7).forEach((day) => byDay.set(day, bucket));
      }
    } else {
      days.forEach((day) => {
        byDay.set(day, add(formatDate(day, { weekday: "short" }), formatDate(day, { day: "numeric" }), formatDate(day, { weekday: "long", month: "long", day: "numeric" })));
      });
    }
    const after = add("After", "trip", "After the trip", true);
    state.expenses.forEach((expense) => {
      const bucket = byDay.get(expense.date) || (expense.date < state.trip.startDate ? before : after);
      bucket.amount += expense.amountMinor;
      bucket.count += 1;
    });
    return { list: buckets.filter((bucket) => bucket.count > 0 || (bucket !== before && bucket !== after)), days: days.length };
  }
  function renderDays() {
    const list = $("day-chart");
    const average = $("days-average");
    list.replaceChildren();
    average.replaceChildren();
    if (!state.trip) return;
    const data = dayBuckets();
    const total = data.list.reduce((sum, bucket) => sum + bucket.amount, 0);
    $("days-empty").hidden = total > 0;
    list.hidden = total === 0;
    if (!total) return;
    average.append(document.createTextNode(money(Math.round(total / data.days))), el("small", "", " a day"));
    const peak = Math.max.apply(null, data.list.map((bucket) => bucket.amount));
    list.style.setProperty("--cols", String(data.list.length));
    data.list.forEach((bucket) => {
      const item = el("li", "day-col");
      if (bucket.amount === peak) item.dataset.peak = "true";
      if (!bucket.amount) item.dataset.empty = "true";
      if (bucket.outside) item.dataset.outside = "true";
      item.title = bucket.long + ": " + money(bucket.amount) + (bucket.count ? " in " + plural(bucket.count, "expense", "expenses") : "");
      const amount = el("span", "day-amount", bucket.amount ? compactMoney(bucket.amount) : "");
      amount.setAttribute("aria-hidden", "true");
      const plot = el("span", "day-plot");
      plot.setAttribute("aria-hidden", "true");
      const bar = el("span", "day-bar");
      bar.style.setProperty("--v", (bucket.amount / peak * 100).toFixed(2) + "%");
      plot.append(bar);
      const label = el("span", "day-label");
      label.setAttribute("aria-hidden", "true");
      label.append(el("span", "", bucket.top), el("b", "", bucket.bottom));
      item.append(amount, plot, label, el("span", "visually-hidden", bucket.long + ": " + money(bucket.amount)));
      list.append(item);
    });
  }

  function byNewest(a, b) { return b.date.localeCompare(a.date) || a.description.localeCompare(b.description); }
  function visibleExpenses() {
    const status = $("filter-status").value;
    const category = $("filter-category").value;
    return state.expenses
      .filter((expense) => (status === "all" || expense.status === status) && (category === "all" || expense.category === category))
      .sort(byNewest);
  }
  function hiddenNote(expense) {
    return filtersActive() && !rowFor(expense.id) ? " It is hidden by the current filters." : "";
  }
  function filtersActive() { return $("filter-status").value !== "all" || $("filter-category").value !== "all"; }

  function iconButton(name, label) {
    const button = el("button", "icon-button" + (name === "delete" ? " delete" : ""));
    button.type = "button";
    button.dataset.action = name;
    button.setAttribute("aria-label", label);
    button.title = ACTION_TITLES[name];
    button.append(icon(name));
    return button;
  }

  function expenseItem(expense) {
    const paid = expense.status === "paid";
    const item = el("li", "expense");
    item.dataset.id = expense.id;
    if (state.editingId === expense.id) item.dataset.editing = "true";

    const main = el("div", "expense-main");
    const head = el("div", "expense-head");
    const badge = el("span", "badge" + (paid ? " badge-ok" : ""));
    badge.append(icon(paid ? "check" : "clock"), document.createTextNode(paid ? "Paid" : "Planned"));
    head.append(el("h3", "expense-title", expense.description), badge);
    const meta = el("p", "expense-meta");
    const chip = el("span", "cat-chip");
    chip.style.setProperty("--cat", "var(--cat-" + expense.category + ")");
    const dot = el("span", "cat-dot");
    dot.setAttribute("aria-hidden", "true");
    chip.append(dot, el("span", "", CATEGORY_LABELS[expense.category]));
    meta.append(chip, el("span", "", formatDate(expense.date, { month: "short", day: "numeric", year: "numeric" })));
    main.append(head, meta);

    const side = el("div", "expense-side");
    side.append(el("strong", "expense-amount", money(expense.amountMinor)));
    const actions = el("div", "expense-actions");
    const toggle = el("button", "button button-ghost button-small pay-toggle");
    toggle.type = "button";
    toggle.dataset.action = "toggle";
    toggle.setAttribute("aria-label", (paid ? "Mark planned: " : "Mark paid: ") + expense.description);
    toggle.append(icon(paid ? "clock" : "check"), document.createTextNode(paid ? "Mark planned" : "Mark paid"));
    actions.append(toggle, iconButton("edit", "Edit “" + expense.description + "”"), iconButton("delete", "Delete “" + expense.description + "”"));
    side.append(actions);

    item.append(main, side);
    return item;
  }

  function renderList() {
    const list = visibleExpenses();
    const ul = $("expense-list");
    ul.replaceChildren();
    list.forEach((expense) => ul.append(expenseItem(expense)));
    $("expense-count").textContent = String(state.expenses.length);
    const filtered = filtersActive();
    $("clear-filters").hidden = !filtered;
    ul.hidden = list.length === 0;
    $("expense-empty").hidden = list.length > 0;
    if (!list.length) {
      const none = state.expenses.length === 0;
      $("empty-title").textContent = none ? "No expenses yet" : "No expenses match these filters";
      $("empty-text").textContent = none ? "Add your first cost to see how the budget takes shape." : "Try a different status or category.";
      const action = $("empty-action");
      action.textContent = none ? "Add an expense" : "Clear filters";
      action.dataset.mode = none ? "add" : "clear";
    }
    let line;
    if (!state.expenses.length) line = "";
    else if (filtered) line = "Showing " + list.length + " of " + plural(state.expenses.length, "expense", "expenses") + " · " + money(list.reduce((sum, expense) => sum + expense.amountMinor, 0));
    else line = plural(state.expenses.length, "expense", "expenses");
    $("results-line").textContent = line;
    $("results-line").parentElement.hidden = !line && !filtered;
  }

  function refresh() {
    renderSummary();
    renderChart();
    renderDays();
    renderList();
  }

  /* ---- total budget ---- */
  function commitBudget(event) {
    if (event) event.preventDefault();
    const input = $("total-budget");
    const text = input.value.trim();
    const bad = input.validity.badInput;
    const error = $("budget-error");
    const status = $("budget-status");
    const clearError = () => { error.textContent = ""; error.hidden = true; input.removeAttribute("aria-invalid"); };
    if (!text && !bad) {
      clearError();
      if (state.budgetMinor !== null) {
        state.budgetMinor = null;
        save();
        refresh();
        status.textContent = "Budget cleared. Spending is tracked without a limit.";
      }
      return;
    }
    const result = parseAmount(text, true, bad);
    if (result.error) {
      error.textContent = amountMessage(result.error);
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      status.textContent = "";
      if (event) input.focus();
      return;
    }
    clearError();
    if (result.minor === state.budgetMinor) {
      if (event && !status.textContent) status.textContent = "Budget is " + money(result.minor) + ".";
      return;
    }
    state.budgetMinor = result.minor;
    input.value = decimalText(result.minor);
    save();
    refresh();
    status.textContent = "Budget saved: " + money(result.minor) + "." + remainingSentence();
  }

  /* ---- expense form ---- */
  function setFieldError(name, message) {
    const input = $(FIELD_IDS[name]);
    const error = $(FIELD_IDS[name] + "-error");
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
  function chosenStatus() {
    const checked = document.querySelector('#expense-form input[name="status"]:checked');
    return checked ? checked.value : "planned";
  }
  function setChosenStatus(value) {
    const radio = document.querySelector('#expense-form input[name="status"][value="' + value + '"]');
    if (radio) radio.checked = true;
  }
  function defaultDate() {
    const today = todayKey();
    return today >= state.trip.startDate && today <= state.trip.endDate ? today : state.trip.startDate;
  }

  function resetForm(keepChoices) {
    const keep = keepChoices ? { category: $("category").value, date: $("expense-date").value, status: chosenStatus() } : null;
    state.editingId = "";
    $("expense-form").reset();
    clearErrors();
    $("category").value = keep ? keep.category : "transport";
    $("expense-date").value = keep ? keep.date : defaultDate();
    setChosenStatus(keep ? keep.status : "planned");
    $("form-title").textContent = "Add an expense";
    $("form-sub").textContent = "Everything you add counts against the budget.";
    $("save-expense").textContent = "Add expense";
    $("cancel-edit").hidden = true;
  }

  function beginEdit(expense) {
    state.editingId = expense.id;
    clearErrors();
    setStatus("");
    $("description").value = expense.description;
    $("amount").value = decimalText(expense.amountMinor);
    $("category").value = expense.category;
    $("expense-date").value = expense.date;
    setChosenStatus(expense.status);
    $("form-title").textContent = "Edit expense";
    $("form-sub").textContent = "Press Save changes when you are done.";
    $("save-expense").textContent = "Save changes";
    $("cancel-edit").hidden = false;
    document.querySelectorAll(".expense[data-editing]").forEach((row) => row.removeAttribute("data-editing"));
    const row = rowFor(expense.id);
    if (row) row.dataset.editing = "true";
    $("description").focus();
  }

  function cancelEdit() {
    const id = state.editingId;
    resetForm(false);
    document.querySelectorAll(".expense[data-editing]").forEach((row) => row.removeAttribute("data-editing"));
    announce("Editing cancelled.");
    const row = id ? rowFor(id) : null;
    const button = row && row.querySelector('[data-action="edit"]');
    if (button) button.focus();
    else $("description").focus();
  }

  function validateForm() {
    const errors = {};
    const description = $("description").value.trim();
    if (!description) errors.description = "Enter a description.";
    else if (description.length > MAX_DESCRIPTION) errors.description = "Use " + MAX_DESCRIPTION + " characters or fewer.";
    const amount = parseAmount($("amount").value, false, $("amount").validity.badInput);
    if (amount.error) errors.amount = amountMessage(amount.error);
    const date = $("expense-date").value;
    const parsed = parseDate(date);
    if (!date) errors.date = "Choose a date.";
    else if (!parsed || parsed.getFullYear() < 1900 || parsed.getFullYear() > 2100) errors.date = "Choose a date between 1900 and 2100.";
    const category = $("category").value;
    if (CATEGORIES.indexOf(category) < 0) errors.category = "Choose a category.";
    return {
      errors,
      values: { description, amountMinor: amount.minor, category, date, status: chosenStatus() }
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
    if (state.editingId) updateExpense(state.editingId, result.values);
    else addExpense(result.values);
  }

  function addExpense(values) {
    if (state.expenses.length >= MAX_EXPENSES) {
      const box = $("form-error");
      box.textContent = "This budget already has the most expenses it can hold (" + MAX_EXPENSES.toLocaleString() + "). Delete some first.";
      box.hidden = false;
      return;
    }
    const expense = Object.assign({ id: makeId("exp") }, values);
    state.expenses.push(expense);
    save();
    // Making a new entry is often a run of similar ones, so keep the category, date and status.
    resetForm(true);
    refresh();
    setStatus("Added “" + expense.description + "” for " + money(expense.amountMinor) + "." + remainingSentence() + hiddenNote(expense));
    $("description").focus();
  }

  function updateExpense(id, values) {
    const expense = findExpense(id);
    if (!expense) {
      resetForm(false);
      refresh();
      showNotice("That expense no longer exists, so nothing was changed.", "warning");
      return;
    }
    Object.assign(expense, values);
    save();
    resetForm(false);
    refresh();
    setStatus("Saved changes to “" + expense.description + "”." + remainingSentence() + hiddenNote(expense));
    const row = rowFor(expense.id);
    const button = row && row.querySelector('[data-action="edit"]');
    if (button) button.focus();
    else $("expenses-title").focus();
  }

  function toggleStatus(expense) {
    expense.status = expense.status === "paid" ? "planned" : "paid";
    save();
    refresh();
    announce("Marked “" + expense.description + "” as " + expense.status + "." + remainingSentence() + hiddenNote(expense));
    const row = rowFor(expense.id);
    const button = row && row.querySelector('[data-action="toggle"]');
    if (button) button.focus();
    else $("expenses-title").focus();
  }

  function removeExpense(expense) {
    const id = expense.id;
    confirmDialog({
      title: "Delete this expense?",
      message: "“" + expense.description + "” (" + money(expense.amountMinor) + ") will be removed from your budget. This can't be undone.",
      confirmLabel: "Delete expense",
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return;
      const index = state.expenses.findIndex((item) => item.id === id);
      if (index < 0) return;
      const removed = state.expenses.splice(index, 1)[0];
      if (state.editingId === id) resetForm(false);
      save();
      refresh();
      announce("Deleted “" + removed.description + "”." + remainingSentence());
      $("expenses-title").focus();
    });
  }

  function onListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest(".expense");
    const expense = row ? findExpense(row.dataset.id) : null;
    if (!expense) return;
    const action = button.dataset.action;
    if (action === "edit") beginEdit(expense);
    else if (action === "delete") removeExpense(expense);
    else toggleStatus(expense);
  }

  function onFormInput(event) {
    const id = event.target.id || "";
    const name = Object.keys(FIELD_IDS).find((key) => FIELD_IDS[key] === id);
    if (name) setFieldError(name, "");
    setStatus("");
  }

  function clearFilters() {
    $("filter-status").value = "all";
    $("filter-category").value = "all";
    renderList();
  }

  /* ---- export / import ---- */
  function exportJson() {
    const payload = {
      version: 1,
      tripId: state.trip.id,
      tripTitle: state.trip.title,
      currency: state.trip.currency,
      exportedAt: new Date().toISOString(),
      totalBudgetMinor: state.budgetMinor,
      expenses: state.expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amountMinor: expense.amountMinor,
        category: expense.category,
        date: expense.date,
        status: expense.status
      }))
    };
    downloadText("budget-" + slugify(state.trip.title, "trip") + "-" + todayKey() + ".json", JSON.stringify(payload, null, 2));
    showNotice(
      state.expenses.length ? "Exported " + plural(state.expenses.length, "expense", "expenses") + " and the budget as a JSON file." : "Exported an empty budget as a JSON file.",
      "success"
    );
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
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "This does not look like a budget export." };
    if (data.version !== undefined && data.version !== 1) return { error: "This file uses format version " + String(data.version).slice(0, 20) + ", which this page can't read." };
    if (!Array.isArray(data.expenses)) return { error: "This does not look like a budget export: it has no expenses list." };
    if (typeof data.currency !== "string") return { error: "This file does not say which currency its amounts are in, so it can't be imported safely." };
    if (data.currency !== state.trip.currency) {
      return { error: "This file is in " + data.currency.slice(0, 10) + " but this trip uses " + state.trip.currency + ". Amounts are never converted." };
    }
    if (data.expenses.length > MAX_EXPENSES) return { error: "This file has more than " + MAX_EXPENSES.toLocaleString() + " expenses." };
    const budget = readBudget(data.totalBudgetMinor);
    if (budget.error) return { error: "The budget amount is not valid: " + budget.error + "." };
    const expenses = [];
    for (let i = 0; i < data.expenses.length; i += 1) {
      const result = readExpense(data.expenses[i]);
      if (result.error) return { error: "Expense " + (i + 1) + " can't be imported because " + result.error + "." };
      expenses.push(result.expense);
    }
    return {
      expenses,
      budgetMinor: budget.value,
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
      showNotice("That file is larger than 2 MB, so it can't be a budget export. Nothing was changed.", "warning");
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
    if (!parsed.expenses.length && parsed.budgetMinor === null) {
      showNotice("That file has no expenses and no budget, so there was nothing to import.", "info");
      return;
    }
    const existing = state.expenses.length;
    const hasData = existing > 0 || state.budgetMinor !== null;
    const foreign = Boolean(parsed.tripId) && parsed.tripId !== state.trip.id;
    const source = foreign && parsed.tripTitle ? " It was exported from “" + parsed.tripTitle + "”." : foreign ? " It was exported from a different trip." : "";
    if (!hasData && !foreign) {
      applyImport(parsed, "replace");
      return;
    }
    const count = plural(parsed.expenses.length, "expense", "expenses");
    choiceDialog({
      title: "Import " + count + "?",
      message: hasData
        ? "You already have " + plural(existing, "expense", "expenses") + (state.budgetMinor !== null ? " and a budget" : "") + ". Merge adds the expenses from the file, skips any you already have and keeps your budget (unless you have not set one). Replace deletes your current expenses and budget first." + source
        : "The file has " + count + "." + source + " Add them to this trip?",
      choices: hasData
        ? [{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace all", danger: true }]
        : [{ value: "replace", label: "Import" }]
    }).then((choice) => {
      if (!choice) { announce("Import cancelled."); return; }
      applyImport(parsed, choice);
    });
  }

  function applyImport(parsed, mode) {
    const wasEmpty = state.expenses.length === 0 && state.budgetMinor === null;
    const next = mode === "replace" ? [] : state.expenses.slice();
    const ids = new Set(next.map((expense) => expense.id));
    const seen = new Set(next.map(fingerprint));
    let added = 0;
    let skipped = 0;
    parsed.expenses.forEach((expense) => {
      if (mode !== "replace" && seen.has(fingerprint(expense))) { skipped += 1; return; }
      const copy = Object.assign({}, expense);
      if (!copy.id || ids.has(copy.id)) copy.id = makeId("exp");
      ids.add(copy.id);
      seen.add(fingerprint(copy));
      next.push(copy);
      added += 1;
    });
    if (next.length > MAX_EXPENSES) {
      showNotice("Importing would take this budget past " + MAX_EXPENSES.toLocaleString() + " expenses. Nothing was changed.", "warning");
      return;
    }
    state.expenses = next;
    if (mode === "replace" || state.budgetMinor === null) state.budgetMinor = parsed.budgetMinor;
    $("total-budget").value = state.budgetMinor === null ? "" : decimalText(state.budgetMinor);
    $("budget-error").hidden = true;
    $("total-budget").removeAttribute("aria-invalid");
    resetForm(false);
    save();
    refresh();
    let message;
    if (mode === "replace" && !wasEmpty) message = "Replaced your budget with " + plural(added, "expense", "expenses") + " from the file.";
    else if (!added && !skipped) message = "Imported the budget.";
    else message = "Imported " + plural(added, "expense", "expenses") + (skipped ? " and skipped " + skipped + " you already had" : "") + ".";
    showNotice(message + remainingSentence(), "success");
  }

  /* ---- other tabs ---- */
  function reloadFromStorage() {
    resetForm(false);
    loadBudget();
    $("total-budget").value = state.budgetMinor === null ? "" : decimalText(state.budgetMinor);
    refresh();
    renderStorageNote();
    hideNotice();
    announce("Loaded the latest budget.");
  }
  function onStorage(event) {
    if (event.key !== state.storageKey && event.key !== null) return;
    showNotice("This budget was changed in another tab.", "warning", { label: "Load the latest", onClick: reloadFromStorage });
  }

  /* ---- start ---- */
  function showEmptyTrip(status) {
    $("budget-app").hidden = true;
    $("no-trip").hidden = false;
    if (status === "invalid") {
      $("no-trip-text").textContent = "The saved trip is incomplete or damaged, so it can't be used. Create it again on Explore and your budget will be ready here.";
    } else if (status === "unavailable") {
      $("no-trip-text").textContent = "This browser is blocking site storage, so the trip can't be loaded. Allow storage for this site, then reload.";
      showNotice("Site storage is blocked in this browser, so your trip and plans can't be loaded or saved.", "warning");
    }
  }

  function reportLoad(loaded) {
    const notes = [];
    if (loaded.problem === "storage") {
      notes.push("Site storage is blocked in this browser. You can still work here, but nothing will be saved. Use Export to keep a copy.");
    } else if (loaded.problem === "unreadable") {
      notes.push("The saved budget for this trip could not be read, so you are starting fresh. Your first change will replace the unreadable data.");
    } else if (loaded.problem === "skipped") {
      notes.push(plural(loaded.skipped, "saved item was", "saved items were") + " incomplete or invalid and left out.");
    }
    if (loaded.relabeled) {
      notes.push("This budget was saved in " + loaded.relabeled + " and the trip now uses " + state.currency + ". The same numbers are shown in " + state.currency + "; nothing is converted.");
    }
    if (notes.length) showNotice(notes.join(" "), "warning");
  }

  function wire() {
    $("budget-form").addEventListener("submit", commitBudget);
    $("total-budget").addEventListener("change", () => commitBudget(null));
    $("total-budget").addEventListener("input", () => {
      $("budget-error").hidden = true;
      $("total-budget").removeAttribute("aria-invalid");
      $("budget-status").textContent = "";
    });
    const form = $("expense-form");
    form.addEventListener("submit", onSubmit);
    form.addEventListener("input", onFormInput);
    $("cancel-edit").addEventListener("click", cancelEdit);
    $("expense-list").addEventListener("click", onListClick);
    $("filter-status").addEventListener("change", renderList);
    $("filter-category").addEventListener("change", renderList);
    $("clear-filters").addEventListener("click", () => { clearFilters(); $("filter-status").focus(); });
    $("empty-action").addEventListener("click", (event) => {
      if (event.currentTarget.dataset.mode === "clear") { clearFilters(); $("filter-status").focus(); }
      else $("description").focus();
    });
    $("jump-add").addEventListener("click", () => { $("description").focus(); });
    $("import-button").addEventListener("click", () => { $("import-file").click(); });
    $("import-file").addEventListener("change", onImportFile);
    $("export-button").addEventListener("click", exportJson);
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
    const trip = result.trip;
    state.trip = trip;
    state.storageKey = STORAGE_PREFIX + trip.id;
    setupMoney(trip.currency);
    $("no-trip").hidden = true;
    $("budget-app").hidden = false;
    fillTripStrip(trip);
    $("budget-currency").textContent = trip.currency;
    $("currency-label").textContent = trip.currency;
    $("currency-prefix").textContent = trip.currency;
    const step = state.digits === 0 ? "1" : "0." + "0".repeat(state.digits - 1) + "1";
    $("total-budget").step = step;
    $("amount").step = step;
    $("amount").min = step;
    const zero = state.digits === 0 ? "0" : "0." + "0".repeat(state.digits);
    $("total-budget").placeholder = zero;
    $("amount").placeholder = zero;
    const loaded = loadBudget();
    $("total-budget").value = state.budgetMinor === null ? "" : decimalText(state.budgetMinor);
    resetForm(false);
    refresh();
    renderStorageNote();
    wire();
    reportLoad(loaded);
  }

  start();
})();
