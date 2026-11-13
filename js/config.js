// First iteration: two hardcoded images for the comparison tab.
// Later these will come from the gallery (Media Library / Pair Matching).
export const DEFAULT_IMAGES = {
  left: 'data/sample/gleyre-le-soir_original.jpg',
  right: 'data/sample/gleyre-le-soir_photochrom.jpg',
};

// Display label and credit line for each default image.
// The Gleyre photograph is CC BY-SA 4.0: attribution is required wherever it is shown.
export const DEFAULT_IMAGE_INFO = {
  left: {
    label: 'Original',
    credit: 'Charles Gleyre, Le Soir (1843). Photo: Françoise Foliot, CC BY-SA 4.0',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Fran%C3%A7oise_Foliot_-_Charles_Gleyre_-_Le_Soir.jpg',
  },
  right: {
    label: 'Photochrom',
    credit: 'Les illusions perdues, ca. 1899. Zentralbibliothek Zürich, Public Domain Mark',
    creditUrl: 'https://doi.org/10.3931/e-rara-139591',
  },
};
