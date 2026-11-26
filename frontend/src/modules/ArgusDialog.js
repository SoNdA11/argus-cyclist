/*
    Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
    Copyright (C) 2026  Paulo Sérgio
    SPDX-License-Identifier: GPL-3.0-or-later

    In-app replacements for window.alert / confirm / prompt, drawn in the Argus dialog
    format (argus-ui.css .ar-dialog). They return Promises instead of blocking:
        await arAlert('Saved.');
        if (await arConfirm('Delete this goal?')) { ... }
        const name = await arPrompt('Rename conversation:', 'Old name');   // null = cancelled
    Calls made while a dialog is open are queued and shown one after the other.
*/

const DANGER_WORDS = /\b(delete|discard|disconnect|archive|remove|stop|reset)\b/i;
const ERROR_WORDS = /\b(error|failed|failure|invalid|not found|not available|unable)\b/i;

let root = null;
let els = null;
const queue = [];
let current = null;

function build() {
    root = document.createElement('div');
    root.id = 'arDialog';
    root.className = 'modal-overlay ar-dialog-overlay';
    root.innerHTML = `
        <section class="ar-dialog" role="alertdialog" aria-modal="true" aria-labelledby="arDialogTitle" aria-describedby="arDialogMsg">
            <span class="ar-label ar-dialog-kicker" id="arDialogKicker"></span>
            <h2 class="ar-h2" id="arDialogTitle"></h2>
            <p class="ar-body ar-dialog-msg" id="arDialogMsg"></p>
            <input class="ar-input" id="arDialogInput" type="text" autocomplete="off" aria-labelledby="arDialogTitle">
            <div class="ar-dialog-actions">
                <button class="ar-btn" id="arDialogCancel" type="button">Cancel</button>
                <button class="ar-btn-primary" id="arDialogOk" type="button">OK</button>
            </div>
        </section>`;
    document.body.appendChild(root);
    const $ = (id) => root.querySelector('#' + id);
    els = {
        box: root.querySelector('.ar-dialog'), kicker: $('arDialogKicker'), title: $('arDialogTitle'),
        msg: $('arDialogMsg'), input: $('arDialogInput'), cancel: $('arDialogCancel'), ok: $('arDialogOk')
    };
    els.ok.addEventListener('click', () => close(true));
    els.cancel.addEventListener('click', () => close(false));
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Enter' && document.activeElement !== els.cancel) { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') {
            // Keep focus inside the dialog.
            const items = [els.input, els.cancel, els.ok].filter((el) => el.offsetParent !== null);
            const i = items.indexOf(document.activeElement);
            const next = items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length];
            e.preventDefault();
            next?.focus();
        }
    });
}

function close(accepted) {
    if (!current) return;
    const { kind, resolve, returnFocus } = current;
    current = null;
    root.classList.remove('active');
    if (kind === 'prompt') resolve(accepted ? els.input.value : null);
    else if (kind === 'confirm') resolve(!!accepted);
    else resolve();
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    showNext();
}

function showNext() {
    if (current || queue.length === 0) return;
    current = queue.shift();
    if (!root) build();
    const { kind, message, opts } = current;
    const text = String(message ?? '');
    const isError = kind === 'alert' && ERROR_WORDS.test(text);
    const danger = opts.danger ?? (kind === 'confirm' && DANGER_WORDS.test(text));

    let kicker = opts.kicker, title = opts.title;
    if (kind === 'prompt') {
        // Short prompts ("Rename conversation:") read best as the title itself.
        title = title || text.replace(/[:?]\s*$/, '').toUpperCase();
        kicker = kicker || 'Input';
    } else if (kind === 'confirm') {
        title = title || (danger ? 'ARE YOU SURE?' : 'PLEASE CONFIRM');
        kicker = kicker || 'Confirmation';
    } else {
        title = title || (isError ? 'SOMETHING WENT WRONG' : 'NOTICE');
        kicker = kicker || (isError ? 'Error' : 'Argus Cyclist');
    }

    els.box.classList.remove('is-bad', 'is-info');
    if (isError || danger) els.box.classList.add('is-bad');
    else if (kind === 'alert') els.box.classList.add('is-info');

    els.kicker.textContent = kicker;
    els.title.textContent = title;
    els.msg.textContent = kind === 'prompt' ? (opts.hint || '') : text;
    els.msg.hidden = !els.msg.textContent;
    els.input.hidden = kind !== 'prompt';
    els.input.value = kind === 'prompt' ? (opts.defaultValue ?? '') : '';
    els.cancel.hidden = kind === 'alert';
    els.cancel.textContent = opts.cancelLabel || 'Cancel';
    els.ok.textContent = opts.okLabel || (kind === 'alert' ? 'OK' : danger ? 'YES, CONTINUE' : 'CONFIRM');
    els.ok.className = danger ? 'ar-btn-danger ar-dialog-danger' : 'ar-btn-primary';

    current.returnFocus = document.activeElement;
    root.classList.add('active');
    // Destructive questions start on Cancel, so a stray Enter never deletes anything.
    const focusEl = kind === 'prompt' ? els.input : danger ? els.cancel : els.ok;
    requestAnimationFrame(() => focusEl.focus());
}

function open(kind, message, opts = {}) {
    return new Promise((resolve) => {
        queue.push({ kind, message, opts, resolve });
        showNext();
    });
}

/** Message with an OK button. Resolves when it is dismissed. */
export function arAlert(message, opts) { return open('alert', message, opts); }

/** Yes / no question. Resolves true when confirmed. Destructive wording gets a red button. */
export function arConfirm(message, opts) { return open('confirm', message, opts); }

/** Text input. Resolves the typed text, or null when cancelled. */
export function arPrompt(message, defaultValue = '', opts = {}) {
    return open('prompt', message, { ...opts, defaultValue });
}

// Inline HTML handlers (onclick="...") reach them through window.
window.arAlert = arAlert;
window.arConfirm = arConfirm;
window.arPrompt = arPrompt;
