// ======================================================
//  NoteX — app.js
//  Dos pantallas: Lista (pantallaLista) y Editor (pantallaEditor)
// ======================================================

// ── Elementos del DOM ──────────────────────────────────
const pantallaLista  = document.getElementById('pantallaLista');
const pantallaEditor = document.getElementById('pantallaEditor');
const gridNotas      = document.getElementById('gridNotas');
const estadoVacio    = document.getElementById('estadoVacio');
const contadorNotas  = document.getElementById('contadorNotas');
const inputBuscar    = document.getElementById('inputBuscar');
const selOrden       = document.getElementById('selOrden');
const btnNueva       = document.getElementById('btnNueva');
const btnCrearPrimera= document.getElementById('btnCrearPrimera');
const btnTema        = document.getElementById('btnTema');
const btnVolver      = document.getElementById('btnVolver');
const btnBorrar      = document.getElementById('btnBorrar');
const inputTitulo    = document.getElementById('titulo');
const editor         = document.getElementById('contenido');
const estadoGuardado = document.getElementById('estadoGuardado');
const herramientas   = document.getElementById('herramientas');
const selFuente      = document.getElementById('selFuente');
const selTamano      = document.getElementById('selTamano');
const selColor       = document.getElementById('selColor');

let notas   = [];
let actualId = null;

// ══════════════════════════════════════════════════════
//  NAVEGACIÓN ENTRE PANTALLAS
// ══════════════════════════════════════════════════════
function irAEditor() {
  pantallaLista.classList.add('fuera-izq');
  pantallaLista.classList.remove('activa');
  pantallaEditor.classList.add('activa');
}

function irALista() {
  pantallaEditor.classList.remove('activa');
  pantallaLista.classList.remove('fuera-izq');
  pantallaLista.classList.add('activa');
}

// ══════════════════════════════════════════════════════
//  TEMA (claro / oscuro)
// ══════════════════════════════════════════════════════
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  btnTema.textContent = tema === 'oscuro' ? '☀️' : '🌙';
  try { localStorage.setItem('tema', tema); } catch (e) {}
}

let temaGuardado = null;
try { temaGuardado = localStorage.getItem('tema'); } catch (e) {}
aplicarTema(temaGuardado || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'));

btnTema.addEventListener('click', () => {
  aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro');
});

// ══════════════════════════════════════════════════════
//  COMUNICACIÓN CON EL BACKEND
// ══════════════════════════════════════════════════════
async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error('Error ' + r.status);
  return r.json();
}

async function cargar() {
  notas = await pedir('/notas');
  dibujarLista();
}

// ══════════════════════════════════════════════════════
//  UTILIDADES DE CONTENIDO
// ══════════════════════════════════════════════════════
function textoPlano(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}

function limpiarHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase(), v = attr.value.trim().toLowerCase();
      if (n.startsWith('on') || v.startsWith('javascript:')) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

function aHtml(contenido) {
  if (/<[a-z][\s\S]*>/i.test(contenido)) return limpiarHtml(contenido);
  const caja = document.createElement('div');
  caja.textContent = contenido;
  return caja.innerHTML.replace(/\n/g, '<br>');
}

function editorVacio() {
  return editor.textContent.trim() === '' && !editor.querySelector('ul, ol');
}
function normalizarVacio() { if (editorVacio()) editor.innerHTML = ''; }
function contenidoActual() { return editorVacio() ? '' : editor.innerHTML; }

function formatearFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

// ══════════════════════════════════════════════════════
//  ORDEN Y BÚSQUEDA
// ══════════════════════════════════════════════════════
const MODOS_ORDEN = ['recientes', 'az', 'za', 'manual'];
let modoOrden = 'recientes';
try { modoOrden = localStorage.getItem('orden') || 'recientes'; } catch (e) {}
if (!MODOS_ORDEN.includes(modoOrden)) modoOrden = 'recientes';
selOrden.value = modoOrden;

const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

function ordenar(lista) {
  const copia = [...lista];
  if (modoOrden === 'az')     copia.sort((a, b) => comparar(a.titulo, b.titulo));
  else if (modoOrden === 'za') copia.sort((a, b) => comparar(b.titulo, a.titulo));
  else if (modoOrden === 'manual') copia.sort((a, b) => a.orden - b.orden);
  else copia.sort((a, b) => b.modificada.localeCompare(a.modificada));
  return copia;
}

