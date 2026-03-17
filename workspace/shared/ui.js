export function $(id){ return document.getElementById(id); }

export function toast(title, body, kind="info"){
  const host = $("toastHost");
  if(!host) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="t-title">${escapeHtml(title)}</div>
    <div class="t-body">${escapeHtml(body || "")}</div>
  `;

  host.appendChild(el);

  const ttl = (kind === "error" ? 7000 : 4200);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "opacity .25s ease, transform .25s ease";
    setTimeout(() => el.remove(), 260);
  }, ttl);
}

export function setPill(el, text, kind){
  el.textContent = text;
  el.className = "pill " + (kind || "warn");
}

export function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
