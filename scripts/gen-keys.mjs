// Genera el par de claves VAPID que identifica a tu servidor de avisos.
// Se ejecuta UNA sola vez.
import webpush from "web-push";
import { writeFileSync, existsSync } from "node:fs";

const PRIV = new URL("../.vapid.json", import.meta.url);          // secreta, NO se sube
const PUB  = new URL("../docs/deportes/data/vapid-public.json", import.meta.url); // pública, sí se sube

if (existsSync(PRIV) && !process.argv.includes("--force")) {
  console.log("\n⚠  Ya existen claves en .vapid.json");
  console.log("   Si las regenerás, vas a tener que volver a activar los avisos en el celular.");
  console.log("   Para hacerlo igual:  node scripts/gen-keys.mjs --force\n");
  process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

writeFileSync(PRIV, JSON.stringify({ publicKey, privateKey }, null, 2));
writeFileSync(PUB,  JSON.stringify({ publicKey }, null, 2));

console.log(`
✓ Claves creadas

  .vapid.json                    ← PRIVADA. No la subas a GitHub (ya está en .gitignore).
  docs/deportes/data/vapid-public.json    ← pública, se publica con la app.

Para que GitHub pueda mandarte los avisos, creá estos secretos en tu repo
(Settings → Secrets and variables → Actions → New repository secret):

  VAPID_PUBLIC     ${publicKey}

  VAPID_PRIVATE    ${privateKey}

Y más adelante, un tercero con la suscripción que copia la app:

  PUSH_SUBSCRIPTION
`);
