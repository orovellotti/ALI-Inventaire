import { Link } from "wouter";
import { useEffect } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  FileCheck2,
  Layers3,
  Leaf,
  Map,
  ShieldCheck,
} from "lucide-react";

type Source = {
  name: string;
  role: string;
  body: string;
  org: string;
  url: string;
  tone: string;
  links?: { label: string; url: string }[];
};

const sources: Source[] = [
  {
    name: "GBIF",
    role: "Georeferenced observations",
    body: "Publishes observations from contributors, collections and institutions worldwide. ALi Inventory spatially filters records to retain only points within the selected radius.",
    org: "Global Biodiversity Information Facility",
    url: "https://www.gbif.org/",
    tone: "teal",
  },
  {
    name: "iNaturalist",
    role: "Aggregated counts by taxon",
    body: "The species_counts API returns taxa reported within the requested circle and their observation counts. ALi Inventory treats this as an aggregate signal, not as precisely located individual observations.",
    org: "iNaturalist / California Academy of Sciences",
    url: "https://api.inaturalist.org/v1/docs/",
    tone: "lime",
  },
  {
    name: "IUCN",
    role: "Conservation status",
    body: "Provides global conservation status, which does not establish local presence or local conservation priority.",
    org: "International Union for Conservation of Nature",
    url: "https://www.iucnredlist.org/",
    tone: "amber",
  },
  {
    name: "TAXREF / ALI",
    role: "Taxonomy and regional status",
    body: "TAXREF resolves taxonomy. ALI provides territorial status information where available; coverage is not global.",
    org: "PatriNat — OFB, MNHN",
    url: "https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref",
    links: [{ label: "ALI Species", url: "https://alispecies.io/" }],
    tone: "violet",
  },
  {
    name: "IGN Géoplateforme",
    role: "French geographic reference data",
    body: "Provides French basemaps and WFS services, including PatriNat designated areas. These are contextual layers, not species observations, and do not have global coverage.",
    org: "French National Institute of Geographic and Forest Information",
    url: "https://geoservices.ign.fr/",
    tone: "blue",
  },
  {
    name: "EEA Natura 2000",
    role: "European protected sites and species",
    body: "Documents Natura 2000 sites and species of Community interest in Europe. A species listed for a site is not necessarily observed within your study radius.",
    org: "European Environment Agency",
    url: "https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4",
    tone: "green",
  },
  {
    name: "EEA DAT-143",
    role: "Compatible habitat groups",
    body: "Links a Natura 2000 species to a habitat only when their EEA DAT-143 ecological group codes match exactly. The group level then weights the score.",
    org: "European Environment Agency",
    url: "https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3",
    tone: "orange",
  },
  {
    name: "PatriNat ZNIEFF",
    role: "French area records",
    body: "Provides ZNIEFF area-level records of types D, E or A in France. These contextual records are never treated as observations.",
    org: "PatriNat — OFB, MNHN",
    url: "https://www.patrinat.fr/fr/page-temporaire-de-telechargement-des-referentiels-de-donnees-lies-linpn-7353",
    tone: "rose",
  },
  {
    name: "Nominatim / OpenStreetMap",
    role: "Worldwide place search",
    body: "Locates and names study sites worldwide. It does not verify species observations or ecological status.",
    org: "OpenStreetMap Foundation and contributors",
    url: "https://nominatim.org/",
    links: [{ label: "OpenStreetMap", url: "https://www.openstreetmap.org/" }],
    tone: "slate",
  },
  {
    name: "SINP",
    role: "French regional data portals",
    body: "Directs users to French regional natural heritage information portals for further research. Outside France, consult the relevant local authorities.",
    org: "French Ministry for Ecological Transition",
    url: "https://www.naturefrance.fr/sinp",
    tone: "cyan",
  },
];

const toneClasses: Record<string, string> = {
  teal: "bg-teal-500",
  lime: "bg-lime-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
  cyan: "bg-cyan-500",
};

