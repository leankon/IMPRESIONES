// Login con email + contraseña (usuarios creados en Supabase > Authentication).
import { sb, $, esc, toast } from './comun.js';

const formLogin = (titulo) => `<div class="card login">
  <h2>${esc(titulo)}</h2>
  <form id="formLogin">
    <label for="email">Email</label>
    <input type="email" id="email" autocomplete="username" required />
    <label for="clave">Contraseña</label>
    <input type="password" id="clave" autocomplete="current-password" required />
    <button type="submit" class="grande" style="margin-top:14px">Entrar</button>
  </form></div>`;

/** Devuelve el perfil { rol, nombre } cuando hay sesión válida. Si no, muestra el login y espera. */
export async function requerirSesion(contenedor, titulo) {
  for (;;) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const { data: perfil } = await sb.from('perfiles').select('rol, nombre').eq('user_id', session.user.id).maybeSingle();
      if (perfil) return { ...perfil, email: session.user.email };
      await sb.auth.signOut();
      toast('Este usuario no tiene permiso. Pedile al admin que lo habilite.', 'error');
    }
    contenedor.innerHTML = formLogin(titulo);
    await new Promise((resolve) => {
      $('#formLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#clave').value });
        if (error) toast('Email o contraseña incorrectos.', 'error');
        else resolve();
      });
    });
  }
}

export async function salir() {
  await sb.auth.signOut();
  location.reload();
}

export async function urlArchivo(path, nombreDescarga) {
  const { data, error } = await sb.storage.from('archivos')
    .createSignedUrl(path, 60 * 60, nombreDescarga ? { download: nombreDescarga } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
