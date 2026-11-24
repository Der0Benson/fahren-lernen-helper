const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'fahren-lernen.user.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function currentData()'), source.indexOf('  async function run(automatic)'));
function data(id, answered, all = false) {
  return { isConnected: true, dataset: { questionid: id, variantid: '0', practice: 'GuidedLearnPath', answered: String(answered), allanswered: String(all), nextquestionid: '2' } };
}
async function scenario({wrong = false, all = false, cancel = false, wrongNext = false} = {}) {
  const original = data('1', false);
  const feedback = data('1', true, all);
  const next = data(wrongNext ? '3' : '2', false);
  let current = original, clicks = 0;
  const control = {isConnected: true};
  const button = {disabled: false, matches: () => false, click() {
    clicks++; current.isConnected = false;
    current = clicks === 1 ? feedback : next;
  }};
  const ctx = {
    document: {querySelectorAll(s) {
      if (s === '.practice-question .practice-question-data') return [current];
      if (s.includes('.btn-next')) return [button];
      if (s === '.question-feedbackbar') return [{innerText: wrong ? 'Leider falsch' : 'Richtig'}];
      return [];
    }},
    visible: () => true, delay: async () => {}, checkRun: () => {if(cancel) throw Error('Gestoppt');},
    state: () => true, question: () => '1.1.01-001', status: {}, Date
  };
  vm.createContext(ctx);
  vm.runInContext(helpers + '\nglobalThis.submit = submitAndAdvance;', ctx);
  try {
    const result = await ctx.submit({id:'1.1.01-001', original, plan:[{control, correct:true}]});
    return {result, clicks};
  } catch(error) { return {error, clicks}; }
}
(async () => {
  let r = await scenario(); assert.equal(r.clicks, 2); assert.equal(r.result.dataset.questionid, '2');
  r = await scenario({all:true}); assert.equal(r.clicks, 1); assert.equal(r.result, null);
  r = await scenario({wrong:true}); assert.equal(r.clicks, 1); assert.match(r.error.message, /falsche Antwort/);
  r = await scenario({cancel:true}); assert.equal(r.clicks, 0); assert.match(r.error.message, /Gestoppt/);
  r = await scenario({wrongNext:true}); assert.match(r.error.message, /Unerwartete nächste Frage/);
  console.log('Passed: submit then advance, end of round, wrong-answer stop, cancellation, unexpected navigation.');
})().catch(e => {console.error(e); process.exitCode = 1;});
