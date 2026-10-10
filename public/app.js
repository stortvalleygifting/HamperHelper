const State = { tab:'dashboard', products:[], stock:[], orders:[], customers:[], packaging:[], sources:[], shipping:[], proposals:[], staff:[], colours:[], me:null, loaded:false, hideHamperCosts:false };
try{ State.hideHamperCosts = localStorage.getItem('hh.hideHamperCosts') === '1'; }catch(e){ /* storage unavailable */ }

const ITEM_CATEGORIES = ['Alcohol Free','Beer','Cider','Coffee','Gin','Rum','Tea','Vodka','Whisky','Wine','Charcuterie','Snacks','Jam, Chutney & Preserves','Marinade','Mayonnaise','Oil','Pasta','Pudding','Rubs','Salad Dressing','Sauce','Biscuits and Cake Bars','Chocolate','Fudge','Nuts','Savoury Snacks','Sweets'];

// Report definitions go here as they're built. Each needs: id, label, and a generate():
// () => ({ filename, blob }) function that returns the file to download.
const REPORTS = [
  { id:'ready-to-invoice', label:'Orders ready to invoice (CSV)', generate: ()=> generateReadyToInvoiceReport() },
  { id:'orders', label:'Orders (Excel)', generate: ()=> generateOrdersReport() },
];

