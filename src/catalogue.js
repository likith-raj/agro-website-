import { products as coreProducts } from './products';
import { catalogueSources } from './catalogueData';

export const products = catalogueSources.map(([id, name, shelfCategory, tier, shape, fact, source, imageSource, note], index) => {
  const original = coreProducts.find(product => product.id === id);
  return {
    id, name, number: String(index + 1).padStart(2, '0'), shelfCategory, tier, shape,
    modelId: id, brand: ['t50', 't25', 't40', 't20p'].includes(id) ? 'DJI AGRAS' : 'DJI',
    category: shelfCategory === 'drones' ? 'Imaging & flight systems' : 'Parts & accessories',
    image: `${import.meta.env.BASE_URL}products/${id}.webp`, imageSource,
    tagline: fact, description: `${fact}. ${note}`, short: fact,
    highlights: [[fact, 'Published detail']], specs: [['Published detail', fact], ['Compatibility / configuration', note]],
    features: [['Model-specific equipment', note]], note, source,
    ...original,
    image: `${import.meta.env.BASE_URL}products/${id}.webp`,
    fact,
  };
});
