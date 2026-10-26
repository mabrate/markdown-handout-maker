/* A temporary, read-only view of the rendered handout. */
(function (root) {
  'use strict';
  root.HandoutPresentation = { mount };

  function mount({ source, preview, previewPanel, prepare, hideTools }) {
    const trigger = document.querySelector('#present-handout');
    let session = null, restoreLocation = null, finishing = false;
    const originals = () => [...preview.children];
    const headingHeight = () => document.querySelector('.preview-heading').offsetHeight;

    function place(scroller, frames, inset = 0) {
      const top = scroller.getBoundingClientRect().top + inset;
      const index = frames.findIndex(frame => frame.getBoundingClientRect().bottom > top);
      const frame = frames[Math.max(0, index)];
      if (!frame) return { index: 0, fraction: 0 };
      const box = frame.getBoundingClientRect();
      return { index: Math.max(0, index), fraction: Math.max(0, (top - box.top) / box.height) };
    }

    function reveal(scroller, frames, location, inset = 0) {
      const frame = frames[Math.min(location.index, frames.length - 1)];
      if (!frame) return;
      const box = frame.getBoundingClientRect();
      scroller.scrollTop += box.top - scroller.getBoundingClientRect().top - inset + location.fraction * box.height;
    }

    function restorePreview() {
      if (!session && restoreLocation) reveal(previewPanel, originals(), restoreLocation, headingHeight());
    }
    new ResizeObserver(restorePreview).observe(previewPanel);
    for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown']) previewPanel.addEventListener(event, () => { restoreLocation = null; }, { passive: true });

    function stop() {
      if (!session) return;
      session.location = place(session.viewport, session.frames);
      session.dialog.close();
    }

    function present() {
      if (session || finishing || trigger.hidden || source.disabled) return;
      prepare();
      hideTools();
      restoreLocation = null;
      const start = place(previewPanel, originals(), headingHeight());
      const editorState = { start: source.selectionStart, end: source.selectionEnd, direction: source.selectionDirection, top: source.scrollTop, left: source.scrollLeft };
      const dialog = document.createElement('dialog');
      dialog.className = 'handout-presentation';
      dialog.setAttribute('aria-label', 'Handout presentation');
      dialog.setAttribute('aria-description', 'Scroll or use arrow keys and Page Up or Page Down. Escape returns to editing.');
      dialog.innerHTML = '<div class="handout-presentation-toolbar" role="toolbar" aria-label="Presentation controls"><span class="handout-presentation-title">Handout</span><button type="button" data-action="out" aria-label="Zoom out">−</button><output aria-label="Presentation zoom"></output><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fit">Fit width</button><button type="button" data-action="exit">Exit presentation <span aria-hidden="true">(Esc)</span></button></div><div class="handout-presentation-viewport" tabindex="0" role="region" aria-label="Presented handout"><div class="handout-presentation-pages"></div></div>';
      const viewport = dialog.querySelector('.handout-presentation-viewport');
      const pages = dialog.querySelector('.handout-presentation-pages');
      const frames = originals().map(original => {
        const page = (original.classList.contains('sheet-preview-frame') ? original.firstElementChild : original).cloneNode(true);
        for (const node of [page, ...page.querySelectorAll('[id]')]) {
          if (node.id) { node.dataset.presentationAnchor = node.id; node.removeAttribute('id'); }
        }
        for (const warning of page.querySelectorAll('.oversize-warning')) warning.classList.remove('oversize-warning');
        const frame = document.createElement('div'); frame.className = 'handout-presentation-frame'; frame.append(page); pages.append(frame);
        return frame;
      });
      document.body.append(dialog);
      document.body.classList.add('handout-presenting');
      dialog.showModal();
      const current = { dialog, viewport, source: source.value, frames, scale: 1, fit: true, location: start };
      session = current;
      let enteredFullscreen = false;
      let nativeTask;
      window.HandoutVideo.stop(preview);

      function fit(location = place(viewport, frames)) {
        if (session !== current) return;
        const width = Math.max(...frames.map(frame => frame.firstElementChild.offsetWidth), 1);
        if (current.fit) current.scale = Math.max(.2, Math.min(4, (viewport.clientWidth - 48) / width));
        for (const frame of frames) {
          const page = frame.firstElementChild;
          frame.style.width = `${page.offsetWidth * current.scale}px`;
          frame.style.height = `${page.offsetHeight * current.scale}px`;
          page.style.transform = `scale(${current.scale})`;
        }
        dialog.querySelector('output').textContent = `${Math.round(current.scale * 100)}%`;
        dialog.querySelector('[data-action="out"]').disabled = current.scale <= .2;
        dialog.querySelector('[data-action="in"]').disabled = current.scale >= 4;
        reveal(viewport, frames, location);
        current.location = place(viewport, frames);
      }
      const observer = new ResizeObserver(() => fit()); observer.observe(viewport);
      viewport.addEventListener('scroll', () => { if (dialog.open) current.location = place(viewport, frames); });
      pages.addEventListener('load', () => fit(), true);
      dialog.querySelector('.handout-presentation-toolbar').addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action;
        if (action === 'exit') return stop();
        if (!['fit', 'in', 'out'].includes(action)) return;
        current.fit = action === 'fit';
        current.scale = Math.max(.2, Math.min(4, current.scale * (action === 'in' ? 1.2 : 1 / 1.2)));
        fit();
      });
      dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); stop(); return; }
        if (event.target.closest('.video-player')) return;
        const deltas = { ArrowDown: 60, ArrowUp: -60, PageDown: viewport.clientHeight * .9, PageUp: -viewport.clientHeight * .9 };
        if (Object.hasOwn(deltas, event.key)) { event.preventDefault(); viewport.scrollBy(0, deltas[event.key]); }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); viewport.scrollTop = event.key === 'Home' ? 0 : viewport.scrollHeight; }
      });
      dialog.addEventListener('click', event => {
        if (event.target.closest('.video-player')) { window.HandoutVideo.activate(event); return; }
        const link = event.target.closest('a[href]');
        if (!link) return;
        event.preventDefault();
        const href = link.getAttribute('href');
        if (href.startsWith('#')) {
          let anchor; try { anchor = decodeURIComponent(href.slice(1)); } catch { return; }
          const target = [...pages.querySelectorAll('[data-presentation-anchor]')].find(node => node.dataset.presentationAnchor === anchor);
          if (target) viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
        } else if ((event.ctrlKey || event.metaKey) && /^https?:/i.test(link.href)) {
          window.handoutDesktop?.openWebLink?.(link.href)?.catch(() => {});
        }
      });
      const onFullscreen = () => { if (enteredFullscreen && !document.fullscreenElement) stop(); else fit(); };
      document.addEventListener('fullscreenchange', onFullscreen);
      dialog.addEventListener('cancel', event => { event.preventDefault(); stop(); });
      dialog.addEventListener('close', () => {
        observer.disconnect(); document.removeEventListener('fullscreenchange', onFullscreen);
        restoreLocation = current.location;
        session = null;
        window.HandoutVideo.stop(dialog); dialog.remove(); document.body.classList.remove('handout-presenting');
        source.setSelectionRange(editorState.start, editorState.end, editorState.direction);
        source.scrollTop = editorState.top; source.scrollLeft = editorState.left;
        trigger.focus({ preventScroll: true });
        restorePreview(); requestAnimationFrame(restorePreview);
        const cleanup = nativeTask ? nativeTask.then(() => window.handoutDesktop.setPresentation(false))
          : enteredFullscreen && document.fullscreenElement ? document.exitFullscreen() : Promise.resolve();
        finishing = true; trigger.disabled = true;
        cleanup.catch(() => {}).then(() => { finishing = false; trigger.disabled = source.disabled; restorePreview(); });
      }, { once: true });
      fit(start); viewport.focus({ preventScroll: true });
      if (window.handoutDesktop?.setPresentation) {
        nativeTask = window.handoutDesktop.setPresentation(true);
        nativeTask.then(() => fit()).catch(() => { /* The preview remains usable in the app window. */ });
      } else if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().then(() => {
          enteredFullscreen = true;
          if (session === current) fit(); else document.exitFullscreen().catch(() => {});
        }).catch(() => { /* Fullscreen may be unavailable in a browser preview. */ });
      }
    }

    trigger.addEventListener('click', present);
    return {
      present, stop, get active() { return !!session; },
      sync(handout) {
        trigger.hidden = !handout;
        trigger.disabled = source.disabled || finishing;
        if (session && (!handout || session.source !== source.value)) stop();
        if (!session) restoreLocation = null;
      }
    };
  }
})(window);
