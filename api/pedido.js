// GET /api/pedido?codigo=XXXXXX  → estado de un pedido (datos mínimos, sin teléfono)
import { db, enviar, limpiarCodigo, sincronizarPagoMP, mpConfigurado } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return enviar(res, 405, { error: 'Método no permitido' });
  const codigo = limpiarCodigo(req.query.codigo);
  if (!codigo) return enviar(res, 400, { error: 'Falta el código.' });

  try {
    const supa = db();
    const cargar = () => supa.from('pedidos').select('*').eq('codigo', codigo).maybeSingle();
    let { data: p, error } = await cargar();
    if (error) throw error;
    if (!p) return enviar(res, 404, { error: 'No encontramos un pedido con ese código.' });

    // Si pagó con MP y el aviso automático todavía no llegó, lo chequeamos acá.
    if (p.metodo_pago === 'mercadopago' && p.estado_pago !== 'pagado') {
      try {
        if (await sincronizarPagoMP(supa, p)) ({ data: p } = await cargar());
      } catch (e) { console.error(e); }
    }

    const respuesta = {
      codigo: p.codigo,
      nombre: p.nombre.split(' ')[0],
      curso: p.curso,
      items: p.items.map((i) => ({
        tipo: i.tipo,
        titulo: i.titulo || i.nombre_archivo,
        color: i.color,
        doble_faz: i.doble_faz,
        anillado: i.anillado,
        paginas: i.paginas,
        cantidad: i.cantidad,
        precio_unit: i.precio_unit,
      })),
      subtotal: Number(p.subtotal),
      descuento: Number(p.descuento),
      total: Number(p.total),
      metodo_pago: p.metodo_pago,
      estado_pago: p.estado_pago,
      estado: p.estado,
      tiene_comprobante: !!p.comprobante_path,
      created_at: p.created_at,
      mp_disponible: mpConfigurado(),
    };

    if (p.metodo_pago === 'transferencia' && p.estado_pago !== 'pagado') {
      const { data: a } = await supa.from('ajustes').select('alias, cvu, titular').eq('id', 1).single();
      respuesta.transferencia = a;
    }
    return enviar(res, 200, respuesta);
  } catch (e) {
    console.error(e);
    return enviar(res, 500, { error: 'Error consultando el pedido.' });
  }
}
