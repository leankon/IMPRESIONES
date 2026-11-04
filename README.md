# Impresiones — Sistema de pedidos

Página web para tomar pedidos de impresiones y fotocopias, cobrarlos y organizar la impresión, el retiro y la entrega.

| Página | Para quién | Qué hace |
|---|---|---|
| `/` (tienda) | Clientes | Elegir apuntes del catálogo o subir un PDF (cuenta las páginas solo), ver el precio y pagar con **Mercado Pago** o **transferencia**. |
| `/pedido.html` | Clientes | Seguir el pedido con su código, subir el comprobante de transferencia o reintentar el pago. |
| `/admin.html` | Vos | Ver pedidos, confirmar pagos, mandar tandas a la imprenta (con la lista para copiar y pegar), entregas en el colegio por curso, **editar precios** y el **catálogo**. |
| `/retiro.html` | Tu papá | Con su propia contraseña ve qué tiene que retirar de la imprenta, tilda cada cosa y confirma "Retirado". Si falta algo, toca "Hay un problema" y lo anota. |

## Cómo funciona un pedido

```
Cliente pide y paga ──► Pagado ──► (vos) "Mandar a imprenta" ──► En la imprenta
   ──► (papá) tilda todo y "Retirado" ──► Listo para entregar ──► (vos) "Entregado" en el colegio
```

- Si paga con **Mercado Pago**, se marca como pagado solo.
- Si paga por **transferencia**, sube el comprobante y te aparece en *Pedidos* para confirmarlo con un botón.
- Los precios siempre los calcula el servidor con los valores que pusiste en *Precios y pagos*: nadie puede pagar menos tocando la página.
- El panel se actualiza solo cuando entra un pedido nuevo.

---

## Instalación (una sola vez, ~30 minutos, todo gratis)

Necesitás 3 cuentas: **Supabase** (base de datos), **Vercel** (donde vive la página) y tu cuenta de **Mercado Pago**.

### 1. Supabase (base de datos y contraseñas)

1. Entrá a <https://supabase.com>, creá una cuenta y un **New project** (región: São Paulo). Guardá la contraseña de la base que te pide.
2. Andá a **SQL Editor → New query**, pegá **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y tocá **Run**. Eso crea las tablas, la seguridad, la carpeta de archivos y carga los apuntes que ya tenías.
3. Creá los usuarios del panel en **Authentication → Users → Add user → Create new user** (tildá *Auto Confirm User*):
   - uno para vos (tu email + una contraseña)
   - uno para tu papá (su email + su contraseña)
4. Volvé a **SQL Editor** y corré esto, cambiando los emails, para darles permiso:

   ```sql
   insert into perfiles (user_id, nombre, rol)
   select id, 'Lean', 'admin' from auth.users where email = 'TU-EMAIL@gmail.com';

   insert into perfiles (user_id, nombre, rol)
   select id, 'Papá', 'papa' from auth.users where email = 'EMAIL-DE-TU-PAPA@gmail.com';
   ```

5. En **Project Settings → API** copiá:
   - **Project URL**
   - **anon public** key
   - **service_role** key (esta es **secreta**, no la pegues en ningún archivo del repo)

6. Abrí [`js/config.js`](js/config.js) y pegá la *Project URL* y la *anon key* (estas dos son públicas, está bien que estén ahí). Guardá y subí el cambio a GitHub.

### 2. Mercado Pago

1. Entrá a <https://www.mercadopago.com.ar/developers/panel/app> y creá una aplicación (tipo: *Pagos online*, *Checkout Pro*).
2. En **Credenciales de producción** copiá el **Access Token** (empieza con `APP_USR-`). Es secreto.
   - Para probar sin cobrar de verdad podés usar primero el Access Token de **prueba**.

### 3. Vercel (publicar la página)

1. Entrá a <https://vercel.com> con tu cuenta de GitHub → **Add New → Project** → elegí este repositorio → **Deploy**.
2. En el proyecto: **Settings → Environment Variables**, agregá:

   | Nombre | Valor |
   |---|---|
   | `SUPABASE_URL` | la Project URL de Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | la service_role key de Supabase |
   | `MP_ACCESS_TOKEN` | el Access Token de Mercado Pago |
   | `SITE_URL` | la dirección de tu página, ej `https://impresiones-lean.vercel.app` |

3. **Deployments → ⋯ → Redeploy** para que tome las variables.

¡Listo! Pasale a tus clientes la dirección de la página, y a tu papá `https://TU-PAGINA.vercel.app/retiro.html` (que la guarde en la pantalla de inicio del celu).

### 4. Primeros ajustes

Entrá a `/admin.html` → **Precios y pagos** y cargá:
- precio por carilla (B/N y color, simple y doble faz) y el anillado
- descuento por cantidad (opcional)
- alias / CVU / titular para transferencias
- un aviso opcional (ej: *"Lo pedido hasta el jueves se entrega el lunes"*)

Si querés dejar de tomar pedidos un tiempo, destildá **Estoy tomando pedidos**.

En **Catálogo** podés agregar, cambiar precios u ocultar apuntes.

---

## Preguntas frecuentes

**¿Si no configuro Mercado Pago anda igual?** Sí: si no está `MP_ACCESS_TOKEN`, la tienda solo ofrece transferencia.

**¿Cuánto espacio tengo para PDFs?** El plan gratis de Supabase da 1 GB. Cada tanto podés borrar los PDFs viejos desde **Storage → archivos → pdfs** en Supabase.

**Supabase me pausó el proyecto.** En el plan gratis se pausa si pasa una semana sin uso. Entrás a Supabase y tocás *Restore*. Durante la temporada de pedidos no pasa.

**¿Cómo le cambio la contraseña a mi papá?** Supabase → Authentication → Users → su usuario → *Send password recovery* o borrarlo y crearlo de nuevo (y volver a correr el `insert into perfiles`).

## Estructura

```
index.html, pedido.html, admin.html, retiro.html   páginas
css/style.css                                      estilos
js/config.js                                       ← tus datos de Supabase
js/precios.js                                      cálculo de precios (lo usan la página y el servidor)
js/tienda.js, pedido.js, admin.js, retiro.js       lógica de cada página
api/                                               servidor (Vercel): crear pedido, Mercado Pago, comprobantes
supabase/schema.sql                                base de datos
```
