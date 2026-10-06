// Vercel Function: PRAN-RFL HRIS attendance proxy
// ID/Password kothao store ba log hoy na.

const HRIS_BASE = "http://hris.prangroup.com:8686";
const LOGIN_URL = HRIS_BASE + "/Login.aspx";
const ATTENDANCE_URL = HRIS_BASE + "/Pages/Portal/Attendance.aspx";

const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", "i"));
  return m ? m[1] : "";
}
function inputs(html) {
  return (html.match(/<input[^>]*>/gi) || []).map(t => ({
    type: (attr(t, "type") || "text").toLowerCase(), name: attr(t, "name"), value: attr(t, "value"),
  }));
}
function selects(html) {
  return [...html.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi)].map(m => ({
    name: attr(m[1], "name"),
    options: [...m[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)].map(o => ({
      value: attr(o[1], "value"), text: o[2].replace(/<[^>]+>/g, "").trim(),
    })),
  }));
}
function hiddenFields(html) {
  const o = {};
  for (const i of inputs(html)) if (i.type === "hidden" && i.name) o[i.name] = i.value;
  return o;
}
function updateJar(res, jar) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const kv = c.split(";")[0]; const i = kv.indexOf("=");
    jar[kv.slice(0, i).trim()] = kv.slice(i + 1);
  }
}
const cookieHeader = jar => Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ");
const text = h => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function get(url, jar) {
  const r = await fetch(url, { headers: { ...UA, Cookie: cookieHeader(jar) }, redirect: "manual" });
  updateJar(r, jar);
  return r;
}

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
    if (c.length >= 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(c[0])) {
      rows.push({ date: c[0], day: c[1], inTime: c[2], outTime: c[3], status: c[4], type: c[5] || "", remarks: c[6] || "" });
    }
  }
  return { summary, rows };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { id, pass, month, year } = req.body || {};
  if (!id || !pass) return res.status(400).json({ error: "ID/Password dao" });

  try {
    const jar = {};

    // 1) Login page
    const r1 = await get(LOGIN_URL, jar);
    const h1 = await r1.text();
    const ins = inputs(h1);
    const userField = ins.find(i => i.type === "text" && i.name);
    const passField = ins.find(i => i.type === "password" && i.name);
    const btn = ins.find(i => (i.type === "submit" || i.type === "button" || i.type === "image") && i.name);
    if (!userField || !passField) {
      return res.status(502).json({ error: "Form pai ni. Status: " + r1.status + " | Inputs: " + ins.map(i => i.type + ":" + i.name).join(", ") + " | Page: " + text(h1).slice(0, 250) });
    }

    const form = new URLSearchParams({ ...hiddenFields(h1), [userField.name]: id, [passField.name]: pass });
    if (btn) form.set(btn.name, btn.value || "Login");

    // 2) Login POST
    const r2 = await fetch(LOGIN_URL, {
      method: "POST", redirect: "manual",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
      body: form,
    });
    updateJar(r2, jar);
    const h2 = r2.status === 200 ? await r2.text() : "";
    if (r2.status === 200 && /type\s*=\s*["']?password/i.test(h2)) {
      return res.status(401).json({ error: "Login failed: ID ba Password vul" });
    }

    // 3) Attendance page
    const r3 = await get(ATTENDANCE_URL, jar);
    let h3 = await r3.text();
    if (r3.status >= 300 && r3.status < 400) return res.status(401).json({ error: "Login hoy ni (redirect)" });

    // 4) Year/Month select + Show
    if (month && year) {
      const sels = selects(h3);
      const monthSel = sels.find(s => s.options.some(o => /^january$/i.test(o.text)));
      const yearSel = sels.find(s => s.options.some(o => o.text === String(year)));
      const showBtn = inputs(h3).find(i => (i.type === "submit" || i.type === "button") && /^show$/i.test(i.value));
      if (monthSel && yearSel && showBtn) {
        const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const mOpt = monthSel.options.find(o => o.text.toLowerCase() === MN[Number(month) - 1].toLowerCase());
        const yOpt = yearSel.options.find(o => o.text === String(year));
        if (mOpt && yOpt) {
          const f2 = new URLSearchParams({
            ...hiddenFields(h3),
            [monthSel.name]: mOpt.value,
            [yearSel.name]: yOpt.value,
            [showBtn.name]: showBtn.value,
          });
          const r4 = await fetch(ATTENDANCE_URL, {
            method: "POST", redirect: "manual",
            headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
            body: f2,
          });
          h3 = await r4.text();
        }
      }
    }

    const data = parseAttendance(h3);
    if (!data.rows.length) return res.status(502).json({ error: "Attendance data pailam na (page format alada hote pare)" });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: "HRIS reach kora jachche na: " + (e.cause && e.cause.code ? e.cause.code : e.message) });
  }
};
