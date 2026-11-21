export const config = {
  theme: {
    asphalt: '#07080A', graphite: '#121418', fog: '#8A8F98', bone: '#EDEAE4',
    xenon: '#CFE3FF', taillight: '#E1251B', hairline: 'rgba(237,234,228,0.12)',
  },
  sections: [
    { id: 'home', number: '01', label: 'In flight' },
    { id: 'lineup', number: '02', label: 'Lineup' },
    { id: 'shelf', number: '03', label: 'Inner shelf' },
    { id: 'technology', number: '04', label: 'Dismantle' },
    { id: 'dashboard', number: '05', label: 'Dashboard' },
    { id: 'reserve', number: '06', label: 'Reserve' },
  ],
  motion: { lerp: 0.15, ease: [0.16, 1, 0.3, 1], grainFps: 8, grainOpacity: 0.035, cursorLerp: 0.18 },
  hero: {
    heightVh: 400,
    media: 'procedural',
    frameCount: 0,
    framePaths: [],
    fadeStart: 0.95,
    simulatedCoverageHa: 21.3,
    simulatedDistanceKm: 4.2,
    chapters: [
      { start: 0, end: 0.15, lines: ['Agro', 'Drone Tech'], text: 'The field is asleep.', hint: 'Scroll to wake it', position: 'left' },
      { start: 0.25, end: 0.45, lines: ["It doesn’t need", 'daylight.'], position: 'right' },
      { start: 0.55, end: 0.75, lines: ['It brings', 'its own.'], position: 'left' },
      { start: 0.85, end: 1, lines: ['T50'], position: 'left', product: 't50' },
    ],
  },
  lineup: { heightVh: 100, ids: ['t50', 't25', 'mavic', 't40', 't20p'], open: 't50', floorPercent: 72 },
  shelf: {
    tabs: [
      ['all', 'All'], ['drones', 'Drones'], ['batteries', 'Batteries'],
      ['parts', 'Propellers & Parts'], ['controllers', 'Controllers'], ['accessories', 'Accessories'],
    ],
    maxCompare: 3,
    mountMargin: '200px',
    tiers: { 1: 'Drone illustration', 2: 'Part illustration', 3: 'Photo only' },
  },
  dismantle: {
    heightVh: 300,
    media: 'procedural',
    frameCount: 0,
    framePaths: [],
    callouts: [
      { at: 0.71, title: 'Body', text: 'Illustrated modular airframe', x: 49, y: 22, side: 'right' },
      { at: 0.77, title: 'Battery', text: 'DB1560 · 30,000 mAh', x: 51, y: 34, side: 'right' },
      { at: 0.83, title: 'Drive', text: 'Eight rotors · coaxial pairs', x: 24, y: 45, side: 'left' },
      { at: 0.89, title: 'Spray', text: '16 L/min · two sprinklers', x: 65, y: 65, side: 'right' },
    ],
  },
  dashboard: {
    heightVh: 100,
    label: 'Demo data',
    fleet: [
      { product: 't50', status: 'Available' }, { product: 't25', status: 'In service' },
      { product: 'mavic', status: 'Available' }, { product: 't40', status: 'Maintenance' },
      { product: 't20p', status: 'Available' },
    ],
    coverage: [
      { day: 'Mon', ha: 8 }, { day: 'Tue', ha: 15 }, { day: 'Wed', ha: 12 },
      { day: 'Thu', ha: 26 }, { day: 'Fri', ha: 21 }, { day: 'Sat', ha: 34 }, { day: 'Sun', ha: 38 },
    ],
    inquiries: [
      { name: 'Demo grower 01', product: 'T50', date: '2026-11-18' },
      { name: 'Demo grower 02', product: 'T25', date: '2026-11-19' },
      { name: 'Demo grower 03', product: 'Mavic 3M', date: '2026-11-20' },
    ],
    disclaimer: 'This dashboard is a design preview. Real data will connect to your operations system.',
  },
  reserve: { heightVh: 100, lines: ['Book a', 'demo flight.'], title: 'Book a demo flight.', text: 'Tell us about your crop, your acreage and the platform you want to explore.', button: 'Book a demo' },
};