let colaOrden = Promise.resolve();

function mover(id, dir) {
  const ordenadas = ordenar(notas);
  const i = ordenadas.findIndex(n => n.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= ordenadas.length) return;
  [ordenadas[i], ordenadas[j]] = [ordenadas[j], ordenadas[i]];
  ordenadas.forEach((n, pos) => { n.orden = pos; });
  dibujarLista();
  const cuerpo = JSON.stringify({ ids: ordenadas.map(n => n.id) });
  colaOrden = colaOrden
    .then(() => pedir('/api/orden', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: cuerpo }))
    .catch(() => {});
}

selOrden.addEventListener('change', () => {
  modoOrden = selOrden.value;
  try { localStorage.setItem('orden', modoOrden); } catch (e) {}
  dibujarLista();
});

inputBuscar.addEventListener('input', () => dibujarLista());

// ══════════════════════════════════════════════════════
//  DIBUJAR LISTA DE NOTAS (grid de tarjetas)
// ══════════════════════════════════════════════════════
function dibujarLista() {
  const query = inputBuscar.value.trim().toLowerCase();

  let visibles = ordenar(notas);
  if (query) {
    visibles = visibles.filter(n =>
      (n.titulo || '').toLowerCase().includes(query) ||
      textoPlano(aHtml(n.contenido)).toLowerCase().includes(query)
    );
  }

  // Contador
  if (notas.length === 0) {
    contadorNotas.textContent = '';
  } else if (query) {
    contadorNotas.textContent = `${visibles.length} de ${notas.length} notas`;
  } else {
    contadorNotas.textContent = `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`;
  }

  // Estado vacío vs grid
  if (notas.length === 0) {
    gridNotas.innerHTML = '';
    gridNotas.style.display = 'none';
    estadoVacio.classList.remove('oculto');
    return;
  }

  estadoVacio.classList.add('oculto');
  gridNotas.style.display = '';
  gridNotas.innerHTML = '';

  if (visibles.length === 0) {
    const msg = document.createElement('p');
    msg.style.cssText = 'color:var(--suave);font-size:14px;grid-column:1/-1;padding:16px 0;';
    msg.textContent = 'No hay notas que coincidan con tu búsqueda.';
    gridNotas.appendChild(msg);
    return;
  }

  for (const n of visibles) {
    const card = document.createElement('div');
    card.className = 'card-nota';
    if (n.id === actualId) card.style.borderColor = 'var(--acento)';

    const fecha = document.createElement('div');
    fecha.className = 'card-fecha';
    fecha.textContent = formatearFecha(n.modificada);

    const titulo = document.createElement('div');
    titulo.className = 'card-titulo';
    titulo.textContent = n.titulo || 'Sin título';

    const resumen = document.createElement('div');
    resumen.className = 'card-resumen';
    resumen.textContent = textoPlano(aHtml(n.contenido)).slice(0, 120);

    card.append(fecha, titulo, resumen);

    if (modoOrden === 'manual') {
      const caja = document.createElement('div');
      caja.className = 'card-mover';
      const arriba = document.createElement('button');
      arriba.textContent = '▲'; arriba.title = 'Subir';
      arriba.addEventListener('click', e => { e.stopPropagation(); mover(n.id, -1); });
      const abajo = document.createElement('button');
      abajo.textContent = '▼'; abajo.title = 'Bajar';
      abajo.addEventListener('click', e => { e.stopPropagation(); mover(n.id, 1); });
      caja.append(arriba, abajo);
      card.appendChild(caja);
    }

    card.addEventListener('click', () => abrir(n.id));
    gridNotas.appendChild(card);
  }
}

function actualizarEnLista(nota) {
  const i = notas.findIndex(n => n.id === nota.id);
  if (i === -1) notas.unshift(nota);
  else notas[i] = nota;
  dibujarLista();
}

// ══════════════════════════════════════════════════════
//  GUARDADO AUTOMÁTICO
// ══════════════════════════════════════════════════════
const ESPERA_MS    = 700;
const REINTENTO_MS = 3000;

let temporizador     = null;
let cambioPendiente  = false;
let cola             = Promise.resolve();
let ultimoId         = null;
let ultimoTexto      = '';

