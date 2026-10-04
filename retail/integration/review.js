import { openShopDraft } from './design-bridge.js';
const form = document.getElementById('transferForm'), status = document.getElementById('message'), button = document.getElementById('sendDesign');
form.onsubmit = async event => {
  event.preventDefault(); button.disabled = true; status.textContent = 'Open the shop review desk to receive your design.';
  try {
    await openShopDraft({ shopUrl: location.origin, getDesign: async () => ({
      preview: form.elements.preview.files[0], artwork: form.elements.artwork.files[0],
      name: form.elements.name.value, description: form.elements.description.value, garment: form.elements.garment.value,
      print: { placement: form.elements.placement.value, width_inches: Number(form.elements.width.value), height_inches: Number(form.elements.height.value) },
      variants: [{ size: form.elements.size.value, color: form.elements.color.value, available: true }]
    }) });
    status.textContent = 'Design received. Review your price and options, then save the draft in the shop window.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
