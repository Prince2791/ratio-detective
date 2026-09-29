/* =====================================================================
   Ratio Detective — India Edition : response collection page
   Flow: team details → one industry per screen → review → submit.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CONFIGURATION: the only section you normally need to edit
   --------------------------------------------------------------------- */
const CONFIG = {
  // Paste the Google Apps Script web-app URL here (it ends in /exec).
  // While this still contains "PASTE", the page runs in DEMO MODE: nothing is saved.
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx2kfE9vgZfyZDtWkyCucZfrySr8eQ3jC7YH_olZhKpkBX1UDnLIzq32P8YREMTDfcqVw/exec",

  // Change this for each new class or section. It keeps local drafts from
  // different sessions apart and is stored with every row in the sheet.
  EXERCISE_ID: "RD-2026-FSA",

  // Letters students may type (Company A ... Company T).
  VALID_LETTERS: "ABCDEFGHIJKLMNOPQRST",

  // Minimum characters for each mandatory reason (stops "ok" or "x").
  MIN_REASON_CHARS: 10,

  // true = a device that has already submitted is blocked from submitting again.
  // Set to false (e.g. for testing or a re-run) to allow repeat submissions.
  BLOCK_REPEAT_SUBMISSIONS: true,

  // Lets the instructor clear a device by opening the page with ?reset=1.
  // Set to false if you worry that students will use it to resubmit.
  ALLOW_RESET_LINK: true
};

// Industries and companies. Edit, add or remove entries here only; the page
// is generated from this list. A company can be a plain string, or an object
// { name: "...", note: "..." } if you want a short line under its name.
// Companies are listed alphabetically within each industry, so the order
// gives no clue to the answer.
const industries = [
  { industry: "Airlines",                companies: ["InterGlobe Aviation Limited (IndiGo)", "SpiceJet Limited"] },
  { industry: "Automobiles",             companies: ["Eicher Motors Limited", "Maruti Suzuki India Limited"] },
  { industry: "Cement",                  companies: ["Shree Cement Limited", "UltraTech Cement Limited"] },
  { industry: "Consumer Staples (FMCG)", companies: ["Hindustan Unilever Limited", "Nestlé India Limited"] },
  { industry: "Hotels",                  companies: ["Chalet Hotels Limited", "The Indian Hotels Company Limited"] },
  { industry: "IT Services",             companies: ["Tata Consultancy Services Limited", "Tech Mahindra Limited"] },
  { industry: "Pharmaceuticals",         companies: ["Divi's Laboratories Limited", "Piramal Pharma Limited"] },
  { industry: "Power",                   companies: ["NTPC Limited", "Waaree Energies Limited"] },
  { industry: "Retail",                  companies: ["Avenue Supermarts Limited (DMart)", "Trent Limited"] },
  { industry: "Telecom",                 companies: ["Bharti Airtel Limited", "Vodafone Idea Limited"] }
];

/* ---------------------------------------------------------------------
   2. STATE AND LOCAL STORAGE
   --------------------------------------------------------------------- */
const STORE_KEY = "ratioDetective:" + CONFIG.EXERCISE_ID + ":draft";
const DONE_KEY  = "ratioDetective:" + CONFIG.EXERCISE_ID + ":submitted";
const DEMO_MODE = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes("PASTE");
const REASONS = 5, REQUIRED_REASONS = 3;

// Browser storage can be unavailable (private mode, blocked site data), so
// every access is wrapped; the page still works, it just cannot keep drafts.
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
};

function freshState() {
  return {
    screen: "team",          // "team" | "industry" | "review"
    index: 0,                // current industry index
    team: { m1Name: "", m1Roll: "", m2Name: "", m2Roll: "" },
    answers: {},             // key "i-j" -> { id: "", reasons: ["", "", "", "", ""] }
    clientToken: makeToken() // lets the server ignore an accidental double send
  };
}

function makeToken() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "t-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

let state = storage.get(STORE_KEY) || freshState();

