// ===== Rube-Goldberg login machine (decor only; the real login code is untouched) =====
(function(){
  const q = id => document.getElementById(id);
  const svg = q("rg"); if (!svg) return;
  const R = window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches;
  const mod = (x, m) => ((x % m) + m) % m;
  const ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
  const clamp01 = u => Math.max(0, Math.min(1, u));

  // gears: teeth path + exact meshing phase
  function gearPath(r, n, d) {
    const N = n * 4; let p = "";
    for (let i = 0; i < N; i++) {
      const a = i * 2 * Math.PI / N, rr = (i % 4 === 1 || i % 4 === 2) ? r + d : r;
      p += (i ? "L" : "M") + (rr * Math.cos(a)).toFixed(1) + " " + (rr * Math.sin(a)).toFixed(1);
    }
    return p + "Z";
  }
  q("g1p").setAttribute("d", gearPath(24, 14, 3));
  q("g2p").setAttribute("d", gearPath(14, 8, 3));
  const dB = 2 * Math.PI / 56, dS = 2 * Math.PI / 32, phi = Math.atan2(12, -37);
  const f0 = mod(phi - 1.5 * dB, 4 * dB) / (4 * dB);
  const B0 = (phi + Math.PI - 1.5 * dS - (0.5 - f0) * 4 * dS) * 180 / Math.PI;

  // ramp geometry (ball center sits on the ramp surface)
  const A = [88, 70], B = [218, 138], N = [0.463, -0.886], BR = 6;
  const onRamp = t => [A[0] + t * (B[0] - A[0]) + N[0] * BR, A[1] + t * (B[1] - A[1]) + N[1] * BR];
  const RAMP_LEN = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const T0 = 0.07;

  const S = { lift: 0, liftT: 0, need: 0, needT: 0, a: 0, spin: 0, spinT: 0,
    phase: "idle", tr: 0, result: null, bt: 0, pin: 0, dom: 0, rod: 0, lamp: "off",
    bx: 0, by: 0, br: 0, clock: 0 };
  const placeBall = () => { const p = onRamp(T0); S.bx = p[0]; S.by = p[1]; S.br = 0; };
  placeBall();

  const uid = q("uid"), pwd = q("pwd");
  const syncInputs = () => { S.liftT = clamp01(uid.value.length / 10); S.needT = clamp01(pwd.value.length / 12); };
  syncInputs(); S.lift = S.liftT; S.need = S.needT;

  function reset() {
    S.phase = "idle"; S.result = null; S.tr = 0; S.pin = 0; S.dom = 0; S.rod = 0; S.lamp = "off"; S.spinT = 0;
    placeBall(); syncInputs(); setLamp("off"); q("lamp").style.opacity = 1; kick();
  }

  function setLamp(kind) {
    const lamp = q("lamp"), lt = q("lt");
    S.lamp = kind;
    const fill = { off: "none", wait: "var(--gold)", ok: "var(--teal)", bad: "var(--r,#e5533d)" }[kind];
    lamp.style.fill = fill;
    lamp.style.filter = kind === "off" ? "none" : "drop-shadow(0 0 7px " + (kind === "bad" ? "var(--r,#e5533d)" : kind === "ok" ? "var(--teal)" : "var(--gold)") + ")";
    lt.textContent = kind === "ok" ? "✓" : kind === "bad" ? "✕" : "";
  }

  function step(dt) {
    S.clock += dt;
    const k = R ? 1 : Math.min(1, dt * 8);
    S.lift += (S.liftT - S.lift) * k;
    S.need += (S.needT - S.need) * k;
    S.spin += (S.spinT - S.spin) * Math.min(1, dt * 3);
    S.a += S.spin * dt;

    if (S.phase === "run") {
      S.tr += dt; const t = S.tr;
      S.spinT = 420;
      S.pin = ease(t / 0.2);
      if (t >= 0.2 && t < 1.25) {
        const u = (t - 0.2) / 1.05, tt = T0 + (1 - T0) * u * u, p = onRamp(tt);
        S.bx = p[0]; S.by = p[1]; S.br = ((tt - T0) * RAMP_LEN / BR) * 57.3;
      } else if (t >= 1.25) {
        const e = onRamp(1), v = clamp01((t - 1.25) / 0.25);
        S.bx = e[0] + (225 - e[0]) * v; S.by = e[1] + (144 - e[1]) * v * v; S.br += 6;
      }
      S.dom = t > 1.5 ? 82 * Math.pow(clamp01((t - 1.5) / 0.4), 2) : 0;
      S.rod = t > 1.9 ? 14 * ease((t - 1.9) / 0.35) : 0;
      if (t >= 2.25) { S.phase = "wait"; S.spinT = 110; setLamp("wait"); }
    }
    if (S.phase === "wait") {
      q("lamp").style.opacity = (0.65 + 0.35 * Math.sin(S.clock * 6)).toFixed(2);
      if (S.result === "ok") { S.phase = "done"; S.spinT = 0; q("lamp").style.opacity = 1; setLamp("ok"); }
      if (S.result === "bad") { S.phase = "bad"; S.bt = 0; S.spinT = 0; q("lamp").style.opacity = 1; setLamp("bad"); q("rgbox").classList.add("rgshake"); setTimeout(() => q("rgbox").classList.remove("rgshake"), 450); }
    }
    if (S.phase === "bad") { S.bt += dt; if (S.bt > 1.3) reset(); }
  }

  function draw() {
    const d = S.lift * 40;
    q("w1").setAttribute("transform", "translate(29 " + (100 - d).toFixed(1) + ")");
    q("rl").setAttribute("y2", (100 - d).toFixed(1));
    q("w2").setAttribute("transform", "translate(51 " + (56 + d).toFixed(1) + ")");
    q("rr").setAttribute("y2", (56 + d).toFixed(1));
    q("pul").setAttribute("transform", "translate(40 28) rotate(" + (S.lift * 360).toFixed(1) + ")");
    q("nd").setAttribute("transform", "translate(40 142) rotate(" + (-80 + S.need * 160).toFixed(1) + ")");
    q("g1").setAttribute("transform", "translate(284 40) rotate(" + S.a.toFixed(2) + ")");
    q("g2").setAttribute("transform", "translate(247 52) rotate(" + (B0 - 1.75 * S.a).toFixed(2) + ")");
    q("belt").style.strokeDashoffset = (-S.a * 0.12).toFixed(1);
    q("pin").setAttribute("transform", "translate(0 " + (-S.pin * 20).toFixed(1) + ")");
    q("pin").style.opacity = (1 - 0.6 * S.pin).toFixed(2);
    q("ball").setAttribute("transform", "translate(" + S.bx.toFixed(1) + " " + S.by.toFixed(1) + ") rotate(" + S.br.toFixed(1) + ")");
    q("dom").setAttribute("transform", "rotate(" + S.dom.toFixed(1) + " 236 150)");
    q("rod").setAttribute("transform", "translate(" + S.rod.toFixed(1) + " 0)");
  }

  let raf = 0, last = 0;
  function busy() {
    return S.phase === "run" || S.phase === "wait" || S.phase === "bad" || Math.abs(S.lift - S.liftT) > 0.002 ||
      Math.abs(S.need - S.needT) > 0.002 || Math.abs(S.spin) > 1.5 || Math.abs(S.spinT) > 1;
  }
  function loop(ts) {
    raf = 0; const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    step(dt); draw();
    if (busy()) raf = requestAnimationFrame(loop); else last = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  // typing drives the machine
  uid.addEventListener("input", () => { syncInputs(); S.spin += 240; kick(); });
  pwd.addEventListener("input", () => { syncInputs(); S.spin += 240; kick(); });
  const burst = () => { S.spin += 520; kick(); };
  q("g1").addEventListener("click", burst); q("g2").addEventListener("click", burst);

  // Login button starts the chain (runs next to the real login request, never delays it)
  q("go").addEventListener("click", () => {
    if (!uid.value.trim() || !pwd.value) { q("rgbox").classList.add("rgshake"); setTimeout(() => q("rgbox").classList.remove("rgshake"), 450); return; }
    if (S.phase !== "idle") return;
    S.result = null; S.tr = 0; S.phase = "run"; setLamp("off"); q("lamp").style.opacity = 1;
    if (R) { S.phase = "wait"; setLamp("wait"); }
    kick();
  });

  // result detection: error shown => jam, card hidden => success, card back => reset
  new MutationObserver(() => {
    const e = q("loginErr");
    if (e.style.display === "block" && e.textContent && S.phase !== "idle") { S.result = "bad"; kick(); }
  }).observe(q("loginErr"), { attributes: true, childList: true, characterData: true, subtree: true });
  new MutationObserver(() => {
    if (q("loginCard").style.display === "none") { if (S.phase !== "idle") { S.result = "ok"; kick(); } }
    else if (S.phase === "done" || S.phase === "wait") reset();
  }).observe(q("loginCard"), { attributes: true, attributeFilter: ["style"] });

  setLamp("off"); draw();
})();
