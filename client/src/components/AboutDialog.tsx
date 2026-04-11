import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Database, BarChart3, AlertTriangle, ExternalLink, Leaf, Target, Gauge } from "lucide-react";

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
            Inventaire Flash - Méthodologie
          </DialogTitle>
          <DialogDescription className="sr-only">
            Méthodologie, sources de données et indice de confiance de l'outil Inventaire Flash
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 mt-2 h-[60vh] overflow-auto pr-4">
          <div className="space-y-6 text-sm text-gray-700 leading-relaxed">

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Target className="h-4 w-4 text-teal-600" />
                Objectif
              </h3>
              <p>
                Inventaire Flash est un outil de pré-diagnostic écologique rapide. Il permet de générer 
                instantanément un inventaire de la biodiversité connue autour d'un point donné, à partir 
                des données d'observation publiques. Il est conçu pour les phases amont des études d'impact 
                environnemental (EIE) et le cadrage préliminaire de projets.
              </p>
              <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
                Cet outil fournit une indication rapide basée sur les données disponibles. 
                Il ne remplace pas un inventaire terrain réalisé par un écologue et ne constitue 
                pas une preuve d'absence d'espèces.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Database className="h-4 w-4 text-teal-600" />
                Source de données : API GBIF
              </h3>
              <p>
                Toutes les données proviennent du <strong>GBIF</strong> (Global Biodiversity Information Facility), 
                la plus grande base de données ouverte sur la biodiversité mondiale. Le GBIF agrège les observations 
                de centaines d'institutions, de programmes de science participative (iNaturalist, eBird...) et de 
                collections muséales.
              </p>
              <div className="mt-3 space-y-2">
                <div className="bg-teal-50/50 rounded-lg p-3 border border-teal-100">
                  <span className="font-semibold text-teal-800 text-xs uppercase tracking-wide block mb-1">
                    Endpoint utilisé
                  </span>
                  <code className="text-xs text-teal-700 font-mono">
                    api.gbif.org/v1/occurrence/search
                  </code>
                </div>
                <div className="text-xs space-y-1 text-gray-600">
                  <p><strong>Filtrage spatial :</strong> Les occurrences sont d'abord récupérées dans un rectangle englobant (bounding box), puis filtrées par distance euclidienne (formule de Haversine) pour ne conserver que celles situées dans le cercle d'étude.</p>
                  <p><strong>Dédoublonnage :</strong> Les doublons sont supprimés par nom scientifique, en conservant l'occurrence avec le statut de conservation le plus élevé.</p>
                  <p><strong>Limite :</strong> Maximum 1 000 occurrences par requête GBIF.</p>
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
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <MapPin className="h-4 w-4 text-teal-600" />
                Aires d'étude concentriques
              </h3>
              <p>
                L'outil propose trois aires d'étude concentriques, conformément aux standards des études 
                d'impact environnemental :
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-solid border-teal-500 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm block">Aire d'étude immédiate</span>
                    <span className="text-xs text-gray-500">500 m par défaut - Zone d'implantation directe du projet</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-dashed border-blue-500 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm block">Aire d'étude rapprochée</span>
                    <span className="text-xs text-gray-500">2 km par défaut - Zone d'influence directe des travaux</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                  <div className="w-8 h-0 border-t-2 border-dashed border-indigo-500 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm block">Aire d'étude éloignée</span>
                    <span className="text-xs text-gray-500">6 km par défaut - Contexte écologique régional</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Chaque aire peut être activée/désactivée et son rayon est ajustable. 
                L'analyse fusionne les espèces trouvées dans toutes les aires actives.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <AlertTriangle className="h-4 w-4 text-teal-600" />
                Classification des enjeux (UICN)
              </h3>
              <p>
                Chaque espèce est classée selon son statut IUCN (Union Internationale pour la Conservation 
                de la Nature), récupéré via l'API GBIF :
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-3 bg-red-50/50 rounded-lg p-3 border border-red-100">
                  <div className="w-3 h-3 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm text-red-800 block">Enjeux forts</span>
                    <span className="text-xs text-red-600">CR (En danger critique), EN (En danger), VU (Vulnérable), NT (Quasi menacé)</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-orange-50/50 rounded-lg p-3 border border-orange-100">
                  <div className="w-3 h-3 rounded-full bg-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm text-orange-800 block">Enjeux moyens</span>
                    <span className="text-xs text-orange-600">DD (Données insuffisantes) - statut inconnu, attention recommandée</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-green-50/50 rounded-lg p-3 border border-green-100">
                  <div className="w-3 h-3 rounded-full bg-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-sm text-green-800 block">Enjeux faibles</span>
                    <span className="text-xs text-green-600">LC (Préoccupation mineure), NA (Non applicable), NE (Non évalué) et autres</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <Gauge className="h-4 w-4 text-teal-600" />
                Indice de Confiance GBIF
              </h3>
              <p>
                L'indice de confiance (0 à 100) évalue la qualité et la fiabilité des données GBIF 
                utilisées pour l'inventaire. Il est calculé à partir de 6 critères pondérés :
              </p>
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Critère</th>
                      <th className="text-center py-2 px-3 font-semibold text-gray-700">Poids</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2 px-3 font-medium">Géographie</td>
                      <td className="py-2 px-3 text-center">25%</td>
                      <td className="py-2 px-3 text-gray-500">Précision des coordonnées (incertitude &le; 300 m)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Taxonomie</td>
                      <td className="py-2 px-3 text-center">20%</td>
                      <td className="py-2 px-3 text-gray-500">Identification au rang espèce, statut taxonomique accepté</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Fraîcheur</td>
                      <td className="py-2 px-3 text-center">15%</td>
                      <td className="py-2 px-3 text-gray-500">Observations des 10 dernières années</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Traçabilité</td>
                      <td className="py-2 px-3 text-center">15%</td>
                      <td className="py-2 px-3 text-gray-500">Présence de l'observateur ou de l'institution source</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Qualité GBIF</td>
                      <td className="py-2 px-3 text-center">15%</td>
                      <td className="py-2 px-3 text-gray-500">Absence de flags critiques (coordonnées nulles, pays incohérent...)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">Unicité</td>
                      <td className="py-2 px-3 text-center">10%</td>
                      <td className="py-2 px-3 text-gray-500">Ratio d'occurrences uniques après dédoublonnage spatio-temporel</td>
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
                  <span className="text-[10px] text-blue-600">Bon</span>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded-lg border border-orange-200">
                  <span className="font-bold text-orange-700 block">40-59</span>
                  <span className="text-[10px] text-orange-600">Modéré</span>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
                  <span className="font-bold text-red-700 block">0-39</span>
                  <span className="text-[10px] text-red-600">Faible</span>
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Lorsque plusieurs aires d'étude sont analysées, l'indice de confiance affiché 
                est la moyenne pondérée des scores de chaque aire.
              </p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 font-bold text-gray-900 text-base mb-2">
                <BarChart3 className="h-4 w-4 text-teal-600" />
                Données complémentaires
              </h3>
              <p>
                Pour chaque espèce, l'outil récupère automatiquement :
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
                <li><strong>Nom vernaculaire français</strong> via GBIF vernacularNames</li>
                <li><strong>Statut IUCN</strong> via GBIF iucnRedListCategory</li>
                <li><strong>Photo de l'espèce</strong> via GBIF species media</li>
                <li><strong>Liens</strong> vers la fiche GBIF et la page Wikipedia</li>
              </ul>
              <p className="mt-3">
                Le panneau <strong>Plateformes SINP régionales</strong> détecte automatiquement 
                la région administrative et propose des liens vers les plateformes locales du SINP 
                (Système d'Information Nature et Paysages) pour compléter les données GBIF avec 
                les observations régionales.
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
                  Liste Rouge IUCN
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
      </DialogContent>
    </Dialog>
  );
}