function save() {
  const ok = storage.set(STORE_KEY, state);
  const note = document.getElementById("saved-note");
  if (note) note.textContent = ok ? "Saved on this device." : "Could not save on this device; please do not refresh.";
}

function answer(i, j) {
  const key = i + "-" + j;
  if (!state.answers[key]) state.answers[key] = { id: "", reasons: Array(REASONS).fill("") };
  return state.answers[key];
}

function companyName(c) { return typeof c === "string" ? c : c.name; }
function companyNote(c) { return typeof c === "string" ? "" : (c.note || ""); }

/* ---------------------------------------------------------------------
   3. SMALL HELPERS
   --------------------------------------------------------------------- */
const app = document.getElementById("app");

// Build DOM elements without innerHTML, so typed text can never inject markup.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

// Accepts "F", "f", "company f", "Company-F", "Co. F" and returns "Company F", or null if invalid.
function normaliseId(raw) {
  const m = String(raw || "").trim().match(/^(?:company|co\.?)?[\s\-:]*([a-z])$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  return CONFIG.VALID_LETTERS.includes(letter) ? "Company " + letter : null;
}

function showErrors(container, messages) {
  container.replaceChildren();
  if (!messages.length) { container.hidden = true; return; }
  container.hidden = false;
  container.append(el("strong", { text: "Please complete the following before continuing:" }),
                   el("ul", {}, messages.map(m => el("li", { text: m }))));
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goTo(screen, index) {
  state.screen = screen;
  if (index != null) state.index = index;
  save();
  render();
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------------
   4. SCREENS
   --------------------------------------------------------------------- */
function render() {
  if (!CONFIG.BLOCK_REPEAT_SUBMISSIONS || !storage.get(DONE_KEY)) {
    if (state.screen === "industry") return renderIndustry();
    if (state.screen === "review") return renderReview();
    return renderTeam();
  }
  renderAlreadySubmitted();
}

/* ---- Screen 1: team details ---- */
function renderTeam() {
  const errors = el("div", { class: "error-box", hidden: true, role: "alert" });
  const t = state.team;
  const input = (key, label, placeholder) => el("div", { class: "field" },
    el("label", { for: key, text: label }),
    el("input", { type: "text", id: key, value: t[key], placeholder, autocomplete: "off", maxlength: "80",
                  oninput: e => { t[key] = e.target.value; e.target.classList.remove("invalid"); save(); } }));

  const start = () => {
    const missing = [];
    [["m1Name", "Team Member 1: name"], ["m1Roll", "Team Member 1: roll number"],
     ["m2Name", "Team Member 2: name"], ["m2Roll", "Team Member 2: roll number"]].forEach(([k, label]) => {
      if (!t[k].trim()) { missing.push(label); document.getElementById(k).classList.add("invalid"); }
    });
    if (!missing.length && t.m1Roll.trim().toLowerCase() === t.m2Roll.trim().toLowerCase())
      missing.push("The two roll numbers are identical. Please enter both team members.");
    showErrors(errors, missing);
    if (!missing.length) goTo("industry", state.index || 0);
  };

  app.replaceChildren(el("section", { class: "card" },
    el("p", { class: "instruction", text: "Work in a team of two. Use the hard-copy case provided in class. For each industry, identify which anonymised financial profile belongs to each company and provide 3–5 financial reasons supporting your answer." }),
    el("h2", { text: "Team details" }),
    errors,
    el("div", { class: "member-grid" },
      el("fieldset", {}, el("legend", { text: "Team Member 1" }),
        input("m1Name", "Name", "Full name"), input("m1Roll", "Roll Number", "e.g. 2025PGP001")),
      el("fieldset", {}, el("legend", { text: "Team Member 2" }),
        input("m2Name", "Name", "Full name"), input("m2Roll", "Roll Number", "e.g. 2025PGP002"))),
    el("p", { class: "muted", text: `There are ${industries.length} industries. Your answers are saved on this device as you type, so you can refresh or go back without losing them.` }),
    el("div", { class: "actions" }, el("span", { class: "spacer" }),
      el("button", { class: "btn-primary", type: "button", onclick: start, text: "Start Exercise" })),
    el("div", { id: "saved-note", class: "saved-note" })));
}

/* ---- Screens 2..n: one industry per screen ---- */
function industryErrors(i) {
  const ind = industries[i], problems = [], invalidIds = [];
  const ids = ind.companies.map((c, j) => {
    const a = answer(i, j), name = companyName(c);
    const norm = normaliseId(a.id);
    if (!a.id.trim()) { problems.push(`${name}: enter the company/profile (e.g. Company F).`); invalidIds.push(`id-${i}-${j}`); }
    else if (!norm) { problems.push(`${name}: “${a.id}” is not recognised. Type a letter from A to ${CONFIG.VALID_LETTERS.slice(-1)}, e.g. Company F.`); invalidIds.push(`id-${i}-${j}`); }
    for (let r = 0; r < REQUIRED_REASONS; r++) {
      const text = a.reasons[r].trim();
      if (!text) { problems.push(`${name}: Reason ${r + 1} is required.`); invalidIds.push(`r-${i}-${j}-${r}`); }
      else if (text.length < CONFIG.MIN_REASON_CHARS) { problems.push(`${name}: Reason ${r + 1} is too short (at least ${CONFIG.MIN_REASON_CHARS} characters).`); invalidIds.push(`r-${i}-${j}-${r}`); }
    }
    return norm;
  });
  if (ids.length === 2 && ids[0] && ids[0] === ids[1]) {
    problems.push(`Both companies are identified as ${ids[0]}. Each company needs a different profile.`);
    invalidIds.push(`id-${i}-0`, `id-${i}-1`);
  }
  return { problems, invalidIds };
}

function renderIndustry() {
  const i = state.index, ind = industries[i], n = industries.length;
  const errors = el("div", { class: "error-box", hidden: true, role: "alert" });

  const companyBlock = (c, j) => {
    const a = answer(i, j), name = companyName(c), note = companyNote(c);
    const idField = el("input", { type: "text", id: `id-${i}-${j}`, value: a.id, placeholder: "Example: Company F",
      autocomplete: "off", autocapitalize: "characters", maxlength: "20",
      oninput: e => { a.id = e.target.value; e.target.classList.remove("invalid"); save(); },
      onblur: e => { const norm = normaliseId(e.target.value); if (norm) { a.id = norm; e.target.value = norm; save(); } } });
    const reasonFields = a.reasons.map((text, r) => el("div", { class: "field" },
      el("label", { for: `r-${i}-${j}-${r}` }, `Reason ${r + 1}`,
        r >= REQUIRED_REASONS ? el("span", { class: "optional", text: " — Optional" }) : null),
      el("textarea", { id: `r-${i}-${j}-${r}`, maxlength: "1000", rows: "3",
        placeholder: r === 0 ? "e.g. Receivables are only 3 days of revenue, consistent with customers paying in advance…" : "",
        oninput: e => { a.reasons[r] = e.target.value; e.target.classList.remove("invalid"); save(); } }, text)));

    return el("div", { class: "company-block" },
      el("h3", { class: "company-name", text: name }),
      note ? el("p", { class: "muted company-note", text: note }) : null,
      el("div", { class: "field identify" },
        el("label", { for: `id-${i}-${j}`, text: `Which anonymised company/profile from the case do you think is ${name}?` }),
        idField),
      el("h4", { text: "Why?" }),
      el("p", { class: "muted", text: "Provide at least 3 and up to 5 financial reasons supporting your identification." }),
      reasonFields);
  };

  const next = () => {
    const { problems, invalidIds } = industryErrors(i);
    invalidIds.forEach(id => document.getElementById(id)?.classList.add("invalid"));
    showErrors(errors, problems);
    if (problems.length) return;
    // Store identifications in the tidy "Company X" form.
    ind.companies.forEach((c, j) => { answer(i, j).id = normaliseId(answer(i, j).id); });
    goTo(i + 1 < n ? "industry" : "review", i + 1 < n ? i + 1 : i);
  };
  const prev = () => (i === 0 ? goTo("team") : goTo("industry", i - 1));

  app.replaceChildren(
    el("div", { class: "progress-wrap" },
      el("div", { class: "progress-label" },
        el("span", { text: `Industry ${i + 1} of ${n}` }),
        el("span", { text: `${state.team.m1Name.trim()} & ${state.team.m2Name.trim()}` })),
      el("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(n), "aria-valuenow": String(i + 1) },
        el("span", { style: `width:${((i + 1) / n) * 100}%` }))),
    el("section", { class: "card" },
      el("h2", { text: `Industry ${i + 1} — ${ind.industry}` }),
      el("p", { class: "muted", text: "Companies:" }),
      el("ul", { class: "company-list" }, ind.companies.map(c => el("li", { text: companyName(c) }))),
      errors,
      ind.companies.map(companyBlock),
      el("div", { class: "actions" },
        el("button", { class: "btn-secondary", type: "button", onclick: prev, text: "Previous" }),
        el("span", { class: "spacer" }),
        el("button", { class: "btn-primary", type: "button", onclick: next, text: i + 1 < n ? "Save & Next" : "Save & Review" })),
      el("div", { id: "saved-note", class: "saved-note" })));
}

/* ---- Review screen ---- */
function renderReview() {
  // Safety net: if any industry is incomplete (e.g. data edited elsewhere), send the team back to it.
  const firstBad = industries.findIndex((_, i) => industryErrors(i).problems.length);
  if (firstBad !== -1) return goTo("industry", firstBad);

  const t = state.team, status = el("div", { role: "status" });
  const rows = [];
  // Grouped by industry (one heading row per industry) so the table fits a phone screen.
  industries.forEach((ind, i) => {
    rows.push(el("tr", { class: "group-row" }, el("th", { colspan: "3", scope: "colgroup", text: `${i + 1}. ${ind.industry}` })));
    ind.companies.forEach((c, j) => {
      const a = answer(i, j);
      rows.push(el("tr", {},
        el("td", { text: companyName(c) }),
        el("td", { class: "num", text: a.id }),
        el("td", { class: "num", text: String(a.reasons.filter(r => r.trim()).length) })));
    });
  });

  const submitBtn = el("button", { class: "btn-primary", type: "button", text: "Submit Final Response" });
  const editBtn = el("button", { class: "btn-secondary", type: "button", text: "Edit Responses", onclick: () => goTo("industry", 0) });
  submitBtn.addEventListener("click", () => submit(submitBtn, editBtn, status));

  app.replaceChildren(el("section", { class: "card" },
    el("h2", { text: "Review your responses" }),
    el("div", { class: "team-summary" },
      el("h3", { text: "Team" }),
      el("p", { text: `Member 1: ${t.m1Name.trim()} — ${t.m1Roll.trim()}` }),
      el("p", { text: `Member 2: ${t.m2Name.trim()} — ${t.m2Roll.trim()}` })),
    el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, ["Actual Company", "Your Identification", "Reasons Given"].map(h => el("th", { text: h })))),
      el("tbody", {}, rows))),
    el("div", { class: "warning-box", text: "Once submitted, your response will be treated as final." }),
    status,
    el("div", { class: "actions" }, editBtn, el("span", { class: "spacer" }), submitBtn)));
}

