// Wholesale Ludhiana admin panel (no framework). Talks to /api/admin/* with the
// session cookie + X-CSRF-Token header. All dynamic text is escaped.
import { rupees } from "./lib/format.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const app = document.getElementById("admin");
let csrf = "";
let view = null; // element the current page renders into
let cats = [];

const UNITS = ["piece", "dozen", "kg", "packet", "box", "metre", "roll", "set", "carton"];
const ORDER_STATUSES = ["pending", "confirmed", "processing", "dispatched", "delivered", "cancelled"];
const PAY_STATUSES = { unpaid: "Not paid", awaiting: "Awaiting confirmation", paid: "Paid", failed: "Failed", refunded: "Refunded" };
const METHODS = { razorpay: "Online (Razorpay)", upi: "UPI", cod: "Cash on delivery", bank: "Bank transfer", confirm: "Pay after confirmation" };
const toR = (p) => (p === null || p === undefined ? "" : String(p / 100));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const when = (utc) => new Date(String(utc).replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ------------------------------------------------------------------ api
async function call(path, { method = "GET", body, raw } = {}) {
  const headers = {};
  if (method !== "GET") headers["X-CSRF-Token"] = csrf;
  if (body && !raw) headers["Content-Type"] = "application/json";
  if (raw) headers["Content-Type"] = raw.type;
  const res = await fetch("/api/admin" + path, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined), credentials: "same-origin" });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && path !== "/login") { renderLogin("Your session has expired. Please sign in again."); throw new Error("Please sign in"); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function flash(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "flash" + (bad ? " bad" : "");
  el.setAttribute("role", bad ? "alert" : "status");
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 2600);
}
async function guard(fn) {
  try { return await fn(); } catch (e) { if (e.message !== "Please sign in") flash(e.message, true); return null; }
}
const formData = (form) => {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.dataset.skip !== undefined) continue;
    o[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  return o;
};
const field = (label, name, value = "", attrs = "", hint = "") =>
  `<label class="f"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
const area = (label, name, value = "", rows = 3, hint = "") =>
  `<label class="f wide"><span>${esc(label)}</span><textarea name="${name}" rows="${rows}">${esc(value)}</textarea>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
const check = (label, name, on) => `<label class="c"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${esc(label)}</label>`;
const select = (label, name, options, value) =>
  `<label class="f"><span>${esc(label)}</span><select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value ?? "") ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const pager = (total, page, per) => {
  const pages = Math.ceil(total / per);
  return pages > 1 ? `<div class="pager"><button class="btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>← Prev</button><span>Page ${page} of ${pages} • ${total} total</span><button class="btn" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Next →</button></div>` : `<p class="muted">${total} total</p>`;
};
const badge = (text, kind = "") => `<span class="tag ${kind}">${esc(text)}</span>`;
const statusBadge = (s) => badge(cap(s), { pending: "warn", confirmed: "info", processing: "info", dispatched: "info", delivered: "ok", cancelled: "bad" }[s] || "");
const payBadge = (s) => badge(PAY_STATUSES[s] || s, { paid: "ok", awaiting: "warn", failed: "bad", refunded: "bad" }[s] || "");

