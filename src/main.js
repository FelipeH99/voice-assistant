import './style.css';
import { createSessionController } from './session.js';
const $ = (id) => document.getElementById(id);
let muted = false, transcript = [], configured = null;
const controller = createSessionController({
  onState(state) {
    if (state === 'idle') muted = false;
    $('status').textContent = {idle:'Listo para conversar',connecting:'Conectando…',connected:$('mode').value === 'demo' ? 'Demo guiada · sin audio' : 'Conectado',stopping:'Finalizando…'}[state];
    update();
  },
  onError(error) { $('error').textContent = error.name === 'NotAllowedError' ? 'El micrófono no tiene permiso. Habilitalo en el navegador o probá la demo.' : error.message || 'No se pudo conectar.'; },
});
function update() {
  const {state,session} = controller;
  $('start').disabled = state !== 'idle' || ($('mode').value === 'live' && configured !== true);
  $('stop').disabled = state === 'idle' || state === 'stopping';
  $('stop').textContent = state === 'connecting' ? 'Cancelar conexión' : 'Finalizar';
  $('mode').disabled = state !== 'idle';
  $('mute').disabled = !session || $('mode').value !== 'live';
  $('question').disabled = state !== 'connected';
  $('send').disabled = state !== 'connected';
  $('download').disabled = transcript.length === 0;
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').textContent = muted ? 'Activar micrófono' : 'Silenciar micrófono';
}
function message(role, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  transcript.push({role:role === 'user' ? 'Vos' : 'Asistente',text,mode:$('mode').value});
  const li = document.createElement('li');
  const label = document.createElement('strong');
  label.textContent = role === 'user' ? 'Vos' : 'Asistente';
  const body = document.createElement('p'); body.textContent = text;
  li.append(label, body); $('messages').append(li);
  $('messages').scrollTop = $('messages').scrollHeight;
  update();
}
async function checkConfiguration() {
  configured = null; update(); $('configuration').textContent = 'Comprobando configuración de voz…';
  try {
    const response = await fetch('/api/status', {signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw Error();
    configured = (await response.json()).configured === true;
    $('configuration').textContent = configured ? 'ElevenLabs configurado. La conexión se valida al iniciar.' : 'Voz real pendiente: completá el agente y la API key en .env. La demo está disponible.';
  } catch {
    configured = false; $('configuration').textContent = 'Servidor de voz no disponible. Ejecutá npm run server. La demo está disponible.';
  }
  update();
}
$('retry').addEventListener('click', checkConfiguration);
$('mode').addEventListener('change', () => {
  const live = $('mode').value === 'live';
  $('start').textContent = live ? 'Iniciar conversación' : 'Probar demo';
  $('notice').textContent = live ? 'Al iniciar, permitís usar el micrófono y enviar tu voz a ElevenLabs. Podés silenciarlo o finalizar cuando quieras.' : 'Probá el recorrido con respuestas de ejemplo. No usa IA ni micrófono.';
  $('error').textContent = ''; update();
});
$('start').addEventListener('click', async () => {
  $('error').textContent = '';
  if ($('mode').value === 'demo') {
    await controller.start(async () => ({endSession:async()=>{}}));
    message('assistant', '¡Hola! Esta es una demostración. Probá escribir “qué podés hacer” o “qué es una API”.');
    return;
  }
  await controller.start(async (signal, callbacks) => {
    const response = await fetch('/api/session', {method:'POST',headers:{'X-Voice-Client':'local'},signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const { Conversation } = await import('@elevenlabs/client');
    signal.throwIfAborted();
    return Conversation.startSession({signedUrl:data.signedUrl,connectionType:'websocket',...callbacks});
  }, {
    onMessage:({source,message:text})=>message(source,text),
    onModeChange:({mode})=>{ $('status').textContent = mode === 'speaking' ? 'El asistente está hablando' : muted ? 'Micrófono silenciado' : 'Te escucho'; },
    onError:()=>{ $('error').textContent = 'La conexión tuvo un problema. Finalizá y volvé a intentar.'; },
  });
});
$('stop').addEventListener('click', () => controller.stop());
$('mute').addEventListener('click', () => {
  try {
    controller.session?.setMicMuted(!muted); muted = !muted;
    $('status').textContent = muted ? 'Micrófono silenciado' : 'Te escucho'; update();
  } catch { $('error').textContent = 'No se pudo cambiar el micrófono. Finalizá la sesión si el problema continúa.'; }
});
$('clear').addEventListener('click', () => { transcript=[]; $('messages').replaceChildren(); update(); });
$('download').addEventListener('click', () => {
  const text = 'Voz · Transcripción local\nLos mensajes [DEMO] son ejemplos predefinidos.\n\n' + transcript.map(item=>`${item.mode === 'demo' ? '[DEMO] ' : ''}${item.role}: ${item.text}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download='conversacion.txt'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('text-form').addEventListener('submit', (event) => {
  event.preventDefault(); const text=$('question').value.trim();
  if (controller.state !== 'connected' || !text) return;
  if ($('mode').value === 'live') {
    try { controller.session.sendUserMessage(text); $('question').value=''; }
    catch { $('error').textContent='No se pudo enviar el mensaje. Tu texto sigue disponible para reintentar.'; }
  } else {
    $('question').value=''; message('user',text);
    message('assistant', /api/i.test(text) ? 'Ejemplo: una API permite que dos programas intercambien datos mediante reglas definidas, como consultar el clima desde una app.' : /hacer|ayud/i.test(text) ? 'En el modo real puedo explicar conceptos, proponer ideas y responder preguntas. Esta demo solo reproduce respuestas predefinidas.' : 'Esta pregunta necesita el modo real de ElevenLabs. La demo no genera respuestas con IA.');
  }
});
window.addEventListener('pagehide', () => { void controller.stop(); });
update(); void checkConfiguration();
