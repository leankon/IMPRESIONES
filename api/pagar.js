// POST /api/pagar { codigo }  → genera un link nuevo de Mercado Pago para un pedido impago.
// También sirve para pasar un pedido de transferencia a Mercado Pago.
import { db, enviar, limpiarCodigo, urlSitio, crearPreferenciaMP, mpConfigurado } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return enviar(res, 405, { error: 'Método no permitido' });
  if (!mpConfigurado()) return enviar(res, 400, { error: 'Mercado Pago no está disponible.' });
  const codigo = limpiarCodigo(req.body?.codigo);

  try {
    const supa = db();
    const { data: p } = await supa.from('pedidos').select('*').eq('codigo', codigo).maybeSingle();
    if (!p) return enviar(res, 404, { error: 'Pedido no encontrado.' });
    if (p.estado_pago === 'pagado') return enviar(res, 400, { error: 'Este pedido ya está pagado.' });
    if (p.estado === 'cancelado') return enviar(res, 400, { error: 'Este pedido está cancelado.' });

    const pref = await crearPreferenciaMP(p, urlSitio(req));
    await supa.from('pedidos').update({ mp_preference_id: pref.id, metodo_pago: 'mercadopago' }).eq('id', p.id);
    return enviar(res, 200, { pago_url: pref.init_point });
  } catch (e) {
    console.error(e);
    return enviar(res, 500, { error: 'No se pudo generar el pago. Probá de nuevo.' });
  }
}