// ------------------------------------------------------------------ login
function renderLogin(message = "") {
  app.innerHTML = `<div class="login-wrap"><form class="login card" data-login>
    <div class="brand"><strong>Wholesale Ludhiana</strong><span>Admin</span></div>
    <h1>Sign in</h1>
    ${message ? `<p class="err">${esc(message)}</p>` : ""}
    <label class="f"><span>Username</span><input name="username" autocomplete="username" required value="admin"></label>
    <label class="f"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">Sign in</button>
    <p class="err" data-err hidden></p>
    <a class="back" href="/">← Back to website</a>
  </form></div>`;
  const form = app.querySelector("[data-login]");
  form.password.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector("[data-err]");
    err.hidden = true;
    try {
      const res = await call("/login", { method: "POST", body: { username: form.username.value, password: form.password.value } });
      csrf = res.csrf;
      renderShell();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// ------------------------------------------------------------------ shell
const NAV = [
  ["dashboard", "Dashboard"], ["orders", "Orders"], ["products", "Products"], ["categories", "Categories"], ["bulk", "Langar & Bulk prices"],
  ["customers", "Customers"], ["coupons", "Coupons"], ["banners", "Banners & offers"], ["testimonials", "Testimonials"], ["enquiries", "Enquiries"],
  ["reports", "Sales reports"], ["settings", "Settings"],
];
const PAGES = {};

function renderShell() {
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><strong>Wholesale Ludhiana</strong><span>Admin</span></div>
    <button class="btn menu-btn" type="button" data-menu>Menu</button>
    <nav>${NAV.map(([id, name]) => `<a href="#${id}" data-nav="${id}">${name}</a>`).join("")}</nav>
    <div class="side-foot"><a href="/" target="_blank" rel="noopener">View website ↗</a><button class="btn" type="button" data-logout>Sign out</button></div>
  </aside><main class="main" data-view></main></div>`;
  view = app.querySelector("[data-view]");
  app.querySelector("[data-logout]").addEventListener("click", async () => { await guard(() => call("/logout", { method: "POST" })); csrf = ""; renderLogin(); });
  app.querySelector("[data-menu]").addEventListener("click", () => app.querySelector(".side").classList.toggle("open"));
  route();
}

async function route() {
  if (!view) return;
  const [id, arg] = (location.hash.slice(1) || "dashboard").split("/");
  const page = PAGES[id] || PAGES.dashboard;
  app.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (PAGES[id] ? id.replace(/^(product|order|customer)$/, "$1s") : "dashboard")));
  app.querySelector(".side").classList.remove("open");
  // A fresh container per page, so one page's click handlers never fire on another.
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);
  view = fresh;
  view.innerHTML = `<p class="admin-loading">Loading…</p>`;
  await guard(() => page(arg ? decodeURIComponent(arg) : ""));
}
window.addEventListener("hashchange", route);

async function loadCats(force = false) {
  if (!cats.length || force) cats = (await call("/categories")).categories;
  return cats;
}
const mainCats = () => cats.filter((c) => !c.parent);
const subCats = (parent) => cats.filter((c) => c.parent === parent);

// ------------------------------------------------------------------ dashboard
PAGES.dashboard = async () => {
  const d = await call("/dashboard");
  const s = d.by_status;
  view.innerHTML = `<h1>Dashboard</h1>
    ${!d.payments_configured ? `<p class="note warn">Online payment is not connected yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Cloudflare, then press “Check Razorpay” in Settings → Payments. COD, bank transfer and WhatsApp orders work without it.</p>` : !d.webhook_configured ? `<p class="note">Tip: add RAZORPAY_WEBHOOK_SECRET so payments are still recorded if a customer closes the page right after paying.</p>` : ""}
    ${d.counts.unpriced ? `<p class="note">${d.counts.unpriced} products show “Price on request”. Set their prices in <a href="#products">Products</a> to let customers order them online.</p>` : ""}
    <div class="stats">
      <div class="stat"><span>Today's revenue</span><strong>${rupees(d.today.revenue) || "₹0"}</strong><small>${d.today.orders} orders</small></div>
      <div class="stat"><span>This month</span><strong>${rupees(d.month.revenue) || "₹0"}</strong><small>${d.month.orders} orders</small></div>
      <div class="stat"><span>Pending orders</span><strong>${s.pending || 0}</strong><small><a href="#orders/pending">View</a></small></div>
      <div class="stat"><span>Customers</span><strong>${d.counts.customers}</strong><small>${d.counts.products} products</small></div>
    </div>
    <div class="chips">${ORDER_STATUSES.map((x) => `<a class="chip" href="#orders/${x}">${cap(x)} <b>${s[x] || 0}</b></a>`).join("")}${d.new_enquiries ? `<a class="chip" href="#enquiries">New enquiries <b>${d.new_enquiries}</b></a>` : ""}</div>
    <div class="grid2">
      <section class="card"><h2>Recent orders</h2>${d.recent.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>
        ${d.recent.map((o) => `<tr><td><a href="#order/${o.id}">${esc(o.ref)}</a><br><small>${when(o.created_at)}</small></td><td>${esc(o.customer_name)}</td><td>${statusBadge(o.status)} ${payBadge(o.payment_status)}</td><td class="num">${rupees(o.total_paise)}</td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">No orders yet.</p>`}</section>
      <section class="card"><h2>Low-stock alerts</h2>${d.low_stock.length ? `<table><tbody>${d.low_stock.map((p) => `<tr><td><a href="#product/${p.id}">${esc(p.name)}</a></td><td class="num">${badge(p.stock + " " + p.unit + " left", p.stock ? "warn" : "bad")}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No tracked product is running low.</p>`}
        <h2>Best-selling products</h2>${d.best_sellers.length ? `<table><tbody>${d.best_sellers.map((p) => `<tr><td><a href="#product/${p.id}">${esc(p.name)}</a></td><td class="num">${p.sold} ${esc(p.unit)} sold</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Sales will appear here.</p>`}</section>
    </div>`;
};

// ------------------------------------------------------------------ products
const pstate = { q: "", category: "", flag: "", low: false, page: 1 };
PAGES.products = async () => {
  await loadCats();
  const p = new URLSearchParams({ q: pstate.q, category: pstate.category, flag: pstate.flag, low: pstate.low ? "1" : "", page: pstate.page, per: 40 });
  const d = await call("/products?" + p);
  view.innerHTML = `<div class="head"><h1>Products</h1><div class="actions">
      <a class="btn" href="/api/admin/products/export">Export CSV</a>
      <label class="btn">Import CSV<input type="file" accept=".csv,text/csv" hidden data-import></label>
      <a class="btn primary" href="#product/new">+ Add product</a></div></div>
    <form class="filters" data-filters>
      <input name="q" type="search" placeholder="Search name, brand or SKU" value="${esc(pstate.q)}">
      <select name="category"><option value="">All categories</option>${mainCats().map((c) => `<option value="${c.slug}" ${pstate.category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <select name="flag"><option value="">Any</option>${[["featured", "Best sellers"], ["deal", "Deals"], ["new", "New arrivals"], ["seasonal", "Seasonal"], ["bulk", "Bulk calculator"]].map(([v, t]) => `<option value="${v}" ${pstate.flag === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label class="c"><input type="checkbox" name="low" ${pstate.low ? "checked" : ""}> Low stock</label>
      <button class="btn">Filter</button>
    </form>
    <p class="muted">Tip: type a new price or stock and press Enter to save it straight from this list. Import: export the CSV first to get the right columns, edit it in Excel, save as CSV and import. Rows with an existing “slug” are updated; others are added.</p>
    <div class="table-wrap"><table><thead><tr><th></th><th>Product</th><th>Category</th><th>Price (₹)</th><th>Stock</th><th>Shown</th><th></th></tr></thead><tbody>
    ${d.products.map((x) => `<tr data-id="${x.id}">
      <td>${x.image ? `<img class="thumb" src="${esc(x.image)}" alt="" loading="lazy">` : `<span class="thumb"></span>`}</td>
      <td><a href="#product/${x.id}"><strong>${esc(x.name)}</strong></a><br><small>${esc(x.brand)} ${x.sku ? "• " + esc(x.sku) : ""} • min ${x.moq} ${esc(x.unit)}${x.tiers.length ? " • " + x.tiers.length + " slabs" : ""}${x.variants.length ? " • " + x.variants.length + " variations" : ""}</small></td>
      <td>${esc(x.category_name)}<br><small>${esc(x.subcategory_name || "")}</small></td>
      <td><input class="mini" data-quick="price" value="${toR(x.price_paise)}" placeholder="on request" inputmode="decimal" aria-label="Price of ${esc(x.name)}"></td>
      <td>${x.track_stock ? `<input class="mini" data-quick="stock" value="${x.stock}" inputmode="numeric" aria-label="Stock of ${esc(x.name)}">${x.stock <= x.low_stock ? " " + badge("low", "warn") : ""}` : `<small>not tracked</small>`}</td>
      <td><input type="checkbox" data-quick="active" ${x.active ? "checked" : ""} aria-label="Show ${esc(x.name)} on website"></td>
      <td class="num"><a class="btn sm" href="#product/${x.id}">Edit</a> <button class="btn sm danger" data-del>Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="7" class="muted">No products found.</td></tr>`}
    </tbody></table></div>${pager(d.total, d.page, d.per)}`;
  view.querySelector("[data-filters]").addEventListener("submit", (e) => { e.preventDefault(); Object.assign(pstate, formData(e.target), { page: 1 }); route(); });
  view.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { pstate.page = Number(b.dataset.page); route(); }));
  view.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-quick]");
    if (!el) return;
    const id = el.closest("tr").dataset.id;
    const ok = await guard(() => call("/products/" + id, { method: "PATCH", body: { [el.dataset.quick]: el.type === "checkbox" ? el.checked : el.value.trim() } }));
    if (ok) flash("Saved");
  });
  view.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (!del) return;
    const tr = del.closest("tr");
    if (!confirm("Delete “" + tr.querySelector("strong").textContent + "”? This cannot be undone.")) return;
    if (await guard(() => call("/products/" + tr.dataset.id, { method: "DELETE" }))) { flash("Product deleted"); route(); }
  });
  view.querySelector("[data-import]").addEventListener("change", (e) => importCsv(e.target.files[0]));
};

// Small CSV parser (handles quotes, commas and line breaks inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

async function importCsv(file) {
  if (!file) return;
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return flash("That file has no product rows", true);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("name") || !header.includes("category")) return flash("The file needs at least “name” and “category” columns. Export the CSV first to see the format.", true);
  const objs = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "")])));
  if (!confirm("Import " + objs.length + " product rows?")) return;
  let created = 0, updated = 0;
  for (let i = 0; i < objs.length; i += 100) {
    let res;
    try { res = await call("/products/import", { method: "POST", body: { rows: objs.slice(i, i + 100) } }); }
    catch (e) { flash((i ? "Rows 1–" + i + " were imported. Then: " : "") + e.message.replace(/Row (\d+)/, (_, n) => "Row " + (Number(n) + i)), true); return route(); }
    created += res.created; updated += res.updated;
  }
  flash("Import finished: " + created + " added, " + updated + " updated");
  route();
}

// Resize a photo in the browser, then upload it.
async function uploadPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  return (await call("/media", { method: "POST", raw: blob })).url;
}

// Repeating rows editor (slabs, variations, specifications, photos).
function rowsEditor(box, cols, rows, addLabel) {
  const line = (r = {}) => `<div class="rrow">${cols.map((c) => c.type === "check"
    ? `<label class="c"><input type="checkbox" data-k="${c.k}" ${r[c.k] === false ? "" : "checked"}> ${c.label}</label>`
    : `<input data-k="${c.k}" placeholder="${esc(c.label)}" value="${esc(r[c.k] ?? "")}" ${c.attrs || ""} aria-label="${esc(c.label)}">`).join("")}<button type="button" class="btn sm danger" data-rm aria-label="Remove row">✕</button></div>`;
  box.innerHTML = `<div data-rows>${rows.map(line).join("")}</div><button type="button" class="btn sm" data-add>+ ${addLabel}</button>`;
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-rm]")) e.target.closest(".rrow").remove();
    if (e.target.closest("[data-add]")) box.querySelector("[data-rows]").insertAdjacentHTML("beforeend", line());
  });
  return () => [...box.querySelectorAll(".rrow")].map((el) => Object.fromEntries([...el.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.type === "checkbox" ? i.checked : i.value.trim()])))
    .filter((r) => Object.entries(r).some(([, v]) => typeof v === "string" && v !== ""));
}

PAGES.product = async (id) => {
  await loadCats();
  const isNew = id === "new";
  const p = isNew ? { unit: "piece", moq: 1, active: true, tiers: [], variants: [], specs: [], gallery: [], low_stock: 10, category: mainCats()[0]?.slug } : (await call("/products/" + id)).product;
  view.innerHTML = `<div class="head"><h1>${isNew ? "Add product" : "Edit product"}</h1><div class="actions">${isNew ? "" : `<a class="btn" href="/product/${esc(p.slug)}" target="_blank" rel="noopener">View on website ↗</a>`}<a class="btn" href="#products">← Back</a></div></div>
  <form class="card form" data-product>
    <h2>Basics</h2><div class="fgrid">
      ${field("Product name *", "name", p.name, "required maxlength=160")}
      ${select("Category *", "category", mainCats().map((c) => [c.slug, c.name]), p.category)}
      <label class="f"><span>Subcategory</span><select name="subcategory"></select></label>
      ${field("Brand", "brand", p.brand, "maxlength=80")}
      ${field("SKU / item code", "sku", p.sku, "maxlength=60")}
      ${area("Description", "description", p.description, 4)}
    </div>
    <h2>Wholesale price</h2><div class="fgrid">
      ${field("Wholesale price (₹ per unit)", "price", toR(p.price_paise), 'inputmode="decimal"', "Leave empty for “Price on request”.")}
      ${field("MRP (₹, optional)", "mrp", toR(p.mrp_paise), 'inputmode="decimal"')}
      ${select("Sold by (unit)", "unit", UNITS.map((u) => [u, u]), p.unit)}
      ${field("Minimum order quantity", "moq", p.moq, 'inputmode="numeric"')}
      ${field("GST rate %", "gst_rate", p.gst_rate ?? "", 'inputmode="decimal"', "Leave empty to use the store default.")}
    </div>
    <h3>Quantity-based price slabs</h3><p class="muted">Example: from 11 units → ₹90, from 51 units → ₹80. Below the first slab the wholesale price above applies.</p>
    <div data-tiers></div>
    <h2>Stock</h2><div class="fgrid">
      ${check("Track stock for this product", "track_stock", p.track_stock)}
      ${field("Stock in hand", "stock", p.stock ?? 0, 'inputmode="numeric"')}
      ${field("Low-stock alert at", "low_stock", p.low_stock ?? 10, 'inputmode="numeric"')}
    </div>
    <h2>Photos</h2><p class="muted">The first photo is the main photo. Upload from your phone or computer, or paste a photo link.</p>
    <div data-photos></div><label class="btn sm">Upload photos<input type="file" accept="image/*" multiple hidden data-upload></label>
    <h2>Variations <small>(sizes, colours, shades)</small></h2><p class="muted">Give a variation its own price only if it differs from the wholesale price; quantity slabs do not apply to a variation with its own price.</p>
    <div data-variants></div>
    <h2>Specifications</h2><div data-specs></div>
    <h2>Where it appears</h2><div class="checks">
      ${check("Show on website", "active", p.active)}${check("Best seller", "featured", p.featured)}${check("Wholesale deal", "deal", p.deal)}${check("New arrival", "is_new", p.is_new)}${check("Seasonal collection", "seasonal", p.seasonal)}${check("Langar & Bhandara calculator", "bulk", p.bulk)}
    </div>
    <h2>Search engines <small>(optional)</small></h2><div class="fgrid">
      ${field("SEO title", "seo_title", p.seo_title, "maxlength=160")}${field("Web address (slug)", "slug", p.slug, "maxlength=80", "Leave empty to create it from the name.")}
      ${area("SEO description", "seo_description", p.seo_description, 2)}
    </div>
    <div class="actions sticky"><button class="btn primary" type="submit">${isNew ? "Add product" : "Save changes"}</button>${isNew ? "" : `<button type="button" class="btn danger" data-del>Delete product</button>`}</div>
  </form>`;
  const form = view.querySelector("[data-product]");
  const fillSubs = () => { form.subcategory.innerHTML = `<option value="">— None —</option>` + subCats(form.category.value).map((c) => `<option value="${c.slug}" ${p.subcategory === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join(""); };
  fillSubs();
  form.category.addEventListener("change", fillSubs);
  const tiers = rowsEditor(view.querySelector("[data-tiers]"), [{ k: "min", label: "From quantity", attrs: 'inputmode="numeric"' }, { k: "price", label: "Price per unit (₹)", attrs: 'inputmode="decimal"' }], p.tiers.map((t) => ({ min: t.min, price: toR(t.price_paise) })), "Add slab");
  const variants = rowsEditor(view.querySelector("[data-variants]"), [{ k: "label", label: "Variation name (e.g. Red / XL)" }, { k: "price", label: "Own price ₹ (optional)", attrs: 'inputmode="decimal"' }, { k: "available", label: "In stock", type: "check" }], p.variants.map((v) => ({ label: v.label, price: toR(v.price_paise), available: v.available !== false })), "Add variation");
  const specs = rowsEditor(view.querySelector("[data-specs]"), [{ k: "k", label: "Name (e.g. Weight)" }, { k: "v", label: "Value (e.g. 400 g)" }], p.specs, "Add specification");
  const photoBox = view.querySelector("[data-photos]");
  const photos = rowsEditor(photoBox, [{ k: "url", label: "Photo link (https://…)" }], [p.image, ...p.gallery].filter(Boolean).map((url) => ({ url })), "Add photo link");
  view.querySelector("[data-upload]").addEventListener("change", async (e) => {
    for (const f of e.target.files) {
      const url = await guard(() => uploadPhoto(f));
      if (url) { photoBox.querySelector("[data-add]").click(); const inputs = photoBox.querySelectorAll("input[data-k=url]"); inputs[inputs.length - 1].value = url; flash("Photo uploaded"); }
    }
    e.target.value = "";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urls = photos().map((x) => x.url);
    const body = { ...formData(form), tiers: tiers(), variants: variants().filter((v) => v.label), specs: specs().filter((s) => s.k && s.v), image: urls[0] || "", gallery: urls.slice(1) };
    for (const el of form.querySelectorAll(".rrow input")) delete body[el.name];
    const res = await guard(() => call(isNew ? "/products" : "/products/" + id, { method: isNew ? "POST" : "PUT", body }));
    if (res) { flash(isNew ? "Product added" : "Product saved"); if (isNew) location.hash = "#product/" + res.id; }
  });
  form.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    if (await guard(() => call("/products/" + id, { method: "DELETE" }))) { flash("Product deleted"); location.hash = "#products"; }
  });
};

// ------------------------------------------------------------------ bulk (Langar & Bhandara) prices
PAGES.bulk = async () => {
  const d = await call("/products?flag=bulk&per=200&sort=name");
  view.innerHTML = `<h1>Langar &amp; Bhandara calculator prices</h1>
    <p class="muted">These products appear in the bulk order calculator. Change a price, minimum quantity or slabs and press Save. To add another product to the calculator, edit it and tick “Langar &amp; Bhandara calculator”. The delivery charge for bulk orders is in Settings → Delivery.</p>
    <div class="table-wrap"><table><thead><tr><th>Product</th><th>Price (₹)</th><th>Unit</th><th>Min. qty</th><th>Slabs (from qty : ₹ price, separated by commas)</th><th></th></tr></thead><tbody>
    ${d.products.map((p) => `<tr data-id="${p.id}"><td><a href="#product/${p.id}"><strong>${esc(p.name)}</strong></a>${p.variants.length ? "<br><small>has variations — not shown in calculator</small>" : ""}</td>
      <td><input class="mini" data-k="price" value="${toR(p.price_paise)}" inputmode="decimal" aria-label="Price of ${esc(p.name)}"></td><td>${esc(p.unit)}</td>
      <td><input class="mini" data-k="moq" value="${p.moq}" inputmode="numeric" aria-label="Minimum quantity of ${esc(p.name)}"></td>
      <td><input data-k="tiers" value="${esc(p.tiers.map((t) => t.min + ":" + toR(t.price_paise)).join(", "))}" placeholder="200:7.5, 500:7" aria-label="Slabs of ${esc(p.name)}"></td>
      <td><button class="btn sm primary" data-save>Save</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No bulk products yet.</td></tr>`}
    </tbody></table></div>`;
  view.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-save]");
    if (!b) return;
    const tr = b.closest("tr");
    const v = Object.fromEntries([...tr.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.value.trim()]));
    const tiers = v.tiers ? v.tiers.split(",").map((x) => { const [min, price] = x.split(":").map((y) => y.trim()); return { min: Number(min), price }; }) : [];
    if (await guard(() => call("/products/" + tr.dataset.id, { method: "PATCH", body: { price: v.price, moq: v.moq, tiers } }))) flash("Saved");
  });
};

// ------------------------------------------------------------------ categories
PAGES.categories = async () => {
  await loadCats(true);
  const row = (c, sub) => `<tr data-slug="${c.slug}" class="${sub ? "sub" : ""}"><td>${sub ? "↳ " : ""}<input data-k="name" value="${esc(c.name)}" aria-label="Name"></td>
    <td><input class="mini" data-k="sort" value="${c.sort}" inputmode="numeric" aria-label="Order"></td><td><input type="checkbox" data-k="active" ${c.active ? "checked" : ""} aria-label="Shown"></td>
    <td>${c.products}</td><td class="num"><button class="btn sm" data-more>Details</button> <button class="btn sm primary" data-save>Save</button> <button class="btn sm danger" data-del>Delete</button></td></tr>
    <tr class="more" hidden><td colspan="5"><div class="fgrid">
      <label class="f wide"><span>Description (shown on the category page)</span><textarea data-k="description" rows="2">${esc(c.description)}</textarea></label>
      <label class="f"><span>Image link</span><input data-k="image" value="${esc(c.image)}"></label>
      <label class="f"><span>SEO title</span><input data-k="seo_title" value="${esc(c.seo_title)}"></label>
      <label class="f wide"><span>SEO description</span><input data-k="seo_description" value="${esc(c.seo_description)}"></label></div></td></tr>`;
  view.innerHTML = `<h1>Categories</h1>
    <form class="card form inline" data-new><h2>Add a category</h2><div class="fgrid">
      ${field("Name *", "name", "", "required maxlength=80")}
      ${select("Inside (leave empty for a main category)", "parent", [["", "— Main category —"], ...mainCats().map((c) => [c.slug, c.name])], "")}
      <div class="f"><span>&nbsp;</span><button class="btn primary">Add category</button></div></div></form>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Order</th><th>Shown</th><th>Products</th><th></th></tr></thead><tbody>
    ${mainCats().map((c) => row(c, false) + subCats(c.slug).map((s) => row(s, true)).join("")).join("")}</tbody></table></div>`;
  view.querySelector("[data-new]").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await guard(() => call("/categories", { method: "POST", body: formData(e.target) }))) { flash("Category added"); route(); }
  });
  view.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-slug]");
    if (!tr) return;
    if (e.target.closest("[data-more]")) tr.nextElementSibling.hidden = !tr.nextElementSibling.hidden;
    if (e.target.closest("[data-save]")) {
      const body = Object.fromEntries([...tr.querySelectorAll("[data-k]"), ...tr.nextElementSibling.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.type === "checkbox" ? i.checked : i.value.trim()]));
      if (await guard(() => call("/categories/" + tr.dataset.slug, { method: "PUT", body }))) { flash("Category saved"); cats = []; }
    }
    if (e.target.closest("[data-del]")) {
      if (!confirm("Delete this category" + (tr.classList.contains("sub") ? "" : " and its subcategories") + "?")) return;
      if (await guard(() => call("/categories/" + tr.dataset.slug, { method: "DELETE" }))) { flash("Category deleted"); route(); }
    }
  });
};

