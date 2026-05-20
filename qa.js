#!/usr/bin/env node
// WTFIMM?! — QA script
// Usage: node qa.js path/to/index-clean.html
// Covers Level 0 (syntax) + Level 1 (static analysis)

const fs = require("fs");
const path = require("path");

const filePath = process.argv[2] || "./index-clean.html";
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const html = fs.readFileSync(filePath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]+?)<\/script>\s*(?:<!--|<div|<\/body)/);
const js = scriptMatch ? scriptMatch[1] : "";

let passed = 0, failed = 0;
const fail = (msg) => { console.log(`  ❌ ${msg}`); failed++; };
const pass = (msg) => { console.log(`  ✅ ${msg}`); passed++; };
const section = (title) => console.log(`\n── ${title} ${"─".repeat(50 - title.length)}`);

// ─── Level 0: Syntax ───────────────────────────────────────────────────────
section("Level 0: Syntax");
const tmpJs = "/tmp/_wtfimm_qa_check.js";
fs.writeFileSync(tmpJs, js);
const { execSync } = require("child_process");
try {
  execSync(`node --check ${tmpJs}`, { stdio: "pipe" });
  pass("JS syntax OK");
} catch (e) {
  fail("JS syntax error: " + e.stderr?.toString().split("\n")[0]);
}

// ─── Level 1a: Required functions ─────────────────────────────────────────
section("Level 1a: Required functions");
const REQUIRED_FNS = [
  // Auth
  "doAuth", "doSignOut", "doResetPassword", "doDeleteAccount",
  "showAuthScreen", "hideAuthScreen", "setAuthMode", "updateAuthUI",
  "detectLang", "translateAuthError",
  // Boot
  "initPreAuth", "initUserData", "migrateLocalData",
  // Data
  "doAdd", "doDel", "doDelInc",
  "startEditExp", "cancelEditExp", "doSaveEditExp",
  "startEditIncome", "cancelEditIncome", "doSaveEditIncome",
  // Supabase
  "dbUpsertExpense", "dbDeleteExpense", "dbUpsertIncome", "dbDeleteIncome",
  "saveUserData", "loadMonthFromSupabase", "syncPending", "addPendingOp",
  // Categories
  "saveNewCat", "saveEditCat", "deleteCat",
  // Render
  "render", "rdash", "radd", "rlog", "rsum", "rset",
  "rDonut", "fmtShort", "rEditExpForm", "rEditIncomeForm",
  // UI
  "sv", "nav", "setLang", "setTheme", "showToast", "showConfirm",
  "ensureMonth", "stats", "catById", "fetchRateIfNeeded",
];
const missingFns = REQUIRED_FNS.filter(f =>
  !js.includes(`function ${f}`) && !js.includes(`const ${f}`)
);
if (missingFns.length === 0) pass(`All ${REQUIRED_FNS.length} required functions present`);
else missingFns.forEach(f => fail(`Missing function: ${f}`));

// ─── Level 1b: i18n completeness ──────────────────────────────────────────
section("Level 1b: i18n RU/EN parity");
const ruBlock = js.match(/ru:\s*\{([\s\S]+?)\},\s*en:/);
const enBlock = js.match(/en:\s*\{([\s\S]+?)\}\s*\};/);
if (!ruBlock || !enBlock) {
  fail("Could not parse i18n blocks");
} else {
  // Match only real top-level i18n keys (exactly 4 spaces indent)
  const keys = (block) => {
    const found = new Set();
    for (const m of block[1].matchAll(/^    (\w+)\s*:/gm)) found.add(m[1]);
    return [...found];
  };
  const ruKeys = keys(ruBlock);
  const enKeys = keys(enBlock);
  const missingEn = ruKeys.filter(k => !enKeys.includes(k));
  const missingRu = enKeys.filter(k => !ruKeys.includes(k));
  if (missingEn.length === 0) pass(`EN has all ${ruKeys.length} RU keys`);
  else missingEn.forEach(k => fail(`Key missing in EN: "${k}"`));
  if (missingRu.length === 0) pass(`RU has all ${enKeys.length} EN keys`);
  else missingRu.forEach(k => fail(`Key missing in RU: "${k}"`));
}

