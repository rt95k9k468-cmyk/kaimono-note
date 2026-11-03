/* DIAG（一時）：頁のメインスレッドが固まっても、ここ（別スレッド）は動き続けて、最後に何をしていたかを
   同じ場所の python http.server へ GET で知らせる（サーバーの記録に残る）。 */
const open = new Map();
let n = 0, beat = 0, last = null;
onmessage = (e) => {
  const m = e.data;
  n++;
  if (m[0] === "H") beat = Date.now();
  else if (m[0] === "E") { open.set(m[1], m[2]); last = "E " + m[2]; }
  else if (m[0] === "X") { last = "X " + (open.get(m[1]) || m[1]); open.delete(m[1]); }
  else if (m[0] === "M") last = "M " + m[1];
};
setInterval(() => {
  const q = new URLSearchParams({
    since: beat ? Date.now() - beat : -1, n, depth: open.size,
    open: [...open.values()].slice(-4).join(" || "), last: last || "",
  }).toString().slice(0, 1800);
  fetch("/__diag?" + q).catch(() => {});
}, 500);
