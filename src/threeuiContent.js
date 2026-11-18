import threeModule from '../node_modules/three181/build/three.module.js?raw';
import threeCore from '../node_modules/three181/build/three.core.js?raw';
import font300 from '@fontsource/inter/files/inter-latin-300-normal.woff2?inline';
import font400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?inline';
import font500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?inline';
import font600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?inline';
import t50 from './assets/t50.webp?inline';
import t25 from './assets/t25.webp?inline';
import mavic from './assets/mavic.webp?inline';
import { products } from './products';

function moduleURL(code) {
  return `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(code)))}`;
}
const offlineThree = moduleURL(threeModule.replaceAll("'./three.core.js'", JSON.stringify(moduleURL(threeCore))));
const fonts = `<style>${[[300, font300], [400, font400], [500, font500], [600, font600]].map(([weight, url]) => `@font-face{font-family:"Inter";font-style:normal;font-weight:${weight};src:url("${url}") format("woff2");font-display:swap}`).join('')}</style>`;

function localFonts(source) {
  return source.replace(/<link[^>]+(?:fonts.googleapis.com|fonts.gstatic.com)[^>]*>/g, '')
    .replaceAll('Inter Tight', 'Inter').replaceAll('EB Garamond', 'Inter')
    .replaceAll('"Inter",Georgia,serif', 'Inter,sans-serif')
    .replaceAll('Didot,"Bodoni 72",Georgia,"Times New Roman",serif', 'sans-serif')
    .replace('</style>', `
      body{font-family:Inter,sans-serif;font-weight:400;text-transform:uppercase;font-synthesis:none}
      button,a,h1,h2,p,span,nav{text-transform:uppercase}
      button{font-family:Inter,sans-serif;font-weight:500}
      h1,h2,b,strong{font-weight:500}
    </style>`)
    .replace('<style>', `${fonts}<style>`);
}

function motionBridge(loop) {
  return `let scenePaused = false, sceneFrame = 0;
addEventListener('message', event => {
  if(event.source !== parent || event.data?.type !== 'agro-scene-motion' || typeof event.data.paused !== 'boolean') return;
  const previous = scenePaused;
  scenePaused = event.data.paused;
  if(scenePaused) cancelAnimationFrame(sceneFrame);
  else if(previous) sceneFrame = requestAnimationFrame(${loop});
});`;
}

