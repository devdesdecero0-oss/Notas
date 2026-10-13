// Servidor de notas en Cloudflare Workers + D1.
// Todo queda cerrado por defecto: solo se abren a propósito el login y los archivos de diseño.

const DIAS_SESION = 30;
const enc = new TextEncoder();

// ---------- Utilidades de sesión (cookie firmada) ----------
async function firmar(texto, secreto) {
  const clave = await crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, enc.encode(texto));
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function igualesSeguro(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hayLogin(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)sesion=([^;]+)/);
  if (!m) return false;
  const [vence, firma] = m[1].split('.');
  if (!vence || !firma || Number(vence) < Date.now()) return false;
  return igualesSeguro(firma, await firmar(vence, env.NOTAS_SECRETO));
}

async function cookieNueva(env) {
  const vence = String(Date.now() + DIAS_SESION * 86400000);
  const valor = vence + '.' + (await firmar(vence, env.NOTAS_SECRETO));
  return `sesion=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DIAS_SESION * 86400}`;
}

const json = (datos, status = 200, headers = {}) =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const ahora = () => new Date().toISOString().slice(0, 19);

// ---------- Rutas de notas ----------
async function verNota(env, id) {
  return env.notas_db.prepare('SELECT * FROM notas WHERE id = ?').bind(id).first();
}

async function manejarApi(request, env, url) {
  const { pathname } = url;
  const metodo = request.method;
  const db = env.notas_db;

  if (pathname === '/notas' && metodo === 'GET') {
    const { results } = await db.prepare('SELECT * FROM notas ORDER BY modificada DESC').all();
    return json(results);
  }

  if (pathname === '/notas' && metodo === 'POST') {
    const { titulo, contenido = '' } = await request.json();
    if (typeof titulo !== 'string') return json({ detail: 'Falta el título' }, 422);
    const fecha = ahora();
    const r = await db
      .prepare(
        'INSERT INTO notas (titulo, contenido, creada, modificada, orden) ' +
        'VALUES (?, ?, ?, ?, (SELECT COALESCE(MIN(orden), 0) - 1 FROM notas))'
      )
      .bind(titulo, contenido, fecha, fecha)
      .run();
    return json(await verNota(env, r.meta.last_row_id));
  }

  if (pathname === '/api/orden' && metodo === 'PUT') {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.some(i => !Number.isInteger(i))) {
      return json({ detail: 'ids inválidos' }, 422);
    }
    if (ids.length) {
      await db.batch(
        ids.map((id, posicion) =>
          db.prepare('UPDATE notas SET orden = ? WHERE id = ?').bind(posicion, id)
        )
      );
    }
    return json({ mensaje: 'ok' });
  }

  const m = pathname.match(/^\/notas\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);

    if (metodo === 'GET') {
      const nota = await verNota(env, id);
      return nota ? json(nota) : json({ detail: 'Nota no encontrada' }, 404);
    }

    if (metodo === 'PUT') {
      const { titulo, contenido = '' } = await request.json();
      if (typeof titulo !== 'string') return json({ detail: 'Falta el título' }, 422);
      const r = await db
        .prepare('UPDATE notas SET titulo = ?, contenido = ?, modificada = ? WHERE id = ?')
        .bind(titulo, contenido, ahora(), id)
        .run();
      if (r.meta.changes === 0) return json({ detail: 'Nota no encontrada' }, 404);
      return json(await verNota(env, id));
    }

    if (metodo === 'DELETE') {
      const r = await db.prepare('DELETE FROM notas WHERE id = ?').bind(id).run();
      if (r.meta.changes === 0) return json({ detail: 'Nota no encontrada' }, 404);
      return json({ mensaje: 'Nota borrada' });
    }
  }

  return json({ detail: 'No encontrado' }, 404);
}

// ---------- Portero ----------
export default {
  async fetch(request, env) {
    if (!env.NOTAS_CLAVE || !env.NOTAS_SECRETO) {
      return json({ detail: 'Faltan NOTAS_CLAVE y NOTAS_SECRETO en el servidor' }, 500);
    }

    const url = new URL(request.url);
    const { pathname } = url;

    // Login (abierto a propósito)
    if (pathname === '/api/login' && request.method === 'POST') {
      let clave = '';
      try { ({ clave } = await request.json()); } catch (e) {}
      if (typeof clave !== 'string' || !igualesSeguro(clave, env.NOTAS_CLAVE)) {
        return json({ detail: 'Clave incorrecta' }, 401);
      }
      return json({ mensaje: 'ok' }, 200, { 'Set-Cookie': await cookieNueva(env) });
    }

    if (pathname === '/api/logout' && request.method === 'POST') {
      return json({ mensaje: 'ok' }, 200, {
        'Set-Cookie': 'sesion=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
      });
    }

    // Archivos abiertos: pantalla de login, diseño, íconos, manifest y service worker
    const libre =
      pathname === '/login' ||
      pathname === '/sw.js' ||
      pathname === '/manifest.json' ||
      pathname.startsWith('/static/');
    if (libre) return env.ASSETS.fetch(request);

    // Todo lo demás exige sesión
    if (!(await hayLogin(request, env))) {
      if (pathname === '/') return Response.redirect(new URL('/login', url).toString(), 302);
      return json({ detail: 'No autorizado' }, 401);
    }

    if (pathname === '/') return env.ASSETS.fetch(request);
    return manejarApi(request, env, url);
  },
};
