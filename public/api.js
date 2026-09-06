// Thin fetch wrapper around the Hamper Helper REST API. Every mutating call
// mirrors the shape the old window.storage-based app used internally: it
// resolves with the full, fresh collection so the caller can just assign it
// straight onto State and re-render.

// Fires when any request comes back 401 (session expired/never existed),
// except calls that opt out via skipUnauthorizedHandler — namely login
// itself, where a 401 just means "wrong password", not "you got logged out".
let onUnauthorized = null;
function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function apiRequest(method, path, body, reqOpts) {
  reqOpts = reqOpts || {};
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && !reqOpts.skipUnauthorizedHandler && onUnauthorized) onUnauthorized();
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

async function apiUploadFile(path, file, extraFields) {
  const form = new FormData();
  // A generated docx is a plain Blob with no .name, so pass the filename
  // explicitly — otherwise multer sees no extension to key off.
  const filename = (extraFields && extraFields.docName) || file.name || undefined;
  form.append('file', file, filename);
  Object.entries(extraFields || {}).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(path, { method: 'POST', body: form });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new Error((data && data.error) || `Upload failed (${res.status})`);
  }
  return data;
}

const api = {
  bootstrap: () => apiRequest('GET', '/api/bootstrap'),

  auth: {
    login: (username, password) => apiRequest('POST', '/api/login', { username, password }, { skipUnauthorizedHandler: true }),
    logout: () => apiRequest('POST', '/api/logout', undefined, { skipUnauthorizedHandler: true }),
    session: () => apiRequest('GET', '/api/session'),
  },
  staff: {
    list: () => apiRequest('GET', '/api/staff'),
    create: (item) => apiRequest('POST', '/api/staff', item),
    update: (id, item) => apiRequest('PUT', `/api/staff/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/staff/${id}`),
  },

  stock: {
    create: (item) => apiRequest('POST', '/api/stock', item),
    update: (id, item) => apiRequest('PUT', `/api/stock/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/stock/${id}`),
    import: (rows) => apiRequest('POST', '/api/stock/import', { rows }),
  },
  packaging: {
    create: (item) => apiRequest('POST', '/api/packaging', item),
    update: (id, item) => apiRequest('PUT', `/api/packaging/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/packaging/${id}`),
  },
  shipping: {
    create: (item) => apiRequest('POST', '/api/shipping', item),
    update: (id, item) => apiRequest('PUT', `/api/shipping/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/shipping/${id}`),
  },
  sources: {
    create: (item) => apiRequest('POST', '/api/sources', item),
    update: (id, item) => apiRequest('PUT', `/api/sources/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/sources/${id}`),
  },
  customers: {
    create: (item) => apiRequest('POST', '/api/customers', item),
    update: (id, item) => apiRequest('PUT', `/api/customers/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/customers/${id}`),
    import: (rows) => apiRequest('POST', '/api/customers/import', { rows }),
  },
  products: {
    create: (item) => apiRequest('POST', '/api/products', item),
    update: (id, item) => apiRequest('PUT', `/api/products/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/products/${id}`),
  },
  orders: {
    create: (item) => apiRequest('POST', '/api/orders', item),
    update: (id, item) => apiRequest('PUT', `/api/orders/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/orders/${id}`),
    move: (id, direction) => apiRequest('POST', `/api/orders/${id}/move`, { direction }),
  },
  proposals: {
    create: (item) => apiRequest('POST', '/api/proposals', item),
    update: (id, item) => apiRequest('PUT', `/api/proposals/${id}`, item),
    remove: (id) => apiRequest('DELETE', `/api/proposals/${id}`),
    uploadDocument: (id, file, meta) => apiUploadFile(`/api/proposals/${id}/document`, file, meta),
  },
  uploads: {
    image: (file) => apiUploadFile('/api/uploads', file),
  },
  reports: {
    readyToInvoice: () => apiRequest('POST', '/api/reports/ready-to-invoice'),
  },
};