// ------------------------------------------------------------------ orders
const ostate = { q: "", page: 1, abandoned: false };
PAGES.orders = async (status) => {
  const st = ORDER_STATUSES.includes(status) ? status : "";
  const d = await call("/orders?" + new URLSearchParams({ status: st, q: ostate.q, page: ostate.page, abandoned: ostate.abandoned ? "1" : "" }));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  view.innerHTML = `<div class="head"><h1>Orders</h1><form class="actions" data-export>
      <input type="date" name="from" value="${monthStart}" aria-label="From date"><input type="date" name="to" value="${today}" aria-label="To date"><button class="btn">Download report (CSV)</button></form></div>
    <div class="chips"><a class="chip ${st ? "" : "on"}" href="#orders">All</a>${ORDER_STATUSES.map((x) => `<a class="chip ${st === x ? "on" : ""}" href="#orders/${x}">${cap(x)}</a>`).join("")}</div>
    <form class="filters" data-filters><input name="q" type="search" placeholder="Search order no., name, phone or shop" value="${esc(ostate.q)}">
      <label class="c"><input type="checkbox" name="abandoned" ${ostate.abandoned ? "checked" : ""}> Include unfinished online payments</label><button class="btn">Search</button></form>
    <div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th class="num">Total</th><th></th></tr></thead><tbody>
    ${d.orders.map((o) => `<tr><td><a href="#order/${o.id}"><strong>${esc(o.ref)}</strong></a>${o.kind === "bulk" ? " " + badge("Bulk", "info") : ""}<br><small>${when(o.created_at)}</small></td>
      <td>${esc(o.customer_name)}${o.business ? "<br><small>" + esc(o.business) + "</small>" : ""}<br><small>${esc(o.phone)} • ${esc(o.city)}</small></td>
      <td>${esc(METHODS[o.payment_method] || o.payment_method)}<br>${payBadge(o.payment_status)}</td><td>${statusBadge(o.status)}</td><td class="num">${rupees(o.total_paise)}</td>
      <td class="num"><a class="btn sm" href="#order/${o.id}">Open</a></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No orders here yet.</td></tr>`}
    </tbody></table></div>${pager(d.total, d.page, d.per)}`;
  view.querySelector("[data-filters]").addEventListener("submit", (e) => { e.preventDefault(); Object.assign(ostate, formData(e.target), { page: 1 }); route(); });
  view.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { ostate.page = Number(b.dataset.page); route(); }));
  view.querySelector("[data-export]").addEventListener("submit", (e) => { e.preventDefault(); location.href = "/api/admin/orders/export?" + new URLSearchParams(formData(e.target)); });
};