const PRIORITIES = ['High','Medium','Low'];
const PROPOSAL_STATUSES = ['Draft','Revision required','Sent','Accepted','Declined'];
function priorityRank(p){ const i = PRIORITIES.indexOf(p); return i<0 ? 1 : i; }
function priorityBadge(p){ p = PRIORITIES.includes(p) ? p : 'Medium'; return `<span class="badge prio-${p.toLowerCase()}">${p} priority</span>`; }
function escHtml(s){ return String(s==null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtMoney(n){ return '£' + (Math.round((n||0)*100)/100).toFixed(2); }
function profitToggleHtml(profit, style){
  const amount = fmtMoney(profit);
  const color = profit<0 ? 'var(--berry)' : 'var(--green)';
  return `<span class="profitToggle" data-amount="${amount.replace(/"/g,'&quot;')}" data-revealed="false" style="cursor:pointer;color:${color};text-decoration:underline dotted;${style||''}">Show profit</span>`;
}
function wireProfitToggles(root){
  (root||document).querySelectorAll('.profitToggle').forEach(el=>{
    el.onclick = ()=>{
      const revealed = el.dataset.revealed === 'true';
      el.dataset.revealed = revealed ? 'false' : 'true';
      el.textContent = revealed ? 'Show profit' : el.dataset.amount;
    };
  });
}
// Wraps a wide table so its horizontal scrollbar floats at the bottom of the
// window (see wireHScrolls) instead of sitting under the last row.
function hscroll(inner){
  return `<div class="hscroll"><div class="hscrollInner">${inner}</div><div class="hscrollBar"><div></div></div></div>`;
}
function wireHScrolls(){
  document.querySelectorAll('.hscroll').forEach(wrap=>{
    const inner = wrap.querySelector('.hscrollInner');
    const bar = wrap.querySelector('.hscrollBar');
    const sizeBar = ()=>{
      bar.firstElementChild.style.width = inner.scrollWidth + 'px';
      bar.style.display = inner.scrollWidth > inner.clientWidth + 1 ? '' : 'none';
      bar.scrollLeft = inner.scrollLeft;
    };
    sizeBar();
    bar.onscroll = ()=>{ if(inner.scrollLeft !== bar.scrollLeft) inner.scrollLeft = bar.scrollLeft; };
    inner.onscroll = ()=>{ if(bar.scrollLeft !== inner.scrollLeft) bar.scrollLeft = inner.scrollLeft; };
    wrap._sizeBar = sizeBar;
  });
}
window.addEventListener('resize', ()=>{
  document.querySelectorAll('.hscroll').forEach(wrap=>{ if(wrap._sizeBar) wrap._sizeBar(); });
});

// Type-to-search picker used instead of <datalist>, which some browsers
// (Safari) only match from the start of the text. Matches every typed word
// anywhere in an option's search text. opts: { options: () => [{ id, label,
// text }], onPick(id), onNoMatch() }.
function attachSearchBox(input, opts){
  let list = null, matches = [], active = 0;
  const close = ()=>{ if(list){ list.remove(); list = null; } };
  const pick = (opt)=>{ input.value = opt.label; close(); opts.onPick(opt.id); };
  const open = ()=>{
    const all = opts.options();
    const q = input.value.trim().toLowerCase();
    const exact = all.some(o=>o.label.toLowerCase()===q);
    const terms = exact ? [] : q.split(/\s+/).filter(Boolean);
    matches = all.filter(o=> terms.every(t=> (o.label+' '+(o.text||'')).toLowerCase().includes(t))).slice(0,60);
    active = 0;
    if(!list){
      list = document.createElement('div');
      list.className = 'searchList';
      document.body.appendChild(list);
    }
    const r = input.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    list.style.left = r.left + 'px';
    list.style.width = r.width + 'px';
    if(below < 220 && r.top > below){ list.style.top = ''; list.style.bottom = (window.innerHeight - r.top + 2) + 'px'; }
    else { list.style.bottom = ''; list.style.top = (r.bottom + 2) + 'px'; }
    list.innerHTML = matches.length
      ? matches.map((o,i)=>`<div class="searchOpt${i===active?' active':''}" data-i="${i}">${o.label}</div>`).join('')
      : `<div class="searchEmpty">No matches</div>`;
    list.querySelectorAll('.searchOpt').forEach(el=>{
      el.onmousedown = (e)=>{ e.preventDefault(); pick(matches[parseInt(el.dataset.i)]); };
    });
  };
  const highlight = ()=>{
    if(!list) return;
    list.querySelectorAll('.searchOpt').forEach((el,i)=>{
      el.classList.toggle('active', i===active);
      if(i===active) el.scrollIntoView({ block:'nearest' });
    });
  };
  input.setAttribute('autocomplete','off');
  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('keydown', (e)=>{
    if(!list) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); active = Math.min(active+1, matches.length-1); highlight(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active = Math.max(active-1, 0); highlight(); }
    else if(e.key==='Enter'){ if(matches[active]){ e.preventDefault(); pick(matches[active]); } }
    else if(e.key==='Escape'){ e.stopPropagation(); close(); }
  });
  input.addEventListener('blur', ()=>{
    if(!list) return; // closed by a pick
    close();
    const typed = input.value.trim().toLowerCase();
    const match = opts.options().find(o=>o.label.toLowerCase()===typed);
    if(match) opts.onPick(match.id); else opts.onNoMatch();
  });
  // The list is positioned against the window, so drop it if anything scrolls.
  const modal = input.closest('.modal');
  if(modal) modal.addEventListener('scroll', ()=>{ if(list && document.activeElement!==input) close(); });
}

function customerSearchOptions(){
  return State.customers.map(c=>({ id: c.id, label: customerLabel(c), text: [c.contactName2, c.email, c.email2].filter(Boolean).join(' ') }));
}

// Clicking a customer's name anywhere opens their edit screen.
function customerLink(cust, text){
  if(!cust) return text;
  return `<span class="custLink" data-custlink="${cust.id}">${text}</span>`;
}

// Clicks on these inside a clickable row do their own thing rather than
// opening the row's edit screen.
const ROW_CLICK_IGNORE = 'button,a,input,select,textarea,label,.profitToggle,.custLink,.dragHandle';

// Cost and profit figures are for admins only (the server also withholds
// the underlying costs from everyone else).
function canSeeCosts(){ return !!(State.me && State.me.isAdmin); }

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

async function loadAll(){
  try{
    const [data, staff, zoho] = await Promise.all([api.bootstrap(), api.staff.list(), api.zoho.status().catch(()=>null)]);
    State.zoho = zoho;
    State.products = data.products;
    State.stock = data.stock;
    State.orders = data.orders;
    State.customers = data.customers;
    State.packaging = data.packaging;
    State.shipping = data.shipping;
    State.sources = data.sources;
    State.proposals = data.proposals;
    State.colours = data.colours || [];
    State.staff = staff;
    State.loaded = true;
  }catch(e){
    console.error(e);
    showToast('Could not load data from the server — check your connection and try again');
  }
}

const TABS = ['dashboard','proposals','orders','production','products','stock','customers','colours','packaging','shipping','sources','reports','staff'];
// The address bar carries the current screen (#orders), so a second tab or a
// refresh opens where you were. #orders/order/<id> also opens that record.
function setTab(tab){ State.tab = tab; syncHash(); render(); }
function syncHash(){ try{ history.replaceState(null, '', '#'+State.tab); }catch(e){ /* not critical */ } }
function parseHash(){
  const [tab, kind, id] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  return { tab: TABS.includes(tab) ? tab : null, kind: kind || null, id: id || null };
}
function openInNewTab(ref){
  const hash = '#' + State.tab + (ref ? `/${ref.kind}/${encodeURIComponent(ref.id)}` : '');
  window.open(location.origin + location.pathname + hash, '_blank');
}

function stockById(id){ return State.stock.find(s=>s.id===id); }
function productById(id){ return State.products.find(p=>p.id===id); }
function customerById(id){ return State.customers.find(c=>c.id===id); }

// requirements from orders that are New or In Production
const ORDER_FLOW = ['Proposal','Confirmed','Packing','Packed','Shipped','Closed'];
const FORWARD_LABELS = { Proposal:'Confirm order', Confirmed:'Start packing', Packing:'Mark packed', Packed:'Mark shipped', Shipped:'Close order' };
const BACKWARD_LABELS = { Confirmed:'Revert to proposal', Packing:'Revert to confirmed', Packed:'Revert to packing', Shipped:'Revert to packed', Closed:'Reopen order' };
const PRODUCTION_STATUSES = ['Confirmed','Packing'];

function customerLabel(c){ return c ? `${c.companyName}${c.contactName? ' — '+c.contactName : ''}` : ''; }

function computeOpenRequirements(){
  const req = {}; // componentId -> qty needed
  State.orders.filter(o=> PRODUCTION_STATUSES.includes(o.status)).forEach(o=>{
    o.items.forEach(it=>{
      if(isItemLine(it)){
        if(it.stockId) req[it.stockId] = (req[it.stockId]||0) + (it.qty||0);
        return;
      }
      const prod = productById(it.productId);
      if(!prod) return;
      prod.components.forEach(c=>{
        req[c.componentId] = (req[c.componentId]||0) + c.qty * it.qty;
      });
    });
  });
  return req;
}

function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="sidebar">
      <div class="brand">Stort Valley<br>Gifting<span>Hamper Helper</span></div>
      ${navItem('dashboard','Dashboard')}
      ${navItem('proposals','Proposals')}
      ${navItem('orders','Orders')}
      ${navItem('production','Production')}
      ${navItem('products','Hampers')}
      ${navItem('stock','Items')}
      ${navItem('customers','Customers')}
      ${navItem('colours','Colours')}
      ${navItem('packaging','Packaging')}
      ${navItem('shipping','Shipping')}
      ${navItem('sources','Sources')}
      ${navItem('reports','Reports')}
      ${navItem('staff','Staff')}
      <div class="sidebarFooter">
        <div class="whoami">${State.me? (State.me.displayName || State.me.username) : ''}</div>
        <button class="ghost small" id="newTabBtn" title="Open Hamper Helper again in another browser tab, on this screen">Open in new tab</button>
        <button class="ghost small" id="logoutBtn">Log out</button>
      </div>
    </div>
    <div class="main" id="main"></div>
  `;
  document.querySelectorAll('.navitem').forEach(el=>{
    el.addEventListener('click', ()=> setTab(el.dataset.tab));
  });
  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('newTabBtn').onclick = ()=> openInNewTab(null);
  const main = document.getElementById('main');
  if(State.tab==='dashboard') main.innerHTML = renderDashboard();
  if(State.tab==='proposals') main.innerHTML = renderProposals();
  if(State.tab==='orders') main.innerHTML = renderOrders();
  if(State.tab==='production') main.innerHTML = renderProduction();
  if(State.tab==='products') main.innerHTML = renderProducts();
  if(State.tab==='stock') main.innerHTML = renderStock();
  if(State.tab==='customers') main.innerHTML = renderCustomers();
  if(State.tab==='colours') main.innerHTML = renderColours();
  if(State.tab==='packaging') main.innerHTML = renderPackaging();
  if(State.tab==='shipping') main.innerHTML = renderShipping();
  if(State.tab==='sources') main.innerHTML = renderSources();
  if(State.tab==='reports') main.innerHTML = renderReports();
  if(State.tab==='staff') main.innerHTML = renderStaff();
  attachHandlers();
}

function renderStockOnly(){
  const main = document.getElementById('main');
  const searchEl = document.getElementById('stockSearch');
  const caret = searchEl ? searchEl.selectionStart : null;
  main.innerHTML = renderStock();
  attachHandlers();
  const newSearchEl = document.getElementById('stockSearch');
  if(newSearchEl){ newSearchEl.focus(); if(caret!=null) newSearchEl.setSelectionRange(caret, caret); }
}

function renderCustomersOnly(){
  const main = document.getElementById('main');
  const searchEl = document.getElementById('customerSearch');
  const caret = searchEl ? searchEl.selectionStart : null;
  main.innerHTML = renderCustomers();
  attachHandlers();
  const newSearchEl = document.getElementById('customerSearch');
  if(newSearchEl){ newSearchEl.focus(); if(caret!=null) newSearchEl.setSelectionRange(caret, caret); }
}

function renderProductsOnly(){
  const main = document.getElementById('main');
  const searchEl = document.getElementById('productSearch');
  const caret = searchEl ? searchEl.selectionStart : null;
  main.innerHTML = renderProducts();
  attachHandlers();
  const newSearchEl = document.getElementById('productSearch');
  if(newSearchEl){ newSearchEl.focus(); if(caret!=null) newSearchEl.setSelectionRange(caret, caret); }
}

function renderOrdersOnly(){
  const main = document.getElementById('main');
  const searchEl = document.getElementById('orderSearch');
  const caret = searchEl ? searchEl.selectionStart : null;
  main.innerHTML = renderOrders();
  attachHandlers();
  const newSearchEl = document.getElementById('orderSearch');
  if(newSearchEl){ newSearchEl.focus(); if(caret!=null) newSearchEl.setSelectionRange(caret, caret); }
}

function renderProposalsOnly(){
  const main = document.getElementById('main');
  const searchEl = document.getElementById('proposalSearch');
  const caret = searchEl ? searchEl.selectionStart : null;
  main.innerHTML = renderProposals();
  attachHandlers();
  const newSearchEl = document.getElementById('proposalSearch');
  if(newSearchEl){ newSearchEl.focus(); if(caret!=null) newSearchEl.setSelectionRange(caret, caret); }
}

function navItem(tab,label){
  return `<div class="navitem ${State.tab===tab?'active':''}" data-tab="${tab}"><span class="navdot"></span>${label}</div>`;
}

// ---------- Colours ----------
// Customers store a ribbon colour as text: usually the name of a colour from
// the Colours page, or anything typed in. colourCss turns that into something
// a sample box can show (the listed colour's hex or RGB, or the text itself
// if it's already a colour the browser understands, like #3F6B3F or navy).
function colourByName(v){
  const key = String(v||'').trim().toLowerCase();
  return key ? State.colours.find(c=>c.name.trim().toLowerCase()===key) : null;
}
function normaliseHex(h){
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h||'').trim());
  if(!m) return '';
  const x = m[1].length===3 ? m[1].split('').map(ch=>ch+ch).join('') : m[1];
  return '#' + x.toUpperCase();
}
function rgbFromText(t){
  const nums = String(t||'').match(/\d+(\.\d+)?/g);
  if(!nums || nums.length < 3) return null;
  const [r,g,b] = nums.slice(0,3).map(n=>Math.max(0, Math.min(255, Math.round(Number(n)))));
  return { r, g, b };
}
function hexToRgbText(hex){
  const h = normaliseHex(hex);
  if(!h) return '';
  return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ');
}
function rgbTextToHex(t){
  const c = rgbFromText(t);
  return c ? '#' + [c.r,c.g,c.b].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase() : '';
}
function colourCss(v){
  if(!v) return '';
  const c = colourByName(v);
  if(c) return normaliseHex(c.hex) || rgbTextToHex(c.rgb) || '';
  const hex = normaliseHex(v);
  if(hex) return hex;
  return (window.CSS && CSS.supports && CSS.supports('color', String(v).trim())) ? String(v).trim() : '';
}
function colourSwatch(v, size){
  const css = colourCss(v);
  size = size || 14;
  return `<span class="colourSwatch${css ? '' : ' empty'}" style="width:${size}px;height:${size}px;${css ? `background:${css};` : ''}" title="${escHtml(v||'No colour')}"></span>`;
}

function renderColours(){
  const rows = State.colours.slice().sort((a,b)=> a.name.localeCompare(b.name));
  return `
    <div class="row-between">
      <div><h1>Colours</h1><p class="subtitle">Ribbon colours you stock. Customers pick their ribbon colour from this list.</p></div>
      <button class="primary" id="newColourBtn">Add colour</button>
    </div>
    <div class="panel">
      ${rows.length ? hscroll(`<table><thead><tr><th>Colour</th><th>Name</th><th>Hex</th><th>RGB</th><th>Pantone</th><th></th></tr></thead><tbody>
        ${rows.map(c=>`<tr class="clickrow" data-rowkind="colour" data-rowid="${c.id}">
          <td><input type="color" class="colourPick" data-colourpick="${c.id}" value="${normaliseHex(c.hex) || rgbTextToHex(c.rgb) || '#ffffff'}" title="Pick a colour"></td>
          <td><strong>${escHtml(c.name)}</strong></td>
          <td class="mono">${escHtml(c.hex) || '—'}</td>
          <td class="mono">${escHtml(c.rgb) || '—'}</td>
          <td>${escHtml(c.pantone) || '—'}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editcolour="${c.id}">Edit</button>
            <button class="small danger" data-delcolour="${c.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`) : `<div class="empty">No colours yet. Add the ribbon colours you use.</div>`}
    </div>
  `;
}

function openColourModal(existing){
  if(existing) noteModalRef('colour', existing.id);
  const c = existing ? Object.assign({}, existing) : { id:null, name:'', hex:'', rgb:'', pantone:'' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit colour':'Add colour'}</h3>
        <div class="field"><label>Name</label><input id="f_cname" value="${escHtml(c.name)}" placeholder="e.g. Forest Green"></div>
        <div class="field">
          <label>Colour picker</label>
          <div class="colorRow"><input type="color" id="f_cpick" value="${normaliseHex(c.hex) || rgbTextToHex(c.rgb) || '#ffffff'}"><span class="savehint" style="margin:0;">Picking a colour fills in the hex and RGB.</span></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Hex</label><input id="f_chex" value="${escHtml(c.hex)}" placeholder="#3F6B3F"></div>
          <div class="field"><label>RGB</label><input id="f_crgb" value="${escHtml(c.rgb)}" placeholder="63, 107, 63"></div>
        </div>
        <div class="field"><label>Pantone</label><input id="f_cpantone" value="${escHtml(c.pantone)}" placeholder="e.g. 7734 C"></div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  const pick = document.getElementById('f_cpick'), hex = document.getElementById('f_chex'), rgb = document.getElementById('f_crgb');
  pick.oninput = ()=>{ hex.value = pick.value.toUpperCase(); rgb.value = hexToRgbText(pick.value); };
  hex.oninput = ()=>{ const h = normaliseHex(hex.value); if(h){ pick.value = h; rgb.value = hexToRgbText(h); } };
  rgb.oninput = ()=>{ const h = rgbTextToHex(rgb.value); if(h){ pick.value = h; hex.value = h; } };
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async ()=>{
    const body = { name: document.getElementById('f_cname').value.trim(), hex: normaliseHex(hex.value) || hex.value.trim(), rgb: rgb.value.trim(), pantone: document.getElementById('f_cpantone').value.trim() };
    if(!body.name){ showToast('Give the colour a name'); return; }
    const clash = State.colours.find(x=> x.id!==c.id && x.name.trim().toLowerCase()===body.name.toLowerCase());
    if(clash){ showToast('There is already a colour with that name'); return; }
    try{
      State.colours = existing ? await api.colours.update(c.id, body) : await api.colours.create(body);
      closeModal(); render(); showToast('Colour saved');
    }catch(e){ showToast(e.message || 'Could not save colour'); }
  };
}

function statusBadge(status){
  const cls = (status||'').toLowerCase().replace(/\s+/g,'-');
  return `<span class="badge ${cls}">${status}</span>`;
}

function itemName(s){ return s.itemName || s.name || 'Unnamed item'; }
// Item name plus brand, so the hamper editor's item search matches on either.
function itemSearchLabel(s){ return s.brand ? `${itemName(s)} — ${s.brand}` : itemName(s); }

function renderDashboard(){
  const open = State.orders.filter(o=>o.status!=='Closed');
  const proposalCount = State.orders.filter(o=>o.status==='Proposal').length;
  const packingCount = State.orders.filter(o=>o.status==='Packing').length;
  const req = computeOpenRequirements();
  const lowStock = State.stock.filter(s => (req[s.id]||0) > s.qtyOnHand || s.availability==='Out of stock' || s.availability==='Low stock');
  return `
    <h1>Dashboard</h1>
    <p class="subtitle">Where things stand right now.</p>
    <div class="statrow">
      <div class="stat clickable" data-gotab="proposals"><div class="num">${proposalCount}</div><div class="lbl">Proposals</div></div>
      <div class="stat clickable" data-gotab="production"><div class="num">${packingCount}</div><div class="lbl">Packing</div></div>
      <div class="stat clickable" data-gotab="orders"><div class="num">${open.length}</div><div class="lbl">Open orders total</div></div>
      <div class="stat ${lowStock.length?'warn':''}"><div class="num">${lowStock.length}</div><div class="lbl">Items need attention</div></div>
    </div>
    <div class="panel">
      <h2>Needs attention</h2>
      ${lowStock.length ? hscroll(`<table><thead><tr><th>Item</th><th>On hand</th><th>Reserved (open orders)</th><th>On order</th><th>Availability</th></tr></thead><tbody>
        ${lowStock.map(s=>`<tr class="clickrow" data-rowkind="stock" data-rowid="${s.id}"><td>${itemName(s)}</td><td>${s.qtyOnHand}</td><td>${req[s.id]||0}</td><td>${s.qtyOnOrder||0}</td><td>${s.availability||'—'}</td></tr>`).join('')}
      </tbody></table>`) : `<div class="empty">Nothing needs attention. Stock covers all open orders.</div>`}
    </div>
    <div class="panel">
      <h2>Latest orders</h2>
      ${State.orders.length? State.orders.slice().reverse().slice(0,5).map(o=>orderCard(o,true)).join('') : `<div class="empty">No orders yet — add one from the Orders tab.</div>`}
    </div>
  `;
}

function orderCard(o, compact, opts){
  opts = opts || {};
  const prod = o.items.map(orderLineLabel).join(', ');
  const cust = customerById(o.customerId);
  const custLabel = cust ? customerLabel(cust) : 'Unknown customer';
  const swatch = cust && colourCss(cust.ribbonColor) ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colourCss(cust.ribbonColor)};margin-right:6px;vertical-align:middle;"></span>` : '';
  const nextLabel = FORWARD_LABELS[o.status];
  const backLabel = BACKWARD_LABELS[o.status];
  const totals = computeOrderTotals(o);
  const vatLine = totals.vatBreakdown.length>1 ? totals.vatBreakdown.map(v=>`${breakdownLabel(v)}: ${fmtMoney(v.totalIncVat)}`).join(' · ') : '';
  return `
    <div class="ordercard clickrow${opts.draggable ? ' draggableCard' : ''}" data-rowkind="order" data-rowid="${o.id}">
      <div class="orow">
        ${opts.draggable ? `<div class="dragHandle" title="Drag to move this order up or down the list">⋮⋮</div>` : ''}
        <div style="flex:1;min-width:0;">
          <div class="oname">${swatch}${customerLink(cust, custLabel)} <span class="mono">#${o.id.slice(-5)}</span></div>
          <div class="ometa">${prod}</div>
          <div class="ometa">${o.orderDate ? 'Ordered: '+o.orderDate : ''} ${o.deliveryDate ? ' · Dispatch: '+o.deliveryDate : ''} ${o.notes ? ' · '+o.notes : ''}</div>
          <div class="ometa">${canSeeCosts() ? `Cost: ${fmtMoney(totals.cost)} &nbsp;·&nbsp; ` : ''}Price: ${fmtMoney(totals.totalIncVat)} (inc VAT)${canSeeCosts() ? ` &nbsp;·&nbsp; Profit: ${profitToggleHtml(totals.profit)} (ex VAT)` : ''}</div>
          ${vatLine ? `<div class="ometa" style="color:var(--text-muted);">${vatLine}</div>` : ''}
          <div style="margin-top:6px;">${statusBadge(o.status)} ${priorityBadge(o.priority)} ${o.readyToInvoice ? `<span class="badge invoice">Ready to invoice</span>` : ''} ${o.invoiceSent ? `<span class="badge packed">Invoice sent</span>` : ''} ${zohoInvoiceLink(o)}</div>
        </div>
        <div class="oactions">
          ${backLabel ? `<button class="small ghost" data-regress="${o.id}">${backLabel}</button>` : ''}
          ${nextLabel ? `<button class="small primary" data-advance="${o.id}">${nextLabel}</button>` : ''}
          ${!compact ? `<button class="small ghost" data-editorder="${o.id}">Edit</button>
          <button class="small danger" data-delorder="${o.id}">Delete</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// "Customer - DD/MM/YYYY", the name a new proposal starts with.
function defaultProposalName(customerId, isoDate){
  const cust = customerById(customerId);
  const [y,m,d] = (isoDate || new Date().toISOString().slice(0,10)).split('-');
  return `${cust ? cust.companyName : 'Proposal'} - ${d}/${m}/${y}`;
}
function proposalName(pr){ return pr.name || defaultProposalName(pr.customerId, pr.proposalDate); }
function proposalHasOrder(pr){ return State.orders.some(o=>o.proposalId===pr.id); }
// The newest order made from a proposal, or null.
function proposalOrder(pr){
  return State.orders.filter(o=>o.proposalId===pr.id).sort((a,b)=>(b.orderDate||'').localeCompare(a.orderDate||''))[0] || null;
}

function proposalCard(pr){
  const cust = customerById(pr.customerId);
  const custLabel = cust ? customerLabel(cust) : 'Unknown customer';
  const hampers = (pr.hamperIds||[]).map(id=>{ const p = productById(id); return p? p.name : null; }).filter(Boolean);
  const order = proposalOrder(pr);
  const hasOrder = !!order;
  return `
    <div class="ordercard clickrow" data-rowkind="proposal" data-rowid="${pr.id}">
      <div class="orow">
        <div>
          <div class="oname">${escHtml(proposalName(pr))} <span class="mono">#${pr.id.slice(-5)}</span></div>
          <div class="ometa">${customerLink(cust, custLabel)}</div>
          <div style="margin:4px 0 2px;">${statusBadge(pr.status || 'Draft')}${order ? ` <span class="badge ${order.status.toLowerCase()}" title="Status of order #${order.id.slice(-5)}">Order: ${escHtml(order.status)}</span>` : ''}</div>
          <div class="ometa">${pr.proposalDate? 'Proposed: '+pr.proposalDate : ''}${pr.excludeShipping ? ' · Shipping left off the document' : ''}</div>
          <div class="ometa">${hampers.length? hampers.join(', ') : 'No hamper options chosen yet'}</div>
          ${pr.docName ? `<div class="ometa">Document: ${pr.docName} (${pr.docSource==='uploaded'?'uploaded':'generated'})</div>` : ''}
        </div>
        <div class="oactions" style="flex-wrap:wrap;justify-content:flex-end;max-width:260px;">
          <button class="small ghost" data-editproposal="${pr.id}">Edit</button>
          ${hasOrder ? '' : `<button class="small primary" data-convertproposal="${pr.id}">Convert to order</button>`}
          <button class="small primary" data-generateproposal="${pr.id}">Generate document</button>
          <button class="small ghost" data-uploadproposal="${pr.id}">Upload edited document</button>
          ${pr.docUrl ? `<button class="small ghost" data-downloadproposal="${pr.id}">Download document</button>` : ''}
          <button class="small danger" data-delproposal="${pr.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function getFilteredProposals(){
  const f = State.proposalFilter;
  let rows = State.proposals.slice().reverse();
  if(f.search){
    const q = f.search.toLowerCase();
    rows = rows.filter(pr=>{
      const cust = customerById(pr.customerId);
      return proposalName(pr).toLowerCase().includes(q) || (cust ? customerLabel(cust).toLowerCase() : '').includes(q);
    });
  }
  if(f.status) rows = rows.filter(pr=>(pr.status||'Draft')===f.status);
  if(f.customerId) rows = rows.filter(pr=>pr.customerId===f.customerId);
  // Proposal status (in the status list's order), then the order's status
  // (no order first, then along the order flow), then newest date first.
  const orderRank = (pr)=>{ const o = proposalOrder(pr); return o ? 1 + ORDER_FLOW.indexOf(o.status) : 0; };
  rows.sort((a,b)=>
    PROPOSAL_STATUSES.indexOf(a.status||'Draft') - PROPOSAL_STATUSES.indexOf(b.status||'Draft')
    || orderRank(a) - orderRank(b)
    || (b.proposalDate||'').localeCompare(a.proposalDate||''));
  return rows;
}

function renderProposals(){
  if(!State.proposalFilter) State.proposalFilter = { search:'', status:'', customerId:'' };
  const f = State.proposalFilter;
  const custIds = new Set(State.proposals.map(pr=>pr.customerId).filter(Boolean));
  const custs = State.customers.filter(c=>custIds.has(c.id)).sort((a,b)=>customerLabel(a).localeCompare(customerLabel(b)));
  const rows = getFilteredProposals();
  return `
    <div class="row-between">
      <div><h1>Proposals</h1><p class="subtitle">Draft gift package proposals for prospective customers.</p></div>
      <button class="primary" id="newProposalBtn">Add proposal</button>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <input id="proposalSearch" placeholder="Search name or customer..." value="${escHtml(f.search)}" style="max-width:240px;">
        <select id="proposalStatusFilter" style="max-width:180px;">
          <option value="">All statuses</option>
          ${PROPOSAL_STATUSES.map(st=>`<option value="${st}" ${f.status===st?'selected':''}>${st}</option>`).join('')}
        </select>
        <select id="proposalCustomerFilter" style="max-width:240px;">
          <option value="">All customers</option>
          ${custs.map(c=>`<option value="${c.id}" ${f.customerId===c.id?'selected':''}>${escHtml(customerLabel(c))}</option>`).join('')}
        </select>
        ${(f.search || f.status || f.customerId) ? `<button class="ghost small" id="clearProposalFilters">Clear filters</button>` : ''}
      </div>
    </div>
    ${rows.length? rows.map(pr=>proposalCard(pr)).join('') : `<div class="panel empty">${State.proposals.length? 'No proposals match these filters.' : 'No proposals yet. Click "Add proposal" to create the first one.'}</div>`}
  `;
}

function getFilteredSortedOrders(){
  const f = State.orderFilter;
  let rows = State.orders.slice();
  if(f.search){
    const q = f.search.toLowerCase();
    rows = rows.filter(o=>{
      const cust = customerById(o.customerId);
      const label = cust ? customerLabel(cust).toLowerCase() : '';
      return label.includes(q) || (o.notes||'').toLowerCase().includes(q);
    });
  }
  if(f.status) rows = rows.filter(o=>o.status===f.status);
  if(f.readyToInvoice==='yes') rows = rows.filter(o=>o.readyToInvoice);
  if(f.readyToInvoice==='no') rows = rows.filter(o=>!o.readyToInvoice);
  if(f.readyToInvoice==='sent') rows = rows.filter(o=>o.invoiceSent);
  if(f.readyToInvoice==='notsent') rows = rows.filter(o=>!o.invoiceSent);
  const { col, dir } = State.orderSort;
  rows.sort((a,b)=>{
    let av, bv;
    if(col==='customer'){
      const ca = customerById(a.customerId), cb = customerById(b.customerId);
      av = (ca? customerLabel(ca):'').toLowerCase(); bv = (cb? customerLabel(cb):'').toLowerCase();
    } else if(col==='priority'){
      av = -priorityRank(a.priority); bv = -priorityRank(b.priority);
    } else if(col==='totalPrice'){
      av = computeOrderTotals(a).totalIncVat; bv = computeOrderTotals(b).totalIncVat;
    } else if(col==='totalCost'){
      av = computeOrderTotals(a).cost; bv = computeOrderTotals(b).cost;
    } else if(col==='totalProfit'){
      av = computeOrderTotals(a).profit; bv = computeOrderTotals(b).profit;
    } else {
      av = (a[col]||'').toString().toLowerCase(); bv = (b[col]||'').toString().toLowerCase();
    }
    if(typeof av === 'number' || typeof bv === 'number'){ av = av||0; bv = bv||0; }
    if(av < bv) return dir==='asc' ? -1 : 1;
    if(av > bv) return dir==='asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function renderOrders(){
  if(!State.orderFilter) State.orderFilter = { search:'', status:'', readyToInvoice:'' };
  if(!State.orderSort) State.orderSort = { col:'orderDate', dir:'desc' };
  if(!canSeeCosts() && (State.orderSort.col==='totalCost' || State.orderSort.col==='totalProfit')) State.orderSort.col = 'orderDate';
  const rows = getFilteredSortedOrders();
  return `
    <div class="row-between">
      <div><h1>Orders</h1><p class="subtitle">Every order, from proposal to closed.</p></div>
      <button class="primary" id="newOrderBtn">Add order</button>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
        <input id="orderSearch" placeholder="Search customer or notes..." value="${State.orderFilter.search}" style="max-width:240px;">
        <select id="orderStatusFilter" style="max-width:160px;">
          <option value="">All statuses</option>
          ${ORDER_FLOW.map(s=>`<option value="${s}" ${State.orderFilter.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select id="orderInvoiceFilter" style="max-width:180px;">
          <option value="">All orders</option>
          <option value="yes" ${State.orderFilter.readyToInvoice==='yes'?'selected':''}>Ready to invoice</option>
          <option value="no" ${State.orderFilter.readyToInvoice==='no'?'selected':''}>Not ready to invoice</option>
          <option value="sent" ${State.orderFilter.readyToInvoice==='sent'?'selected':''}>Invoice sent</option>
          <option value="notsent" ${State.orderFilter.readyToInvoice==='notsent'?'selected':''}>Invoice not sent</option>
        </select>
        ${(State.orderFilter.search || State.orderFilter.status || State.orderFilter.readyToInvoice) ? `<button class="ghost small" id="clearOrderFilters">Clear filters</button>` : ''}
        <span style="flex:1;"></span>
        <select id="orderSortCol" style="max-width:160px;">
          <option value="orderDate" ${State.orderSort.col==='orderDate'?'selected':''}>Sort: Order date</option>
          <option value="deliveryDate" ${State.orderSort.col==='deliveryDate'?'selected':''}>Sort: Dispatch date</option>
          <option value="customer" ${State.orderSort.col==='customer'?'selected':''}>Sort: Customer</option>
          <option value="status" ${State.orderSort.col==='status'?'selected':''}>Sort: Status</option>
          <option value="priority" ${State.orderSort.col==='priority'?'selected':''}>Sort: Priority</option>
          ${canSeeCosts() ? `<option value="totalCost" ${State.orderSort.col==='totalCost'?'selected':''}>Sort: Total cost</option>` : ''}
          <option value="totalPrice" ${State.orderSort.col==='totalPrice'?'selected':''}>Sort: Total price</option>
          ${canSeeCosts() ? `<option value="totalProfit" ${State.orderSort.col==='totalProfit'?'selected':''}>Sort: Total profit</option>` : ''}
        </select>
        <button class="ghost small" id="orderSortDir">${State.orderSort.dir==='asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>
    </div>
    ${rows.length? rows.map(o=>orderCard(o,false)).join('') : `<div class="panel empty">${State.orders.length? 'No orders match these filters.' : 'No orders yet. Click "Add order" to create the first one.'}</div>`}
  `;
}

// Production order: priority, then wherever someone dragged it, then
// soonest dispatch date (orders with no date last), then oldest order.
function productionSort(a, b){
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if(pr) return pr;
  const ra = a.productionRank==null ? Infinity : a.productionRank, rb = b.productionRank==null ? Infinity : b.productionRank;
  if(ra !== rb) return ra < rb ? -1 : 1;
  const da = a.deliveryDate || '9999', db = b.deliveryDate || '9999';
  if(da !== db) return da < db ? -1 : 1;
  return (a.orderDate||'') < (b.orderDate||'') ? -1 : (a.orderDate||'') > (b.orderDate||'') ? 1 : 0;
}

// Drag and drop on the Production list. Pointer events, so it works with a
// mouse, a finger or a pen; the card moves live as you drag and the new
// order (and any priority change) is saved when you let go.
function wireProductionDrag(){
  document.querySelectorAll('.prodGroup .dragHandle').forEach(handle=>{
    handle.onpointerdown = (e)=>{
      if(e.button!==undefined && e.button!==0) return;
      e.preventDefault();
      const card = handle.closest('.ordercard');
      const before = productionListSnapshot();
      // Listen on the window rather than capturing the pointer: moving the
      // card in the page would drop a capture.
      const pointerId = e.pointerId;
      card.classList.add('dragging');
      State.dragging = true;
      let lastY = e.clientY, scrollTimer = null;
      const place = ()=>{
        const groups = [...document.querySelectorAll('.prodGroup')];
        // the group under the pointer, or the nearest one
        let group = groups.find(g=>{ const r = g.getBoundingClientRect(); return lastY >= r.top && lastY <= r.bottom; });
        if(!group) group = lastY < groups[0].getBoundingClientRect().top ? groups[0] : groups[groups.length-1];
        const list = group.querySelector('.prodGroupList');
        const next = [...list.querySelectorAll('.ordercard:not(.dragging)')].find(c=>{ const r = c.getBoundingClientRect(); return lastY < r.top + r.height/2; });
        if(next){ if(card.nextElementSibling !== next) list.insertBefore(card, next); }
        else if(list.lastElementChild !== card) list.appendChild(card);
        refreshProductionGroups();
      };
      const autoScroll = ()=>{
        const edge = 60;
        let dy = 0;
        if(lastY < edge) dy = -12; else if(lastY > window.innerHeight - edge) dy = 12;
        if(dy){ window.scrollBy(0, dy); place(); }
      };
      scrollTimer = setInterval(autoScroll, 30);
      const onMove = (ev)=>{ if(ev.pointerId!==pointerId) return; ev.preventDefault(); lastY = ev.clientY; place(); };
      const onEnd = (ev)=>{ if(ev.pointerId===pointerId) finish(); };
      window.addEventListener('pointermove', onMove, { passive:false });
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      const finish = async ()=>{
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        clearInterval(scrollTimer);
        card.classList.remove('dragging');
        State.dragging = false;
        const after = productionListSnapshot();
        if(JSON.stringify(after) === JSON.stringify(before)) return;
        // show it straight away, then save
        after.forEach((x,i)=>{ const o = State.orders.find(o=>o.id===x.id); if(o){ o.priority = x.priority; o.productionRank = i; } });
        render();
        try{
          State.orders = await api.orders.productionOrder(after);
          render();
          const moved = after.find(x=>{ const b = before.find(y=>y.id===x.id); return b && b.priority !== x.priority; });
          showToast(moved ? `Moved to ${moved.priority.toLowerCase()} priority` : 'Production order saved');
        }catch(err){
          showToast(err.message || 'Could not save the new order');
          await loadAll(); render();
        }
      };
    };
  });
}

function productionListSnapshot(){
  return [...document.querySelectorAll('.prodGroup')].flatMap(g=>
    [...g.querySelectorAll('.prodGroupList .ordercard')].map(c=>({ id: c.dataset.rowid, priority: g.dataset.priority })));
}

function refreshProductionGroups(){
  document.querySelectorAll('.prodGroup').forEach(g=>{
    const n = g.querySelectorAll('.prodGroupList .ordercard').length;
    g.classList.toggle('isEmpty', n===0);
    const count = g.querySelector('.prodGroupHead .mono');
    if(count) count.textContent = n;
  });
}

function renderProduction(){
  const active = State.orders.filter(o=>PRODUCTION_STATUSES.includes(o.status)).sort(productionSort);
  const req = computeOpenRequirements();
  return `
    <h1>Production</h1>
    <p class="subtitle">What needs assembling right now, and whether stock covers it.</p>
    <div class="panel">
      <h2>Orders to assemble</h2>
      ${active.length ? `<div class="savehint" style="margin:-6px 0 12px;">Drag an order by its ⋮⋮ handle to change its place in the list. Dropping it under another priority changes its priority.</div>
        ${PRIORITIES.map(pr=>{
          const group = active.filter(o=> (PRIORITIES.includes(o.priority) ? o.priority : 'Medium') === pr);
          return `<div class="prodGroup" data-priority="${pr}">
            <div class="prodGroupHead">${priorityBadge(pr)} <span class="mono">${group.length}</span></div>
            <div class="prodGroupList">${group.map(o=>orderCard(o,false,{draggable:true})).join('')}</div>
            <div class="prodGroupEmpty">No ${pr.toLowerCase()} priority orders. Drop one here.</div>
          </div>`;
        }).join('')}` : `<div class="empty">No orders waiting on production.</div>`}
    </div>
    <div class="panel">
      <h2>Item requirements</h2>
      ${Object.keys(req).length ? hscroll(`<table><thead><tr><th>Item</th><th>Required</th><th>On hand</th><th>Status</th></tr></thead><tbody>
        ${Object.entries(req).map(([id,qty])=>{
          const s = stockById(id);
          if(!s) return `<tr><td>Unknown component</td><td>${qty}</td><td>—</td><td>—</td></tr>`;
          const short = qty > s.qtyOnHand;
          return `<tr class="clickrow" data-rowkind="stock" data-rowid="${s.id}"><td>${itemName(s)}</td><td>${qty}</td><td>${s.qtyOnHand}</td><td>${short? `<span class="badge low">Short by ${qty-s.qtyOnHand}</span>` : `<span class="badge packed">Covered</span>`}</td></tr>`;
        }).join('')}
      </tbody></table>`) : `<div class="empty">No active production requirements.</div>`}
    </div>
  `;
}

function getFilteredSortedProducts(){
  const f = State.productFilter;
  let rows = State.products.map(p=>{
    const totals = computeHamperTotals(p);
    return { ...p, totalCost: totals.cost, totalPrice: totals.totalIncVat, totalWeight: totals.weight, profit: totals.profit, packagingName: totals.packaging? totals.packaging.size : '', shippingName: totals.shipping? totals.shipping.label : '' };
  });
  if(f.search){
    const q = f.search.toLowerCase();
    rows = rows.filter(p=>{
      const itemsText = p.components.map(c=>{const s=stockById(c.componentId); return s? itemName(s) : '';}).join(' ').toLowerCase();
      return (p.name||'').toLowerCase().includes(q) || itemsText.includes(q) || (p.packagingName||'').toLowerCase().includes(q) || (p.shippingName||'').toLowerCase().includes(q);
    });
  }
  const { col, dir } = State.productSort;
  rows.sort((a,b)=>{
    let av = a[col], bv = b[col];
    if(typeof av === 'number' || typeof bv === 'number'){ av = av||0; bv = bv||0; }
    else { av = (av||'').toString().toLowerCase(); bv = (bv||'').toString().toLowerCase(); }
    if(av < bv) return dir==='asc' ? -1 : 1;
    if(av > bv) return dir==='asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function productSortArrow(col){
  if(State.productSort.col !== col) return '';
  return State.productSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function renderProducts(){
  if(!State.productFilter) State.productFilter = { search:'' };
  if(!State.expandedHampers) State.expandedHampers = new Set();
  if(!State.productSort) State.productSort = { col:'name', dir:'asc' };
  const rows = getFilteredSortedProducts();
  const hideCosts = State.hideHamperCosts || !canSeeCosts();
  const cols = [[null,''],['name','Hamper'],[null,'Items'],['packagingName','Packaging'],['shippingName','Shipping'],['totalCost','Total cost'],['totalPrice','Total price'],['profit','Profit'],['totalWeight','Total weight'],[null,'']]
    .filter(([key])=> !(hideCosts && (key==='totalCost' || key==='profit')));
  return `
    <div class="row-between">
      <div><h1>Hampers</h1><p class="subtitle">Your product recipes — what goes into each hamper.</p></div>
      <button class="primary" id="newProductBtn">Add hamper</button>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <input id="productSearch" placeholder="Search hamper name, items, packaging..." value="${State.productFilter.search}" style="max-width:280px;">
        ${State.productFilter.search ? `<button class="ghost small" id="clearProductFilters">Clear filters</button>` : ''}
        ${canSeeCosts() ? `<label class="inlineCheck"><input type="checkbox" id="hideHamperCosts" ${hideCosts?'checked':''}> Hide cost and profit</label>` : ''}
        <span style="flex:1;"></span>
        <button class="ghost small" id="expandAllHampers">Expand all items</button>
        <button class="ghost small" id="collapseAllHampers">Collapse all items</button>
      </div>
      ${State.products.length? hscroll(`<table><thead><tr>
          ${cols.map(([key,label])=> key
            ? `<th style="cursor:pointer;" data-sortproductcol="${key}">${label}${productSortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(p=>`<tr class="clickrow" data-rowkind="product" data-rowid="${p.id}">
          <td>${p.photoUrl? `<img src="${p.photoUrl}" class="logoThumb">` : `<div class="logoThumb" style="background:var(--kraft);"></div>`}${(p.photoUrls||[]).length>1 ? `<div class="mono" style="text-align:center;">+${p.photoUrls.length-1}</div>` : ''}</td>
          <td><strong>${p.name}</strong></td>
          <td style="min-width:220px;" class="hamperItemsCell${State.expandedHampers.has(p.id) ? ' open' : ''}">${p.components.length ? `
            <button class="linkbtn itemsToggle" data-togglehamperitems="${p.id}"><span class="whenClosed">▸ Show ${p.components.length} item${p.components.length===1?'':'s'}</span><span class="whenOpen">▾ Hide items</span></button>
            <div class="hamperItemsFull">${p.components.map(c=>{const s=stockById(c.componentId); return s? `${c.qty} × ${itemName(s)}` : 'unknown';}).join('<br>')}</div>` : '—'}</td>
          <td>${p.packagingName || '—'}</td>
          <td>${p.shippingName || '—'}</td>
          ${hideCosts ? '' : `<td>${fmtMoney(p.totalCost)}</td>`}
          <td>${fmtMoney(p.totalPrice)}</td>
          ${hideCosts ? '' : `<td>${profitToggleHtml(p.profit)}</td>`}
          <td>${p.totalWeight.toFixed(0)} g</td>
          <td>
            <div class="stackedActions">
              <button class="small ghost" data-editproduct="${p.id}">Edit</button>
              <button class="small ghost" data-copyproduct="${p.id}">Copy</button>
              <button class="small danger" data-delproduct="${p.id}">Delete</button>
            </div>
          </td>
        </tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">No hampers match this search.</td></tr>`}
      </tbody></table>`) : `<div class="empty">No hampers yet. Add your first hamper recipe.</div>`}
    </div>
  `;
}

function getFilteredSortedStock(){
  const req = computeOpenRequirements();
  const f = State.stockFilter;
  let rows = State.stock.map(s => ({ ...s, itemName: itemName(s), reserved: req[s.id]||0 }));
  if(f.search){
    const q = f.search.toLowerCase();
    rows = rows.filter(s => (s.itemName||'').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q) || (s.brand||'').toLowerCase().includes(q));
  }
  if(f.category) rows = rows.filter(s => s.category === f.category);
  if(f.availability) rows = rows.filter(s => s.availability === f.availability);
  if(f.diet.v) rows = rows.filter(s => s.v);
  if(f.diet.vg) rows = rows.filter(s => s.vg);
  if(f.diet.g) rows = rows.filter(s => s.g);
  if(f.diet.n) rows = rows.filter(s => s.n);
  const { col, dir } = State.stockSort;
  rows.sort((a,b)=>{
    let av = a[col], bv = b[col];
    if(typeof av === 'number' || typeof bv === 'number'){ av = av||0; bv = bv||0; }
    else { av = (av||'').toString().toLowerCase(); bv = (bv||'').toString().toLowerCase(); }
    if(av < bv) return dir==='asc' ? -1 : 1;
    if(av > bv) return dir==='asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function sortArrow(col){
  if(State.stockSort.col !== col) return '';
  return State.stockSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function dietTags(s){
  const tags = [];
  if(s.v) tags.push('v');
  if(s.vg) tags.push('vg');
  if(s.g) tags.push('g');
  if(s.n) tags.push('n');
  return tags.length ? tags.map(t=>`<span class="badge diettag">${t}</span>`).join(' ') : '<span class="text-muted">—</span>';
}

function stockColumns(){
  return [
    ['category','Category'], ['brand','Brand'], ['itemName','Item name'], [null,'Diet'],
    ...(canSeeCosts() ? [['cost','Cost']] : []), ['price','Price'], ['weight','Weight'], ['vat','VAT'],
    ['availability','Availability'], ['qtyOnHand','On hand'], ['qtyOnOrder','On order'], ['reserved','Reserved'], [null,'']
  ];
}

function renderStock(){
  if(!State.stockFilter) State.stockFilter = { search:'', category:'', availability:'', diet:{v:false,vg:false,g:false,n:false} };
  if(!State.stockSort) State.stockSort = { col:'itemName', dir:'asc' };
  const rows = getFilteredSortedStock();
  const categories = [...new Set(State.stock.map(s=>s.category).filter(Boolean))].sort();
  const availabilities = ['In stock','Low stock','Out of stock','Discontinued','Seasonal only'];
  const dietOn = State.stockFilter.diet.v || State.stockFilter.diet.vg || State.stockFilter.diet.g || State.stockFilter.diet.n;
  return `
    <div class="row-between">
      <div><h1>Items</h1><p class="subtitle">Components and ingredients used across your hampers.</p></div>
      <div style="display:flex;gap:8px;">
        <button class="ghost" id="downloadCsvBtn">Download CSV</button>
        <button class="ghost" id="uploadCsvBtn">Upload CSV</button>
        <input type="file" id="csvFileInput" accept=".csv" style="display:none;">
        <button class="primary" id="newStockBtn">Add item</button>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
        <input id="stockSearch" placeholder="Search category, brand, item name..." value="${State.stockFilter.search}" style="max-width:260px;">
        <select id="stockCategoryFilter" style="max-width:180px;">
          <option value="">All categories</option>
          ${categories.map(c=>`<option value="${c}" ${State.stockFilter.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <select id="stockAvailabilityFilter" style="max-width:180px;">
          <option value="">All availability</option>
          ${availabilities.map(a=>`<option value="${a}" ${State.stockFilter.availability===a?'selected':''}>${a}</option>`).join('')}
        </select>
        <span style="display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--text-secondary);">
          Dietary:
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dietFilterV" style="width:auto;" ${State.stockFilter.diet.v?'checked':''}> v</label>
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dietFilterVg" style="width:auto;" ${State.stockFilter.diet.vg?'checked':''}> vg</label>
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dietFilterG" style="width:auto;" ${State.stockFilter.diet.g?'checked':''}> g</label>
          <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="dietFilterN" style="width:auto;" ${State.stockFilter.diet.n?'checked':''}> n</label>
        </span>
        ${(State.stockFilter.search || State.stockFilter.category || State.stockFilter.availability || dietOn) ? `<button class="ghost small" id="clearStockFilters">Clear filters</button>` : ''}
      </div>
      ${State.stock.length? hscroll(`<table><thead><tr>
          ${stockColumns().map(([key,label])=> key
            ? `<th class="sortable" data-sortcol="${key}" style="cursor:pointer;">${label}${sortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(s=>{
          const short = s.reserved > s.qtyOnHand;
          return `<tr class="clickrow" data-rowkind="stock" data-rowid="${s.id}">
          <td>${s.category||'—'}</td>
          <td>${s.brand||'—'}</td>
          <td>${s.itemName}</td>
          <td>${dietTags(s)}</td>
          ${canSeeCosts() ? `<td>${fmtMoney(s.cost)}</td>` : ''}
          <td>${fmtMoney(s.price)}</td>
          <td>${s.weight!=null && s.weight!=='' ? s.weight+' g' : '—'}</td>
          <td>${s.vat ? vatPctLabel(s.vat) : '—'}</td>
          <td>${s.availability||'—'}</td>
          <td>${s.qtyOnHand||0}</td>
          <td>${s.qtyOnOrder||0}</td>
          <td>${s.reserved} ${short? `<span class="badge low">Short</span>`:''}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editstock="${s.id}">Edit</button>
            <button class="small ghost" data-copystock="${s.id}">Copy</button>
            <button class="small danger" data-delstock="${s.id}">Delete</button>
          </td>
        </tr>`;}).join('') : `<tr><td colspan="${stockColumns().length}" class="empty">No items match these filters.</td></tr>`}
      </tbody></table>`) : `<div class="empty">No items yet. Add the components your hampers are built from.</div>`}
    </div>
  `;
}

const STOCK_CSV_FIELDS = ['id','category','brand','itemName','v','vg','g','n','cost','price','weight','vat','availability','qtyOnHand','qtyOnOrder'];

function downloadStockCsv(){
  const rows = getFilteredSortedStock();
  if(!rows.length){ showToast('No items to export'); return; }
  const csv = Papa.unparse(rows.map(s => {
    const row = {};
    STOCK_CSV_FIELDS.filter(f => f!=='cost' || canSeeCosts()).forEach(f => { row[f] = s[f] !== undefined ? s[f] : ''; });
    return row;
  }));
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'stort-valley-items.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV downloaded');
}

function reportFilters(){
  if(!State.reportFilters) State.reportFilters = { statuses:[], users:[], dateFrom:'', dateTo:'', customerId:null };
  return State.reportFilters;
}

// Everyone who has created an order or changed a status, plus current staff.
function reportUserOptions(){
  const byName = new Map();
  State.staff.forEach(st=> byName.set(st.username.toLowerCase(), { username: st.username, label: st.displayName ? `${st.displayName} (${st.username})` : st.username }));
  State.orders.forEach(o=>{
    [o.createdBy, ...(o.statusHistory||[]).map(h=>h.username)].filter(Boolean).forEach(u=>{
      if(!byName.has(u.toLowerCase())) byName.set(u.toLowerCase(), { username: u, label: `${u} (no longer on staff)` });
    });
  });
  return [...byName.values()].sort((a,b)=> a.label.localeCompare(b.label));
}

function multiSelectSummary(selected, items, allLabel){
  if(!selected.length) return allLabel;
  const labels = items.filter(it=>selected.includes(it.value)).map(it=>it.label);
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
}

function ordersReportFiltersHtml(){
  const f = reportFilters();
  const cust = f.customerId ? customerById(f.customerId) : null;
  // A dropdown button that opens a list of tick boxes.
  const multi = (name, items, allLabel)=> `<div class="multiSelect" data-multiselect="${name}" data-all="${escHtml(allLabel)}">
      <button type="button" class="multiSelectBtn"><span class="multiSelectText">${escHtml(multiSelectSummary(f[name], items, allLabel))}</span><span class="multiSelectCaret">▾</span></button>
      <div class="multiSelectMenu">
        ${items.map(it=>`<label class="inlineCheck multiSelectOpt"><input type="checkbox" data-reportfilter="${name}" value="${escHtml(it.value)}" data-label="${escHtml(it.label)}" ${f[name].includes(it.value)?'checked':''}> ${escHtml(it.label)}</label>`).join('')}
        <div class="multiSelectFoot"><button type="button" class="linkbtn" data-multiclear="${name}">Clear</button></div>
      </div>
    </div>`;
  return `
    <div class="reportFilters">
      <div class="field">
        <label>Status</label>
        ${multi('statuses', ORDER_FLOW.map(st=>({ value: st, label: st })), 'All statuses')}
      </div>
      <div class="field">
        <label>User <span class="hintInline">(created the order or changed its status)</span></label>
        ${multi('users', reportUserOptions().map(u=>({ value: u.username, label: u.label })), 'All users')}
      </div>
      <div class="grid2" style="max-width:420px;">
        <div class="field"><label>Order date from</label><input type="date" id="rf_from" value="${f.dateFrom}"></div>
        <div class="field"><label>Order date to</label><input type="date" id="rf_to" value="${f.dateTo}"></div>
      </div>
      <div class="field" style="max-width:420px;">
        <label>Customer</label>
        <input type="text" id="rf_customer" value="${cust ? escHtml(customerLabel(cust)) : ''}" placeholder="All customers (type to search)">
      </div>
      <div class="savehint" style="margin:0 0 12px;">The Excel file has a sheet of orders, a sheet with every hamper line, and each order's status history.</div>
    </div>`;
}

function wireOrdersReportFilters(){
  const f = reportFilters();
  const summarise = (box)=>{
    const name = box.dataset.multiselect;
    const items = [...box.querySelectorAll('[data-reportfilter]')].map(cb=>({ value: cb.value, label: cb.dataset.label }));
    box.querySelector('.multiSelectText').textContent = multiSelectSummary(f[name], items, box.dataset.all);
  };
  document.querySelectorAll('[data-reportfilter]').forEach(cb=>{
    cb.onchange = ()=>{
      const list = f[cb.dataset.reportfilter];
      const i = list.indexOf(cb.value);
      if(cb.checked && i<0) list.push(cb.value);
      if(!cb.checked && i>=0) list.splice(i,1);
      summarise(cb.closest('.multiSelect'));
    };
  });
  document.querySelectorAll('.multiSelect').forEach(box=>{
    box.querySelector('.multiSelectBtn').onclick = ()=>{
      const opening = !box.classList.contains('open');
      document.querySelectorAll('.multiSelect.open').forEach(b=>b.classList.remove('open'));
      if(opening) box.classList.add('open');
    };
    box.querySelector('[data-multiclear]').onclick = ()=>{
      f[box.dataset.multiselect].length = 0;
      box.querySelectorAll('[data-reportfilter]').forEach(cb=>{ cb.checked = false; });
      summarise(box);
    };
  });
  const from = document.getElementById('rf_from'), to = document.getElementById('rf_to');
  if(from) from.onchange = ()=>{ f.dateFrom = from.value; };
  if(to) to.onchange = ()=>{ f.dateTo = to.value; };
  const custInput = document.getElementById('rf_customer');
  if(custInput){
    attachSearchBox(custInput, {
      options: customerSearchOptions,
      onPick: (id)=>{ f.customerId = id; },
      onNoMatch: ()=>{ f.customerId = null; custInput.value = ''; },
    });
    custInput.addEventListener('input', ()=>{ if(!custInput.value.trim()) f.customerId = null; });
  }
}

async function generateOrdersReport(){
  const f = reportFilters();
  if(f.dateFrom && f.dateTo && f.dateFrom > f.dateTo){ showToast('The "from" date is after the "to" date'); return null; }
  try{
    const { blob, filename, headers } = await api.reports.orders({
      statuses: f.statuses, users: f.users, dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, customerId: f.customerId || null,
    });
    const count = parseInt(headers.get('X-Order-Count') || '0', 10);
    if(!count){ showToast('No orders match those choices'); return null; }
    showToast(`${count} order${count===1?'':'s'} in the report`);
    return { filename, blob };
  }catch(e){
    showToast(e.message || 'Could not build the report');
    return null;
  }
}

async function generateReadyToInvoiceReport(){
  // Marking orders invoiced and building the CSV both happen server-side in
  // one transaction, so a retry can't hand out the same invoice number twice.
  let result;
  try{
    result = await api.reports.readyToInvoice();
  }catch(e){
    showToast(e.message || 'Could not generate the report');
    return null;
  }
  State.orders = result.orders;
  render();
  if(!result.csv){
    showToast(result.message || 'No hamper line items found on orders ready to invoice');
    return null;
  }
  const blob = new Blob([result.csv], { type:'text/csv' });
  return { filename: result.filename, blob };
}

async function uploadStockCsv(file){
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results)=>{
      const incoming = results.data;
      if(!incoming.length){ showToast('No rows found in that CSV'); return; }
      try{
        const result = await api.stock.import(incoming);
        State.stock = result.stock;
        render();
        showToast(`CSV imported — ${result.added} added, ${result.updated} updated`);
      }catch(e){
        showToast(e.message || 'Could not import that CSV');
      }
    },
    error: ()=> showToast('Could not read that CSV file')
  });
}

// VAT rates are stored as "Standard 20%" etc. but shown as just "20%".
function vatPctLabel(rate){
  if((rate||'').toLowerCase().includes('exempt')) return 'Exempt';
  return Math.round(vatRatePercent(rate)*100) + '%';
}
function breakdownLabel(v){ return v.isShipping ? `Shipping (${vatPctLabel(v.rate)})` : vatPctLabel(v.rate); }
const VAT_OPTIONS = ['Standard 20%','Reduced 5%','Zero 0%','Exempt'];
function vatOptionsHtml(selected){
  return VAT_OPTIONS.map(v=>`<option value="${v}" ${(selected||'Standard 20%')===v?'selected':''}>${vatPctLabel(v)}</option>`).join('');
}

function vatRatePercent(vat){
  if(!vat) return 0.20;
  const v = vat.toLowerCase();
  if(v.includes('20')) return 0.20;
  if(v.includes('5')) return 0.05;
  if(v.includes('zero')) return 0;
  if(v.includes('exempt')) return 0;
  return 0.20;
}

// Every price and cost in the app (items, packaging, shipping, per-hamper
// overrides) is entered INCLUDING VAT, so ex-VAT figures are backed out of
// them rather than VAT being added on top. Profit is ex-VAT price minus
// ex-VAT cost. Keep in sync with server/src/lib/pricing.js.
function exVat(amount, rate){ return amount/(1+vatRatePercent(rate)); }

function breakdownLine(rate, totalIncVat, extra){
  const subtotal = exVat(totalIncVat, rate);
  return Object.assign({ rate, subtotal, vatAmount: totalIncVat-subtotal, totalIncVat, isShipping:false }, extra||{});
}

// priceOverrides key for the shipping line (the others are VAT rate labels).
const SHIPPING_OVERRIDE_KEY = '__shipping';

// A hamper's price is one line per VAT rate for its goods (items + packaging),
// where p.priceOverrides can replace a rate's calculated amount, plus a single
// separate line for shipping at the shipping option's own VAT rate, which can
// also be overridden.
function computeHamperTotals(p){
  let cost = 0, costExVat = 0, weight = 0;
  const goods = {};
  (p.components||[]).forEach(c=>{
    const s = stockById(c.componentId);
    if(!s) return;
    const qty = c.qty||0;
    const linePrice = c.price!=null ? c.price : (s.price||0);
    const rate = s.vat || 'Standard 20%';
    cost += (s.cost||0)*qty;
    costExVat += exVat((s.cost||0)*qty, rate);
    weight += (parseFloat(s.weight)||0)*qty;
    goods[rate] = (goods[rate]||0) + linePrice*qty;
  });
  const pack = p.packagingId ? State.packaging.find(pk=>pk.id===p.packagingId) : null;
  if(pack){
    const rate = pack.vat || 'Standard 20%';
    cost += pack.cost||0;
    costExVat += exVat(pack.cost||0, rate);
    weight += (parseFloat(pack.weight)||0)*1000; // packaging weight is stored in kg; items are in g
    goods[rate] = (goods[rate]||0) + (pack.price||0);
  }
  const overrides = p.priceOverrides || {};
  const vatBreakdown = Object.entries(goods).map(([rate, calculated])=>{
    const overridden = overrides[rate]!=null;
    return breakdownLine(rate, overridden ? Number(overrides[rate]) : calculated, { calculated, overridden });
  }).sort((a,b)=> b.totalIncVat-a.totalIncVat);
  const ship = p.shippingId ? State.shipping.find(sh=>sh.id===p.shippingId) : null;
  if(ship){
    const rate = ship.vat || 'Standard 20%';
    cost += ship.cost||0;
    costExVat += exVat(ship.cost||0, rate);
    const overridden = overrides[SHIPPING_OVERRIDE_KEY]!=null;
    const amount = overridden ? Number(overrides[SHIPPING_OVERRIDE_KEY]) : (ship.price||0);
    vatBreakdown.push(breakdownLine(rate, amount, { isShipping:true, calculated: ship.price||0, overridden }));
  }
  const priceExVat = vatBreakdown.reduce((sum,v)=>sum+v.subtotal, 0);
  const totalIncVat = vatBreakdown.reduce((sum,v)=>sum+v.totalIncVat, 0);
  const profit = priceExVat - costExVat;
  return { cost, costExVat, priceExVat, weight, vatBreakdown, totalIncVat, profit, packaging: pack, shipping: ship };
}

// A single item sold on its own: its price (inc VAT) at its VAT rate.
function computeItemTotals(st){
  const rate = st.vat || 'Standard 20%';
  const price = st.price||0, cost = st.cost||0;
  const line = breakdownLine(rate, price, { calculated: price, overridden:false });
  return { cost, costExVat: exVat(cost, rate), priceExVat: line.subtotal, vatBreakdown:[line], totalIncVat: price, profit: line.subtotal - exVat(cost, rate) };
}
function isItemLine(it){ return it.kind==='item'; }
// The name and the price of ONE of an order line (a hamper or an item), or
// null if that hamper or item no longer exists.
function orderLineUnit(it){
  if(isItemLine(it)){
    const st = it.stockId ? stockById(it.stockId) : null;
    return st ? { name: itemSearchLabel(st), isItem:true, totals: computeItemTotals(st) } : null;
  }
  const p = productById(it.productId);
  return p ? { name: p.name, isItem:false, product:p, totals: computeHamperTotals(p) } : null;
}
function orderLineLabel(it){
  const u = orderLineUnit(it);
  return `${it.qty} × ${u ? u.name : isItemLine(it) ? 'Unknown item' : 'Unknown hamper'}`;
}

function computeOrderTotals(o){
  let cost = 0, costExVat = 0;
  const groups = {}; // goods per VAT rate, and shipping per VAT rate, kept apart
  const lines = []; // one entry per line, priced for ONE hamper or item
  o.items.forEach(it=>{
    const unit = orderLineUnit(it);
    if(!unit) return;
    const ht = unit.totals;
    const qty = it.qty||0;
    cost += ht.cost*qty;
    costExVat += ht.costExVat*qty;
    ht.vatBreakdown.forEach(v=>{
      const key = (v.isShipping ? 'ship|' : 'goods|') + v.rate;
      groups[key] = (groups[key]||0) + v.totalIncVat*qty;
    });
    lines.push({ name: unit.name, isItem: unit.isItem, qty, vatBreakdown: ht.vatBreakdown });
  });
  const vatBreakdown = Object.entries(groups).map(([key, amount])=>{
    const [kind, rate] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|')+1)];
    return breakdownLine(rate, amount, { isShipping: kind==='ship' });
  }).sort((a,b)=> (a.isShipping - b.isShipping) || (b.totalIncVat - a.totalIncVat));
  const priceExVat = vatBreakdown.reduce((sum,v)=>sum+v.subtotal, 0);
  const totalIncVat = vatBreakdown.reduce((sum,v)=>sum+v.totalIncVat, 0);
  const profit = priceExVat - costExVat;
  return { cost, costExVat, priceExVat, vatBreakdown, totalIncVat, profit, lines };
}

function computeOrderValue(o){
  return computeOrderTotals(o).totalIncVat;
}
function computeCustomerStats(customerId){
  const custOrders = State.orders.filter(o=>o.customerId===customerId);
  return { orderCount: custOrders.length, totalValue: custOrders.reduce((sum,o)=>sum+computeOrderValue(o),0) };
}

function escXml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function dataUrlToBytes(dataUrl){
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeImageToJpeg(dataUrl, maxDim){
  maxDim = maxDim || 1000;
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      let w = img.naturalWidth, h = img.naturalHeight;
      if(!w || !h){ reject(new Error('Image has no dimensions')); return; }
      if(Math.max(w,h) > maxDim){
        const scale = maxDim / Math.max(w,h);
        w = Math.round(w*scale); h = Math.round(h*scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,w,h);
      ctx.drawImage(img, 0, 0, w, h);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ width: w, height: h, bytes: dataUrlToBytes(jpegDataUrl) });
    };
    img.onerror = ()=> reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

const DOCX_FONT_RPR = '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';

function docxHeadingParaXml(text){
  return '<w:p><w:pPr><w:rPr>'+DOCX_FONT_RPR+'<w:b/><w:bCs/></w:rPr></w:pPr>'
    + '<w:r><w:rPr>'+DOCX_FONT_RPR+'<w:b/><w:bCs/></w:rPr>'
    + '<w:t xml:space="preserve">'+escXml(text)+'</w:t></w:r></w:p>';
}

function docxBulletParaXml(text){
  return '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'
    + '<w:rPr>'+DOCX_FONT_RPR+'</w:rPr></w:pPr>'
    + '<w:r><w:rPr>'+DOCX_FONT_RPR+'</w:rPr>'
    + '<w:t xml:space="preserve">'+escXml(text)+'</w:t></w:r></w:p>';
}

function docxItalicParaXml(text){
  return '<w:p><w:pPr><w:rPr>'+DOCX_FONT_RPR+'<w:i/></w:rPr></w:pPr>'
    + '<w:r><w:rPr>'+DOCX_FONT_RPR+'<w:i/></w:rPr>'
    + '<w:t xml:space="preserve">'+escXml(text)+'</w:t></w:r></w:p>';
}

function docxSpacerParaXml(){
  return '<w:p><w:pPr><w:pStyle w:val="NoSpacing"/></w:pPr></w:p>';
}

function docxImageParaXml(rid, wEmu, hEmu, docPrId, name){
  return '<w:p><w:pPr><w:rPr>'+DOCX_FONT_RPR+'</w:rPr></w:pPr>'
    + '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="'+wEmu+'" cy="'+hEmu+'"/>'
    + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
    + '<wp:docPr id="'+docPrId+'" name="'+escXml(name)+'"/>'
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:nvPicPr><pic:cNvPr id="'+docPrId+'" name="'+escXml(name)+'"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="'+rid+'"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+wEmu+'" cy="'+hEmu+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

const DOCX_EMU_PER_IN = 914400;

// A hamper's price on a proposal, inc VAT, with or without its shipping.
function proposalHamperPrice(p, excludeShipping){
  const totals = computeHamperTotals(p);
  if(!excludeShipping) return totals.totalIncVat;
  return totals.vatBreakdown.filter(v=>!v.isShipping).reduce((sum,v)=>sum+v.totalIncVat, 0);
}

async function buildHamperSectionDocxParts(selectedProducts, excludeShipping){
  let xml = '';
  const mediaFiles = {};
  const relsAdditions = [];
  let docPrId = 9000;
  if(!selectedProducts.length){
    xml += docxItalicParaXml('No hamper options have been selected for this proposal yet.');
    return { xml, mediaFiles, relsAdditions };
  }
  for(let idx=0; idx<selectedProducts.length; idx++){
    const p = selectedProducts[idx];
    xml += docxHeadingParaXml('Option '+(idx+1)+': '+p.name+' — '+fmtMoney(proposalHamperPrice(p, excludeShipping))+' including VAT');
    if(p.photoUrl){
      try{
        const norm = await normalizeImageToJpeg(p.photoUrl, 1000);
        const targetWIn = 2.4;
        const targetHIn = targetWIn * (norm.height / norm.width);
        const wEmu = Math.round(targetWIn * DOCX_EMU_PER_IN);
        const hEmu = Math.round(targetHIn * DOCX_EMU_PER_IN);
        const mediaName = 'image_hamper_'+(idx+1)+'.jpeg';
        mediaFiles['word/media/'+mediaName] = norm.bytes;
        const rid = 'rIdHamperImg'+(idx+1);
        relsAdditions.push('<Relationship Id="'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+mediaName+'"/>');
        xml += docxImageParaXml(rid, wEmu, hEmu, docPrId++, mediaName);
      }catch(e){
        xml += docxItalicParaXml('(no photo available)');
      }
    } else {
      xml += docxItalicParaXml('(no photo available)');
    }
    p.components.forEach(c=>{
      const s = stockById(c.componentId);
      if(s) xml += docxBulletParaXml(c.qty+' × '+itemName(s)+(s.brand? ', '+s.brand : ''));
    });
    xml += docxSpacerParaXml();
  }
  return { xml, mediaFiles, relsAdditions };
}

async function generateProposalDoc(proposalId){
  const proposal = State.proposals.find(p=>p.id===proposalId);
  if(!proposal) return;
  if(!(proposal.hamperIds||[]).length){ showToast('Choose at least one hamper option first'); return; }
  if(typeof JSZip === 'undefined'){ showToast('Document generator failed to load — check your connection and try again'); return; }

  const cust = customerById(proposal.customerId);
  const selectedProducts = (proposal.hamperIds||[]).map(id=>productById(id)).filter(Boolean);

  showToast('Generating document…');
  try{
    const templateBuffer = await (await fetch('/assets/proposal-template.docx')).arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuffer);
    let docXml = await zip.file('word/document.xml').async('string');
    let relsXml = await zip.file('word/_rels/document.xml.rels').async('string');

    const nameMarker = '<w:t xml:space="preserve">Proposal for </w:t></w:r>';
    const nameIdx = docXml.indexOf(nameMarker);
    if(nameIdx !== -1){
      const insertPos = nameIdx + nameMarker.length;
      const customerRun = '<w:r><w:rPr>'+DOCX_FONT_RPR+'<w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>'
        + '<w:t xml:space="preserve">'+escXml(cust ? cust.companyName : '')+'</w:t></w:r>';
      docXml = docXml.slice(0, insertPos) + customerRun + docXml.slice(insertPos);
    }

    const built = await buildHamperSectionDocxParts(selectedProducts, proposal.excludeShipping);
    const hamperXml = built.xml, mediaFiles = built.mediaFiles, relsAdditions = built.relsAdditions;
    const startMarker = 'some options below may not include photos.</w:t></w:r></w:p>';
    const endMarker = '<w:p w14:paraId="5537DBF7"';
    const startIdx = docXml.indexOf(startMarker);
    const endIdx = docXml.indexOf(endMarker);
    if(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx){
      const spliceStart = startIdx + startMarker.length;
      docXml = docXml.slice(0, spliceStart) + hamperXml + docXml.slice(endIdx);
    }

    relsXml = relsXml.replace('</Relationships>', relsAdditions.join('') + '</Relationships>');
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    Object.keys(mediaFiles).forEach(function(path){ zip.file(path, mediaFiles[path]); });

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const fileName = 'Proposal - '+(cust? cust.companyName : 'Customer')+' - '+(proposal.proposalDate||'')+'.docx';

    const result = await api.proposals.uploadDocument(proposalId, blob, { source: 'generated', docName: fileName });
    State.proposals = result;
    render();
    showToast('Proposal document generated');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(err){
    console.error(err);
    showToast('Failed to generate document — please try again');
  }
}

async function uploadProposalDoc(proposalId, file){
  try{
    const result = await api.proposals.uploadDocument(proposalId, file, { source: 'uploaded', docName: file.name });
    State.proposals = result;
    render();
    showToast('Edited document uploaded');
  }catch(e){
    showToast(e.message || 'Could not upload that document');
  }
}

function downloadProposalDoc(proposalId){
  const proposal = State.proposals.find(p=>p.id===proposalId);
  if(!proposal || !proposal.docUrl) return;
  const a = document.createElement('a');
  a.href = proposal.docUrl; a.download = proposal.docName || 'Proposal.docx';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}


function getFilteredSortedCustomers(){
  const f = State.customerFilter;
  let rows = State.customers.map(c=>{
    const stats = computeCustomerStats(c.id);
    const src = c.sourceId ? State.sources.find(s=>s.id===c.sourceId) : null;
    return { ...c, orderCount: stats.orderCount, totalValue: stats.totalValue, sourceLabel: src? src.label : '' };
  });
  if(f.search){
    const q = f.search.toLowerCase();
    rows = rows.filter(c => (c.companyName||'').toLowerCase().includes(q) || (c.contactName||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.phonePrimary||'').toLowerCase().includes(q) || (c.phoneSecondary||'').toLowerCase().includes(q) || (c.contactName2||'').toLowerCase().includes(q) || (c.email2||'').toLowerCase().includes(q) || (c.phone2Primary||'').toLowerCase().includes(q) || (c.phone2Secondary||'').toLowerCase().includes(q));
  }
  const { col, dir } = State.customerSort;
  rows.sort((a,b)=>{
    let av = a[col], bv = b[col];
    if(typeof av === 'number' || typeof bv === 'number'){ av = av||0; bv = bv||0; }
    else { av = (av||'').toString().toLowerCase(); bv = (bv||'').toString().toLowerCase(); }
    if(av < bv) return dir==='asc' ? -1 : 1;
    if(av > bv) return dir==='asc' ? 1 : -1;
    return 0;
  });
  return rows;
}

function customerSortArrow(col){
  if(State.customerSort.col !== col) return '';
  return State.customerSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function renderPackaging(){
  const rows = State.packaging.slice().sort((a,b)=> a.size.localeCompare(b.size));
  return `
    <div class="row-between">
      <div><h1>Packaging</h1><p class="subtitle">Box sizes and their price, weight${canSeeCosts() ? ', and cost' : ''}.</p></div>
      <button class="primary" id="newPackagingBtn">Add packaging</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Size</th><th>Price</th><th>Weight</th>${canSeeCosts() ? '<th>Cost</th>' : ''}<th>VAT rate</th><th></th></tr></thead><tbody>
        ${rows.map(p=>`<tr class="clickrow" data-rowkind="packaging" data-rowid="${p.id}">
          <td>${p.size}</td>
          <td>${fmtMoney(p.price)}</td>
          <td>${p.weight!=null && p.weight!=='' ? p.weight+' kg' : '—'}</td>
          ${canSeeCosts() ? `<td>${p.cost!=null && p.cost!=='' ? fmtMoney(p.cost) : '—'}</td>` : ''}
          <td>${vatPctLabel(p.vat || 'Standard 20%')}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editpackaging="${p.id}">Edit</button>
            <button class="small danger" data-delpackaging="${p.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty">No packaging options yet.</div>`}
    </div>
  `;
}

function renderShipping(){
  const rows = State.shipping.slice().sort((a,b)=> a.label.localeCompare(b.label));
  return `
    <div class="row-between">
      <div><h1>Shipping</h1><p class="subtitle">Shipping options and their price${canSeeCosts() ? ' and cost' : ''}.</p></div>
      <button class="primary" id="newShippingBtn">Add shipping</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Label</th><th>Price</th>${canSeeCosts() ? '<th>Cost</th>' : ''}<th>VAT rate</th><th></th></tr></thead><tbody>
        ${rows.map(p=>`<tr class="clickrow" data-rowkind="shipping" data-rowid="${p.id}">
          <td>${p.label}</td>
          <td>${fmtMoney(p.price)}</td>
          ${canSeeCosts() ? `<td>${p.cost!=null && p.cost!=='' ? fmtMoney(p.cost) : '—'}</td>` : ''}
          <td>${vatPctLabel(p.vat || 'Standard 20%')}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editshipping="${p.id}">Edit</button>
            <button class="small danger" data-delshipping="${p.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty">No shipping options yet.</div>`}
    </div>
  `;
}

function renderReports(){
  if(!State.reportSelection) State.reportSelection = REPORTS.length ? REPORTS[0].id : null;
  return `
    <div class="row-between">
      <div><h1>Reports</h1><p class="subtitle">Generate and download reports.</p></div>
    </div>
    <div class="panel">
      <div class="field" style="max-width:360px;">
        <label>Report</label>
        <select id="reportSelect" ${REPORTS.length? '' : 'disabled'}>
          ${REPORTS.length
            ? REPORTS.map(r=>`<option value="${r.id}" ${r.id===State.reportSelection?'selected':''}>${r.label}</option>`).join('')
            : `<option>No reports available yet</option>`}
        </select>
      </div>
      ${State.reportSelection==='orders' ? ordersReportFiltersHtml() : ''}
      <button class="primary" id="downloadReportBtn" ${REPORTS.length? '' : 'disabled'}>Download</button>
      ${!REPORTS.length? `<div class="savehint" style="margin-top:10px;">Reports will show up here once they've been added.</div>` : ''}
    </div>
    ${canSeeCosts() ? zohoPanelHtml() : ''}
  `;
}

// ---------- Zoho Books ----------
function zohoConnected(){ return !!(State.zoho && State.zoho.connected); }
function zohoContactLink(id, text){
  if(!id || !State.zoho || !State.zoho.contactUrlBase) return '';
  return `<a href="${State.zoho.contactUrlBase}${encodeURIComponent(id)}" target="_blank" rel="noopener" class="zohoLink" title="Open this customer in Zoho Books">${escHtml(text || 'Zoho')} ↗</a>`;
}
function zohoInvoiceLink(o){
  if(!o.zohoInvoiceId) return '';
  const label = `Zoho invoice ${escHtml(o.zohoInvoiceNumber || '')}`.trim();
  return State.zoho && State.zoho.invoiceUrlBase
    ? `<a href="${State.zoho.invoiceUrlBase}${encodeURIComponent(o.zohoInvoiceId)}" target="_blank" rel="noopener" class="zohoLink">${label} ↗</a>`
    : `<span class="zohoLink">${label}</span>`;
}

function zohoPanelHtml(){
  const z = State.zoho;
  if(!z) return '';
  const ready = State.orders.filter(o=>o.readyToInvoice && !o.zohoInvoiceId);
  return `
    <div class="panel">
      <h2>Zoho Books</h2>
      ${!z.configured ? `<div class="savehint" style="margin:0;">To connect, register Hamper Helper in Zoho's API Console as a server-based application with the redirect address <span class="mono">${escHtml(z.redirectUri)}</span>, then add its ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET to Railway.</div>`
      : !z.connected ? `
        <p class="savehint" style="margin:0 0 10px;">Connect once, and admins can turn orders into draft invoices in Zoho Books.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <select id="zohoRegion" style="max-width:260px;">${(z.regions||[]).map(r=>`<option value="${r.id}">${escHtml(r.label)}</option>`).join('')}</select>
          <button class="primary" id="zohoConnectBtn">Connect Zoho Books</button>
        </div>
        <div class="savehint">Pick the Zoho site you sign in at.</div>`
      : `
        <p style="margin:0 0 10px;font-size:13.5px;">Connected to <strong>${escHtml(z.organizationName || 'Zoho Books')}</strong>${z.connectedBy ? ` by ${escHtml(z.connectedBy)}` : ''}.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="primary" id="zohoSendReadyBtn" ${ready.length ? '' : 'disabled'}>Create draft invoices for ${ready.length} ready order${ready.length===1?'':'s'}</button>
          <button class="ghost small" id="zohoSyncSentBtn">Check for sent invoices</button>
          <button class="ghost small" id="zohoDisconnectBtn">Disconnect</button>
        </div>
        <div class="savehint">Each order marked Ready to invoice becomes one draft invoice in Zoho, to check and send from there. You can also create one from an order's pop-up. Every 5 minutes Hamper Helper checks Zoho, and once an invoice has been sent it ticks Invoice sent on the order.</div>`}
    </div>`;
}

async function createZohoInvoices(body){
  try{
    const result = await api.zoho.createInvoices(body);
    State.orders = result.orders;
    render();
    const ok = result.results.filter(r=>r.ok), bad = result.results.filter(r=>!r.ok);
    if(bad.length) openZohoResultsDialog(result.results);
    else showToast(ok.length===1 ? `Draft invoice ${ok[0].invoiceNumber} created in Zoho` : `${ok.length} draft invoices created in Zoho`);
    return result;
  }catch(e){ showToast(e.message || 'Could not reach Zoho'); return null; }
}

function openZohoResultsDialog(results){
  const label = (id)=>{ const o = State.orders.find(x=>x.id===id); const c = o ? customerById(o.customerId) : null; return `${c ? escHtml(c.companyName) : 'Order'} #${escHtml(id.slice(-5))}`; };
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay unsavedOverlay';
  wrap.innerHTML = `
    <div class="modal" style="width:480px;">
      <h3>Zoho invoices</h3>
      <ul class="blockerList">${results.map(r=>`<li>${label(r.orderId)}: ${r.ok ? `draft ${escHtml(r.invoiceNumber)} created` : `<span style="color:var(--berry);">${escHtml(r.error)}</span>`}</li>`).join('')}</ul>
      <div class="row-between"><span></span><button class="primary" data-act="ok">OK</button></div>
    </div>`;
  wrap.querySelector('[data-act="ok"]').onclick = ()=> wrap.remove();
  document.body.appendChild(wrap);
}

// Customers not yet linked to Zoho, each with Zoho's likeliest matches.
// Nothing changes until Rob confirms a row: then the customer is linked and
// takes Zoho's name, or (with no match) is created in Zoho.
function openZohoMatchModal(){
  let data = null, error = null;
  const rows = new Map(); // customer id -> { sel, extra, done, busy }
  const zoho = (r)=> { const st = rows.get(r.id); const seen = new Set(r.candidates.map(z=>z.id)); return r.candidates.concat(st.extra.filter(z=>!seen.has(z.id))); };
  const describe = (z)=> [z.contactPerson, z.email].filter(Boolean).join(' · ');
  function rowHtml(r){
    const st = rows.get(r.id);
    if(st.done) return `<div class="zmRow zmDone" data-zmrow="${r.id}"><div><strong>${escHtml(r.companyName)}</strong></div><div>✓ ${escHtml(st.done)}</div></div>`;
    const options = zoho(r);
    const picked = options.find(z=>z.id===st.sel);
    const renames = picked && picked.name.trim() !== r.companyName.trim();
    return `<div class="zmRow" data-zmrow="${r.id}">
      <div class="zmHH"><strong>${escHtml(r.companyName)}</strong><div class="savehint" style="margin:0;">${escHtml([r.contactName, r.email].filter(Boolean).join(' · '))}</div></div>
      <div class="zmPick">
        <select data-zmsel>${options.map(z=>`<option value="${escHtml(z.id)}" ${z.id===st.sel?'selected':''}>${escHtml(z.name)}</option>`).join('')}<option value="" ${!st.sel?'selected':''}>${options.length ? 'None of these' : 'No match found'}</option></select>
        <div class="savehint" style="margin:2px 0 0;">${picked
          ? `${picked.reason ? `<strong>${escHtml(picked.reason)}</strong><br>` : ''}${escHtml(describe(picked) || 'No contact details in Zoho')}${picked.linkedTo ? ` · already linked to ${escHtml(picked.linkedTo.name)}` : ''}${renames ? `<br>Renames to <strong>${escHtml(picked.name)}</strong>` : ''}`
          : 'Search Zoho below, or create this customer in Zoho.'}</div>
        <div style="display:flex;gap:6px;margin-top:6px;"><input data-zmsearch placeholder="Search Zoho by name or email"><button class="small ghost" data-zmsearchbtn>Search</button></div>
      </div>
      <div class="zmActions">
        <button class="small primary" data-zmconfirm ${st.busy?'disabled':''}>${picked ? 'Confirm match' : 'Create in Zoho'}</button>
        <button class="small ghost" data-zmskip>Skip</button>
      </div>
    </div>`;
  }
  function paint(){
    const list = data ? data.customers.filter(r=>rows.get(r.id).done !== 'skip') : [];
    const open = list.filter(r=>!rows.get(r.id).done).length;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal" style="width:860px;">
          <h3>Match customers with Zoho</h3>
          ${error ? `<p style="color:var(--berry);">${escHtml(error)}</p>`
            : !data ? `<p class="savehint">Looking up your customers in Zoho…</p>`
            : `<p class="savehint" style="margin-top:0;">${open} customer${open===1?'':'s'} to check. ${data.linkedCount} already linked. Zoho has ${data.zohoCount} customers. Confirming a match links the customer and renames it here to its Zoho name. Nothing is imported from Zoho.</p>
              <div id="zmList">${list.length ? list.map(rowHtml).join('') : `<div class="empty">Every customer is linked to Zoho.</div>`}</div>`}
          <div class="row-between" style="margin-top:16px;"><span></span><button class="primary" id="cancelBtn">Done</button></div>
        </div>
      </div>`;
    document.getElementById('cancelBtn').onclick = ()=>{ closeModal(); render(); };
    const listEl = document.getElementById('zmList');
    if(listEl){ listEl.onclick = onClick; listEl.onchange = onChange; listEl.onkeydown = (e)=>{ if(e.target.matches('[data-zmsearch]') && e.key==='Enter'){ e.preventDefault(); search(e.target.closest('[data-zmrow]')); } }; }
  }
  const rowOf = (el)=> data.customers.find(r=>r.id===el.dataset.zmrow);
  function repaintRow(r){
    const el = document.querySelector(`[data-zmrow="${r.id}"]`);
    if(!el) return;
    if(rows.get(r.id).done === 'skip'){ el.remove(); return; }
    el.outerHTML = rowHtml(r);
  }
  function onChange(e){
    if(!e.target.matches('[data-zmsel]')) return;
    const rowEl = e.target.closest('[data-zmrow]'), r = rowOf(rowEl);
    rows.get(r.id).sel = e.target.value; repaintRow(r);
  }
  async function search(rowEl){
    const r = rowOf(rowEl), text = rowEl.querySelector('[data-zmsearch]').value.trim();
    if(text.length < 2){ showToast('Type at least 2 letters to search Zoho'); return; }
    try{
      const found = await api.zoho.searchContacts(text);
      if(!found.length){ showToast('No customer in Zoho matches that'); return; }
      const st = rows.get(r.id);
      st.extra = found.concat(st.extra); st.sel = found[0].id;
      repaintRow(r);
    }catch(err){ showToast(err.message || 'Could not search Zoho'); }
  }
  async function onClick(e){
    const rowEl = e.target.closest('[data-zmrow]');
    if(!rowEl) return;
    const r = rowOf(rowEl), st = rows.get(r.id);
    if(e.target.matches('[data-zmsearchbtn]')) return search(rowEl);
    if(e.target.matches('[data-zmskip]')){ st.done = 'skip'; return repaintRow(r); }
    if(!e.target.matches('[data-zmconfirm]')) return;
    const picked = zoho(r).find(z=>z.id===st.sel);
    st.busy = true; repaintRow(r);
    try{
      const result = picked ? await api.zoho.linkCustomer(r.id, picked.id) : await api.zoho.createCustomer(r.id);
      State.customers = result.customers;
      st.done = picked ? `Linked to ${picked.name}${picked.name.trim() !== r.companyName.trim() ? ' and renamed' : ''}` : 'Created in Zoho';
    }catch(err){ showToast(err.message || 'Zoho said no'); }
    st.busy = false; repaintRow(r);
  }
  paint();
  api.zoho.customerMatches().then(d=>{
    // Likeliest matches first; customers with no suggestion at the end.
    d.customers.sort((a,b)=> ((b.candidates[0]||{}).score||0) - ((a.candidates[0]||{}).score||0) || a.companyName.localeCompare(b.companyName));
    d.customers.forEach(r=> rows.set(r.id, { sel: r.candidates[0] ? r.candidates[0].id : '', extra: [], done: '', busy: false }));
    data = d; paint();
  }).catch(e=>{ error = e.message || 'Could not reach Zoho'; paint(); });
}

function renderSources(){
  const rows = State.sources.slice().sort((a,b)=> a.label.localeCompare(b.label));
  return `
    <div class="row-between">
      <div><h1>Sources</h1><p class="subtitle">Where your customers come from.</p></div>
      <button class="primary" id="newSourceBtn">Add source</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Source</th><th></th></tr></thead><tbody>
        ${rows.map(s=>`<tr class="clickrow" data-rowkind="source" data-rowid="${s.id}">
          <td>${s.label}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editsource="${s.id}">Edit</button>
            <button class="small danger" data-delsource="${s.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty">No sources yet.</div>`}
    </div>
  `;
}

function renderStaff(){
  const rows = State.staff.slice().sort((a,b)=> a.username.localeCompare(b.username));
  return `
    <div class="row-between">
      <div><h1>Staff</h1><p class="subtitle">Who can log in to Hamper Helper.</p></div>
      <button class="primary" id="newStaffBtn">Add staff</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Username</th><th>Name</th><th>Admin</th><th></th></tr></thead><tbody>
        ${rows.map(s=>`<tr class="clickrow" data-rowkind="staff" data-rowid="${s.id}">
          <td>${s.username}${s.id===State.me.id? ' <span class="mono">(you)</span>' : ''}</td>
          <td>${s.displayName||'—'}</td>
          <td>${s.isAdmin? 'Yes' : 'No'}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editstaff="${s.id}">Edit</button>
            <button class="small danger" data-delstaff="${s.id}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty">No staff accounts yet.</div>`}
    </div>
  `;
}

function renderCustomers(){
  if(!State.customerFilter) State.customerFilter = { search:'' };
  if(!State.customerSort) State.customerSort = { col:'companyName', dir:'asc' };
  const rows = getFilteredSortedCustomers();
  const cols = [[null,''],['companyName','Company'],['contactName','Main contact'],['email','Email'],['phonePrimary','Phone'],[null,'Ribbon colour'],['sourceLabel','Source'],['orderCount','Orders'],['totalValue','Total value'],[null,'']];
  return `
    <div class="row-between">
      <div><h1>Customers</h1><p class="subtitle">Companies and contacts you gift for.</p></div>
      <div style="display:flex;gap:8px;">
        <button class="ghost" id="downloadCustomersCsvBtn">Download CSV</button>
        <button class="ghost" id="uploadCustomersCsvBtn">Upload CSV</button>
        <input type="file" id="customersCsvFileInput" accept=".csv" style="display:none;">
        ${zohoConnected() && State.me && State.me.isAdmin ? `<button class="ghost" id="zohoMatchBtn">Match with Zoho</button>` : ''}
        <button class="primary" id="newCustomerBtn">Add customer</button>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <input id="customerSearch" placeholder="Search company, contact, email, phone..." value="${State.customerFilter.search}" style="max-width:280px;">
        ${State.customerFilter.search ? `<button class="ghost small" id="clearCustomerFilters">Clear filters</button>` : ''}
      </div>
      ${State.customers.length? hscroll(`<table><thead><tr>
          ${cols.map(([key,label])=> key
            ? `<th style="cursor:pointer;" data-sortcustomercol="${key}">${label}${customerSortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(c=>`<tr class="clickrow" data-rowkind="customer" data-rowid="${c.id}">
          <td>${c.logoUrl? `<img src="${c.logoUrl}" class="logoThumb">` : `<div class="logoThumb" style="background:${colourCss(c.ribbonColor)||'#E7DCC4'};"></div>`}</td>
          <td><strong>${customerLink(c, c.companyName)}</strong>${c.zohoContactId ? ` ${zohoContactLink(c.zohoContactId)}` : ''}</td>
          <td>${c.contactName||'—'}</td>
          <td>${c.email||'—'}</td>
          <td>${c.phonePrimary||'—'}${c.phoneSecondary? ` / ${c.phoneSecondary}` : ''}</td>
          <td><span style="display:inline-flex;align-items:center;gap:6px;">${colourSwatch(c.ribbonColor)}${escHtml(c.ribbonColor)||'—'}</span></td>
          <td>${c.sourceLabel||'—'}</td>
          <td>${c.orderCount ? `<button class="linkbtn" data-vieworders="${c.id}">${c.orderCount}</button>` : '0'}</td>
          <td>${fmtMoney(c.totalValue)}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editcustomer="${c.id}">Edit</button>
            <button class="small danger" data-delcustomer="${c.id}">Delete</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="10" class="empty">No customers match this search.</td></tr>`}
      </tbody></table>`) : `<div class="empty">No customers yet. Add your first customer.</div>`}
    </div>
  `;
}

// ---------- Modals ----------
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; ModalStates.clear(); lastModalKey = null; }

// What each open pop-up needs remembering: whether anything in it has been
// changed since it opened, and which record it shows (for "open in new tab").
// Keyed by the pop-up's title, because pop-ups repaint themselves as you
// edit, and a pop-up opened from inside another (a new customer from an
// order) hands back to it when closed. Cleared when the last one closes.
const ModalStates = new Map();
let pendingModalRef = null, lastModalKey = null;
function noteModalRef(kind, id){ pendingModalRef = { kind, id }; }
function currentModal(){ return document.querySelector('#modalRoot .modal'); }
function modalKey(modal){ const h = modal.querySelector('h3'); return h ? h.textContent.trim() : ''; }
function modalState(modal){
  modal = modal || currentModal();
  if(!modal) return null;
  const key = modalKey(modal);
  if(!ModalStates.has(key)) ModalStates.set(key, { dirty:false, ref:null });
  return ModalStates.get(key);
}
function isModalDirty(){
  const modal = currentModal();
  return !!(modal && modal.querySelector('#saveBtn') && modalState(modal).dirty);
}

// Every pop-up gets a close (x) at its top right. It does whatever the
// pop-up's own Cancel/Close button does (some return to another pop-up).
// Next to it, a button opens the same screen (and record) in a new tab.
new MutationObserver(()=>{
  const modal = currentModal();
  if(!modal) return;
  // Back in a pop-up we'd already seen means the one opened from it has
  // closed, so forget that one.
  const key = modalKey(modal);
  if(lastModalKey && lastModalKey !== key && ModalStates.has(key)) ModalStates.delete(lastModalKey);
  lastModalKey = key;
  const state = modalState(modal);
  if(pendingModalRef){ state.ref = pendingModalRef; pendingModalRef = null; }
  if(modal.querySelector(':scope > .modalClose')) return;
  const bar = document.createElement('div');
  bar.className = 'modalClose';
  bar.innerHTML = '<button type="button" class="modalNewTab" aria-label="Open in new tab" title="Open this in a new browser tab">⧉</button><button type="button" class="modalX" aria-label="Close" title="Close">×</button>';
  bar.querySelector('.modalNewTab').onclick = ()=> openInNewTab(modalState(modal).ref);
  bar.querySelector('.modalX').onclick = ()=>{
    const cancel = modal.querySelector('#cancelBtn');
    if(cancel) cancel.click(); else closeModal();
  };
  modal.prepend(bar);
}).observe(document.getElementById('modalRoot'), { childList:true, subtree:true });

// Anything typed, picked, added or removed in a pop-up marks it as changed.
// Buttons that only show/hide things or open another pop-up carry
// data-nodirty.
(function trackModalChanges(){
  const root = document.getElementById('modalRoot');
  const mark = (e)=>{
    const modal = e.target.closest && e.target.closest('.modal');
    if(!modal || e.target.closest('.modalClose,[data-nodirty]')) return;
    modalState(modal).dirty = true;
  };
  root.addEventListener('input', mark, true);
  root.addEventListener('change', mark, true);
  root.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('button');
    if(!btn || btn.closest('.modalClose,[data-nodirty]') || btn.matches('#cancelBtn,#saveBtn,#confirmBtn,.expandBtn')) return;
    mark(e);
  }, true);
  // Cancel (and the x, which clicks Cancel) asks first if there are changes.
  let bypass = false;
  root.addEventListener('click', (e)=>{
    const cancel = e.target.closest && e.target.closest('#cancelBtn');
    if(!cancel || bypass || !isModalDirty()) return;
    e.preventDefault(); e.stopPropagation();
    openUnsavedChangesDialog({
      onSave: ()=>{ const save = currentModal() && currentModal().querySelector('#saveBtn'); if(save) save.click(); },
      onDiscard: ()=>{
        const modal = currentModal();
        if(modal) ModalStates.delete(modalKey(modal));
        bypass = true;
        try{ cancel.click(); } finally { bypass = false; }
      },
    });
  }, true);
})();

function openUnsavedChangesDialog({ onSave, onDiscard }){
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay unsavedOverlay';
  wrap.innerHTML = `
    <div class="modal" style="width:400px;" role="alertdialog" aria-labelledby="unsavedTitle">
      <h3 id="unsavedTitle">Save your changes?</h3>
      <p style="font-size:13.5px;color:var(--text-secondary);margin:0 0 20px;line-height:1.5;">You've changed something in this pop-up without saving it.</p>
      <div class="stackedActions">
        <button class="primary" data-act="save">Save changes</button>
        <button class="danger" data-act="discard">Close without saving</button>
        <button class="ghost" data-act="keep">Keep editing</button>
      </div>
    </div>`;
  const done = ()=>{ wrap.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e)=>{ if(e.key==='Escape'){ e.stopPropagation(); done(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.querySelector('[data-act="save"]').onclick = ()=>{ done(); onSave(); };
  wrap.querySelector('[data-act="discard"]').onclick = ()=>{ done(); onDiscard(); };
  wrap.querySelector('[data-act="keep"]').onclick = done;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-act="save"]').focus();
}

// Closing or reloading the browser tab with unsaved changes in a pop-up gets
// the browser's own "leave this page?" warning.
window.addEventListener('beforeunload', (e)=>{
  if(isModalDirty()){ e.preventDefault(); e.returnValue = ''; }
});

function openConfirmModal(message, onConfirm, opts){
  opts = opts || {};
  const title = opts.title || 'Delete this?';
  const confirmLabel = opts.confirmLabel || 'Delete';
  const confirmClass = opts.confirmClass || 'danger';
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal" style="width:380px;">
        <h3>${title}</h3>
        <p style="font-size:13.5px;color:var(--text-secondary);margin:0 0 20px;line-height:1.5;">${message}</p>
        <div class="row-between">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="${confirmClass}" id="confirmBtn">${confirmLabel}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('confirmBtn').onclick = async ()=>{ closeModal(); await onConfirm(); };
}

function openSourceModal(existing){
  if(existing) noteModalRef('source', existing.id);
  const s = existing || { id:null, label:'' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit source':'Add source'}</h3>
        <div class="field"><label>Source</label><input id="f_source" value="${s.label}" placeholder="e.g. Referral, Google, Trade show"></div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async ()=>{
    const label = document.getElementById('f_source').value.trim();
    if(!label){ showToast('Give it a name first'); return; }
    try{
      State.sources = existing ? await api.sources.update(s.id, { label }) : await api.sources.create({ label });
      closeModal(); render(); showToast('Source saved');
    }catch(e){ showToast(e.message || 'Could not save source'); }
  };
}

function openStaffModal(existing){
  if(existing) noteModalRef('staff', existing.id);
  const s = existing || { id:null, username:'', displayName:'', isAdmin:false };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit staff':'Add staff'}</h3>
        <div class="field"><label>Username</label><input id="f_username" value="${s.username}" placeholder="e.g. jsmith" autocomplete="off"></div>
        <div class="field"><label>Name</label><input id="f_displayname" value="${s.displayName||''}" placeholder="e.g. Jo Smith"></div>
        <div class="field">
          <label>${existing? 'New password (leave blank to keep current)' : 'Password'}</label>
          <input id="f_password" type="password" autocomplete="new-password" placeholder="At least 8 characters">
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13.5px;"><input type="checkbox" id="f_isadmin" style="width:auto;" ${s.isAdmin?'checked':''}> Admin (can manage staff)</label>
        </div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async ()=>{
    const username = document.getElementById('f_username').value.trim();
    if(!username){ showToast('Give it a username first'); return; }
    const password = document.getElementById('f_password').value;
    if(!existing && !password){ showToast('Set a password for the new account'); return; }
    const item = {
      username,
      displayName: document.getElementById('f_displayname').value.trim(),
      isAdmin: document.getElementById('f_isadmin').checked,
    };
    if(password) item.password = password;
    try{
      State.staff = existing ? await api.staff.update(s.id, item) : await api.staff.create(item);
      closeModal(); render(); showToast('Staff saved');
    }catch(e){ showToast(e.message || 'Could not save staff'); }
  };
}

function openPackagingModal(existing){
  if(existing) noteModalRef('packaging', existing.id);
  const p = existing || { id:null, size:'', price:0, weight:'', cost:'', vat:'Standard 20%' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit packaging':'Add packaging'}</h3>
        <div class="field"><label>Size</label><input id="f_size" value="${p.size}" placeholder="e.g. Medium (Shipped)"></div>
        <div class="grid2">
          <div class="field"><label>Price (£, inc VAT)</label><input id="f_price" type="number" step="any" value="${p.price}"></div>
          ${canSeeCosts() ? `<div class="field"><label>Cost (£, inc VAT)</label><input id="f_cost" type="number" step="any" value="${p.cost ?? ''}"></div>` : ''}
        </div>
        <div class="grid2">
          <div class="field"><label>Weight (kg)</label><input id="f_weight" type="number" step="0.001" value="${p.weight ?? ''}"></div>
          <div class="field">
            <label>VAT rate</label>
            <select id="f_vat">
              ${vatOptionsHtml(p.vat)}
            </select>
          </div>
        </div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
    document.getElementById('saveBtn').onclick = async ()=>{
    const size = document.getElementById('f_size').value.trim();
    if(!size){ showToast('Give it a size name first'); return; }
    const weightRaw = document.getElementById('f_weight').value;
    const item = {
      size,
      price: parseFloat(document.getElementById('f_price').value)||0,
      weight: weightRaw==='' ? null : parseFloat(weightRaw),
      vat: document.getElementById('f_vat').value,
    };
    // Non-admins don't see the cost field; leaving it out keeps the stored cost.
    const costEl = document.getElementById('f_cost');
    if(costEl) item.cost = costEl.value==='' ? null : parseFloat(costEl.value);
    try{
      State.packaging = existing ? await api.packaging.update(p.id, item) : await api.packaging.create(item);
      closeModal(); render(); showToast('Packaging saved');
    }catch(e){ showToast(e.message || 'Could not save packaging'); }
  };
}

function openShippingModal(existing){
  if(existing) noteModalRef('shipping', existing.id);
  const p = existing || { id:null, label:'', price:0, cost:'', vat:'Standard 20%' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit shipping':'Add shipping'}</h3>
        <div class="field"><label>Label</label><input id="f_label" value="${p.label}" placeholder="e.g. Medium (Shipped)"></div>
        <div class="grid2">
          <div class="field"><label>Price (£, inc VAT)</label><input id="f_price" type="number" step="any" value="${p.price}"></div>
          ${canSeeCosts() ? `<div class="field"><label>Cost (£, inc VAT)</label><input id="f_cost" type="number" step="any" value="${p.cost ?? ''}"></div>` : ''}
        </div>
        <div class="grid2">
          <div class="field">
            <label>VAT rate</label>
            <select id="f_vat">
              ${vatOptionsHtml(p.vat)}
            </select>
          </div>
        </div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = async ()=>{
    const label = document.getElementById('f_label').value.trim();
    if(!label){ showToast('Give it a label first'); return; }
    const item = {
      label,
      price: parseFloat(document.getElementById('f_price').value)||0,
      vat: document.getElementById('f_vat').value,
    };
    // Non-admins don't see the cost field; leaving it out keeps the stored cost.
    const costEl = document.getElementById('f_cost');
    if(costEl) item.cost = costEl.value==='' ? null : parseFloat(costEl.value);
    try{
      State.shipping = existing ? await api.shipping.update(p.id, item) : await api.shipping.create(item);
      closeModal(); render(); showToast('Shipping saved');
    }catch(e){ showToast(e.message || 'Could not save shipping'); }
  };
}

function openStockModal(existing, copyFrom){
  if(existing) noteModalRef('stock', existing.id);
  // A copy starts as a new item with the same details but no stock of its own.
  if(copyFrom) existing = null;
  const s = copyFrom ? Object.assign({}, copyFrom, { id:null, qtyOnHand:0, qtyOnOrder:0 }) : existing || { id:null, category:'', brand:'', itemName:'', v:false, vg:false, g:false, n:false, cost:0, price:0, weight:'', vat:'Standard 20%', availability:'In stock', qtyOnHand:0, qtyOnOrder:0 };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit item': copyFrom? 'Copy item' : 'Add item'}</h3>
        ${copyFrom? `<div class="savehint" style="margin-bottom:10px;">Copied from "${itemSearchLabel(copyFrom)}". Change what's different, then save as a new item.</div>` : ''}
        <div class="grid2">
          <div class="field"><label>Category</label>
            <select id="f_category">
              <option value="">No category</option>
              ${s.category && !ITEM_CATEGORIES.includes(s.category) ? `<option value="${s.category}" selected>${s.category} (not in list)</option>` : ''}
              ${ITEM_CATEGORIES.map(cat=>`<option value="${cat}" ${s.category===cat?'selected':''}>${cat}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Brand</label><input id="f_brand" value="${s.brand||''}" placeholder="e.g. Tiptree"></div>
        </div>
        <div class="field"><label>Item name</label><input id="f_itemname" value="${itemName(s)}" placeholder="e.g. Local honey jar 227g"></div>
        <div class="field">
          <label>Dietary</label>
          <div style="display:flex;gap:16px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="checkbox" id="f_v" style="width:auto;" ${s.v?'checked':''}> v</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="checkbox" id="f_vg" style="width:auto;" ${s.vg?'checked':''}> vg</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="checkbox" id="f_g" style="width:auto;" ${s.g?'checked':''}> g</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);"><input type="checkbox" id="f_n" style="width:auto;" ${s.n?'checked':''}> n</label>
          </div>
        </div>
        <div class="grid2">
          ${canSeeCosts() ? `<div class="field"><label>Cost (£, inc VAT)</label><input id="f_cost" type="number" step="any" value="${(s.cost||0).toFixed(2)}"></div>` : ''}
          <div class="field"><label>Price (£, inc VAT)</label><input id="f_price" type="number" step="any" value="${(s.price||0).toFixed(2)}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Weight (g)</label><input id="f_weight" type="number" step="1" value="${s.weight!=null?s.weight:''}" placeholder="e.g. 227"></div>
          <div class="field"><label>VAT</label>
            <select id="f_vat">
              ${vatOptionsHtml(s.vat)}
            </select>
          </div>
        </div>
        <div class="field"><label>Availability</label>
          <select id="f_availability">
            ${['In stock','Low stock','Out of stock','Discontinued','Seasonal only'].map(v=>`<option ${s.availability===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="grid2">
          <div class="field"><label>Quantity on hand</label><input id="f_qty" type="number" step="1" value="${s.qtyOnHand||0}"></div>
          <div class="field"><label>Quantity on order</label><input id="f_qtyorder" type="number" step="1" value="${s.qtyOnOrder||0}"></div>
        </div>
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Cancel</button>
          <button class="primary" id="saveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
    document.getElementById('saveBtn').onclick = async ()=>{
    const name = document.getElementById('f_itemname').value.trim();
    if(!name){ showToast('Give it an item name first'); return; }
    const item = {
      category: document.getElementById('f_category').value,
      brand: document.getElementById('f_brand').value.trim(),
      itemName: name,
      v: document.getElementById('f_v').checked,
      vg: document.getElementById('f_vg').checked,
      g: document.getElementById('f_g').checked,
      n: document.getElementById('f_n').checked,
      price: Math.round((parseFloat(document.getElementById('f_price').value)||0)*100)/100,
      weight: document.getElementById('f_weight').value==='' ? null : parseFloat(document.getElementById('f_weight').value),
      vat: document.getElementById('f_vat').value,
      availability: document.getElementById('f_availability').value,
      qtyOnHand: parseFloat(document.getElementById('f_qty').value)||0,
      qtyOnOrder: parseFloat(document.getElementById('f_qtyorder').value)||0,
    };
    // Non-admins don't see the cost field; leaving it out keeps the stored cost.
    const costEl = document.getElementById('f_cost');
    if(costEl) item.cost = Math.round((parseFloat(costEl.value)||0)*100)/100;
    try{
      State.stock = existing ? await api.stock.update(s.id, item) : await api.stock.create(item);
      closeModal(); render(); showToast('Item saved');
    }catch(e){ showToast(e.message || 'Could not save item'); }
  };
}

async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    // Older browsers, or the clipboard API unavailable: fall back to a hidden box.
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(err){ ok = false; }
    ta.remove();
    return ok;
  }
}

function openProductModal(existing, duplicateFrom){
  if(existing) noteModalRef('product', existing.id);
  const p = existing ? JSON.parse(JSON.stringify(existing))
    : duplicateFrom ? Object.assign(JSON.parse(JSON.stringify(duplicateFrom)), { id:null, name:'' })
    : { id:null, name:'', components:[], packagingId:null, shippingId:null, photoUrl:'', photoUrls:[], priceOverrides:{}, notes:'' };
  if(p.notes==null) p.notes = '';
  if(!Array.isArray(p.photoUrls)) p.photoUrls = p.photoUrl ? [p.photoUrl] : [];
  if(!p.priceOverrides) p.priceOverrides = {};
  const duplicateOfName = duplicateFrom ? duplicateFrom.name : null;
  const pendingPhotos = []; // { file, preview } — uploaded to /api/uploads only once Save is clicked

  function renderComps(){
    return `
    <div class="comprow comphead" style="font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">
      <span>Item</span><span>Qty</span><span>Price (£)</span><span></span>
    </div>
    ${p.components.map((c,i)=>{
      const s = stockById(c.componentId);
      const val = s ? itemSearchLabel(s).replace(/"/g,'&quot;') : '';
      const priceVal = c.price!=null ? c.price : (s? s.price : 0);
      return `
    <div class="comprow">
      <input type="text" class="compNameInput" data-cidx="${i}" value="${val}" placeholder="Search item name or brand...">
      <input type="number" step="1" min="0" class="compQty" data-cidx="${i}" value="${c.qty}">
      <input type="number" step="any" min="0" class="compPrice" data-cidx="${i}" value="${priceVal}">
      <button class="small danger" data-removecomp="${i}">×</button>
    </div>`;
    }).join('')}`;
  }

  function photosHtml(){
    const thumbs = p.photoUrls.map((url,i)=>`<div class="photoThumb"><img src="${url}"><button class="small danger" data-removephoto="${i}" title="Remove photo">×</button></div>`)
      .concat(pendingPhotos.map((ph,i)=>`<div class="photoThumb"><img src="${ph.preview}"><button class="small danger" data-removependingphoto="${i}" title="Remove photo">×</button></div>`));
    return `<div class="photoGrid">${thumbs.join('') || '<div class="savehint" style="margin:0;">No photos yet.</div>'}</div>
      ${thumbs.length>1 ? `<div class="savehint" style="margin-top:4px;">The first photo is the main one, used in lists and proposals.</div>` : ''}`;
  }

  function overrideInput(v){
    const key = v.isShipping ? SHIPPING_OVERRIDE_KEY : v.rate;
    const val = p.priceOverrides[key];
    return `<input type="text" inputmode="decimal" class="priceOverride" data-rate="${key}" value="${val!=null ? val : ''}" placeholder="${(Math.round(v.calculated*100)/100).toFixed(2)}">`;
  }

  function totalsHtml(){
    const totals = computeHamperTotals(p);
    const hideCosts = State.hideHamperCosts || !canSeeCosts();
    const anyOverride = totals.vatBreakdown.some(v=>v.overridden);
    const shippingIncVat = totals.vatBreakdown.filter(v=>v.isShipping).reduce((sum,v)=>sum+v.totalIncVat, 0);
    const goodsIncVat = totals.totalIncVat - shippingIncVat;
    return `
      <div class="panel" style="margin-top:14px;background:var(--paper);padding:14px 16px;">
        <div class="grid2">
          ${hideCosts ? '' : `<div><div class="ometa">Total cost (inc VAT)</div><div style="font-weight:500;font-size:15px;">${fmtMoney(totals.cost)}</div></div>`}
          <div><div class="ometa">Total weight</div><div style="font-weight:500;font-size:15px;">${totals.weight.toFixed(0)} g</div></div>
        </div>
        <div class="priceSplit" style="margin-top:10px;">
          <div><div class="ometa">Hamper price (inc VAT)</div><div style="font-weight:500;font-size:15px;">${fmtMoney(goodsIncVat)}</div></div>
          <div><div class="ometa">Shipping price (inc VAT)</div><div style="font-weight:500;font-size:15px;">${totals.shipping || shippingIncVat ? fmtMoney(shippingIncVat) : 'No shipping'}</div></div>
          <div><div class="ometa">Total price (inc VAT)${anyOverride ? ' — overridden' : ''}</div><div style="font-weight:600;font-size:19px;">${fmtMoney(totals.totalIncVat)}</div></div>
        </div>
        ${hideCosts ? '' : `<div style="margin-top:10px;"><div class="ometa">Profit (ex VAT)</div><div style="font-weight:600;font-size:19px;">${profitToggleHtml(totals.profit,'font-weight:600;font-size:19px;')}</div></div>`}
        ${totals.vatBreakdown.length? `<table class="overrideTable" style="margin-top:10px;"><thead><tr><th>VAT rate</th><th>Ex VAT</th><th>VAT</th><th>Inc VAT</th><th>Override inc VAT (£)</th></tr></thead><tbody>
          ${totals.vatBreakdown.map(v=>`<tr>
            <td>${breakdownLabel(v)}</td><td>${fmtMoney(v.subtotal)}</td><td>${fmtMoney(v.vatAmount)}</td><td>${fmtMoney(v.totalIncVat)}</td>
            <td>${overrideInput(v)}</td>
          </tr>`).join('')}
        </tbody></table>
        <div class="savehint">Leave an override blank to use the calculated price (items and packaging, or the Shipping page for shipping).</div>` : `<div class="savehint">Add items to see a price breakdown.</div>`}
      </div>
    `;
  }

  function wireOverrides(){
    document.querySelectorAll('.priceOverride').forEach(inp=>{
      inp.oninput = ()=>{
        const raw = inp.value.replace(/[£,\s]/g,'');
        if(raw===''){ delete p.priceOverrides[inp.dataset.rate]; }
        else if(Number.isFinite(Number(raw)) && Number(raw)>=0){ p.priceOverrides[inp.dataset.rate] = Number(raw); }
        refreshTotals();
      };
    });
  }

  function refreshTotals(){
    const el = document.getElementById('hamperTotals');
    if(!el) return;
    // Re-rendering replaces the override boxes, so put the cursor back.
    const focused = document.activeElement && document.activeElement.classList.contains('priceOverride') ? document.activeElement : null;
    const focusRate = focused ? focused.dataset.rate : null;
    const caret = focused ? focused.selectionStart : null;
    const typed = focused ? focused.value : null;
    el.innerHTML = totalsHtml();
    wireProfitToggles(el);
    wireOverrides();
    if(focusRate!=null){
      const again = [...el.querySelectorAll('.priceOverride')].find(x=>x.dataset.rate===focusRate);
      if(again){ again.value = typed; again.focus(); try{ again.setSelectionRange(caret, caret); }catch(e){ /* ignore */ } }
    }
  }

  function paint(focusCompIdx){
    // Repainting replaces the modal, so carry its scroll position across
    // rather than jumping back to the top every time a line changes.
    const prevModal = document.querySelector('#modalRoot .modal');
    const prevScroll = prevModal ? prevModal.scrollTop : 0;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal wide">
          <h3>${existing? 'Edit hamper': duplicateFrom? 'Copy hamper' : 'Add hamper'}</h3>
          ${duplicateFrom? `<div class="savehint" style="margin-bottom:10px;">Copied from "${duplicateOfName}" — give this hamper its own name before saving.</div>` : ''}
          <div class="field"><label>Hamper name</label><input id="f_name" value="${p.name.replace(/"/g,'&quot;')}" placeholder="e.g. The Bishop's Stortford"></div>
          <div class="field">
            <label>Packaging</label>
            <select id="f_packaging">
              <option value="">No packaging</option>
              ${State.packaging.map(pk=>`<option value="${pk.id}" ${pk.id===p.packagingId?'selected':''}>${pk.size} — ${fmtMoney(pk.price)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Shipping</label>
            <select id="f_shipping">
              <option value="">No shipping</option>
              ${State.shipping.map(sh=>`<option value="${sh.id}" ${sh.id===p.shippingId?'selected':''}>${sh.label} — ${fmtMoney(sh.price)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Photos</label>
            <div id="photoList">${photosHtml()}</div>
            <input id="f_photo" type="file" accept="image/*" multiple style="margin-top:8px;">
          </div>
          <div class="field"><label>Notes</label><textarea id="f_pnotes" rows="3">${escHtml(p.notes)}</textarea></div>
          <div class="row-between" style="margin:0 0 4px;">
            <label style="margin:0;">Items</label>
            ${p.components.length ? `<button class="linkbtn" id="copyItemsBtn" data-nodirty title="Copy each item and its quantity, ready to paste into an email or spreadsheet">Copy item list</button>` : ''}
          </div>
          <div id="compList">${renderComps()}</div>
          ${State.stock.length? `<button class="linkbtn" id="addCompBtn">+ Add item</button>` : `<div class="savehint">Add items first, then come back to build this recipe.</div>`}
          <div id="hamperTotals">${totalsHtml()}</div>
          <div class="row-between" style="margin-top:18px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.querySelector('#modalRoot .modal').scrollTop = prevScroll;
    if(focusCompIdx!=null){
      const inp = document.querySelector(`.compNameInput[data-cidx="${focusCompIdx}"]`);
      if(inp){ inp.focus({ preventScroll:true }); inp.scrollIntoView({ block:'nearest' }); }
    }
    document.getElementById('cancelBtn').onclick = closeModal;
    wireProfitToggles(document.getElementById('hamperTotals'));
    wireOverrides();
    document.getElementById('f_name').oninput = (e)=>{ p.name = e.target.value; };
    document.getElementById('f_pnotes').oninput = (e)=>{ p.notes = e.target.value; };
    const copyBtn = document.getElementById('copyItemsBtn');
    if(copyBtn) copyBtn.onclick = async ()=>{
      // Item and quantity only, tab separated so it pastes into two columns.
      const rows = p.components.filter(c=>c.componentId).map(c=>{ const st = stockById(c.componentId); return `${st ? itemSearchLabel(st) : 'Unknown item'}\t${c.qty}`; });
      if(!rows.length){ showToast('No items to copy yet'); return; }
      const ok = await copyText(['Item\tQty', ...rows].join('\n'));
      showToast(ok ? `Copied ${rows.length} item${rows.length===1?'':'s'}` : 'Could not copy. Your browser blocked the clipboard.');
    };
    document.getElementById('f_packaging').onchange = (e)=>{ p.packagingId = e.target.value || null; refreshTotals(); };
    document.getElementById('f_shipping').onchange = (e)=>{ p.shippingId = e.target.value || null; refreshTotals(); };
    const wirePhotos = ()=>{
      document.querySelectorAll('[data-removephoto]').forEach(b=>{
        b.onclick = ()=>{ p.photoUrls.splice(parseInt(b.dataset.removephoto),1); document.getElementById('photoList').innerHTML = photosHtml(); wirePhotos(); };
      });
      document.querySelectorAll('[data-removependingphoto]').forEach(b=>{
        b.onclick = ()=>{ pendingPhotos.splice(parseInt(b.dataset.removependingphoto),1); document.getElementById('photoList').innerHTML = photosHtml(); wirePhotos(); };
      });
    };
    wirePhotos();
    document.getElementById('f_photo').addEventListener('change', (e)=>{
      [...e.target.files].forEach(file=>{
        const entry = { file, preview:'' };
        pendingPhotos.push(entry);
        const reader = new FileReader();
        reader.onload = ()=>{ entry.preview = reader.result; document.getElementById('photoList').innerHTML = photosHtml(); wirePhotos(); };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    });
    if(document.getElementById('addCompBtn')){
      document.getElementById('addCompBtn').onclick = ()=>{
        p.components.push({ componentId: null, qty: 1, price: 0 });
        paint(p.components.length-1);
      };
    }
    document.querySelectorAll('[data-removecomp]').forEach(b=>{
      b.onclick = ()=>{ p.components.splice(parseInt(b.dataset.removecomp),1); paint(); };
    });
    const itemOptions = ()=> State.stock.map(s=>({ id: s.id, label: itemSearchLabel(s), text: s.category||'' }));
    document.querySelectorAll('.compNameInput').forEach(inp=>{
      const idx = parseInt(inp.dataset.cidx);
      attachSearchBox(inp, {
        options: itemOptions,
        onPick: (id)=>{
          if(p.components[idx].componentId===id) return;
          const s = stockById(id);
          p.components[idx].componentId = id;
          p.components[idx].price = s ? s.price : 0;
          paint();
        },
        onNoMatch: ()=>{
          if(!p.components[idx].componentId && !inp.value.trim()) return;
          p.components[idx].componentId = null;
          p.components[idx].price = 0;
          paint();
        },
      });
    });
    document.querySelectorAll('.compQty').forEach(inp=>{
      inp.oninput = ()=>{ p.components[parseInt(inp.dataset.cidx)].qty = parseInt(inp.value)||0; refreshTotals(); };
    });
    document.querySelectorAll('.compPrice').forEach(inp=>{
      inp.oninput = ()=>{ p.components[parseInt(inp.dataset.cidx)].price = parseFloat(inp.value)||0; refreshTotals(); };
    });
    document.getElementById('saveBtn').onclick = async ()=>{
      const name = document.getElementById('f_name').value.trim();
      if(!name){ showToast('Give it a name first'); return; }
      if(duplicateFrom && name.toLowerCase() === (duplicateOfName||'').toLowerCase()){ showToast('Give the copy a new name before saving'); return; }
      if(p.components.some(c=>!c.componentId)){ showToast('Match every item to something in your Items list'); return; }
      p.name = name;
      // Only keep overrides for VAT rates this hamper's goods still use.
      const liveRates = new Set(computeHamperTotals(Object.assign({}, p, { priceOverrides:{} })).vatBreakdown.map(v=> v.isShipping ? SHIPPING_OVERRIDE_KEY : v.rate));
      Object.keys(p.priceOverrides).forEach(r=>{ if(!liveRates.has(r)) delete p.priceOverrides[r]; });
      try{
        for(const ph of pendingPhotos){
          const uploaded = await api.uploads.image(ph.file);
          p.photoUrls.push(uploaded.url);
        }
        pendingPhotos.length = 0;
        p.photoUrl = p.photoUrls[0] || '';
        State.products = existing ? await api.products.update(p.id, p) : await api.products.create(p);
        closeModal(); render(); showToast(duplicateFrom? 'Hamper copied' : 'Hamper saved');
      }catch(e){ showToast(e.message || 'Could not save hamper'); }
    };
  }
  paint();
}

const CUSTOMER_CSV_FIELDS = ['id','companyName','sourceLabel','contactName','email','phonePrimary','phoneSecondary','contactName2','email2','phone2Primary','phone2Secondary','ribbonColor','fontColor','notes'];

function downloadCustomersCsv(){
  const rows = getFilteredSortedCustomers();
  if(!rows.length){ showToast('No customers to export'); return; }
  const csv = Papa.unparse(rows.map(c => ({
    id: c.id, companyName: c.companyName||'', source: c.sourceLabel||'', contactName: c.contactName||'', email: c.email||'',
    phonePrimary: c.phonePrimary||'', phoneSecondary: c.phoneSecondary||'', contactName2: c.contactName2||'', email2: c.email2||'', phone2Primary: c.phone2Primary||'', phone2Secondary: c.phone2Secondary||'',
    ribbonColor: c.ribbonColor||'', fontColor: c.fontColor||'', notes: c.notes||'',
    numberOfOrders: c.orderCount, totalOrderValue: c.totalValue.toFixed(2)
  })));
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'stort-valley-customers.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV downloaded');
}

async function uploadCustomersCsv(file){
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results)=>{
      const incoming = results.data;
      if(!incoming.length){ showToast('No rows found in that CSV'); return; }
      try{
        const result = await api.customers.import(incoming);
        State.customers = result.customers;
        render();
        showToast(`CSV imported — ${result.added} added, ${result.updated} updated`);
      }catch(e){
        showToast(e.message || 'Could not import that CSV');
      }
    },
    error: ()=> showToast('Could not read that CSV file')
  });
}

function openCustomerOrdersModal(customerId){
  const cust = customerById(customerId);
  const custOrders = State.orders.filter(o=>o.customerId===customerId).slice().reverse();
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal" style="width:520px;">
        <h3>Orders — ${cust? customerLink(cust, cust.companyName) : 'Unknown customer'}</h3>
        ${custOrders.length ? custOrders.map(o=>{
          const items = o.items.map(orderLineLabel).join(', ');
          return `<div class="ordercard" style="cursor:pointer;" data-openorderfrommodal="${o.id}">
            <div class="orow">
              <div>
                <div class="oname">${items} <span class="mono">#${o.id.slice(-5)}</span></div>
                <div class="ometa">${o.deliveryDate? 'Dispatch: '+o.deliveryDate : ''}</div>
                <div style="margin-top:6px;">${statusBadge(o.status)} <span class="mono" style="margin-left:8px;">${fmtMoney(computeOrderValue(o))}</span></div>
              </div>
            </div>
          </div>`;
        }).join('') : `<div class="empty">No orders for this customer yet.</div>`}
        <div class="row-between" style="margin-top:16px;">
          <button class="ghost" id="cancelBtn">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cancelBtn').onclick = closeModal;
  wireCustomerLinks(document.getElementById('modalRoot'));
    document.querySelectorAll('[data-openorderfrommodal]').forEach(card=>{
    card.onclick = ()=>{
      const order = State.orders.find(o=>o.id===card.dataset.openorderfrommodal);
      closeModal();
      if(order) openOrderModal(order);
    };
  });
}

function openCustomerModal(existing, opts){
  if(existing) noteModalRef('customer', existing.id);
  opts = opts || {};
  const c = existing ? JSON.parse(JSON.stringify(existing)) : { id:null, companyName:'', contactName:'', email:'', phonePrimary:'', phoneSecondary:'', contactName2:'', phone2Primary:'', phone2Secondary:'', email2:'', ribbonColor:'', fontColor:'', sourceId:null, notes:'', logoUrl:'' };
  let pendingLogoFile = null; // uploaded to /api/uploads only once Save is clicked
  // Zoho Books: search to fill the form from an existing Zoho customer, or
  // create the new customer in Zoho too when saving.
  const zb = { search: existing ? existing.companyName : '', results: null, busy: false, changing: false, createInZoho: true, linkedName: '' };
  function zohoCustBoxHtml(){
    if(c.zohoContactId && !zb.changing){
      return `<div class="field"><label>Zoho Books</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span>${zb.linkedName ? `Linked to <strong>${escHtml(zb.linkedName)}</strong>` : 'Linked'}</span>${zohoContactLink(c.zohoContactId, 'Open in Zoho')}
        <button class="linkbtn" id="zohoChangeBtn">Change</button></div></div>`;
    }
    const rows = zb.results;
    return `<div class="field zohoFind">
      <label>${existing ? 'Find this customer in Zoho' : 'Search Zoho first'}</label>
      <div style="display:flex;gap:8px;"><input id="zohoSearchInput" placeholder="Company name or email" value="${escHtml(zb.search)}"><button class="ghost small" id="zohoSearchBtn" style="white-space:nowrap;" ${zb.busy?'disabled':''}>${zb.busy?'Searching…':'Search Zoho'}</button></div>
      ${rows ? (rows.length ? `<div class="zohoResults">${rows.map(z=>`<div class="zohoResult">
          <div><strong>${escHtml(z.name)}</strong><div class="savehint" style="margin:0;">${escHtml([z.contactPerson, z.email, z.phone].filter(Boolean).join(' · ') || 'No contact details')}</div></div>
          ${z.linkedTo && z.linkedTo.id !== c.id ? `<span class="savehint" style="margin:0;">Already here as ${escHtml(z.linkedTo.name)}</span>` : `<button class="small primary" data-zohouse="${escHtml(z.id)}">Use this</button>`}
        </div>`).join('')}</div>` : `<div class="savehint">No customer in Zoho matches that.</div>`) : ''}
      ${!existing ? `<label class="checkline"><input type="checkbox" id="zohoCreateChk" ${zb.createInZoho?'checked':''}> If they're not in Zoho, create them there too when saving</label>` : ''}
      ${zb.changing ? `<button class="linkbtn" id="zohoKeepBtn">Keep the current link</button>` : ''}
    </div>`;
  }
  function paintZohoBox(){
    const box = document.getElementById('zohoCustBox');
    if(!box) return;
    box.innerHTML = zohoCustBoxHtml();
    const input = document.getElementById('zohoSearchInput');
    const run = async ()=>{
      zb.search = input.value.trim();
      if(zb.search.length < 2){ showToast('Type at least 2 letters to search Zoho'); return; }
      zb.busy = true; paintZohoBox();
      try{ zb.results = await api.zoho.searchContacts(zb.search); }
      catch(e){ showToast(e.message || 'Could not search Zoho'); }
      zb.busy = false; paintZohoBox();
    };
    if(input){
      input.onkeydown = (e)=>{ if(e.key==='Enter'){ e.preventDefault(); run(); } };
      document.getElementById('zohoSearchBtn').onclick = run;
    }
    const chk = document.getElementById('zohoCreateChk');
    if(chk) chk.onchange = ()=>{ zb.createInZoho = chk.checked; };
    const change = document.getElementById('zohoChangeBtn');
    if(change) change.onclick = ()=>{ zb.changing = true; paintZohoBox(); };
    const keep = document.getElementById('zohoKeepBtn');
    if(keep) keep.onclick = ()=>{ zb.changing = false; paintZohoBox(); };
    box.querySelectorAll('[data-zohouse]').forEach(b=>{
      b.onclick = async ()=>{
        b.disabled = true;
        try{
          const z = await api.zoho.getContact(b.dataset.zohouse);
          const f = z.fields;
          const set = (id, val, always)=>{ const el = document.getElementById(id); if(el && val && (always || !existing || !el.value.trim())) el.value = val; };
          // A new customer takes everything from Zoho. An existing one takes
          // Zoho's name and only fills in details it doesn't have yet.
          set('f_company', f.companyName, true);
          set('f_contact', f.contactName); set('f_email', f.email); set('f_phone', f.phonePrimary); set('f_phone_secondary', f.phoneSecondary);
          set('f_contact2', f.contactName2); set('f_email2', f.email2); set('f_phone2', f.phone2Primary); set('f_phone2_secondary', f.phone2Secondary);
          c.zohoContactId = z.id; zb.linkedName = f.companyName; zb.changing = false;
          const st = modalState(); if(st) st.dirty = true;
          paintZohoBox();
          showToast(existing ? 'Linked to Zoho. Save to keep it.' : 'Filled in from Zoho');
        }catch(e){ b.disabled = false; showToast(e.message || 'Could not load that Zoho customer'); }
      };
    });
  }

  function paint(){
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal">
          <h3>${existing? 'Edit customer':'Add customer'}</h3>
          ${zohoConnected() ? `<div id="zohoCustBox" data-nodirty>${zohoCustBoxHtml()}</div>` : ''}
          <div class="field"><label>Company name</label><input id="f_company" value="${escHtml(c.companyName)}"></div>
          <div class="field">
            <label>Source</label>
            <select id="f_source">
              <option value="">No source</option>
              ${State.sources.map(s=>`<option value="${s.id}" ${s.id===c.sourceId?'selected':''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Main contact name</label><input id="f_contact" value="${escHtml(c.contactName)}"></div>
          <div class="grid3">
            <div class="field"><label>Email address</label><input id="f_email" type="email" value="${escHtml(c.email)}"></div>
            <div class="field"><label>Primary phone</label><input id="f_phone" value="${escHtml(c.phonePrimary)}"></div>
            <div class="field"><label>Secondary phone</label><input id="f_phone_secondary" value="${escHtml(c.phoneSecondary)}"></div>
          </div>
          <div class="field"><label>2nd contact name</label><input id="f_contact2" value="${escHtml(c.contactName2)}"></div>
          <div class="grid3">
            <div class="field"><label>2nd email address</label><input id="f_email2" type="email" value="${escHtml(c.email2)}"></div>
            <div class="field"><label>2nd primary phone</label><input id="f_phone2" value="${escHtml(c.phone2Primary)}"></div>
            <div class="field"><label>2nd secondary phone</label><input id="f_phone2_secondary" value="${escHtml(c.phone2Secondary)}"></div>
          </div>
          <div class="grid2">
            <div class="field">
              <label>Ribbon colour</label>
              <div class="colourChoice">
                <span id="ribbonSwatch">${colourSwatch(c.ribbonColor, 22)}</span>
                <select id="f_ribbon_pick">
                  <option value="">No ribbon colour</option>
                  ${State.colours.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(col=>`<option value="${escHtml(col.name)}" ${colourByName(c.ribbonColor)===col?'selected':''}>${escHtml(col.name)}</option>`).join('')}
                  <option value="__other" ${c.ribbonColor && !colourByName(c.ribbonColor) ? 'selected' : ''}>Other (type it in)</option>
                </select>
              </div>
              <input id="f_ribbon" value="${escHtml(c.ribbonColor && !colourByName(c.ribbonColor) ? c.ribbonColor : '')}" placeholder="Type a colour name or hex" style="margin-top:6px;${c.ribbonColor && !colourByName(c.ribbonColor) ? '' : 'display:none;'}">
            </div>
            <div class="field"><label>Font colour</label><input id="f_font" value="${c.fontColor||''}"></div>
          </div>
          <div class="field">
            <label>Logo</label>
            <div class="logoPreviewRow">
              ${c.logoUrl? `<img src="${c.logoUrl}" class="logoThumb" id="logoPreview">` : `<div class="logoThumb" id="logoPreview" style="background:var(--kraft);"></div>`}
              <input id="f_logo" type="file" accept="image/*" style="flex:1;">
            </div>
          </div>
          <div class="field"><label>Notes</label><textarea id="f_notes" rows="3">${c.notes||''}</textarea></div>
          <div class="row-between" style="margin-top:16px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.getElementById('cancelBtn').onclick = ()=>{ if(opts.onCancel) opts.onCancel(); else closeModal(); };
    paintZohoBox();
    const ribbonPick = document.getElementById('f_ribbon_pick'), ribbonText = document.getElementById('f_ribbon');
    const ribbonValue = ()=> ribbonPick.value==='__other' ? ribbonText.value.trim() : ribbonPick.value;
    const showRibbon = ()=>{ document.getElementById('ribbonSwatch').innerHTML = colourSwatch(ribbonValue(), 22); };
    ribbonPick.onchange = ()=>{
      ribbonText.style.display = ribbonPick.value==='__other' ? '' : 'none';
      if(ribbonPick.value==='__other') ribbonText.focus();
      showRibbon();
    };
    ribbonText.oninput = showRibbon;
    document.getElementById('f_logo').addEventListener('change', (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      pendingLogoFile = file;
      const reader = new FileReader();
      reader.onload = ()=>{
        const prev = document.getElementById('logoPreview');
        prev.outerHTML = `<img src="${reader.result}" class="logoThumb" id="logoPreview">`;
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('saveBtn').onclick = async ()=>{
      const companyName = document.getElementById('f_company').value.trim();
      if(!companyName){ showToast('Give the company a name first'); return; }
      c.companyName = companyName;
      c.sourceId = document.getElementById('f_source').value || null;
      c.contactName = document.getElementById('f_contact').value.trim();
      c.email = document.getElementById('f_email').value.trim();
      c.phonePrimary = document.getElementById('f_phone').value.trim();
      c.phoneSecondary = document.getElementById('f_phone_secondary').value.trim();
      c.contactName2 = document.getElementById('f_contact2').value.trim();
      c.email2 = document.getElementById('f_email2').value.trim();
      c.phone2Primary = document.getElementById('f_phone2').value.trim();
      c.phone2Secondary = document.getElementById('f_phone2_secondary').value.trim();
      c.ribbonColor = ribbonValue();
      c.fontColor = document.getElementById('f_font').value.trim();
      c.notes = document.getElementById('f_notes').value.trim();
      try{
        if(pendingLogoFile){
          const uploaded = await api.uploads.image(pendingLogoFile);
          c.logoUrl = uploaded.url;
        }
        const createInZoho = !existing && zohoConnected() && !c.zohoContactId && zb.createInZoho;
        const result = existing ? await api.customers.update(c.id, c) : await api.customers.create({ ...c, createInZoho });
        State.customers = result.customers;
        showToast(result.zohoError ? `Customer saved here, but not in Zoho. ${result.zohoError}` : createInZoho ? 'Customer saved here and in Zoho' : !existing && c.zohoContactId ? 'Customer saved and linked to Zoho' : 'Customer saved');
        if(opts.onDone){ opts.onDone({ ...c, id: result.id }); } else { closeModal(); render(); }
      }catch(e){ showToast(e.message || 'Could not save customer'); }
    };
  }
  paint();
}

function openProposalModal(existing){
  if(existing) noteModalRef('proposal', existing.id);
  const todayStr = new Date().toISOString().slice(0,10);
  const pr = existing ? JSON.parse(JSON.stringify(existing)) : { id:null, name:'', customerId: null, proposalDate: todayStr, status:'Draft', excludeShipping:false, hamperIds: [], docUrl:'', docName:'', docSource:'' };
  if(!PROPOSAL_STATUSES.includes(pr.status)) pr.status = 'Draft';
  // The name follows the customer and date until someone types their own.
  let nameIsDefault = !pr.name || pr.name===defaultProposalName(pr.customerId, pr.proposalDate);
  if(!pr.name) pr.name = defaultProposalName(pr.customerId, pr.proposalDate);
  const refreshDefaultName = ()=>{
    if(!nameIsDefault) return;
    pr.name = defaultProposalName(pr.customerId, pr.proposalDate);
    const el = document.getElementById('f_propname');
    if(el) el.value = pr.name;
  };
  // normalize to exactly 10 slots (null = no selection)
  while(pr.hamperIds.length < 10) pr.hamperIds.push(null);
  pr.hamperIds = pr.hamperIds.slice(0,10);

  function paint(){
    const selectedCust = customerById(pr.customerId);
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal" style="width:480px;">
          <h3>${existing? 'Edit proposal':'Add proposal'}</h3>
          <div class="field"><label>Proposal name</label><input id="f_propname" type="text" value="${escHtml(pr.name)}"></div>
          <div class="field">
            <label>Customer</label>
            ${State.customers.length? `
              <input type="text" id="f_customer" value="${selectedCust? customerLabel(selectedCust).replace(/"/g,'&quot;') : ''}" placeholder="Select customer (type company or contact name)">` : `<div class="savehint">No customers yet — add one below.</div>`}
            <button class="linkbtn" id="addCustomerBtn" data-nodirty style="margin-top:4px;">+ Add new customer</button>
          </div>
          <div class="grid2">
            <div class="field"><label>Proposal date</label><input id="f_propdate" type="date" value="${pr.proposalDate||''}"></div>
            <div class="field"><label>Status</label><select id="f_propstatus">${PROPOSAL_STATUSES.map(st=>`<option value="${st}" ${st===pr.status?'selected':''}>${st}</option>`).join('')}</select></div>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13.5px;margin:0;"><input type="checkbox" id="f_propnoship" style="width:auto;" ${pr.excludeShipping?'checked':''}> Exclude shipping on proposal</label>
            <div class="savehint" style="margin-top:4px;">The generated document quotes each hamper's price without shipping.</div>
          </div>
          <label>Hamper options</label>
          <div style="margin-top:6px;">
            ${State.products.length? [0,1,2,3,4,5,6,7,8,9].map(i=>{
              const current = pr.hamperIds[i];
              return `<div class="field">
                <select class="hamperSlot" data-slot="${i}">
                  <option value="">No hamper</option>
                  ${State.products.map(p=>{
                    return `<option value="${p.id}" ${current===p.id?'selected':''}>${p.name} — ${fmtMoney(proposalHamperPrice(p, pr.excludeShipping))}</option>`;
                  }).join('')}
                </select>
              </div>`;
            }).join('') : `<div class="savehint">Add a hamper recipe first.</div>`}
          </div>
          <div class="row-between" style="margin-top:18px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.getElementById('cancelBtn').onclick = closeModal;
    document.getElementById('addCustomerBtn').onclick = ()=>{
      openCustomerModal(null, {
        onDone: (newCustomer)=>{ pr.customerId = newCustomer.id; refreshDefaultName(); paint(); },
        onCancel: ()=> paint()
      });
    };
    if(document.getElementById('f_customer')){
      attachSearchBox(document.getElementById('f_customer'), {
        options: customerSearchOptions,
        onPick: (id)=>{ if(pr.customerId!==id){ pr.customerId = id; refreshDefaultName(); paint(); } },
        onNoMatch: ()=>{ if(pr.customerId){ pr.customerId = null; refreshDefaultName(); paint(); } },
      });
    }
    document.getElementById('f_propname').oninput = (e)=>{ pr.name = e.target.value; nameIsDefault = false; };
    document.getElementById('f_propnoship').onchange = (e)=>{ pr.excludeShipping = e.target.checked; paint(); };
    document.getElementById('f_propdate').oninput = (e)=>{ pr.proposalDate = e.target.value; refreshDefaultName(); };
    document.getElementById('f_propstatus').onchange = (e)=>{ pr.status = e.target.value; };
    document.querySelectorAll('.hamperSlot').forEach(sel=>{
      sel.onchange = (e)=>{ pr.hamperIds[parseInt(sel.dataset.slot)] = e.target.value || null; };
    });
    document.getElementById('saveBtn').onclick = async ()=>{
      if(!pr.customerId){ showToast('Choose or add a customer'); return; }
      pr.name = pr.name.trim() || defaultProposalName(pr.customerId, pr.proposalDate);
      const chosen = pr.hamperIds.filter(Boolean);
      const hasDuplicates = new Set(chosen).size !== chosen.length;
      if(hasDuplicates){ showToast('The same hamper has been chosen more than once — please pick different options'); return; }
      try{
        State.proposals = existing ? await api.proposals.update(pr.id, pr) : await api.proposals.create(pr);
        closeModal(); render(); showToast('Proposal saved');
      }catch(e){ showToast(e.message || 'Could not save proposal'); }
    };
  }
  paint();
}

// prefill (new orders only): starting values, e.g. from a proposal.
function openOrderModal(existing, prefill){
  const todayStr = new Date().toISOString().slice(0,10);
  const o = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ id:null, customerId: null, orderDate: todayStr, deliveryDate:'', notes:'', status:'Proposal', priority:'Medium', readyToInvoice:false, invoiceSent:false, items:[], stockDeducted:false, proposalId:null }, prefill || {});
  o.items.forEach(it=>{ if(!it.kind) it.kind = it.stockId ? 'item' : 'hamper'; });
  if(!PRIORITIES.includes(o.priority)) o.priority = 'Medium';
  if(existing) noteModalRef('order', existing.id);

  function clamp(val, min, max){ return Math.max(min, Math.min(max, val)); }
  const expanded = new Set(); // hamper line indexes whose item list is open

  function hamperContentsHtml(it){
    const p = productById(it.productId);
    if(!p) return '<div class="savehint">Unknown hamper.</div>';
    const lineQty = it.qty||0;
    const comps = p.components.map(c=>{
      const s = stockById(c.componentId);
      const name = s ? itemSearchLabel(s) : 'Unknown item';
      const total = (c.qty||0)*lineQty;
      return `<li>${c.qty} × ${name}${lineQty>1 ? ` <span class="mono">(${total} in total)</span>` : ''}</li>`;
    }).join('');
    const pack = p.packagingId ? State.packaging.find(pk=>pk.id===p.packagingId) : null;
    return `${comps ? `<ul class="hamperContents">${comps}</ul>` : '<div class="savehint">No items in this hamper.</div>'}
      ${pack ? `<div class="ometa">Packaging: ${pack.size}</div>` : ''}`;
  }

  function renderItems(){
    return `
    <table style="margin-bottom:10px;"><thead><tr><th>Hamper or item</th><th>Ordered</th><th>Packed</th><th>Shipped</th><th></th></tr></thead><tbody>
    ${o.items.map((it,i)=>{
      if(isItemLine(it)){
        const st = it.stockId ? stockById(it.stockId) : null;
        return `
      <tr>
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="lineKind" title="A single item, not a hamper">Item</span>
            <input type="text" class="itemLineSearch" data-iidx="${i}" value="${st ? escHtml(itemSearchLabel(st)) : ''}" placeholder="Search items...">
          </div>
          <div class="ometa" style="margin:4px 0 0 52px;">${st ? `Price each: ${fmtMoney(st.price)} (inc VAT)` : 'Pick an item from your Items list'}</div>
        </td>
        <td><input type="number" step="1" min="0" class="itemQty" data-iidx="${i}" value="${it.qty}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemPacked" data-iidx="${i}" value="${it.qtyPacked||0}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemShipped" data-iidx="${i}" value="${it.qtyShipped||0}" style="width:64px;"></td>
        <td><button class="small danger" data-removeitem="${i}">×</button></td>
      </tr>`;
      }
      const p = productById(it.productId);
      const ship = p && p.shippingId ? State.shipping.find(sh=>sh.id===p.shippingId) : null;
      const open = expanded.has(i);
      return `
      <tr>
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="small ghost expandBtn" data-nodirty data-toggleitems="${i}" title="${open?'Hide':'Show'} items in this hamper">${open?'▾':'▸'}</button>
            <select data-iidx="${i}" class="itemSelect">
              ${State.products.map(p=>`<option value="${p.id}" ${p.id===it.productId?'selected':''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="ometa" style="margin:4px 0 0 36px;">Shipping: ${ship ? `${ship.label} (${fmtMoney(ship.price)})` : 'None'}</div>
        </td>
        <td><input type="number" step="1" min="0" class="itemQty" data-iidx="${i}" value="${it.qty}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemPacked" data-iidx="${i}" value="${it.qtyPacked||0}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemShipped" data-iidx="${i}" value="${it.qtyShipped||0}" style="width:64px;"></td>
        <td><button class="small danger" data-removeitem="${i}">×</button></td>
      </tr>
      ${open ? `<tr class="contentsRow"><td colspan="5" style="padding-left:46px;">${hamperContentsHtml(it)}</td></tr>` : ''}`;
    }).join('')}
    </tbody></table>`;
  }

  function orderTotalsHtml(){
    const totals = computeOrderTotals(o);
    // One block of rows per hamper line (one row per VAT rate in it), then
    // the order's totals per VAT rate.
    // Hamper and item rows are the price of one; the order total covers the
    // full quantities.
    const lineRows = totals.lines.map(line=>line.vatBreakdown.map((v,vi)=>`<tr${vi===0?' class="groupStart"':''}>
        ${vi===0 ? `<td rowspan="${line.vatBreakdown.length}">${escHtml(line.name)}${line.isItem ? ' <span class="mono">(item)</span>' : ''}</td><td rowspan="${line.vatBreakdown.length}">${line.qty}</td>` : ''}
        <td>${breakdownLabel(v)}</td><td>${fmtMoney(v.subtotal)}</td><td>${fmtMoney(v.vatAmount)}</td><td>${fmtMoney(v.totalIncVat)}</td>
      </tr>`).join('')).join('');
    const totalRows = totals.vatBreakdown.map((v,vi)=>`<tr class="totalRow${vi===0?' groupStart':''}">
        ${vi===0 ? `<td rowspan="${totals.vatBreakdown.length}" colspan="2">Order total</td>` : ''}
        <td>${breakdownLabel(v)}</td><td>${fmtMoney(v.subtotal)}</td><td>${fmtMoney(v.vatAmount)}</td><td>${fmtMoney(v.totalIncVat)}</td>
      </tr>`).join('');
    return `
      <div class="panel" style="margin-top:14px;background:var(--paper);padding:14px 16px;">
        <div class="grid2">
          ${canSeeCosts() ? `<div><div class="ometa">Total cost (inc VAT)</div><div style="font-weight:500;font-size:15px;">${fmtMoney(totals.cost)}</div></div>` : ''}
          <div><div class="ometa">Total price (inc VAT)</div><div style="font-weight:600;font-size:15px;">${fmtMoney(totals.totalIncVat)}</div></div>
        </div>
        ${canSeeCosts() ? `<div style="margin-top:10px;"><div class="ometa">Profit (ex VAT)</div><div style="font-weight:600;font-size:19px;">${profitToggleHtml(totals.profit,'font-weight:600;font-size:19px;')}</div></div>` : ''}
        ${totals.vatBreakdown.length? hscroll(`<table class="priceSummary" style="margin-top:10px;"><thead><tr><th>Hamper or item</th><th>Qty</th><th>VAT rate</th><th>Ex VAT</th><th>VAT</th><th>Inc VAT</th></tr></thead><tbody>
          ${lineRows}${totalRows}
        </tbody></table>`) + `<div class="savehint" style="margin-top:6px;">Each hamper or item row is the price of one. The order total is for all of them.</div>` : `<div class="savehint">Add hampers or items to see a price breakdown.</div>`}
      </div>
    `;
  }

  function refreshOrderTotals(){
    const el = document.getElementById('orderTotals');
    if(el) el.innerHTML = orderTotalsHtml();
    wireProfitToggles(el);
    wireHScrolls();
  }

  function customerDetailsHtml(cust){
    if(!cust) return '';
    const colour = (label, value)=> `<div><div class="ometa">${label}</div><div style="margin-top:2px;display:flex;align-items:center;gap:6px;">${value ? colourSwatch(value) : ''}${escHtml(value) || '—'}</div></div>`;
    return `<div class="grid2" style="margin-bottom:12px;">${colour('Ribbon colour', cust.ribbonColor)}${colour('Font colour', cust.fontColor)}</div>`;
  }

  function paint(){
    const selectedCust = customerById(o.customerId);
    const prevModal = document.querySelector('#modalRoot .modal');
    const prevScroll = prevModal ? prevModal.scrollTop : 0;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal" style="width:680px;">
          <h3>${existing? 'Edit order':'Add order'}</h3>
          <div class="field">
            <label>Customer</label>
            ${State.customers.length? `
              <input type="text" id="f_customer" value="${selectedCust? customerLabel(selectedCust).replace(/"/g,'&quot;') : ''}" placeholder="Select customer (type company or contact name)">` : `<div class="savehint">No customers yet — add one below.</div>`}
            <button class="linkbtn" id="addCustomerBtn" data-nodirty style="margin-top:4px;">+ Add new customer</button>
            ${selectedCust ? `<button class="linkbtn" id="editCustomerBtn" data-nodirty style="margin:4px 0 0 12px;">Edit customer</button>` : ''}
          </div>
          ${customerDetailsHtml(selectedCust)}
          <div class="grid2">
            <div class="field"><label>Order date</label><input id="f_orderdate" type="date" value="${o.orderDate||''}"></div>
            <div class="field"><label>Dispatch date</label><input id="f_date" type="date" value="${o.deliveryDate||''}"></div>
          </div>
          <div class="field" style="max-width:200px;">
            <label>Priority</label>
            <select id="f_priority">${PRIORITIES.map(pr=>`<option value="${pr}" ${pr===o.priority?'selected':''}>${pr}</option>`).join('')}</select>
          </div>
          ${selectedCust && selectedCust.notes ? `<div class="field"><label>Customer notes (from the customer record)</label><div class="customerNotes">${escHtml(selectedCust.notes)}</div></div>` : ''}
          <div class="field"><label>Order notes</label><textarea id="f_notes" rows="2">${escHtml(o.notes)}</textarea></div>
          <label>Hampers and items ordered</label>
          <div id="itemList">${renderItems()}</div>
          <div style="display:flex;gap:16px;">
            ${State.products.length? `<button class="linkbtn" id="addItemBtn">+ Add hamper</button>` : ''}
            ${State.stock.length? `<button class="linkbtn" id="addSingleItemBtn">+ Add item</button>` : ''}
          </div>
          <div id="orderTotals">${orderTotalsHtml()}</div>
          <div class="field" style="margin-top:12px;">
            <div style="display:flex;gap:24px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13.5px;margin:0;"><input type="checkbox" id="f_invoice" style="width:auto;" ${o.readyToInvoice?'checked':''}> Ready to invoice</label>
              <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13.5px;margin:0;"><input type="checkbox" id="f_invoicesent" style="width:auto;" ${o.invoiceSent?'checked':''}> Invoice sent</label>
            </div>
          </div>
          ${existing && (o.zohoInvoiceId || (canSeeCosts() && zohoConnected())) ? `<div class="field" style="margin-top:12px;"><label>Zoho Books</label>
            ${o.zohoInvoiceId ? zohoInvoiceLink(o) : `<button class="ghost small" id="zohoCreateBtn" data-nodirty>Create draft invoice in Zoho</button>`}</div>` : ''}
          ${existing ? statusHistoryHtml(o) : ''}
          <div class="row-between" style="margin-top:16px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.querySelector('#modalRoot .modal').scrollTop = prevScroll;
    document.getElementById('cancelBtn').onclick = closeModal;
    wireProfitToggles(document.getElementById('orderTotals'));
    wireHScrolls();
    document.querySelectorAll('[data-toggleitems]').forEach(b=>{
      b.onclick = ()=>{
        const i = parseInt(b.dataset.toggleitems);
        if(expanded.has(i)) expanded.delete(i); else expanded.add(i);
        paint();
      };
    });
    if(document.getElementById('editCustomerBtn')){
      document.getElementById('editCustomerBtn').onclick = ()=>{
        openCustomerModal(customerById(o.customerId), { onDone: ()=> paint(), onCancel: ()=> paint() });
      };
    }
    document.getElementById('f_orderdate').oninput = (e)=>{ o.orderDate = e.target.value; };
    document.getElementById('f_date').oninput = (e)=>{ o.deliveryDate = e.target.value; };
    document.getElementById('f_notes').oninput = (e)=>{ o.notes = e.target.value; };
    document.getElementById('f_invoice').onchange = (e)=>{
      o.readyToInvoice = e.target.checked;
      // Ready to invoice again means the invoice hasn't gone yet.
      if(o.readyToInvoice){ o.invoiceSent = false; document.getElementById('f_invoicesent').checked = false; }
    };
    document.getElementById('f_invoicesent').onchange = (e)=>{
      o.invoiceSent = e.target.checked;
      // Sent means it's no longer waiting to be invoiced.
      if(o.invoiceSent){ o.readyToInvoice = false; document.getElementById('f_invoice').checked = false; }
    };
    document.getElementById('f_priority').onchange = (e)=>{ o.priority = e.target.value; };
    const zohoCreateBtn = document.getElementById('zohoCreateBtn');
    if(zohoCreateBtn) zohoCreateBtn.onclick = async ()=>{
      if(isModalDirty()){ showToast('Save the order first, then create the invoice'); return; }
      zohoCreateBtn.disabled = true; zohoCreateBtn.textContent = 'Creating in Zoho…';
      const result = await createZohoInvoices({ orderIds:[o.id] });
      const fresh = State.orders.find(x=>x.id===o.id);
      if(result && fresh && fresh.zohoInvoiceId) openOrderModal(fresh);
      else { zohoCreateBtn.disabled = false; zohoCreateBtn.textContent = 'Create draft invoice in Zoho'; }
    };
    document.getElementById('addCustomerBtn').onclick = ()=>{
      openCustomerModal(null, {
        onDone: (newCustomer)=>{ o.customerId = newCustomer.id; paint(); },
        onCancel: ()=> paint()
      });
    };
    if(document.getElementById('f_customer')){
      attachSearchBox(document.getElementById('f_customer'), {
        options: customerSearchOptions,
        onPick: (id)=>{ if(o.customerId!==id){ o.customerId = id; paint(); } },
        onNoMatch: ()=>{ if(o.customerId){ o.customerId = null; paint(); } },
      });
    }
    if(document.getElementById('addItemBtn')){
      document.getElementById('addItemBtn').onclick = ()=>{
        o.items.push({ kind:'hamper', productId: State.products[0].id, stockId:null, qty: 1, qtyPacked: 0, qtyShipped: 0 });
        o.notes = withHamperNote(o.notes, State.products[0].id);
        paint();
      };
    }
    if(document.getElementById('addSingleItemBtn')){
      document.getElementById('addSingleItemBtn').onclick = ()=>{
        o.items.push({ kind:'item', productId:null, stockId:null, qty: 1, qtyPacked: 0, qtyShipped: 0 });
        paint();
        const inputs = document.querySelectorAll('.itemLineSearch');
        if(inputs.length) inputs[inputs.length-1].focus();
      };
    }
    document.querySelectorAll('.itemLineSearch').forEach(inp=>{
      const idx = parseInt(inp.dataset.iidx);
      attachSearchBox(inp, {
        options: ()=> State.stock.map(st=>({ id: st.id, label: itemSearchLabel(st), text: st.category||'' })),
        onPick: (id)=>{ if(o.items[idx].stockId!==id){ o.items[idx].stockId = id; paint(); } },
        onNoMatch: ()=>{ if(o.items[idx].stockId){ o.items[idx].stockId = null; paint(); } },
      });
    });
    document.querySelectorAll('[data-removeitem]').forEach(b=>{
      b.onclick = ()=>{
        const idx = parseInt(b.dataset.removeitem);
        const removed = o.items.splice(idx,1)[0];
        if(removed && !isItemLine(removed) && !o.items.some(it=>!isItemLine(it) && it.productId===removed.productId)) o.notes = withoutHamperNote(o.notes, removed.productId);
        // keep the open/closed state attached to the lines that remain
        const shifted = [...expanded].filter(i=>i!==idx).map(i=> i>idx ? i-1 : i);
        expanded.clear(); shifted.forEach(i=>expanded.add(i));
        paint();
      };
    });
    document.querySelectorAll('.itemSelect').forEach(sel=>{
      sel.onchange = ()=>{
        const line = o.items[parseInt(sel.dataset.iidx)];
        const oldId = line.productId;
        line.productId = sel.value;
        if(!o.items.some(it=>!isItemLine(it) && it.productId===oldId)) o.notes = withoutHamperNote(o.notes, oldId);
        o.notes = withHamperNote(o.notes, sel.value);
        paint();
      };
    });
    document.querySelectorAll('.itemQty').forEach(inp=>{
      inp.oninput = ()=>{
        const idx = parseInt(inp.dataset.iidx);
        const qty = Math.max(0, parseInt(inp.value)||0);
        o.items[idx].qty = qty;
        o.items[idx].qtyPacked = clamp(o.items[idx].qtyPacked||0, 0, qty);
        o.items[idx].qtyShipped = clamp(o.items[idx].qtyShipped||0, 0, qty);
        refreshOrderTotals();
      };
      inp.onchange = ()=>{ if(expanded.has(parseInt(inp.dataset.iidx))) paint(); };
    });
    document.querySelectorAll('.itemPacked').forEach(inp=>{
      inp.oninput = ()=>{
        const idx = parseInt(inp.dataset.iidx);
        const val = clamp(parseInt(inp.value)||0, 0, o.items[idx].qty);
        o.items[idx].qtyPacked = val;
        inp.value = val;
      };
    });
    document.querySelectorAll('.itemShipped').forEach(inp=>{
      inp.oninput = ()=>{
        const idx = parseInt(inp.dataset.iidx);
        const val = clamp(parseInt(inp.value)||0, 0, o.items[idx].qty);
        o.items[idx].qtyShipped = val;
        inp.value = val;
      };
    });
    document.getElementById('saveBtn').onclick = async ()=>{
      if(!o.customerId){ showToast('Choose or add a customer'); return; }
      if(!o.items.length){ showToast('Add at least one hamper or item'); return; }
      if(o.items.some(it=>isItemLine(it) && !it.stockId)){ showToast('Pick an item for every item line, or remove it'); return; }
      o.orderDate = document.getElementById('f_orderdate').value;
      o.deliveryDate = document.getElementById('f_date').value;
      o.notes = document.getElementById('f_notes').value.trim();
      o.readyToInvoice = document.getElementById('f_invoice').checked;
      o.invoiceSent = document.getElementById('f_invoicesent').checked;
      o.priority = document.getElementById('f_priority').value;
      try{
        State.orders = existing ? await api.orders.update(o.id, o) : await api.orders.create(o);
        if(!existing && o.proposalId){
          const pr = State.proposals.find(x=>x.id===o.proposalId);
          if(pr) pr.status = 'Accepted';
        }
        closeModal(); render(); showToast(o.proposalId && !existing ? 'Order created from the proposal' : 'Order saved');
      }catch(e){ showToast(e.message || 'Could not save order'); }
    };
  }
  paint();
}

function fmtDateTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusHistoryHtml(o){
  const rows = (o.statusHistory||[]).slice().sort((a,b)=> a.changedAt < b.changedAt ? -1 : a.changedAt > b.changedAt ? 1 : 0);
  return `<div class="field" style="margin-top:14px;">
    <label>Status history</label>
    ${rows.length ? `<table class="historyTable"><thead><tr><th>When</th><th>Change</th><th>By</th></tr></thead><tbody>
      ${rows.map(h=>`<tr>
        <td style="white-space:nowrap;">${fmtDateTime(h.changedAt)}</td>
        <td>${h.fromStatus ? `${escHtml(h.fromStatus)} → ${escHtml(h.toStatus)}` : `Created as ${escHtml(h.toStatus)}`}</td>
        <td>${escHtml(h.username || 'Unknown')}</td>
      </tr>`).join('')}
    </tbody></table>` : `<div class="savehint" style="margin:0;">No status changes recorded yet. Changes are recorded from now on.</div>`}
  </div>`;
}

// Opens a new order filled in from a proposal: its customer and every hamper
// on it, each with a quantity of 0 to fill in. Saving it marks the proposal
// Accepted.
function convertProposalToOrder(pr){
  if(!pr) return;
  const hamperIds = (pr.hamperIds||[]).filter(id=> id && productById(id));
  if(!hamperIds.length){ showToast('This proposal has no hampers to put on an order'); return; }
  openOrderModal(null, {
    customerId: pr.customerId,
    proposalId: pr.id,
    notes: hamperIds.reduce((notes, id)=> withHamperNote(notes, id), ''),
    items: hamperIds.map(id=>({ kind:'hamper', productId:id, stockId:null, qty:0, qtyPacked:0, qtyShipped:0 })),
  });
}

// A hamper's own notes go into the order notes as "Hamper name: notes",
// once, when the hamper goes on the order. withoutHamperNote takes that line
// back out (if nobody has edited it) when the hamper comes off again.
function hamperNoteLine(productId){
  const p = productById(productId);
  return p && (p.notes||'').trim() ? `${p.name}: ${p.notes.trim()}` : '';
}
function withHamperNote(notes, productId){
  const line = hamperNoteLine(productId);
  if(!line || (notes||'').includes(line)) return notes||'';
  return notes ? notes.replace(/\s+$/,'')+'\n'+line : line;
}
function withoutHamperNote(notes, productId){
  const line = hamperNoteLine(productId);
  if(!line || !notes) return notes||'';
  return notes.split('\n').filter(l=>l!==line).join('\n');
}

function openRowEditor(kind, id){
  noteModalRef(kind, id);
  const find = (list)=> list.find(x=>x.id===id);
  if(kind==='order'){ const o = find(State.orders); if(o) openOrderModal(o); }
  if(kind==='proposal'){ const pr = find(State.proposals); if(pr) openProposalModal(pr); }
  if(kind==='product'){ const p = find(State.products); if(p) openProductModal(p); }
  if(kind==='stock'){ const st = find(State.stock); if(st) openStockModal(st); }
  if(kind==='customer'){ const c = find(State.customers); if(c) openCustomerModal(c); }
  if(kind==='packaging'){ const pk = find(State.packaging); if(pk) openPackagingModal(pk); }
  if(kind==='shipping'){ const sh = find(State.shipping); if(sh) openShippingModal(sh); }
  if(kind==='source'){ const src = find(State.sources); if(src) openSourceModal(src); }
  if(kind==='colour'){ const col = find(State.colours); if(col) openColourModal(col); }
  if(kind==='staff'){ const st = find(State.staff); if(st) openStaffModal(st); }
}

function wireCustomerLinks(root){
  (root||document).querySelectorAll('[data-custlink]').forEach(el=>{
    el.onclick = (e)=>{
      e.stopPropagation();
      const c = customerById(el.dataset.custlink);
      if(c) openCustomerModal(c);
    };
  });
}

// ---------- Event delegation for dynamically rendered buttons ----------
function attachHandlers(){
  wireProfitToggles(document);
  wireHScrolls();
  wireCustomerLinks(document.getElementById('main'));
  document.querySelectorAll('#main .clickrow').forEach(row=>{
    row.onclick = (e)=>{
      if(e.target.closest(ROW_CLICK_IGNORE)) return;
      // don't hijack a click-and-drag to select/copy text
      if(window.getSelection && String(window.getSelection()).length) return;
      openRowEditor(row.dataset.rowkind, row.dataset.rowid);
    };
  });
  document.querySelectorAll('[data-gotab]').forEach(el=>{
    el.onclick = ()=>{ setTab(el.dataset.gotab); window.scrollTo(0,0); };
  });
  const hideHamperCosts = document.getElementById('hideHamperCosts');
  if(hideHamperCosts){
    hideHamperCosts.onchange = (e)=>{
      State.hideHamperCosts = e.target.checked;
      try{ localStorage.setItem('hh.hideHamperCosts', e.target.checked ? '1' : ''); }catch(err){ /* not critical */ }
      render();
    };
  }
  const reportSelect = document.getElementById('reportSelect');
  if(reportSelect) reportSelect.onchange = (e)=>{ State.reportSelection = e.target.value; render(); };
  wireOrdersReportFilters();
  const zohoConnectBtn = document.getElementById('zohoConnectBtn');
  if(zohoConnectBtn) zohoConnectBtn.onclick = ()=>{ location.href = '/api/zoho/connect?region=' + encodeURIComponent(document.getElementById('zohoRegion').value); };
  const zohoDisconnectBtn = document.getElementById('zohoDisconnectBtn');
  if(zohoDisconnectBtn) zohoDisconnectBtn.onclick = ()=>{
    openConfirmModal('Disconnect Zoho Books? Invoices already made stay in Zoho; you can connect again any time.', async ()=>{
      try{ await api.zoho.disconnect(); State.zoho = await api.zoho.status(); render(); showToast('Zoho Books disconnected'); }
      catch(e){ showToast(e.message || 'Could not disconnect'); }
    }, { title:'Disconnect Zoho Books?', confirmLabel:'Disconnect' });
  };
  const zohoSyncSentBtn = document.getElementById('zohoSyncSentBtn');
  if(zohoSyncSentBtn) zohoSyncSentBtn.onclick = async ()=>{
    zohoSyncSentBtn.disabled = true; zohoSyncSentBtn.textContent = 'Checking Zoho…';
    try{
      const r = await api.zoho.syncSent();
      State.orders = r.orders; render();
      showToast(r.updated.length ? `${r.updated.length} order${r.updated.length===1?'':'s'} marked Invoice sent` : r.checked ? `No new sent invoices (${r.checked} still draft${r.checked===1?'':'s'} in Zoho)` : 'No Zoho drafts waiting to be sent');
    }catch(e){ showToast(e.message || 'Could not reach Zoho'); render(); }
  };
  const zohoSendReadyBtn = document.getElementById('zohoSendReadyBtn');
  if(zohoSendReadyBtn) zohoSendReadyBtn.onclick = async ()=>{
    zohoSendReadyBtn.disabled = true; zohoSendReadyBtn.textContent = 'Creating in Zoho…';
    await createZohoInvoices({ allReady: true });
  };
  wireProductionDrag();
  document.querySelectorAll('[data-togglehamperitems]').forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.togglehamperitems;
      const cell = b.closest('.hamperItemsCell');
      if(State.expandedHampers.has(id)) State.expandedHampers.delete(id); else State.expandedHampers.add(id);
      cell.classList.toggle('open', State.expandedHampers.has(id));
      wireHScrolls();
    };
  });
  const expandAll = document.getElementById('expandAllHampers');
  if(expandAll) expandAll.onclick = ()=>{ State.products.forEach(p=>State.expandedHampers.add(p.id)); render(); };
  const collapseAll = document.getElementById('collapseAllHampers');
  if(collapseAll) collapseAll.onclick = ()=>{ State.expandedHampers.clear(); render(); };
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  if(downloadReportBtn) downloadReportBtn.onclick = async ()=>{
    const report = REPORTS.find(r=>r.id===State.reportSelection);
    if(!report){ showToast('No report selected'); return; }
    const result = await report.generate();
    if(!result) return; // generate() already showed a toast explaining why
    const { filename, blob } = result;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const proposalSearch = document.getElementById('proposalSearch');
  if(proposalSearch) proposalSearch.oninput = (e)=>{ State.proposalFilter.search = e.target.value; renderProposalsOnly(); };
  const proposalStatusFilter = document.getElementById('proposalStatusFilter');
  if(proposalStatusFilter) proposalStatusFilter.onchange = (e)=>{ State.proposalFilter.status = e.target.value; render(); };
  const proposalCustomerFilter = document.getElementById('proposalCustomerFilter');
  if(proposalCustomerFilter) proposalCustomerFilter.onchange = (e)=>{ State.proposalFilter.customerId = e.target.value; render(); };
  const clearProposalFilters = document.getElementById('clearProposalFilters');
  if(clearProposalFilters) clearProposalFilters.onclick = ()=>{ State.proposalFilter = { search:'', status:'', customerId:'' }; render(); };
  const newProposalBtn = document.getElementById('newProposalBtn');
  if(newProposalBtn) newProposalBtn.onclick = ()=> openProposalModal(null);
  document.querySelectorAll('[data-editproposal]').forEach(b=>{
    b.onclick = ()=> openProposalModal(State.proposals.find(p=>p.id===b.dataset.editproposal));
  });
  document.querySelectorAll('[data-delproposal]').forEach(b=>{
    b.onclick = ()=>{
      const pr = State.proposals.find(p=>p.id===b.dataset.delproposal);
      const cust = pr ? customerById(pr.customerId) : null;
      openConfirmModal(`Delete the proposal "${escHtml(proposalName(pr))}"? This can't be undone.`, async ()=>{
        State.proposals = await api.proposals.remove(b.dataset.delproposal);
        render(); showToast('Proposal deleted');
      });
    };
  });
  document.querySelectorAll('[data-convertproposal]').forEach(b=>{
    b.onclick = ()=> convertProposalToOrder(State.proposals.find(p=>p.id===b.dataset.convertproposal));
  });
  document.querySelectorAll('[data-generateproposal]').forEach(b=>{
    b.onclick = ()=>{
      const pr = State.proposals.find(p=>p.id===b.dataset.generateproposal);
      if(pr && pr.docUrl){
        openConfirmModal(
          `This proposal already has a document (${pr.docName || 'saved document'}${pr.docSource==='uploaded'?' — uploaded':''}). Generating a new one will overwrite it and any edits made to it will be lost. Continue?`,
          async ()=>{ await generateProposalDoc(b.dataset.generateproposal); },
          { title:'Overwrite existing document?', confirmLabel:'Generate & overwrite', confirmClass:'primary' }
        );
      } else {
        generateProposalDoc(b.dataset.generateproposal);
      }
    };
  });
  document.querySelectorAll('[data-downloadproposal]').forEach(b=>{
    b.onclick = ()=> downloadProposalDoc(b.dataset.downloadproposal);
  });
  document.querySelectorAll('[data-uploadproposal]').forEach(b=>{
    b.onclick = ()=>{
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.doc,.docx';
      input.onchange = (e)=>{
        const file = e.target.files[0];
        if(file) uploadProposalDoc(b.dataset.uploadproposal, file);
      };
      input.click();
    };
  });

  const newOrderBtn = document.getElementById('newOrderBtn');
  if(newOrderBtn) newOrderBtn.onclick = ()=> openOrderModal(null);

  const orderSearch = document.getElementById('orderSearch');
  if(orderSearch){
    orderSearch.oninput = (e)=>{ State.orderFilter.search = e.target.value; renderOrdersOnly(); };
  }
  const orderStatusFilter = document.getElementById('orderStatusFilter');
  if(orderStatusFilter){
    orderStatusFilter.onchange = (e)=>{ State.orderFilter.status = e.target.value; render(); };
  }
  const orderInvoiceFilter = document.getElementById('orderInvoiceFilter');
  if(orderInvoiceFilter){
    orderInvoiceFilter.onchange = (e)=>{ State.orderFilter.readyToInvoice = e.target.value; render(); };
  }
  const clearOrderFilters = document.getElementById('clearOrderFilters');
  if(clearOrderFilters){
    clearOrderFilters.onclick = ()=>{ State.orderFilter = { search:'', status:'', readyToInvoice:'' }; render(); };
  }
  const orderSortCol = document.getElementById('orderSortCol');
  if(orderSortCol){
    orderSortCol.onchange = (e)=>{ State.orderSort.col = e.target.value; render(); };
  }
  const orderSortDir = document.getElementById('orderSortDir');
  if(orderSortDir){
    orderSortDir.onclick = ()=>{ State.orderSort.dir = State.orderSort.dir==='asc' ? 'desc' : 'asc'; render(); };
  }
  const newProductBtn = document.getElementById('newProductBtn');
  if(newProductBtn) newProductBtn.onclick = ()=> openProductModal(null);

  const productSearch = document.getElementById('productSearch');
  if(productSearch){
    productSearch.oninput = (e)=>{ State.productFilter.search = e.target.value; renderProductsOnly(); };
  }
  const clearProductFilters = document.getElementById('clearProductFilters');
  if(clearProductFilters){
    clearProductFilters.onclick = ()=>{ State.productFilter = { search:'' }; render(); };
  }
  document.querySelectorAll('[data-sortproductcol]').forEach(th=>{
    th.onclick = ()=>{
      const col = th.dataset.sortproductcol;
      if(State.productSort.col === col){ State.productSort.dir = State.productSort.dir==='asc' ? 'desc' : 'asc'; }
      else { State.productSort = { col, dir:'asc' }; }
      render();
    };
  });
  const newStockBtn = document.getElementById('newStockBtn');
  if(newStockBtn) newStockBtn.onclick = ()=> openStockModal(null);

  const newPackagingBtn = document.getElementById('newPackagingBtn');
  if(newPackagingBtn) newPackagingBtn.onclick = ()=> openPackagingModal(null);
  document.querySelectorAll('[data-editpackaging]').forEach(b=>{
    b.onclick = ()=> openPackagingModal(State.packaging.find(p=>p.id===b.dataset.editpackaging));
  });
  document.querySelectorAll('[data-delpackaging]').forEach(b=>{
    b.onclick = ()=>{
      const pk = State.packaging.find(p=>p.id===b.dataset.delpackaging);
      openConfirmModal(`Delete the packaging option "${pk? pk.size : ''}"? Any hampers using it will lose that packaging. This can't be undone.`, async ()=>{
        State.packaging = await api.packaging.remove(b.dataset.delpackaging);
        render(); showToast('Packaging deleted');
      });
    };
  });

  const newShippingBtn = document.getElementById('newShippingBtn');
  if(newShippingBtn) newShippingBtn.onclick = ()=> openShippingModal(null);
  document.querySelectorAll('[data-editshipping]').forEach(b=>{
    b.onclick = ()=> openShippingModal(State.shipping.find(p=>p.id===b.dataset.editshipping));
  });
  document.querySelectorAll('[data-delshipping]').forEach(b=>{
    b.onclick = ()=>{
      const sh = State.shipping.find(p=>p.id===b.dataset.delshipping);
      openConfirmModal(`Delete the shipping option "${sh? sh.label : ''}"? This can't be undone.`, async ()=>{
        State.shipping = await api.shipping.remove(b.dataset.delshipping);
        render(); showToast('Shipping deleted');
      });
    };
  });

  const newColourBtn = document.getElementById('newColourBtn');
  if(newColourBtn) newColourBtn.onclick = ()=> openColourModal(null);
  document.querySelectorAll('[data-editcolour]').forEach(b=>{
    b.onclick = ()=> openColourModal(State.colours.find(c=>c.id===b.dataset.editcolour));
  });
  document.querySelectorAll('[data-delcolour]').forEach(b=>{
    b.onclick = ()=>{
      const col = State.colours.find(c=>c.id===b.dataset.delcolour);
      openConfirmModal(`Delete the colour "${escHtml(col? col.name : '')}"? Customers using it keep the name as typed text.`, async ()=>{
        State.colours = await api.colours.remove(b.dataset.delcolour);
        render(); showToast('Colour deleted');
      });
    };
  });
  // The picker column saves straight away.
  document.querySelectorAll('[data-colourpick]').forEach(inp=>{
    inp.onchange = async ()=>{
      const col = State.colours.find(c=>c.id===inp.dataset.colourpick);
      if(!col) return;
      try{
        State.colours = await api.colours.update(col.id, Object.assign({}, col, { hex: inp.value.toUpperCase(), rgb: hexToRgbText(inp.value) }));
        render(); showToast(`${col.name} updated`);
      }catch(e){ showToast(e.message || 'Could not save colour'); }
    };
  });
  const newSourceBtn = document.getElementById('newSourceBtn');
  if(newSourceBtn) newSourceBtn.onclick = ()=> openSourceModal(null);
  document.querySelectorAll('[data-editsource]').forEach(b=>{
    b.onclick = ()=> openSourceModal(State.sources.find(s=>s.id===b.dataset.editsource));
  });
  document.querySelectorAll('[data-delsource]').forEach(b=>{
    b.onclick = ()=>{
      const src = State.sources.find(s=>s.id===b.dataset.delsource);
      openConfirmModal(`Delete the source "${src? src.label : ''}"? Any customers using it will lose that source. This can't be undone.`, async ()=>{
        State.sources = await api.sources.remove(b.dataset.delsource);
        render(); showToast('Source deleted');
      });
    };
  });

  const newStaffBtn = document.getElementById('newStaffBtn');
  if(newStaffBtn) newStaffBtn.onclick = ()=> openStaffModal(null);
  document.querySelectorAll('[data-editstaff]').forEach(b=>{
    b.onclick = ()=> openStaffModal(State.staff.find(s=>s.id===b.dataset.editstaff));
  });
  document.querySelectorAll('[data-delstaff]').forEach(b=>{
    b.onclick = ()=>{
      const staffMember = State.staff.find(s=>s.id===b.dataset.delstaff);
      openConfirmModal(`Delete the staff account "${staffMember? staffMember.username : ''}"? This can't be undone.`, async ()=>{
        try{
          State.staff = await api.staff.remove(b.dataset.delstaff);
          render(); showToast('Staff account deleted');
        }catch(e){ showToast(e.message || 'Could not delete staff account'); }
      });
    };
  });

  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  if(downloadCsvBtn) downloadCsvBtn.onclick = downloadStockCsv;
  const uploadCsvBtn = document.getElementById('uploadCsvBtn');
  const csvFileInput = document.getElementById('csvFileInput');
  if(uploadCsvBtn && csvFileInput){
    uploadCsvBtn.onclick = ()=> csvFileInput.click();
    csvFileInput.onchange = (e)=>{
      const file = e.target.files[0];
      if(file) uploadStockCsv(file);
      csvFileInput.value = '';
    };
  }
  const stockSearch = document.getElementById('stockSearch');
  if(stockSearch){
    stockSearch.oninput = (e)=>{ State.stockFilter.search = e.target.value; renderStockOnly(); };
  }
  const stockCategoryFilter = document.getElementById('stockCategoryFilter');
  if(stockCategoryFilter){
    stockCategoryFilter.onchange = (e)=>{ State.stockFilter.category = e.target.value; render(); };
  }
  const stockAvailabilityFilter = document.getElementById('stockAvailabilityFilter');
  if(stockAvailabilityFilter){
    stockAvailabilityFilter.onchange = (e)=>{ State.stockFilter.availability = e.target.value; render(); };
  }
  ['V','Vg','G','N'].forEach(suffix=>{
    const el = document.getElementById('dietFilter'+suffix);
    if(el){
      el.onchange = (e)=>{ State.stockFilter.diet[suffix.toLowerCase()] = e.target.checked; render(); };
    }
  });
  const clearStockFilters = document.getElementById('clearStockFilters');
  if(clearStockFilters){
    clearStockFilters.onclick = ()=>{ State.stockFilter = { search:'', category:'', availability:'', diet:{v:false,vg:false,g:false,n:false} }; render(); };
  }
  document.querySelectorAll('[data-sortcol]').forEach(th=>{
    th.onclick = ()=>{
      const col = th.dataset.sortcol;
      if(State.stockSort.col === col){ State.stockSort.dir = State.stockSort.dir==='asc' ? 'desc' : 'asc'; }
      else { State.stockSort = { col, dir:'asc' }; }
      render();
    };
  });
  const newCustomerBtn = document.getElementById('newCustomerBtn');
  if(newCustomerBtn) newCustomerBtn.onclick = ()=> openCustomerModal(null);
  const zohoMatchBtn = document.getElementById('zohoMatchBtn');
  if(zohoMatchBtn) zohoMatchBtn.onclick = ()=> openZohoMatchModal();

  const downloadCustomersCsvBtn = document.getElementById('downloadCustomersCsvBtn');
  if(downloadCustomersCsvBtn) downloadCustomersCsvBtn.onclick = downloadCustomersCsv;
  const uploadCustomersCsvBtn = document.getElementById('uploadCustomersCsvBtn');
  const customersCsvFileInput = document.getElementById('customersCsvFileInput');
  if(uploadCustomersCsvBtn && customersCsvFileInput){
    uploadCustomersCsvBtn.onclick = ()=> customersCsvFileInput.click();
    customersCsvFileInput.onchange = (e)=>{
      const file = e.target.files[0];
      if(file) uploadCustomersCsv(file);
      customersCsvFileInput.value = '';
    };
  }
  const customerSearch = document.getElementById('customerSearch');
  if(customerSearch){
    customerSearch.oninput = (e)=>{ State.customerFilter.search = e.target.value; renderCustomersOnly(); };
  }
  const clearCustomerFilters = document.getElementById('clearCustomerFilters');
  if(clearCustomerFilters){
    clearCustomerFilters.onclick = ()=>{ State.customerFilter = { search:'' }; render(); };
  }
  document.querySelectorAll('[data-sortcustomercol]').forEach(th=>{
    th.onclick = ()=>{
      const col = th.dataset.sortcustomercol;
      if(State.customerSort.col === col){ State.customerSort.dir = State.customerSort.dir==='asc' ? 'desc' : 'asc'; }
      else { State.customerSort = { col, dir:'asc' }; }
      render();
    };
  });
  document.querySelectorAll('[data-vieworders]').forEach(b=>{
    b.onclick = ()=> openCustomerOrdersModal(b.dataset.vieworders);
  });

  document.querySelectorAll('[data-editorder]').forEach(b=>{
    b.onclick = ()=> openOrderModal(State.orders.find(o=>o.id===b.dataset.editorder));
  });
  document.querySelectorAll('[data-delorder]').forEach(b=>{
    b.onclick = ()=>{
      const ord = State.orders.find(o=>o.id===b.dataset.delorder);
      const cust = ord ? customerById(ord.customerId) : null;
      const label = cust ? customerLabel(cust) : 'this order';
      openConfirmModal(`Delete the order for "${label}"? This can't be undone.`, async ()=>{
        State.orders = await api.orders.remove(b.dataset.delorder);
        render(); showToast('Order deleted');
      });
    };
  });
  document.querySelectorAll('[data-advance]').forEach(b=>{
    b.onclick = ()=> moveOrderStatus(b.dataset.advance, 1);
  });
  document.querySelectorAll('[data-regress]').forEach(b=>{
    b.onclick = ()=> moveOrderStatus(b.dataset.regress, -1);
  });
  document.querySelectorAll('[data-editproduct]').forEach(b=>{
    b.onclick = ()=> openProductModal(State.products.find(p=>p.id===b.dataset.editproduct));
  });
  document.querySelectorAll('[data-copyproduct]').forEach(b=>{
    b.onclick = ()=> openProductModal(null, State.products.find(p=>p.id===b.dataset.copyproduct));
  });
  document.querySelectorAll('[data-delproduct]').forEach(b=>{
    b.onclick = ()=>{
      const prod = State.products.find(p=>p.id===b.dataset.delproduct);
      openConfirmModal(`Delete the hamper "${prod? prod.name : ''}"? Any orders referencing it will show as unknown. This can't be undone.`, async ()=>{
        State.products = await api.products.remove(b.dataset.delproduct);
        render(); showToast('Hamper deleted');
      });
    };
  });
  document.querySelectorAll('[data-editstock]').forEach(b=>{
    b.onclick = ()=> openStockModal(State.stock.find(s=>s.id===b.dataset.editstock));
  });
  document.querySelectorAll('[data-copystock]').forEach(b=>{
    b.onclick = ()=> openStockModal(null, State.stock.find(s=>s.id===b.dataset.copystock));
  });
  document.querySelectorAll('[data-delstock]').forEach(b=>{
    b.onclick = ()=>{
      const s = State.stock.find(x=>x.id===b.dataset.delstock);
      openConfirmModal(`Delete the item "${s? itemName(s) : ''}"? Any hampers using it will lose that item. This can't be undone.`, async ()=>{
        State.stock = await api.stock.remove(b.dataset.delstock);
        render(); showToast('Item deleted');
      });
    };
  });
  document.querySelectorAll('[data-editcustomer]').forEach(b=>{
    b.onclick = ()=> openCustomerModal(State.customers.find(c=>c.id===b.dataset.editcustomer));
  });
  document.querySelectorAll('[data-delcustomer]').forEach(b=>{
    b.onclick = ()=>{
      const c = State.customers.find(x=>x.id===b.dataset.delcustomer);
      openConfirmModal(`Delete the customer "${c? c.companyName : ''}"? Any orders referencing them will show as unknown. This can't be undone.`, async ()=>{
        State.customers = await api.customers.remove(b.dataset.delcustomer);
        render(); showToast('Customer deleted');
      });
    };
  });
}

async function moveOrderStatus(id, direction, override){
  // Validation, the stock deduction/restoration, and persistence all happen
  // together in one server-side transaction (see POST /api/orders/:id/move)
  // so a half-applied move can't leave stock and order status out of sync.
  try{
    const result = await api.orders.move(id, direction, override);
    State.orders = result.orders;
    State.stock = result.stock;
    render();
    const o = State.orders.find(x=>x.id===id);
    showToast(o ? `Order marked "${o.status}"` : 'Order updated');
  }catch(e){
    if(e.status===409 && e.data && e.data.blockers){ openBlockedMoveDialog(id, direction, e.data.blockers); return; }
    showToast(e.message || 'Could not update order status');
  }
}

// Shown when a status change is held up by something not done yet: says
// why, then cancel, change the status anyway, or fill in what's missing and
// change it.
function openBlockedMoveDialog(id, direction, blockers){
  const o = State.orders.find(x=>x.id===id);
  const target = o ? ORDER_FLOW[ORDER_FLOW.indexOf(o.status) + direction] : '';
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay unsavedOverlay';
  wrap.innerHTML = `
    <div class="modal" style="width:440px;" role="alertdialog" aria-labelledby="blockedTitle">
      <h3 id="blockedTitle">This order isn't ready to be ${escHtml(target.toLowerCase())}</h3>
      <ul class="blockerList">${blockers.map(b=>`<li>${escHtml(b.message)}</li>`).join('')}</ul>
      <div class="savehint" style="margin:0 0 14px;">"Update order and save" will: ${blockers.map(b=>escHtml(b.fix.charAt(0).toLowerCase() + b.fix.slice(1))).join(', and ')}.</div>
      <div class="stackedActions">
        <button class="primary" data-act="fix">Update order and save</button>
        <button class="ghost" data-act="force">Save anyway</button>
        <button class="ghost" data-act="cancel">Cancel</button>
      </div>
    </div>`;
  const done = ()=>{ wrap.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e)=>{ if(e.key==='Escape'){ e.stopPropagation(); done(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.querySelector('[data-act="fix"]').onclick = ()=>{ done(); moveOrderStatus(id, direction, 'fix'); };
  wrap.querySelector('[data-act="force"]').onclick = ()=>{ done(); moveOrderStatus(id, direction, 'force'); };
  wrap.querySelector('[data-act="cancel"]').onclick = done;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-act="fix"]').focus();
}

// ---------- Auth ----------
function renderLogin(errorMsg){
  document.getElementById('app').innerHTML = `
    <div class="loginWrap">
      <div class="loginCard">
        <h1>Hamper Helper</h1>
        <p class="subtitle">Sign in to continue</p>
        <div class="loginError">${errorMsg||''}</div>
        <form id="loginForm">
          <div class="field"><label>Username</label><input id="f_username" autocomplete="username" autofocus></div>
          <div class="field"><label>Password</label><input id="f_password" type="password" autocomplete="current-password"></div>
          <button class="primary" type="submit" style="width:100%;">Log in</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const username = document.getElementById('f_username').value.trim();
    const password = document.getElementById('f_password').value;
    if(!username || !password){ renderLogin('Enter a username and password'); return; }
    try{
      State.me = await api.auth.login(username, password);
      await loadAll();
      render();
    }catch(err){
      renderLogin(err.message || 'Could not log in');
    }
  });
}

async function logout(){
  try{ await api.auth.logout(); }catch(e){ /* ignore — we're logging out regardless */ }
  State.me = null;
  renderLogin();
}

// ---------- Init ----------
setUnauthorizedHandler(()=>{
  State.me = null;
  renderLogin('Your session expired — please log in again');
});

// Report dropdowns close when you click elsewhere or press Escape.
document.addEventListener('click', (e)=>{
  document.querySelectorAll('.multiSelect.open').forEach(b=>{ if(!b.contains(e.target)) b.classList.remove('open'); });
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape') document.querySelectorAll('.multiSelect.open').forEach(b=>b.classList.remove('open'));
});

// ---------- Keeping up with other people's changes ----------
// Every 30 seconds, and whenever you come back to this tab, fetch everything
// again and redraw if anything changed. Skipped while a pop-up is open, while
// dragging, or while typing in a box on the page, so nothing you're doing is
// interrupted. Refreshes only count as "using the screen" (for the 3-hour
// idle logout) if you've clicked or typed since the last one.
const AUTO_REFRESH_MS = 30 * 1000;
let lastUserActivity = Date.now(), lastRefreshAt = Date.now(), refreshing = false;
['pointerdown','keydown','wheel','touchstart'].forEach(ev=> document.addEventListener(ev, ()=>{ lastUserActivity = Date.now(); }, { capture:true, passive:true }));

function dataSignature(){
  return JSON.stringify([State.products, State.stock, State.orders, State.customers, State.packaging, State.shipping, State.sources, State.proposals, State.staff, State.colours]);
}

async function refreshFromServer(){
  if(refreshing || !State.me || !State.loaded) return;
  if(document.visibilityState !== 'visible') return;
  if(document.getElementById('modalRoot').innerHTML.trim() || document.querySelector('.unsavedOverlay') || State.dragging) return;
  const active = document.activeElement;
  if(active && active.closest && active.closest('#main') && active.matches('input,textarea,select')) return;
  refreshing = true;
  const background = lastUserActivity < lastRefreshAt;
  lastRefreshAt = Date.now();
  try{
    const [data, staff] = await Promise.all([api.bootstrap({ background }), api.staff.list({ background })]);
    // Something may have opened or started while we waited.
    if(document.getElementById('modalRoot').innerHTML.trim() || State.dragging || !State.me) return;
    const before = dataSignature();
    Object.assign(State, { products: data.products, stock: data.stock, orders: data.orders, customers: data.customers, packaging: data.packaging, shipping: data.shipping, sources: data.sources, proposals: data.proposals, colours: data.colours || [], staff });
    if(dataSignature() !== before){
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
  }catch(e){
    // A dropped connection just waits for the next try; a logged-out
    // session has already been sent to the login screen.
  }finally{
    refreshing = false;
  }
}
setInterval(refreshFromServer, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') refreshFromServer(); });

(async function init(){
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:#6B6656;font-family:Inter,sans-serif;">Loading…</div>`;
  const start = parseHash();
  // Back from connecting Zoho Books.
  const qp = new URLSearchParams(location.search);
  const zohoMsg = qp.get('zoho')==='connected' ? 'Zoho Books connected' : qp.get('zoho_error');
  if(qp.has('zoho') || qp.has('zoho_error')) history.replaceState(null, '', location.pathname + location.hash);
  if(zohoMsg) setTimeout(()=> showToast(zohoMsg), 600);
  if(start.tab) State.tab = start.tab;
  State.me = await api.auth.session();
  if(!State.me){ renderLogin(); return; }
  await loadAll();
  render();
  syncHash();
  if(start.kind && start.id) openRowEditor(start.kind, start.id);
})();
