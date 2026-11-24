const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'fahren-lernen.user.js'), 'utf8');
const helpers = source.slice(source.indexOf('  const controlSelector'), source.indexOf("  button.addEventListener"));
let rows = [];
function row(text, value = 'false') {
  const field = { value };
  const label = { textContent: text };
  let clicks = 0;
  const target = { click() { clicks++; field.value = field.value === 'true' ? 'false' : 'true'; } };
  return {
    field, get clicks() { return clicks; },
    matches(s) { return s === '.question-answers .answer.multiple-choice-answer'; },
    querySelectorAll(s) {
      if (s.includes('input.answer-data')) return [field];
      if (s === '.text label.audio-label') return [label];
      if (s === '.chk.chk-answer') return [target];
      return [];
    },
    querySelector(s) { return this.querySelectorAll(s)[0]; }
  };
}
const ctx = {document: {querySelectorAll: () => rows}, visible: () => true, norm: s => s.replace(/\s+/g, ' ').trim()};
vm.createContext(ctx);
vm.runInContext(helpers + '\nglobalThis.api = {state, findControl, clickControl};', ctx);
const {state, findControl, clickControl} = ctx.api;
rows = [row('Falsche Antwort'), row('Richtige Antwort')];
assert.equal(findControl({text:'Richtige Antwort'}, []), rows[1]);
assert.equal(state(rows[1]), false);
clickControl(rows[1]);
assert.equal(state(rows[1]), true);
if (state(rows[1]) !== true) clickControl(rows[1]);
assert.equal(rows[1].clicks, 1, 'Already selected answer must not be toggled off');
clickControl(rows[1]);
assert.equal(state(rows[1]), false);
assert.throws(() => findControl({text:'Anderer Wortlaut'}, []));
rows.push(row('Richtige Antwort'));
assert.throws(() => findControl({text:'Richtige Antwort'}, []));
rows = [row('Richtige Antwort', 'unexpected')];
assert.equal(state(rows[0]), null);
assert.throws(() => findControl({text:'Richtige Antwort'}, []));
const numeric = {value:'7', matches: s => s.includes('[data-answertype="numeric"]')};
rows = [numeric];
assert.equal(findControl({numeric:true}, []), numeric);
assert.equal(state(numeric), '7');
numeric.value = '2,5';
assert.equal(state(numeric), '2.5');
rows = [numeric, numeric];
assert.throws(() => findControl({numeric:true}, []));
console.log('Passed: custom controls, text mapping, toggle state, idempotency, ambiguous/missing answers, unknown state.');