function hayAlgoParaGuardar() {
  return actualId !== null || inputTitulo.value.trim() !== '' || !editorVacio();
}

function armarPeticion() {
  const opc = {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo: inputTitulo.value.trim() || 'Sin título', contenido: contenidoActual() })
  };
  if (actualId === null) return ['/notas', { method: 'POST', ...opc }];
  return ['/notas/' + actualId, { method: 'PUT', ...opc }];
}

function programarGuardado() {
  cambioPendiente = true;
  estadoGuardado.textContent = 'Escribiendo…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardar, ESPERA_MS);
}

async function guardarReal() {
  cambioPendiente = false;
  if (!hayAlgoParaGuardar()) { estadoGuardado.textContent = ''; return; }
  const texto = inputTitulo.value + '|' + contenidoActual();
  if (actualId !== null && actualId === ultimoId && texto === ultimoTexto) {
    estadoGuardado.textContent = 'Guardado ✓';
    return;
  }
  estadoGuardado.textContent = 'Guardando…';
  try {
    const [url, opc] = armarPeticion();
    const nota = await pedir(url, opc);
    actualId = nota.id;
    ultimoId = nota.id;
    ultimoTexto = texto;
    actualizarEnLista(nota);
    estadoGuardado.textContent = cambioPendiente ? 'Escribiendo…' : 'Guardado ✓';
  } catch (e) {
    cambioPendiente = true;
    estadoGuardado.textContent = 'No se pudo guardar…';
    clearTimeout(temporizador);
    temporizador = setTimeout(guardar, REINTENTO_MS);
  }
}

function guardar() {
  clearTimeout(temporizador);
  cola = cola.then(guardarReal);
  return cola;
}

async function vaciarPendiente() {
  clearTimeout(temporizador);
  if (cambioPendiente) await guardar();
  else await cola;
}

window.addEventListener('pagehide', () => {
  if (!cambioPendiente || !hayAlgoParaGuardar()) return;
  const [url, opc] = armarPeticion();
  fetch(url, { ...opc, keepalive: true });
});

// ══════════════════════════════════════════════════════
//  ACCIONES SOBRE NOTAS
// ══════════════════════════════════════════════════════
async function abrir(id) {
  await vaciarPendiente();
  const n = notas.find(x => x.id === id);
  if (!n) return;
  actualId = id;
  inputTitulo.value = n.titulo;
  editor.innerHTML  = aHtml(n.contenido);
  estadoGuardado.textContent = '';
  dibujarLista();
  irAEditor();
  // pequeño delay para que la transición termine antes de hacer focus
  setTimeout(() => inputTitulo.focus(), 350);
}

async function nueva() {
  await vaciarPendiente();
  actualId = null;
  inputTitulo.value = '';
  editor.innerHTML  = '';
  estadoGuardado.textContent = '';
  ultimoId   = null;
  ultimoTexto = '';
  dibujarLista();
  irAEditor();
  setTimeout(() => inputTitulo.focus(), 350);
}

async function borrar() {
  clearTimeout(temporizador);
  cambioPendiente = false;
  await cola;
  if (actualId === null) { irALista(); return; }
  if (!confirm('¿Borrar esta nota?')) return;
  try {
    await pedir('/notas/' + actualId, { method: 'DELETE' });
    notas = notas.filter(n => n.id !== actualId);
    actualId = null;
    dibujarLista();
    irALista();
  } catch (e) {
    estadoGuardado.textContent = 'No se pudo borrar';
  }
}

async function volver() {
  await vaciarPendiente();
  irALista();
}

// ══════════════════════════════════════════════════════
//  EVENTOS DE NAVEGACIÓN
// ══════════════════════════════════════════════════════
btnNueva.addEventListener('click', nueva);
btnCrearPrimera.addEventListener('click', nueva);
btnVolver.addEventListener('click', volver);
btnBorrar.addEventListener('click', borrar);

document.getElementById('btnSalir').addEventListener('click', async () => {
  await vaciarPendiente();
  await fetch('/api/logout', { method: 'POST' });
  if ('caches' in window) await caches.delete('notex-v1');
  window.location.href = '/login';
});

