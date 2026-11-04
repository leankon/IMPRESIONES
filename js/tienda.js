import { sb, configurado, NOMBRE_NEGOCIO, $, esc, pesos, toast, avisoSinConfigurar, idAleatorio, nombreSeguro, api, describirItem, etiquetaColor } from './comun.js';
import { precioUnitarioPdf, calcularTotales, hojas } from './precios.js';

const CLAVE_CARRITO = 'impresiones.carrito';
const CLAVE_DATOS = 'impresiones.datos';
const CLAVE_MIS = 'impresiones.mispedidos';

let ajustes = null;
let catalogo = [];
let carrito = [];
let pdfActual = null; // { file, paginas }

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nada */ } };

$('#marca').textContent = NOMBRE_NEGOCIO;

async function iniciar() {
  if (!configurado) return avisoSinConfigurar($('#app'));

  const [aj, cat, info] = await Promise.all([
    sb.from('ajustes').select('*').eq('id', 1).single(),
    sb.from('catalogo').select('*').eq('activo', true).order('categoria').order('orden').order('titulo'),
    api('/api/info').catch(() => ({ mercadopago: true })),
  ]);
  if (aj.error || cat.error) {
    $('#catalogo').innerHTML = '<p class="vacio">No se pudo cargar. Recargá la página.</p>';
    return;
  }
  ajustes = aj.data;
  catalogo = cat.data;

  if (!info.mercadopago) {
    $('#metodoMP').classList.add('oculto');
    $('input[name=pago][value=transferencia]').checked = true;
  }
  if (ajustes.aviso) {
    $('#avisoGeneral').textContent = ajustes.aviso;
    $('#avisoGeneral').classList.remove('oculto');
  }
  if (!ajustes.pedidos_abiertos) {
    $('#cerrado').classList.remove('oculto');
    $('#tienda').classList.add('oculto');
    $('#barraTotal').classList.add('oculto');
    return;
  }

  $('#tarifas').textContent =
    `Precio por carilla — B/N: ${pesos(ajustes.precio_byn_doble)} doble faz / ${pesos(ajustes.precio_byn_simple)} simple faz · ` +
    `Color: ${pesos(ajustes.precio_color_doble)} doble faz / ${pesos(ajustes.precio_color_simple)} simple faz · ` +
    `Anillado: ${pesos(ajustes.precio_anillado)}` +
    (ajustes.descuento_umbral > 0 && ajustes.descuento_pct > 0
      ? ` · ${ajustes.descuento_pct}% de descuento en PDFs desde ${ajustes.descuento_umbral} carillas` : '');

  // Restaurar carrito guardado, actualizando precios y sacando lo que ya no existe
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  carrito = leer(CLAVE_CARRITO, []).filter((it) => it.tipo === 'pdf' || porId.has(it.catalogo_id));
  carrito.forEach((it) => {
    if (it.tipo === 'catalogo') it.precio_unit = Number(porId.get(it.catalogo_id).precio);
    else it.precio_unit = precioUnitarioPdf(it, ajustes);
  });

  const datos = leer(CLAVE_DATOS, {});
  for (const k of ['nombre', 'curso', 'telefono']) if (datos[k]) $('#' + k).value = datos[k];

  pintarCatalogo();
  pintarCarrito();
}

// ------------------------------ Catálogo ------------------------------

function pintarCatalogo() {
  const q = $('#buscar').value.trim().toLowerCase();
  const lista = catalogo.filter((c) => !q || `${c.titulo} ${c.categoria || ''} ${c.descripcion || ''}`.toLowerCase().includes(q));
  if (!lista.length) {
    $('#catalogo').innerHTML = `<p class="vacio">${catalogo.length ? 'No hay resultados.' : 'Todavía no hay apuntes cargados.'}</p>`;
    return;
  }
  let html = '';
  let cat = null;
  for (const c of lista) {
    if ((c.categoria || '') !== cat) {
      cat = c.categoria || '';
      if (cat) html += `<div class="categoria-titulo">${esc(cat)}</div>`;
    }
    html += `<div class="producto">
      <span class="titulo">${esc(c.titulo)}</span>
      <span><span class="pill ${c.color ? 'alerta' : ''}">${etiquetaColor(c.color)}</span>
        ${c.paginas ? `<span class="chico">${c.paginas} pág</span>` : ''}</span>
      ${c.descripcion ? `<span class="chico">${esc(c.descripcion)}</span>` : ''}
      <span class="precio">${pesos(c.precio)}</span>
      <div class="acciones">
        <input type="number" min="1" max="200" value="1" aria-label="Cantidad" data-cant="${c.id}" />
        <button class="sec" data-agregar="${c.id}">Agregar</button>
      </div>
    </div>`;
  }
  $('#catalogo').innerHTML = html;
}

$('#buscar').addEventListener('input', pintarCatalogo);

$('#catalogo').addEventListener('click', (e) => {
  const id = Number(e.target.dataset.agregar);
  if (!id) return;
  const c = catalogo.find((x) => x.id === id);
  const cantidad = Math.max(1, Math.min(200, parseInt($(`[data-cant="${id}"]`).value, 10) || 1));
  const existente = carrito.find((it) => it.tipo === 'catalogo' && it.catalogo_id === id);
  if (existente) existente.cantidad = Math.min(200, existente.cantidad + cantidad);
  else carrito.push({ tipo: 'catalogo', catalogo_id: id, titulo: c.titulo, color: c.color, precio_unit: Number(c.precio), cantidad });
  pintarCarrito();
  toast(`Agregado: ${c.titulo}`);
});