/* ---- Success screen ---- */
function renderSuccess(result) {
  app.replaceChildren(el("section", { class: "card" },
    el("h2", { text: "Response Submitted Successfully" }),
    el("div", { class: "success-box", text: "Your Ratio Detective response has been recorded successfully." }),
    el("p", {}, el("strong", { text: "Team: " }), `${result.m1Name} & ${result.m2Name}`),
    el("p", {}, el("strong", { text: "Submission ID: " }), result.submissionId),
    el("p", {}, el("strong", { text: "Submitted at: " }), result.timestampText),
    DEMO_MODE ? el("p", { class: "warning-box", text: "Demo mode: this response was NOT saved to Google Sheets." }) : null,
    el("p", { class: "muted", text: "You may close this page." })));
}

function renderAlreadySubmitted() {
  const done = storage.get(DONE_KEY) || {};
  app.replaceChildren(el("section", { class: "card" },
    el("h2", { text: "Already submitted" }),
    el("p", { text: "A response has already been submitted from this device." }),
    done.submissionId ? el("p", {}, el("strong", { text: "Submission ID: " }), done.submissionId) : null,
    done.timestampText ? el("p", {}, el("strong", { text: "Submitted at: " }), done.timestampText) : null,
    el("p", { class: "muted", text: "If this is a mistake, please speak to your instructor." })));
}

