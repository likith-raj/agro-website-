import t50 from './assets/t50.webp';
import t25 from './assets/t25.webp';
import mavic from './assets/mavic.webp';
import t50Angle from './assets/t50-angle.webp';
import t25Angle from './assets/t25-angle.webp';

export const products = [
  {
    id: 't50', number: '01', brand: 'DJI AGRAS', name: 'T50', category: 'Large-scale spraying',
    image: t50, alternate: t50Angle, tagline: 'More ground. Less downtime.',
    description: 'A heavy-lift agricultural drone for demanding spray and granular spreading operations. Its coaxial twin-rotor design carries a 40 L spray tank, while dual atomizing sprinklers help deliver consistent crop coverage.',
    short: 'Heavy-lift power for large fields. Precision atomization, intelligent terrain following, and a foldable airframe.',
    highlights: [['40 L', 'Spray tank'], ['50 kg', 'Spread load'], ['4–11 m', 'Spray width']],
    specs: [['Spray tank capacity', '40 L'], ['Spreader tank / load', '75 L / 50 kg'], ['Standard spray flow', '16 L/min · 2 sprinklers'], ['Optional spray flow', '24 L/min · 4 sprinklers'], ['Droplet size', '50–500 μm'], ['Propellers', '8 · coaxial twin-rotor'], ['Flight battery', 'DB1560 · 30,000 mAh'], ['Folded dimensions', '1,115 × 750 × 900 mm']],
    features: [
      ['Cover more in one mission', 'The 40 L spray tank and optional 75 L spreader reduce refill stops on larger plots. Choose the payload system to suit your application.'],
      ['Follow the crop canopy', 'Forward and rear phased-array radar work with binocular vision for terrain following and obstacle sensing. Detection depends on the environment and operating conditions.'],
      ['Serviceable, foldable hardware', 'Foldable arms simplify transport. A dedicated intelligent battery system supports repeated field operations when paired with compatible charging equipment.'],
    ],
    note: '24 L/min requires the optional four-sprinkler configuration. Spray width is measured at 3 m above crops and varies with application conditions. Payload limits depend on altitude and temperature.',
    source: 'https://ag.dji.com/t50/specs',
  },
  {
    id: 't25', number: '02', brand: 'DJI AGRAS', name: 'T25', category: 'Compact field operations',
    image: t25, alternate: t25Angle, tagline: 'Compact frame. Serious capability.',
    description: 'A compact, foldable agricultural drone designed for smaller plots and more frequent moves between fields. The 20 L spray system combines adjustable atomization with radar and binocular vision sensing.',
    short: 'A lighter, compact spraying platform. Built for smaller plots, easy transport, and precise everyday operations.',
    highlights: [['20 L', 'Spray tank'], ['25 kg', 'Spread load'], ['4–7 m', 'Spray width']],
    specs: [['Spray tank capacity', '20 L'], ['Spreader tank / load', '35 L / 25 kg'], ['Standard spray flow', '16 L/min · 2 sprinklers'], ['Optional spray flow', '24 L/min · 4 sprinklers'], ['Droplet size', '50–500 μm'], ['Propellers', '4 · 50 inch'], ['Flight battery', 'DB800 · 15,500 mAh'], ['Folded dimensions', '1,050 × 690 × 820 mm']],
    features: [
      ['Move easily between plots', 'The foldable airframe and smaller tank suit field teams that regularly transport equipment between crop areas. Aircraft weight with battery is 32 kg, before payload.'],
      ['Adjust the application', 'Two atomizing sprinklers deliver up to 16 L/min as standard. The optional four-sprinkler setup increases flow to 24 L/min for compatible applications.'],
      ['Spray or spread', 'Exchange the application system for a 35 L spreader with a 25 kg operating load. Always use compatible hardware and manufacturer-recommended settings.'],
    ],
    note: 'Spray width is measured at 3 m above crops. The optional four-sprinkler configuration is required for 24 L/min. Aircraft and payload limits vary with operating conditions.',
    source: 'https://ag.dji.com/t25/specs',
  },
  {
    id: 'mavic', number: '03', brand: 'DJI MULTISPECTRAL', name: 'Mavic 3M', category: 'Crop intelligence',
    image: mavic, tagline: 'See what your crops are telling you.',
    description: 'The Mavic 3 Multispectral pairs a 20 MP RGB camera with four 5 MP multispectral cameras. Capture visible and invisible crop information to support vegetation-index mapping, growth analysis, and smarter field decisions.',
    short: 'Turn crop data into better decisions. RGB and multispectral imaging with centimeter-level RTK positioning.',
    highlights: [['20 MP', 'RGB camera'], ['4 × 5 MP', 'Multi-band'], ['RTK', 'Positioning']],
    specs: [['RGB camera', '20 MP · 4/3 CMOS'], ['Multispectral cameras', '4 × 5 MP'], ['Green band', '560 nm ± 16 nm'], ['Red band', '650 nm ± 16 nm'], ['Red-edge band', '730 nm ± 16 nm'], ['Near-infrared band', '860 nm ± 26 nm'], ['Positioning', 'Centimeter-level RTK'], ['Survey coverage', 'Up to 200 ha per flight']],
    features: [
      ['Understand plant health', 'Green, red, red-edge and near-infrared images support vegetation indices such as NDVI. These maps reveal patterns for closer agronomic investigation.'],
      ['Put every image in its place', 'The RTK module and time synchronization align positioning with image capture, supporting repeatable mapping workflows.'],
      ['Bring intelligence to spraying', 'Use crop maps to help plan targeted operations. Results depend on calibration, crop stage, weather, processing tools and agronomic interpretation.'],
    ],
    note: 'The manufacturer’s up-to-200 ha coverage figure is a test result, not a guaranteed working rate. Actual coverage varies with altitude, overlap, terrain and conditions. This is a mapping drone, not a spraying drone.',
    source: 'https://ag.dji.com/mavic-3-m',
  },
];

export const contact = { email: '', whatsapp: '', phone: '', location: 'India' };
