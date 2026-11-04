import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, NOMBRE_NEGOCIO } from './config.js';

export const configurado = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON');
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export { NOMBRE_NEGOCIO };

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ESTADO = {
  nuevo: 'Recibido',
  en_imprenta: 'En la imprenta',
  retirado: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const ESTADO_PAGO = {
  pendiente: 'Pago pendiente',
  en_revision: 'Comprobante en revisión',
  pagado: 'Pagado',
  rechazado: 'Pago rechazado',
};

export function etiquetaColor(color) {
  return color ? 'Color' : 'B/N';
}

/** Descripción corta de un ítem, ej: "Toldot 1 · B/N" o "tp.pdf · 24 pág · Color · doble faz · anillado" */
export function describirItem(it) {
  if (it.tipo === 'catalogo') return `${it.titulo} · ${etiquetaColor(it.color)}`;
  const partes = [it.nombre_archivo || it.titulo, `${it.paginas} pág`, etiquetaColor(it.color), it.doble_faz ? 'doble faz' : 'simple faz'];
  if (it.anillado) partes.push('anillado');
  return partes.join(' · ');
}

let toastTimer;
export function toast(msg, tipo = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast visible ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

export function avisoSinConfigurar(contenedor) {
  contenedor.innerHTML = `<div class="card aviso-config">
    <h2>Falta configurar</h2>
    <p>Completá <code>js/config.js</code> con la URL y la anon key de tu proyecto de Supabase.
    Los pasos están en el <code>README.md</code>.</p></div>`;
}

export function idAleatorio() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

export function nombreSeguro(nombre) {
  return String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\-]+/g, '_').slice(-60);
}

export async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  let data = {};
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

export function fecha(iso) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function linkWhatsApp(tel, texto = '') {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (n.length === 10) n = '549' + n; // número argentino sin código de país
  return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}