PAGES.order = async (id) => {
  const { order: o } = await call("/orders/" + id);
  const bill = o.billing && o.billing.address ? o.billing : null;
  const wa = "https://wa.me/91" + o.phone.replace(/\D/g, "").slice(-10) + "?text=" + encodeURIComponent("Hello " + o.customer_name + ", this is Wholesale Ludhiana about your order " + o.ref + ".");
  view.innerHTML = `<div class="head"><h1>Order ${esc(o.ref)}</h1><div class="actions"><a class="btn" href="/admin/invoice/${o.id}" target="_blank" rel="noopener">Print invoice</a><a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp customer</a><a class="btn" href="#orders">← Back</a></div></div>
    <div class="grid2">
      <section class="card"><h2>Items</h2><table><thead><tr><th>Item</th><th>Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
        ${o.items.map((l) => `<tr><td>${esc(l.name)}${l.variant_label ? " — " + esc(l.variant_label) : ""}${l.sku ? "<br><small>SKU " + esc(l.sku) + "</small>" : ""}</td><td>${l.qty} ${esc(l.unit)}</td><td class="num">${rupees(l.unit_paise)}</td><td class="num">${rupees(l.line_paise)}</td></tr>`).join("")}
        </tbody><tfoot><tr><th colspan="3">Subtotal</th><td class="num">${rupees(o.subtotal_paise)}</td></tr>
        ${o.discount_paise ? `<tr><th colspan="3">Coupon ${esc(o.coupon)}</th><td class="num">− ${rupees(o.discount_paise)}</td></tr>` : ""}
        <tr><th colspan="3">GST${o.gst_inclusive ? " (included)" : ""}</th><td class="num">${rupees(o.gst_paise) || "₹0"}</td></tr>
        <tr><th colspan="3">Delivery</th><td class="num">${rupees(o.shipping_paise) || "₹0"}</td></tr>
        <tr class="grand"><th colspan="3">Total</th><td class="num">${rupees(o.total_paise)}</td></tr></tfoot></table>
        ${o.notes ? `<p><strong>Customer note:</strong> ${esc(o.notes)}</p>` : ""}
        ${o.event && o.event.name ? `<p><strong>Event:</strong> ${esc(o.event.name)} on ${esc(o.event.date)}${o.event.people ? " • " + o.event.people + " people" : ""}</p>` : ""}</section>
      <section class="card"><h2>Customer</h2>
        <p><strong>${esc(o.customer_name)}</strong>${o.business ? " — " + esc(o.business) : ""}<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${o.email ? " • " + esc(o.email) : ""}${o.gstin ? "<br>GSTIN: " + esc(o.gstin) : ""}<br><a href="#customer/${encodeURIComponent(o.phone)}">All orders from this customer</a></p>
        <p><strong>Ship to:</strong><br>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pincode)}</p>
        ${bill ? `<p><strong>Bill to:</strong><br>${esc(bill.address)}<br>${esc(bill.city)}, ${esc(bill.state)} ${esc(bill.pincode)}</p>` : `<p class="muted">Billing address same as shipping.</p>`}
        <h2>Status</h2><form class="form" data-status><div class="fgrid">
          ${select("Order status", "status", ORDER_STATUSES.map((s) => [s, cap(s)]), o.status)}
          ${select("Payment status", "payment_status", Object.entries(PAY_STATUSES), o.payment_status)}
          ${area("Private note", "admin_note", o.admin_note, 2)}</div>
          <p class="muted">Payment: ${esc(METHODS[o.payment_method] || o.payment_method)}${o.razorpay_payment_id ? " • Razorpay " + esc(o.razorpay_payment_id) : ""}${o.failure_reason ? " • " + esc(o.failure_reason) : ""}. Online payments are marked paid automatically by Razorpay; mark bank / UPI / COD orders paid here once the money arrives. Cancelling an order puts its stock back.</p>
          <button class="btn primary">Update order</button></form></section>
    </div>`;
  view.querySelector("[data-status]").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await guard(() => call("/orders/" + id, { method: "PATCH", body: formData(e.target) }))) { flash("Order updated"); route(); }
  });
};

