// SRIH - Vercel Function: PRAN-RFL HRIS proxy (view-only pages; never applies or saves anything)
// ID/Password are never stored or logged.

const BASE = "http://hris.prangroup.com:8686";
const LOGIN_URL = BASE + "/Login.aspx";
const PAGES = {
  attendance: BASE + "/Pages/Portal/Attendance.aspx",
  payslip: BASE + "/Pages/Portal/Payslip.aspx",
  purchase: BASE + "/Pages/Payroll/PurchaseDetails.aspx",
  balance: BASE + "/Pages/Portal/QLvApplication.aspx",
  iom: BASE + "/Pages/Portal/QPersonalIOM.aspx",
  order: BASE + "/Pages/ProductPurchase/ProductOrder.aspx",
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------- helpers ----------
const dec = s => String(s || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = h => dec(String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim();
function attr(tag, name) {
  const m = tag.match(new RegExp("\\s" + name + '\\s*=\\s*"([^"]*)"', "i")) || tag.match(new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'", "i"));
  return m ? dec(m[1]) : "";
}
function allInputs(html) {
  return (html.match(/<input[^>]*>/gi) || []).map(t => ({
    type: (attr(t, "type") || "text").toLowerCase(), name: attr(t, "name"), value: attr(t, "value"), checked: /\schecked/i.test(t),
  }));
}
function allSelects(html) {
  return [...html.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi)].map(m => ({
    name: attr(m[1], "name"),
    options: [...m[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map(o => ({
      value: attr(o[1], "value"), text: text(o[2]), selected: /\sselected/i.test(o[1]),
    })),
  }));
}
// all form fields (except buttons/submit) - needed for an ASP.NET postback
function formFields(html) {
  const f = {};
  for (const i of allInputs(html)) {
    if (!i.name) continue;
    if (["button", "submit", "image", "file", "reset"].includes(i.type)) continue;
    if ((i.type === "checkbox" || i.type === "radio") && !i.checked) continue;
    f[i.name] = i.value;
  }
  for (const s of allSelects(html)) {
    if (!s.name || !s.options.length) continue;
    const sel = s.options.find(o => o.selected) || s.options[0];
    f[s.name] = sel.value;
  }
  for (const k of Object.keys(f)) if (k.startsWith("ctl00$Header$")) delete f[k];
  return f;
}
function setSelect(html, nameEnd, fields, wantText, wantValue) {
  const s = allSelects(html).find(x => x.name && x.name.endsWith(nameEnd));
  if (!s) return false;
  const o = s.options.find(o => (wantText && o.text.toLowerCase() === String(wantText).toLowerCase()) || (wantValue != null && o.value === String(wantValue)));
  if (!o) return false;
  fields[s.name] = o.value;
  return true;
}
function updateJar(res, jar) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of list) { const kv = c.split(";")[0]; const i = kv.indexOf("="); jar[kv.slice(0, i).trim()] = kv.slice(i + 1); }
}
const cookieHeader = jar => Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ");

// HRIS sometimes needs a second try when the connection can't be opened (connect timeout / refused / DNS hiccup).
// Only "could not connect" errors are retried, so nothing is ever sent twice.
async function fx(url, opts) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await fetch(url, opts); }
    catch (e) {
      last = e;
      const c = e && e.cause && e.cause.code;
      if (!["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT"].includes(c)) throw e;
      await new Promise(r => setTimeout(r, 700));
    }
  }
  throw last;
}
async function get(url, jar) {
  const r = await fx(url, { headers: { ...UA, Cookie: cookieHeader(jar) }, redirect: "manual" });
  updateJar(r, jar);
  return r;
}
async function post(url, jar, fields) {
  const r = await fx(url, {
    method: "POST", redirect: "manual",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar), Referer: url },
    body: new URLSearchParams(fields),
  });
  updateJar(r, jar);
  return r;
}

class UserError extends Error { constructor(m, code) { super(m); this.code = code || 400; } }

