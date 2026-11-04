// Cálculo de precios. Lo usan tanto la tienda (para mostrar) como el
// servidor (para cobrar), así que el precio siempre es el mismo.

const num = (v) => Number(v) || 0;

export function precioPorCarilla(a, color, dobleFaz) {
  if (color) return num(dobleFaz ? a.precio_color_doble : a.precio_color_simple);
  return num(dobleFaz ? a.precio_byn_doble : a.precio_byn_simple);
}

/** Precio de UNA copia de un PDF propio. */
export function precioUnitarioPdf(it, a) {
  const paginas = Math.max(1, Math.floor(num(it.paginas)));
  const base = paginas * precioPorCarilla(a, !!it.color, !!it.doble_faz);
  return Math.round(base + (it.anillado ? num(a.precio_anillado) : 0));
}

/** Cantidad de hojas físicas de una copia. */
export function hojas(paginas, dobleFaz) {
  return dobleFaz ? Math.ceil(paginas / 2) : paginas;
}

/** items ya deben tener precio_unit y cantidad. */
export function calcularTotales(items, a) {
  let subtotal = 0;
  let subtotalPdf = 0;
  let carillasPdf = 0;
  for (const it of items) {
    const sub = num(it.precio_unit) * num(it.cantidad);
    subtotal += sub;
    if (it.tipo === 'pdf') {
      subtotalPdf += sub;
      carillasPdf += num(it.paginas) * num(it.cantidad);
    }
  }
  const umbral = num(a.descuento_umbral);
  const pct = num(a.descuento_pct);
  const descuento = umbral > 0 && pct > 0 && carillasPdf >= umbral ? Math.round((subtotalPdf * pct) / 100) : 0;
  return { subtotal, descuento, total: subtotal - descuento, carillasPdf };
}
