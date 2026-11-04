// Pantalla para quien retira en la imprenta: ve qué tiene que buscar,
// tilda cada cosa y confirma. Pensada para usar desde el celular.
import { sb, configurado, NOMBRE_NEGOCIO, $, $$, esc, toast, avisoSinConfigurar, describirItem, etiquetaColor, fecha } from './comun.js';
import { requerirSesion, salir } from './sesion.js';

$('#marca').textContent = `${NOMBRE_NEGOCIO} · Retiro`;
const app = $('#app');
let perfil;
let enImprenta = [];
let retirados = [];

async function iniciar() {
  if (!configurado) return avisoSinConfigurar(app);
  perfil = await requerirSesion(app, 'Entrar para retirar');
  $('#navRetiro').classList.remove('oculto');
  if (perfil.rol === 'admin') $('#linkPanel').classList.remove('oculto');
  $('#salir').addEventListener('click', (e) => { e.preventDefault(); salir(); });
  sb.channel('retiro').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => recargar()).subscribe();
  await recargar();
}

async function recargar() {
  const desde = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const [a, b] = await Promise.all([
    sb.from('pedidos').select('*').eq('estado', 'en_imprenta').order('created_at'),
    sb.from('pedidos').select('*').eq('estado', 'retirado').gte('retirado_at', desde).order('retirado_at', { ascending: false }),
  ]);
  if (a.error || b.error) { toast('No se pudo cargar. Revisá la conexión.', 'error'); return; }
  // Conservar lo que ya estaba tildado
  const tildados = new Set($$('.itemRetiro:checked').map((x) => x.id));
  enImprenta = a.data;
  retirados = b.data;
  pintar(tildados);
}

function resumen() {
  const m = new Map();
  for (const p of enImprenta) {
    for (const it of p.items) {
      const k = it.tipo === 'catalogo'
        ? `${it.titulo} (${etiquetaColor(it.color)})`
        : `Archivo de ${p.nombre.split(' ')[0]} (${p.codigo}) — ${it.paginas} pág ${etiquetaColor(it.color)}${it.anillado ? ', anillado' : ''}`;
      m.set(k, (m.get(k) || 0) + it.cantidad);
    }
  }
  return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
}

function pintar(tildados = new Set()) {
  const r = resumen();
  app.innerHTML = `
    <h1>Hola${perfil.nombre ? ' ' + esc(perfil.nombre) : ''} 👋</h1>
    <div class="card">
      <h2>Tenés que retirar</h2>
      ${r.length ? `<ul class="resumen-retiro">${r.map(([k, n]) => `<li><b>${n} ×</b> ${esc(k)}</li>`).join('')}</ul>`
        : '<p class="vacio">No hay nada para retirar por ahora. ✔</p>'}
    </div>
    ${enImprenta.map((p) => {
      const listo = p.items.every((_, i) => tildados.has(`${p.id}-${i}`));
      return `<div class="card" data-pedido="${p.id}">
        <div class="cab fila" style="justify-content:space-between">
          <h2 style="margin:0">${esc(p.codigo)} · ${esc(p.nombre)}</h2>
          ${p.curso ? `<span class="pill" style="flex:0 0 auto">${esc(p.curso)}</span>` : ''}
        </div>
        ${p.nota_interna ? `<p class="aviso" style="margin-top:8px">⚠ ${esc(p.nota_interna)}</p>` : ''}
        ${p.items.map((it, i) => `<label class="retiro-item">
          <input type="checkbox" class="itemRetiro" id="${p.id}-${i}" ${tildados.has(`${p.id}-${i}`) ? 'checked' : ''} />
          <span class="cant">${it.cantidad}×</span>
          <span>${esc(describirItem(it))}</span></label>`).join('')}
        <div style="display:grid;gap:8px;margin-top:12px">
          <button class="ok grande" data-retirar="${p.id}" ${listo ? '' : 'disabled'}>✔ Está todo bien — Retirado</button>
          <button class="peligro" data-problema="${p.id}">Hay un problema</button>
        </div>
      </div>`;
    }).join('')}
    ${retirados.length ? `<div class="card">
      <h2>Retirados (últimos 3 días)</h2>
      ${retirados.map((p) => `<div class="fila" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--borde)">
        <span><b>${esc(p.codigo)}</b> · ${esc(p.nombre)} <span class="chico">${fecha(p.retirado_at)}</span></span>
        <button class="sec chico" style="flex:0 0 auto" data-deshacer="${p.id}">Deshacer</button></div>`).join('')}
    </div>` : ''}`;
}

app.addEventListener('change', (e) => {
  if (!e.target.classList.contains('itemRetiro')) return;
  const card = e.target.closest('[data-pedido]');
  const todos = $$('.itemRetiro', card).every((x) => x.checked);
  $('[data-retirar]', card).disabled = !todos;
});

app.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.retirar) {
    b.disabled = true;
    const { error } = await sb.from('pedidos').update({
      estado: 'retirado',
      retirado_at: new Date().toISOString(),
      verificacion: { por: perfil.nombre || perfil.email, at: new Date().toISOString(), ok: true },
    }).eq('id', b.dataset.retirar);
    if (error) { toast('No se pudo guardar: ' + error.message, 'error'); b.disabled = false; return; }
    toast('¡Retirado!');
    recargar();
  } else if (b.dataset.problema) {
    const p = enImprenta.find((x) => x.id === b.dataset.problema);
    const txt = prompt('¿Qué pasó? (ej: faltan 2 copias, salió en B/N en vez de color)');
    if (!txt) return;
    const nota = `${p.nota_interna ? p.nota_interna + ' | ' : ''}${new Date().toLocaleDateString('es-AR')}: ${txt.trim()}`;
    const { error } = await sb.from('pedidos').update({ nota_interna: nota }).eq('id', p.id);
    toast(error ? 'No se pudo guardar' : 'Problema anotado. Queda pendiente.', error ? 'error' : 'ok');
    recargar();
  } else if (b.dataset.deshacer) {
    const { error } = await sb.from('pedidos').update({ estado: 'en_imprenta', retirado_at: null, verificacion: null }).eq('id', b.dataset.deshacer);
    toast(error ? 'No se pudo deshacer' : 'Vuelve a la lista de retiro', error ? 'error' : 'ok');
    recargar();
  }
});

iniciar();