/* ---------------------------------------------------------------------
   5. SUBMISSION
   --------------------------------------------------------------------- */
function buildPayload() {
  const t = state.team, rows = [];
  industries.forEach((ind, i) => ind.companies.forEach((c, j) => {
    const a = answer(i, j);
    rows.push({ industry: ind.industry, company: companyName(c), identified: normaliseId(a.id) || a.id.trim(),
                reasons: a.reasons.map(r => r.trim()) });
  }));
  return {
    exerciseId: CONFIG.EXERCISE_ID,
    clientToken: state.clientToken,
    team: { m1Name: t.m1Name.trim(), m1Roll: t.m1Roll.trim(), m2Name: t.m2Name.trim(), m2Roll: t.m2Roll.trim() },
    rows
  };
}

function formatIST(iso) {
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }) + " IST";
  } catch (e) { return iso; }
}

async function submit(submitBtn, editBtn, status) {
  if (CONFIG.BLOCK_REPEAT_SUBMISSIONS && storage.get(DONE_KEY)) return render();
  submitBtn.disabled = editBtn.disabled = true;
  submitBtn.textContent = "Submitting…";
  status.replaceChildren();
  const payload = buildPayload();

  try {
    let result;
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 600));
      result = { ok: true, submissionId: "RD-DEMO-" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0"), timestamp: new Date().toISOString() };
    } else {
      // text/plain avoids a CORS pre-flight, which Apps Script web apps do not answer.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      result = await res.json();
    }
    if (!result.ok) throw new Error(result.error || "The server did not accept the response.");

    const done = { submissionId: result.submissionId, timestampText: formatIST(result.timestamp),
                   m1Name: payload.team.m1Name, m2Name: payload.team.m2Name };
    storage.set(DONE_KEY, done);  // duplicate-submission flag
    storage.remove(STORE_KEY);    // draft no longer needed
    renderSuccess(done);
    window.scrollTo(0, 0);
  } catch (err) {
    // Nothing is lost: the draft is still in localStorage, so the team can simply retry.
    status.replaceChildren(el("div", { class: "error-box", role: "alert" },
      el("strong", { text: "Your response could not be submitted. " }),
      "Your answers are still saved on this device. Check the internet connection and press Submit again. ",
      el("span", { class: "muted", text: `(${err.name === "AbortError" ? "The request timed out." : err.message})` })));
    submitBtn.disabled = editBtn.disabled = false;
    submitBtn.textContent = "Submit Final Response";
  }
}

/* ---------------------------------------------------------------------
   6. START
   --------------------------------------------------------------------- */
(function init() {
  if (CONFIG.ALLOW_RESET_LINK && new URLSearchParams(location.search).get("reset") === "1") {
    if (confirm("Clear all saved answers and the submission flag on this device?")) {
      storage.remove(STORE_KEY); storage.remove(DONE_KEY); state = freshState();
    }
    history.replaceState(null, "", location.pathname);
  }
  if (state.index >= industries.length) state.index = 0; // list shortened after editing
  document.getElementById("demo-banner").hidden = !DEMO_MODE;
  render();
})();
