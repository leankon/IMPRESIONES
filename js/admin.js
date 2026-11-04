import { sb, configurado, NOMBRE_NEGOCIO, $, $$, esc, pesos, toast, avisoSinConfigurar, ESTADO, ESTADO_PAGO, describirItem, fecha, linkWhatsApp, etiquetaColor } from './comun.js';
import { requerirSesion, salir, urlArchivo } from './sesion.js';

$('#marca').textContent = `${NOMBRE_NEGOCIO} · Panel`;
const app = $('#app');

let pedidos = [];
let tab = 'pedidos';
const filtros = { estado: 'activos', pago: '', q: '' };

const pillPago = (e) => `<span class="pill ${e === 'pagado' ? 'ok' : e === 'rechazado' ? 'error' : 'alerta'}">${ESTADO_PAGO[e]}</span>`;
const pillEstado = (e) => `<span class="pill ${e === 'cancelado' ? 'error' : e === 'entregado' ? 'ok' : ''}">${ESTADO[e]}</span>`;
const hoy = () => new Date().toLocaleDateString('es-AR');

async function iniciar() {
  if (!configurado) return avisoSinConfigurar(app);
  const perfil = await requerirSesion(app, 'Entrar al panel');
  if (perfil.rol !== 'admin') { location.href = 'retiro.html'; return; }
  $('#navAdmin').classList.remove('oculto');
  $('#salir').addEventListener('click', (e) => { e.preventDefault(); salir(); });

  app.innerHTML = `
    <div class="tabs" role="tablist">
      <button data-tab="pedidos">Pedidos <span class="badge oculto" id="bRevisar"></span></button>
      <button data-tab="imprenta">Imprenta <span class="badge oculto" id="bImprenta"></span></button>
      <button data-tab="entregas">Entregas <span class="badge oculto" id="bEntregas"></span></button>
      <button data-tab="precios">Precios y pagos</button>
      <button data-tab="catalogo">Catálogo</button>
    </div>
    <div id="contenido"></div>`;
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; pintar(); }));

  // Actualización en vivo cuando entra o cambia un pedido
  sb.channel('pedidos').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => recargar()).subscribe();
  await recargar();
}

async function recargar() {
  const { data, error } = await sb.from('pedidos').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) { toast('No se pudieron cargar los pedidos', 'error'); return; }
  pedidos = data;
  const n = (f) => pedidos.filter(f).length;
  const badge = (id, v) => { $(id).textContent = v; $(id).classList.toggle('oculto', !v); };
  badge('#bRevisar', n((p) => p.estado_pago === 'en_revision' && p.estado !== 'cancelado'));
  badge('#bImprenta', n((p) => p.estado === 'nuevo' && p.estado_pago === 'pagado'));
  badge('#bEntregas', n((p) => p.estado === 'retirado'));
  if (['pedidos', 'imprenta', 'entregas'].includes(tab) || !$('#contenido').innerHTML) pintar();
}