// ------------------------------------------------------------------ customers
const cstate = { q: "", page: 1 };
PAGES.customers = async () => {
  const d = await call("/customers?" + new URLSearchParams(cstate));
  view.innerHTML = `<h1>Customers</h1><form class="filters" data-filters><input name="q" type="search" placeholder="Search name, phone or shop" value="${esc(cstate.q)}"><button class="btn">Search</button></form>
    <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>City</th><th>Orders</th><th class="num">Total bought</th><th>Last order</th></tr></thead><tbody>
    ${d.customers.map((c) => `<tr><td><a href="#customer/${encodeURIComponent(c.phone)}"><strong>${esc(c.name)}</strong></a>${c.business ? "<br><small>" + esc(c.business) + "</small>" : ""}</td><td>${esc(c.phone)}${c.email ? "<br><small>" + esc(c.email) + "</small>" : ""}</td><td>${esc(c.city)}</td><td>${c.orders}</td><td class="num">${rupees(c.spent) || "₹0"}</td><td>${when(c.last_order)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Customers appear here after their first order.</td></tr>`}
    </tbody></table></div>${pager(d.total, d.page, d.per)}`;
  view.querySelector("[data-filters]").addEventListener("submit", (e) => { e.preventDefault(); Object.assign(cstate, formData(e.target), { page: 1 }); route(); });
  view.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { cstate.page = Number(b.dataset.page); route(); }));
};
PAGES.customer = async (phone) => {
  const d = await call("/customer?phone=" + encodeURIComponent(phone));
  const c = d.customer;
  const addr = (a) => (a && a.address ? `${esc(a.address)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}` : "Same as shipping");
  view.innerHTML = `<div class="head"><h1>${esc(c.name)}</h1><a class="btn" href="#customers">← Back</a></div>
    <div class="grid2"><section class="card"><h2>Contact</h2><p>${esc(c.phone)}${c.email ? " • " + esc(c.email) : ""}${c.business ? "<br>" + esc(c.business) : ""}${c.gstin ? "<br>GSTIN: " + esc(c.gstin) : ""}</p>
      <h2>Shipping address</h2><p>${addr(c.shipping)}</p><h2>Billing address</h2><p>${addr(c.billing)}</p></section>
    <section class="card"><h2>Order history</h2><table><tbody>${d.orders.map((o) => `<tr><td><a href="#order/${o.id}">${esc(o.ref)}</a><br><small>${when(o.created_at)}</small></td><td>${statusBadge(o.status)} ${payBadge(o.payment_status)}</td><td class="num">${rupees(o.total_paise)}</td></tr>`).join("")}</tbody></table></section></div>`;
};

