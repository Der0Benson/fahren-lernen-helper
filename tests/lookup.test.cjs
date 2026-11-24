const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'fahren-lernen.user.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function fetchHTML('), source.indexOf('  function parse('));
async function lookup(id, statuses, stop = false) {
  const calls = [];
  const ctx = {URL, checkRun() {if(stop) throw Error('Gestoppt');}, GM_xmlhttpRequest(options) {
    calls.push(options.url);
    options.onload({status: statuses.shift(), responseText: 'html', finalUrl: options.url});
  }};
  vm.createContext(ctx);
  vm.runInContext(helpers + '\nglobalThis.lookup = loadSolution;', ctx);
  try {return {result: await ctx.lookup(id), calls};} catch(error) {return {error, calls};}
}
(async () => {
  let r = await lookup('2.2.04-105', [404,200]);
  assert.equal(r.result.sourceId, '2.2.04-105-M'); assert.equal(r.calls.length, 2);
  assert.match(r.result.url, /105-M\/antwort$/);
  r = await lookup('2.2.04-107', [200]); assert.equal(r.calls.length, 1);
  r = await lookup('2.2.04-105-M', [404]); assert.equal(r.calls.length, 1); assert.match(r.error.message, /Keine Lösungsseite/);
  r = await lookup('2.2.04-105', [404,404]); assert.equal(r.calls.length, 2); assert.match(r.error.message, /105-M/);
  for (const status of [403,429,500]) {
    r = await lookup('2.2.04-105', [status,200]); assert.equal(r.calls.length, 1); assert.equal(r.error.status, status);
  }
  r = await lookup('2.2.04-105', [200], true); assert.equal(r.calls.length, 0);
  console.log('Passed: -M fallback on 404, direct hit, explicit suffix, missing page, non-404 errors, stop.');
})().catch(e => {console.error(e); process.exitCode = 1;});
