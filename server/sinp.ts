import type { SINPPlatform } from "@shared/types";

export const SINP_PLATFORMS: SINPPlatform[] = [
  {
    region: "Auvergne-Rhône-Alpes", code: "ARA",
    links: [{ label: "Atlas Biodiversité ARA", url: "https://atlas.biodiversite-auvergne-rhone-alpes.fr/" }],
    bounds: { minLat: 44.1, maxLat: 46.8, minLng: 2.0, maxLng: 7.2 },
  },
  {
    region: "Bourgogne-Franche-Comté", code: "BFC",
    links: [{ label: "Sigogne", url: "https://www.sigogne.org/presentation/" }],
    bounds: { minLat: 46.15, maxLat: 48.4, minLng: 2.8, maxLng: 7.1 },
  },
  {
    region: "Bretagne", code: "BRE",
    links: [{ label: "Biodiversité Bretagne", url: "https://data.biodiversite-bretagne.fr/presentation" }],
    bounds: { minLat: 47.2, maxLat: 48.9, minLng: -5.2, maxLng: -1.0 },
  },
  {
    region: "Centre-Val de Loire", code: "CVL",
    links: [{ label: "GeoNature Centre-Val de Loire", url: "https://www.geonature-cvl.fr/" }],
    bounds: { minLat: 46.3, maxLat: 48.5, minLng: 0.0, maxLng: 3.1 },
  },
  {
    region: "Corse", code: "COR",
    links: [{ label: "OEC Biodiversité", url: "https://www.isula.corsica/oec/" }],
    bounds: { minLat: 41.3, maxLat: 43.1, minLng: 8.5, maxLng: 9.7 },
  },
  {
    region: "Grand Est", code: "GES",
    links: [{ label: "Biodiversité Grand Est", url: "https://www.biodiversite-grandest.fr/" }],
    bounds: { minLat: 47.4, maxLat: 49.6, minLng: 3.4, maxLng: 8.3 },
  },
  {
    region: "Hauts-de-France", code: "HDF",
    links: [
      { label: "SIRF / GON", url: "https://sirf.gon.fr/adws/app/f06f232a-b99a-11ec-baaf-4937a0d944ec/" },
      { label: "Clicnat", url: "https://clicnat.fr/" },
      { label: "Digitale CBNBL", url: "https://digitale.cbnbl.org/" },
    ],
    bounds: { minLat: 49.0, maxLat: 51.1, minLng: 1.3, maxLng: 4.3 },
  },
  {
    region: "Île-de-France", code: "IDF",
    links: [{ label: "GeoNature ARB IDF", url: "https://geonature.arb-idf.fr/" }],
    bounds: { minLat: 48.1, maxLat: 49.25, minLng: 1.4, maxLng: 3.6 },
  },
  {
    region: "Normandie", code: "NOR",
    links: [{ label: "ODIN / ANBDD", url: "https://odin.anbdd.fr/" }],
    bounds: { minLat: 48.15, maxLat: 49.7, minLng: -1.9, maxLng: 1.3 },
  },
  {
    region: "Nouvelle-Aquitaine", code: "NAQ",
    links: [
      { label: "Observatoire FAUNA", url: "https://observatoire-fauna.fr/programmes/sinp" },
      { label: "OBV Nouvelle-Aquitaine", url: "https://obv-na.fr/" },
    ],
    bounds: { minLat: 42.8, maxLat: 47.1, minLng: -1.8, maxLng: 2.6 },
  },
  {
    region: "Occitanie", code: "OCC",
    links: [{ label: "SINP Occitanie", url: "https://sinp-occitanie.fr/atlas/" }],
    bounds: { minLat: 42.3, maxLat: 44.9, minLng: -0.3, maxLng: 4.8 },
  },
  {
    region: "Pays de la Loire", code: "PDL",
    links: [{ label: "Biodiv Pays de la Loire", url: "https://biodiv-paysdelaloire.fr/" }],
    bounds: { minLat: 46.3, maxLat: 48.5, minLng: -2.6, maxLng: -0.05 },
  },
  {
    region: "Provence-Alpes-Côte d'Azur", code: "PACA",
    links: [{ label: "Silene Nature", url: "https://nature.silene.eu/" }],
    bounds: { minLat: 43.0, maxLat: 45.1, minLng: 4.2, maxLng: 7.7 },
  },
  {
    region: "Guadeloupe", code: "GUA",
    links: [{ label: "Karunati", url: "https://karunati.fr/" }],
    bounds: { minLat: 15.8, maxLat: 16.6, minLng: -61.9, maxLng: -61.0 },
  },
  {
    region: "La Réunion", code: "REU",
    links: [{ label: "Borbonica", url: "https://www.borbonica.re/" }],
    bounds: { minLat: -21.5, maxLat: -20.8, minLng: 55.1, maxLng: 56.0 },
  },
  {
    region: "Martinique", code: "MTQ",
    links: [{ label: "Madinati", url: "https://madinati-martinique.fr/" }],
    bounds: { minLat: 14.3, maxLat: 14.9, minLng: -61.3, maxLng: -60.8 },
  },
  {
    region: "Mayotte", code: "MAY",
    links: [{ label: "SINP Mayotte", url: "https://sinp-mayotte.yt/" }],
    bounds: { minLat: -13.1, maxLat: -12.6, minLng: 44.9, maxLng: 45.4 },
  },
];

export function findSINPPlatforms(lat: number, lng: number): SINPPlatform[] {
  const matches = SINP_PLATFORMS.filter(p =>
    lat >= p.bounds.minLat && lat <= p.bounds.maxLat &&
    lng >= p.bounds.minLng && lng <= p.bounds.maxLng
  );

  matches.sort((a, b) => {
    const areaA = (a.bounds.maxLat - a.bounds.minLat) * (a.bounds.maxLng - a.bounds.minLng);
    const areaB = (b.bounds.maxLat - b.bounds.minLat) * (b.bounds.maxLng - b.bounds.minLng);
    return areaA - areaB;
  });

  return matches;
}
