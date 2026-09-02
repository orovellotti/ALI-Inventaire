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
    role: "Occurrences géolocalisées",
    body: "Fournit les observations publiées par son réseau de participants, collections et institutions. ALi Inventaire ne retient que les occurrences réellement situées dans le rayon demandé, après filtrage spatial.",
    org: "Global Biodiversity Information Facility",
    url: "https://www.gbif.org/",
    tone: "teal",
  },
  {
    name: "iNaturalist",
    role: "Comptages agrégés par taxon",
    body: "L’API species_counts renvoie les taxons signalés dans le cercle demandé et leur nombre d’observations. ALi Inventaire ne réutilise pas les coordonnées individuelles de ces observations : il présente ce résultat comme un signal agrégé, non comme un point précis.",
    org: "iNaturalist / California Academy of Sciences",
    url: "https://api.inaturalist.org/v1/docs/",
    tone: "lime",
  },
  {
    name: "UICN",
    role: "Statut de menace",
    body: "Indique le statut de conservation mondial d’une espèce. Ce statut ne décrit ni sa présence locale ni son niveau d’enjeu territorial.",
    org: "Union internationale pour la conservation de la nature",
    url: "https://www.iucnredlist.org/",
    tone: "amber",
  },
  {
    name: "TAXREF / ALI",
    role: "Référentiel et statuts territoriaux",
    body: "TAXREF stabilise les noms et l’identité taxonomique. ALI apporte, quand disponible, des informations de statut à l’échelle du territoire.",
    org: "PatriNat — OFB, MNHN",
    url: "https://inpn.mnhn.fr/programme/referentiel-taxonomique-taxref",
    links: [{ label: "ALI Species", url: "https://alispecies.io/" }],
    tone: "violet",
  },
  {
    name: "IGN Géoplateforme",
    role: "Références géographiques",
    body: "Fournit les fonds, référentiels géographiques et services WFS des zonages, dont les zonages PatriNat utilisés pour contextualiser l’aire. Ce n’est pas une source d’observations d’espèces.",
    org: "Institut national de l’information géographique et forestière",
    url: "https://geoservices.ign.fr/",
    tone: "blue",
  },
  {
    name: "EEA Natura 2000",
    role: "Espèces et sites Natura 2000",
    body: "Documente les espèces d’intérêt communautaire et les sites Natura 2000. Une espèce listée pour un site n’est pas automatiquement une occurrence dans votre rayon.",
    org: "Agence européenne pour l’environnement",
    url: "https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4",
    tone: "green",
  },
  {
    name: "EEA DAT-143",
    role: "Groupes d’habitats compatibles",
    body: "Relie une espèce Natura 2000 à un habitat uniquement lorsqu’ils partagent exactement le même code de groupe écologique EEA DAT-143. Le niveau du groupe sert ensuite à pondérer le score.",
    org: "Agence européenne pour l’environnement",
    url: "https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3",
    tone: "orange",
  },
  {
    name: "PatriNat ZNIEFF",
    role: "Mentions documentaires",
    body: "Signale les mentions ZNIEFF de type D, E ou A à l’échelle de la zone. Elles contextualisent le territoire : elles ne sont jamais transformées en occurrences.",
    org: "PatriNat — OFB, MNHN",
    url: "https://www.patrinat.fr/fr/page-temporaire-de-telechargement-des-referentiels-de-donnees-lies-linpn-7353",
    tone: "rose",
  },
  {
    name: "Nominatim / OpenStreetMap",
    role: "Recherche et repérage des lieux",
    body: "Localise un toponyme et aide à nommer le point d’étude. Le service ne valide ni une observation ni un statut écologique.",
    org: "OpenStreetMap Foundation et communauté OSM",
    url: "https://nominatim.org/",
    links: [{ label: "OpenStreetMap", url: "https://www.openstreetmap.org/" }],
    tone: "slate",
  },
  {
    name: "SINP",
    role: "Portails régionaux à consulter",
    body: "Oriente vers les plateformes régionales du Système d’information de l’inventaire du patrimoine naturel pour approfondir l’analyse.",
    org: "Ministère de la Transition écologique",
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
            Source officielle <ArrowUpRight className="h-3.5 w-3.5" />
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
    document.title = "Méthodologie et sources | ALi Inventaire";
    if (description) {
      description.content =
        "Comprendre la méthode, la hiérarchie des preuves et les sources publiques utilisées par ALi Inventaire.";
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
            <span className="font-semibold tracking-tight">ALi Inventaire</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/60 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-500 hover:text-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600">
            <ArrowLeft className="h-4 w-4" /> Retour à la carte
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
        <div className="pointer-events-none absolute -right-32 -top-28 h-80 w-80 rounded-full border-[36px] border-[#d7e7d3] opacity-70" />
        <div className="relative max-w-3xl">
          <p className="mb-5 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            <span className="h-px w-8 bg-teal-600" /> Carnet de méthode
          </p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[0.98] tracking-[-0.035em] text-[#193c32] sm:text-7xl">
            Lire un territoire avant d’y aller.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            ALi Inventaire assemble des informations publiques pour préparer un premier regard écologique. Cette page explique ce qui est mesuré, ce qui est seulement documenté, et ce que l’outil ne peut pas conclure.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <a href="#preuves" className="rounded-full bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-teal-800">Voir la hiérarchie des preuves</a>
            <a href="#sources" className="rounded-full border border-slate-300 bg-white/60 px-4 py-2.5 font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-800">Explorer les sources</a>
          </div>
        </div>
      </section>

      <section id="preuves" className="border-y border-[#dce6d7] bg-[#e8f0e5]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">01 · Hiérarchie de lecture</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight text-[#193c32]">Toutes les informations n’ont pas le même poids.</h2>
            <p className="mt-5 max-w-md leading-7 text-slate-600">Le résultat distingue les faits localisés, les référentiels qui les qualifient et les indices de contexte. C’est cette séparation qui évite les raccourcis.</p>
          </div>
          <div className="space-y-3">
            {[
              ["01", "Occurrence GBIF dans le rayon", "Point d’observation GBIF dont les coordonnées sont vérifiées par distance et tombent effectivement dans l’aire sélectionnée.", FileCheck2],
              ["02", "Signal iNaturalist dans le cercle", "Taxon retourné par le comptage agrégé species_counts pour le centre et le rayon demandés. Ses coordonnées individuelles ne sont pas réutilisées par l’outil.", FileCheck2],
              ["03", "Statut de l’espèce", "Qualification TAXREF/ALI ou UICN. Un statut décrit une espèce, pas la preuve de sa présence ici.", ShieldCheck],
              ["04", "Compatibilité écologique", "Une espèce Natura 2000 et un habitat ne sont rapprochés que s’ils partagent exactement le même code de groupe écologique EEA DAT-143.", Layers3],
              ["05", "Preuve documentaire territoriale", "ZNIEFF et zonages IGN/PatriNat décrivent le contexte de la zone. Ils ne sont jamais convertis en occurrences.", Layers3],
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#a9d1a0]">02 · Ce que calcule l’outil</p>
            <h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight">Un filtre spatial, pas une promesse d’exhaustivité.</h2>
            <div className="mt-8 space-y-5 text-sm leading-7 text-[#d2e1cf]">
              <p><strong className="text-white">Données naturalistes :</strong> les coordonnées GBIF sont filtrées par distance pour ne conserver que les points dans les rayons actifs. iNaturalist est interrogé séparément avec ces rayons et renvoie un comptage agrégé par taxon ; l’outil ne récupère ni ne re-filtre les coordonnées individuelles correspondantes.</p>
              <p><strong className="text-white">Aires :</strong> immédiate, rapprochée et éloignée sont indépendantes et ajustables. Le résultat fusionne les espèces des aires actives, en conservant la possibilité de lire leur contexte.</p>
              <p><strong className="text-white">Statuts et contexte :</strong> TAXREF/ALI et UICN décrivent le taxon ; Natura 2000 et DAT-143 qualifient une compatibilité écologique exacte ; les zonages décrivent le territoire. Rien ne transforme une mention territoriale en observation.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-[#d9e4d5] bg-[#fbfcf8] p-7 sm:p-10">
            <CircleAlert className="h-7 w-7 text-amber-700" />
            <h2 className="mt-5 font-serif text-3xl text-[#193c32]">La règle la plus importante</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">Absence de données ne signifie pas absence d’espèce.</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">Une donnée peut manquer, être sensible, ancienne, non publiée ou simplement située hors du rayon. L’absence dans ce résultat appelle une vérification, jamais une conclusion.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">03 · Du site au diagnostic</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight text-[#193c32]">Un parcours lisible, de la carte au terrain.</h2>
            <p className="mt-5 leading-7 text-slate-600">Chaque étape conserve la trace de ce qu’elle apporte — et de ce qu’elle ne permet pas d’affirmer.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              ["Définir l’emprise", "Placez un point, recherchez un lieu-dit ou chargez un shapefile. Le centroïde sert de repère et l’emprise reste visible sur la carte."],
              ["Choisir les aires", "Activez et ajustez les rayons immédiat, rapproché et éloigné selon la question du projet."],
              ["Interroger les données naturalistes", "Les points GBIF sont vérifiés par distance. iNaturalist renvoie séparément un comptage agrégé de taxons pour chaque cercle, sans coordonnées individuelles réutilisées."],
              ["Qualifier sans surinterpréter", "Lisez séparément statuts TAXREF/ALI et UICN, compatibilités Natura/EEA exactes, puis preuves documentaires ZNIEFF et zonages."],
              ["Préparer la visite", "Repérez les taxons et secteurs à vérifier, consultez les portails SINP et adaptez les protocoles aux habitats et aux saisons."],
              ["Conclure sur le terrain", "Le pré-diagnostic oriente. Seules des prospections et une expertise écologique peuvent confirmer une présence, une absence ou un enjeu."],
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
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">04 · Cas à ne pas confondre</p>
            <h2 className="mt-4 font-serif text-4xl text-[#193c32]">Présence, statut, habitat, zonage.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              ["Natura 2000 n’est pas une occurrence", "La liste d’espèces d’un site Natura 2000 décrit sa documentation. Elle ne prouve pas que l’espèce est observée dans votre aire."],
              ["DAT-143 exige le même groupe écologique", "La compatibilité exige une égalité exacte du code de groupe EEA DAT-143. Le niveau du groupe pondère ensuite le score ; il ne sert pas à créer une correspondance. Aucun rapprochement n’est fait par nom approchant."],
              ["ZNIEFF : D, E et A sont des mentions", "D désigne une espèce déterminante, E une autre espèce à enjeux et A une autre espèce documentée. Les données confidentielles C sont exclues. Dans tous les cas, la mention éclaire la zone mais ne devient jamais un point d’observation."],
              ["Pré-diagnostic, pas inventaire terrain", "Le résultat aide à cadrer une visite, choisir les vigilances et préparer les demandes de données. Il ne remplace ni prospection, ni protocole, ni expertise."],
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
          <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">05 · Registre des sources</p><h2 className="mt-4 font-serif text-4xl text-[#193c32]">Qui fournit quoi ?</h2></div>
          <p className="max-w-sm text-sm leading-6 text-slate-500">Les liens ci-dessous pointent vers les organismes ou catalogues officiels de référence.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sources.map((source) => <SourceCard key={source.name} source={source} />)}</div>
        <div className="mt-8 rounded-2xl border border-[#d9e4d5] bg-[#f7faf5] p-6 sm:p-7">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Accès agent IA</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            L’ensemble de ces outils — géocodage, inventaires, fiches espèces, analyse des espèces à enjeux — est aussi exposé
            via un serveur <strong className="text-slate-900">MCP</strong> (Model Context Protocol). Vous pouvez ainsi interroger
            ALi Inventaire directement depuis Claude, ChatGPT ou tout client compatible. La configuration détaillée est
            accessible depuis le bouton <strong className="text-slate-900">MCP</strong> sur la carte.
          </p>
        </div>
      </section>

      <section className="bg-[#dcead8]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">06 · Prochaine étape</p><h2 className="mt-3 font-serif text-3xl text-[#193c32]">Prenez ces résultats comme un carnet de préparation.</h2><p className="mt-3 max-w-2xl leading-7 text-slate-600">Croisez-les avec le contexte local, les données régionales du SINP et une visite de terrain adaptée aux enjeux pressentis.</p></div>
          <Link href="/" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-700"><Map className="h-4 w-4" /> Ouvrir la carte</Link>
        </div>
      </section>

      <footer className="border-t border-[#dce6d7] bg-[#f3f6ef]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-700" /> Méthode publique · ALi Inventaire</span>
          <span>Une lecture rigoureuse commence par savoir ce que l’on ne sait pas.</span>
        </div>
      </footer>
    </main>
  );
}