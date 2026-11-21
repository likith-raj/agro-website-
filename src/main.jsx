import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { products, contact } from './products';
import { products as inventory } from './catalogue';
import field from './assets/field.jpg';
import { ScrollFilm, CombinedFilm } from './ScrollFilm';
import './shaders/threeui.css';
import './styles.css';
import './threeuiIntegration.css';

const LazyDroneViewer = lazy(() => import('./DroneViewer'));
const LazyGlobe = lazy(() => import('./Globe'));
const LazyAshenPress = lazy(() => import('./shaders/ashen-press/AshenPress').then(module => ({ default: module.AshenPress })));
const LazyThreeDPaper = lazy(() => import('./shaders/3d-paper/ThreeDPaper').then(module => ({ default: module.ThreeDPaper })));

function useVisible() {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setMounted(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, mounted];
}

function Deferred({ children, fallback, className }) {
  const [ref, mounted] = useVisible();
  return <div ref={ref} className={className}>{mounted ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}</div>;
}

function DroneViewer(props) {
  const fallback = <div className="drone-stage viewer-pending" data-product={props.product.id} aria-busy="true"><div className="viewer-loading" role="status" aria-label={`Loading ${props.product.name} 3D view`}>{props.hero ? <span className="loading-arc" aria-hidden="true" /> : <div className="viewer-skeleton" aria-hidden="true"><span /><span /><span /></div>}</div></div>;
  return <Deferred fallback={fallback}><LazyDroneViewer {...props} /></Deferred>;
}

function Icon({ name = 'arrow', size = 20, className = '' }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    diagonal: <path d="M6 18 18 6M6 6h12v12" />,
    down: <path d="M12 4v16m-6-6 6 6 6-6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    home: <><path d="m3 10 9-7 9 7v11H3Z" /><path d="M9 21v-8h6v8" /></>,
    shelf: <><path d="M3 3v18m18-18v18M3 10h18M3 20h18M7 4v6m5-6v6m5 4v6" /></>,
    grip: <><circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    rotate: <path d="M20 8a8 8 0 1 0 .4 7M20 3v5h-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    cog: <><path d="m12 2 2 3 4-.2.2 4L22 12l-3.6 3.2-.2 4-4-.2-2.2 3-2.2-3-4 .2-.2-4L2 12l3.6-3.2.2-4 4 .2Z" /><circle cx="12" cy="12" r="3" /></>,
    layers: <><path d="m3 8 9-5 9 5-9 5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    chart: <><path d="M4 3v17h17M8 15l4-6 4 3 5-7" /></>,
    chat: <path d="M21 11c0 5-4 8-9 8-2 0-4-.5-5-1.5L3 20l1.5-5C3.5 14 3 12.5 3 11c0-5 4-8 9-8s9 3 9 8Z" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name] || paths.arrow}</svg>;
}

function Brand({ footer = false }) {
  return <a href="#home" className={`brand ${footer ? 'brand-footer' : ''}`} aria-label="Agro Drone Tech home">
    <svg aria-hidden="true" viewBox="0 0 44 44" className="brand-mark"><path d="M5 34 22 5l17 29H29l-7-13-7 13Z" fill="currentColor" /><path d="m13 39 9-15 9 15h-7l-2-4-2 4Z" fill="currentColor" /></svg>
    <span className="brand-word">AGRO<span>DRONE TECH</span></span>
  </a>;
}

