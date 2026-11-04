// POST /api/crear-pedido
// Recibe el carrito, RECALCULA los precios con los valores de la base
// (el cliente no puede cambiar lo que paga), guarda el pedido y, si
// eligió Mercado Pago, devuelve el link de pago.
import { PDFDocument } from 'pdf-lib';
import { db, enviar, urlSitio, nuevoCodigo, crearPreferenciaMP, mpConfigurado } from './_lib.js';
import { precioUnitarioPdf, calcularTotales, hojas } from '../js/precios.js';

const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const entero = (v, min, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

async function contarPaginas(supa, path) {
  try {
    const { data, error } = await supa.storage.from('archivos').download(path);
    if (error || !data) return null;
    const pdf = await PDFDocument.load(new Uint8Array(await data.arrayBuffer()), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return enviar(res, 405, { error: 'Método no permitido' });

  try {
    const supa = db();
    const b = req.body || {};

    const nombre = texto(b.nombre, 80);
    const telefono = texto(b.telefono, 30);
    const curso = texto(b.curso, 40);
    const notas = texto(b.notas, 500);
    const metodo_pago = b.metodo_pago === 'mercadopago' ? 'mercadopago' : 'transferencia';
    if (!nombre || !telefono) return enviar(res, 400, { error: 'Completá nombre y teléfono.' });
    if (!Array.isArray(b.items) || b.items.length === 0) return enviar(res, 400, { error: 'El pedido está vacío.' });
    if (b.items.length > 40) return enviar(res, 400, { error: 'Demasiados ítems en un solo pedido.' });
    if (metodo_pago === 'mercadopago' && !mpConfigurado()) {
      return enviar(res, 400, { error: 'El pago con Mercado Pago no está disponible. Elegí transferencia.' });
    }

    const { data: ajustes, error: errAj } = await supa.from('ajustes').select('*').eq('id', 1).single();
    if (errAj) throw errAj;
    if (!ajustes.pedidos_abiertos) return enviar(res, 400, { error: 'Por ahora no estamos tomando pedidos.' });

    // Catálogo
    const idsCat = [...new Set(b.items.filter((i) => i.tipo === 'catalogo').map((i) => Number(i.catalogo_id)))];
    let catalogo = new Map();
    if (idsCat.length) {
      const { data, error } = await supa.from('catalogo').select('*').in('id', idsCat).eq('activo', true);
      if (error) throw error;
      catalogo = new Map(data.map((c) => [Number(c.id), c]));
    }

    const items = [];
    for (const it of b.items) {
      const cantidad = entero(it.cantidad, 1, 200);
      if (!cantidad) return enviar(res, 400, { error: 'Cantidad inválida.' });

      if (it.tipo === 'catalogo') {
        const c = catalogo.get(Number(it.catalogo_id));
        if (!c) return enviar(res, 400, { error: 'Un apunte del carrito ya no está disponible. Sacalo y probá de nuevo.' });
        items.push({
          tipo: 'catalogo',
          catalogo_id: Number(c.id),
          titulo: c.titulo,
          color: !!c.color,
          paginas: c.paginas || null,
          cantidad,
          precio_unit: Number(c.precio),
        });
      } else if (it.tipo === 'pdf') {
        const path = String(it.archivo_path || '');
        if (!/^pdfs\/[\w.\-]+$/.test(path)) return enviar(res, 400, { error: 'Archivo inválido.' });
        const contadas = await contarPaginas(supa, path);
        const paginas = contadas ?? entero(it.paginas, 1, 5000);
        if (!paginas) return enviar(res, 400, { error: `No pudimos leer el PDF "${texto(it.nombre_archivo, 80)}".` });
        const item = {
          tipo: 'pdf',
          archivo_path: path,
          nombre_archivo: texto(it.nombre_archivo, 120) || 'archivo.pdf',
          paginas,
          paginas_verificadas: contadas != null,
          color: !!it.color,
          doble_faz: !!it.doble_faz,
          anillado: !!it.anillado,
          cantidad,
        };
        item.hojas = hojas(paginas, item.doble_faz);
        item.precio_unit = precioUnitarioPdf(item, ajustes);
        items.push(item);
      } else {
        return enviar(res, 400, { error: 'Ítem inválido.' });
      }
    }

    const { subtotal, descuento, total } = calcularTotales(items, ajustes);
    if (total <= 0) return enviar(res, 400, { error: 'El total del pedido es $0.' });

    // Guardar (reintenta si el código sale repetido)
    let pedido = null;
    for (let intento = 0; intento < 5 && !pedido; intento++) {
      const { data, error } = await supa.from('pedidos').insert({
        codigo: nuevoCodigo(),
        nombre, telefono, curso: curso || null, notas: notas || null,
        items, subtotal, descuento, total, metodo_pago,
      }).select().single();
      if (!error) pedido = data;
      else if (error.code !== '23505') throw error;
    }
    if (!pedido) throw new Error('No se pudo generar el código del pedido');

    if (metodo_pago === 'mercadopago') {
      try {
        const pref = await crearPreferenciaMP(pedido, urlSitio(req));
        await supa.from('pedidos').update({ mp_preference_id: pref.id }).eq('id', pedido.id);
        return enviar(res, 200, { codigo: pedido.codigo, total, pago_url: pref.init_point });
      } catch (e) {
        // El pedido quedó guardado: puede reintentar el pago desde la página del pedido.
        console.error(e);
        return enviar(res, 200, { codigo: pedido.codigo, total });
      }
    }
    return enviar(res, 200, { codigo: pedido.codigo, total });
  } catch (e) {
    console.error(e);
    return enviar(res, 500, { error: 'Hubo un error guardando el pedido. Probá de nuevo en un rato.' });
  }
}
