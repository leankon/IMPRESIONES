// GET /api/info → qué medios de pago están habilitados en el servidor.
import { enviar, mpConfigurado } from './_lib.js';

export default function handler(req, res) {
  return enviar(res, 200, { mercadopago: mpConfigurado() });
}
