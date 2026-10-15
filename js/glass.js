// Liquid Login button: fills while logging in, empties again on error / logout (real login code untouched)
(function(){
  const q = id => document.getElementById(id), go = q("go"); if (!go) return;
  const jig = () => { go.classList.remove("jig"); void go.offsetWidth; go.classList.add("jig"); };
  go.addEventListener("click", () => { if (q("uid").value.trim() && q("pwd").value) { go.classList.add("on"); jig(); } });
  const lo = q("logout");
  if (lo) lo.addEventListener("click", () => { lo.classList.add("on", "jig"); setTimeout(() => lo.classList.remove("on", "jig"), 700); });
  const ld = q("load");
  if (ld) ld.addEventListener("click", () => { ld.classList.add("on", "jig"); setTimeout(() => ld.classList.remove("on", "jig"), 1100); });
  new MutationObserver(() => { const e = q("loginErr"); if (e.style.display === "block" && e.textContent) { go.classList.remove("on"); jig(); } })
    .observe(q("loginErr"), { attributes: true, childList: true, characterData: true, subtree: true });
  new MutationObserver(() => { if (q("loginCard").style.display !== "none") go.classList.remove("on"); })
    .observe(q("loginCard"), { attributes: true, attributeFilter: ["style"] });
})();
