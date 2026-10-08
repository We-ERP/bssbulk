import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, EMAIL_DOMAIN } from "./firebase-config.js";

export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export { initializeApp, firebaseConfig };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const $ = id => document.getElementById(id);
export const emailOf = u => u.trim().toLowerCase() + "@" + EMAIL_DOMAIN;
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const flash = (el, msg, ok = false) => { el.innerHTML = `<div class="alert ${ok ? "alert-success" : "alert-danger"}">${esc(msg)}</div>`; };

// اللينك الافتراضي - {ID} مكان رقم الـ TT (workItemId)
export const DEFAULT_URL = "https://bss.te.eg:12900/csp/pbh/business.action?BMEBusiness=pbhProcessNavigate&serialNo=20261001105731106482&activityId=20261001105732092420&workItemId={ID}";

// يحوّل أي لينك كامل جديد إلى قالب: يستبدل قيمة workItemId بـ {ID}
export function toTemplate(link) {
  link = link.trim();
  if (link.includes("{ID}")) return link;
  if (/workItemId=[^&]*/i.test(link)) return link.replace(/(workItemId=)[^&]*/i, "$1{ID}");
  return null;
}
export const buildUrl = (tpl, serial) => tpl.replace("{ID}", encodeURIComponent(serial));

export function initTheme() {
  document.body.dataset.theme = localStorage.getItem("bss_theme") || "dark";
  window.toggleTheme = () => {
    const t = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = t; localStorage.setItem("bss_theme", t);
  };
}
export function startClock(el) {
  const o = { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" };
  const tick = () => el.textContent = new Date().toLocaleDateString("ar-EG", o);
  tick(); setInterval(tick, 1000);
}

export async function getProfile(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? s.data() : null;
}
export const can = (p, perm) => p.role === "admin" || p.perms?.[perm] === true;

// ===== جلسة واحدة لكل حساب =====
export const SESSION_TTL = 150000; // لو مفيش نبض 2.5 دقيقة تعتبر الجلسة منتهية
let hb = null, unsub = null;

export async function claimSession(user, profile, onLost) {
  const ref = doc(db, "sessions", user.uid);
  const key = "bss_token_" + user.uid;
  let token = localStorage.getItem(key) || "";
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    const fresh = Date.now() - (d.lastSeen?.toMillis?.() || 0) < SESSION_TTL;
    if (fresh && d.token !== token) return false;
  }
  if (!token) { token = crypto.randomUUID(); localStorage.setItem(key, token); }
  const write = () => setDoc(ref, { token, username: profile.username, lastSeen: serverTimestamp() });
  await write();
  clearInterval(hb); hb = setInterval(() => write().catch(() => {}), 60000);
  if (unsub) unsub();
  unsub = onSnapshot(ref, s => {
    if (s.metadata.hasPendingWrites) return;
    if (!s.exists() || s.data().token !== token) {
      clearInterval(hb); unsub && unsub();
      signOut(auth).finally(() => onLost && onLost());
    }
  });
  return true;
}
export async function logout() {
  clearInterval(hb); unsub && unsub();
  try { if (auth.currentUser) await deleteDoc(doc(db, "sessions", auth.currentUser.uid)); } catch (e) {}
  await signOut(auth);
}
