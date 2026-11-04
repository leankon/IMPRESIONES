// Utilidades compartidas por las funciones del servidor (Vercel).
// Los archivos que empiezan con "_" no se publican como endpoint.
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function enviar(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function urlSitio(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nuevoCodigo() {
  let c = '';
  for (let i = 0; i < 6; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

export function limpiarCodigo(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

// ------------------------- Mercado Pago -------------------------

const MP_API = 'https://api.mercadopago.com';

function tokenMP() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error('Falta MP_ACCESS_TOKEN en Vercel');
  return t;
}

export function mpConfigurado() {
  return !!process.env.MP_ACCESS_TOKEN;
}

export async function crearPreferenciaMP(pedido, sitio) {
  const vuelta = `${sitio}/pedido.html?codigo=${pedido.codigo}`;
  const body = {
    items: [
      {
        id: pedido.codigo,
        title: `Pedido de impresiones ${pedido.codigo}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: Number(pedido.total),
      },
    ],
    payer: { name: pedido.nombre },
    external_reference: pedido.id,
    back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
    auto_return: 'approved',
    notification_url: `${sitio}/api/webhook-mp`,
    statement_descriptor: 'IMPRESIONES',
  };
  const r = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenMP()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Mercado Pago: ${data.message || r.status}`);
  return data; // { id, init_point, ... }
}

async function obtenerPagoMP(id) {
  const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${tokenMP()}` },
  });
  if (!r.ok) return null;
  return r.json();
}

/** Marca el pedido como pagado si el pago de MP está aprobado y el monto coincide. */
export async function aplicarPagoMP(supa, pago) {
  if (!pago || pago.status !== 'approved' || !pago.external_reference) return false;
  const { data: pedido } = await supa.from('pedidos').select('id, total, estado_pago')
    .eq('id', pago.external_reference).maybeSingle();
  if (!pedido || pedido.estado_pago === 'pagado') return false;
  if (Number(pago.transaction_amount) + 0.01 < Number(pedido.total)) return false;
  await supa.from('pedidos').update({
    estado_pago: 'pagado',
    mp_payment_id: String(pago.id),
    pagado_at: new Date().toISOString(),
  }).eq('id', pedido.id);
  return true;
}

export async function procesarNotificacionMP(supa, paymentId) {
  const pago = await obtenerPagoMP(paymentId);
  return aplicarPagoMP(supa, pago);
}

/** Por si el webhook no llegó: busca pagos aprobados de este pedido. */
export async function sincronizarPagoMP(supa, pedido) {
  if (!mpConfigurado() || pedido.metodo_pago !== 'mercadopago' || pedido.estado_pago === 'pagado') return false;
  const r = await fetch(
    `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(pedido.id)}&sort=date_created&criteria=desc`,
    { headers: { Authorization: `Bearer ${tokenMP()}` } },
  );
  if (!r.ok) return false;
  const data = await r.json();
  const aprobado = (data.results || []).find((p) => p.status === 'approved');
  return aplicarPagoMP(supa, aprobado);
}
