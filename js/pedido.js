import { sb, configurado, NOMBRE_NEGOCIO, $, esc, pesos, toast, api, idAleatorio, nombreSeguro, ESTADO, ESTADO_PAGO, describirItem, fecha } from './comun.js';

$('#marca').textContent = NOMBRE_NEGOCIO;
const CLAVE_MIS = 'impresiones.mispedidos';
let mis = [];
try { mis = JSON.parse(localStorage.getItem(CLAVE_MIS)) || []; } catch { /* nada */ }

const params = new URLSearchParams(location.search);

function pintarMisPedidos() {
  if (!mis.length) return;
  $('#misPedidos').innerHTML = 'Tus últimos pedidos: ' +
    mis.map((c) => `<a href="?codigo=${encodeURIComponent(c)}">${esc(c)}</a>`).join(' · ');
}

const pillPago = (e) => `<span class="pill ${e === 'pagado' ? 'ok' : e === 'rechazado' ? 'error' : 'alerta'}">${ESTADO_PAGO[e]}</span>`;

async function cargar(codigo) {
  codigo = codigo.trim().toUpperCase();
  if (!codigo) return;
  $('#codigo').value = codigo;
  $('#resultado').innerHTML = '<p class="vacio">Buscando…</p>';
  let p;
  try {
    p = await api(`/api/pedido?codigo=${encodeURIComponent(codigo)}`);
  } catch (e) {
    $('#resultado').innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`;
    return;
  }
  if (!mis.includes(p.codigo)) {
    mis = [p.codigo, ...mis].slice(0, 10);
    try { localStorage.setItem(CLAVE_MIS, JSON.stringify(mis)); } catch { /* nada */ }
  }

  const orden = ['nuevo', 'en_imprenta', 'retirado', 'entregado'];
  const idx = orden.indexOf(p.estado);
  const pasos = p.estado === 'cancelado' ? '' : `<div class="pasos">
    <div class="${p.estado_pago === 'pagado' ? 'hecho' : ''}">Pagado</div>
    ${orden.slice(1).map((e, i) => `<div class="${idx >= i + 1 ? 'hecho' : ''}">${ESTADO[e]}</div>`).join('')}
  </div>`;

  let pago = '';
  if (p.estado !== 'cancelado' && p.estado_pago !== 'pagado') {
    if (p.metodo_pago === 'transferencia' && p.transferencia) {
      const t = p.transferencia;
      const fila = (label, valor) => valor ? `<div class="dato-copiar"><span>${label}: <b>${esc(valor)}</b></span>
        <button class="sec chico" data-copiar="${esc(valor)}">Copiar</button></div>` : '';
      pago = `<div class="card">
        <h2>Pagá por transferencia</h2>
        ${fila('Monto', String(Math.round(p.total)))}
        ${fila('Alias', t.alias)}
        ${fila('CVU/CBU', t.cvu)}
        ${t.titular ? `<p class="chico" style="margin-top:8px">Titular: ${esc(t.titular)}</p>` : ''}
        ${p.tiene_comprobante ? '<p class="aviso" style="margin-top:12px">Recibimos tu comprobante. Lo vamos a revisar pronto. Si te equivocaste podés subir otro.</p>' : ''}
        <label for="comprobante">Subí la captura del comprobante</label>
        <input type="file" id="comprobante" accept="image/*,application/pdf" />
        <button id="btnComprobante" style="margin-top:10px">Enviar comprobante</button>
        ${p.mp_disponible ? '<p class="chico" style="margin-top:12px">¿Preferís pagar con Mercado Pago? <a href="#" id="pasarMP">Pagar con Mercado Pago</a></p>' : ''}
      </div>`;
    } else if (p.metodo_pago === 'mercadopago') {
      pago = `<div class="card">
        <h2>Falta el pago</h2>
        <p>Si ya pagaste, puede tardar unos minutos en aparecer. Si no, podés pagar ahora:</p>
        <button id="btnPagarMP" class="grande">Pagar ${pesos(p.total)} con Mercado Pago</button>
      </div>`;
    }
  }

  $('#resultado').innerHTML = `
    ${params.get('nuevo') && p.codigo === params.get('codigo')?.toUpperCase()
      ? '<div class="card" style="border-color:var(--ok)"><h2>¡Pedido recibido! 🎉</h2><p>Guardá este código para seguirlo: <b style="font-size:1.3rem">' + esc(p.codigo) + '</b></p></div>' : ''}
    <div class="card">
      <div class="fila" style="justify-content:space-between;align-items:baseline">
        <h2 style="margin:0">Pedido ${esc(p.codigo)}</h2>
        <span class="chico" style="flex:0 0 auto">${fecha(p.created_at)}</span>
      </div>
      <p class="chico">${esc(p.nombre)}${p.curso ? ' · ' + esc(p.curso) : ''}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${pillPago(p.estado_pago)} <span class="pill ${p.estado === 'cancelado' ? 'error' : ''}">${ESTADO[p.estado]}</span></div>
      ${pasos}
      <ul class="lista-items">
        ${p.items.map((it) => `<li><span class="desc">${esc(describirItem(it))}<br><span class="chico">${it.cantidad} × ${pesos(it.precio_unit)}</span></span><b>${pesos(it.precio_unit * it.cantidad)}</b></li>`).join('')}
      </ul>
      <div class="totales">
        ${p.descuento ? `<div style="color:var(--ok)">Descuento: −${pesos(p.descuento)}</div>` : ''}
        <div class="total">Total: ${pesos(p.total)}</div>
      </div>
    </div>
    ${pago}`;

  $('#resultado').querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copiar); toast('Copiado'); } catch { toast('No se pudo copiar', 'error'); }
  }));

  const pagarMP = async (e) => {
    e?.preventDefault();
    try {
      const r = await api('/api/pagar', { method: 'POST', body: JSON.stringify({ codigo: p.codigo }) });
      location.href = r.pago_url;
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#btnPagarMP')?.addEventListener('click', pagarMP);
  $('#pasarMP')?.addEventListener('click', pagarMP);

  $('#btnComprobante')?.addEventListener('click', async () => {
    const file = $('#comprobante').files[0];
    if (!file) return toast('Elegí la imagen del comprobante.', 'error');
    if (!configurado) return toast('El sitio no está configurado.', 'error');
    const btn = $('#btnComprobante');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const path = `comprobantes/${idAleatorio()}-${nombreSeguro(file.name)}`;
      const { error } = await sb.storage.from('archivos').upload(path, file, { contentType: file.type || undefined });
      if (error) throw new Error('No se pudo subir el archivo.');
      await api('/api/comprobante', { method: 'POST', body: JSON.stringify({ codigo: p.codigo, path }) });
      toast('¡Comprobante enviado!');
      cargar(p.codigo);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Enviar comprobante';
    }
  });
}

$('#formBuscar').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $('#codigo').value.trim().toUpperCase();
  history.replaceState(null, '', `?codigo=${encodeURIComponent(c)}`);
  cargar(c);
});

pintarMisPedidos();
if (params.get('codigo')) cargar(params.get('codigo'));
