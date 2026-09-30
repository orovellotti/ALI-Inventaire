import type { StudyArea, ProjectPreset, TaxonGroupDef } from "@shared/types";

export const STUDY_AREAS: StudyArea[] = [
  { id: "immediate", label: "Immediate study area", radius: 500, color: "#0d9488" },
  { id: "rapprochee", label: "Near study area", radius: 2000, color: "#2563eb", dashArray: "10, 8" },
  { id: "eloignee", label: "Wider study area", radius: 6000, color: "#6366f1", dashArray: "5, 10" },
];

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "custom", label: "Custom", icon: "⚙️",
    description: "Manually configured study areas",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: false }, eloignee: { radius: 6000, enabled: false } },
  },
  {
    id: "eolien", label: "Wind farm", icon: "💨",
    description: "Onshore wind farm",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 5000, enabled: true }, eloignee: { radius: 15000, enabled: true } },
  },
  {
    id: "pv_petit", label: "Small solar PV", icon: "☀️",
    description: "Ground-mounted solar PV under 3 ha",
    zones: { immediate: { radius: 200, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "pv_moyen", label: "Medium solar PV", icon: "☀️",
    description: "Ground-mounted solar PV 3–50 ha",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
  {
    id: "pv_grand", label: "Large solar PV", icon: "☀️",
    description: "Ground-mounted solar PV over 50 ha",
    zones: { immediate: { radius: 1000, enabled: true }, rapprochee: { radius: 3000, enabled: true }, eloignee: { radius: 10000, enabled: true } },
  },
  {
    id: "urbanisation", label: "Urban development", icon: "🏗️",
    description: "Urban development and housing",
    zones: { immediate: { radius: 300, enabled: true }, rapprochee: { radius: 1000, enabled: true }, eloignee: { radius: 3000, enabled: true } },
  },
  {
    id: "route", label: "Linear infrastructure", icon: "🛣️",
    description: "Road, rail or pipeline",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 5000, enabled: true } },
  },
  {
    id: "carriere", label: "Quarry / industrial site", icon: "⛏️",
    description: "Quarry or classified industrial facility",
    zones: { immediate: { radius: 500, enabled: true }, rapprochee: { radius: 2000, enabled: true }, eloignee: { radius: 6000, enabled: true } },
  },
];

export const TAXON_GROUPS: TaxonGroupDef[] = [
  { id: "oiseaux", label: "Birds", icon: "🐦" },
  { id: "mammiferes", label: "Mammals", icon: "🦊" },
  { id: "reptiles", label: "Reptiles", icon: "🦎" },
  { id: "amphibiens", label: "Amphibians", icon: "🐸" },
  { id: "poissons", label: "Fish", icon: "🐟" },
  { id: "insectes", label: "Insects", icon: "🦋" },
  { id: "arachnides", label: "Arachnids", icon: "🕷️" },
  { id: "crustaces", label: "Crustaceans", icon: "🦀" },
  { id: "myriapodes", label: "Myriapods", icon: "〰️" },
  { id: "mollusques", label: "Molluscs", icon: "🐌" },
  { id: "annelides", label: "Annelids", icon: "〰️" },
  { id: "cnidaires", label: "Cnidarians", icon: "◉" },
  { id: "echinodermes", label: "Echinoderms", icon: "★" },
  { id: "eponges", label: "Sponges", icon: "◌" },
  { id: "autres-invertebres", label: "Other invertebrates", icon: "◇" },
  { id: "algues", label: "Algae", icon: "≋" },
  { id: "plantes", label: "Terrestrial plants", icon: "🌿" },
  { id: "champignons", label: "Fungi", icon: "🍄" },
  { id: "autres", label: "Other organisms", icon: "🔬" },
];