// ------------------------------------------------------------------ simple lists: coupons, banners, testimonials
function listPage({ id, title, intro, fields, summary, blank }) {
  PAGES[id] = async () => {
    const { rows } = await call("/" + id);
    const formHtml = (r) => `<form class="card form" data-row="${r.id || ""}"><div class="fgrid">${fields(r)}</div>
      <div class="actions"><button class="btn primary">${r.id ? "Save" : "Add"}</button>${r.id ? `<button type="button" class="btn danger" data-del>Delete</button>` : ""}</div></form>`;
    view.innerHTML = `<h1>${title}</h1><p class="muted">${intro}</p><h2>Add new</h2>${formHtml(blank)}<h2>Existing</h2>
      ${rows.map((r) => `<details class="item"><summary>${summary(r)}</summary>${formHtml(r)}</details>`).join("") || `<p class="muted">Nothing here yet.</p>`}`;
    view.addEventListener("submit", async (e) => {
      const f = e.target.closest("[data-row]");
      if (!f) return;
      e.preventDefault();
      const rid = f.dataset.row;
      if (await guard(() => call("/" + id + (rid ? "/" + rid : ""), { method: rid ? "PUT" : "POST", body: formData(f) }))) { flash("Saved"); route(); }
    });
    view.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-del]");
      if (!b || !confirm("Delete this?")) return;
      if (await guard(() => call("/" + id + "/" + b.closest("[data-row]").dataset.row, { method: "DELETE" }))) { flash("Deleted"); route(); }
    });
    view.querySelectorAll("[data-upload-into]").forEach((inp) => inp.addEventListener("change", async () => {
      const url = await guard(() => uploadPhoto(inp.files[0]));
      if (url) { inp.closest("form").elements.image.value = url; flash("Photo uploaded — press Save"); }
    }));
  };
}
listPage({
  id: "coupons", title: "Coupons", intro: "Discount codes customers can type in the cart or at checkout.", blank: { type: "percent", active: 1 },
  summary: (r) => `<strong>${esc(r.code)}</strong> — ${r.type === "percent" ? r.value + "% off" : rupees(r.value) + " off"}${r.min_paise ? " above " + rupees(r.min_paise) : ""} • used ${r.used}${r.usage_limit ? "/" + r.usage_limit : ""} ${r.active ? "" : badge("off", "bad")}`,
  fields: (r) => field("Code *", "code", r.code, "required maxlength=30") + select("Type", "type", [["percent", "Percent off"], ["flat", "Flat ₹ off"]], r.type) +
    field("Value (% or ₹) *", "value", r.type === "flat" ? toR(r.value) : r.value ?? "", 'required inputmode="decimal"') + field("Minimum order ₹", "min", toR(r.min_paise || null), 'inputmode="decimal"') +
    field("Maximum discount ₹ (percent only)", "max", toR(r.max_paise), 'inputmode="decimal"') + field("Usage limit", "usage_limit", r.usage_limit ?? "", 'inputmode="numeric"', "Empty = unlimited") +
    field("Expires on", "expires", r.expires, 'type="date"') + field("Note", "description", r.description, "maxlength=200") + check("Active", "active", r.active),
});
listPage({
  id: "banners", title: "Banners & offers", intro: "“Homepage banner” replaces the main heading at the top of the homepage (the first active one is used). “Offer” cards appear below Best Sellers.", blank: { placement: "offer", active: 1, sort: 0 },
  summary: (r) => `${badge(r.placement === "hero" ? "Homepage banner" : "Offer", "info")} <strong>${esc(r.title)}</strong> ${r.active ? "" : badge("off", "bad")}`,
  fields: (r) => select("Type", "placement", [["hero", "Homepage banner"], ["offer", "Offer card"]], r.placement) + field("Title *", "title", r.title, "required maxlength=140") + field("Subtitle", "subtitle", r.subtitle, "maxlength=300") +
    `<label class="f"><span>Image link</span><input name="image" value="${esc(r.image)}"><small><label class="btn sm">Upload image<input type="file" accept="image/*" hidden data-skip data-upload-into></label></small></label>` +
    field("Button text", "cta_label", r.cta_label, "maxlength=40") + field("Button link", "cta_url", r.cta_url, 'placeholder="/shop?show=deal"') + field("Order", "sort", r.sort ?? 0, 'inputmode="numeric"') + check("Active", "active", r.active),
});
listPage({
  id: "testimonials", title: "Customer testimonials", intro: "Add real reviews from your customers. The homepage section appears once at least one is active.", blank: { rating: 5, active: 1, sort: 0 },
  summary: (r) => `<strong>${esc(r.name)}</strong> — ${esc(r.text.slice(0, 80))} ${r.active ? "" : badge("off", "bad")}`,
  fields: (r) => field("Customer name *", "name", r.name, "required maxlength=80") + field("Shop / city", "location", r.location, "maxlength=80") + area("Review *", "text", r.text, 3) +
    select("Stars", "rating", [5, 4, 3, 2, 1].map((n) => [n, n + " stars"]), r.rating) + field("Order", "sort", r.sort ?? 0, 'inputmode="numeric"') + check("Show on website", "active", r.active),
});

