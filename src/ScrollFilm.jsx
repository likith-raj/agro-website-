import React, { useEffect, useRef, useState } from 'react';

const base = import.meta.env.BASE_URL;
const pad = n => String(n).padStart(3, '0');

function loadOrder(count) {
  const seen = new Set(), order = [];
  for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
  if (!seen.has(count - 1)) order.splice(1, 0, count - 1);
  return order;
}

function Chapter({ chapter, active }) {
  return <div className={`film-chapter pos-${chapter.pos || 'left'}`} data-active={active} aria-hidden={!active} inert={!active}>
    {chapter.eyebrow && <div className="film-eyebrow">{chapter.eyebrow}</div>}
    {chapter.lines && <h2 className="film-title">{chapter.lines.map((line, i) => <span key={i} className="film-line"><span style={{ transitionDelay: `${i * 90}ms` }}>{line}</span></span>)}</h2>}
    {chapter.text && <p className="film-text">{chapter.text}</p>}
    {chapter.extra}
  </div>;
}

export function ScrollFilm({ id, dir, count, heightVh, portraitVisible = 0.7, label, note, chapters, callouts = [], reduced, still = { frame: 0, chapter: 0 } }) {
  const wrap = useRef(null);
  const stage = useRef(null);
  const canvas = useRef(null);
  const counter = useRef(null);
  const [chapter, setChapter] = useState(reduced ? still.chapter : 0);
  const [shown, setShown] = useState(reduced ? callouts.length : 0);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    setLoaded(0);
    setChapter(reduced ? still.chapter : 0);
    setShown(reduced ? callouts.length : 0);
    const frames = new Array(count);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const folder = mobile ? `${dir}-mobile` : dir;
    let started = false, cancelled = false, raf = 0, near = false, current = reduced ? still.frame : 0, drawn = '', size = '', done = 0;
    let lastChapter = -1, lastShown = -1, lastTime = null;

    function nearest(i) {
      for (let d = 0; d < count; d++) {
        if (frames[i - d]) return i - d;
        if (frames[i + d]) return i + d;
      }
      return -1;
    }
    function draw(force) {
      const c = canvas.current;
      const want = Math.max(0, Math.min(count - 1, current));
      const lower = Math.floor(want), upper = Math.min(count - 1, lower + 1);
      const blending = frames[lower] && frames[upper] && lower !== upper;
      const pick = blending ? lower : nearest(Math.round(want));
      if (pick < 0) return;
      const blend = blending ? want - lower : 0;
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const key = `${w}x${h}x${dpr}`, drawKey = `${pick}:${blend.toFixed(3)}`;
      if (!force && drawKey === drawn && key === size) return;
      if (key !== size) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); size = key; }
      const img = frames[pick], iw = img.naturalWidth, ih = img.naturalHeight;
      const s = h > w ? w / (iw * portraitVisible) : Math.max(w / iw, h / ih);
      const dw = iw * s, dh = ih * s, dx = (w - dw) / 2, dy = h > w ? h * 0.44 - dh / 2 : (h - dh) / 2;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx * dpr, dy * dpr, dw * dpr, dh * dpr);
      if (blend > 0) {
        ctx.globalAlpha = blend;
        ctx.drawImage(frames[upper], dx * dpr, dy * dpr, dw * dpr, dh * dpr);
        ctx.globalAlpha = 1;
      }
      const st = stage.current.style;
      st.setProperty('--fx', `${dx}px`); st.setProperty('--fy', `${dy}px`); st.setProperty('--fw', `${dw}px`); st.setProperty('--fh', `${dh}px`);
      drawn = drawKey;
      if (counter.current) counter.current.textContent = `FRAME ${pad(Math.round(want) + 1)} / ${pad(count)}`;
    }
    function progress() {
      const r = wrap.current.getBoundingClientRect();
      const span = wrap.current.offsetHeight - window.innerHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    }
    function tick(time) {
      raf = 0;
      if (cancelled || !near || document.hidden) { lastTime = null; return; }
      const target = progress() * (count - 1);
      const dt = lastTime === null ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      current += (target - current) * (1 - Math.exp(-dt / 0.14));
      if (Math.abs(target - current) < 0.015) current = target;
      const p = current / (count - 1);
      stage.current.style.setProperty('--p', p.toFixed(4));
      draw(false);
      const ch = chapters.findIndex(c => p >= c.start && p <= c.end);
      if (ch !== lastChapter) { lastChapter = ch; setChapter(ch); }
      const vis = callouts.filter(c => p >= c.at).length;
      if (vis !== lastShown) { lastShown = vis; setShown(vis); }
      if (current !== target) raf = requestAnimationFrame(tick);
      else lastTime = null;
    }
    function sync() {
      if (!near || reduced || document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        lastTime = null;
      } else if (!raf) raf = requestAnimationFrame(tick);
    }
    async function load() {
      const order = reduced ? [still.frame] : loadOrder(count);
      let next = 0;
      async function worker() {
        while (!cancelled && next < order.length) {
          const i = order[next++];
          const img = new Image();
          img.decoding = 'async';
          img.src = `${base}frames/${folder}/f_${pad(i)}.webp`;
          try { await img.decode(); } catch { continue; }
          if (cancelled) return;
          frames[i] = img;
          done++;
          if (done % 8 === 0 || done === count) setLoaded(done);
          if (reduced ? i === still.frame : nearest(Math.round(current)) === i) draw(true);
        }
      }
      await Promise.all(Array.from({ length: 3 }, worker));
      if (!cancelled) setLoaded(done);
    }
    const io = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting;
      if (near && !started) { started = true; load(); }
      sync();
    }, { rootMargin: '150% 0px' });
    io.observe(wrap.current);
    window.addEventListener('scroll', sync, { passive: true });
    document.addEventListener('visibilitychange', sync);
    const ro = new ResizeObserver(() => { draw(true); sync(); });
    ro.observe(canvas.current);
    return () => {
      cancelled = true;
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [dir, count, reduced]);

  const busy = loaded < (reduced ? 1 : Math.min(count, 13));
  const latest = callouts[shown - 1];
  return <section id={id} ref={wrap} className={`film ${reduced ? 'film-static' : ''}`} style={{ '--film-h': `${heightVh}vh` }} aria-label={label}>
    <div ref={stage} className="film-stage" aria-busy={busy}>
      <canvas ref={canvas} className="film-canvas" role="img" aria-label={note} />
      <div className="film-shade" aria-hidden="true" />
      <div className="film-hud film-hud-top" aria-hidden="true"><span>{label}</span><span>{note}</span></div>
      {chapters.map((c, i) => <Chapter key={i} chapter={c} active={i === chapter} />)}
      {callouts.map((c, i) => <div key={c.title} className={`film-callout side-${c.side || 'right'}`} data-on={i < shown} style={{ '--x': c.x / 100, '--y': c.y / 100 }} aria-hidden={i >= shown}>
        <span className="callout-dot" /><span className="callout-rule" />
        <div className="callout-box"><strong>{pad(i + 1).slice(1)} · {c.title}</strong><p>{c.text}</p></div>
      </div>)}
      {latest && <div className="film-callout-mobile" aria-hidden="true"><strong>{pad(shown).slice(1)} · {latest.title}</strong><p>{latest.text}</p></div>}
      <div className="film-hud film-hud-bottom" aria-hidden="true">
        <span ref={counter}>FRAME 001 / {pad(count)}</span>
        <span className="film-progress"><i /></span>
        <span>{busy ? `LOADING ${Math.round(loaded / count * 100)}%` : 'SCROLL'}</span>
      </div>
    </div>
  </section>;
}

