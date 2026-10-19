// Waqas' Finance Growth Strategy: the dashboard. Served only to a signed-in owner (middleware.js); the data below never reaches the sign-in page.
(function () {
const $ = (s) => document.querySelector(s);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, sdel(k) { try { sessionStorage.removeItem(k); } catch (e) {} } };

const P={aug:{sales:151283.08,food:49894.03,labor:47851.74,rent:10187.32,app:9184.75,cc:3352.89,util:3721.39,mkt:1626.01,net:25124.35},
         sep:{sales:147583.8,food:60758.37,labor:52028.46,rent:10626.37,app:9163.9,cc:3562.47,util:3114.95,mkt:2444.54,net:3004.09}};
const months=['24-12','25-01','25-02','25-03','25-04','25-05','25-06','25-07','25-08','25-09','25-10','25-11','25-12','26-01','26-02','26-03','26-04','26-05','26-06','26-07','26-08','26-09','26-10'];
const chick=[1.84,1.62,1.62,1.92,2.40,2.80,2.79,2.42,2.25,2.16,1.71,1.45,1.46,1.61,1.74,1.99,2.17,2.27,2.29,1.92,1.72,1.79,1.94];
const beef=[5.42,5.78,6.36,6.21,6.70,7.07,7.87,8.02,7.63,7.73,6.77,6.46,5.97,6.14,6.61,7.78,8.18,8.95,8.62,7.03,6.44,7.30,7.37];
const pct=(a,b)=>a/b*100, f1=v=>v.toFixed(1), money=v=>'$'+Math.round(v).toLocaleString('en-US');

const leaks=[
 {p:1,t:'Overtime paid in cash at straight time',ev:'141–215 OT hours per two-week period (Aug–Oct payroll tabs). Only 80 hours go on the check; the rest is "OT Cash" at the base rate. Azmeer logs 120 hours per period.',fix:'All hours on payroll; 1.5x over 40 per workweek; cut hours by scheduling.',v:'Legal risk',sub:'≈$3k/mo unpaid premium'},
 {p:1,t:'September food cost jumped to 41%',ev:'New vendor Alshami Food billed $11,236; Int. Golden Foods $2,784; AlSham Bakery +$2.9k.',fix:'Find out what the Alshami bill was for. If it belongs to another store, rebill it.',v:'$3–6k',sub:'per month'},
 {p:1,t:'October P&L is a copy of August',ev:'Gross $152,029 and "08/1 to 08/31" in the October file; only $20,399 of invoices. Shows a fake $77k profit.',fix:'Rebuild October from Square and invoices before any distribution.',v:'Stop',sub:'no payout from it'},
 {p:2,t:'Delivery apps take 30%',ev:'$9.2k a month in fees and app ads on about $31k of app sales.',fix:'Raise app prices 12–15%, cut paid promotions in half, move regulars to direct ordering.',v:'$3–4.5k',sub:'per month'},
 {p:2,t:'Too many labor hours',ev:'1,000–1,080 hours per two weeks; about $70–75 of sales per labor hour.',fix:'Schedule from Square hourly sales at $85+ per labor hour; 2 part-timers for the peaks.',v:'$3–5k',sub:'gross, per month'},
 {p:2,t:'Owners drew more than profit',ev:'Sept: Waqas withdrew $15,141 against a $2,253 share of profit (−$12,888).',fix:'Fixed monthly draw; quarterly distributions from closed months only.',v:'Cash',sub:'protects 2 months of runway'},
 {p:2,t:'Qun runs on &Shawarma’s cash',ev:'Pays Qun payroll tax and Mamu’s pay; sauces at ingredient cost; $15,945 (Jul–Sep) + $14,448 (Apr–Jun) receivable.',fix:'Monthly intercompany invoice at cost + labor + 15%, paid within 15 days.',v:'$0.5–1.5k',sub:'+ about $30k cash back'},
 {p:3,t:'Personal costs inside cost of goods',ev:'Toyota $1,694, Apple/T-Mobile about $460, "Medical Lynchburg", Misc $760–818 a month.',fix:'Separate cards; owner items go to draws. Insurance shows $0: confirm workers’ comp and general liability.',v:'$1–3k',sub:'misclassified'},
 {p:3,t:'Card processing above market',ev:'2.67–2.92% effective on about $124k of card sales.',fix:'Ask Square for a custom rate with a Helcim quote in hand.',v:'$400–900',sub:'per month'},
 {p:3,t:'Software overlap',ev:'PopMenu $815–1,131 + Tossdown + Square.',fix:'One ordering and marketing stack; Square Loyalty + Square Online.',v:'$300–900',sub:'per month'}];
const recipes=[
 {tag:'P1 · LABOR',t:'Fix payroll and cut overtime',y:'Legal + $2–4k/mo net',time:'2–4 weeks',ing:['Square Payroll or Gusto','7shifts free plan (up to 15 staff)','Square hourly sales report','Payroll accountant (1 meeting)'],
  steps:['Export every timesheet for the last 2 pay periods.','Put every employee on payroll with W-4 and I-9; stop cash wages.','Pay 1.5x for hours over 40 in each workweek (not per 80-hour period).','Pull Square sales by hour for 4 weeks; staff to $85+ sales per labor hour.','Hire 2 part-timers (20–25 hrs) for 11:30–2 and 5–8 rushes; cap anyone at 40 hrs unless the GM approves.','Every Monday: labor % and OT hours on this dashboard; target labor under 28%.'],
  warn:'Federal law requires 1.5x overtime and payroll records even for cash pay. Maryland can award up to 3x unpaid wages. Ask a payroll accountant how to handle past periods.'},
 {tag:'P2 · DELIVERY',t:'Cut delivery-app fees from 30% to under 20%',y:'$3–4.5k/mo',time:'1 week',ing:['DoorDash, Uber Eats, Grubhub merchant portals','Square Online or DoorDash Storefront','Bag insert cards with a QR code'],
  steps:['Raise app menu prices 12–15% above in-store (today the DoorDash bowl is already about $16 vs $12.99 in store).','Turn off paid in-app promotions that don’t bring new customers; keep a $X-off-first-order only if it pays back.','Review each app’s plan tier (DoorDash Basic 15% / Plus 25% / Premier 30%; Uber Eats Lite is now 20%).','Set up commission-free direct ordering with Uber Direct or DoorDash Drive delivery; the customer pays the delivery fee.','Put a "Order direct, get free fries" card in every app bag.','Track app fees ÷ app sales every month.']},
 {tag:'P2 · SOURCING',t:'Rebid halal meat, bread and produce',y:'$2.5–5k/mo',time:'30 days',ing:['Bid sheet with exact specs','4 vendors per category','Halal certificates (HMS, IFANCA, ISA)','MarginEdge or MarketMan for invoice tracking'],
  steps:['Write specs: e.g. boneless skinless halal thigh, 40 lb case, hand-slaughtered zabiha, certifier named.','Send the same sheet to Spectrum, PFS (West Creek/Silver Source halal), Sysco/Perdue halal and Quality Ethnic Foods.','Beef: ask Washington Lamb and Quality Ethnic to quote knuckle or bottom round, plus a beef-lamb blend; test halal cones at one store.','Bread: get AlSham’s price per piece vs Kontos pita at about $0.32–0.34; keep saj local.','Produce: weekly price sheets from Keany and Coastal Sunbelt; buy onions, potatoes, tomatoes by the case at Jessup.','Lock chicken for 3–6 months near $1.70/lb. Join a free buying group (Dining Alliance or Consolidated Concepts).'],
  warn:'Never trade halal integrity for price: collect each certificate and check Restaurant Depot case labels every delivery.'},
 {tag:'P3 · PAYMENTS',t:'Card setup and processing',y:'$700–1,200/mo',time:'2 weeks',ing:['Capital One Spark Cash Plus (2% everything)','Chase Ink Business Cash (5% phone, internet)','Helcim quote for leverage'],
  steps:['Apply for Spark Cash Plus; its $2,000 bonus needs $30k in 3 months, which supplier spend covers.','Put Sysco, PFS, Restaurant Depot, Webstaurant, Sam’s, Facebook and PopMenu on it.','Put Comcast and phones on Ink Business Cash for 5%.','Skip the Amex Business Platinum unless the owners travel a lot: $895 fee, 1x on most supply purchases.','Don’t pay check-only vendors through Melio or Plastiq: about 2.9% fee beats 2% back.','Call Square sales: over $250k a year qualifies for custom rates; show the Helcim quote.']},
 {tag:'GROWTH · CATERING',t:'Build a catering line worth $15–25k a month',y:'+$4.5–7.5k profit/mo',time:'90 days',ing:['Catering menu: boxed bowls, 10/25-person bars, iftar plates','ezCater listing rebuild','Part-time catering & sales manager (base + 5%)','Maryland Small Business Reserve registration on eMMA'],
  steps:['Price it: boxed bowl $13.99 (10 minimum), 10-person bar $165–189, 25-person about $399, iftar $12–15/head at 100+.','Rebuild ezCater with pro photos and packages; keep on-time above 98%.','Drop sample trays at science-corridor offices, USG, Adventist Shady Grove, biotechs.','Visit the Islamic Center of Maryland (5 miles), MCC and university MSAs with a Ramadan 2027 iftar offer by January.','Register for Small Business Reserve and bid on agency and university catering.','Holiday office-party offer now through December.']},
 {tag:'GROWTH · VIDEO',t:'Staff videos and customer testimonials',y:'Demand engine, about $4.5k/mo budget',time:'Start this week',ing:['One Content Lead (+$2/hr)','Phone, clip-on mic, ring light','Signed release forms','Square Loyalty + Square Marketing'],
  steps:['5 posts a week: spit carving, sauce pours, halal sourcing, staff faces, first bites.','Staff: $25 per approved video + filming time, through payroll; bonus $25 at 10k views, $100 at 100k.','Customers: free wrap or fries for an honest 15–30 sec video, whatever they say; release signed first.','Post with "#ad – customer got a free item"; staff say "I work here" on their own accounts.','Google reviews: QR code on tables and bags, no reward, ask everyone; reply to every review within 48 hours.','Never reward Google or Yelp reviews, and never ask on Yelp.'],
  warn:'FTC rules ban rewards tied to positive reviews (up to about $53k per violation). Maryland requires everyone’s consent to record audio.'},
 {tag:'P2 · STRUCTURE',t:'Separate the companies',y:'About $30k cash back + cleaner books',time:'60–90 days',ing:['CPA + business attorney','Separate bank accounts, EINs, Square accounts','Monthly intercompany invoice template'],
  steps:['Holding LLC owns brands and recipes; one LLC per store; one shared commissary and purchasing LLC.','Commissary sells garlic sauce, hummus, harissa, shug and spice blends at cost + labor + 15%.','Each store pays its own payroll and payroll tax.','Invoice Qun Shawarma monthly; collect the open Apr–Sep balances.','Fixed owner draws; quarterly distributions from closed months only.','Confirm workers’ comp, general liability and licenses for each entity.']},
 {tag:'P2 · WASTE',t:'Daily waste log',y:'1–3 food-cost points',time:'Start tonight',ing:['Kitchen scale','Clipboard or Google Form','Reason codes'],
  steps:['At close, weigh leftover chicken and beef cones and log pounds.','Log every throwaway with a reason: overcooked, dropped, expired, comp, prep error.','Every Monday compare meat bought vs Square item sales × portion ÷ (1 − 35% loss).','Any gap over 5% gets a cause and an owner.','Cook cones to the hourly sales forecast; smaller cones on slow nights.','Filter fryer oil daily and change it on a tester reading, not the calendar.']}];
const prep=[
 ['Days 1–30','Stop the leaks',['Close September; confirm the $11,236 Alshami Food bill','Rebuild October from real data','All hours on payroll at 1.5x over 40/week','Schedule from Square hourly sales; post 2 part-time jobs','Raise app prices 12–15%; halve app promotions','Square custom-rate call with Helcim quote','Apply for Spark Cash Plus + Ink Business Cash','Start the daily waste log','Launch holiday office-party catering']],
 ['Days 31–60','Buy better',['3 bids each: chicken, beef, bread, produce','Collect halal certificates','Lock chicken price for 3–6 months','Join a free buying group','Invoice Qun monthly; collect the open balance','One ordering/marketing tool; launch Square Loyalty','Start staff video + testimonial programs','QR review cards on every table and bag','Register for Small Business Reserve; rebuild ezCater']],
 ['Days 61–90','Build the machine',['Form holding, store and commissary LLCs','Separate bank accounts and cards','Hire part-time catering & sales manager','Sell Ramadan 2027 iftar packages','Set fixed owner draws + quarterly distributions','Monthly review: prime cost, labor, apps, catering, reviews']]];
const brig=[
 ['Chef-propriétaire','CEO · brand & growth','Waqas. New stores, catering partnerships, mosques, Frederick opening.','Group profit, openings on time'],
 ['Maître d’hôtel des comptes','Finance & compliance','Nadeem + outside CPA. Close by the 10th, payroll, sales tax, intercompany.','Close on time, zero payroll exceptions'],
 ['Chef de cuisine','General manager, &Shawarma','Promote the strongest lead (e.g. Mamu or Jorge). Schedule, food cost, hiring.','Prime cost < 60%, labor < 28%'],
 ['Sous-chef / commissary','Kitchen lead','Recipes, par sheets, sauce production, waste log.','Food cost < 30%, waste < 3%'],
 ['Chef de banquet','Catering & sales manager','New part-time hire, base + 5%. ezCater, offices, mosques, universities, state bids.','$15–25k/mo catering in 12 months'],
 ['Chef de communication','Content lead','Shift lead at +$2/hr. Videos, testimonials, Google profile.','5 posts/wk, +40 reviews/mo'],
 ['Chefs de partie','Shift leads (2–3)','Opening/closing checklists, cash, temperature logs.','Ticket times, checklists done']];
const cal=[['Oct–Dec 2026','Office holiday parties; sell iftar packages',true],['Jan 2027','Lock Ramadan contracts with mosques + MSAs'],['Feb 8 – Mar 9','Ramadan: iftar trays, suhoor, university iftars'],['Mar 9–10','Eid al-Fitr catering'],['May 16–17','Eid al-Adha; aqiqah + family events'],['May–Jun','Graduations, office summer events'],['Late Aug','ISB Halal Food Festival (vendor)'],['Aug–Sep','MSA welcome events; federal year-end spending']];


/* ---------- overview ---------- */
const ICO = { up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>', alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>', ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' };
function renderKPIs() {
  const k = [
    { k: 'Net profit', a: pct(P.aug.net, P.aug.sales), s: pct(P.sep.net, P.sep.sales), t: '10 to 15%', dir: 1, good: 10, warn: 6, sub: money(P.sep.net) },
    { k: 'Prime cost', a: pct(P.aug.food + P.aug.labor, P.aug.sales), s: pct(P.sep.food + P.sep.labor, P.sep.sales), t: '55 to 60%', dir: -1, good: 60, warn: 65 },
    { k: 'Food cost', a: pct(P.aug.food, P.aug.sales), s: pct(P.sep.food, P.sep.sales), t: '28 to 32%', dir: -1, good: 32, warn: 35, sub: money(P.sep.food) },
    { k: 'Labor', a: pct(P.aug.labor, P.aug.sales), s: pct(P.sep.labor, P.sep.sales), t: '25 to 30%', dir: -1, good: 30, warn: 32 },
    { k: 'App fees', a: 29.5, s: 30.3, t: 'under 20%', dir: -1, good: 20, warn: 25, sub: 'of app sales' },
    { k: 'Card fees', a: 2.67, s: 2.92, t: '2.2 to 2.5%', dir: -1, good: 2.5, warn: 2.7, sub: 'of card sales' }];
  $('#kpis').innerHTML = k.map((x) => {
    const v = x.s, st = x.dir > 0 ? (v >= x.good ? 'good' : v >= x.warn ? 'warn' : 'bad') : (v <= x.good ? 'good' : v <= x.warn ? 'warn' : 'bad');
    const d = x.s - x.a, worse = x.dir > 0 ? d < 0 : d > 0;
    return `<div class="stat-card"><div class="icon-badge ${st}">${st === 'good' ? ICO.ok : st === 'warn' ? ICO.up : ICO.alert}</div><div class="label">${x.k}</div><div class="value">${x.k === 'Card fees' ? v.toFixed(2) : f1(v)}%</div><div class="sub"><span class="${worse ? 'down' : 'up'}">${d > 0 ? '+' : ''}${f1(d)} pts</span> vs Aug · target ${x.t}</div></div>`;
  }).join('');
}
function renderSpend() {
  const s = P.sep, rows = [['Food and vendors', s.food], ['Labor and payroll tax', s.labor], ['Rent', s.rent], ['Delivery app fees', s.app], ['Card processing', s.cc], ['Utilities', s.util], ['Marketing', s.mkt]];
  rows.push(['Other operating', s.sales - s.net - rows.reduce((a, r) => a + r[1], 0)]); rows.push(['Net profit', s.net]);
  const W = 520, rh = 27, lw = 150, H = rows.length * rh + 6, max = 45; let g = '';
  rows.forEach((r, i) => { const p = pct(r[1], s.sales), w = (W - lw - 56) * p / max, y = i * rh + 4, big = i < 2, net = r[0] === 'Net profit';
    g += `<text x="${lw - 10}" y="${y + 14}" text-anchor="end" font-size="12.5" fill="var(--ink)">${r[0]}</text><rect x="${lw}" y="${y + 3}" width="${Math.max(w, 2)}" height="15" rx="2" fill="${net ? 'var(--success)' : big ? 'var(--danger)' : 'var(--chart)'}" fill-opacity="${big ? 0.8 : 1}"><title>${r[0]}: ${money(r[1])} (${f1(p)}%)</title></rect><text x="${lw + w + 7}" y="${y + 14}" font-size="12.5" font-weight="600" fill="var(--strong)">${f1(p)}%</text>`; });
  $('#spend').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="September cost breakdown">${g}</svg>`;
}
function renderBridge() {
  const st = [['Today', 14.1, 't'], ['Labor', 3.0], ['Delivery', 3.75], ['Food', 3.75], ['Cards', 0.9], ['Software', 1.6], ['Marketing', -2.5], ['Catering', 6.0], ['Growth', 3.4]];
  const total = st.reduce((a, r) => a + r[1], 0), all = [...st, ['Target', total, 't']];
  const W = 560, H = 250, l = 30, b = 214, band = (W - l - 4) / all.length, bw = band * 0.62, y = (v) => b - v / 40 * 186; let g = '', run = 0;
  [0, 10, 20, 30, 40].forEach((v) => { g += `<line x1="${l}" x2="${W - 2}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border-soft)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`; });
  all.forEach((r, i) => { const isT = r[2] === 't', s = isT ? 0 : run, e = isT ? r[1] : run + r[1]; run = e; const hi = Math.max(s, e), lo = Math.min(s, e), x = l + i * band + (band - bw) / 2;
    g += `<rect x="${x}" y="${y(hi)}" width="${bw}" height="${Math.max(1, y(lo) - y(hi))}" rx="2" fill="${isT ? 'var(--chart)' : r[1] >= 0 ? 'var(--success)' : 'var(--danger)'}" fill-opacity="${isT ? 1 : 0.75}"><title>${r[0]}: ${isT ? '$' + f1(r[1]) + 'k' : (r[1] > 0 ? '+' : '') + f1(r[1]) + 'k'}</title></rect>`
      + `<text x="${x + bw / 2}" y="${y(hi) - 5}" text-anchor="middle" font-size="11" font-weight="${isT ? 700 : 500}" fill="var(--strong)">${isT ? '$' + f1(r[1]) : (r[1] > 0 ? '+' : '−') + f1(Math.abs(r[1]))}</text><text x="${x + bw / 2}" y="${b + 16}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${r[0]}</text>`;
    if (i < all.length - 1) g += `<line x1="${x + bw}" x2="${x + band}" y1="${y(e)}" y2="${y(e)}" stroke="var(--muted)" stroke-dasharray="2 2"/>`; });
  g += `<line x1="${l}" x2="${W - 2}" y1="${b}" y2="${b}" stroke="var(--border)"/>`;
  $('#bridge').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:440px" role="img" aria-label="Profit bridge from $14k to $34k a month">${g}</svg>`;
}
function line(el, data, opt) {
  const W = 520, H = 220, l = 42, r = 10, t = 14, b = 190, n = data.length, x = (i) => l + i * (W - l - r) / (n - 1), y = (v) => b - (v - opt.min) / (opt.max - opt.min) * (b - t); let g = '';
  for (let v = opt.min; v <= opt.max + 1e-9; v += opt.step) g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border-soft)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">$${v.toFixed(opt.dec)}</text>`;
  if (opt.ref) g += `<line x1="${l}" x2="${W - r}" y1="${y(opt.ref)}" y2="${y(opt.ref)}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  g += `<polygon points="${l},${b} ${pts} ${x(n - 1)},${b}" fill="var(--primary)" fill-opacity=".1"/><polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linejoin="round"/>`;
  data.forEach((v, i) => { g += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === n - 1 ? 4.5 : 2.4}" fill="${i === n - 1 ? 'var(--primary-btn)' : 'var(--bg)'}" stroke="var(--primary)" stroke-width="1.6"><title>20${months[i]}: $${v.toFixed(2)}/lb</title></circle>`; });
  const hi = data.indexOf(Math.max(...data)), lo = data.indexOf(Math.min(...data));
  g += `<text x="${x(hi)}" y="${y(data[hi]) - 9}" text-anchor="middle" font-size="11" fill="var(--strong)">$${data[hi].toFixed(2)}</text><text x="${x(lo)}" y="${y(data[lo]) + 17 > b - 4 ? y(data[lo]) - 9 : y(data[lo]) + 17}" text-anchor="middle" font-size="11" fill="var(--strong)">$${data[lo].toFixed(2)}</text><text x="${x(n - 1) - 7}" y="${y(data[n - 1]) - 10}" text-anchor="end" font-size="11" font-weight="700" fill="var(--primary-text)">Oct $${data[n - 1].toFixed(2)}</text>`;
  ['24-12', '25-06', '25-12', '26-06'].forEach((m) => { const i = months.indexOf(m); g += `<text x="${x(i)}" y="${b + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m.slice(3)]} '${m.slice(0, 2)}</text>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:400px" role="img" aria-label="${opt.aria}">${g}</svg>`;
}
function renderLeaks() {
  $('#leakRows').innerHTML = leaks.map((x) => `<tr><td><span class="tag ${x.p === 1 ? 'bad' : x.p === 2 ? 'warn' : 'ok'}">${x.p === 1 ? 'Fix now' : x.p === 2 ? 'This month' : 'This quarter'}</span></td><td class="what"><b>${x.t}</b><small>${x.ev}</small></td><td>${x.fix}</td><td class="r">${x.v}<div style="font-weight:400;color:var(--muted);font-size:0.75rem">${x.sub}</div></td></tr>`).join('');
}
function renderPlate() {
  const n = (id) => parseFloat($('#' + id).value) || 0;
  const raw = n('oz') / 16 / (1 - n('loss') / 100), cM = raw * n('cP'), bM = raw * n('bP'), extra = n('bread') + n('veg') + n('pack'), cT = cM + extra, bT = bM + extra;
  const cP = cT / n('cMenu') * 100, bP = bT / n('bMenu') * 100, app = 1 + n('mk') / 100, cls = (v) => (v <= 30 ? 'up' : 'down');
  $('#plateOut').innerHTML = `<h3>Per wrap</h3><p class="card-sub">Food cost target 28 to 32%</p><table><tr><td>Raw meat needed</td><td>${raw.toFixed(3)} lb</td></tr><tr><td>Chicken meat</td><td>$${cM.toFixed(2)}</td></tr><tr><td>Beef meat</td><td>$${bM.toFixed(2)}</td></tr><tr><td>Bread, veg, sauces, packaging</td><td>$${extra.toFixed(2)}</td></tr><tr class="tot"><td>Chicken wrap plate cost</td><td>$${cT.toFixed(2)}</td></tr><tr class="tot"><td>Beef wrap plate cost</td><td>$${bT.toFixed(2)}</td></tr></table>
    <div class="big"><div><span>Chicken food cost</span><strong class="${cls(cP)}">${f1(cP)}%</strong><span>on the apps ${f1(cT / (n('cMenu') * app) * 100)}%</span></div><div><span>Beef food cost</span><strong class="${cls(bP)}">${f1(bP)}%</strong><span>on the apps ${f1(bT / (n('bMenu') * app) * 100)}%</span></div></div>
    <p class="note">Every $1 per lb on beef adds $${raw.toFixed(2)} per wrap, about $1,100 to $1,450 a month at current volume.</p>`;
}
function renderPlays() {
  $('#playList').innerHTML = recipes.map((r, i) => `<details class="play" ${i === 0 ? 'open' : ''}><summary><div><div class="k">${r.tag.replace(' · ', ' · ')}</div><div class="t">${r.t}</div></div><div class="y"><b>${r.y}</b>${r.time}</div></summary><div class="body"><div><h5>What you need</h5><ul>${r.ing.map((x) => `<li>${x}</li>`).join('')}</ul></div><div><h5>Steps</h5><ol>${r.steps.map((x) => `<li>${x}</li>`).join('')}</ol>${r.warn ? `<div class="warnbox">${r.warn}</div>` : ''}</div></div></details>`).join('');
}
function renderPrep() {
  let saved = {}; try { saved = JSON.parse(store.get('wfgs-prep') || '{}'); } catch (e) {}
  $('#prepList').innerHTML = prep.map((c, ci) => `<div class="panel"><h3>${c[0]} <small>${c[1]}</small></h3><div class="bar"><i id="bar${ci}"></i></div>${c[2].map((t, ti) => { const id = `pp-${ci}-${ti}`; return `<label class="${saved[id] ? 'done' : ''}"><input type="checkbox" id="${id}" ${saved[id] ? 'checked' : ''}><span>${t}</span></label>`; }).join('')}</div>`).join('');
  const upd = () => prep.forEach((c, ci) => { const d = c[2].filter((t, ti) => saved[`pp-${ci}-${ti}`]).length; $('#bar' + ci).style.width = (d / c[2].length * 100) + '%'; });
  upd(); $('#prepList').addEventListener('change', (e) => { if (e.target.type !== 'checkbox') return; saved[e.target.id] = e.target.checked; e.target.closest('label').classList.toggle('done', e.target.checked); store.set('wfgs-prep', JSON.stringify(saved)); upd(); });
}
function renderRoles() { $('#roleRows').innerHTML = brig.map((b) => `<tr><td class="what"><b>${b[1]}</b></td><td>${b[2]}</td><td>${b[3]}</td></tr>`).join(''); }
function renderCal() { $('#calList').innerHTML = cal.map((c) => `<div class="panel ${c[2] ? 'now' : ''}"><b>${c[0]}</b>${c[1]}</div>`).join(''); }
// sidebar: highlight the section in view
function spy() { const links = [...document.querySelectorAll('#nav a')]; const obs = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }); }, { rootMargin: '-30% 0px -60% 0px' }); document.querySelectorAll('.content section').forEach((s) => obs.observe(s)); }
let done = false;
function renderAll() {
  if (done) return; done = true;
  renderKPIs(); renderSpend(); renderBridge(); renderLeaks();
  line($('#chickChart'), chick, { min: 1, max: 3, step: 0.5, dec: 2, ref: 1.55, aria: 'Halal chicken price per pound, Dec 2024 to Oct 2026' });
  line($('#beefChart'), beef, { min: 5, max: 9, step: 1, dec: 0, aria: 'Halal beef price per pound, Dec 2024 to Oct 2026' });
  ['cP', 'bP', 'oz', 'loss', 'bread', 'veg', 'pack', 'mk', 'cMenu', 'bMenu'].forEach((id) => $('#' + id).addEventListener('input', renderPlate));
  renderPlate(); renderPlays(); renderPrep(); renderRoles(); renderCal(); try { spy(); } catch (e) {}
}
renderAll();
})();