async function login(id, pass) {
  const jar = {};
  const r1 = await get(LOGIN_URL, jar);
  const h1 = await r1.text();
  const ins = allInputs(h1);
  const userField = ins.find(i => i.type === "text" && i.name);
  const passField = ins.find(i => i.type === "password" && i.name);
  const btn = ins.find(i => (i.type === "submit" || i.type === "button" || i.type === "image") && i.name);
  if (!userField || !passField) throw new UserError("Could not find the HRIS login form (status " + r1.status + ")", 502);
  const f = {};
  for (const i of ins) if (i.type === "hidden" && i.name) f[i.name] = i.value;
  f[userField.name] = id; f[passField.name] = pass;
  if (btn) f[btn.name] = btn.value || "Login";
  const r2 = await post(LOGIN_URL, jar, f);
  const h2 = r2.status === 200 ? await r2.text() : "";
  if (r2.status === 200 && /type\s*=\s*["']?password/i.test(h2)) throw new UserError("Login failed: wrong ID or password", 401);
  return jar;
}

// select year/month, then press Show
async function showMonth(url, jar, year, month, extra = {}) {
  const r = await get(url, jar);
  if (r.status >= 300 && r.status < 400) throw new UserError("Login did not complete (redirected)", 401);
  const h = await r.text();
  const f = formFields(h);
  setSelect(h, "ddlYear", f, String(year));
  setSelect(h, "ddlSmonth", f, MONTHS[Number(month) - 1]);
  for (const [k, v] of Object.entries(extra)) setSelect(h, k, f, null, v);
  const show = allInputs(h).find(i => i.type === "submit" && /btnShow$/.test(i.name));
  if (show) f[show.name] = show.value;
  const r2 = await post(url, jar, f);
  return { html: await r2.text(), page: h };
}

// ---------- parsers ----------
function parseAttendance(html) {
  const t = text(html);
  const pick = re => { const m = t.match(re); return m ? m[1].trim() : ""; };
  const summary = {
    staffId: pick(/StaffID:\s*([A-Za-z0-9]+)/i),
    name: pick(/Name:\s*(.+?)\s+Total Days/i),
    totalDays: pick(/Total Days:\s*(\d+)/i),
    payableDays: pick(/Payable Days:\s*(\d+)/i),
    lateMinutes: pick(/Late Minit:\s*(\d*)/i),
    present: pick(/Present:\s*(\d+)/i),
    late: pick(/Late:\s*(\d+)/i),
    absent: pick(/Absent:\s*(\d+)/i),
    leaveWithPay: pick(/Leave With Pay:\s*(\d+)/i),
    leaveWithoutPay: pick(/Leave Without Pay:\s*(\d+)/i),
    holiday: pick(/Holiday:\s*(\d+)/i),
  };
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const c = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => text(m[1]));
    if (c.length >= 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(c[0])) rows.push({ date: c[0], day: c[1], inTime: c[2], outTime: c[3], status: c[4], type: c[5] || "", remarks: c[6] || "" });
  }
  return { summary, rows };
}

