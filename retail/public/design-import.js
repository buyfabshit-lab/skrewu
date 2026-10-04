// Upload every required file before creating the product. Owner authentication
// and exact-origin checks are performed by the caller and the shop API.
export async function importDesign(data, { upload, saveProduct }) {
  const photo = await upload(data.preview);
  const original = await upload(data.artwork);
  const additional = [];
  for (const item of data.additional_prints) {
    const file = await upload(item.artwork);
    additional.push({ ...item.print, artwork_path: file.image_path, url: file.image_url });
  }
  const product = { id: data.design_spec.transfer_id, name: data.name, description: data.description, garment: data.garment,
    price_cents: data.price_cents, status: data.intent === 'publish' ? 'published' : 'draft', variants: data.variants,
    image_path: photo.image_path, artwork_path: original.image_path,
    design_spec: { ...data.design_spec, ...(additional.length ? {
      additional_prints: additional.map(({ url, ...item }) => item)
    } : {}) } };
  const saved = data.intent === 'publish' ? (await saveProduct(product)).product : product;
  return { ...saved, image_url: photo.image_url, artwork_url: original.image_url,
    additional_artwork_urls: additional.map(({ url, ...item }) => ({ ...item, url })) };
}
