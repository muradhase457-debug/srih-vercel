  // The API lives on the same site, so no URL change is needed
  const API = "/api/hris";
  const $ = id => document.getElementById(id);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const now = new Date();
  let cred = null;       // kept in memory only; cleared when the page is closed
  let tab = "attendance";
  let cache = {};

  $("month").innerHTML = MONTHS.map((m,i)=>`<option value="${i+1}" ${i===now.getMonth()?"selected":""}>${m}</option>`).join("");
  $("year").value = now.getFullYear();
  try { $("uid").value = localStorage.getItem("srih_uid") || ""; } catch(e){}

  async function call(page, extra = {}) {
    let res, data;
    for (let t = 0; t < 2; t++) {
      res = await fetch(API, { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ id: cred.id, pass: cred.pass, sess: cred.sess, page, month: $("month").value, year: $("year").value, ...extra }) });
      try { data = await res.json(); } catch { throw new Error("Invalid response from server (" + res.status + ")"); }
      // HRIS only timed out (flaky route): try once more automatically
      if (!(res.status === 502 && /timeout|reach kora/i.test((data && data.error) || "")) || t === 1) break;
      const g = $("go"); if (g && g.disabled) g.textContent = "Retrying...";
      await new Promise(r => setTimeout(r, 1200));
    }
    if (!res.ok || data.error) throw new Error(data.error || "Server error");
    if (data.sess && cred) { cred.sess = data.sess; }   // HRIS session kept in memory only, so the next tabs open fast
    delete data.sess;
    return data;
  }

  function showErr(el, msg){ el.textContent = msg; el.style.display = msg ? "block" : "none"; }

  // ---- login = test with the Attendance request ----
  $("go").onclick = async () => {
    const id = $("uid").value.trim(), pass = $("pwd").value;
    if (!id || !pass) return showErr($("loginErr"), "Enter your ID and password");
    showErr($("loginErr"), ""); $("go").disabled = true; $("go").textContent = "Loading...";
    cred = { id, pass };
    try {
      const d = await call("attendance");
      try { localStorage.setItem("srih_uid", id); } catch(e){}
      $("pwd").value = "";
      $("loginCard").style.display = "none"; $("app").style.display = "block"; setMini(1);
      cache = {}; cache["attendance|" + key()] = d;
      switchTab("attendance", "first");
      call("photo").then(p => {
        if (cred && p && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(p.photo || "")) {
          cred.photo = p.photo;
          document.querySelectorAll(".av").forEach(a => { a.style.background = "url(" + p.photo + ") center/cover no-repeat, var(--hero) -94px -75px/244px no-repeat"; });
        }
      }).catch(() => {});
    } catch (e) {
      cred = null;
      showErr($("loginErr"), e.message === "Failed to fetch" ? "Can't reach the server. Please check your internet connection." : e.message);
    }
    $("go").disabled = false; $("go").textContent = "Login";
  };
  $("pwd").addEventListener("keydown", e => { if (e.key === "Enter") $("go").click(); });

  $("logout").onclick = () => { cred = null; cache = {}; $("out").innerHTML = ""; $("app").style.display = "none"; $("loginCard").style.display = "block"; setMini(0); };

  const key = () => $("month").value + "-" + $("year").value;

  document.querySelectorAll(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.t));
  $("load").onclick = () => { delete cache[tab + "|" + key()]; switchTab(tab, true); };


  // ---- bubble animation: a bubble rises when a tab is tapped ----
  const DROP = $("drop"), TABS = $("tabs");
  function popBubble(t) {
    const b = TABS.querySelector('.tab[data-t="' + t + '"]');
    if (!b || !DROP) return;
    DROP.style.setProperty("--bc", b.dataset.c || "#fbeaa8");
    DROP.style.left = (b.offsetLeft - TABS.scrollLeft + b.offsetWidth / 2) + "px";
    DROP.style.top = b.offsetTop + "px";
    DROP.textContent = b.textContent.trim().split(" ")[0];
    DROP.classList.remove("go"); void DROP.offsetWidth; DROP.classList.add("go");
  }

  async function switchTab(t, force) {
    const prevTab = tab;
    tab = t;
    if (prevTab !== t || force === "first") popBubble(t);
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    $("barCard").style.display = (t === "balance" || t === "trend" || t === "iom" || t === "limit" || t === "profile") ? "none" : "block";
    showErr($("err"), "");
    const ck = t + "|" + (t === "profile" ? "" : key());
    if (cache[ck]) return render(t, cache[ck]);
    $("out").innerHTML = '<div class="loading">Loading...</div>';
    try {
      const d = await call(t);
      cache[ck] = d;
      if (tab === t) render(t, d);
    } catch (e) {
      if (tab === t) { $("out").innerHTML = ""; showErr($("err"), e.message); }
    }
  }

  const stat = (l,v,c) => `<div class="stat ${c}">${l}<b>${esc(v||0)}</b></div>`;

  function render(t, d) {
    if (t === "attendance") return renderAttendance(d);
    if (t === "balance") return renderBalance(d);
    if (t === "payslip") return renderPayslip(d);
    if (t === "purchase") return renderPurchase(d);
    if (t === "trend") return renderTrend(d);
    if (t === "iom") return renderIom(d);
    if (t === "limit") return renderLimit(d);
    if (t === "profile") return renderProfile(d);
  }

  function mins(t){const m=/(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(t||"");if(!m)return null;let h=+m[1];if(m[3])h=h%12+(/p/i.test(m[3])?12:0);return h*60+ +m[2]}
  function stC(x){x=String(x||"").toLowerCase();return /absent/.test(x)?"--red":/late/.test(x)?"--amber":/^present/.test(x)?"--green":/leave/.test(x)?"--blue":/off|holiday/.test(x)?"--teal":/today/.test(x)?"--gold":"--muted"}
  function countUp(sel){document.querySelectorAll(sel).forEach(b=>{const t=+b.textContent;if(isNaN(t)||!t)return;const s=performance.now();(function f(n){const p=Math.min(1,(n-s)/900);b.textContent=Math.round(t*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(s)})}
  // Real HRIS employee photo (falls back to the hero picture if it can't load)
  const photoUrl = id => { id = encodeURIComponent(String(id||"").trim().toUpperCase()); return "https://hris.prangroup.com:777/CONTENT/Employee/Emp/" + id + "/" + id + ".jpg"; };
  function renderAttendance(d) {
    const s=d.summary||{},rows=d.rows||[],P=+s.present||0,L=Math.min(P,+s.late||0),ab=Math.max(0,(+s.absent||0)-(+d.futureAbsent||0)),lv=(+s.leaveWithPay||0)+(+s.leaveWithoutPay||0),H=+s.holiday||0;
    const seg=[[P-L,"--green","On-time"],[L,"--amber","Late"],[lv,"--blue","Leave"],[ab,"--red","Absent"],[H,"--teal","Holiday"]].filter(x=>x[0]>0),tot=seg.reduce((a,x)=>a+x[0],0)||1,C=2*Math.PI*54,g=seg.length>1?9:0;
    let acc=0;const arcs=seg.map(x=>{const l=C*x[0]/tot,o=acc*360/tot-90;acc+=x[0];return `<circle cx="70" cy="70" r="54" fill="none" stroke-width="14" stroke-linecap="round" stroke="var(${x[1]})" stroke-dasharray="0 ${C}" data-d="${Math.max(l-g,.1)} ${C}" transform="rotate(${o} 70 70)"/>`}).join("");
    const td=String(now.getDate()).padStart(2,"0")+"/"+String(now.getMonth()+1).padStart(2,"0")+"/"+now.getFullYear();
    const tl=rows.map((r,i)=>{const p=String(r.date||"").split("/"),a=mins(r.inTime),b=mins(r.outTime),w=a!=null&&b!=null&&b>a?b-a:0,c=stC(r.status),isT=r.date===td;
      return `<div class="row${isT?" today":""}" style="--c:var(${isT?"--gold":c});--d:${Math.min(i*.04,1.2)}s"><div class="dt"><b>${esc(p[0]||"")}</b><span>${esc((MONTHS[(+p[1]||1)-1]||"").slice(0,3).toUpperCase())} · ${esc(String(r.day||"").slice(0,3).toUpperCase())}</span></div><div class="mid">${a!=null?esc(r.inTime)+" → "+esc(r.outTime||"–")+(w?`<small>${Math.floor(w/60)}h ${w%60}m kaj</small><div class="hb"><u data-w="${Math.min(100,w/7.2).toFixed(0)}"></u></div>`:""):"—<small>"+esc(r.status||"")+"</small>"}</div><span class="pill" style="background:var(${c})">${esc(r.status)}</span></div>`}).join("");
    $("out").innerHTML = `<div class="card rise"><div class="me"><div class="av" style="background:url(${(cred && cred.photo) ? cred.photo : (d.photo && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(d.photo)) ? d.photo : photoUrl(s.staffId||(cred&&cred.id))}) center/cover no-repeat,var(--hero) -94px -75px/244px no-repeat"></div><div><div class="name">${esc(s.name||"My Attendance")}</div><div class="sub">Staff ID: ${esc(s.staffId||"-")} • Total Days: ${esc(s.totalDays||"-")}${s.payableDays?" • Payable: "+esc(s.payableDays):""}${s.lateMinutes?" • Late Min: "+esc(s.lateMinutes):""}</div></div></div></div>
      <div class="card rise" style="--d:.1s"><div class="sum"><div class="rg"><svg viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="rgba(127,150,160,.25)" stroke-width="14"/>${arcs}</svg><div class="rc"><b>${P}</b><span>days present</span></div></div><div class="lg">${seg.map(x=>`<div><i style="background:var(${x[1]})"></i>${x[2]} · ${x[0]}</div>`).join("")}</div></div>
      <div class="grid">${stat("Present",s.present,"g")+stat("Absent",ab,"r")+stat("Late",s.late,"a")+stat("Leave (Pay)",s.leaveWithPay,"b")+stat("Leave (No Pay)",s.leaveWithoutPay,"p")+stat("Holiday",s.holiday,"s")}</div>
      ${(+d.futureAbsent>0)?`<div class="sub" style="margin-top:10px">ℹ️ HRIS shows ${esc(s.absent)} absent, but ${esc(d.futureAbsent)} of those days have not happened yet (days after today), so they are excluded above.</div>`:""}
      ${(+s.late>0)?`<div class="warn">⏰ Late ${esc(s.late)} time(s) this month${s.lateMinutes?" ("+esc(s.lateMinutes)+" min total)":""}</div>`:""}</div>
      <div class="card rise" style="--d:.2s"><h3>🧵 Daily timeline</h3><div class="tl">${tl||'<p class="sub">No records found.</p>'}</div></div>`;
    setTimeout(()=>{document.querySelectorAll("#out circle[data-d]").forEach(c=>c.setAttribute("stroke-dasharray",c.dataset.d));document.querySelectorAll("#out .hb u").forEach(u=>u.style.width=u.dataset.w+"%")},120);
    countUp("#out .stat b");
  }

  function chipCls(st) { st = String(st||"").toLowerCase(); return /approv/.test(st) ? "c-g" : /reject|cancel|den|declin/.test(st) ? "c-r" : "c-a"; }
  function histCards(hh) {
    const H = (hh && hh.headers) || [], R = (hh && hh.rows) || [];
    if (!R.length) return '<p class="sub" style="margin-top:10px">No history found.</p>';
    const idx = re => H.findIndex(x => re.test(x));
    const iF = idx(/from/i), iT = idx(/^to/i), iS = idx(/status/i), iR = idx(/reason/i);
    return R.map(r => {
      const from = r[iF >= 0 ? iF : 0], to = r[iT >= 0 ? iT : 1];
      const st = iS >= 0 ? r[iS] : "";
      const skip = new Set([iF >= 0 ? iF : 0, iT >= 0 ? iT : 1, iS, iR]);
      const meta = r.map((v, i) => skip.has(i) || !v ? null : (H[i] ? H[i] + ": " : "") + v).filter(Boolean).join(" • ");
      return `<div class="hcard"><div class="htop"><span>${esc(from)}${to && to !== from ? " → " + esc(to) : ""}</span>${st ? `<span class="chip ${chipCls(st)}">${esc(st)}</span>` : ""}</div>${iR >= 0 && r[iR] ? `<div class="hrs">${esc(r[iR])}</div>` : ""}<div class="hmeta">${esc(meta)}</div></div>`;
    }).join("");
  }
  const HRIS_LEAVE = "http://hris.prangroup.com:8686/Pages/Portal/QLvApplication.aspx";
  const HRIS_ORDER = "http://hris.prangroup.com:8686/Pages/ProductPurchase/ProductOrder.aspx";
  const HRIS_IOM = "http://hris.prangroup.com:8686/Pages/Portal/QPersonalIOM.aspx";

  function renderBalance(d) {
    $("out").innerHTML = `<div class="card">
      <div class="name">Leave Balance</div>
      <div class="kv"><span>Balance</span><span>${esc(d.balance||"-")}</span></div>
      <div class="kv"><span>Entitled</span><span>${esc(d.entitled||"-")}</span></div>
      <div class="kv"><span>First Approver</span><span>${esc(d.firstApprover||"-")}</span></div>
      <div class="kv"><span>Final Approver</span><span>${esc(d.finalApprover||"-")}</span></div>
      <a class="ext" href="${HRIS_LEAVE}" target="_blank" rel="noopener">Apply for leave on HRIS ↗</a></div>
      <div class="card"><div class="name">Leave history</div>${histCards(d.history)}</div>`;
  }

  function renderLimit(d) {
    const stores = (d.stores || []).map(x => `<span style="display:inline-block;margin:4px 6px 0 0;padding:6px 11px;border-radius:99px;font-size:11.5px;font-weight:800;border:1.5px solid var(--line);background:var(--in)">${esc(x.name)}</span>`).join("");
    $("out").innerHTML = `<div class="card rise">
      <div class="name">🛒 Product Order Limit</div>
      <div class="sub">${esc(d.name||"")}${d.staffId?" • "+esc(d.staffId):""}</div>
      <div class="big" style="color:var(--gold)">৳ ${esc(d.limit)}</div>
      <div class="sub">Total Limit (HRIS Extras → Product Order)</div>
      ${d.total ? `<div class="kv" style="margin-top:12px"><span>Current order total</span><span>${esc(d.total)}</span></div>` : ""}
      ${stores ? `<h4>Stores</h4>${stores}` : ""}
      <a class="ext" href="${HRIS_ORDER}" target="_blank" rel="noopener">Open Product Order on HRIS ↗</a></div>`;
  }

  function renderIom(d) {
    $("out").innerHTML = `<div class="card"><div class="name">IOM history</div>${histCards(d)}
      <a class="ext" href="${HRIS_IOM}" target="_blank" rel="noopener">Apply for IOM on HRIS ↗</a></div>`;
  }

  function renderPayslip(d) {
    const num = x => parseFloat(String(x == null ? "" : x).replace(/,/g, "")) || 0;
    const fmt = n => n.toLocaleString("en-US", {maximumFractionDigits: 2});
    const A = d.allowance || [], D = d.deduction || [];
    const sumA = A.reduce((t, r) => t + num(r.amount), 0), sumD = D.reduce((t, r) => t + num(r.amount), 0);
    const totA = num(d.totalAllowance) ? d.totalAllowance : fmt(sumA);
    const totD = num(d.totalDeduction) ? d.totalDeduction : fmt(sumD);
    const net = num(d.net) ? d.net : fmt(num(totA) - num(totD));
    const rows = a => a.map(r => `<div class="kv"><span>${esc(r.name)}</span><span>${esc(r.amount)}</span></div>`).join("") || '<div class="kv"><span>-</span><span></span></div>';
    const tot = (l, v) => `<div class="kv" style="border-bottom:0;border-top:2px solid var(--gold);margin-top:4px"><span><b>${l}</b></span><span style="font-size:16px">${esc(v)}</span></div>`;
    $("out").innerHTML = `<div class="card">
      <div class="name">${esc(d.name||"Salary")}</div>
      <div class="sub">${esc(d.title||"")}${d.department?" • "+esc(d.department):""}${d.attendance?" • Attendance: "+esc(d.attendance):""}</div>
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">${stat("Allowance",totA,"g")+stat("Deduction",totD,"r")+stat("Net",net,"b")}</div>
      <h4>Allowance</h4>${rows(A)}${tot("Total Allowance", totA)}${(d.words && d.words.length) ? `<div class="sub" style="text-align:right;margin-top:6px">As written by HRIS</div>` + d.words.map(x => `<div class="pwl">${esc(x)}</div>`).join("") : ""}
      <h4>Deduction</h4>${rows(D)}${tot("Total Deduction", totD)}</div>`;
  }


  function renderTrend(d) {
    const ms = d.months || [];
    const rows = ms.map(m => {
      const ab = Math.max(0, m.absent - (m.future || 0));
      const tot = (m.present + ab + m.leave + m.holiday) || 1;
      const w = n => (n * 100 / tot).toFixed(1) + "%";
      return `<div class="mrow"><div class="mhead">${esc(m.label)}<span>${m.ok ? "Late: " + m.late + (m.lateMinutes ? " (" + m.lateMinutes + " min)" : "") : "no data"}</span></div>
        <div class="bar2"><i style="width:${w(m.present)};background:var(--green)"></i><i style="width:${w(m.leave)};background:var(--blue)"></i><i style="width:${w(m.holiday)};background:var(--teal)"></i><i style="width:${w(ab)};background:var(--red)"></i></div>
        <div class="leg"><span><b style="background:var(--green)"></b>Present ${m.present}</span><span><b style="background:var(--red)"></b>Absent ${ab}</span><span><b style="background:var(--blue)"></b>Leave ${m.leave}</span><span><b style="background:var(--teal)"></b>Holiday ${m.holiday}</span></div></div>`;
    }).join("");
    $("out").innerHTML = `<div class="card"><div class="name">Last 4 months</div><div class="sub">Present, Absent, Leave and Holiday compared</div>${rows}</div>`;
  }

  function renderPurchase(d) {
    const items = d.items || [];
    const opts = (d.subheads||[]).map(s => `<option value="${esc(s.value)}" ${s.value===d.subhead?"selected":""}>${esc(s.name)}</option>`).join("");
    const body = items.map(r => `<tr><td>${esc(r.date.slice(0,10))}<br><span style="color:var(--muted)">${esc(r.date.slice(11,16))}</span></td><td style="white-space:normal">${esc(r.item)}</td><td class="n">${esc(r.qty)}</td><td class="n">${esc(r.amount)}</td></tr>`).join("");
    $("out").innerHTML = `<div class="card">
      <div class="name">Canteen / Purchase</div>
      <div class="big">৳ ${esc(d.total)}</div>
      <div class="sub">${items.length} items</div>
      ${opts ? `<label>Sub Head</label><select id="subhead">${opts}</select>` : ""}
      <div class="tw"><table><thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${body || '<tr><td colspan="4" style="text-align:center;padding:20px">No data</td></tr>'}</tbody></table></div></div>`;
    const sh = $("subhead");
    if (sh) sh.onchange = async () => {
      $("out").innerHTML = '<div class="loading">Loading...</div>';
      try { const nd = await call("purchase", { subhead: sh.value }); cache["purchase|" + key()] = nd; renderPurchase(nd); }
      catch (e) { showErr($("err"), e.message); }
    };
  }


  // ---- Profile tab (view only) ----
  let profSub = "personal";
  const PROF_ICON = { personal: "🪪", contact: "📞", parents: "👪", photo: "📷", job: "💼", education: "🎓", event: "🎉" };
  const HRIS_PROFILE = "http://hris.prangroup.com:8686/Pages/Portal/ProfileUpdate.aspx";
  const IMG_OK = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/;
  const dash = v => (v == null || v === "" || v === "0") ? "" : v;

  function profTableCards(tb) {
    const H = tb.headers || [], R = tb.rows || [];
    const nice = h => { h = String(h || ""); return h ? h.charAt(0) + h.slice(1).toLowerCase().replace(/(of|no|name|year)$/, " $1") : ""; };
    return R.map(r => {
      const rest = r.map((v, i) => i === 0 || !dash(v) ? "" : `<div class="kv"><span>${esc(nice(H[i]) || "-")}</span><span>${esc(v)}</span></div>`).join("");
      return `<div class="hcard"><div class="htop"><span>${esc(r[0] || "-")}</span></div>${rest || '<div class="sub" style="margin-top:6px">No more details saved on HRIS</div>'}</div>`;
    }).join("");
  }

  function profBody(t) {
    if (t.key === "photo") return '<div id="phbox"><p class="sub">Photos are large, so they load only when you tap the button.</p><button class="link" id="phbtn">📷 Load photos</button></div>';
    let h = "";
    if (t.key !== "event") {   // the Event page is only an "add new" form, so only saved events are shown
      for (const g of t.groups || []) {
        h += (g.title ? `<h4>${esc(g.title)}</h4>` : "") + g.fields.map(f => `<div class="kv"><span>${esc(f.l)}</span><span${f.v ? "" : ' class="nil"'}>${f.v ? esc(f.v) : "—"}</span></div>`).join("");
      }
    }
    for (const tb of t.tables || []) h += (h ? "<h4>List</h4>" : "") + profTableCards(tb);
    return h || `<p class="sub">${t.key === "event" ? "No saved events on HRIS." : "No data on HRIS for this section."}</p>`;
  }

  function showPhotos(box, list) {
    box.textContent = "";
    if (!list.length) { const p = document.createElement("p"); p.className = "sub"; p.textContent = "No photos found on HRIS."; box.appendChild(p); return; }
    const grid = document.createElement("div"); grid.className = "pgrid";
    list.forEach(x => {
      const fig = document.createElement("figure");
      if (IMG_OK.test(x.data || "")) { const im = document.createElement("img"); im.alt = x.label || "Photo"; im.src = x.data; fig.appendChild(im); }
      else { const na = document.createElement("div"); na.className = "na"; na.textContent = "Not uploaded or too large"; fig.appendChild(na); }
      const cap = document.createElement("figcaption"); cap.textContent = x.label || ""; fig.appendChild(cap);
      grid.appendChild(fig);
    });
    box.appendChild(grid);
  }

  function renderProfile(d) {
    const tabs = d.tabs || [];
    if (!tabs.length) { $("out").innerHTML = '<div class="card"><p class="sub">No profile data found.</p></div>'; return; }
    const cur = tabs.find(t => t.key === profSub) || tabs[0];
    $("out").innerHTML = `<div class="card rise"><div class="me"><div class="av"></div><div><div class="name">${esc(d.name || "Profile")}</div><div class="sub">${esc(d.staffId || "")}</div></div></div></div>
      <div class="card"><div class="pps" id="pps">${tabs.map(t => `<button class="pp${t === cur ? " on" : ""}" data-k="${esc(t.key)}">${PROF_ICON[t.key] || "📄"} ${esc(t.name)}</button>`).join("")}</div>
      <div id="pbody">${profBody(cur)}</div>
      <a class="ext" href="${HRIS_PROFILE}" target="_blank" rel="noopener">Edit profile on HRIS ↗</a></div>`;
    if (cred && cred.photo && IMG_OK.test(cred.photo)) document.querySelector("#out .av").style.background = "url(" + cred.photo + ") center/cover no-repeat, var(--hero) -94px -75px/244px no-repeat";
    const onPill = document.querySelector("#pps .pp.on"); if (onPill) $("pps").scrollLeft = Math.max(0, onPill.offsetLeft - 24);
    document.querySelectorAll("#pps .pp").forEach(b => b.onclick = () => { profSub = b.dataset.k; renderProfile(d); });
    const btn = $("phbtn");
    if (btn) {
      if (d._ph) showPhotos($("phbox"), d._ph);
      else btn.onclick = async () => {
        const box = $("phbox");
        if (!(d.photoSrcs || []).length) return showPhotos(box, []);
        btn.disabled = true; btn.textContent = "Loading...";
        try { const p = await call("profilephotos", { srcs: d.photoSrcs }); d._ph = p.photos || []; if (tab === "profile" && $("phbox")) showPhotos($("phbox"), d._ph); }
        catch (e) { btn.disabled = false; btn.textContent = "📷 Load photos"; showErr($("err"), e.message); }
      };
    }
  }

  // ---- 3D hero + theme ----
  function setMini(on){document.querySelector(".wrap").classList.toggle("mini",!!on);scrollTo(0,0)}
  (function(){const r=document.documentElement;try{const v=localStorage.getItem("srih_theme");if(v)r.dataset.theme=v}catch(e){}
    $("thm").onclick=()=>{const d=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches,v=d?"light":"dark";r.dataset.theme=v;try{localStorage.setItem("srih_theme",v)}catch(e){}};
    const T=$("tl"),S=$("st");
    function set(rx,ry,mx,my){T.style.setProperty("--rx",rx+"deg");T.style.setProperty("--ry",ry+"deg");T.style.setProperty("--mx",mx+"%");T.style.setProperty("--my",my+"%")}
    function pt(e){const t=e.touches?e.touches[0]:e,b=S.getBoundingClientRect(),x=(t.clientX-b.left)/b.width,y=(t.clientY-b.top)/b.height;set(((.5-y)*26).toFixed(1),((x-.5)*30).toFixed(1),(x*100).toFixed(0),(y*100).toFixed(0))}
    ["pointermove","touchmove","touchstart"].forEach(n=>S.addEventListener(n,pt,{passive:true}));
    ["pointerleave","touchend"].forEach(n=>S.addEventListener(n,()=>set(0,0,30,15)));
    addEventListener("deviceorientation",e=>{if(e.gamma==null)return;const rx=Math.max(-10,Math.min(10,(e.beta-55)/4)),ry=Math.max(-14,Math.min(14,e.gamma/3));set(rx.toFixed(1),ry.toFixed(1),(50+ry*3).toFixed(0),(30-rx*3).toFixed(0))});
  })();

  // ---- PC: scroll the tab strip with the mouse wheel, by dragging, or with the arrow buttons ----
  (function () {
    const wrap = TABS.parentElement;
    const mk = (cls, ch, dir) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tarr " + cls; b.textContent = ch;
      b.setAttribute("aria-label", dir < 0 ? "Scroll tabs left" : "Scroll tabs right");
      b.onclick = () => TABS.scrollBy({ left: dir * 220, behavior: "smooth" });
      wrap.appendChild(b); return b;
    };
    const L = mk("l", "\u2039", -1), R = mk("r", "\u203A", 1);
    const upd = () => {
      const max = TABS.scrollWidth - TABS.clientWidth;
      L.classList.toggle("show", TABS.scrollLeft > 4);
      R.classList.toggle("show", TABS.scrollLeft < max - 4);
    };
    TABS.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    if (window.ResizeObserver) new ResizeObserver(upd).observe(TABS);
    upd();
    TABS.addEventListener("wheel", e => {
      if (TABS.scrollWidth > TABS.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { TABS.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    let down = false, moved = false, sx = 0, sl = 0;
    TABS.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse" || e.button !== 0) return; down = true; moved = false; sx = e.clientX; sl = TABS.scrollLeft; });
    window.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (!moved && Math.abs(dx) > 5) { moved = true; TABS.classList.add("dragging"); }
      if (moved) TABS.scrollLeft = sl - dx;
    });
    window.addEventListener("pointerup", () => { if (down && moved) setTimeout(() => TABS.classList.remove("dragging"), 0); down = false; });
    TABS.addEventListener("click", e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  })();