export function preparePaperSource(source) {
  const artwork = /function drawGlass\(ctx\)\{[\s\S]*?\n\}(?=\r?\n\r?\nfunction makeCertTexture\(\)\{)/;
  if (!artwork.test(source)) throw new Error('Registered paper artwork structure changed.');
  return localFonts(source)
    .replace(artwork, () => `function drawGlass(ctx){
  ctx.scale(TW/1200, TH/1656);
  ctx.fillStyle='rgba(255,255,255,.030)'; ctx.fillRect(0,0,1200,1656);
  const fr=ctx.createLinearGradient(0,240,0,880);
  fr.addColorStop(0,'rgba(255,255,255,0)'); fr.addColorStop(.26,'rgba(255,255,255,.060)');
  fr.addColorStop(.74,'rgba(255,255,255,.060)'); fr.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=fr; ctx.fillRect(40,240,1120,640);
  ctx.strokeStyle='rgba(255,255,255,.34)'; ctx.lineWidth=2;
  rr(ctx,20,20,1160,1616,14); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=1;
  rr(ctx,36,36,1128,1584,10); ctx.stroke();

  const M=90, width=1020;
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillStyle='#ffffff'; ctx.font='500 60px Inter, sans-serif';
  wrapL(ctx,'AGRO DRONE TECH',M,180,width,72);
  ctx.font='300 64px Inter, sans-serif';
  wrapL(ctx,'SALES & COMPLIANCE',M,288,width,76);
  ctx.fillStyle='rgba(255,255,255,.78)'; ctx.font='400 26px Inter, sans-serif';
  wrapL(ctx,'PROCESS GUIDE',M,348,width,36);

  const steps=[
    ['01','PRODUCT IDENTITY','DJI AGRAS T50, DJI AGRAS T25, MAVIC 3M'],
    ['02','PUBLISHED SPECIFICATIONS','REVIEW OFFICIAL MANUFACTURER DATA BEFORE ORDERING'],
    ['03','SELLER DOCUMENTATION','CONFIRM SELLER/INVOICE DETAILS BEFORE PAYMENT'],
    ['04','APPLICABLE REQUIREMENTS','VERIFY LOCAL OPERATING AND APPLICATION REQUIREMENTS'],
    ['05','HANDOVER & SUPPORT','CONFIRM COMPATIBILITY, DELIVERY AND SUPPORT TERMS']
  ];
  steps.forEach(([number,title,text],index)=>{
    const y=462+index*190;
    ctx.fillStyle='rgba(255,255,255,.60)'; ctx.font='300 32px Inter, sans-serif';
    ctx.fillText(number,M,y);
    ctx.fillStyle='#ffffff'; ctx.font='500 30px Inter, sans-serif';
    wrapL(ctx,title,M+70,y,width-70,40);
    ctx.fillStyle='rgba(255,255,255,.86)'; ctx.font='400 28px Inter, sans-serif';
    wrapL(ctx,text,M+70,y+54,width-70,38);
  });

  ctx.strokeStyle='rgba(255,255,255,.24)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(M,1418); ctx.lineTo(M+width,1418); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.86)'; ctx.font='400 25px Inter, sans-serif';
  wrapL(ctx,'PROCESS INFORMATION ONLY — NOT A LICENSE, CERTIFICATION OR MANUFACTURER AUTHORIZATION.',M,1472,width,34);
}`)
    .replace('<title>3D Paper</title>', '<title>Agro Drone Tech — Sales & Compliance</title>')
    .replace('<h1>NOCTURNE</h1>', '<h1>AGRO</h1>')
    .replace('<div id="hint"><b>Drag</b> to turn it<span class="ptr"> &nbsp;·&nbsp; <b>Hover</b> to light it</span></div>', '<div id="hint"><b>DRAG</b> TO TURN IT<span class="ptr"> &nbsp;·&nbsp; <b>HOVER</b> TO LIGHT IT</span></div>')
    .replace('font-family:"Inter",sans-serif;font-weight:600;', 'font-family:"Inter",sans-serif;font-weight:300;')
    .replace(`document.fonts.load('700 104px "Inter"')`, `document.fonts.load('300 64px "Inter"')`)
    .replace(`document.fonts.load('600 110px "Inter"')`, `document.fonts.load('400 28px "Inter"')`)
    .replace(`document.fonts.load('600 34px "Inter"')`, `document.fonts.load('500 60px "Inter"')`)
    .replaceAll('requestAnimationFrame(frame);', 'sceneFrame = requestAnimationFrame(frame);')
    .replace('function frame(){', `${motionBridge('frame')}\nfunction frame(){\n  if(scenePaused) return;`);
}

export function prepareShelfSource(source) {
  const productPhotos = { t50, t25, mavic };
  const editions = [
    ['t50-spray-guide', 't50', 'SPRAY GUIDE'],
    ['t25-spray-guide', 't25', 'SPRAY GUIDE'],
    ['mavic-multispectral-guide', 'mavic', 'MULTISPECTRAL GUIDE'],
    ['t50-spreading-guide', 't50', 'SPREADING GUIDE'],
    ['t25-spreading-guide', 't25', 'SPREADING GUIDE'],
    ['mavic-crop-mapping-guide', 'mavic', 'CROP MAPPING GUIDE'],
    ['t50-field-planning-guide', 't50', 'FIELD PLANNING GUIDE'],
    ['t25-field-planning-guide', 't25', 'FIELD PLANNING GUIDE'],
    ['mavic-rtk-guide', 'mavic', 'RTK GUIDE'],
    ['t50-specifications-guide', 't50', 'SPECIFICATIONS GUIDE'],
  ];
  const spineColors = { t50: '#c56a31', t25: '#9d4825', mavic: '#645041' };
  const records = editions.map(([id, productId, guide], index) => {
    const product = products.find(item => item.id === productId);
    if (!product) throw new Error(`Missing shelf product: ${productId}`);
    return {
      id, productId, title: product.name.toUpperCase(), t1: product.brand.toUpperCase(), t2: product.name.toUpperCase(),
      sub: product.highlights.map(([value, label]) => `${value} ${label}`).join(' · ').toUpperCase(),
      year: guide, vol: product.number,
      shelf: Math.floor(index / 5), slot: index % 5, spine: spineColors[productId],
      cloth: '#171310', edge: '#eae3d2', blurb: product.description.toUpperCase(),
      specification: product.highlights.map(([value, label]) => `${label}: ${value}`).join(' · ').toUpperCase(),
    };
  });
  const photos = Object.fromEntries(records.map(record => [record.id, productPhotos[record.productId]]));
  const catalogue = /const STUDIO = 'FromSoftware';\nconst BOOKS = \[[\s\S]*?\n\];/;
  if (!catalogue.test(source)) throw new Error('Registered shelf catalogue structure changed.');
  let html = localFonts(source)
    .replace(catalogue, () => `const STUDIO = 'DJI';\nconst BOOKS = ${JSON.stringify(records)};`)
    .replace('https://unpkg.com/three@0.181.0/build/three.module.js', offlineThree)
    .replace('Ashen Press — The Art Book Shelf', 'Agro Drone Tech — Product Shelf')
    .replace('>Ashen Press</span>', '>FIELD LIBRARY</span>')
    .replace('<a class="pill rise" data-d="285" href="#" onclick="return false">Join the press</a>', '<button class="pill rise" data-d="285" id="product-specifications">VIEW SPECIFICATIONS</button>')
    .replaceAll('Look inside', 'TURN OVER')
    .replaceAll('>Close</button>', '>CLOSE</button>').replaceAll("'Close'", "'CLOSE'")
    .replaceAll('>Details</button>', '>DETAILS</button>').replaceAll("'Details'", "'DETAILS'")
    .replace('>Drag to turn</div>', '>DRAG TO TURN</div>')
    .replace('aria-label="Catalogue"', 'aria-label="CATALOGUE"')
    .replace('Opens the volume.', 'OPENS THE PRODUCT GUIDE.')
    .replaceAll('ASHEN PRESS', 'AGRO DRONE TECH')
    .replaceAll("'AP'", "'AD'")
    .replaceAll('VOLUME ', 'MODEL ').replaceAll('Volume ', 'MODEL ')
    .replace("' of the Worlds series'", "' · PRODUCT GUIDE'")
    .replace("'£68.00'", "'MANUFACTURER DATA'")
    .replace("'PLATES '+(21+22*b.title.length)+'–'+(180+31*b.title.length)", "'REAL MANUFACTURER PHOTOGRAPHY'")
    .replace("const SERIF = '\"Inter\",sans-serif';", 'const SERIF = SANS;')
    .replace(`g.font=\`400 \${W*.0215}px \${SANS}\`;g.fillStyle='rgba(240,231,212,.86)';
  tracked(g,b.sub,W*.5,y+H*.064,W*.0215*.20,'center');`, `const subSize=Math.min(W*.0215,fitTracked(g,b.sub,W*.80,'400',SANS,0.10));
  g.font=\`400 \${subSize}px \${SANS}\`;
  g.fillStyle='rgba(240,231,212,.86)';tracked(g,b.sub,W*.5,y+H*.064,subSize*.10,'center');`)
    .replace(`tracked(g,'MODEL '+b.vol,W*.5,H*.884,W*.0195*.34,'center');`, `const guideSize=Math.min(W*.0215,fitTracked(g,b.year,W*.76,'400',SANS,0.10));
  g.font=\`400 \${guideSize}px \${SANS}\`;
  tracked(g,b.year,W*.5,H*.846,guideSize*.10,'center');
  g.font=\`400 \${W*.0195}px \${SANS}\`;
  tracked(g,'MODEL '+b.vol,W*.5,H*.884,W*.0195*.34,'center');`)
    .replace('function loadPlates(){', `Object.assign(MARK_SRC, ${JSON.stringify(photos)});\nObject.assign(PLATE_SRC, ${JSON.stringify(photos)});\nfunction loadPlates(){`)
    .replace('im.onload=()=>{PLATE[b.id]=im;res();};', `im.onload=()=>{
      const plate=document.createElement('canvas');plate.width=960;plate.height=1440;
      const g=plate.getContext('2d');
      const background=g.createLinearGradient(0,0,960,1440);
      background.addColorStop(0,'#372015');background.addColorStop(1,b.cloth);
      g.fillStyle=background;g.fillRect(0,0,960,1440);
      const scale=Math.min(860/im.naturalWidth,600/im.naturalHeight);
      const width=im.naturalWidth*scale,height=im.naturalHeight*scale;
      g.drawImage(im,(960-width)/2,550+(600-height)/2,width,height);
      PLATE[b.id]=plate;res();
    };`)
    .replaceAll('img.naturalWidth', 'img.width').replaceAll('img.naturalHeight', 'img.height')
    .replace("g.fillText('9 78'+(1000000+((r()*8999999)|0)),bx+bw/2,by+bh*.93);", "g.fillText(b.title.toUpperCase(),bx+bw/2,by+bh*.93);");
  const barcodeStart = html.indexOf('  // barcode\n');
  const barcodeEnd = html.indexOf("  g.textAlign='right';", barcodeStart);
  if (barcodeStart < 0 || barcodeEnd < 0) throw new Error('Registered shelf imprint structure changed.');
  html = html.slice(0, barcodeStart) + `  g.font=\`500 \${W*.020}px \${SANS}\`;g.textAlign='left';
  wrapProductText(g,b.specification,W*.10,H*.935,W*.80,W*.029);
` + html.slice(barcodeEnd);
  html = html.replace('function artBack(b,W,H){', `function wrapProductText(g,text,x,y,width,lineHeight){
  let line='';for(const word of text.split(' ')){
    const next=line?line+' '+word:word;
    if(g.measureText(next).width>width&&line){g.fillText(line,x,y);y+=lineHeight;line=word;}else line=next;
  }g.fillText(line,x,y);return y;
}
function artBack(b,W,H){`)
    .replaceAll('requestAnimationFrame(tick);', 'sceneFrame = requestAnimationFrame(tick);')
    .replace('function tick(now){', `${motionBridge('tick')}\nfunction tick(now){\n  if(scenePaused) return;`)
    .replace('const tl=document.getElementById(\'tl\');', `document.getElementById('product-specifications').addEventListener('click',()=>{
  const activeRecord=S.active?.data || BOOKS[MOBILE?M.index:0];
  parent.postMessage({type:'agro-product-detail',id:activeRecord.productId},'*');
});
const tl=document.getElementById('tl');`)
    .replace('</style>\n\n<canvas', `
  .brandname{font-size:17px;font-weight:500;letter-spacing:.04em}
  .detail h2{font-size:32px;font-weight:500}
  .detail p{font:400 14px/1.7 Inter,sans-serif}
  .tli h2,.mbar-txt h2{font-weight:500}
  .mbar-txt h2{font-size:20px}
  .menu button{font-weight:400}
  .mbar-acts button{font-size:12px;padding:13px 14px}
  .detail .acts button,.pill{font-weight:500;font-family:Inter,sans-serif}
  .pill{border:0;cursor:pointer}
  @media(max-width:400px){header{font-size:12px}.brandname{font-size:14px}.pill{padding:10px 12px}.mark{display:none}}
</style>\n\n<canvas`);
  return html;
}
