import type { StudyArea, ProjectPreset, TaxonGroupDef } from "@shared/types";

export const STUDY_AREAS: StudyArea[] = [
  { id: "immediate", label: "Aire d'étude immédiate", radius: 500, color: "#0d9488" },
  { id: "rapprochee", label: "Aire d'étude rapprochée", radius: 2000, color: "#2563eb", dashArray: "10, 8" },
  { id: "eloignee", label: "Aire d'étude éloignée", radius: 6000, color: "#6366f1", dashArray: "5, 10" },
];

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "custom", label: "Personnalisé", icon: "⚙️",
    description: "Configuration manuelle des aires d'étude",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: false }, eloignee: { radius: 6000, enabled: false } },
  },
  {
    id: "eolien", label: "Éolien", icon: "💨",
    description: "Parc éolien terrestre",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 5000, enabled: true }, eloignee: { radius: 15000, enabled: true } },
  },
  {
    id: "pv_petit", label: "PV sol petit", icon: "☀️",
    description: "Photovoltaïque au sol < 3 ha",
    zones: { immediate: { radius: 200, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "pv_moyen", label: "PV sol moyen", icon: "☀️",
    description: "Photovoltaïque au sol 3-50 ha",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
  {
    id: "pv_grand", label: "PV sol grand", icon: "☀️",
    description: "Photovoltaïque au sol > 50 ha",
    zones: { immediate: { radius: 1000, enabled: true }, rapprochee: { radius: 3000, enabled: true }, eloignee: { radius: 10000, enabled: true } },
  },
  {
    id: "urbanisation", label: "Urbanisation", icon: "🏗️",
    description: "Aménagement urbain, lotissement, ZAC",
    zones: { immediate: { radius: 300, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "route", label: "Infrastructure linéaire", icon: "🛣️",
    description: "Route, voie ferrée, canalisation",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 5000, enabled: true } },
  },
  {
    id: "carriere", label: "Carrière / ICPE", icon: "⛏️",
    description: "Carrière, installation classée",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
];

export const TAXON_GROUPS: TaxonGroupDef[] = [
  { id: "oiseaux", label: "Oiseaux", icon: "🐦" },
  { id: "mammiferes", label: "Mammifères", icon: "🦊" },
  { id: "reptiles", label: "Reptiles", icon: "🦎" },
  { id: "amphibiens", label: "Amphibiens", icon: "🐸" },
  { id: "poissons", label: "Poissons", icon: "🐟" },
  { id: "insectes", label: "Insectes", icon: "🦋" },
  { id: "arachnides", label: "Arachnides", icon: "🕷️" },
  { id: "mollusques", label: "Mollusques", icon: "🐌" },
  { id: "plantes", label: "Plantes", icon: "🌿" },
  { id: "champignons", label: "Champignons", icon: "🍄" },
  { id: "autres", label: "Autres", icon: "🔬" },
];