export function CombinedFilm({ reduced }) {
  const wrap = useRef(null);
  const stage = useRef(null);
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = ref.current;
    let frame = 0, near = false, lastTime = null;
    video.pause();
    if (reduced) return;
    const progress = () => {
      const bounds = wrap.current.getBoundingClientRect();
      const span = wrap.current.offsetHeight - stage.current.offsetHeight;
      return span > 0 ? Math.max(0, Math.min(1, -bounds.top / span)) : 0;
    };
    const tick = time => {
      frame = 0;
      if (!near || document.hidden || video.readyState < 2 || video.seeking || !Number.isFinite(video.duration)) return;
      const target = progress() * Math.max(0, video.duration - 1 / 30);
      const dt = lastTime === null ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      const difference = target - video.currentTime;
      if (Math.abs(difference) > 0.025) {
        video.currentTime += difference * (1 - Math.exp(-dt / 0.1));
      } else {
        if (Math.abs(difference) > 0.002) video.currentTime = target;
        lastTime = null;
      }
    };
    const sync = () => {
      if (!near || document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = null;
      } else if (!frame) frame = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting;
      if (near && !video.getAttribute('src')) {
        video.preload = 'auto';
        video.src = `${base}media/drone-combined.mp4`;
      }
      sync();
    }, { rootMargin: '100% 0px' });
    io.observe(wrap.current);
    const ro = new ResizeObserver(sync);
    ro.observe(stage.current);
    window.addEventListener('scroll', sync, { passive: true });
    document.addEventListener('visibilitychange', sync);
    video.addEventListener('loadeddata', sync);
    video.addEventListener('seeked', sync);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', sync);
      document.removeEventListener('visibilitychange', sync);
      video.removeEventListener('loadeddata', sync);
      video.removeEventListener('seeked', sync);
      video.pause();
    };
  }, [reduced]);
  return <section id="flight" ref={wrap} className={`combined-film ${reduced ? 'combined-static' : ''}`} aria-label="Scroll-driven drone sequence"><div ref={stage} className="combined-sticky"><div className="section-shell"><div className="section-heading"><div><div className="eyebrow">PRECISION / IN MOTION</div><h2>Move with the moment.<br /><span>At your own pace.</span></h2></div><p>{reduced ? 'A still view of the supplied concept drone sequence.' : 'A concept drone sequence. Scroll down to advance, and back up to retrace.'}</p></div>
    <div className="combined-stage"><video ref={ref} className="combined-video" muted playsInline preload="none" poster={`${base}media/drone-combined-poster.webp`} aria-label="Concept drone movement controlled by scrolling, not a specific DJI product" onError={() => setFailed(true)} /></div>
    {failed && <p role="status">The sequence could not load. The product showroom remains available.</p>}
  </div></div></section>;
}
