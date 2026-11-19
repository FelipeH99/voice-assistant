/** Owns session lifecycle; stale callbacks cannot revive a cancelled session. */
export function createSessionController({ onState = () => {}, onError = () => {} } = {}) {
  let state = 'idle', session = null, generation = 0, pending = null;
  const publish = (next) => { state = next; onState(next); };
  return {
    get state() { return state; },
    get session() { return session; },
    async start(connect, callbacks = {}) {
      if (state !== 'idle') return;
      const id = ++generation;
      const abort = new AbortController(); pending = abort;
      publish('connecting');
      const guarded = Object.fromEntries(Object.entries(callbacks).map(([name, fn]) => [name, (...args) => {
        if (id === generation) fn(...args);
      }]));
      try {
        const opened = await connect(abort.signal, {
          ...guarded,
          onDisconnect: () => {
            if (id !== generation) return;
            generation++; session = null; pending = null; publish('idle');
          },
        });
        if (id !== generation) { await opened.endSession(); return; }
        session = opened; pending = null; publish('connected');
      } catch (error) {
        if (id !== generation) return;
        pending = null; session = null; publish('idle'); onError(error);
      }
    },
    async stop() {
      const id = ++generation; pending?.abort(); pending = null;
      const closing = session; session = null;
      if (!closing) { publish('idle'); return; }
      publish('stopping');
      try { await closing.endSession(); }
      catch { onError(new Error('No se pudo confirmar el cierre. Cerrá esta pestaña para liberar el micrófono.')); }
      finally { if (id === generation) publish('idle'); }
    },
  };
}
