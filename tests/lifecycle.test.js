import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionController } from '../src/session.js';
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };

test('cancel during connection aborts request and closes a late session', async () => {
  const pending=deferred(); let signal, closed=0;
  const controller=createSessionController();
  const task=controller.start(s=>{signal=s;return pending.promise;});
  assert.equal(controller.state,'connecting');
  await controller.stop();
  assert.equal(signal.aborted,true);
  pending.resolve({endSession:async()=>{closed++;}});
  await task;
  assert.equal(closed,1);
  assert.equal(controller.state,'idle');
});
test('callbacks from a cancelled session cannot affect a new session', async () => {
  const controller=createSessionController(); let oldEvents, messages=0;
  await controller.start(async(s,events)=>{oldEvents=events;return {endSession:async()=>{}};}, {onMessage:()=>messages++});
  await controller.stop();
  await controller.start(async()=>({endSession:async()=>{}}));
  oldEvents.onDisconnect(); oldEvents.onMessage('late');
  assert.equal(controller.state,'connected'); assert.equal(messages,0);
});
test('repeated starts create only one connection and disconnect releases state', async () => {
  const pending=deferred(); let calls=0, events;
  const controller=createSessionController();
  const task=controller.start(async(s,e)=>{calls++;events=e;return pending.promise;});
  await controller.start(async()=>{calls++;});
  pending.resolve({endSession:async()=>{}}); await task;
  events.onDisconnect();
  assert.equal(calls,1); assert.equal(controller.state,'idle');
});
test('failed connection is recoverable', async () => {
  let errors=0;
  const controller=createSessionController({onError:()=>errors++});
  await controller.start(async()=>{throw Error('offline');});
  assert.equal(controller.state,'idle'); assert.equal(errors,1);
  await controller.start(async()=>({endSession:async()=>{}}));
  assert.equal(controller.state,'connected');
});
test('late close completion cannot reset a newer connection', async () => {
  const pending=deferred(); const controller=createSessionController();
  await controller.start(async()=>({endSession:()=>pending.promise}));
  const stopping=controller.stop();
  await controller.stop();
  await controller.start(async()=>({endSession:async()=>{}}));
  pending.resolve(); await stopping;
  assert.equal(controller.state,'connected');
});
