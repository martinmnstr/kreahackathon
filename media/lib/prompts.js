// Krea prompts for the visual layer of each card. Text is always overlaid in HTML, never generated.

const NO_TEXT = 'no text, no letters, no words, no logos, no watermark';

const HAZARD_VISUAL = {
  listeria: 'extreme macro electron microscope image of rod-shaped listeria bacteria glowing red, pure black background, scientific, dramatic',
  salmonella: 'extreme macro electron microscope image of salmonella bacteria with flagella glowing red, pure black background, scientific, dramatic',
  ecoli: 'extreme macro electron microscope image of e. coli bacteria glowing red, pure black background, scientific, dramatic',
  glass: 'sharp shattered glass shards scattered on a matte black surface, harsh red rim light, macro photography, dramatic',
  metal: 'small sharp metal fragments on a matte black surface, harsh red rim light, macro photography, dramatic',
  foreign: 'small stones and hard debris on a matte black surface, harsh red rim light, macro photography, dramatic',
  dye: 'drops of vivid red dye bleeding into clear water, black background, macro photography, dramatic',
  other: 'single red emergency warning light glowing in darkness, abstract, cinematic, dramatic',
};

export function cardPrompts(recall) {
  const { hazard, productName } = recall;
  const allergen = hazard.allergen
    ? `macro close-up of ${hazard.allergen === 'milk' ? 'a splash of milk' : hazard.allergen + 's'} under harsh red rim light, matte black background, dramatic food photography`
    : HAZARD_VISUAL.other;

  return {
    alert: `${hazard.key === 'allergen' ? allergen : HAZARD_VISUAL[hazard.key]}, dark empty negative space in the lower half, square composition, ${NO_TEXT}`,
    product: `professional studio product photograph of ${productName} in its retail packaging${packaging(recall.productDescription)}, centered, isolated on a seamless pure white background, soft even lighting, sharp focus, e-commerce catalog style, ${NO_TEXT}`,
    steps: `calm minimal flat lay of a clean kitchen counter with a refrigerator door slightly open, soft cool blue daylight, airy, lots of empty space, editorial, ${NO_TEXT}`,
    statement: `abstract dark navy textured paper background, subtle fine grain, soft directional light, minimal corporate, ${NO_TEXT}`,
  };
}

// "packed in a yellow plastic sealed bag with pink and black lettering" → helps the image match the real package.
function packaging(desc) {
  const m = desc.match(/(?:packed|packaged|sold) in ([^;.:]{6,90})/i);
  return m ? ` (${m[1].trim()})` : '';
}
