import './style.css';
const $ = (id) => document.getElementById(id);
let session = null, active = false, muted = false, starting = false;
function update() {
  $('start').disabled = active || starting;
  $('stop').disabled = !active;
  $('mode').disabled = active || starting;
  $('mute').disabled = !session;
  $('question').disabled = !active;
  $('send').disabled = !active;
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').textContent = muted ? 'Activar micrófono' : 'Silenciar micrófono';
}
function message(role, text) {
  const li = document.createElement('li');
  const label = document.createElement('strong');
  label.textContent = role === 'user' ? 'Vos' : 'Asistente';
  const body = document.createElement('p'); body.textContent = text;
  li.append(label, body); $('messages').append(li);
  li.scrollIntoView({block:'nearest', behavior:'smooth'});
}
function disconnected() {
  active = false; session = null; muted = false;
  $('status').textContent = 'Conversación finalizada'; update();
}
$('mode').addEventListener('change', () => {
  const live = $('mode').value === 'live';
  $('start').textContent = live ? 'Iniciar conversación' : 'Probar demo';
  $('notice').textContent = live ? 'Al iniciar, permitís usar el micrófono y enviar tu voz a ElevenLabs. Podés silenciarlo o finalizar cuando quieras.' : 'Probá el recorrido con respuestas de ejemplo. No usa IA ni micrófono.';
  $('error').textContent = '';
});
$('start').addEventListener('click', async () => {
  starting = true; $('error').textContent = ''; update();
  try {
    if ($('mode').value === 'demo') {
      active = true; $('status').textContent = 'Demo guiada · sin audio';
      message('assistant', '¡Hola! Esta es una demostración. Probá escribir “qué podés hacer” o “qué es una API”.');
    } else {
      $('status').textContent = 'Conectando…';
      const response = await fetch('/api/session', {method:'POST', headers:{'X-Voice-Client':'local'}});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const { Conversation } = await import('@elevenlabs/client');
      session = await Conversation.startSession({signedUrl:data.signedUrl, connectionType:'websocket',
        onMessage: ({source, message: text}) => message(source, text),
        onDisconnect: disconnected,
        onModeChange: ({mode}) => { $('status').textContent = mode === 'speaking' ? 'El asistente está hablando' : 'Te escucho'; },
        onError: () => { $('error').textContent = 'La conexión tuvo un problema. Finalizá y volvé a intentar.'; }
      });
      active = true; $('status').textContent = 'Conectado';
    }
  } catch (error) {
    disconnected(); $('error').textContent = error.message || 'No se pudo conectar. Revisá el permiso del micrófono.';
  } finally { starting = false; update(); }
});
$('stop').addEventListener('click', async () => {
  try { if (session) await session.endSession(); }
  finally { disconnected(); }
});
$('mute').addEventListener('click', () => { muted = !muted; session?.setMicMuted(muted); update(); });
$('clear').addEventListener('click', () => { $('messages').replaceChildren(); });
$('text-form').addEventListener('submit', (event) => {
  event.preventDefault(); const text = $('question').value.trim();
  if (!active || !text) return;
  $('question').value = '';
  if (session) {
    try { session.sendUserMessage(text); } catch { $('error').textContent = 'No se pudo enviar el mensaje.'; }
  } else {
    message('user', text);
    message('assistant', /api/i.test(text) ? 'Ejemplo: una API permite que dos programas intercambien datos mediante reglas definidas, como consultar el clima desde una app.' : /hacer|ayud/i.test(text) ? 'En el modo real puedo explicar conceptos, proponer ideas y responder preguntas. Esta demo solo reproduce respuestas predefinidas.' : 'Esta pregunta necesita el modo real de ElevenLabs. La demo no genera respuestas con IA.');
  }
});
window.addEventListener('pagehide', () => { session?.endSession(); });
update();
