declare module "shpjs" {
  import type { FeatureCollection } from "geojson";
  function shp(data: ArrayBuffer | string): Promise<FeatureCollection | FeatureCollection[]>;
  export default shp;
}