function Reveal({ children, className = '', delay = 0, hidden }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} hidden={hidden} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function PhotoStage({ product, paused, reduced, hero = false, bare = false }) {
  const plane = useRef();
  const drag = useRef(null);
  const [spin, setSpin] = useState(0);
  const [turned, setTurned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loadedImage, setLoadedImage] = useState(null);
  const [failedImage, setFailedImage] = useState(null);
  const image = turned && product.alternate ? product.alternate : product.image;
  const loading = loadedImage !== image && failedImage !== image;
  useEffect(() => { setTurned(false); setSpin(0); if (plane.current) plane.current.style.transform = ''; }, [product.id]);
  function start(e) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function move(e) {
    if (!drag.current) return;
    const x = Math.max(-45, Math.min(45, (e.clientX - drag.current.x) * 0.35));
    const y = Math.max(-20, Math.min(20, (e.clientY - drag.current.y) * -0.2));
    plane.current.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
  }
  function end() { drag.current = null; setDragging(false); if (plane.current) plane.current.style.transform = ''; }
  const stage = <div className={`photo-stage ${dragging ? 'dragging' : ''} ${loading ? 'viewer-pending' : ''}`} aria-busy={loading} aria-label={`${product.brand} ${product.name}, real manufacturer image; drag to tilt the photo`} onPointerDown={loading ? undefined : start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="photo-float" style={{ animationPlayState: paused || reduced || dragging ? 'paused' : 'running' }}>
        <div className="photo-auto-rotate"><div ref={plane} className="photo-plane">
          <motion.img key={`${product.id}-${turned}`} src={image} alt={`${product.brand} ${product.name}`} draggable="false" onLoad={() => setLoadedImage(image)} onError={() => setFailedImage(image)} style={{ visibility: failedImage === image ? 'hidden' : undefined }} initial={{ opacity: 0 }} animate={{ opacity: loading ? 0 : 1, rotateY: spin * 360 }} transition={{ opacity: { duration: reduced ? 0 : .35 }, rotateY: { duration: reduced ? 0 : 1.8, ease: [0.4, 0, 0.2, 1] } }} />
        </div></div>
      </div>
      <div className="viewer-loading" role={loading ? 'status' : undefined} aria-label={loading ? `Loading ${product.name} photo` : undefined} aria-hidden={!loading}><div className="viewer-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
      {failedImage === image && <span className="viewer-error" role="status">Photo unavailable. View the published specifications below.</span>}
    </div>;
  if (bare) return stage;
  return <div className={`product-visual ${hero ? 'hero-visual' : ''}`}>
    {stage}
    {!hero && <div className="photo-tools"><span>Real product photo</span><div>{product.alternate && <button type="button" onClick={() => setTurned(!turned)} aria-label={`Change ${product.name} photo angle`} title="Another manufacturer photo">{turned ? 'Front' : 'Angle'}</button>}<button type="button" onClick={() => setSpin(spin + 1)} title="Rotate the photo 360 degrees"><Icon name="rotate" size={16} /> Spin photo</button></div></div>}
  </div>;
}

function ProductVisual({ product, paused, reduced }) {
  const [mode, setMode] = useState('3d');
  return <div className="product-visual">
    {mode === '3d' ? <DroneViewer product={product} paused={paused} reduced={reduced} /> : <PhotoStage product={product} paused={paused} reduced={reduced} bare />}
    <div className="photo-tools"><span>{mode === '3d' ? 'Drag to rotate 360°' : 'Real product photo'}</span><div className="view-toggle" role="group" aria-label={`${product.name} view`}><button type="button" aria-pressed={mode === '3d'} className={mode === '3d' ? 'selected' : ''} onClick={() => setMode('3d')}><Icon name="rotate" size={15} /> 3D model</button><button type="button" aria-pressed={mode === 'photo'} className={mode === 'photo' ? 'selected' : ''} onClick={() => setMode('photo')}>Real photo</button></div></div>
  </div>;
}

const pages = [
  ['home', 'Home', 'home'], ['shelf', 'Shelf', 'shelf'], ['products', 'Products', 'layers'],
  ['about', 'About', 'chat'], ['contact', 'Contact', 'mail'],
];
const currentPage = () => pages.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'home';

function Header({ onInquiry, active }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const scroll = () => setHidden(scrollY > 24);
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, [active]);
  return <header className={`header-wrap ${hidden ? 'is-hidden' : ''}`} inert={hidden}><div className="header-pill"><Brand />
    <div className="header-actions"><button className="btn btn-small" onClick={() => onInquiry()}>Let's talk <Icon name="diagonal" size={16} /></button></div>
  </div></header>;
}

