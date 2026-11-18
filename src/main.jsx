import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Lenis from 'lenis';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { products, contact } from './products';
import Globe from './Globe';
import field from './assets/field.jpg';
import { AnimatedTopDock } from './shaders/animated-top-dock/AnimatedTopDock';
import { AshenPress } from './shaders/ashen-press/AshenPress';
import { ThreeDPaper } from './shaders/3d-paper/ThreeDPaper';
import './shaders/threeui.css';
import './styles.css';
import './threeuiIntegration.css';

function Icon({ name = 'arrow', size = 20, className = '' }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    diagonal: <path d="M6 18 18 6M6 6h12v12" />,
    down: <path d="M12 4v16m-6-6 6 6 6-6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
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

function Reveal({ children, className = '', delay = 0 }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function PhotoStage({ product, paused, reduced, hero = false }) {
  const plane = useRef();
  const drag = useRef(null);
  const [spin, setSpin] = useState(0);
  const [turned, setTurned] = useState(false);
  const [dragging, setDragging] = useState(false);
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
  return <div className={`product-visual ${hero ? 'hero-visual' : ''}`}>
    <div className={`photo-stage ${dragging ? 'dragging' : ''}`} role="img" aria-label={`${product.brand} ${product.name}, real manufacturer image; drag to tilt the photo`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="photo-float" style={{ animationPlayState: paused || reduced || dragging ? 'paused' : 'running' }}>
        <div className="photo-auto-rotate"><div ref={plane} className="photo-plane">
          <motion.img key={`${product.id}-${turned}`} src={turned && product.alternate ? product.alternate : product.image} alt={`${product.brand} ${product.name}`} draggable="false" initial={{ opacity: 0 }} animate={{ opacity: 1, rotateY: spin * 360 }} transition={{ opacity: { duration: .35 }, rotateY: { duration: reduced ? 0 : 1.8, ease: [0.4, 0, 0.2, 1] } }} />
        </div></div>
      </div>
    </div>
    {!hero && <div className="photo-tools"><span>Real product photo</span><div>{product.alternate && <button type="button" onClick={() => setTurned(!turned)} aria-label={`Change ${product.name} photo angle`} title="Another manufacturer photo">{turned ? 'Front' : 'Angle'}</button>}<button type="button" onClick={() => setSpin(spin + 1)} title="Rotate the photo 360 degrees"><Icon name="rotate" size={16} /> Spin photo</button></div></div>}
  </div>;
}

function Header({ onInquiry, active }) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width:850px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width:850px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const links = [['products', 'Products'], ['approach', 'Our approach'], ['contact', 'Contact']];
  if (!compact) return <div className="header-wrap"><AnimatedTopDock variant="modern" proximity={122} spring={0.19} damping={0.70} widthGrowth={17} heightGrowth={16} drop={3.5} className="agro-command" header={{ brand: <Brand />, links, active, navigate: id => { window.location.hash = id; }, inquire: () => onInquiry() }} /></div>;
  return <header className="header-wrap"><div className="header-pill"><Brand />
    <nav aria-label="Main navigation" className={open ? 'nav-links is-open' : 'nav-links'}>{links.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? 'active' : ''} onClick={() => setOpen(false)}>{label}</a>)}</nav>
    <div className="header-actions"><button className="btn btn-small" onClick={() => { onInquiry(); setOpen(false); }}>Let's talk <Icon name="diagonal" size={16} /></button><button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}><Icon name={open ? 'close' : 'menu'} /></button></div>
  </div></header>;
}

