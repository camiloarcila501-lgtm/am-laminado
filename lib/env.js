// Carga .env local si existe (en Render las variables se definen en el panel).
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
