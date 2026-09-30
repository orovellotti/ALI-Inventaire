import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Database, BarChart3, AlertTriangle, ExternalLink, Leaf, Target, Gauge } from "lucide-react";
import { Link } from "wouter";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[85vh] flex flex-col z-[3000]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="bg-teal-600 p-1.5 rounded-md">
              <Leaf className="h-4 w-4 text-white" />
            </div>
             ALi Inventory — Methodology
          </DialogTitle>
          <DialogDescription className="sr-only">
             ALi Inventory methodology, data sources and confidence index
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 mt-2 h-[60vh] overflow-auto pr-4">
          <div className="space-y-6 text-sm text-gray-700 leading-relaxed">

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Target className="h-4 w-4 text-teal-600" />
                 Purpose
              </h3>
              <p>
                 ALi Inventory supports preliminary biodiversity assessments around sites worldwide using
                 public observation data. It is designed for early environmental impact scoping and project planning.
              </p>
              <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
                 Results depend on available public data, whose coverage varies worldwide.
                 They do not replace an ecologist's field survey and are not evidence of species absence.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Database className="h-4 w-4 text-teal-600" />
                 Observation sources: GBIF and iNaturalist
              </h3>
              <p>
                 The tool queries two services: <strong>GBIF</strong> (Global Biodiversity Information Facility),
                 which aggregates records from institutions and collections, and <strong>iNaturalist</strong>,
                 which provides additional aggregate observations when enabled.
              </p>
              <div className="mt-3 space-y-2">
                <div className="bg-teal-50/50 rounded-lg p-3 border border-teal-100">
                  <span className="font-semibold text-teal-800 text-xs uppercase tracking-wide block mb-1">
                     Services used
                  </span>
                  <div className="space-y-1">
                    <code className="block text-xs text-teal-700 font-mono">
                      api.gbif.org/v1/occurrence/search
                    </code>
                    <code className="block text-xs text-teal-700 font-mono">
                      api.inaturalist.org/v1/observations/species_counts
                    </code>
                  </div>
                </div>
                <div className="text-xs space-y-1 text-gray-600">
                   <p><strong>Spatial filtering:</strong> GBIF records are retrieved within a bounding box and distance-filtered using the Haversine formula. iNaturalist is queried for the center and radius.</p>
                   <p><strong>Deduplication:</strong> Duplicate scientific names are removed, retaining the record with the highest conservation status.</p>
                   <p><strong>Limits:</strong> Up to 1,000 GBIF records and 1,000 iNaturalist taxa are processed per area.</p>
                </div>
              </div>
              <a 
                href="https://www.gbif.org/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 mt-2"
              >
                <ExternalLink className="h-3 w-3" />
                gbif.org
              </a>
              <a
                href="https://www.inaturalist.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-4 inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 mt-2"
              >
                <ExternalLink className="h-3 w-3" />
                inaturalist.org
              </a>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <MapPin className="h-4 w-4 text-teal-600" />
                 Concentric study areas
              </h3>
              <p>
                 Three suggested areas can be adjusted for the project, habitats and taxonomic groups:
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-solid border-teal-500 flex-shrink-0" />
                  <div>
                     <span className="font-semibold text-sm block">Immediate study area</span>
                     <span className="text-xs text-gray-500">Default 500 m — direct project footprint</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-dashed border-blue-500 flex-shrink-0" />
                  <div>
                     <span className="font-semibold text-sm block">Nearby study area</span>
                     <span className="text-xs text-gray-500">Default 2 km — direct area of influence</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-dashed border-indigo-500 flex-shrink-0" />
                  <div>
                     <span className="font-semibold text-sm block">Extended study area</span>
                     <span className="text-xs text-gray-500">Default 6 km — broader ecological context</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                 Enable or disable each area and adjust its radius. The analysis combines species from enabled areas.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                 <strong>Shapefile:</strong> Upload a .zip shapefile to define the project boundary.
                 The polygon's centroid centers the study areas and its boundary remains visible on the map.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <AlertTriangle className="h-4 w-4 text-teal-600" />
                 Conservation status and priority signals
              </h3>
              <p>
                 Available IUCN categories are considered alongside regional information where covered. A status alone does not establish local conservation importance:
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-3 bg-red-50/50 rounded-lg p-3 border border-red-100">
                  <div className="w-3 h-3 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                     <span className="font-semibold text-sm text-red-800 block">Statuses requiring closer attention</span>
                     <span className="text-xs text-red-600">CR (Critically Endangered), EN (Endangered), VU (Vulnerable), NT (Near Threatened)</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-green-50/50 rounded-lg p-3 border border-green-100">
                  <div className="w-3 h-3 rounded-full bg-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                     <span className="font-semibold text-sm text-green-800 block">Statuses that are inconclusive on their own</span>
                     <span className="text-xs text-green-600">LC (Least Concern), DD (Data Deficient), NA (Not Applicable) and NE (Not Evaluated). DD, NA and NE indicate gaps in knowledge, not automatically high priority.</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Gauge className="h-4 w-4 text-teal-600" />
                 GBIF confidence index
              </h3>
              <p>
                 The confidence index (0–100) assesses GBIF data quality across six weighted criteria:
              </p>
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                       <th className="text-left py-2 px-3 font-semibold text-gray-700">Criterion</th>
                       <th className="text-center py-2 px-3 font-semibold text-gray-700">Weight</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                       <td className="py-2 px-3 font-medium">Location</td>
                      <td className="py-2 px-3 text-center">25%</td>
                       <td className="py-2 px-3 text-gray-500">Coordinate accuracy (uncertainty &le; 300 m)</td>
                    </tr>
                    <tr>
                       <td className="py-2 px-3 font-medium">Taxonomy</td>
                      <td className="py-2 px-3 text-center">20%</td>
                       <td className="py-2 px-3 text-gray-500">Species-level identification and accepted taxonomic status</td>
                    </tr>
                    <tr>
                       <td className="py-2 px-3 font-medium">Recency</td>
                      <td className="py-2 px-3 text-center">15%</td>
                       <td className="py-2 px-3 text-gray-500">Observations from the past 10 years</td>
                    </tr>
                    <tr>
                       <td className="py-2 px-3 font-medium">Traceability</td>
                      <td className="py-2 px-3 text-center">15%</td>
                       <td className="py-2 px-3 text-gray-500">Observer or source institution identified</td>
                    </tr>
                    <tr>
                       <td className="py-2 px-3 font-medium">GBIF quality</td>
                      <td className="py-2 px-3 text-center">15%</td>
                       <td className="py-2 px-3 text-gray-500">No critical flags (zero coordinates, country mismatch, etc.)</td>
                    </tr>
                    <tr>
                       <td className="py-2 px-3 font-medium">Uniqueness</td>
                      <td className="py-2 px-3 text-center">10%</td>
                       <td className="py-2 px-3 text-gray-500">Unique observations after spatial and temporal deduplication</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="text-center p-2 bg-green-50 rounded-lg border border-green-200">
                  <span className="font-bold text-green-700 block">80-100</span>
                  <span className="text-[10px] text-green-600">Excellent</span>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="font-bold text-blue-700 block">60-79</span>
                   <span className="text-[10px] text-blue-600">Good</span>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded-lg border border-orange-200">
                  <span className="font-bold text-orange-700 block">40-59</span>
                   <span className="text-[10px] text-orange-600">Moderate</span>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
                  <span className="font-bold text-red-700 block">0-39</span>
                   <span className="text-[10px] text-red-600">Low</span>
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                 When multiple study areas are analyzed, the displayed confidence index is a weighted average of their scores.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <BarChart3 className="h-4 w-4 text-teal-600" />
                 Additional data
              </h3>
              <p>
                 For each species, the tool retrieves:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
                 <li><strong>Common name where available</strong> via GBIF vernacularNames</li>
                 <li><strong>IUCN status</strong> via GBIF iucnRedListCategory</li>
                 <li><strong>Species image</strong> via GBIF species media</li>
                 <li><strong>Links</strong> to GBIF and Wikipedia profiles</li>
              </ul>
              <p className="mt-3">
                 For locations in France, the <strong>regional SINP platforms</strong> panel provides links
                 to local data portals that may complement GBIF observations. This French network
                 does not cover sites in other countries.
              </p>
            </section>

            <section className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <a 
                  href="https://www.gbif.org/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-teal-600 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  GBIF.org
                </a>
                <a 
                  href="https://www.iucnredlist.org/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-teal-600 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                   IUCN Red List
                </a>
                <a 
                  href="https://www.openstreetmap.org/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-teal-600 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  OpenStreetMap
                </a>
              </div>
            </section>

          </div>
        </ScrollArea>
        <div className="border-t border-gray-100 pt-3">
          <Link
            href="/methodologie"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
             Read full methodology
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
