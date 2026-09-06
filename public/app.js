const State = { tab:'dashboard', products:[], stock:[], orders:[], customers:[], packaging:[], sources:[], shipping:[], proposals:[], loaded:false };

const ITEM_CATEGORIES = ['Alcohol Free','Beer','Cider','Coffee','Gin','Rum','Tea','Vodka','Whisky','Wine','Charcuterie','Snacks','Jam, Chutney & Preserves','Marinade','Mayonnaise','Oil','Pasta','Pudding','Rubs','Salad Dressing','Sauce','Biscuits and Cake Bars','Chocolate','Fudge','Nuts','Savoury Snacks','Sweets'];

// Report definitions go here as they're built. Each needs: id, label, and a generate():
// () => ({ filename, blob }) function that returns the file to download.
const REPORTS = [
  { id:'ready-to-invoice', label:'Orders ready to invoice (CSV)', generate: ()=> generateReadyToInvoiceReport() },
];

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
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

async function loadAll(){
  try{
    const data = await api.bootstrap();
    State.products = data.products;
    State.stock = data.stock;
    State.orders = data.orders;
    State.customers = data.customers;
    State.packaging = data.packaging;
    State.shipping = data.shipping;
    State.sources = data.sources;
    State.proposals = data.proposals;
    State.loaded = true;
  }catch(e){
    console.error(e);
    showToast('Could not load data from the server — check your connection and try again');
  }
}

function setTab(tab){ State.tab = tab; render(); }

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
      ${navItem('packaging','Packaging')}
      ${navItem('shipping','Shipping')}
      ${navItem('sources','Sources')}
      ${navItem('reports','Reports')}
    </div>
    <div class="main" id="main"></div>
  `;
  document.querySelectorAll('.navitem').forEach(el=>{
    el.addEventListener('click', ()=> setTab(el.dataset.tab));
  });
  const main = document.getElementById('main');
  if(State.tab==='dashboard') main.innerHTML = renderDashboard();
  if(State.tab==='proposals') main.innerHTML = renderProposals();
  if(State.tab==='orders') main.innerHTML = renderOrders();
  if(State.tab==='production') main.innerHTML = renderProduction();
  if(State.tab==='products') main.innerHTML = renderProducts();
  if(State.tab==='stock') main.innerHTML = renderStock();
  if(State.tab==='customers') main.innerHTML = renderCustomers();
  if(State.tab==='packaging') main.innerHTML = renderPackaging();
  if(State.tab==='shipping') main.innerHTML = renderShipping();
  if(State.tab==='sources') main.innerHTML = renderSources();
  if(State.tab==='reports') main.innerHTML = renderReports();
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

function navItem(tab,label){
  return `<div class="navitem ${State.tab===tab?'active':''}" data-tab="${tab}"><span class="navdot"></span>${label}</div>`;
}

function statusBadge(status){
  const cls = (status||'').toLowerCase().replace(/\s+/g,'-');
  return `<span class="badge ${cls}">${status}</span>`;
}

function itemName(s){ return s.itemName || s.name || 'Unnamed item'; }

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
      <div class="stat"><div class="num">${proposalCount}</div><div class="lbl">Proposals</div></div>
      <div class="stat"><div class="num">${packingCount}</div><div class="lbl">Packing</div></div>
      <div class="stat"><div class="num">${open.length}</div><div class="lbl">Open orders total</div></div>
      <div class="stat ${lowStock.length?'warn':''}"><div class="num">${lowStock.length}</div><div class="lbl">Items need attention</div></div>
    </div>
    <div class="panel">
      <h2>Needs attention</h2>
      ${lowStock.length ? `<table><thead><tr><th>Item</th><th>On hand</th><th>Reserved (open orders)</th><th>On order</th><th>Availability</th></tr></thead><tbody>
        ${lowStock.map(s=>`<tr><td>${itemName(s)}</td><td>${s.qtyOnHand}</td><td>${req[s.id]||0}</td><td>${s.qtyOnOrder||0}</td><td>${s.availability||'—'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Nothing needs attention. Stock covers all open orders.</div>`}
    </div>
    <div class="panel">
      <h2>Latest orders</h2>
      ${State.orders.length? State.orders.slice().reverse().slice(0,5).map(o=>orderCard(o,true)).join('') : `<div class="empty">No orders yet — add one from the Orders tab.</div>`}
    </div>
  `;
}

function orderCard(o, compact){
  const prod = o.items.map(it=>{
    const p = productById(it.productId);
    return `${it.qty} × ${p? p.name : 'Unknown hamper'}`;
  }).join(', ');
  const cust = customerById(o.customerId);
  const custLabel = cust ? customerLabel(cust) : 'Unknown customer';
  const swatch = cust && cust.ribbonColor ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cust.ribbonColor};margin-right:6px;vertical-align:middle;"></span>` : '';
  const nextLabel = FORWARD_LABELS[o.status];
  const backLabel = BACKWARD_LABELS[o.status];
  const totals = computeOrderTotals(o);
  const vatLine = totals.vatBreakdown.length>1 ? totals.vatBreakdown.map(v=>`${v.rate}: ${fmtMoney(v.totalIncVat)}`).join(' · ') : '';
  return `
    <div class="ordercard">
      <div class="orow">
        <div>
          <div class="oname">${swatch}${custLabel} <span class="mono">#${o.id.slice(-5)}</span></div>
          <div class="ometa">${prod}</div>
          <div class="ometa">${o.orderDate ? 'Ordered: '+o.orderDate : ''} ${o.deliveryDate ? ' · Delivery: '+o.deliveryDate : ''} ${o.notes ? ' · '+o.notes : ''}</div>
          <div class="ometa">Cost: ${fmtMoney(totals.cost)} &nbsp;·&nbsp; Price: ${fmtMoney(totals.totalIncVat)} &nbsp;·&nbsp; Profit: ${profitToggleHtml(totals.profit)}</div>
          ${vatLine ? `<div class="ometa" style="color:var(--text-muted);">${vatLine}</div>` : ''}
          <div style="margin-top:6px;">${statusBadge(o.status)} ${o.readyToInvoice ? `<span class="badge invoice">Ready to invoice</span>` : ''}</div>
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

function proposalCard(pr){
  const cust = customerById(pr.customerId);
  const custLabel = cust ? customerLabel(cust) : 'Unknown customer';
  const hampers = (pr.hamperIds||[]).map(id=>{ const p = productById(id); return p? p.name : null; }).filter(Boolean);
  return `
    <div class="ordercard">
      <div class="orow">
        <div>
          <div class="oname">${custLabel} <span class="mono">#${pr.id.slice(-5)}</span></div>
          <div class="ometa">${pr.proposalDate? 'Proposed: '+pr.proposalDate : ''}</div>
          <div class="ometa">${hampers.length? hampers.join(', ') : 'No hamper options chosen yet'}</div>
          ${pr.docName ? `<div class="ometa">Document: ${pr.docName} (${pr.docSource==='uploaded'?'uploaded':'generated'})</div>` : ''}
        </div>
        <div class="oactions" style="flex-wrap:wrap;justify-content:flex-end;max-width:260px;">
          <button class="small ghost" data-editproposal="${pr.id}">Edit</button>
          <button class="small primary" data-generateproposal="${pr.id}">Generate document</button>
          <button class="small ghost" data-uploadproposal="${pr.id}">Upload edited document</button>
          ${pr.docUrl ? `<button class="small ghost" data-downloadproposal="${pr.id}">Download document</button>` : ''}
          <button class="small danger" data-delproposal="${pr.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function renderProposals(){
  return `
    <div class="row-between">
      <div><h1>Proposals</h1><p class="subtitle">Draft gift package proposals for prospective customers.</p></div>
      <button class="primary" id="newProposalBtn">Add proposal</button>
    </div>
    ${State.proposals.length? State.proposals.slice().reverse().map(pr=>proposalCard(pr)).join('') : `<div class="panel empty">No proposals yet. Click "Add proposal" to create the first one.</div>`}
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
  const { col, dir } = State.orderSort;
  rows.sort((a,b)=>{
    let av, bv;
    if(col==='customer'){
      const ca = customerById(a.customerId), cb = customerById(b.customerId);
      av = (ca? customerLabel(ca):'').toLowerCase(); bv = (cb? customerLabel(cb):'').toLowerCase();
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
        </select>
        ${(State.orderFilter.search || State.orderFilter.status || State.orderFilter.readyToInvoice) ? `<button class="ghost small" id="clearOrderFilters">Clear filters</button>` : ''}
        <span style="flex:1;"></span>
        <select id="orderSortCol" style="max-width:160px;">
          <option value="orderDate" ${State.orderSort.col==='orderDate'?'selected':''}>Sort: Order date</option>
          <option value="deliveryDate" ${State.orderSort.col==='deliveryDate'?'selected':''}>Sort: Delivery date</option>
          <option value="customer" ${State.orderSort.col==='customer'?'selected':''}>Sort: Customer</option>
          <option value="status" ${State.orderSort.col==='status'?'selected':''}>Sort: Status</option>
          <option value="totalCost" ${State.orderSort.col==='totalCost'?'selected':''}>Sort: Total cost</option>
          <option value="totalPrice" ${State.orderSort.col==='totalPrice'?'selected':''}>Sort: Total price</option>
          <option value="totalProfit" ${State.orderSort.col==='totalProfit'?'selected':''}>Sort: Total profit</option>
        </select>
        <button class="ghost small" id="orderSortDir">${State.orderSort.dir==='asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>
    </div>
    ${rows.length? rows.map(o=>orderCard(o,false)).join('') : `<div class="panel empty">${State.orders.length? 'No orders match these filters.' : 'No orders yet. Click "Add order" to create the first one.'}</div>`}
  `;
}