function pintar() {
  $$('.tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.tab === tab));
  const c = $('#contenido');
  if (c.dataset.tab !== tab) { c.innerHTML = ''; c.onclick = null; c.onchange = null; c.dataset.tab = tab; }
  ({ pedidos: tabPedidos, imprenta: tabImprenta, entregas: tabEntregas, precios: tabPrecios, catalogo: tabCatalogo })[tab]();
}

async function actualizarPedido(id, cambios, msg) {
  const { error } = await sb.from('pedidos').update(cambios).eq('id', id);
  if (error) { toast('No se pudo guardar: ' + error.message, 'error'); return false; }
  if (msg) toast(msg);
  await recargar();
  return true;
}

// =============================== PEDIDOS ===============================

function tarjetaPedido(p, { conAcciones = true } = {}) {
  const items = p.items.map((it) => {
    const extra = it.tipo === 'pdf'
      ? ` <button class="sec chico" data-descargar="${esc(it.archivo_path)}" data-nombre="${esc(p.codigo + '_' + it.nombre_archivo)}">Descargar</button>${it.paginas_verificadas === false ? ' <span class="pill alerta">verificar páginas</span>' : ''}`
      : '';
    return `<li><b>${it.cantidad}×</b> ${esc(describirItem(it))} — ${pesos(it.precio_unit * it.cantidad)}${extra}</li>`;
  }).join('');

  let accionesPago = '';
  if (p.estado_pago !== 'pagado' && p.estado !== 'cancelado') {
    if (p.comprobante_path) accionesPago += `<button class="sec chico" data-comprobante="${esc(p.comprobante_path)}">Ver comprobante</button>`;
    accionesPago += `<button class="ok chico" data-accion="pagado" data-id="${p.id}">Confirmar pago</button>`;
    if (p.estado_pago === 'en_revision') accionesPago += `<button class="peligro chico" data-accion="rechazar" data-id="${p.id}">Rechazar comprobante</button>`;
  } else if (p.comprobante_path) {
    accionesPago += `<button class="sec chico" data-comprobante="${esc(p.comprobante_path)}">Ver comprobante</button>`;
  }

  return `<div class="pedido">
    <div class="cab">
      <span><span class="codigo">${esc(p.codigo)}</span> · <b>${esc(p.nombre)}</b>${p.curso ? ' · ' + esc(p.curso) : ''}</span>
      <span class="chico">${fecha(p.created_at)}</span>
    </div>
    <div class="pills">${pillPago(p.estado_pago)} ${pillEstado(p.estado)}
      <span class="pill">${p.metodo_pago === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'}</span>
      <b style="margin-left:auto">${pesos(p.total)}</b></div>
    <ul>${items}</ul>
    ${p.descuento > 0 ? `<p class="chico">Descuento aplicado: ${pesos(p.descuento)}</p>` : ''}
    ${p.notas ? `<p class="aviso">📝 ${esc(p.notas)}</p>` : ''}
    ${p.nota_interna ? `<p class="chico">🔒 Nota interna: ${esc(p.nota_interna)}</p>` : ''}
    ${conAcciones ? `<div class="acciones">
      ${accionesPago}
      <a class="boton sec chico" style="padding:6px 10px;font-size:.85rem" target="_blank" rel="noopener" href="${linkWhatsApp(p.telefono, `Hola ${p.nombre.split(' ')[0]}! Te escribo por tu pedido ${p.codigo} de impresiones.`)}">WhatsApp ${esc(p.telefono)}</a>
      <select data-estado="${p.id}" aria-label="Estado del pedido" style="width:auto">
        ${Object.entries(ESTADO).map(([k, v]) => `<option value="${k}" ${k === p.estado ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <button class="sec chico" data-nota="${p.id}">Nota</button>
    </div>` : ''}
  </div>`;
}

function enlazarAccionesPedido(cont) {
  cont.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.descargar) {
        window.open(await urlArchivo(t.dataset.descargar, t.dataset.nombre), '_blank');
      } else if (t.dataset.comprobante) {
        window.open(await urlArchivo(t.dataset.comprobante), '_blank');
      } else if (t.dataset.accion === 'pagado') {
        await actualizarPedido(t.dataset.id, { estado_pago: 'pagado', pagado_at: new Date().toISOString() }, 'Pago confirmado');
      } else if (t.dataset.accion === 'rechazar') {
        await actualizarPedido(t.dataset.id, { estado_pago: 'rechazado' }, 'Comprobante rechazado');
      } else if (t.dataset.nota) {
        const p = pedidos.find((x) => x.id === t.dataset.nota);
        const nota = prompt('Nota interna (solo la ven vos y tu papá):', p.nota_interna || '');
        if (nota !== null) await actualizarPedido(p.id, { nota_interna: nota.trim() || null }, 'Nota guardada');
      } else if (t.dataset.entregado) {
        await actualizarPedido(t.dataset.entregado, { estado: 'entregado', entregado_at: new Date().toISOString() }, 'Marcado como entregado');
      }
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  };
  cont.onchange = async (e) => {
    const id = e.target.dataset.estado;
    if (!id) return;
    const estado = e.target.value;
    const cambios = { estado };
    const marca = { en_imprenta: 'imprenta_at', retirado: 'retirado_at', entregado: 'entregado_at' }[estado];
    if (marca) cambios[marca] = new Date().toISOString();
    await actualizarPedido(id, cambios, `Estado: ${ESTADO[estado]}`);
  };
}

function tabPedidos() {
  const c = $('#contenido');
  if (!$('#filtrosPedidos')) {
    c.innerHTML = `
      <div class="card fila" id="filtrosPedidos">
        <div><label for="fEstado">Estado</label>
          <select id="fEstado">
            <option value="activos">Activos (sin entregar)</option>
            <option value="">Todos</option>
            ${Object.entries(ESTADO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select></div>
        <div><label for="fPago">Pago</label>
          <select id="fPago"><option value="">Todos</option>
            ${Object.entries(ESTADO_PAGO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select></div>
        <div><label for="fQ">Buscar</label><input type="search" id="fQ" placeholder="Código, nombre, curso…" /></div>
      </div>
      <p class="chico" id="resumenPedidos"></p>
      <div id="listaPedidos"></div>`;
    $('#fEstado').value = filtros.estado;
    $('#fPago').value = filtros.pago;
    $('#fQ').value = filtros.q;
    $('#fEstado').onchange = () => { filtros.estado = $('#fEstado').value; tabPedidos(); };
    $('#fPago').onchange = () => { filtros.pago = $('#fPago').value; tabPedidos(); };
    $('#fQ').oninput = () => { filtros.q = $('#fQ').value.trim().toLowerCase(); tabPedidos(); };
    enlazarAccionesPedido($('#listaPedidos'));
  }
  const lista = pedidos.filter((p) =>
    (filtros.estado === 'activos' ? !['entregado', 'cancelado'].includes(p.estado) : !filtros.estado || p.estado === filtros.estado) &&
    (!filtros.pago || p.estado_pago === filtros.pago) &&
    (!filtros.q || `${p.codigo} ${p.nombre} ${p.curso || ''} ${p.telefono}`.toLowerCase().includes(filtros.q)));
  const cobrado = lista.filter((p) => p.estado_pago === 'pagado').reduce((s, p) => s + Number(p.total), 0);
  $('#resumenPedidos').textContent = `${lista.length} pedidos · cobrado ${pesos(cobrado)}`;
  $('#listaPedidos').innerHTML = lista.length ? lista.map((p) => tarjetaPedido(p)).join('') : '<p class="vacio">No hay pedidos con estos filtros.</p>';
}

// =============================== IMPRENTA ===============================

/** Agrupa ítems de varios pedidos: apuntes sumados por título; PDFs uno por uno. */
function consolidar(lista) {
  const apuntes = new Map();
  const archivos = [];
  for (const p of lista) {
    for (const it of p.items) {
      if (it.tipo === 'catalogo') {
        const k = `${it.titulo} (${etiquetaColor(it.color)})`;
        apuntes.set(k, (apuntes.get(k) || 0) + it.cantidad);
      } else {
        archivos.push({ ...it, codigo: p.codigo, nombre: p.nombre });
      }
    }
  }
  return { apuntes: [...apuntes.entries()].sort((a, b) => a[0].localeCompare(b[0])), archivos };
}

function textoImprenta(lista) {
  const { apuntes, archivos } = consolidar(lista);
  let t = `Pedido de impresiones — ${hoy()}\n`;
  if (apuntes.length) t += `\nAPUNTES:\n${apuntes.map(([k, n]) => `• ${k} × ${n}`).join('\n')}\n`;
  if (archivos.length) {
    t += `\nARCHIVOS:\n${archivos.map((a) =>
      `• ${a.codigo}_${a.nombre_archivo} — ${a.paginas} pág — ${etiquetaColor(a.color)} — ${a.doble_faz ? 'doble faz' : 'simple faz'}${a.anillado ? ' — ANILLADO' : ''} × ${a.cantidad}`).join('\n')}\n`;
  }
  return t;
}

function tabImprenta() {
  const listos = pedidos.filter((p) => p.estado === 'nuevo' && p.estado_pago === 'pagado');
  const enImprenta = pedidos.filter((p) => p.estado === 'en_imprenta');
  const c = $('#contenido');

  const bloqueConsolidado = (lista) => {
    const { apuntes, archivos } = consolidar(lista);
    return `${apuntes.length ? `<h3>Apuntes</h3><table class="tabla">${apuntes.map(([k, n]) => `<tr><td>${esc(k)}</td><td><b>× ${n}</b></td></tr>`).join('')}</table>` : ''}
      ${archivos.length ? `<h3 style="margin-top:14px">Archivos</h3><div class="tabla-wrap"><table class="tabla">${archivos.map((a) => `<tr>
        <td>${esc(a.codigo)}</td><td>${esc(a.nombre_archivo)}<br><span class="chico">${a.paginas} pág · ${etiquetaColor(a.color)} · ${a.doble_faz ? 'doble faz' : 'simple faz'}${a.anillado ? ' · anillado' : ''}</span></td>
        <td><b>× ${a.cantidad}</b></td>
        <td><button class="sec chico" data-descargar="${esc(a.archivo_path)}" data-nombre="${esc(a.codigo + '_' + a.nombre_archivo)}">Descargar</button></td></tr>`).join('')}</table></div>` : ''}`;
  };

  c.innerHTML = `
    <div class="card">
      <h2>Pagados, para mandar a imprimir (${listos.length})</h2>
      ${listos.length ? `
        <label class="check"><input type="checkbox" id="selTodos" checked /> Seleccionar todos</label>
        <div id="listaListos">${listos.map((p) => `<label class="check"><input type="checkbox" class="selPedido" value="${p.id}" checked />
          <span><b>${esc(p.codigo)}</b> · ${esc(p.nombre)}${p.curso ? ' · ' + esc(p.curso) : ''} — ${p.items.map((i) => `${i.cantidad}× ${esc(i.titulo || i.nombre_archivo)}`).join(', ')}</span></label>`).join('')}</div>
        <div class="acciones fila" style="margin-top:10px">
          <button id="btnCopiarNuevos" class="sec">Copiar lista para la imprenta</button>
          <button id="btnMandar">Marcar como enviados a la imprenta</button>
        </div>
        <details style="margin-top:12px"><summary>Ver detalle y descargar archivos</summary><div id="detalleListos" style="margin-top:10px">${bloqueConsolidado(listos)}</div></details>`
        : '<p class="vacio">No hay pedidos pagados pendientes de imprimir.</p>'}
    </div>
    <div class="card">
      <h2>En la imprenta (${enImprenta.length})</h2>
      <p class="chico">Esto es lo que tu papá ve en la pantalla de retiro.</p>
      ${enImprenta.length ? `${bloqueConsolidado(enImprenta)}
        <button id="btnCopiarImprenta" class="sec" style="margin-top:12px">Copiar lista</button>` : '<p class="vacio">Nada en la imprenta ahora.</p>'}
    </div>`;

  const seleccionados = () => $$('.selPedido:checked').map((x) => listos.find((p) => p.id === x.value));
  const copiar = async (lista) => {
    try { await navigator.clipboard.writeText(textoImprenta(lista)); toast('Lista copiada. Pegala en el WhatsApp de la imprenta.'); }
    catch { prompt('Copiá este texto:', textoImprenta(lista)); }
  };
  $('#selTodos')?.addEventListener('change', (e) => $$('.selPedido').forEach((x) => { x.checked = e.target.checked; }));
  $('#btnCopiarNuevos')?.addEventListener('click', () => copiar(seleccionados()));
  $('#btnCopiarImprenta')?.addEventListener('click', () => copiar(enImprenta));
  $('#btnMandar')?.addEventListener('click', async () => {
    const ids = seleccionados().map((p) => p.id);
    if (!ids.length) return toast('No seleccionaste ningún pedido', 'error');
    if (!confirm(`¿Marcar ${ids.length} pedido(s) como enviados a la imprenta?`)) return;
    const { error } = await sb.from('pedidos').update({ estado: 'en_imprenta', imprenta_at: new Date().toISOString() }).in('id', ids);
    if (error) return toast(error.message, 'error');
    toast('Listo. Ya aparecen en la pantalla de retiro.');
    recargar();
  });
  enlazarAccionesPedido(c);
}

// =============================== ENTREGAS ===============================

function tabEntregas() {
  const lista = pedidos.filter((p) => p.estado === 'retirado');
  const porCurso = new Map();
  for (const p of lista) {
    const k = p.curso || 'Sin curso';
    if (!porCurso.has(k)) porCurso.set(k, []);
    porCurso.get(k).push(p);
  }
  const cursos = [...porCurso.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const c = $('#contenido');
  c.innerHTML = lista.length ? cursos.map((k) => `<div class="card">
      <h2>${esc(k)} (${porCurso.get(k).length})</h2>
      ${porCurso.get(k).map((p) => `<div class="pedido">
        <div class="cab"><span><span class="codigo">${esc(p.codigo)}</span> · <b>${esc(p.nombre)}</b></span>
          ${p.estado_pago !== 'pagado' ? pillPago(p.estado_pago) : ''}</div>
        <ul>${p.items.map((it) => `<li><b>${it.cantidad}×</b> ${esc(describirItem(it))}</li>`).join('')}</ul>
        <div class="acciones">
          <button class="ok" data-entregado="${p.id}">Entregado ✓</button>
          <a class="boton sec" target="_blank" rel="noopener" href="${linkWhatsApp(p.telefono, `Hola ${p.nombre.split(' ')[0]}! Tu pedido ${p.codigo} de impresiones ya está listo, te lo llevo al colegio.`)}">Avisar por WhatsApp</a>
        </div></div>`).join('')}
    </div>`).join('') : '<div class="card"><p class="vacio">No hay pedidos retirados esperando entrega.</p></div>';
  enlazarAccionesPedido(c);
}

// =============================== PRECIOS ===============================

async function tabPrecios() {
  const c = $('#contenido');
  c.innerHTML = '<p class="vacio">Cargando…</p>';
  const { data: a, error } = await sb.from('ajustes').select('*').eq('id', 1).single();
  if (error) { c.innerHTML = '<p class="vacio">Error cargando ajustes.</p>'; return; }
  const campo = (id, label, tipo = 'number', extra = '') =>
    `<div><label for="a_${id}">${label}</label><input type="${tipo}" id="a_${id}" value="${esc(a[id] ?? '')}" ${extra} /></div>`;
  c.innerHTML = `<form id="formAjustes">
    <div class="card">
      <h2>Precios de impresión de PDFs</h2>
      <p class="chico">Precio por <b>carilla</b> (cada página del PDF).</p>
      <div class="grilla2">
        ${campo('precio_byn_doble', 'B/N doble faz', 'number', 'min="0" step="any"')}
        ${campo('precio_byn_simple', 'B/N simple faz', 'number', 'min="0" step="any"')}
        ${campo('precio_color_doble', 'Color doble faz', 'number', 'min="0" step="any"')}
        ${campo('precio_color_simple', 'Color simple faz', 'number', 'min="0" step="any"')}
        ${campo('precio_anillado', 'Anillado (por copia)', 'number', 'min="0" step="any"')}
      </div>
      <h3 style="margin-top:14px">Descuento por cantidad (solo PDFs)</h3>
      <div class="grilla2">
        ${campo('descuento_umbral', 'A partir de cuántas carillas (0 = sin descuento)', 'number', 'min="0" step="1"')}
        ${campo('descuento_pct', '% de descuento', 'number', 'min="0" max="100" step="any"')}
      </div>
    </div>
    <div class="card">
      <h2>Datos para transferencia</h2>
      <div class="grilla2">
        ${campo('alias', 'Alias', 'text')}
        ${campo('cvu', 'CVU / CBU', 'text')}
        ${campo('titular', 'Titular', 'text')}
        ${campo('whatsapp', 'Tu WhatsApp', 'text')}
      </div>
    </div>
    <div class="card">
      <h2>Tienda</h2>
      <label class="check"><input type="checkbox" id="a_pedidos_abiertos" ${a.pedidos_abiertos ? 'checked' : ''} /> Estoy tomando pedidos</label>
      <label for="a_aviso">Aviso arriba de la tienda (opcional)</label>
      <textarea id="a_aviso" placeholder="Ej: Los pedidos hechos hasta el jueves se entregan el lunes.">${esc(a.aviso || '')}</textarea>
    </div>
    <button type="submit" class="grande">Guardar cambios</button>
  </form>`;
  $('#formAjustes').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = (id) => Number($('#a_' + id).value) || 0;
    const s = (id) => $('#a_' + id).value.trim() || null;
    const cambios = {
      precio_byn_doble: n('precio_byn_doble'), precio_byn_simple: n('precio_byn_simple'),
      precio_color_doble: n('precio_color_doble'), precio_color_simple: n('precio_color_simple'),
      precio_anillado: n('precio_anillado'), descuento_umbral: Math.floor(n('descuento_umbral')), descuento_pct: n('descuento_pct'),
      alias: s('alias'), cvu: s('cvu'), titular: s('titular'), whatsapp: s('whatsapp'), aviso: s('aviso'),
      pedidos_abiertos: $('#a_pedidos_abiertos').checked,
    };
    const { error: err } = await sb.from('ajustes').update(cambios).eq('id', 1);
    toast(err ? 'Error: ' + err.message : 'Guardado', err ? 'error' : 'ok');
  });
}

// =============================== CATÁLOGO ===============================

async function tabCatalogo() {
  const c = $('#contenido');
  c.innerHTML = '<p class="vacio">Cargando…</p>';
  const { data, error } = await sb.from('catalogo').select('*').order('categoria').order('orden').order('titulo');
  if (error) { c.innerHTML = '<p class="vacio">Error cargando el catálogo.</p>'; return; }
  const fila = (it) => `<tr data-id="${it.id ?? ''}">
    <td><input type="text" data-c="titulo" value="${esc(it.titulo ?? '')}" placeholder="Título" style="min-width:170px" /></td>
    <td><input type="text" data-c="categoria" value="${esc(it.categoria ?? '')}" placeholder="Materia" style="min-width:100px" /></td>
    <td><select data-c="color"><option value="0" ${!it.color ? 'selected' : ''}>B/N</option><option value="1" ${it.color ? 'selected' : ''}>Color</option></select></td>
    <td><input type="number" data-c="paginas" value="${it.paginas ?? ''}" min="0" style="width:80px" /></td>
    <td><input type="number" data-c="precio" value="${it.precio ?? ''}" min="0" step="any" style="width:100px" /></td>
    <td><input type="checkbox" data-c="activo" ${it.activo !== false ? 'checked' : ''} aria-label="Visible" style="width:22px;height:22px" /></td>
    <td style="white-space:nowrap"><button class="chico" data-guardar>Guardar</button>
      ${it.id ? '<button class="peligro chico" data-borrar>Borrar</button>' : ''}</td></tr>`;
  c.innerHTML = `<div class="card">
    <h2>Catálogo de apuntes</h2>
    <p class="chico">Lo que se ve en la tienda con precio fijo. Destildá "Visible" para ocultar algo sin borrarlo.</p>
    <div class="tabla-wrap"><table class="tabla" id="tablaCat">
      <thead><tr><th>Título</th><th>Materia</th><th>Tipo</th><th>Págs</th><th>Precio</th><th>Visible</th><th></th></tr></thead>
      <tbody>${data.map(fila).join('')}${fila({})}</tbody>
    </table></div></div>`;

  $('#tablaCat').onclick = async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.dataset.borrar !== undefined) {
      if (!confirm('¿Borrar este apunte del catálogo? (Los pedidos viejos no se afectan)')) return;
      const { error: err } = await sb.from('catalogo').delete().eq('id', id);
      if (err) return toast(err.message, 'error');
      toast('Borrado');
      return tabCatalogo();
    }
    if (e.target.dataset.guardar === undefined) return;
    const v = (k) => tr.querySelector(`[data-c="${k}"]`);
    const datos = {
      titulo: v('titulo').value.trim(),
      categoria: v('categoria').value.trim() || null,
      color: v('color').value === '1',
      paginas: parseInt(v('paginas').value, 10) || null,
      precio: Number(v('precio').value),
      activo: v('activo').checked,
    };
    if (!datos.titulo || !(datos.precio > 0)) return toast('Completá título y precio', 'error');
    const { error: err } = id
      ? await sb.from('catalogo').update(datos).eq('id', id)
      : await sb.from('catalogo').insert(datos);
    if (err) return toast(err.message, 'error');
    toast('Guardado');
    if (!id) tabCatalogo();
  };
}

iniciar();