function parsePayslip(html) {
  const t = text(html);
  const grab = re => { const m = t.match(re); return m ? m[1].trim() : ""; };
  const rowsOf = key => {
    const out = [];
    for (const tr of html.match(/<tr[^>]*id="[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || []) {
      if (!new RegExp(key, "i").test(tr.slice(0, 200))) continue;
      const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
      if (c.length >= 2 && c[0]) out.push({ name: c[0], amount: c[1] });
    }
    return out;
  };
  const num = s => parseFloat(String(s || "0").replace(/,/g, "")) || 0;
  const allowance = rowsOf("rptAllowance"), deduction = rowsOf("rptDeduction");
  const totalAllowance = grab(/Total Allowance\s*([\d.,]+)/i) || String(allowance.reduce((a, r) => a + num(r.amount), 0));
  const totalDeduction = grab(/Total Deduction\s*([\d.,]+)/i) || String(deduction.reduce((a, r) => a + num(r.amount), 0));
  return {
    company: grab(/^(.+?)\s+Allowance & Deduction for the month/i),
    title: grab(/(Allowance & Deduction for the month of [A-Za-z]+-\d{4})/i),
    department: grab(/Department\s*:\s*(.+?)\s+StaffID/i),
    staffId: grab(/StaffID\s+([A-Za-z0-9]+)/i),
    name: grab(/Name\s+(.+?)\s+Attendance/i),
    attendance: grab(/Attendance\s+(\d+)/i),
    allowance, deduction, totalAllowance, totalDeduction,
    net: (num(totalAllowance) - num(totalDeduction)).toFixed(2),
    // the lines HRIS prints in words under Total Allowance (same order as on HRIS)
    words: [...html.matchAll(/<span[^>]*id="[^"]*rpt_lbl(?:bpay|cpay|ptxt)_\d+"[^>]*>([\s\S]*?)<\/span>/gi)].map(m => text(m[1])).filter(Boolean),
  };
}

function parsePurchase(html) {
  const items = []; let group = "";
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const th = tr.match(/<th[^>]*colspan[^>]*>([\s\S]*?)<\/th>/i);
    if (th) { group = text(th[1]); continue; }
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
    if (c.length >= 7 && /^\d{2}\/\d{2}\/\d{4}/.test(c[3])) items.push({ group, trn: c[0], item: c[2], date: c[3], rate: c[4], qty: c[5], amount: c[6] });
  }
  const total = items.reduce((a, r) => a + (parseFloat(r.amount) || 0), 0);
  return { items, total };
}

function parseBalance(html) {
  const lbl = id => { const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</(?:span|div|label)>', "i")); return m ? text(m[1]) : ""; };
  return {
    balance: lbl("cphMain_lblBalance"),
    entitled: lbl("cphMain_lblEligible"),
    firstApprover: lbl("cphMain_lblFirstApprover"),
    finalApprover: lbl("cphMain_lblFinalApprover"),
  };
}


// ---------- SAFETY: postbacks only for read-only buttons ----------
// This site never presses Save / Delete / Edit / Apply buttons.
const SAFE_TARGETS = new Set(["ctl00$cphMain$btnShow", "ctl00$cphMain$btnView"]);
async function readOnlyPostback(url, jar, html, target) {
  if (!SAFE_TARGETS.has(target)) throw new UserError("Blocked: only read-only buttons are allowed", 403);
  const f = formFields(html);
  f["__EVENTTARGET"] = target;
  f["__EVENTARGUMENT"] = "";
  const r = await post(url, jar, f);
  return await r.text();
}

// Product Order page: read the LIMIT only (GET only - never presses a button or places an order)
function parseLimit(html) {
  const lbl = id => { const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</(?:span|div|label)>', "i")); return m ? text(m[1]) : ""; };
  const st = allSelects(html).find(x => x.name && x.name.endsWith("ddlStore"));
  return {
    limit: lbl("cphMain_lblpLinit"),
    total: lbl("cphMain_lblTotal"),
    staffId: lbl("cphMain_lblStaffID"),
    name: lbl("cphMain_lblName"),
    stores: st ? st.options.filter(o => o.text && o.value !== "0").map(o => ({ value: o.value, name: o.text })) : [],
  };
}

// Leave / IOM history table (header row + rows that start with a date)
function parseHistory(html) {
  let headers = [];
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const th = [...tr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1]));
    if (th.length >= 4 && th.some(x => /date/i.test(x))) { headers = th; continue; }
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
    if (c.length >= 4 && /^\d{2}\/\d{2}\/\d{4}$/.test(c[0])) rows.push(c);
  }
  // Drop the Action column (edit/delete)
  const ai = headers.findIndex(h => /^action$/i.test(h));
  if (ai >= 0) { headers = headers.filter((_, i) => i !== ai); for (let i = 0; i < rows.length; i++) rows[i] = rows[i].filter((_, j) => j !== ai); }
  return { headers, rows: rows.slice(0, 60) };
}

// Days after today in Bangladesh (HRIS counts not-yet-happened days as Absent)
function dhakaToday() { const d = new Date(Date.now() + 6 * 3600 * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function countFutureAbsent(rows) {
  const t = dhakaToday();
  return rows.filter(r => {
    const m = r.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m && Date.UTC(+m[3], +m[2] - 1, +m[1]) > t && /^absent/i.test(r.status);
  }).length;
}

// Profile photo -> data URI (only from the HRIS host, small images only; null on any problem)
async function fetchPhoto(src, jar) {
  try {
    if (!src) return { url: "", data: null };
    const u = new URL(src);
    if (!/^hris\.prangroup\.com$/i.test(u.hostname) || !/^https?:$/.test(u.protocol)) return { url: "", data: null };
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
    let data = null;
    try {
      const r = await fetch(u.href, { headers: { ...UA, Cookie: cookieHeader(jar) }, signal: ac.signal, redirect: "manual" });
      const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (r.ok && /^image\/(jpeg|png|webp|gif)$/.test(ct)) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 100 && buf.length <= 250000) data = "data:" + ct + ";base64," + buf.toString("base64");
      }
    } finally { clearTimeout(t); }
    return { url: u.href, data };
  } catch (e) { return { url: "", data: null }; }
}