function Hero({ paused, reduced, onDetails }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % products.length), 9000);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  const product = products[index];
  return <section id="home" className="hero section-shell">
    <div className="hero-haze" aria-hidden="true" />
    <div className="hero-grid"><div className="hero-copy"><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}><div className="eyebrow"><span className="accent-dot" /> PRECISION AGRICULTURE. REAL HARDWARE.</div><h1>Built for the field.<br /><span>Ready for what's next.</span></h1><p>Smarter flights. Stronger harvests. Explore agricultural drone systems that bring precision to every acre.</p><div className="hero-buttons"><a className="btn" href="#products">Explore the products <Icon /></a><a className="text-link" href="#approach">Meet Agro Drone Tech <Icon name="diagonal" size={17} /></a></div></motion.div>
      <div className="hero-micro"><span>SPRAYING</span><span>SPREADING</span><span>CROP INTELLIGENCE</span></div>
    </div>
    <div className="hero-showcase"><span className="hero-watermark" aria-hidden="true">{product.name === 'Mavic 3M' ? '3M' : product.name}</span><PhotoStage product={product} hero paused={paused} reduced={reduced} /><div className="hero-product-caption"><AnimatePresence mode="wait"><motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .25 }}><span>{product.brand}</span><button onClick={() => onDetails(product)}>{product.name} <Icon name="diagonal" size={16} /></button></motion.div></AnimatePresence><div className="hero-selectors" role="group" aria-label="Featured product">{products.map((p, i) => <button key={p.id} className={i === index ? 'selected' : ''} aria-label={`Show ${p.brand} ${p.name}`} aria-pressed={i === index} onClick={() => setIndex(i)}>{p.number}</button>)}</div></div></div></div>
    <div className="hero-bottom"><a href="#products" className="scroll-link"><Icon name="down" size={16} /> Discover the range</a><p>Purpose-built systems. Field-first thinking.</p><span className="edition">2026 COLLECTION</span></div>
  </section>;
}

