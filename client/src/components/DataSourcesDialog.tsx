import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, ExternalLink, Mail, Search, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface DataSource {
  id: string;
  title: string;
  description: string;
  endpointURL: string;
  endpointDescription: string;
  theme: string[];
  license: string;
  accessService: string;
  dataAccess: string;
  contactPoint: string;
  spatialCoverage: string;
  taxonomicCoverage: string;
  status: "active" | "on-request" | "unreachable" | "pending" | string;
  level: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "API active", color: "text-green-700 bg-green-50 border-green-200", icon: CheckCircle2 },
  "on-request": { label: "Sur demande", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Mail },
  pending: { label: "En attente", color: "text-amber-700 bg-amber-50 border-amber-200", icon: Clock },
  unreachable: { label: "Injoignable", color: "text-red-700 bg-red-50 border-red-200", icon: XCircle },
};

export function DataSourcesDialog({ open, onOpenChange }: Props) {
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!open || sources) return;
    setLoading(true);
    setError(null);
    fetch("/api/data-sources")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Catalogue indisponible"))))
      .then((data) => setSources(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, sources]);

  const counts = useMemo(() => {
    if (!sources) return { all: 0, active: 0, "on-request": 0, pending: 0, unreachable: 0 };
    return sources.reduce(
      (acc, s) => {
        acc.all += 1;
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      },
      { all: 0, active: 0, "on-request": 0, pending: 0, unreachable: 0 } as Record<string, number>
    );
  }, [sources]);

  const filtered = useMemo(() => {
    if (!sources) return [];
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.spatialCoverage?.toLowerCase().includes(q) ||
        s.theme?.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [sources, search, statusFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]" data-testid="dialog-data-sources">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-teal-600" />
            Autres sources de données biodiversité
          </DialogTitle>
          <DialogDescription>
            Catalogue collaboratif de fournisseurs de données écologiques (DataCatalog).
            Inventaire Flash s'appuie sur GBIF, mais ces sources peuvent compléter votre diagnostic.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un fournisseur, un thème, une région…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                data-testid="input-search-sources"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "Tous" },
              { id: "active", label: "API active" },
              { id: "on-request", label: "Sur demande" },
              { id: "pending", label: "En attente" },
              { id: "unreachable", label: "Injoignable" },
            ].map((f) => {
              const isActive = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    isActive
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                  data-testid={`filter-status-${f.id}`}
                >
                  {f.label} ({counts[f.id] ?? 0})
                </button>
              );
            })}
          </div>
        </div>

        <ScrollArea className="max-h-[55vh] pr-4 -mr-4">
          {loading && (
            <div className="text-center py-12 text-sm text-gray-500">Chargement du catalogue…</div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && sources && (
            <div className="text-center py-12 text-sm text-gray-500">
              Aucun fournisseur ne correspond à votre recherche.
            </div>
          )}
          <div className="space-y-2">
            {filtered.map((s) => {
              const meta = STATUS_META[s.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              const portalUrl = s.endpointURL || s.endpointDescription;
              return (
                <div
                  key={s.id}
                  className="border border-gray-200 rounded-lg p-3 bg-white hover:border-teal-300 transition-colors"
                  data-testid={`source-card-${s.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-gray-900">{s.title}</h3>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${meta.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        {s.level && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {s.level}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{s.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.theme?.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
                        {s.spatialCoverage && <span>Couverture : <span className="text-gray-700">{s.spatialCoverage}</span></span>}
                        {s.accessService && <span>Accès : <span className="text-gray-700">{s.accessService}</span></span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {portalUrl && (
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 px-2 py-1 rounded hover:bg-teal-50"
                          data-testid={`link-portal-${s.id}`}
                        >
                          <ExternalLink className="h-3 w-3" /> Portail
                        </a>
                      )}
                      {s.contactPoint && (
                        <a
                          href={`mailto:${s.contactPoint}`}
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-50"
                          data-testid={`link-contact-${s.id}`}
                        >
                          <Mail className="h-3 w-3" /> Contact
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-gray-400 text-center mt-4 pb-2">
            Données issues de{" "}
            <a
              href="https://data-catalog-tool.replit.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-teal-600"
            >
              DataCatalog
            </a>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