// ---------- handler ----------
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { id, pass, page, month, year, subhead } = req.body || {};
  if (!id || !pass) return res.status(400).json({ error: "Enter your ID and password" });
  if (!["attendance", "payslip", "purchase", "balance", "trend", "iom", "limit"].includes(page)) return res.status(400).json({ error: "Unknown page" });

  try {
    const jar = await login(id, pass);
    const mo = month || (new Date().getMonth() + 1), yr = year || new Date().getFullYear();

    if (page === "attendance") {
      const { html, page: pg0 } = await showMonth(PAGES.attendance, jar, yr, mo);
      const d = parseAttendance(html);
      if (!d.rows.length) throw new UserError("Could not find attendance data", 502);
      d.futureAbsent = countFutureAbsent(d.rows);
      // the logged-in user's own profile photo (shown in the avatar); optional, never blocks the data
      const both = html + (pg0 || "");
      const im = both.match(/id="Header_imgProfile2"[^>]*src="([^"]+)"/i) || both.match(/src="([^"]+)"[^>]*id="Header_imgProfile2"/i);
      const ph = await fetchPhoto(im ? im[1] : "", jar);
      d.photo = ph.data; d.photoUrl = ph.url;
      return res.status(200).json(d);
    }

    if (page === "payslip") {
      const { html } = await showMonth(PAGES.payslip, jar, yr, mo);
      const d = parsePayslip(html);
      if (!d.allowance.length && !d.deduction.length) throw new UserError("No Allowance/Deduction data for this month", 404);
      return res.status(200).json(d);
    }

    if (page === "purchase") {
      const tries = subhead ? [String(subhead)] : ["73", "74"];
      let result = null, subheads = [];
      for (const sh of tries) {
        const { html, page: p0 } = await showMonth(PAGES.purchase, jar, yr, mo, { ddlSubHead: sh });
        const sel = allSelects(p0).find(s => s.name && s.name.endsWith("ddlSubHead"));
        if (sel) subheads = sel.options.filter(o => o.value !== "0").map(o => ({ value: o.value, name: o.text }));
        const d = parsePurchase(html);
        if (d.items.length || !result) result = d;
        if (d.items.length) { result.subhead = sh; break; }
      }
      result.subheads = subheads;
      return res.status(200).json(result);
    }

    if (page === "trend") {
      // last 4 mash-er attendance summary (ekbar login, ek ek kore mash)
      const out = [];
      const base = new Date(Number(yr), Number(mo) - 1, 1);
      for (let i = 0; i < 4; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const m = d.getMonth() + 1, y = d.getFullYear();
        try {
          const { html } = await showMonth(PAGES.attendance, jar, y, m);
          const a = parseAttendance(html);
          const s = a.summary;
          out.push({ label: MONTHS[m - 1].slice(0, 3) + " " + y, ok: a.rows.length > 0,
            present: +s.present || 0, absent: +s.absent || 0, late: +s.late || 0, lateMinutes: +s.lateMinutes || 0,
            holiday: +s.holiday || 0, leave: (+s.leaveWithPay || 0) + (+s.leaveWithoutPay || 0), future: countFutureAbsent(a.rows) });
        } catch (e) {
          out.push({ label: MONTHS[m - 1].slice(0, 3) + " " + y, ok: false, present: 0, absent: 0, late: 0, lateMinutes: 0, holiday: 0, leave: 0, future: 0 });
        }
      }
      return res.status(200).json({ months: out });
    }

    if (page === "balance") {
      const r = await get(PAGES.balance, jar);
      if (r.status >= 300 && r.status < 400) throw new UserError("Login did not complete (redirected)", 401);
      const h = await r.text();
      const d = parseBalance(await readOnlyPostback(PAGES.balance, jar, h, "ctl00$cphMain$btnView"));
      try {
        d.history = parseHistory(await readOnlyPostback(PAGES.balance, jar, h, "ctl00$cphMain$btnShow"));
      } catch (e) { d.history = { headers: [], rows: [] }; }
      return res.status(200).json(d);
    }

    if (page === "limit") {
      const r = await get(PAGES.order, jar);
      if (r.status >= 300 && r.status < 400) throw new UserError("Login did not complete (redirected)", 401);
      const d = parseLimit(await r.text());
      if (!d.limit) throw new UserError("Could not find the Product Order limit", 502);
      return res.status(200).json(d);
    }

    if (page === "iom") {
      const r = await get(PAGES.iom, jar);
      if (r.status >= 300 && r.status < 400) throw new UserError("Login did not complete (redirected)", 401);
      const h = await r.text();
      const hist = parseHistory(await readOnlyPostback(PAGES.iom, jar, h, "ctl00$cphMain$btnShow"));
      return res.status(200).json(hist);
    }
  } catch (e) {
    const code = e instanceof UserError ? e.code : 502;
    const ec = e && e.cause && e.cause.code;
    const msg = e instanceof UserError ? e.message
      : (ec === "UND_ERR_CONNECT_TIMEOUT" || ec === "ETIMEDOUT" || ec === "ECONNREFUSED")
        ? "HRIS server ekhon reach kora jachche na (timeout). Kichukkhon por abar try korun. [" + ec + "]"
        : "HRIS reach kora jachche na: " + (ec ? ec : e.message);
    return res.status(code).json({ error: msg });
  }
};