function Catalogue({ onDetails, onInquiry, paused, reduced }) {
  return <section id="products" className="catalogue section-shell"><Reveal className="section-heading"><div><div className="eyebrow">01 / THE HARDWARE</div><h2>Three systems.<br /><span>One smarter field.</span></h2></div><p>From precision application to crop intelligence. Find the platform that fits the way you work.</p></Reveal>
    <div className="product-grid">{products.map((p, i) => <Reveal key={p.id} delay={i * .1} className="product-card"><div className="product-top"><span>{p.category}</span><span className="product-number">{p.number}</span></div><PhotoStage product={p} paused={paused} reduced={reduced} /><div className="product-copy"><div className="eyebrow product-brand">{p.brand}</div><h3>{p.name}</h3><p>{p.short}</p><div className="product-specs">{p.highlights.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="product-buttons"><button className="text-link" onClick={() => onDetails(p)}>View details <Icon name="diagonal" size={17} /></button><button className="inquire-button" onClick={() => onInquiry(p.id)} aria-label={`Inquire about ${p.name}`}><Icon name="chat" size={17} /> Inquire</button></div></div></Reveal>)}</div>
    <Reveal className="catalogue-note"><span className="accent-dot" /><p>Actual manufacturer photography. Floating photo interaction—not a 3D scan. Published specifications, with the full details one click away.</p></Reveal>
  </section>;
}

function ProductShelf({ paused, reduced, onDetails }) {
  return <section id="shelf" className="shelf-section section-shell"><Reveal className="section-heading"><div><div className="eyebrow">THE FIELD LIBRARY</div><h2>Your next platform.<br /><span>Pick it off the shelf.</span></h2></div><p>Three real systems across ten product-guide editions. Both shelves, fully stocked. Select a cover, turn it, and explore the manufacturer specifications.</p></Reveal><div className="shader-frame shelf-frame" data-lenis-prevent><AshenPress paused={paused && !reduced} onProductDetails={id => onDetails(products.find(product => product.id === id))} /></div><div className="scene-footnote"><span>Product-guide covers—not physical drone models or books for sale.</span><a className="text-link" href="#products">Compare the hardware <Icon name="diagonal" size={15} /></a></div></section>;
}

function PaperStudy({ paused, reduced }) {
  return <section id="motion" className="paper-section section-shell"><div className="paper-copy"><div className="eyebrow">SALES & COMPLIANCE</div><h2>A clear process.<br /><span>An informed purchase.</span></h2><p>Review product identity, manufacturer specifications, seller documentation and applicable requirements before an order. Drag the guide to explore the process.</p><span className="paper-disclaimer">Process information—not a license, certification or manufacturer authorization.</span></div><div className="shader-frame paper-frame" data-lenis-prevent><ThreeDPaper variant="original" paused={paused && !reduced} /></div></section>;
}

const approachItems = [
  { icon: 'layers', title: 'The right platform.', text: 'Choose hardware around your acreage, crop type, payload and daily workflow—not just a specification sheet.' },
  { icon: 'cog', title: 'Every part matters.', text: 'From propulsion and power to application systems. Compatibility and maintenance are part of the conversation.' },
  { icon: 'chart', title: 'A clearer view.', text: 'Connect crop intelligence with application planning. Better information makes more purposeful operations.' },
];
function Approach({ onInquiry }) {
  return <section id="approach" className="approach section-shell"><Reveal className="approach-grid"><div className="field-story"><img src={field} alt="Agricultural drone spraying a crop field" loading="lazy" /><div className="field-caption"><span>TECHNOLOGY, GROUNDED.</span><p>The future of agriculture<br />starts in the field.</p></div></div><div className="approach-copy"><div className="eyebrow">02 / OUR APPROACH</div><h2>Not just a drone.<br /><span>A better way to work.</span></h2><p className="section-intro">Agro Drone Tech brings product selection and support planning together. Explore real hardware, understand compatibility, and review the details before your next purchase.</p><div className="approach-list">{approachItems.map(item => <div key={item.title} className="approach-item"><div className="service-icon"><Icon name={item.icon} size={22} /></div><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div><button className="text-link" onClick={() => onInquiry()}>Talk through your requirements <Icon name="diagonal" size={17} /></button></div></Reveal></section>;
}

const topics = [
  ['Product guidance', 'Find the right system for your field.'],
  ['Parts & compatibility', 'Start with your model and the part you need.'],
  ['Field-ready planning', 'Discuss acreage, crops and application goals.'],
];
function Contact({ paused, reduced, onInquiry }) {
  const [topic, setTopic] = useState(0);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => setTopic(i => (i + 1) % topics.length), 5000);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  return <section id="contact" className="contact section-shell"><div className="contact-haze" aria-hidden="true" /><Reveal className="contact-grid"><div className="contact-copy"><div className="eyebrow">03 / LET'S CONNECT</div><h2>Big ambitions.<br /><span>Down-to-earth people.</span></h2><p className="section-intro">Connect with our hardworking team. Tell us about your field, your equipment, or the next challenge you want to solve.</p><button className="btn" onClick={() => onInquiry()}>Chat with us <Icon name="diagonal" size={18} /></button><div className="contact-rotation" aria-live="off"><AnimatePresence mode="wait"><motion.div key={topic} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: reduced ? 0 : .4 }}><span className="accent-dot" /><div><strong>{topics[topic][0]}</strong><p>{topics[topic][1]}</p></div></motion.div></AnimatePresence><div className="topic-controls">{topics.map((t, i) => <button key={t[0]} aria-label={`Show ${t[0]}`} aria-pressed={i === topic} className={i === topic ? 'selected' : ''} onClick={() => setTopic(i)} />)}</div></div>
      <div className="contact-meta"><span>{contact.location} · Agricultural technology</span>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span>Direct contact details coming soon</span>}</div>
    </div><div className="earth-wrap"><Globe paused={paused} reducedMotion={reduced} /><div className="earth-caption"><span className="earth-instruction">Drag to explore</span></div></div></Reveal></section>;
}

function Footer() {
  return <footer className="footer section-shell"><div className="footer-main"><Brand footer /><p>Precision above.<br />Progress below.</p><a className="text-link" href="#home">Back to top <Icon name="diagonal" size={17} /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Agro Drone Tech</span><p>Independent product showroom. Product names and photography belong to their respective owners. No manufacturer dealership or regulatory authorization is implied.</p><a href="#products">Explore hardware</a></div></footer>;
}

function Modal({ children, open, onClose, title }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (open) { el.showModal(); document.documentElement.classList.add('modal-open'); }
    else if (el.open) el.close();
    return () => { document.documentElement.classList.remove('modal-open'); if (el.open) el.close(); };
  }, [open]);
  return <dialog ref={ref} className="modal" data-lenis-prevent aria-label={title} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-inner"><button className="modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>{children}</div></dialog>;
}

