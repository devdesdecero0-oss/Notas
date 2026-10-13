const formulario = document.getElementById('formulario');
const inputClave = document.getElementById('clave');
const error = document.getElementById('error');

// Mismo tema (claro/oscuro) que el resto de la app
let tema = null;
try { tema = localStorage.getItem('tema'); } catch (e) {}
const oscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.tema = tema || (oscuro ? 'oscuro' : 'claro');

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: inputClave.value })
    });
    if (r.ok) {
      window.location.href = '/';
      return;
    }
    error.textContent = 'Clave incorrecta';
  } catch (err) {
    error.textContent = 'No se pudo conectar';
  }
  inputClave.select();
});