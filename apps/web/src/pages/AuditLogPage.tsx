import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { api } from "../lib/api.js";
import { fmt } from "../lib/format.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diffJson: string | null;
  createdAt: number;
}

function actionLabel(action: string) {
  switch (action) {
    case "POST": return "Buat";
    case "PUT": return "Update";
    case "PATCH": return "Edit";
    case "DELETE": return "Hapus";
    default: return action;
  }
}

export function AuditLogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await api.auditLog.list();
      setEntries(res.rows as AuditEntry[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat audit log.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Audit Log" back onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-primary-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Audit Log</p>
            <p className="text-xs text-muted-fg">Riwayat perubahan sistem</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-fg text-center py-8 italic">Belum ada entri audit log.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="bg-card rounded-2xl border border-border px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-primary bg-opacity-10 text-primary">
                    {actionLabel(entry.action)} {entry.entityType}
                  </span>
                  <span className="text-[10px] text-muted-fg">{fmt(entry.createdAt)}</span>
                </div>
                {entry.entityId && (
                  <p className="text-xs text-muted-fg font-mono">ID: {entry.entityId}</p>
                )}
                {entry.diffJson && (
                  <pre className="text-[10px] text-muted-fg bg-surface rounded-lg p-2 overflow-x-auto border border-border">
                    {entry.diffJson.length > 200 ? entry.diffJson.slice(0, 200) + "…" : entry.diffJson}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
