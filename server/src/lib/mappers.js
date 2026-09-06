// Row (snake_case, DB) <-> resource (camelCase, API/frontend) mappers.
// Keeping the API shape close to the original in-browser State arrays meant
// the frontend rendering/pricing code didn't need to change, only its
// persistence layer.

export function stockToApi(row) {
  return {
    id: row.id,
    brand: row.brand || '',
    category: row.category || '',
    itemName: row.item_name,
    v: row.is_veg,
    vg: row.is_vegan,
    g: row.is_gluten_free,
    n: row.contains_nuts,
    cost: row.cost ?? 0,
    price: row.price ?? 0,
    weight: row.weight,
    vat: row.vat || '',
    availability: row.availability || '',
    qtyOnHand: row.qty_on_hand ?? 0,
    qtyOnOrder: row.qty_on_order ?? 0,
  };
}

export function packagingToApi(row) {
  return {
    id: row.id,
    size: row.size,
    price: row.price ?? 0,
    weight: row.weight,
    cost: row.cost,
    vat: row.vat || 'Standard 20%',
  };
}

export function shippingToApi(row) {
  return {
    id: row.id,
    label: row.label,
    price: row.price ?? 0,
    vat: row.vat || 'Standard 20%',
  };
}

export function sourceToApi(row) {
  return { id: row.id, label: row.label };
}

export function customerToApi(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    sourceId: row.source_id,
    contactName: row.contact_name || '',
    email: row.email || '',
    phonePrimary: row.phone_primary || '',
    phoneSecondary: row.phone_secondary || '',
    contactName2: row.contact_name2 || '',
    email2: row.email2 || '',
    phone2Primary: row.phone2_primary || '',
    phone2Secondary: row.phone2_secondary || '',
    ribbonColor: row.ribbon_color || '',
    fontColor: row.font_color || '',
    logoUrl: row.logo_url || '',
    notes: row.notes || '',
  };
}

export function productToApi(row, components) {
  return {
    id: row.id,
    name: row.name,
    packagingId: row.packaging_id,
    shippingId: row.shipping_id,
    photoUrl: row.photo_url || '',
    components: components.map((c) => ({
      componentId: c.component_id,
      qty: c.qty,
      price: c.price,
    })),
  };
}

export function orderToApi(row, items) {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    notes: row.notes || '',
    readyToInvoice: row.ready_to_invoice,
    stockDeducted: row.stock_deducted,
    invoiceNumber: row.invoice_number,
    items: items.map((it) => ({
      productId: it.product_id,
      qty: it.qty,
      qtyPacked: it.qty_packed ?? 0,
      qtyShipped: it.qty_shipped ?? 0,
    })),
  };
}

const PROPOSAL_SLOTS = 10;

export function proposalToApi(row, hampers) {
  const hamperIds = new Array(PROPOSAL_SLOTS).fill(null);
  hampers.forEach((h) => {
    if (h.slot_index >= 0 && h.slot_index < PROPOSAL_SLOTS) {
      hamperIds[h.slot_index] = h.product_id;
    }
  });
  return {
    id: row.id,
    customerId: row.customer_id,
    proposalDate: row.proposal_date,
    hamperIds,
    docName: row.doc_name || '',
    docSource: row.doc_source || '',
    docUrl: row.doc_url || '',
  };
}