function SmartMenu({ active, reduced }) {
  const box = useRef(null);
  const drag = useRef(null);
  const [position, setPosition] = useState(null);
  const [hidden, setHidden] = useState(false);
  const clampPosition = (x, y) => {
    const rect = box.current.getBoundingClientRect();
    return { x: Math.max(8, Math.min(innerWidth - rect.width - 8, x)), y: Math.max(8, Math.min(innerHeight - rect.height - 8, y)) };
  };
  useEffect(() => {
    let last = scrollY;
    const scroll = () => {
      const delta = scrollY - last;
      if (scrollY <= 24) setHidden(false);
      else if (Math.abs(delta) < 8) return;
      else if (!drag.current && !box.current.querySelector(':focus-visible')) setHidden(delta > 0 && scrollY > 80);
      last = scrollY;
    };
    const resize = () => {
      setPosition(p => p && clampPosition(p.x, p.y));
      setHidden(false);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('scroll', scroll); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => setHidden(false), [active]);
  function start(e) {
    if (!e.isPrimary || e.button !== 0) return;
    const rect = box.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPosition({ x: rect.left, y: rect.top });
    setHidden(false);
  }
  function move(e) {
    if (!drag.current) return;
    const d = drag.current;
    setPosition(clampPosition(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
  }
  function end() { drag.current = null; }
  function keyboard(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') { setPosition(null); return; }
    const rect = box.current.getBoundingClientRect();
    setPosition(clampPosition(rect.left + (e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0), rect.top + (e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0)));
  }
  return <><nav ref={box} className={`right-menu-box ${hidden ? 'is-hidden' : ''}`} inert={hidden} aria-label="Page shortcuts" data-reduced={!!reduced} data-positioned={!!position} style={position ? { left: position.x, top: position.y, right: 'auto' } : undefined}>
    <button type="button" className="menu-grip" aria-label="Move menu with drag or arrow keys. Home resets its position." onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={keyboard}><Icon name="grip" size={18} /></button>
    {pages.map(([id, label, icon]) => <a key={id} href={`#${id}`} className="menu-icon-wrapper" aria-label={label} aria-current={active === id ? 'page' : undefined}><span className="menu-label">{label}</span><span className="icon-btn"><Icon name={icon} size={18} /></span></a>)}
  </nav>{hidden && <button type="button" className="menu-reopen" onClick={() => setHidden(false)} aria-label="Show page menu"><Icon name="menu" size={16} /><span>Menu</span></button>}</>;
}

function PageIntro({ title, text, label }) {
  return <div className="page-intro section-shell"><div className="eyebrow">{label}</div><h1>{title}</h1><p>{text}</p></div>;
}

function Hero() {
  return <section id="home" className="hero section-shell">
    <div className="hero-haze" aria-hidden="true" />
    <div className="hero-grid"><div className="hero-copy"><div className="eyebrow"><span className="accent-dot" /> PRECISION AGRICULTURE. REAL HARDWARE.</div><h1>Built for the field.<br /><span>Ready for what's next.</span></h1><p>Smarter flights. Stronger harvests. Explore agricultural drone systems that bring precision to every acre.</p><div className="hero-buttons"><a className="btn" href="#products">Explore the products <Icon /></a><a className="text-link" href="#about">Meet Agro Drone Tech <Icon name="diagonal" size={17} /></a></div>
      <div className="hero-micro"><span>SPRAYING</span><span>SPREADING</span><span>CROP INTELLIGENCE</span></div>
    </div></div>
    <div className="hero-bottom"><a href="#products" className="scroll-link"><Icon name="down" size={16} /> Discover the range</a><p>Purpose-built systems. Field-first thinking.</p><span className="edition">2026 COLLECTION</span></div>
  </section>;
}

const anatomyCallouts = [
  { at: 0.5, x: 50, y: 15, side: 'right', title: 'Airframe', text: 'Shell and frame. Protection with serviceable access.' },
  { at: 0.58, x: 55, y: 31, side: 'right', title: 'Flight control', text: 'Controller and wiring that keep every input in sync.' },
  { at: 0.66, x: 24, y: 39, side: 'left', title: 'Propulsion', text: 'Motors and propellers matched to airframe and payload.' },
  { at: 0.74, x: 34, y: 64, side: 'left', title: 'Sensing', text: 'Cameras and sensors for imaging and obstacle awareness.' },
  { at: 0.82, x: 55, y: 68, side: 'right', title: 'Power', text: 'Intelligent batteries, planned around repeated field cycles.' },
];
function AnatomyFilm({ reduced, onInquiry }) {
  const chapters = [
    { start: 0, end: 0.3, pos: 'left', eyebrow: 'LOOK CLOSER', lines: ['Every part', 'matters.'], text: 'Propulsion, power, sensing and control. Scroll to take it apart.' },
    { start: 0.9, end: 1, pos: 'bottom', extra: <div className="film-cta"><p className="film-text">Compatibility and maintenance are part of the conversation.</p><button type="button" className="text-link" onClick={() => onInquiry()}>Ask about parts & compatibility <Icon name="diagonal" size={17} /></button></div> },
  ];
  return <ScrollFilm id="anatomy" dir="anatomy" count={97} heightVh={320} portraitVisible={0.78} label="SEQ 02 · ANATOMY" note="Concept illustration · not an Agras or Mavic teardown" chapters={chapters} callouts={anatomyCallouts} reduced={reduced} still={{ frame: 96, chapter: 1 }} />;
}

const filters = [['all', 'All'], ['spraying', 'Spraying'], ['spreading', 'Spreading'], ['intelligence', 'Crop intelligence']];
const MAX_COMPARE = 3;

function Catalogue({ onDetails, onInquiry, paused, reduced, compare, onToggleCompare }) {
  const [filter, setFilter] = useState('all');
  const matches = p => filter === 'all' || p.uses.includes(filter);
  const shown = products.filter(matches).length;
  const label = filters.find(([id]) => id === filter)[1];
  return <section id="products" className="catalogue section-shell"><Reveal className="section-heading"><div><div className="eyebrow">01 / THE HARDWARE</div><h2>Three systems.<br /><span>One smarter field.</span></h2></div><p>From precision application to crop intelligence. Find the platform that fits the way you work.</p></Reveal>
    <div className="catalogue-tools"><div className="filter-chips" role="group" aria-label="Filter products by use">{filters.map(([id, text]) => <button key={id} type="button" className="filter-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{text}<span className="chip-count" aria-hidden="true">{id === 'all' ? products.length : products.filter(p => p.uses.includes(id)).length}</span></button>)}</div><p className="filter-status" role="status">Showing {shown} of {products.length} systems{filter === 'all' ? '' : ` · ${label}`}</p></div>
    {shown === 0 && <div className="filter-empty"><p>No systems are listed for {label} yet.</p><button type="button" className="text-link" onClick={() => setFilter('all')}>Show all systems <Icon name="arrow" size={16} /></button></div>}
    <div className="product-grid">{products.map((p, i) => { const selected = compare.includes(p.id); return <Reveal key={p.id} delay={i * .1} className="product-card" hidden={!matches(p)}><div className="product-top"><span>{p.category}</span><div className="product-top-actions"><button type="button" className={`compare-toggle ${selected ? 'selected' : ''}`} aria-pressed={selected} aria-label={`Compare ${p.brand} ${p.name}`} disabled={!selected && compare.length >= MAX_COMPARE} onClick={() => onToggleCompare(p.id)}><span className="compare-box" aria-hidden="true">{selected && <Icon name="check" size={12} />}</span>Compare</button><span className="product-number">{p.number}</span></div></div><ProductVisual product={p} paused={paused} reduced={reduced} /><div className="product-copy"><div className="eyebrow product-brand">{p.brand}</div><h3>{p.name}</h3><p>{p.short}</p><div className="product-specs">{p.highlights.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="product-buttons"><button className="text-link" onClick={() => onDetails(p)}>View details <Icon name="diagonal" size={17} /></button><button className="inquire-button" onClick={() => onInquiry(p.id)} aria-label={`Inquire about ${p.name}`}><Icon name="chat" size={17} /> Inquire</button></div></div></Reveal>; })}</div>
    <Reveal className="catalogue-note"><span className="accent-dot" /><p>Interactive 3D illustrations modelled from manufacturer photos and published proportions—not factory CAD scans. Switch to the real product photo any time. Published specifications, one click away.</p></Reveal>
  </section>;
}

function CompareBar({ ids, onOpen, onRemove, onClear }) {
  if (!ids.length) return null;
  return <div className="compare-bar" role="region" aria-label="Product comparison">
    <div className="compare-bar-items"><span className="compare-bar-count">{ids.length}/{MAX_COMPARE}</span>{ids.map(id => products.find(p => p.id === id)).map(p => <button key={p.id} type="button" className="compare-chip" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name} from comparison`}>{p.name}<Icon name="close" size={14} /></button>)}</div>
    <div className="compare-bar-actions"><button type="button" className="compare-clear" onClick={onClear}>Clear</button><button type="button" className="btn btn-small" onClick={onOpen} disabled={ids.length < 2}>{ids.length < 2 ? 'Add one more' : `Compare ${ids.length}`}<Icon name="arrow" size={16} /></button></div>
  </div>;
}

function compareRows(items) {
  const entries = items.map(p => [...p.specs, ...(p.compareExtra || [])]);
  const labels = [...new Set(entries.flat().map(([label]) => label))];
  return labels.map(label => {
    const values = entries.map(list => list.find(([l]) => l === label)?.[1] ?? null);
    return { label, values, differs: new Set(values).size > 1 };
  });
}

function CompareDialog({ ids, open, onClose }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const items = products.filter(p => ids.includes(p.id));
  const rows = compareRows(items);
  const differing = rows.filter(row => row.differs).length;
  return <Modal open={open} onClose={onClose} title="Compare systems" className="compare-modal">{open && <>
    <div className="compare-heading"><div className="eyebrow">SIDE BY SIDE</div><h2>Compare systems.<br /><span>Published specifications.</span></h2></div>
    <div className="compare-controls"><button type="button" className="filter-chip" aria-pressed={onlyDifferences} onClick={() => setOnlyDifferences(v => !v)}>Differences only</button><span>{differing} of {rows.length} rows differ</span></div>
    <div className="compare-scroll"><table className="compare-table" style={{ '--cols': items.length }}>
      <caption className="visually-hidden">Specification comparison of {items.map(p => `${p.brand} ${p.name}`).join(', ')}</caption>
      <thead><tr><td className="compare-corner" />{items.map(p => <th key={p.id} scope="col"><img src={p.image} alt="" /><span className="compare-brand">{p.brand}</span><strong>{p.name}</strong><span className="compare-category">{p.category}</span></th>)}</tr></thead>
      <tbody>{rows.filter(row => !onlyDifferences || row.differs).map(row => <tr key={row.label} className={row.differs ? 'differs' : ''}><th scope="row">{row.label}{row.differs && <span className="diff-tag">Differs</span>}</th>{row.values.map((value, i) => <td key={items[i].id} className={value === null ? 'not-listed' : ''}>{value ?? 'Not listed'}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="compare-note">Figures come from each manufacturer's published specifications. “Not listed” means the figure is not published for that product, not that it is zero. Real-world results vary with configuration and conditions.</p>
    <div className="compare-sources">{items.map(p => <a key={p.id} href={p.source} target="_blank" rel="noreferrer" className="text-link">{p.name} specifications <Icon name="diagonal" size={15} /></a>)}</div>
  </>}</Modal>;
}

const partGroups = {
  t50: [['Application', '40 L spray tank · dual atomizing sprinklers'], ['Propulsion', 'Eight propellers · coaxial twin-rotor layout'], ['Sensing', 'Forward/rear phased-array radar · binocular vision'], ['Power', 'DB1560 · 30,000 mAh']],
  t25: [['Application', '20 L spray tank · dual atomizing sprinklers'], ['Propulsion', 'Four 50-inch propellers'], ['Sensing', 'Radar · binocular vision'], ['Power', 'DB800 · 15,500 mAh']],
  mavic: [['Imaging', '20 MP RGB · four 5 MP multispectral cameras'], ['Positioning', 'Centimeter-level RTK'], ['Spectral bands', 'Green · red · red edge · near infrared'], ['Mission', 'Crop mapping and vegetation-index analysis']],
};
const relatedParts = { t50: ['db1560'], t25: ['db800'], mavic: ['mavicbattery'] };
const inventoryFilters = [['all', 'All'], ['drones', 'Drones'], ['batteries', 'Batteries'], ['parts', 'Parts'], ['controllers', 'Controllers'], ['accessories', 'Accessories']];

function HardwareParts({ onDetails, onInquiry, paused, reduced }) {
  const [id, setId] = useState('t50');
  const product = products.find(p => p.id === id);
  const related = inventory.filter(p => relatedParts[id].includes(p.id));
  return <section className="parts-explorer section-shell" aria-label="Explore drone components"><div className="section-heading"><div><div className="eyebrow">UNDERSTAND THE SYSTEM</div><h2>The drone.<br /><span>And what makes it work.</span></h2></div><p>Rotate the illustration, review each system and find model-specific equipment.</p></div>
    <div className="filter-chips" role="group" aria-label="Choose drone components">{products.map(p => <button key={p.id} type="button" className="filter-chip" aria-pressed={id === p.id} onClick={() => setId(p.id)}>{p.name}</button>)}</div>
    <div className="parts-layout"><div className="parts-model"><DroneViewer product={product} hero paused={paused} reduced={reduced} /><p>3D illustration · not factory CAD. Drag or use arrow keys to rotate.</p></div><div><h3>{product.name} / Core systems</h3><dl className="component-list">{partGroups[id].map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl><div className="related-parts">{related.map(p => <button key={p.id} type="button" onClick={() => onDetails(p)}><img src={p.image} alt="" loading="lazy" /><span>{p.name}<small>{p.fact}</small></span><Icon name="diagonal" size={16} /></button>)}</div><button type="button" className="text-link" onClick={() => onInquiry(id)}>Ask about {product.name} parts <Icon name="diagonal" size={16} /></button><p className="parts-note">These are published system descriptions, not a complete repair-parts list. Confirm exact model and compatibility before ordering.</p></div></div>
  </section>;
}

function AllEquipment({ onDetails }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const additional = inventory.filter(p => !products.some(core => core.id === p.id));
  const shown = additional.filter(p => (category === 'all' || p.shelfCategory === category) && `${p.name} ${p.fact} ${p.note}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="equipment-section section-shell" aria-label="All products and parts"><div className="section-heading"><div><div className="eyebrow">PRODUCTS & PARTS</div><h2>Complete the kit.<br /><span>Know the compatibility.</span></h2></div><p>{inventory.length} published products in the showroom, including the three interactive platforms above. Additional equipment uses real product photography.</p></div><div className="equipment-tools"><div className="filter-chips" role="group" aria-label="Filter all equipment">{inventoryFilters.map(([id, label]) => <button type="button" key={id} className="filter-chip" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><label className="equipment-search">Search equipment<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Battery, aircraft, controller…" /></label></div><p role="status" className="equipment-status">{shown.length} additional items</p><div className="equipment-grid">{shown.map(p => <article key={p.id} className="equipment-card"><button type="button" className="equipment-photo" onClick={() => onDetails(p)} aria-label={`View ${p.name}`}><img src={p.image} alt={p.name} loading="lazy" decoding="async" /></button><div className="eyebrow">{p.shelfCategory}</div><h3>{p.name}</h3><p>{p.fact}</p><small>{p.note}</small><button type="button" className="text-link" onClick={() => onDetails(p)}>Details & compatibility <Icon name="diagonal" size={15} /></button><span className="equipment-price">Enquire for price</span></article>)}</div>{!shown.length && <div className="filter-empty"><p>No equipment matches that search.</p><button type="button" className="text-link" onClick={() => { setCategory('all'); setQuery(''); }}>Show all equipment</button></div>}</section>;
}

function ProductShelf({ paused, reduced, onDetails }) {
  return <section id="shelf" className="shelf-section section-shell"><Reveal className="section-heading"><div><div className="eyebrow">THE FIELD LIBRARY</div><h2>Your next platform.<br /><span>Pick it off the shelf.</span></h2></div><p>Three real systems across ten product-guide editions. Both shelves, fully stocked. Select a cover, turn it, and explore the manufacturer specifications.</p></Reveal><div className="shader-frame shelf-frame" data-lenis-prevent><Deferred className="deferred-scene" fallback={<div className="threeui-background ashen-press" data-state="loading" role="status" aria-label="Loading product shelf" />}><LazyAshenPress paused={paused && !reduced} onProductDetails={id => onDetails(products.find(product => product.id === id))} /></Deferred></div><div className="scene-footnote"><span>Product-guide covers—not physical drone models or books for sale.</span><a className="text-link" href="#products">Compare the hardware <Icon name="diagonal" size={15} /></a></div></section>;
}

function PaperStudy({ paused, reduced }) {
  return <section id="motion" className="paper-section section-shell"><div className="paper-copy"><div className="eyebrow">SALES & COMPLIANCE</div><h2>A clear process.<br /><span>An informed purchase.</span></h2><p>Review product identity, manufacturer specifications, seller documentation and applicable requirements before an order. Drag the guide to explore the process.</p><span className="paper-disclaimer">Process information—not a license, certification or manufacturer authorization.</span></div><div className="shader-frame paper-frame" data-lenis-prevent><Deferred className="deferred-scene" fallback={<div className="threeui-background three-d-paper" data-state="loading" role="status" aria-label="Loading sales and compliance guide" />}><LazyThreeDPaper variant="original" paused={paused && !reduced} /></Deferred></div></section>;
}

const approachItems = [
  { icon: 'layers', title: 'The right platform.', text: 'Choose hardware around your acreage, crop type, payload and daily workflow—not just a specification sheet.' },
  { icon: 'cog', title: 'Every part matters.', text: 'From propulsion and power to application systems. Compatibility and maintenance are part of the conversation.' },
  { icon: 'chart', title: 'A clearer view.', text: 'Connect crop intelligence with application planning. Better information makes more purposeful operations.' },
];
function Approach({ onInquiry }) {
  const [fieldRef, fieldVisible] = useVisible();
  return <section id="approach" className="approach section-shell"><Reveal className="approach-grid"><div ref={fieldRef} className="field-story">{fieldVisible && <img src={field} alt="Agricultural drone spraying a crop field" loading="lazy" decoding="async" />}<div className="field-caption"><span>TECHNOLOGY, GROUNDED.</span><p>The future of agriculture<br />starts in the field.</p></div></div><div className="approach-copy"><div className="eyebrow">02 / OUR APPROACH</div><h2>Not just a drone.<br /><span>A better way to work.</span></h2><p className="section-intro">Agro Drone Tech brings product selection and support planning together. Explore real hardware, understand compatibility, and review the details before your next purchase.</p><div className="approach-list">{approachItems.map(item => <div key={item.title} className="approach-item"><div className="service-icon"><Icon name={item.icon} size={22} /></div><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div><button className="text-link" onClick={() => onInquiry()}>Talk through your requirements <Icon name="diagonal" size={17} /></button></div></Reveal></section>;
}

const topics = [
  ['Product guidance', 'Find the right system for your field.'],
  ['Parts & compatibility', 'Start with your model and the part you need.'],
  ['Field-ready planning', 'Discuss acreage, crops and application goals.'],
];
function Contact({ paused, reduced, onInquiry, preview = false }) {
  const [topic, setTopic] = useState(0);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => setTopic(i => (i + 1) % topics.length), 5000);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  return <section id={preview ? 'home-earth' : 'contact'} className="contact section-shell"><div className="contact-haze" aria-hidden="true" /><Reveal className="contact-grid"><div className="contact-copy"><div className="eyebrow">03 / LET'S CONNECT</div><h2>Big ambitions.<br /><span>Down-to-earth people.</span></h2><p className="section-intro">Connect with our hardworking team. Tell us about your field, your equipment, or the next challenge you want to solve.</p>{preview ? <a className="btn" href="#contact">Visit Contact <Icon name="diagonal" size={18} /></a> : <button className="btn" onClick={() => onInquiry()}>Chat with us <Icon name="diagonal" size={18} /></button>}<div className="contact-rotation" aria-live="off"><AnimatePresence mode="wait"><motion.div key={topic} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: reduced ? 0 : .4 }}><span className="accent-dot" /><div><strong>{topics[topic][0]}</strong><p>{topics[topic][1]}</p></div></motion.div></AnimatePresence><div className="topic-controls">{topics.map((t, i) => <button key={t[0]} aria-label={`Show ${t[0]}`} aria-pressed={i === topic} className={i === topic ? 'selected' : ''} onClick={() => setTopic(i)} />)}</div></div>
      <div className="contact-meta"><span>{contact.location} · Agricultural technology</span>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span>Direct contact details coming soon</span>}</div>
    </div><div className="earth-wrap"><Deferred fallback={<div className="globe-stage" role="status" aria-label="Loading Earth globe" />}><LazyGlobe paused={paused} reducedMotion={reduced} /></Deferred><div className="earth-caption"><span className="earth-instruction">Drag to explore</span></div></div></Reveal></section>;
}

function Footer() {
  return <footer className="footer section-shell"><div className="footer-main"><Brand footer /><p>Precision above.<br />Progress below.</p><a className="text-link" href="#home">Back to top <Icon name="diagonal" size={17} /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Agro Drone Tech</span><p>Independent product showroom. Product names and photography belong to their respective owners. No manufacturer dealership or regulatory authorization is implied.</p><a href="#products">Explore hardware</a></div></footer>;
}

function Modal({ children, open, onClose, title, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (open) { el.showModal(); document.documentElement.classList.add('modal-open'); }
    else if (el.open) el.close();
    return () => { document.documentElement.classList.remove('modal-open'); if (el.open) el.close(); };
  }, [open]);
  return <dialog ref={ref} className={`modal ${className}`} data-lenis-prevent aria-label={title} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-inner"><button className="modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>{children}</div></dialog>;
}

function ProductDetails({ product, onClose, onInquiry }) {
  const reduced = useReducedMotion();
  return <Modal open={!!product} onClose={onClose} title={product ? `${product.brand} ${product.name} specifications` : 'Product details'}>{product && <><div className="detail-hero"><div><div className="eyebrow">{product.brand} / {product.category}</div><h2>{product.name}</h2><p>{product.tagline}</p></div>{products.some(p => p.id === product.id) ? <ProductVisual product={product} paused={!!reduced} reduced={reduced} /> : <img src={product.image} alt={product.name} />}</div><p className="detail-description">{product.description}</p><div className="detail-grid"><div><h3>Made for the mission</h3>{product.features.map(([title, text]) => <div className="detail-feature" key={title}><Icon name="check" size={18} /><div><h4>{title}</h4><p>{text}</p></div></div>)}</div><div className="spec-table"><h3>Technical specifications</h3><dl>{product.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></div><div className="detail-note"><p>{product.note}</p><a href={product.source} target="_blank" rel="noreferrer" className="text-link">Manufacturer specifications <Icon name="diagonal" size={15} /></a></div><div className="detail-bottom"><button className="btn" onClick={() => { onClose(); onInquiry(products.some(p => p.id === product.id) ? product.id : '', product.name); }}>Discuss this product <Icon /></button><span>Illustrations and manufacturer photos—not factory CAD.</span></div></>}</Modal>;
}

function Inquiry({ selection, productName = '', open, onClose }) {
  const [exported, setExported] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', interest: 'general', message: '' });
  useEffect(() => { if (open) { setForm(f => ({ ...f, interest: selection || 'general', message: productName ? `I'd like details about ${productName}.` : '' })); setExported(false); } }, [open, selection, productName]);
  const hasContact = !!(contact.email || contact.whatsapp);
  function update(e) { setExported(false); setForm(f => ({ ...f, [e.target.name]: e.target.value })); }
  function submit(e) {
    e.preventDefault();
    const p = products.find(p => p.id === form.interest);
    const text = `AGRO DRONE TECH — PRODUCT INQUIRY\n\nName: ${form.name.trim()}\nEmail: ${form.email.trim()}\nInterest: ${p ? `${p.brand} ${p.name}` : 'General advice / spare parts'}\n\n${form.message.trim()}\n`;
    if (contact.whatsapp) { window.open(`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); return; }
    if (contact.email) { window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent('Agro Drone Tech inquiry')}&body=${encodeURIComponent(text)}`; return; }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'agro-drone-inquiry.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  }
  return <Modal open={open} onClose={onClose} title="Contact Agro Drone Tech"><div className="inquiry-heading"><div className="eyebrow">A CONVERSATION STARTS HERE</div><h2>Let's talk about<br /><span>your next mission.</span></h2><p>{hasContact ? 'Share your requirements with the team.' : 'Prepare an inquiry to share with the team. Direct chat will be available once business contact details are added.'}</p></div><form onSubmit={submit} className="inquiry-form"><div className="form-row"><label>Your name<input name="name" value={form.name} onChange={update} placeholder="Full name" required maxLength={100} autoComplete="name" /></label><label>Email address<input name="email" value={form.email} onChange={update} placeholder="you@company.com" type="email" required maxLength={254} autoComplete="email" /></label></div><label>What can we help with?<select name="interest" value={form.interest} onChange={update}><option value="general">General advice / spare parts</option>{products.map(p => <option key={p.id} value={p.id}>{p.brand} {p.name}</option>)}</select></label><label>Tell us about your requirements<textarea name="message" value={form.message} onChange={update} placeholder="Your crop, acreage, current drone model, or the part you need…" rows={4} required maxLength={3000} /></label><div className="form-bottom"><button className="btn" type="submit">{hasContact ? 'Open message' : 'Download inquiry'}<Icon name={hasContact ? 'arrow' : 'download'} size={18} /></button><span>{hasContact ? 'Your message opens in your messaging app.' : 'No data is sent or stored.'}</span></div>{exported && <p className="export-confirmation" role="status"><Icon name="check" size={18} /> Inquiry file downloaded. It has not been sent to the team.</p>}</form></Modal>;
}

function App() {
  const reduced = useReducedMotion();
  const paused = !!reduced;
  const main = useRef(null);
  const [active, setActive] = useState(currentPage);
  const [detail, setDetail] = useState(null);
  const [inquiry, setInquiry] = useState({ open: false, selection: '', productName: '' });
  const [compare, setCompare] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMessage, setCompareMessage] = useState('');
  useEffect(() => {
    const navigate = () => setActive(currentPage());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setDetail(null);
    setInquiry(s => ({ ...s, open: false }));
    setCompareOpen(false);
    main.current?.focus({ preventScroll: true });
    const label = pages.find(([id]) => id === active)[1];
    document.title = active === 'home' ? 'Agro Drone Tech — Built for the field.' : `${label} — Agro Drone Tech`;
  }, [active]);
  useEffect(() => {
    if (reduced) return;
    let cancelled = false, lenis, raf;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ duration: 0.85, smoothWheel: true, anchors: false });
      const frame = time => { lenis.raf(time); raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); lenis?.destroy(); };
  }, [active, reduced]);
  useEffect(() => { document.body.classList.toggle('animations-paused', paused); }, [paused]);
  useEffect(() => { document.documentElement.classList.toggle('has-compare-bar', compare.length > 0 && active === 'products'); }, [compare.length, active]);
  function toggleCompare(id) {
    const name = products.find(p => p.id === id).name;
    const next = compare.includes(id) ? compare.filter(x => x !== id) : compare.length >= MAX_COMPARE ? compare : [...compare, id];
    setCompare(products.filter(p => next.includes(p.id)).map(p => p.id));
    setCompareMessage(`${name} ${next.includes(id) ? 'added to' : 'removed from'} comparison. ${next.length} of ${MAX_COMPARE} selected.`);
  }
  function clearCompare() {
    setCompare([]);
    setCompareMessage('Comparison cleared.');
    document.querySelector('.compare-toggle')?.focus({ preventScroll: true });
  }
  function ask(selection = '', productName = '') { setInquiry({ open: true, selection, productName }); }
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); main.current.focus(); }}>Skip to content</a><Header active={active} onInquiry={ask} /><SmartMenu active={active} reduced={reduced} /><main ref={main} id="main-content" tabIndex={-1} data-page={active}>
    <div key={active} className={`showroom-page page-${active}`}>
      {active === 'home' && <><Hero /><div className="ticker" aria-hidden="true"><div>{[0, 1].map(i => <span key={i}>PRECISION IN MOTION <b /> GROUNDED IN POSSIBILITY <b /> BUILT FOR THE FIELD <b /> </span>)}</div></div><CombinedFilm reduced={reduced} /><AnatomyFilm reduced={reduced} onInquiry={ask} /><PaperStudy paused={paused} reduced={reduced} /><Contact paused={paused} reduced={reduced} onInquiry={ask} preview /></>}
      {active === 'shelf' && <><PageIntro label="THE FIELD LIBRARY" title="Pick a guide. Explore a platform." text="The interactive book shelves, with product guides that open the real drone details." /><ProductShelf paused={paused} reduced={reduced} onDetails={setDetail} /></>}
      {active === 'products' && <><PageIntro label="THE HARDWARE" title="Real drones. Every part matters." text="Three interactive 3D platforms, their core systems, and a catalogue of manufacturer-listed equipment." /><Catalogue onDetails={setDetail} onInquiry={ask} paused={paused} reduced={reduced} compare={compare} onToggleCompare={toggleCompare} /><HardwareParts onDetails={setDetail} onInquiry={ask} paused={paused} reduced={reduced} /><AllEquipment onDetails={setDetail} /></>}
      {active === 'about' && <><PageIntro label="ABOUT AGRO DRONE TECH" title="Technology, grounded." text="Product selection, clear information and practical support planning for your field." /><Approach onInquiry={ask} /></>}
      {active === 'contact' && <><PageIntro label="LET'S CONNECT" title="Your field. Our next conversation." text="Explore the Earth and tell us what you need. Inquiries stay local until genuine business contact details are configured." /><Contact paused={paused} reduced={reduced} onInquiry={ask} /></>}
    </div>
  </main><Footer /><div className="bottom-dock">{active === 'products' && <CompareBar ids={compare} onOpen={() => setCompareOpen(true)} onRemove={toggleCompare} onClear={clearCompare} />}</div><p className="visually-hidden" role="status">{compareMessage}</p><CompareDialog ids={compare} open={compareOpen} onClose={() => setCompareOpen(false)} /><ProductDetails product={detail} onClose={() => setDetail(null)} onInquiry={ask} /><Inquiry open={inquiry.open} selection={inquiry.selection} productName={inquiry.productName} onClose={() => setInquiry(s => ({ ...s, open: false }))} /></>;
}

createRoot(document.getElementById('root')).render(<App />);