// ------------------------------------------------------------------ enquiries
PAGES.enquiries = async () => {
  const d = await call("/enquiries");
  view.innerHTML = `<h1>Enquiries</h1><p class="muted">Messages from the Contact page.</p>
    ${d.enquiries.map((e) => `<div class="card item" data-id="${e.id}"><p><strong>${esc(e.name)}</strong> • <a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>${e.email ? " • " + esc(e.email) : ""} • ${when(e.created_at)} ${badge(e.status, e.status === "new" ? "warn" : "")}</p>
      <p>${esc(e.payload.subject || "")}${e.payload.subject ? ": " : ""}${esc(e.payload.message || "")}</p>
      <div class="actions"><button class="btn sm" data-set="contacted">Mark contacted</button><button class="btn sm" data-set="closed">Close</button><button class="btn sm danger" data-del>Delete</button></div></div>`).join("") || `<p class="muted">No enquiries yet.</p>`}`;
  view.addEventListener("click", async (e) => {
    const card = e.target.closest("[data-id]");
    if (!card) return;
    const set = e.target.closest("[data-set]");
    if (set && (await guard(() => call("/enquiries/" + card.dataset.id, { method: "PATCH", body: { status: set.dataset.set } })))) route();
    if (e.target.closest("[data-del]") && confirm("Delete this enquiry?") && (await guard(() => call("/enquiries/" + card.dataset.id, { method: "DELETE" })))) route();
  });
};