// ------------------------------ PDF propio ------------------------------

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function opcionesPdf() {
  return {
    paginas: pdfActual?.paginas || 0,
    color: $('#pdfColor').value === 'color',
    doble_faz: $('#pdfFaz').value === 'doble',
    anillado: $('#pdfAnillado').checked,
    cantidad: Math.max(1, Math.min(200, parseInt($('#pdfCantidad').value, 10) || 1)),
  };
}

function actualizarPrecioPdf() {
  if (!pdfActual || !ajustes) return;
  const o = opcionesPdf();
  $('#pdfPrecio').textContent = pesos(precioUnitarioPdf(o, ajustes));
  $('#pdfInfo').textContent = `${pdfActual.file.name} — ${o.paginas} páginas (${hojas(o.paginas, o.doble_faz)} hojas)`;
}

['#pdfColor', '#pdfFaz', '#pdfAnillado', '#pdfCantidad'].forEach((s) => $(s).addEventListener('input', actualizarPrecioPdf));

$('#pdfInput').addEventListener('change', async () => {
  const file = $('#pdfInput').files[0];
  pdfActual = null;
  $('#pdfOpciones').classList.add('oculto');
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('El archivo pesa más de 50 MB.', 'error'); return; }
  try {
    const pdf = await pdfjsLib.getDocument(new Uint8Array(await file.arrayBuffer())).promise;
    pdfActual = { file, paginas: pdf.numPages };
    $('#pdfOpciones').classList.remove('oculto');
    actualizarPrecioPdf();
  } catch (e) {
    console.error(e);
    toast('No se pudo leer el PDF. ¿Está dañado o tiene contraseña?', 'error');
  }
});

$('#pdfAgregar').addEventListener('click', async () => {
  if (!pdfActual) return;
  const btn = $('#pdfAgregar');
  btn.disabled = true;
  btn.textContent = 'Subiendo archivo…';
  try {
    const path = `pdfs/${idAleatorio()}-${nombreSeguro(pdfActual.file.name)}`;
    const { error } = await sb.storage.from('archivos').upload(path, pdfActual.file, { contentType: 'application/pdf' });
    if (error) throw error;
    const o = opcionesPdf();
    const item = { tipo: 'pdf', archivo_path: path, nombre_archivo: pdfActual.file.name, ...o };
    item.precio_unit = precioUnitarioPdf(item, ajustes);
    carrito.push(item);
    pintarCarrito();
    toast('PDF agregado al pedido');
    $('#pdfInput').value = '';
    $('#pdfOpciones').classList.add('oculto');
    $('#pdfCantidad').value = 1;
    $('#pdfAnillado').checked = false;
    pdfActual = null;
  } catch (e) {
    console.error(e);
    toast('No se pudo subir el archivo. Probá de nuevo.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Agregar al pedido';
  }
});

// ------------------------------ Carrito ------------------------------

function pintarCarrito() {
  guardar(CLAVE_CARRITO, carrito);
  const ul = $('#carrito');
  if (!carrito.length) {
    ul.innerHTML = '<li class="vacio" style="justify-content:center">Todavía no agregaste nada.</li>';
    $('#totales').innerHTML = '';
    $('#barraMonto').textContent = '$0';
    return;
  }
  ul.innerHTML = carrito.map((it, i) => `<li>
      <span class="desc">${esc(describirItem(it))}<br>
        <span class="chico">${it.cantidad} × ${pesos(it.precio_unit)}</span></span>
      <span style="display:flex;gap:6px;align-items:center">
        <input type="number" min="1" max="200" value="${it.cantidad}" data-idx="${i}" style="width:64px" aria-label="Cantidad" />
        <b>${pesos(it.precio_unit * it.cantidad)}</b>
        <button class="peligro chico" data-quitar="${i}" aria-label="Quitar">✕</button>
      </span></li>`).join('');
  const t = calcularTotales(carrito, ajustes);
  $('#totales').innerHTML = `
    ${t.descuento ? `<div>Subtotal: ${pesos(t.subtotal)}</div><div style="color:var(--ok)">Descuento: −${pesos(t.descuento)}</div>` : ''}
    <div class="total">Total: ${pesos(t.total)}</div>`;
  $('#barraMonto').textContent = pesos(t.total);
}

$('#carrito').addEventListener('click', (e) => {
  const i = e.target.dataset.quitar;
  if (i === undefined) return;
  carrito.splice(Number(i), 1);
  pintarCarrito();
});
$('#carrito').addEventListener('change', (e) => {
  const i = e.target.dataset.idx;
  if (i === undefined) return;
  carrito[i].cantidad = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1));
  pintarCarrito();
});

// ------------------------------ Confirmar ------------------------------

$('#formPedido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    nombre: $('#nombre').value.trim(),
    curso: $('#curso').value.trim(),
    telefono: $('#telefono').value.trim(),
    notas: $('#notas').value.trim(),
    metodo_pago: $('input[name=pago]:checked').value,
  };
  if (!carrito.length) return toast('Agregá algo al pedido primero.', 'error');
  if (!datos.nombre || !datos.telefono) return toast('Completá nombre y WhatsApp.', 'error');
  guardar(CLAVE_DATOS, { nombre: datos.nombre, curso: datos.curso, telefono: datos.telefono });

  const btn = $('#btnConfirmar');
  btn.disabled = true;
  btn.textContent = 'Enviando pedido…';
  try {
    const r = await api('/api/crear-pedido', { method: 'POST', body: JSON.stringify({ ...datos, items: carrito }) });
    guardar(CLAVE_MIS, [r.codigo, ...leer(CLAVE_MIS, []).filter((c) => c !== r.codigo)].slice(0, 10));
    carrito = [];
    guardar(CLAVE_CARRITO, carrito);
    if (r.pago_url) location.href = r.pago_url;
    else location.href = `pedido.html?codigo=${encodeURIComponent(r.codigo)}&nuevo=1`;
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Confirmar pedido';
  }
});

iniciar();
