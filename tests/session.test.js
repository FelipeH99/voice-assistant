import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function request(t, options, headers = {'Origin':'http://127.0.0.1:5190','X-Voice-Client':'local'}) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>server.close());
  return fetch(`http://127.0.0.1:${server.address().port}/api/session`,{method:'POST',headers});
}
const env={ELEVENLABS_API_KEY:'private-test-key',ELEVENLABS_AGENT_ID:'agent_test'};
test('missing credentials fail without invoking provider',async t=>{
  const result=await request(t,{env:{},fetcher:()=>assert.fail('must not call')});
  assert.equal(result.status,503);
});
test('cross-origin requests fail before calling provider',async t=>{
  const result=await request(t,{env,fetcher:()=>assert.fail('must not call')},{Origin:'https://untrusted.example','X-Voice-Client':'local'});
  assert.equal(result.status,403);
});
test('only signed URL is returned and responses are not cached',async t=>{
  const result=await request(t,{env,fetcher:async(url,options)=>{
    assert.equal(url.searchParams.get('agent_id'),'agent_test');
    assert.equal(options.headers['xi-api-key'],'private-test-key');
    return {ok:true,json:async()=>({signed_url:'wss://api.elevenlabs.io/test',extra:'secret'})};
  }});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(await result.json(),{signedUrl:'wss://api.elevenlabs.io/test'});
});
test('provider failures do not leak credentials or error bodies',async t=>{
  const result=await request(t,{env,fetcher:async()=>{throw Error('private-test-key');}});
  assert.equal(result.status,502);
  assert.ok(!(await result.text()).includes('private-test-key'));
});
test('invalid signed URL is rejected',async t=>{
  const result=await request(t,{env,fetcher:async()=>({ok:true,json:async()=>({signed_url:'https://untrusted.example'})})});
  assert.equal(result.status,502);
});
