// POST /api/comprobante { codigo, path }  → asocia el comprobante de transferencia subido.
import { db, enviar, limpiarCodigo } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return enviar(res, 405, { error: 'Método no permitido' });
  const codigo = limpiarCodigo(req.body?.codigo);
  const path = String(req.body?.path || '');
  if (!/^comprobantes\/[\w.\-]+$/.test(path)) return enviar(res, 400, { error: 'Archivo inválido.' });

  try {
    const supa = db();
    const { data: p } = await supa.from('pedidos').select('id, estado_pago, estado').eq('codigo', codigo).maybeSingle();
    if (!p) return enviar(res, 404, { error: 'Pedido no encontrado.' });
    if (p.estado_pago === 'pagado') return enviar(res, 400, { error: 'Este pedido ya figura como pagado.' });

    const { error } = await supa.from('pedidos').update({
      comprobante_path: path,
      estado_pago: 'en_revision',
      metodo_pago: 'transferencia',
    }).eq('id', p.id);
    if (error) throw error;
    return enviar(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return enviar(res, 500, { error: 'No se pudo guardar el comprobante.' });
  }
}
