// ==UserScript==
// @name         Fahren Lernen – Antworten übernehmen
// @namespace    local.fahren-lernen
// @version      1.3.1
// @description  Textantworten ausfüllen; optional automatisch absenden und nächste Fragen bearbeiten.
// @match        https://html.fahren-lernen.de/*
// @grant        GM_xmlhttpRequest
// @connect      www.fuehrerscheintest-online.de
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const norm = s => s.normalize('NFKC').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().replace(/^[—–−-]\s*/, '- ');
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const box = document.createElement('aside');
  box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#fff;color:#17202a;padding:16px;border:2px solid #2463a6;border-radius:12px;max-width:390px;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0003';
  const button = document.createElement('button');
  button.textContent = 'Aktuelle Frage ausfüllen';
  button.style.cssText = 'padding:10px;cursor:pointer;background:#2463a6;color:white;border:0;border-radius:6px';
  const status = document.createElement('div');
  status.style.marginTop = '8px';
  status.textContent = 'Einzelfrage ausfüllen oder Automatik starten. Automatik sendet Antworten ab.';
  const start = document.createElement('button');
  start.textContent = 'Automatik starten';
  start.style.cssText = button.style.cssText + ';margin:6px;background:#187344';
  const stop = document.createElement('button');
  stop.textContent = 'Stopp';
  stop.style.cssText = button.style.cssText + ';background:#a52828';
  stop.disabled = true;
  box.append(button, start, stop, status);
  document.body.append(box);
  let busy = false;
  let cancelled = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function checkRun() { if (cancelled) throw Error('Gestoppt.'); }
  stop.addEventListener('click', () => {
    cancelled = true;
    stop.disabled = true;
    status.textContent = 'Gestoppt. Es werden keine weiteren Klicks ausgeführt.';
  });

  function pageText() {
    // Das eigene Ergebnisfenster darf keine alte Fragennummer beisteuern.
    const old = box.style.display;
    box.style.display = 'none';
    const text = document.body.innerText;
    box.style.display = old;
    return text;
  }
  function question() {
    const ids = [...new Set(pageText().match(/\b[12]\.\d{1,2}\.\d{2}-\d{3}(?:-[A-Z])?\b/g) || [])];
    if (ids.length !== 1) throw Error('Keine eindeutige Fragennummer gefunden. Bitte eine einzelne Frage öffnen.');
    return ids[0];
  }
  function fetchHTML(url) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url, anonymous: true, timeout: 20000,
      onload: r => {
        if (r.status !== 200) {
          const error = Error(`Lösungsseite: HTTP ${r.status} (${url})`);
          error.status = r.status;
          return reject(error);
        }
        if (r.finalUrl && new URL(r.finalUrl).hostname !== 'www.fuehrerscheintest-online.de')
          return reject(Error('Unerwartete Weiterleitung.'));
        resolve(r.responseText);
      },
      onerror: () => reject(Error('Abruf fehlgeschlagen. Netzwerk und Userscript-Berechtigung prüfen.')),
      ontimeout: () => reject(Error('Zeitüberschreitung beim Abruf.'))
    }));
  }
  async function loadSolution(id) {
    const candidates = [id];
    if (!/-[A-Z]$/.test(id)) candidates.push(`${id}-M`);
    for (const sourceId of candidates) {
      checkRun();
      const url = `https://www.fuehrerscheintest-online.de/fuehrerscheintest-fragen/frage-${encodeURIComponent(sourceId)}/antwort`;
      try {
        const html = await fetchHTML(url);
        checkRun();
        return {html, sourceId, url};
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    throw Error(`Keine Lösungsseite für ${id} gefunden. Geprüft: ${candidates.join(', ')}.`);
  }
  function parse(html, id) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sourceId = (doc.querySelector('h1')?.textContent || '').match(/\b[12]\.\d{1,2}\.\d{2}-\d{3}(?:-[A-Z])?\b/)?.[0];
    if (sourceId !== id)
      throw Error('Die Lösungsseite gehört nicht zur erkannten Frage.');
    const numbers = [...doc.querySelectorAll('strong')].filter(el =>
      el.classList.contains('bg-yellow-400/20') && /^\d+(?:[.,]\d+)?$/.test(norm(el.textContent || '')));
    if (numbers.length) {
      if (numbers.length !== 1) throw Error('Mehrere Zahlenfelder: Eine eindeutige Zuordnung fehlt.');
      const number = numbers[0];
      const value = norm(number.textContent).replace(',', '.');
      const context = norm(number.parentElement.textContent);
      return [{text: context, correct: value, numeric: true}];
    }
    const answers = [...doc.querySelectorAll('label')].flatMap(label => {
      const row = label.firstElementChild;
      const yes = !!row?.querySelector('svg.text-green-700');
      const no = !!row?.querySelector('svg.text-red-700');
      if (yes === no) return [];
      const text = norm(row.lastElementChild?.textContent || '');
      return text ? [{ text, correct: yes }] : [];
    });
    if (answers.length < 2 || answers.length > 5 || !answers.some(a => a.correct) ||
        new Set(answers.map(a => a.text)).size !== answers.length)
      throw Error('Die Lösungsseite enthält keine eindeutig lesbaren Antworten für diese Frage.');
    return answers;
  }
  const controlSelector = 'input[type="checkbox"], [role="checkbox"]';
  const customRowSelector = '.question-answers .answer.multiple-choice-answer';
  const customDataSelector = 'input.answer-data[type="hidden"][data-answertype="multiplechoice"]';
  const numericSelector = '.question-answers input.answer-data[data-answertype="numeric"]';
  function state(control) {
    if (control.matches(numericSelector)) return norm(control.value).replace(',', '.');
    if (control.matches(customRowSelector)) {
      const fields = control.querySelectorAll(customDataSelector);
      if (fields.length !== 1) return null;
      const value = fields[0].value;
      return value === 'true' ? true : value === 'false' ? false : null;
    }
    if (control.matches('input[type="checkbox"]')) return control.indeterminate ? null : control.checked;
    const value = control.getAttribute('aria-checked');
    return value === 'true' ? true : value === 'false' ? false : null;
  }
  function findControl(answer, answers) {
    if (answer.numeric) {
      const inputs = [...document.querySelectorAll(numericSelector)].filter(visible);
      if (inputs.length !== 1 || inputs[0].disabled || inputs[0].readOnly)
        throw Error('Zahleneingabe nicht eindeutig verfügbar.');
      return inputs[0];
    }
    const customRows = [...document.querySelectorAll(customRowSelector)].filter(visible);
    if (customRows.length) {
      const matches = customRows.filter(row => {
        const labels = [...row.querySelectorAll('.text label.audio-label')];
        return labels.length === 1 && norm(labels[0].textContent || '') === answer.text;
      });
      if (matches.length !== 1) throw Error('Antworttext passt nicht eindeutig zur aktuellen Frage. Bitte manuell prüfen.');
      const row = matches[0];
      const targets = row.querySelectorAll('.chk.chk-answer');
      if (state(row) === null || targets.length !== 1 || !visible(targets[0]) ||
          row.matches('.disabled, [aria-disabled="true"]'))
        throw Error('Antwortfeld ist gesperrt oder sein Zustand ist nicht eindeutig.');
      return row;
    }
    const leaves = [...document.body.querySelectorAll('*')].filter(el =>
      !box.contains(el) && visible(el) && norm(el.textContent || '') === answer.text &&
      ![...el.children].some(c => norm(c.textContent || '') === answer.text));
    const found = new Set();
    for (const leaf of leaves) {
      for (let el = leaf, level = 0; el && el !== document.body && level < 7; el = el.parentElement, level++) {
        const text = norm(el.textContent || '');
        if (answers.some(a => a !== answer && text.includes(a.text))) break;
        const candidates = [...el.querySelectorAll(controlSelector)];
        if (el.matches(controlSelector)) candidates.push(el);
        if (el instanceof HTMLLabelElement && el.control?.matches(controlSelector)) candidates.push(el.control);
        const unique = [...new Set(candidates)];
        if (unique.length === 1) { found.add(unique[0]); break; }
        if (unique.length > 1) break;
      }
    }
    if (found.size !== 1) throw Error('Antworttext gefunden, aber Checkbox nicht eindeutig erkannt. Die Oberfläche benötigt eine Anpassung des Scripts.');
    const control = [...found][0];
    if (state(control) === null || control.disabled || control.getAttribute('aria-disabled') === 'true')
      throw Error('Checkbox-Zustand unklar oder Eingabe gesperrt.');
    return control;
  }
  function clickControl(control) {
    if (control.matches(customRowSelector)) control.querySelector('.chk.chk-answer').click();
    else control.click();
  }
  function fillNumeric(control, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw Error('Zahleneingabe wird vom Browser nicht unterstützt.');
    control.focus();
    setter.call(control, value.replace('.', ','));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.blur();
  }
  async function prepareMedia() {
    const ready = () => [...document.querySelectorAll(`${customRowSelector}, ${numericSelector}`)].some(visible);
    if (ready()) return;
    const initialKey = key(currentData());
    const showSelector = '.practice-question .question-videobar .btn-show-question';
    const playSelector = '.practice-question .question-videobar .btn-show-video';
    const first = selector => [...document.querySelectorAll(selector)].filter(el =>
      visible(el) && !el.disabled && !el.matches('.disabled, .invisible, [aria-disabled="true"]'));
    if (!first(showSelector).length) {
      const play = first(playSelector);
      if (play.length !== 1) throw Error('Noch keine Antwortfelder sichtbar und kein eindeutiger Video-Startknopf gefunden.');
      checkRun();
      status.textContent = 'Video wird abgespielt. Warte auf die Freigabe der Frage …';
      play[0].click();
    }
    const deadline = Date.now() + 180000;
    let revealed = false;
    while (Date.now() < deadline) {
      await delay(300); checkRun();
      if (key(currentData()) !== initialKey) throw Error('Während des Videos wurde die Frage gewechselt.');
      if (ready()) return;
      const show = first(showSelector);
      if (!revealed && show.length === 1) {
        const playing = [...document.querySelectorAll('video')].some(v => visible(v) && !v.ended && !v.paused);
        if (!playing) { checkRun(); show[0].click(); revealed = true; }
      }
    }
    throw Error('Das Video oder die Freigabe der Frage wurde nicht abgeschlossen.');
  }
  async function solveCurrent() {
    checkRun();
    await prepareMedia();
    status.replaceChildren('Lösung wird geladen …');
    const id = question();
    const original = currentData();
    const {html, sourceId, url} = await loadSolution(id);
    const answers = parse(html, sourceId);
    checkRun();
    if (!original.isConnected) throw Error('Die Seite wurde während des Abrufs gewechselt.');
    if (question() !== id) throw Error('Die Frage wurde während des Abrufs gewechselt. Bitte erneut starten.');
    status.textContent = `Frage ${id} – richtige Antworten:`;
    const list = document.createElement('ul');
    for (const a of answers.filter(a => a.correct)) {
      const li = document.createElement('li'); li.textContent = a.text; list.append(li);
    }
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Lösungsquelle öffnen';
    status.append(list, link);
    // Erst alle Zuordnungen prüfen, dann ändern. Keine Zuordnung nach Reihenfolge.
    const plan = answers.map(a => ({ ...a, control: findControl(a, answers) }));
    if (new Set(plan.map(p => p.control)).size !== plan.length) throw Error('Mehrere Antworten wurden derselben Checkbox zugeordnet.');
    const allRows = [...document.querySelectorAll(customRowSelector)].filter(visible);
    if (allRows.length && allRows.length !== plan.length) throw Error('Nicht alle Antwortfelder sind einer Lösung zugeordnet.');
    for (const p of plan) {
      checkRun();
      if (question() !== id || !p.control.isConnected) throw Error('Die Oberfläche hat sich geändert. Bitte Auswahl kontrollieren.');
      if (state(p.control) !== p.correct) {
        if (p.numeric) fillNumeric(p.control, p.correct);
        else clickControl(p.control);
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!p.control.isConnected || state(p.control) !== p.correct)
          throw Error('Das Antwortfeld hat den Klick nicht übernommen. Bitte Auswahl kontrollieren.');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    checkRun();
    if (question() !== id || !plan.every(p => p.control.isConnected && state(p.control) === p.correct))
      throw Error('Auswahl konnte nicht vollständig bestätigt werden. Bitte manuell prüfen.');
    status.append(document.createElement('br'), 'Antworten ausgewählt. Bitte prüfen und selbst auf Weiter klicken.');
    return { id, original, plan };
  }
  function currentData() {
    const nodes = document.querySelectorAll('.practice-question .practice-question-data');
    if (nodes.length !== 1) throw Error('Keine eindeutige Übungsfrage geöffnet.');
    return nodes[0];
  }
  function key(data) { return `${data.dataset.questionid}:${data.dataset.variantid}`; }
  function assertPractice(data) {
    if (data.dataset.practice !== 'GuidedLearnPath') throw Error('Automatik ist nur für den Übungsmodus eingerichtet.');
  }
  function clickNext(data) {
    checkRun();
    if (!data.isConnected || currentData() !== data) throw Error('Die Frage wurde unerwartet gewechselt.');
    if ([...document.querySelectorAll('.col-popups [role="dialog"], .col-popups .modal')].some(visible))
      throw Error('Ein Dialog ist geöffnet. Bitte manuell prüfen.');
    const buttons = [...document.querySelectorAll('.practice-question .question-commandbar .btn-next')].filter(visible);
    if (buttons.length !== 1 || buttons[0].disabled || buttons[0].matches('.disabled, [aria-disabled="true"]'))
      throw Error('Weiter-Schaltfläche nicht eindeutig verfügbar.');
    buttons[0].click();
  }
  async function waitForPage(old) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await delay(200);
      checkRun();
      const nodes = document.querySelectorAll('.practice-question .practice-question-data');
      if (nodes.length === 1 && nodes[0] !== old) {
        const next = nodes[0];
        await delay(500);
        checkRun();
        if (next.isConnected && currentData() === next) return next;
      }
    }
    throw Error('Kein bestätigter Seitenwechsel. Automatik gestoppt; bitte Ergebnis prüfen.');
  }
  async function submitAndAdvance(result) {
    const {id, original, plan} = result;
    await delay(1500);
    checkRun();
    if (question() !== id || !plan.every(p => p.control.isConnected && state(p.control) === p.correct))
      throw Error('Auswahl wurde vor dem Absenden verändert.');
    status.textContent = `Frage ${id}: Antworten werden abgesendet …`;
    clickNext(original);
    const feedback = await waitForPage(original);
    assertPractice(feedback);
    if (key(feedback) !== key(original) || feedback.dataset.answered !== 'true')
      throw Error('Absendebestätigung fehlt oder eine unerwartete Frage wurde geöffnet.');
    const feedbackText = [...document.querySelectorAll('.question-feedbackbar')].filter(visible).map(el => el.innerText).join(' ');
    if (/falsch|nicht richtig|nicht korrekt|leider/i.test(feedbackText))
      throw Error('Die Seite meldet eine falsche Antwort. Bitte manuell prüfen.');
    if (feedback.dataset.allanswered === 'true') return null;
    const expected = feedback.dataset.nextquestionid;
    if (!expected || Number(expected) <= 0) throw Error('Keine nächste Frage gefunden.');
    status.textContent = `Frage ${id} abgesendet. Nächste Frage wird geöffnet …`;
    await delay(1500);
    clickNext(feedback);
    const next = await waitForPage(feedback);
    if (next.dataset.questionid !== expected) throw Error('Unerwartete nächste Frage.');
    return next;
  }
  async function run(automatic) {
    if (busy) return;
    busy = true; cancelled = false;
    button.disabled = start.disabled = true; stop.disabled = false;
    let count = 0;
    const seen = new Set();
    try {
      do {
        checkRun();
        const data = currentData();
        if (automatic) {
          assertPractice(data);
          if (data.dataset.answered === 'true') throw Error('Diese Frage ist bereits abgesendet. Bitte zunächst zur nächsten unbeantworteten Frage wechseln.');
          if (seen.has(key(data))) throw Error('Wiederholte Frage erkannt; Automatik angehalten.');
          seen.add(key(data));
        }
        const result = await solveCurrent();
        if (!automatic) break;
        const next = await submitAndAdvance(result);
        count++;
        if (!next) {
          status.textContent = `Fertig: Alle Fragen dieses Durchgangs sind beantwortet. In diesem Lauf: ${count}.`;
          break;
        }
        await delay(1000);
      } while (automatic);
    } catch (error) {
      status.append(document.createElement('br'), `Angehalten: ${error.message}`);
    } finally {
      busy = false; button.disabled = start.disabled = false; stop.disabled = true;
    }
  }
  button.addEventListener('click', () => run(false));
  start.addEventListener('click', () => run(true));
})();