function SourceCard({ source }: { source: Source }) {
  return (
    <article className="group rounded-2xl border border-slate-200/80 bg-white/75 p-5 shadow-[0_10px_35px_rgba(32,57,46,0.05)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">{source.role}</p>
          <h3 className="mt-1 font-serif text-xl text-slate-900">{source.name}</h3>
        </div>
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneClasses[source.tone]}`} aria-hidden="true" />
      </div>
      <p className="text-sm leading-6 text-slate-600">{source.body}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-xs leading-4 text-slate-400">{source.org}</span>
        <div className="flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-1">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900">
             Official source <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          {source.links?.map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900">
              {link.label} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function Methodologie() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = "Methodology and sources | ALi Inventory";
    if (description) {
      description.content =
        "Understand the methodology, evidence hierarchy and public sources used by ALi Inventory. Global data coverage varies.";
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f3f6ef] text-slate-800">
      <header className="border-b border-[#dce6d7] bg-[#f3f6ef]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3 rounded-xl text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm"><Leaf className="h-5 w-5" /></span>
             <span className="font-semibold tracking-tight">ALi Inventory</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/60 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-500 hover:text-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600">
             <ArrowLeft className="h-4 w-4" /> Back to map
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-28 h-80 w-80 rounded-full border-[36px] border-[#d7e7d3] opacity-70" />
        <div className="relative max-w-3xl">
          <p className="mb-5 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
             <span className="h-px w-8 bg-teal-600" /> Methodology notes
          </p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[0.98] tracking-[-0.035em] text-[#193c32] sm:text-7xl">
             Understand a place before you visit.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
             ALi Inventory brings together public information for an initial ecological assessment worldwide. This page explains what is measured, what is only documented and what cannot be concluded. Public-data coverage varies by region.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
             <a href="#preuves" className="rounded-full bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-800">Explore the evidence hierarchy</a>
             <a href="#sources" className="rounded-full border border-slate-300 bg-white/60 px-4 py-2.5 font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-800">Explore the sources</a>
          </div>
        </div>
      </section>

      <section id="preuves" className="border-y border-[#dce6d7] bg-[#e8f0e5]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div>
             <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">01 · Evidence hierarchy</p>
             <h2 className="mt-4 font-serif text-4xl leading-tight text-[#193c32]">Not all information carries equal weight.</h2>
             <p className="mt-5 max-w-md leading-7 text-slate-600">Results distinguish located observations, reference data describing them and contextual indicators. This separation prevents overinterpretation.</p>
          </div>
          <div className="space-y-3">
            {[
               ["01", "GBIF observation within the radius", "A georeferenced GBIF observation verified by distance to fall within the selected area.", FileCheck2],
               ["02", "iNaturalist signal within the circle", "A taxon returned by aggregate species_counts for the requested center and radius. Individual coordinates are not reused.", FileCheck2],
               ["03", "Species status", "TAXREF/ALI or IUCN classifications describe a species, not proof of its presence here.", ShieldCheck],
               ["04", "Ecological compatibility", "A Natura 2000 species is linked to a habitat only when their EEA DAT-143 ecological group codes match exactly.", Layers3],
               ["05", "Regional documentary evidence", "French ZNIEFF and IGN/PatriNat layers describe local context. They are never converted into observations.", Layers3],
            ].map(([number, title, body, Icon]) => (
              <div key={number as string} className="flex gap-4 rounded-2xl border border-[#cbdcc8] bg-[#f7faf5] p-5">
                <span className="font-mono text-xs font-bold text-teal-700">{number as string}</span>
                <div><h3 className="font-semibold text-slate-900">{title as string}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body as string}</p></div>
                <Icon className="ml-auto hidden h-5 w-5 shrink-0 text-teal-700 sm:block" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl bg-[#193c32] p-7 text-[#eef5ea] sm:p-10">
             <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#a9d1a0]">02 · What the tool calculates</p>
             <h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight">Spatial filtering, not a promise of completeness.</h2>
            <div className="mt-8 space-y-5 text-sm leading-7 text-[#d2e1cf]">
               <p><strong className="text-white">Species data:</strong> GBIF coordinates are distance-filtered within active radii. iNaturalist is queried separately and returns aggregate taxon counts; individual coordinates are not retrieved or re-filtered.</p>
               <p><strong className="text-white">Study areas:</strong> immediate, nearby and extended areas can be adjusted independently. Species across enabled areas are combined while retaining their context.</p>
               <p><strong className="text-white">Status and context:</strong> TAXREF/ALI and IUCN describe taxa; Natura 2000 and DAT-143 describe exact ecological compatibility; designated areas describe regional context. Territorial records are not observations.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-[#d9e4d5] bg-[#fbfcf8] p-7 sm:p-10">
            <CircleAlert className="h-7 w-7 text-amber-700" />
             <h2 className="mt-5 font-serif text-3xl text-[#193c32]">The most important rule</h2>
             <p className="mt-4 text-lg leading-8 text-slate-600">No data does not mean no species.</p>
             <p className="mt-4 text-sm leading-6 text-slate-500">Data may be missing, sensitive, old, unpublished or outside the radius. Coverage varies worldwide. A missing result calls for verification, never a definitive conclusion.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
             <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">03 · From site to assessment</p>
             <h2 className="mt-4 font-serif text-4xl leading-tight text-[#193c32]">A clear path from map to field.</h2>
             <p className="mt-5 leading-7 text-slate-600">Each step shows what it contributes and what it cannot establish.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
               ["Define the boundary", "Place a point, search for a location or upload a shapefile. Its centroid serves as a reference and the boundary remains visible on the map."],
               ["Choose study areas", "Enable and adjust immediate, nearby and extended radii to suit the project."],
               ["Query species data", "GBIF points are distance-checked. iNaturalist separately returns aggregate taxon counts for each circle, without reusing individual coordinates."],
               ["Interpret carefully", "Read TAXREF/ALI and IUCN statuses separately from exact Natura/EEA compatibility and regional ZNIEFF or designated-area records."],
               ["Prepare the visit", "Identify taxa and areas to verify, consult relevant local data portals and adapt survey methods to habitats and seasons."],
               ["Confirm in the field", "This assessment helps direct fieldwork. Only surveys and ecological expertise can confirm presence, absence or conservation importance."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-[#d9e4d5] bg-white p-5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f0e5] font-mono text-xs font-bold text-teal-800">{String(index + 1).padStart(2, "0")}</span>
                <div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-[#dce6d7] bg-[#f9fbf7]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-2xl">
             <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">04 · Important distinctions</p>
             <h2 className="mt-4 font-serif text-4xl text-[#193c32]">Presence, status, habitat and designated areas.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
               ["Natura 2000 is not an observation", "A site's species list documents that site. It does not prove the species was observed within your area."],
               ["DAT-143 requires the same ecological group", "Compatibility requires an exact EEA DAT-143 group-code match. Group level weights the score; names are never approximately matched."],
               ["ZNIEFF: D, E and A are records", "D marks a determining species, E another species of concern and A another documented species. Confidential C data are excluded. Records provide regional context, not observation points."],
               ["Preliminary assessment, not a field inventory", "Use the results to plan a visit and request data. They do not replace surveys, protocols or expert assessment."],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="flex gap-3 font-semibold text-slate-900"><Check className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />{title}</h3>
                <p className="mt-3 pl-8 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="sources" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
           <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">05 · Source register</p><h2 className="mt-4 font-serif text-4xl text-[#193c32]">What does each source provide?</h2></div>
           <p className="max-w-sm text-sm leading-6 text-slate-500">These links lead to official organizations or source catalogs. Geographic coverage varies.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sources.map((source) => <SourceCard key={source.name} source={source} />)}</div>
        <div className="mt-8 rounded-2xl border border-[#d9e4d5] bg-[#f7faf5] p-6 sm:p-7">
           <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">AI agent access</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
             Geocoding, inventories, species profiles and priority-species analysis are also available through an
             <strong className="text-slate-900"> MCP</strong> (Model Context Protocol) server. Use ALi Inventory from
             Claude, ChatGPT or another compatible client. Setup instructions are available through the
             <strong className="text-slate-900"> MCP</strong> button on the map.
          </p>
        </div>
      </section>

      <section className="bg-[#dcead8]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
           <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">06 · Next step</p><h2 className="mt-3 font-serif text-3xl text-[#193c32]">Use these results to plan further work.</h2><p className="mt-3 max-w-2xl leading-7 text-slate-600">Compare them with local context, relevant regional data and a field visit tailored to potential concerns.</p></div>
           <Link href="/" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-700"><Map className="h-4 w-4" /> Open map</Link>
        </div>
      </section>

      <footer className="border-t border-[#dce6d7] bg-[#f3f6ef]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
           <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-700" /> Public methodology · ALi Inventory</span>
           <span>Sound interpretation begins with knowing what remains unknown.</span>
        </div>
      </footer>
    </main>
  );
}