// ------------------------------------------------------------------ reports
const rstate = { from: "", to: "" };
PAGES.reports = async () => {
  const d = await call("/reports?" + new URLSearchParams(rstate));
  const max = Math.max(1, ...d.daily.map((x) => x.revenue));
  const sum = d.daily.reduce((a, x) => ({ orders: a.orders + x.orders, revenue: a.revenue + x.revenue, gst: a.gst + x.gst }), { orders: 0, revenue: 0, gst: 0 });
  view.innerHTML = `<div class="head"><h1>Sales reports</h1><form class="actions" data-range><input type="date" name="from" value="${d.from}" aria-label="From"><input type="date" name="to" value="${d.to}" aria-label="To"><button class="btn primary">Show</button>
      <a class="btn" href="/api/admin/orders/export?from=${d.from}&to=${d.to}">Download orders (CSV)</a></form></div>
    <div class="stats"><div class="stat"><span>Revenue</span><strong>${rupees(sum.revenue) || "₹0"}</strong><small>${d.from} to ${d.to}</small></div><div class="stat"><span>Orders</span><strong>${sum.orders}</strong></div><div class="stat"><span>GST collected</span><strong>${rupees(sum.gst) || "₹0"}</strong></div><div class="stat"><span>Average order</span><strong>${sum.orders ? rupees(Math.round(sum.revenue / sum.orders)) : "₹0"}</strong></div></div>
    <div class="grid2">
      <section class="card"><h2>Daily revenue</h2>${d.daily.length ? `<table><thead><tr><th>Date</th><th>Orders</th><th class="num">Revenue</th><th></th></tr></thead><tbody>${d.daily.map((x) => `<tr><td>${x.day}</td><td>${x.orders}</td><td class="num">${rupees(x.revenue)}</td><td class="barcell"><span class="bar" style="width:${Math.round((x.revenue / max) * 100)}%"></span></td></tr>`).join("")}</tbody></table>` : `<p class="muted">No sales in this period.</p>`}
        <h2>Monthly revenue</h2>${d.monthly.length ? `<table><thead><tr><th>Month</th><th>Orders</th><th class="num">Revenue</th><th class="num">GST</th></tr></thead><tbody>${d.monthly.map((x) => `<tr><td>${x.month}</td><td>${x.orders}</td><td class="num">${rupees(x.revenue)}</td><td class="num">${rupees(x.gst) || "₹0"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No sales yet.</p>`}</section>
      <section class="card"><h2>Best-selling products</h2>${d.best_sellers.length ? `<table><thead><tr><th>Product</th><th>Qty</th><th class="num">Revenue</th></tr></thead><tbody>${d.best_sellers.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.qty} ${esc(x.unit)}</td><td class="num">${rupees(x.revenue)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No sales in this period.</p>`}
        <h2>By payment method</h2>${d.methods.length ? `<table><tbody>${d.methods.map((x) => `<tr><td>${esc(METHODS[x.method] || x.method)}</td><td>${x.orders} orders</td><td class="num">${rupees(x.revenue)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">—</p>`}</section>
    </div>`;
  view.querySelector("[data-range]").addEventListener("submit", (e) => { e.preventDefault(); Object.assign(rstate, formData(e.target)); route(); });
};

// ------------------------------------------------------------------ settings
PAGES.settings = async () => {
  const { settings: s } = await call("/settings");
  const group = (key, title, intro, inner) => `<form class="card form" data-settings="${key}"><h2>${title}</h2>${intro ? `<p class="muted">${intro}</p>` : ""}<div class="fgrid">${inner}</div><div class="actions"><button class="btn primary">Save ${title.toLowerCase()}</button></div></form>`;
  view.innerHTML = `<h1>Settings</h1>
    ${group("store", "Store & WhatsApp", "The WhatsApp number is used by the floating chat button and every WhatsApp link on the website.",
      field("WhatsApp number (with country code) *", "whatsapp", s.store.whatsapp, 'required inputmode="tel"', "Example: 918727002486") + field("Phone shown on website", "phone", s.store.phone) + field("Store name", "name", s.store.name) + field("Tagline", "tagline", s.store.tagline) +
      field("Email", "email", s.store.email) + field("GSTIN (printed on invoices)", "gstin", s.store.gstin, "maxlength=15") + field("Address", "address", s.store.address) + field("City", "city", s.store.city) + field("State", "region", s.store.region) + field("Pincode", "postcode", s.store.postcode, "maxlength=6") + field("Opening hours", "hours", s.store.hours))}
    ${group("gst", "GST", "Each product can have its own GST rate; this default is used when a product has none.",
      check("Charge / show GST", "enabled", s.gst.enabled) + field("Default GST rate %", "default_rate", s.gst.default_rate, 'inputmode="decimal"') + check("My prices already include GST", "inclusive", s.gst.inclusive))}
    ${group("shipping", "Delivery charges", "",
      field("Delivery charge per order ₹", "flat", toR(s.shipping.flat_paise || null), 'inputmode="decimal"', "Empty = no charge") + field("Free delivery above ₹", "free_above", toR(s.shipping.free_above_paise), 'inputmode="decimal"', "Empty = never free") +
      field("Delivery charge for Langar / bulk orders ₹", "bulk_flat", toR(s.shipping.bulk_flat_paise || null), 'inputmode="decimal"') + area("Delivery note (shown at checkout)", "note", s.shipping.note, 2))}
    ${group("payments", "Payment methods", "Online payment and UPI go through Razorpay and are verified automatically. If Razorpay is not connected, UPI uses your UPI ID below and you mark the order paid yourself. Bank transfer needs the account details.",
      check("Online payment (Razorpay)", "razorpay", s.payments.razorpay) + check("UPI", "upi", s.payments.upi) + check("Cash on delivery", "cod", s.payments.cod) + check("Bank transfer", "bank", s.payments.bank) +
      field("COD only up to ₹", "cod_max", toR(s.payments.cod_max_paise), 'inputmode="decimal"', "Empty = no limit") + field("UPI ID", "upi_id", s.payments.upi_id, 'placeholder="name@bank"') +
      field("Bank account name", "bank_account_name", s.payments.bank_account_name) + field("Account number", "bank_account_number", s.payments.bank_account_number) + field("IFSC", "bank_ifsc", s.payments.bank_ifsc, "maxlength=11") + field("Bank name", "bank_name", s.payments.bank_name))}
    <div class="card"><button class="btn" type="button" data-rzp>Check Razorpay connection</button> <span data-rzp-out class="muted"></span></div>
    ${group("home", "Homepage content", "",
      field("Top announcement bar", "announcement", s.home.announcement) + field("Main heading", "hero_title", s.home.hero_title) + area("Text under the heading", "hero_subtitle", s.home.hero_subtitle, 2) +
      field("Seasonal collection title", "seasonal_title", s.home.seasonal_title) + field("Seasonal collection link", "seasonal_url", s.home.seasonal_url) + area("Seasonal collection text", "seasonal_text", s.home.seasonal_text, 2) +
      field("Langar section title", "langar_title", s.home.langar_title) + area("Langar section text", "langar_text", s.home.langar_text, 2))}
    ${group("pages", "Website pages", "Leave a box empty to use the standard text. Use a blank line between paragraphs.",
      area("About us", "about", s.pages.about, 5) + area("Shipping policy", "shipping", s.pages.shipping, 5) + area("Returns & refunds", "refund", s.pages.refund, 5) + area("Privacy policy", "privacy", s.pages.privacy, 5) + area("Terms & conditions", "terms", s.pages.terms, 5))}
    ${group("seo", "Google & SEO", "For Google Search Console: choose the “HTML tag” method and paste only the code inside content=\"…\". Your sitemap is at /sitemap.xml.",
      field("Homepage title", "title", s.seo.title, "maxlength=160") + area("Homepage description", "description", s.seo.description, 2) + field("Google Search Console verification code", "google_verification", s.seo.google_verification))}`;
  view.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-settings]");
    if (!f) return;
    e.preventDefault();
    if (await guard(() => call("/settings/" + f.dataset.settings, { method: "PUT", body: formData(f) }))) flash("Saved");
  });
  view.querySelector("[data-rzp]").addEventListener("click", async () => {
    const out = view.querySelector("[data-rzp-out]");
    out.textContent = "Checking…";
    const r = await guard(() => call("/payment-check"));
    if (r) { out.textContent = (r.ok ? "✓ " : "✗ ") + r.message; out.className = r.ok ? "ok-text" : "err"; }
  });
};

// ------------------------------------------------------------------ boot
(async () => {
  try {
    const res = await fetch("/api/admin/session", { credentials: "same-origin" });
    if (res.ok) { csrf = (await res.json()).csrf; renderShell(); }
    else renderLogin();
  } catch { renderLogin("Could not reach the server. Please refresh."); }
})();