// ══════════════════════════════════════════════════════
//  FORMATO DE TEXTO (editor)
// ══════════════════════════════════════════════════════
let rango = null;

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) {
    rango = sel.getRangeAt(0).cloneRange();
    actualizarBotones();
  }
});

function restaurarSeleccion() {
  editor.focus();
  if (rango) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rango); }
}

function aplicar(cmd, valor = null) {
  restaurarSeleccion();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, valor);
  actualizarBotones();
  programarGuardado();
}

function actualizarBotones() {
  herramientas.querySelectorAll('button[data-cmd]').forEach(b => {
    let activo = false;
    try { activo = document.queryCommandState(b.dataset.cmd); } catch (e) {}
    b.classList.toggle('activo', activo);
  });
}

herramientas.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
herramientas.querySelectorAll('button[data-cmd]').forEach(b => b.addEventListener('click', () => aplicar(b.dataset.cmd)));
document.getElementById('btnLimpiar').addEventListener('click', () => aplicar('removeFormat'));

// ── Insertar tarea (checkbox circular animado) ──────────────────────────────
function insertarTarea() {
  editor.focus();
  const html =
    '<div class="tarea-item">' +
      '<button class="tarea-check" contenteditable="false" type="button">' +
        '<span class="tarea-ring"></span>' +
      '</button>' +
      '<span class="tarea-texto">\u00a0Nueva tarea</span>' +
    '</div>';
  document.execCommand('insertHTML', false, html);

  // Seleccionar el texto para que el usuario pueda escribir encima
  requestAnimationFrame(() => {
    const tareas = editor.querySelectorAll('.tarea-texto');
    const ultima = tareas[tareas.length - 1];
    if (!ultima) return;
    const sel = window.getSelection();
    const rng = document.createRange();
    rng.selectNodeContents(ultima);
    sel.removeAllRanges();
    sel.addRange(rng);
  });

  programarGuardado();
}

document.getElementById('btnTarea').addEventListener('click', insertarTarea);

// ── Clic en un checkbox de tarea dentro del editor ─────────────────────────
editor.addEventListener('click', e => {
  const check = e.target.closest('.tarea-check');
  if (!check) return;
  e.preventDefault();

  const item = check.closest('.tarea-item');
  if (!item) return;

  const marcando = !item.classList.contains('hecho');
  item.classList.toggle('hecho');

  // Animación: pop en el círculo
  check.classList.remove('pop');
  void check.offsetWidth;          // fuerza reflow para reiniciar animación
  check.classList.add('pop');

  // Onda expansiva solo al marcar
  if (marcando) {
    const ring = check.querySelector('.tarea-ring');
    if (ring) {
      ring.classList.remove('onda');
      void ring.offsetWidth;
      ring.classList.add('onda');
      ring.addEventListener('animationend', () => ring.classList.remove('onda'), { once: true });
    }
  }

  programarGuardado();
});

// Evitar que mousedown en el check mueva el cursor del editor
editor.addEventListener('mousedown', e => {
  if (e.target.closest('.tarea-check')) e.preventDefault();
});

selFuente.addEventListener('change', () => { if (selFuente.value) aplicar('fontName', selFuente.value); selFuente.selectedIndex = 0; });
selTamano.addEventListener('change', () => { if (selTamano.value) aplicar('fontSize', selTamano.value); selTamano.selectedIndex = 0; });
selColor.addEventListener('change', () => aplicar('foreColor', selColor.value));

editor.addEventListener('paste', e => {
  e.preventDefault();
  const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, texto);
});

// ══════════════════════════════════════════════════════
//  EVENTOS DE ESCRITURA
// ══════════════════════════════════════════════════════
inputTitulo.addEventListener('input', programarGuardado);
editor.addEventListener('input', () => { normalizarVacio(); programarGuardado(); });

// Ctrl+S / Cmd+S
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); }
  // Escape en editor → volver
  if (e.key === 'Escape' && pantallaEditor.classList.contains('activa')) volver();
});

// Botón Atrás del navegador / Android
window.addEventListener('popstate', () => {
  if (pantallaEditor.classList.contains('activa')) {
    volver();
    history.pushState(null, '', location.href);
  }
});
history.pushState(null, '', location.href);

// ══════════════════════════════════════════════════════
//  ARRANQUE
// ══════════════════════════════════════════════════════
cargar();
