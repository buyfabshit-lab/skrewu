/**
 * deploy-shopify  —  create a product on the SKREW U Shopify store (DEATH CORPS).
 *
 * This runs server-side ONLY so the Admin API token never reaches the browser.
 *
 * Required Netlify environment variables:
 *   SHOPIFY_STORE_DOMAIN   e.g. "deathcorps.myshopify.com"  (the *.myshopify.com admin domain, NOT deathcorps.shop)
 *   SHOPIFY_ADMIN_TOKEN    Admin API access token  (shpat_...)  — from a custom app with write_products scope
 * Optional:
 *   SHOPIFY_API_VERSION    defaults to "2024-10"
 *   DEPLOY_SHARED_KEY      if set, callers must send matching "x-deploy-key" header (basic gate)
 *
 * Expects a JSON POST body:
 *   {
 *     title:        string   (required)
 *     description:  string   (HTML or plain text; plain gets wrapped)
 *     price:        string|number (required)
 *     compareAtPrice: string|number (optional)
 *     imageUrl:     string   (public URL, e.g. Supabase Storage) (optional)
 *     sku:          string   (optional)
 *     tags:         string[] (optional)
 *     productType:  string   (optional)
 *     vendor:       string   (optional, defaults "SKREW U")
 *     publish:      boolean  (optional; false => DRAFT, true => ACTIVE. Default DRAFT for safety)
 *   }
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

async function shopifyGraphQL(domain, token, query, variables) {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Shopify returned non-JSON (${res.status}): ${text.slice(0, 300)}`); }
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (data.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  return data.data;
}

const PRODUCT_CREATE = `
  mutation CreateProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
    productCreate(input: $input, media: $media) {
      product {
        id
        handle
        onlineStoreUrl
        variants(first: 1) { nodes { id } }
      }
      userErrors { field message }
    }
  }`;

const VARIANTS_UPDATE = `
  mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price sku }
      userErrors { field message }
    }
  }`;

/* Which of the required variables are missing, by name. A name is not a
   secret; the value never appears. Saying "one of these two" is what makes a
   missing key take an hour to find. */
function missingEnv(names) {
  return names.filter((n) => !process.env[n]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + missingEnv(['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN']).join(' and ') + ' in Netlify.' });
  }

  // Optional basic gate so the endpoint isn't wide open.
  const sharedKey = process.env.DEPLOY_SHARED_KEY;
  if (sharedKey && event.headers['x-deploy-key'] !== sharedKey) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid JSON body' }); }

  const { title, description, price, compareAtPrice, imageUrl, sku, tags, productType, vendor, publish } = body;
  if (!title || !String(title).trim()) return json(400, { ok: false, error: 'title is required' });
  if (price === undefined || price === null || price === '') return json(400, { ok: false, error: 'price is required' });

  // Wrap plain-text descriptions in a paragraph so line breaks survive.
  const looksLikeHtml = typeof description === 'string' && /<\/?[a-z][\s\S]*>/i.test(description);
  const descriptionHtml = description
    ? (looksLikeHtml ? description : `<p>${String(description).replace(/\n/g, '<br>')}</p>`)
    : '';

  try {
    // 1) Create the product (DRAFT unless explicitly publishing).
    const input = {
      title: String(title).trim(),
      descriptionHtml,
      status: publish ? 'ACTIVE' : 'DRAFT',
      vendor: vendor || 'SKREW U',
    };
    if (Array.isArray(tags) && tags.length) input.tags = tags;
    if (productType) input.productType = productType;

    const media = imageUrl
      ? [{ originalSource: imageUrl, mediaContentType: 'IMAGE', alt: String(title).trim() }]
      : undefined;

    const created = await shopifyGraphQL(domain, token, PRODUCT_CREATE, { input, media });
    const pc = created.productCreate;
    if (pc.userErrors && pc.userErrors.length) {
      return json(422, { ok: false, error: 'Shopify rejected the product', details: pc.userErrors });
    }
    const product = pc.product;
    const variantId = product.variants.nodes[0] && product.variants.nodes[0].id;

    // 2) Set price / compare-at / SKU on the default variant.
    if (variantId) {
      const variant = { id: variantId, price: String(price) };
      if (compareAtPrice) variant.compareAtPrice = String(compareAtPrice);
      if (sku) variant.inventoryItem = { sku: String(sku) };
      const updated = await shopifyGraphQL(domain, token, VARIANTS_UPDATE, {
        productId: product.id,
        variants: [variant],
      });
      const ue = updated.productVariantsBulkUpdate.userErrors;
      if (ue && ue.length) {
        // Product exists but price didn't stick — report partial success honestly.
        return json(207, {
          ok: false,
          error: 'Product created but pricing failed',
          details: ue,
          productId: product.id,
          adminUrl: adminUrlFor(domain, product.id),
        });
      }
    }

    return json(200, {
      ok: true,
      channel: 'shopify',
      productId: product.id,
      handle: product.handle,
      status: publish ? 'ACTIVE' : 'DRAFT',
      onlineStoreUrl: product.onlineStoreUrl || null,
      adminUrl: adminUrlFor(domain, product.id),
    });
  } catch (err) {
    return json(502, { ok: false, error: String(err.message || err) });
  }
};

function adminUrlFor(domain, gid) {
  const numeric = String(gid).split('/').pop();
  return `https://${domain}/admin/products/${numeric}`;
}
