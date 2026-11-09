import { readFileSync } from 'fs';
import { ServerOptions } from 'https';
import { SecureVersion } from 'tls';

// Transporte (contrato §7.1): solo TLS 1.2 o superior al servir la API.
export const TLS_MINIMO: SecureVersion = 'TLSv1.2';

type Entorno = Record<string, string | undefined>;

export function opcionesHttps(env: Entorno = process.env): ServerOptions | undefined {
  const cert = env.TLS_CERT_FILE?.trim();
  const key = env.TLS_KEY_FILE?.trim();
  if (!cert && !key) return undefined;
  if (!cert || !key) throw new Error('TLS_CERT_FILE y TLS_KEY_FILE deben definirse juntas.');
  return { cert: readFileSync(cert), key: readFileSync(key), minVersion: TLS_MINIMO };
}
