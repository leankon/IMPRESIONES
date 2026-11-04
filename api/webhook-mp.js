// POST /api/webhook-mp  → Mercado Pago avisa acá cuando hay un pago.
// No confiamos en lo que viene en el aviso: consultamos el pago directo a MP.
import { db, enviar, procesarNotificacionMP } from './_lib.js';

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const b = req.body || {};
    const tipo = q.type || q.topic || b.type || b.topic;
    const id = q['data.id'] || b?.data?.id || (tipo === 'payment' ? q.id : null);
    if (tipo === 'payment' && id) {
      await procesarNotificacionMP(db(), id);
    }
  } catch (e) {
    console.error(e);
  }
  // Siempre 200 para que MP no reintente indefinidamente.
  return enviar(res, 200, { ok: true });
}