function renderProduction(){
  const active = State.orders.filter(o=>PRODUCTION_STATUSES.includes(o.status));
  const req = computeOpenRequirements();
  return `
    <h1>Production</h1>
    <p class="subtitle">What needs assembling right now, and whether stock covers it.</p>
    <div class="panel">
      <h2>Orders to assemble</h2>
      ${active.length ? active.slice().reverse().map(o=>orderCard(o,false)).join('') : `<div class="empty">No orders waiting on production.</div>`}
    </div>
    <div class="panel">
      <h2>Item requirements</h2>
      ${Object.keys(req).length ? `<table><thead><tr><th>Item</th><th>Required</th><th>On hand</th><th>Status</th></tr></thead><tbody>
        ${Object.entries(req).map(([id,qty])=>{
          const s = stockById(id);
          if(!s) return `<tr><td>Unknown component</td><td>${qty}</td><td>—</td><td>—</td></tr>`;
          const short = qty > s.qtyOnHand;
          return `<tr><td>${itemName(s)}</td><td>${qty}</td><td>${s.qtyOnHand}</td><td>${short? `<span class="badge low">Short by ${qty-s.qtyOnHand}</span>` : `<span class="badge packed">Covered</span>`}</td></tr>`;
        }).join('')}
      </tbody></table>` : `<div class="empty">No active production requirements.</div>`}
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
  if(!State.productSort) State.productSort = { col:'name', dir:'asc' };
  const rows = getFilteredSortedProducts();
  const cols = [[null,''],['name','Hamper'],[null,'Items'],['packagingName','Packaging'],['shippingName','Shipping'],['totalCost','Total cost'],['totalPrice','Total price'],['profit','Profit'],['totalWeight','Total weight'],[null,'']];
  return `
    <div class="row-between">
      <div><h1>Hampers</h1><p class="subtitle">Your product recipes — what goes into each hamper.</p></div>
      <button class="primary" id="newProductBtn">Add hamper</button>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <input id="productSearch" placeholder="Search hamper name, items, packaging..." value="${State.productFilter.search}" style="max-width:280px;">
        ${State.productFilter.search ? `<button class="ghost small" id="clearProductFilters">Clear filters</button>` : ''}
      </div>
      <div style="overflow-x:auto;">
      ${State.products.length? `<table><thead><tr>
          ${cols.map(([key,label])=> key
            ? `<th style="cursor:pointer;" data-sortproductcol="${key}">${label}${productSortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(p=>`<tr>
          <td>${p.photoUrl? `<img src="${p.photoUrl}" class="logoThumb">` : `<div class="logoThumb" style="background:var(--kraft);"></div>`}</td>
          <td><strong>${p.name}</strong></td>
          <td>${p.components.map(c=>{const s=stockById(c.componentId); return s? `${c.qty} × ${itemName(s)}` : 'unknown';}).join(', ') || '—'}</td>
          <td>${p.packagingName || '—'}</td>
          <td>${p.shippingName || '—'}</td>
          <td>${fmtMoney(p.totalCost)}</td>
          <td>${fmtMoney(p.totalPrice)}</td>
          <td>${profitToggleHtml(p.profit)}</td>
          <td>${p.totalWeight.toFixed(0)} g</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editproduct="${p.id}">Edit</button>
            <button class="small ghost" data-copyproduct="${p.id}">Copy</button>
            <button class="small danger" data-delproduct="${p.id}">Delete</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="10" class="empty">No hampers match this search.</td></tr>`}
      </tbody></table>` : `<div class="empty">No hampers yet. Add your first hamper recipe.</div>`}
      </div>
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
    ['cost','Cost'], ['price','Price'], ['weight','Weight'], ['vat','VAT'],
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
      <div style="overflow-x:auto;">
      ${State.stock.length? `<table><thead><tr>
          ${stockColumns().map(([key,label])=> key
            ? `<th class="sortable" data-sortcol="${key}" style="cursor:pointer;">${label}${sortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(s=>{
          const short = s.reserved > s.qtyOnHand;
          return `<tr>
          <td>${s.category||'—'}</td>
          <td>${s.brand||'—'}</td>
          <td>${s.itemName}</td>
          <td>${dietTags(s)}</td>
          <td>${fmtMoney(s.cost)}</td>
          <td>${fmtMoney(s.price)}</td>
          <td>${s.weight!=null && s.weight!=='' ? s.weight+' g' : '—'}</td>
          <td>${s.vat||'—'}</td>
          <td>${s.availability||'—'}</td>
          <td>${s.qtyOnHand||0}</td>
          <td>${s.qtyOnOrder||0}</td>
          <td>${s.reserved} ${short? `<span class="badge low">Short</span>`:''}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editstock="${s.id}">Edit</button>
            <button class="small danger" data-delstock="${s.id}">Delete</button>
          </td>
        </tr>`;}).join('') : `<tr><td colspan="13" class="empty">No items match these filters.</td></tr>`}
      </tbody></table>` : `<div class="empty">No items yet. Add the components your hampers are built from.</div>`}
      </div>
    </div>
  `;
}

const STOCK_CSV_FIELDS = ['id','category','brand','itemName','v','vg','g','n','cost','price','weight','vat','availability','qtyOnHand','qtyOnOrder'];

function downloadStockCsv(){
  const rows = getFilteredSortedStock();
  if(!rows.length){ showToast('No items to export'); return; }
  const csv = Papa.unparse(rows.map(s => {
    const row = {};
    STOCK_CSV_FIELDS.forEach(f => { row[f] = s[f] !== undefined ? s[f] : ''; });
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

function vatRatePercent(vat){
  if(!vat) return 0.20;
  const v = vat.toLowerCase();
  if(v.includes('20')) return 0.20;
  if(v.includes('5')) return 0.05;
  if(v.includes('zero')) return 0;
  if(v.includes('exempt')) return 0;
  return 0.20;
}

function computeHamperTotals(p){
  let cost = 0, priceExVat = 0, weight = 0;
  const vatGroups = {};
  (p.components||[]).forEach(c=>{
    const s = stockById(c.componentId);
    if(!s) return;
    const qty = c.qty||0;
    const linePrice = c.price!=null ? c.price : (s.price||0);
    cost += (s.cost||0)*qty;
    priceExVat += linePrice*qty;
    weight += (parseFloat(s.weight)||0)*qty;
    const rate = s.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate]||0) + linePrice*qty;
  });
  const pack = p.packagingId ? State.packaging.find(pk=>pk.id===p.packagingId) : null;
  if(pack){
    cost += pack.cost||0;
    priceExVat += pack.price||0;
    weight += (parseFloat(pack.weight)||0)*1000; // packaging weight is stored in kg; items are in g
    const rate = pack.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate]||0) + (pack.price||0);
  }
  const ship = p.shippingId ? State.shipping.find(sh=>sh.id===p.shippingId) : null;
  if(ship){
    // Shipping options only track a customer-facing price + VAT rate, not a
    // separate cost — the carrier price is treated as a pass-through.
    priceExVat += ship.price||0;
    const rate = ship.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate]||0) + (ship.price||0);
  }
  const vatBreakdown = Object.entries(vatGroups).map(([rate,subtotal])=>{
    const pct = vatRatePercent(rate);
    const vatAmount = subtotal*pct;
    return { rate, subtotal, vatAmount, totalIncVat: subtotal+vatAmount };
  }).sort((a,b)=> b.subtotal-a.subtotal);
  const totalIncVat = vatBreakdown.reduce((sum,v)=>sum+v.totalIncVat, 0);
  const profit = priceExVat - cost;
  return { cost, priceExVat, weight, vatBreakdown, totalIncVat, profit, packaging: pack, shipping: ship };
}

function computeOrderTotals(o){
  let cost = 0, priceExVat = 0;
  const vatGroups = {};
  o.items.forEach(it=>{
    const p = productById(it.productId);
    if(!p) return;
    const ht = computeHamperTotals(p);
    const qty = it.qty||0;
    cost += ht.cost*qty;
    priceExVat += ht.priceExVat*qty;
    ht.vatBreakdown.forEach(v=>{
      vatGroups[v.rate] = (vatGroups[v.rate]||0) + v.subtotal*qty;
    });
  });
  const vatBreakdown = Object.entries(vatGroups).map(([rate,subtotal])=>{
    const pct = vatRatePercent(rate);
    const vatAmount = subtotal*pct;
    return { rate, subtotal, vatAmount, totalIncVat: subtotal+vatAmount };
  }).sort((a,b)=> b.subtotal-a.subtotal);
  const totalIncVat = vatBreakdown.reduce((sum,v)=>sum+v.totalIncVat, 0);
  const profit = priceExVat - cost;
  return { cost, priceExVat, vatBreakdown, totalIncVat, profit };
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

async function buildHamperSectionDocxParts(selectedProducts){
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
    const totals = computeHamperTotals(p);
    xml += docxHeadingParaXml('Option '+(idx+1)+': '+p.name+' — '+fmtMoney(totals.totalIncVat)+' including VAT');
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

    const built = await buildHamperSectionDocxParts(selectedProducts);
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
      <div><h1>Packaging</h1><p class="subtitle">Box sizes and their price, weight, and cost.</p></div>
      <button class="primary" id="newPackagingBtn">Add packaging</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Size</th><th>Price</th><th>Weight</th><th>Cost</th><th>VAT rate</th><th></th></tr></thead><tbody>
        ${rows.map(p=>`<tr>
          <td>${p.size}</td>
          <td>${fmtMoney(p.price)}</td>
          <td>${p.weight!=null && p.weight!=='' ? p.weight+' kg' : '—'}</td>
          <td>${p.cost!=null && p.cost!=='' ? fmtMoney(p.cost) : '—'}</td>
          <td>${p.vat || 'Standard 20%'}</td>
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
      <div><h1>Shipping</h1><p class="subtitle">Shipping options and their price.</p></div>
      <button class="primary" id="newShippingBtn">Add shipping</button>
    </div>
    <div class="panel">
      ${rows.length? `<table><thead><tr><th>Label</th><th>Price</th><th>VAT rate</th><th></th></tr></thead><tbody>
        ${rows.map(p=>`<tr>
          <td>${p.label}</td>
          <td>${fmtMoney(p.price)}</td>
          <td>${p.vat || 'Standard 20%'}</td>
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
      <button class="primary" id="downloadReportBtn" ${REPORTS.length? '' : 'disabled'}>Download</button>
      ${!REPORTS.length? `<div class="savehint" style="margin-top:10px;">Reports will show up here once they've been added.</div>` : ''}
    </div>
  `;
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
        ${rows.map(s=>`<tr>
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
        <button class="primary" id="newCustomerBtn">Add customer</button>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <input id="customerSearch" placeholder="Search company, contact, email, phone..." value="${State.customerFilter.search}" style="max-width:280px;">
        ${State.customerFilter.search ? `<button class="ghost small" id="clearCustomerFilters">Clear filters</button>` : ''}
      </div>
      ${State.customers.length? `<div style="overflow-x:auto;"><table><thead><tr>
          ${cols.map(([key,label])=> key
            ? `<th style="cursor:pointer;" data-sortcustomercol="${key}">${label}${customerSortArrow(key)}</th>`
            : `<th>${label}</th>`
          ).join('')}
        </tr></thead><tbody>
        ${rows.length ? rows.map(c=>`<tr>
          <td>${c.logoUrl? `<img src="${c.logoUrl}" class="logoThumb">` : `<div class="logoThumb" style="background:${c.ribbonColor||'#E7DCC4'};"></div>`}</td>
          <td><strong>${c.companyName}</strong></td>
          <td>${c.contactName||'—'}</td>
          <td>${c.email||'—'}</td>
          <td>${c.phonePrimary||'—'}${c.phoneSecondary? ` / ${c.phoneSecondary}` : ''}</td>
          <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border-radius:4px;background:${c.ribbonColor||'#E7DCC4'};display:inline-block;border:0.5px solid var(--border);"></span>${c.ribbonColor||'—'}</span></td>
          <td>${c.sourceLabel||'—'}</td>
          <td>${c.orderCount ? `<button class="linkbtn" data-vieworders="${c.id}">${c.orderCount}</button>` : '0'}</td>
          <td>${fmtMoney(c.totalValue)}</td>
          <td style="white-space:nowrap;">
            <button class="small ghost" data-editcustomer="${c.id}">Edit</button>
            <button class="small danger" data-delcustomer="${c.id}">Delete</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="10" class="empty">No customers match this search.</td></tr>`}
      </tbody></table></div>` : `<div class="empty">No customers yet. Add your first customer.</div>`}
    </div>
  `;
}

// ---------- Modals ----------
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

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

function openPackagingModal(existing){
  const p = existing || { id:null, size:'', price:0, weight:'', cost:'', vat:'Standard 20%' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit packaging':'Add packaging'}</h3>
        <div class="field"><label>Size</label><input id="f_size" value="${p.size}" placeholder="e.g. Medium (Shipped)"></div>
        <div class="grid2">
          <div class="field"><label>Price (£)</label><input id="f_price" type="number" step="0.01" value="${p.price}"></div>
          <div class="field"><label>Cost (£)</label><input id="f_cost" type="number" step="0.01" value="${p.cost}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Weight (kg)</label><input id="f_weight" type="number" step="0.001" value="${p.weight}"></div>
          <div class="field">
            <label>VAT rate</label>
            <select id="f_vat">
              ${['Standard 20%','Reduced 5%','Zero 0%','Exempt'].map(v=>`<option ${(p.vat||'Standard 20%')===v?'selected':''}>${v}</option>`).join('')}
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
    const costRaw = document.getElementById('f_cost').value;
    const item = {
      size,
      price: parseFloat(document.getElementById('f_price').value)||0,
      weight: weightRaw==='' ? null : parseFloat(weightRaw),
      cost: costRaw==='' ? null : parseFloat(costRaw),
      vat: document.getElementById('f_vat').value,
    };
    try{
      State.packaging = existing ? await api.packaging.update(p.id, item) : await api.packaging.create(item);
      closeModal(); render(); showToast('Packaging saved');
    }catch(e){ showToast(e.message || 'Could not save packaging'); }
  };
}

function openShippingModal(existing){
  const p = existing || { id:null, label:'', price:0, vat:'Standard 20%' };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit shipping':'Add shipping'}</h3>
        <div class="field"><label>Label</label><input id="f_label" value="${p.label}" placeholder="e.g. Medium (Shipped)"></div>
        <div class="grid2">
          <div class="field"><label>Price (£)</label><input id="f_price" type="number" step="0.01" value="${p.price}"></div>
          <div class="field">
            <label>VAT rate</label>
            <select id="f_vat">
              ${['Standard 20%','Reduced 5%','Zero 0%','Exempt'].map(v=>`<option ${(p.vat||'Standard 20%')===v?'selected':''}>${v}</option>`).join('')}
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
    try{
      State.shipping = existing ? await api.shipping.update(p.id, item) : await api.shipping.create(item);
      closeModal(); render(); showToast('Shipping saved');
    }catch(e){ showToast(e.message || 'Could not save shipping'); }
  };
}

function openStockModal(existing){
  const s = existing || { id:null, category:'', brand:'', itemName:'', v:false, vg:false, g:false, n:false, cost:0, price:0, weight:'', vat:'Standard 20%', availability:'In stock', qtyOnHand:0, qtyOnOrder:0 };
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="ovl">
      <div class="modal">
        <h3>${existing? 'Edit item':'Add item'}</h3>
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
          <div class="field"><label>Cost (£)</label><input id="f_cost" type="number" step="0.01" value="${(s.cost||0).toFixed(2)}"></div>
          <div class="field"><label>Price (£)</label><input id="f_price" type="number" step="0.01" value="${(s.price||0).toFixed(2)}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Weight (g)</label><input id="f_weight" type="number" step="1" value="${s.weight!=null?s.weight:''}" placeholder="e.g. 227"></div>
          <div class="field"><label>VAT</label>
            <select id="f_vat">
              ${['Standard 20%','Reduced 5%','Zero 0%','Exempt'].map(v=>`<option ${s.vat===v?'selected':''}>${v}</option>`).join('')}
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
      cost: Math.round((parseFloat(document.getElementById('f_cost').value)||0)*100)/100,
      price: Math.round((parseFloat(document.getElementById('f_price').value)||0)*100)/100,
      weight: document.getElementById('f_weight').value==='' ? null : parseFloat(document.getElementById('f_weight').value),
      vat: document.getElementById('f_vat').value,
      availability: document.getElementById('f_availability').value,
      qtyOnHand: parseFloat(document.getElementById('f_qty').value)||0,
      qtyOnOrder: parseFloat(document.getElementById('f_qtyorder').value)||0,
    };
    try{
      State.stock = existing ? await api.stock.update(s.id, item) : await api.stock.create(item);
      closeModal(); render(); showToast('Item saved');
    }catch(e){ showToast(e.message || 'Could not save item'); }
  };
}

function openProductModal(existing, duplicateFrom){
  const p = existing ? JSON.parse(JSON.stringify(existing))
    : duplicateFrom ? Object.assign(JSON.parse(JSON.stringify(duplicateFrom)), { id:null, name:'' })
    : { id:null, name:'', components:[], packagingId:null, shippingId:null, photoUrl:'' };
  const duplicateOfName = duplicateFrom ? duplicateFrom.name : null;
  let pendingPhotoFile = null; // uploaded to /api/uploads only once Save is clicked

  function itemsDatalist(){
    return `<datalist id="stockItemsDatalist">
      ${State.stock.map(s=>`<option value="${itemName(s).replace(/"/g,'&quot;')}">`).join('')}
    </datalist>`;
  }

  function renderComps(){
    return `
    <div class="comprow" style="font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">
      <span style="flex:2;">Item</span><span style="flex:1;">Qty</span><span style="flex:1;">Price (£)</span><span style="width:28px;"></span>
    </div>
    ${p.components.map((c,i)=>{
      const s = stockById(c.componentId);
      const val = s ? itemName(s) : '';
      const priceVal = c.price!=null ? c.price : (s? s.price : 0);
      return `
    <div class="comprow">
      <input type="text" list="stockItemsDatalist" class="compNameInput" data-cidx="${i}" value="${val}" placeholder="Search items...">
      <input type="number" step="1" min="0" class="compQty" data-cidx="${i}" value="${c.qty}">
      <input type="number" step="0.01" min="0" class="compPrice" data-cidx="${i}" value="${priceVal}">
      <button class="small danger" data-removecomp="${i}">×</button>
    </div>`;
    }).join('')}`;
  }

  function totalsHtml(){
    const totals = computeHamperTotals(p);
    return `
      <div class="panel" style="margin-top:14px;background:var(--paper);padding:14px 16px;">
        <div class="grid2">
          <div><div class="ometa">Total cost</div><div style="font-weight:500;font-size:15px;">${fmtMoney(totals.cost)}</div></div>
          <div><div class="ometa">Total weight</div><div style="font-weight:500;font-size:15px;">${totals.weight.toFixed(0)} g</div></div>
        </div>
        <div class="grid2" style="margin-top:10px;">
          <div><div class="ometa">Total price (inc VAT)</div><div style="font-weight:600;font-size:19px;">${fmtMoney(totals.totalIncVat)}</div></div>
          <div><div class="ometa">Profit</div><div style="font-weight:600;font-size:19px;">${profitToggleHtml(totals.profit,'font-weight:600;font-size:19px;')}</div></div>
        </div>
        ${totals.vatBreakdown.length? `<table style="margin-top:10px;"><thead><tr><th>VAT rate</th><th>Ex VAT</th><th>VAT</th><th>Inc VAT</th></tr></thead><tbody>
          ${totals.vatBreakdown.map(v=>`<tr><td>${v.rate}</td><td>${fmtMoney(v.subtotal)}</td><td>${fmtMoney(v.vatAmount)}</td><td>${fmtMoney(v.totalIncVat)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="savehint">Add items to see a price breakdown.</div>`}
      </div>
    `;
  }

  function refreshTotals(){
    const el = document.getElementById('hamperTotals');
    if(el) el.innerHTML = totalsHtml();
    wireProfitToggles(el);
  }

  function paint(){
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal">
          <h3>${existing? 'Edit hamper': duplicateFrom? 'Copy hamper' : 'Add hamper'}</h3>
          ${duplicateFrom? `<div class="savehint" style="margin-bottom:10px;">Copied from "${duplicateOfName}" — give this hamper its own name before saving.</div>` : ''}
          <div class="field"><label>Hamper name</label><input id="f_name" value="${p.name}" placeholder="e.g. The Bishop's Stortford"></div>
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
            <label>Photo</label>
            <div class="logoPreviewRow">
              ${p.photoUrl? `<img src="${p.photoUrl}" class="logoThumb" id="photoPreview">` : `<div class="logoThumb" id="photoPreview" style="background:var(--kraft);"></div>`}
              <input id="f_photo" type="file" accept="image/*" style="flex:1;">
            </div>
          </div>
          <label>Items</label>
          <div id="compList">${renderComps()}</div>
          ${itemsDatalist()}
          ${State.stock.length? `<button class="linkbtn" id="addCompBtn">+ Add item</button>` : `<div class="savehint">Add items first, then come back to build this recipe.</div>`}
          <div id="hamperTotals">${totalsHtml()}</div>
          <div class="row-between" style="margin-top:18px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.getElementById('cancelBtn').onclick = closeModal;
    wireProfitToggles(document.getElementById('hamperTotals'));
    document.getElementById('f_name').oninput = (e)=>{ p.name = e.target.value; };
    document.getElementById('f_packaging').onchange = (e)=>{ p.packagingId = e.target.value || null; refreshTotals(); };
    document.getElementById('f_shipping').onchange = (e)=>{ p.shippingId = e.target.value || null; refreshTotals(); };
    document.getElementById('f_photo').addEventListener('change', (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      pendingPhotoFile = file;
      const reader = new FileReader();
      reader.onload = ()=>{
        const prev = document.getElementById('photoPreview');
        prev.outerHTML = `<img src="${reader.result}" class="logoThumb" id="photoPreview">`;
      };
      reader.readAsDataURL(file);
    });
    if(document.getElementById('addCompBtn')){
      document.getElementById('addCompBtn').onclick = ()=>{
        p.components.push({ componentId: null, qty: 1, price: 0 });
        paint();
      };
    }
    document.querySelectorAll('[data-removecomp]').forEach(b=>{
      b.onclick = ()=>{ p.components.splice(parseInt(b.dataset.removecomp),1); paint(); };
    });
    document.querySelectorAll('.compNameInput').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const idx = parseInt(inp.dataset.cidx);
        const typed = inp.value.trim();
        const match = State.stock.find(s => itemName(s).toLowerCase() === typed.toLowerCase());
        p.components[idx].componentId = match ? match.id : null;
        p.components[idx].price = match ? match.price : 0;
        paint();
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
      try{
        if(pendingPhotoFile){
          const uploaded = await api.uploads.image(pendingPhotoFile);
          p.photoUrl = uploaded.url;
        }
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
        <h3>Orders — ${cust? cust.companyName : 'Unknown customer'}</h3>
        ${custOrders.length ? custOrders.map(o=>{
          const items = o.items.map(it=>{ const p = productById(it.productId); return `${it.qty} × ${p? p.name : 'Unknown hamper'}`; }).join(', ');
          return `<div class="ordercard" style="cursor:pointer;" data-openorderfrommodal="${o.id}">
            <div class="orow">
              <div>
                <div class="oname">${items} <span class="mono">#${o.id.slice(-5)}</span></div>
                <div class="ometa">${o.deliveryDate? 'Delivery: '+o.deliveryDate : ''}</div>
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
    document.querySelectorAll('[data-openorderfrommodal]').forEach(card=>{
    card.onclick = ()=>{
      const order = State.orders.find(o=>o.id===card.dataset.openorderfrommodal);
      closeModal();
      if(order) openOrderModal(order);
    };
  });
}

function openCustomerModal(existing, opts){
  opts = opts || {};
  const c = existing ? JSON.parse(JSON.stringify(existing)) : { id:null, companyName:'', contactName:'', email:'', phonePrimary:'', phoneSecondary:'', contactName2:'', phone2Primary:'', phone2Secondary:'', email2:'', ribbonColor:'', fontColor:'', sourceId:null, notes:'', logoUrl:'' };
  let pendingLogoFile = null; // uploaded to /api/uploads only once Save is clicked

  function paint(){
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal">
          <h3>${existing? 'Edit customer':'Add customer'}</h3>
          <div class="field"><label>Company name</label><input id="f_company" value="${c.companyName}" placeholder="e.g. Bishop's Stortford Law LLP"></div>
          <div class="field">
            <label>Source</label>
            <select id="f_source">
              <option value="">No source</option>
              ${State.sources.map(s=>`<option value="${s.id}" ${s.id===c.sourceId?'selected':''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Main contact name</label><input id="f_contact" value="${c.contactName}" placeholder="e.g. Priya Shah"></div>
          <div class="grid3">
            <div class="field"><label>Email address</label><input id="f_email" type="email" value="${c.email||''}" placeholder="e.g. priya@company.com"></div>
            <div class="field"><label>Primary phone</label><input id="f_phone" value="${c.phonePrimary||''}" placeholder="e.g. 01279 123456"></div>
            <div class="field"><label>Secondary phone</label><input id="f_phone_secondary" value="${c.phoneSecondary||''}" placeholder="e.g. 07700 123456"></div>
          </div>
          <div class="field"><label>2nd contact name</label><input id="f_contact2" value="${c.contactName2||''}" placeholder="e.g. Sam Okafor"></div>
          <div class="grid3">
            <div class="field"><label>2nd email address</label><input id="f_email2" type="email" value="${c.email2||''}" placeholder="e.g. sam@company.com"></div>
            <div class="field"><label>2nd primary phone</label><input id="f_phone2" value="${c.phone2Primary||''}" placeholder="e.g. 01279 654321"></div>
            <div class="field"><label>2nd secondary phone</label><input id="f_phone2_secondary" value="${c.phone2Secondary||''}" placeholder="e.g. 07700 654321"></div>
          </div>
          <div class="grid2">
            <div class="field"><label>Ribbon colour</label><input id="f_ribbon" value="${c.ribbonColor||''}" placeholder="e.g. Forest green or #3F6B3F"></div>
            <div class="field"><label>Font colour</label><input id="f_font" value="${c.fontColor||''}" placeholder="e.g. Cream or #F4DFE5"></div>
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
      c.ribbonColor = document.getElementById('f_ribbon').value.trim();
      c.fontColor = document.getElementById('f_font').value.trim();
      c.notes = document.getElementById('f_notes').value.trim();
      try{
        if(pendingLogoFile){
          const uploaded = await api.uploads.image(pendingLogoFile);
          c.logoUrl = uploaded.url;
        }
        const result = existing ? await api.customers.update(c.id, c) : await api.customers.create(c);
        State.customers = result.customers;
        showToast('Customer saved');
        if(opts.onDone){ opts.onDone({ ...c, id: result.id }); } else { closeModal(); render(); }
      }catch(e){ showToast(e.message || 'Could not save customer'); }
    };
  }
  paint();
}

function openProposalModal(existing){
  const todayStr = new Date().toISOString().slice(0,10);
  const pr = existing ? JSON.parse(JSON.stringify(existing)) : { id:null, customerId: State.customers[0] ? State.customers[0].id : null, proposalDate: todayStr, hamperIds: [], docUrl:'', docName:'', docSource:'' };
  // normalize to exactly 10 slots (null = no selection)
  while(pr.hamperIds.length < 10) pr.hamperIds.push(null);
  pr.hamperIds = pr.hamperIds.slice(0,10);

  function paint(){
    const selectedCust = customerById(pr.customerId);
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal" style="width:480px;">
          <h3>${existing? 'Edit proposal':'Add proposal'}</h3>
          <div class="field">
            <label>Customer</label>
            ${State.customers.length? `
              <input type="text" id="f_customer" list="customersDatalist" value="${selectedCust? customerLabel(selectedCust).replace(/"/g,'&quot;') : ''}" placeholder="Search customers...">
              <datalist id="customersDatalist">
                ${State.customers.map(c=>`<option value="${customerLabel(c).replace(/"/g,'&quot;')}">`).join('')}
              </datalist>` : `<div class="savehint">No customers yet — add one below.</div>`}
            <button class="linkbtn" id="addCustomerBtn" style="margin-top:4px;">+ Add new customer</button>
          </div>
          <div class="field"><label>Proposal date</label><input id="f_propdate" type="date" value="${pr.proposalDate||''}"></div>
          <label>Hamper options</label>
          <div style="margin-top:6px;">
            ${State.products.length? [0,1,2,3,4,5,6,7,8,9].map(i=>{
              const current = pr.hamperIds[i];
              return `<div class="field">
                <select class="hamperSlot" data-slot="${i}">
                  <option value="">No hamper</option>
                  ${State.products.map(p=>{
                    const totals = computeHamperTotals(p);
                    return `<option value="${p.id}" ${current===p.id?'selected':''}>${p.name} — ${fmtMoney(totals.totalIncVat)}</option>`;
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
        onDone: (newCustomer)=>{ pr.customerId = newCustomer.id; paint(); },
        onCancel: ()=> paint()
      });
    };
    if(document.getElementById('f_customer')){
      document.getElementById('f_customer').addEventListener('change', (e)=>{
        const typed = e.target.value.trim();
        const match = State.customers.find(c => customerLabel(c).toLowerCase() === typed.toLowerCase());
        pr.customerId = match ? match.id : null;
        paint();
      });
    }
    document.getElementById('f_propdate').oninput = (e)=>{ pr.proposalDate = e.target.value; };
    document.querySelectorAll('.hamperSlot').forEach(sel=>{
      sel.onchange = (e)=>{ pr.hamperIds[parseInt(sel.dataset.slot)] = e.target.value || null; };
    });
    document.getElementById('saveBtn').onclick = async ()=>{
      if(!pr.customerId){ showToast('Choose or add a customer'); return; }
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

function openOrderModal(existing){
  const todayStr = new Date().toISOString().slice(0,10);
  const o = existing ? JSON.parse(JSON.stringify(existing)) : { id:null, customerId: State.customers[0] ? State.customers[0].id : null, orderDate: todayStr, deliveryDate:'', notes:'', status:'Proposal', readyToInvoice:false, items:[], stockDeducted:false };

  function clamp(val, min, max){ return Math.max(min, Math.min(max, val)); }

  function renderItems(){
    return `
    <table style="margin-bottom:10px;"><thead><tr><th>Hamper</th><th>Ordered</th><th>Packed</th><th>Shipped</th><th></th></tr></thead><tbody>
    ${o.items.map((it,i)=>`
      <tr>
        <td><select data-iidx="${i}" class="itemSelect">
          ${State.products.map(p=>`<option value="${p.id}" ${p.id===it.productId?'selected':''}>${p.name}</option>`).join('')}
        </select></td>
        <td><input type="number" step="1" min="0" class="itemQty" data-iidx="${i}" value="${it.qty}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemPacked" data-iidx="${i}" value="${it.qtyPacked||0}" style="width:64px;"></td>
        <td><input type="number" step="1" min="0" max="${it.qty}" class="itemShipped" data-iidx="${i}" value="${it.qtyShipped||0}" style="width:64px;"></td>
        <td><button class="small danger" data-removeitem="${i}">×</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  function orderTotalsHtml(){
    const totals = computeOrderTotals(o);
    return `
      <div class="panel" style="margin-top:14px;background:var(--paper);padding:14px 16px;">
        <div class="grid2">
          <div><div class="ometa">Total cost</div><div style="font-weight:500;font-size:15px;">${fmtMoney(totals.cost)}</div></div>
          <div><div class="ometa">Total price (inc VAT)</div><div style="font-weight:600;font-size:15px;">${fmtMoney(totals.totalIncVat)}</div></div>
        </div>
        <div style="margin-top:10px;"><div class="ometa">Profit</div><div style="font-weight:600;font-size:19px;">${profitToggleHtml(totals.profit,'font-weight:600;font-size:19px;')}</div></div>
        ${totals.vatBreakdown.length? `<table style="margin-top:10px;"><thead><tr><th>VAT rate</th><th>Ex VAT</th><th>VAT</th><th>Inc VAT</th></tr></thead><tbody>
          ${totals.vatBreakdown.map(v=>`<tr><td>${v.rate}</td><td>${fmtMoney(v.subtotal)}</td><td>${fmtMoney(v.vatAmount)}</td><td>${fmtMoney(v.totalIncVat)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="savehint">Add hampers to see a price breakdown.</div>`}
      </div>
    `;
  }

  function refreshOrderTotals(){
    const el = document.getElementById('orderTotals');
    if(el) el.innerHTML = orderTotalsHtml();
    wireProfitToggles(el);
  }

  function paint(){
    const selectedCust = customerById(o.customerId);
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-overlay" id="ovl">
        <div class="modal" style="width:520px;">
          <h3>${existing? 'Edit order':'Add order'}</h3>
          <div class="field">
            <label>Customer</label>
            ${State.customers.length? `
              <input type="text" id="f_customer" list="customersDatalist" value="${selectedCust? customerLabel(selectedCust).replace(/"/g,'&quot;') : ''}" placeholder="Search customers...">
              <datalist id="customersDatalist">
                ${State.customers.map(c=>`<option value="${customerLabel(c).replace(/"/g,'&quot;')}">`).join('')}
              </datalist>` : `<div class="savehint">No customers yet — add one below.</div>`}
            <button class="linkbtn" id="addCustomerBtn" style="margin-top:4px;">+ Add new customer</button>
          </div>
          <div class="grid2">
            <div class="field"><label>Order date</label><input id="f_orderdate" type="date" value="${o.orderDate||''}"></div>
            <div class="field"><label>Delivery date</label><input id="f_date" type="date" value="${o.deliveryDate}"></div>
          </div>
          <label>Hampers ordered</label>
          <div id="itemList">${renderItems()}</div>
          ${State.products.length? `<button class="linkbtn" id="addItemBtn">+ Add hamper</button>` : `<div class="savehint">Add a hamper recipe first.</div>`}
          <div id="orderTotals">${orderTotalsHtml()}</div>
          <div class="field" style="margin-top:12px;"><label>Notes</label><textarea id="f_notes" rows="2">${o.notes}</textarea></div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13.5px;"><input type="checkbox" id="f_invoice" style="width:auto;" ${o.readyToInvoice?'checked':''}> Ready to invoice</label>
          </div>
          <div class="row-between" style="margin-top:16px;">
            <button class="ghost" id="cancelBtn">Cancel</button>
            <button class="primary" id="saveBtn">Save</button>
          </div>
        </div>
      </div>`;
    document.getElementById('cancelBtn').onclick = closeModal;
    wireProfitToggles(document.getElementById('orderTotals'));
    document.getElementById('f_orderdate').oninput = (e)=>{ o.orderDate = e.target.value; };
    document.getElementById('f_date').oninput = (e)=>{ o.deliveryDate = e.target.value; };
    document.getElementById('f_notes').oninput = (e)=>{ o.notes = e.target.value; };
    document.getElementById('f_invoice').onchange = (e)=>{ o.readyToInvoice = e.target.checked; };
    document.getElementById('addCustomerBtn').onclick = ()=>{
      openCustomerModal(null, {
        onDone: (newCustomer)=>{ o.customerId = newCustomer.id; paint(); },
        onCancel: ()=> paint()
      });
    };
    if(document.getElementById('f_customer')){
      document.getElementById('f_customer').addEventListener('change', (e)=>{
        const typed = e.target.value.trim();
        const match = State.customers.find(c => customerLabel(c).toLowerCase() === typed.toLowerCase());
        o.customerId = match ? match.id : null;
        paint();
      });
    }
    if(document.getElementById('addItemBtn')){
      document.getElementById('addItemBtn').onclick = ()=>{
        o.items.push({ productId: State.products[0].id, qty: 1, qtyPacked: 0, qtyShipped: 0 });
        paint();
      };
    }
    document.querySelectorAll('[data-removeitem]').forEach(b=>{
      b.onclick = ()=>{ o.items.splice(parseInt(b.dataset.removeitem),1); paint(); };
    });
    document.querySelectorAll('.itemSelect').forEach(sel=>{
      sel.onchange = ()=>{ o.items[parseInt(sel.dataset.iidx)].productId = sel.value; refreshOrderTotals(); };
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
      if(!o.items.length){ showToast('Add at least one hamper'); return; }
      o.orderDate = document.getElementById('f_orderdate').value;
      o.deliveryDate = document.getElementById('f_date').value;
      o.notes = document.getElementById('f_notes').value.trim();
      o.readyToInvoice = document.getElementById('f_invoice').checked;
      try{
        State.orders = existing ? await api.orders.update(o.id, o) : await api.orders.create(o);
        closeModal(); render(); showToast('Order saved');
      }catch(e){ showToast(e.message || 'Could not save order'); }
    };
  }
  paint();
}

// ---------- Event delegation for dynamically rendered buttons ----------
function attachHandlers(){
  wireProfitToggles(document);
  const reportSelect = document.getElementById('reportSelect');
  if(reportSelect) reportSelect.onchange = (e)=>{ State.reportSelection = e.target.value; };
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
  const newProposalBtn = document.getElementById('newProposalBtn');
  if(newProposalBtn) newProposalBtn.onclick = ()=> openProposalModal(null);
  document.querySelectorAll('[data-editproposal]').forEach(b=>{
    b.onclick = ()=> openProposalModal(State.proposals.find(p=>p.id===b.dataset.editproposal));
  });
  document.querySelectorAll('[data-delproposal]').forEach(b=>{
    b.onclick = ()=>{
      const pr = State.proposals.find(p=>p.id===b.dataset.delproposal);
      const cust = pr ? customerById(pr.customerId) : null;
      openConfirmModal(`Delete the proposal for "${cust? customerLabel(cust) : 'this customer'}"? This can't be undone.`, async ()=>{
        State.proposals = await api.proposals.remove(b.dataset.delproposal);
        render(); showToast('Proposal deleted');
      });
    };
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

async function moveOrderStatus(id, direction){
  // Validation, the stock deduction/restoration, and persistence all happen
  // together in one server-side transaction (see POST /api/orders/:id/move)
  // so a half-applied move can't leave stock and order status out of sync.
  try{
    const result = await api.orders.move(id, direction);
    State.orders = result.orders;
    State.stock = result.stock;
    render();
    const o = State.orders.find(x=>x.id===id);
    showToast(o ? `Order marked "${o.status}"` : 'Order updated');
  }catch(e){
    showToast(e.message || 'Could not update order status');
  }
}

// ---------- Init ----------
(async function init(){
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:#6B6656;font-family:Inter,sans-serif;">Loading…</div>`;
  await loadAll();
  render();
})();