// ─── Level 1c: XSS — innerHTML with user input ────────────────────────────
section("Level 1c: XSS / escHTML");
const innerLines = js.split("\n")
  .map((line, i) => ({ line, n: i + 1 }))
  .filter(({ line }) =>
    line.includes("innerHTML") &&
    /\$\{[^}]*(note|name|email|\.e\b|catN)/i.test(line) &&
    !line.includes("escHTML")
  );
if (innerLines.length === 0) pass("No unescaped user input in innerHTML");
else innerLines.forEach(({ line, n }) => fail(`Possible XSS line ${n}: ${line.trim().slice(0, 80)}`));

// ─── Level 1d: Supabase query safety ──────────────────────────────────────
section("Level 1d: Supabase query safety");
// All upserts must include user_id in the row object, not just WHERE
// Check that each upsert function includes user_id in its row object (may be on prior line)
const upsertFns = [...js.matchAll(/async function (dbUpsert\w+)[\s\S]{0,600}?sb\.from/g)].map(m => m[0]);
const dangerousUpserts = upsertFns.filter(fn => !fn.includes("user_id"));
if (dangerousUpserts.length === 0) pass("All upsert functions include user_id in row");
else dangerousUpserts.forEach(fn => fail(`Upsert function missing user_id: ${fn.slice(0,60)}`));
// No service_role key exposed
if (!html.includes("service_role")) pass("No service_role key exposed");
else fail("service_role key found in HTML — CRITICAL");

// ─── Level 1e: CSS duplicates ─────────────────────────────────────────────
section("Level 1e: CSS duplicates");
// Utility/component classes legitimately appear multiple times — skip them
const CSS_SKIP = new Set(["on","show","open","active","hidden","err","dim","row",
  "abtn","tab","cb","fg","sec","av","title","subtitle","card","big","mnav","sbox",
  "edit-box","w","orb","toast","ee-card","ee-p","ee-back","ee-avatar-wrap","ee-name",
  "ee-bio","conf-card","ic-btn","on","balance-val","tab","fg","cb","abtn"]);
// Strip @media blocks before checking
const cssBase = html.replace(/@media[^{]+\{[\s\S]+?\}\s*\}/g, "");
const cssSelectors = [...cssBase.matchAll(/\.([\w-]+)\s*\{/g)].map(m => m[1]);
const counts = {};
cssSelectors.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
const dupes = Object.entries(counts)
  .filter(([s, n]) => n > 1 && !CSS_SKIP.has(s))
  .map(([s]) => s);
if (dupes.length === 0) pass("No unexpected duplicate CSS selectors");
else dupes.forEach(s => fail(`Duplicate CSS selector outside @media: .${s}`));

// ─── Level 1f: Key structural checks ──────────────────────────────────────
section("Level 1f: Structure");
const checks = [
  [html.includes('id="auth-screen"'),                   'auth-screen element present'],
  [html.includes('id="main-app"'),                      'main-app element present'],
  [html.includes('id="app"'),                           'app render target present'],
  [html.includes('id="toast"'),                         'toast element present'],
  [html.includes('id="confirm-modal"'),                 'confirm-modal present'],
  [html.includes('rel="manifest"'),                     'manifest linked'],
  [html.includes('rel="icon"'),                         'favicon linked'],
  [html.includes('showAuthScreen(); // Default'),       'auth shown on boot'],
  [html.includes('onAuthStateChange'),                  'onAuthStateChange hooked'],
  [html.includes('window.addEventListener("online"'),   'online listener present'],
  [html.includes('navigator.language'),                 'detectLang uses navigator.language'],
  [html.includes('emailRedirectTo'),                    'emailRedirectTo set in signUp'],
  [html.includes('rpc("delete_user")'),                 'delete_user RPC call present'],
  [html.includes('resetPasswordForEmail'),              'resetPasswordForEmail present'],
  [(js.match(/`/g)||[]).length % 2 === 0,               'Even backtick count (no unclosed template literals)'],
];
checks.forEach(([ok, label]) => ok ? pass(label) : fail(label));

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(54)}`);
const total = passed + failed;
if (failed === 0) {
  console.log(`✅ All ${total} checks passed`);
} else {
  console.log(`⚠️  ${passed}/${total} passed — ${failed} issue(s) need attention`);
}
console.log(`${"═".repeat(54)}\n`);
process.exit(failed > 0 ? 1 : 0);