function ProductDetails({ product, onClose, onInquiry }) {
  return <Modal open={!!product} onClose={onClose} title={product ? `${product.brand} ${product.name} specifications` : 'Product details'}>{product && <><div className="detail-hero"><div><div className="eyebrow">{product.brand} / {product.category}</div><h2>{product.name}</h2><p>{product.tagline}</p></div><img src={product.image} alt={product.name} /></div><p className="detail-description">{product.description}</p><div className="detail-grid"><div><h3>Made for the mission</h3>{product.features.map(([title, text]) => <div className="detail-feature" key={title}><Icon name="check" size={18} /><div><h4>{title}</h4><p>{text}</p></div></div>)}</div><div className="spec-table"><h3>Technical specifications</h3><dl>{product.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></div><div className="detail-note"><p>{product.note}</p><a href={product.source} target="_blank" rel="noreferrer" className="text-link">Manufacturer specifications <Icon name="diagonal" size={15} /></a></div><div className="detail-bottom"><button className="btn" onClick={() => { onClose(); onInquiry(product.id); }}>Discuss this product <Icon /></button><span>Product photography, not a 3D scan.</span></div></>}</Modal>;
}

function Inquiry({ selection, open, onClose }) {
  const [exported, setExported] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', interest: 'general', message: '' });
  useEffect(() => { if (open) { setForm(f => ({ ...f, interest: selection || 'general' })); setExported(false); } }, [open, selection]);
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
  const [active, setActive] = useState('home');
  const [detail, setDetail] = useState(null);
  const [inquiry, setInquiry] = useState({ open: false, selection: '' });
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true, anchors: { offset: -100 } });
    let raf;
    const frame = time => { lenis.raf(time); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [reduced]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
    }, { rootMargin: '-20% 0px -50% 0px', threshold: 0 });
    document.querySelectorAll('main > section[id]').forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { document.body.classList.toggle('animations-paused', paused || !!reduced); }, [paused, reduced]);
  function ask(selection = '') { setInquiry({ open: true, selection }); }
  return <><a className="skip-link" href="#products">Skip to products</a><Header active={active} onInquiry={ask} /><main><Hero paused={paused} reduced={reduced} onDetails={setDetail} /><div className="ticker" aria-hidden="true"><div>{[0, 1].map(i => <span key={i}>PRECISION IN MOTION <b /> GROUNDED IN POSSIBILITY <b /> BUILT FOR THE FIELD <b /> </span>)}</div></div><Catalogue onDetails={setDetail} onInquiry={ask} paused={paused} reduced={reduced} /><ProductShelf paused={paused} reduced={reduced} onDetails={setDetail} /><Approach onInquiry={ask} /><PaperStudy paused={paused} reduced={reduced} /><Contact paused={paused} reduced={reduced} onInquiry={ask} /></main><Footer /><ProductDetails product={detail} onClose={() => setDetail(null)} onInquiry={ask} /><Inquiry open={inquiry.open} selection={inquiry.selection} onClose={() => setInquiry(s => ({ ...s, open: false }))} /></>;
}

createRoot(document.getElementById('root')).render(<App />);
