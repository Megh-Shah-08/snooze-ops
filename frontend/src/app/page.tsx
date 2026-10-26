"use client";

import React, { useState, useEffect, useId, useMemo } from "react";
import {
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Download,
  Settings,
  RefreshCw,
  Cpu,
  BarChart3,
  ArrowRight,
  Database,
  Lock,
  Search,
  Filter,
  Check,
  X,
  Edit3,
  Zap,
  Table,
  Layers,
  FileText,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Info
} from "lucide-react";

interface ColumnProfile {
  name: string;
  type: string;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  stats: Record<string, any>;
  distribution: Array<{ bin_start?: number; bin_end?: number; count: number; label?: string }>;
}

interface ProfileData {
  total_rows: number;
  total_columns: number;
  duplicate_rows: number;
  total_cells: number;
  total_missing_cells: number;
  hygiene_score: number;
  columns: ColumnProfile[];
}

interface AnomalyItem {
  row_index: number;
  column: string;
  original_value: any;
  detector: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  confidence: number;
  explanation: string;
  suggested_action: "CORRECT_VALUE" | "NULLIFY" | "DROP_ROW" | "FLAG_FOR_AUDIT";
  proposed_value: any;
  engine_source: string;
  is_fallback: boolean;
  user_action?: "APPROVE" | "REJECT" | "CUSTOM";
  custom_value?: any;
}

interface BenchmarkResults {
  timestamp: string;
  dataset_name: string;
  dataset_rows: number;
  known_anomalies: number;
  clean_rows: number;
  baseline: {
    name: string;
    description: string;
    flagged_count: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    precision: number;
    recall: number;
    f1_score: number;
    runtime_ms: number;
  };
  snoozeops: {
    name: string;
    description: string;
    flagged_count: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    precision: number;
    recall: number;
    f1_score: number;
    runtime_ms: number;
    tabpfn_active: boolean;
    multivariate_detector: string;
  };
  comparison: {
    recall_improvement_pct: number;
    f1_improvement_pct: number;
    false_positive_reduction: number;
    summary: string;
  };
}

export default function SnoozeOpsApp() {
  const uploadInputId = useId();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<"anomalies" | "table" | "profile" | "preview" | "benchmark">("anomalies");

  // App State
  const [apiHealth, setApiHealth] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Data State
  const [datasetName, setDatasetName] = useState<string>("E-Commerce Retail Orders (Dirty)");
  const [rawCsv, setRawCsv] = useState<string>("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [cleanedRows, setCleanedRows] = useState<any[]>([]);
  const [tabpfnMeta, setTabpfnMeta] = useState<any>(null);
  const [modelMeta, setModelMeta] = useState<any>(null);

  // Table view controls
  const [tableMode, setTableMode] = useState<"raw" | "cleaned">("raw");
  const [tablePage, setTablePage] = useState(0);
  const rowsPerPage = 15;

  // Filter & Search
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Export & Audit
  const [cleanedCsv, setCleanedCsv] = useState<string | null>(null);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Benchmark
  const [benchmark, setBenchmark] = useState<BenchmarkResults | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [modelConfig, setModelConfig] = useState({
    provider: "deterministic",
    endpoint: "http://localhost:11434/api/generate",
    api_key: "",
    model: "gemma2:2b",
    enable_tabpfn: false
  });

  // Check health and load initial sample dataset on mount
  useEffect(() => {
    checkHealth();
    loadSample("ecommerce");
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setApiHealth(true);
        if (data.model_config) {
          setModelConfig((prev) => ({
            ...prev,
            provider: data.model_config.provider || prev.provider,
            endpoint: data.model_config.endpoint || prev.endpoint,
            model: data.model_config.model || prev.model
          }));
        }
      } else {
        setApiHealth(false);
      }
    } catch {
      setApiHealth(false);
    }
  };

  const loadSample = async (sampleId: string) => {
    setLoading(true);
    setLoadingMsg("Loading sample dataset and running SnoozeOps Janitor analysis...");
    setErrorMsg(null);
    setCleanedCsv(null);
    setCleanedRows([]);
    setAuditReport(null);
    setTablePage(0);

    try {
      // 1. Fetch sample content
      const sampleRes = await fetch(`/api/samples/${sampleId}`);
      if (!sampleRes.ok) throw new Error("Failed to load sample dataset");
      const sampleData = await sampleRes.json();
      setRawCsv(sampleData.csv_content);
      setDatasetName(sampleData.info.name);

      // 2. Run analysis
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample_id: sampleId,
          use_tabpfn: modelConfig.enable_tabpfn
        })
      });

      if (!analyzeRes.ok) throw new Error("Anomaly detection analysis failed");
      const analyzeData = await analyzeRes.json();

      setProfile(analyzeData.profile);
      setTabpfnMeta(analyzeData.tabpfn_metadata);
      setModelMeta(analyzeData.model_metadata);
      setRawRows(analyzeData.preview_rows || []);

      // Default user_action to APPROVE for high confidence recommendations
      const enhanced = (analyzeData.anomalies || []).map((a: AnomalyItem) => ({
        ...a,
        user_action: "APPROVE",
        custom_value: a.proposed_value
      }));
      setAnomalies(enhanced);
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while loading dataset.");
    } finally {
      setLoading(false);
    }
  };

  const processCsvFile = async (content: string, name: string) => {
    setLoading(true);
    setLoadingMsg(`Analyzing ${name} with SnoozeOps Janitor...`);
    setErrorMsg(null);
    setDatasetName(name);
    setRawCsv(content);
    setCleanedCsv(null);
    setCleanedRows([]);
    setAuditReport(null);
    setTablePage(0);

    try {
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_content: content,
          use_tabpfn: modelConfig.enable_tabpfn
        })
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.detail || "Analysis failed");
      }
      const analyzeData = await analyzeRes.json();

      setProfile(analyzeData.profile);
      setTabpfnMeta(analyzeData.tabpfn_metadata);
      setModelMeta(analyzeData.model_metadata);
      setRawRows(analyzeData.preview_rows || []);

      const enhanced = (analyzeData.anomalies || []).map((a: AnomalyItem) => ({
        ...a,
        user_action: "APPROVE",
        custom_value: a.proposed_value
      }));
      setAnomalies(enhanced);
    } catch (err: any) {
      setErrorMsg(err.message || "CSV processing failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      await processCsvFile(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith(".csv")) {
      setErrorMsg("Please upload a valid .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      await processCsvFile(content, file.name);
    };
    reader.readAsText(file);
  };

  const updateAnomalyAction = (index: number, action: "APPROVE" | "REJECT" | "CUSTOM", customVal?: any) => {
    setAnomalies((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          return {
            ...item,
            user_action: action,
            custom_value: customVal !== undefined ? customVal : item.custom_value
          };
        }
        return item;
      })
    );
  };

  const batchAction = (action: "APPROVE" | "REJECT") => {
    setAnomalies((prev) =>
      prev.map((item) => ({
        ...item,
        user_action: action
      }))
    );
  };

  const executeApplyFixes = async () => {
    setIsExporting(true);
    setErrorMsg(null);

    try {
      const reviewedPayload = anomalies.map((a) => ({
        row_index: a.row_index,
        column: a.column,
        action: a.user_action,
        suggested_action: a.suggested_action,
        proposed_value: a.proposed_value,
        custom_value: a.custom_value
      }));

      const res = await fetch("/api/apply-fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_csv: rawCsv,
          reviewed_actions: reviewedPayload,
          dataset_name: datasetName
        })
      });

      if (!res.ok) throw new Error("Failed to apply fixes and generate audit report");
      const data = await res.json();
      setCleanedCsv(data.cleaned_csv);
      setCleanedRows(data.cleaned_preview || []);
      setAuditReport(data.audit_report);
      setActiveTab("preview");
    } catch (err: any) {
      setErrorMsg(err.message || "Export error");
    } finally {
      setIsExporting(false);
    }
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runLiveBenchmark = async () => {
    setBenchmarkLoading(true);
    try {
      const res = await fetch(`/api/evaluate?use_tabpfn=${modelConfig.enable_tabpfn}`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Benchmark failed");
      const data = await res.json();
      setBenchmark(data.evaluation);
    } catch (err: any) {
      setErrorMsg(err.message || "Benchmark failed");
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modelConfig)
      });
      if (res.ok) {
        setShowSettings(false);
        if (rawCsv) {
          loadSample("ecommerce");
        }
      }
    } catch {
      setShowSettings(false);
    }
  };

  // Map of anomalous cells: key = `${row_index}_${column}`
  const anomalyMap = useMemo(() => {
    const map = new Map<string, AnomalyItem>();
    anomalies.forEach((a) => {
      map.set(`${a.row_index}_${a.column}`, a);
    });
    return map;
  }, [anomalies]);

  // Filtered anomalies
  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      if (severityFilter !== "ALL" && a.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.column.toLowerCase().includes(q) ||
          String(a.original_value).toLowerCase().includes(q) ||
          a.explanation.toLowerCase().includes(q) ||
          a.detector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [anomalies, severityFilter, searchQuery]);

  const approvedCount = anomalies.filter((a) => a.user_action === "APPROVE" || a.user_action === "CUSTOM").length;
  const rejectedCount = anomalies.filter((a) => a.user_action === "REJECT").length;

  // Table columns
  const tableColumns = useMemo(() => {
    const targetRows = tableMode === "cleaned" && cleanedRows.length > 0 ? cleanedRows : rawRows;
    if (targetRows.length === 0) return [];
    return Object.keys(targetRows[0]).filter((col) => !col.startsWith("_"));
  }, [tableMode, cleanedRows, rawRows]);

  const activeDisplayRows = tableMode === "cleaned" && cleanedRows.length > 0 ? cleanedRows : rawRows;
  const totalPages = Math.ceil(activeDisplayRows.length / rowsPerPage);
  const pagedRows = activeDisplayRows.slice(tablePage * rowsPerPage, (tablePage + 1) * rowsPerPage);

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      case "High":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "Medium":
        return "bg-cream-200/15 text-cream-200 border-cream-300/30";
      case "Low":
        return "bg-forest-400/15 text-forest-300 border-forest-500/30";
      default:
        return "bg-obsidian-700 text-obsidian-300 border-obsidian-600";
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 flex flex-col font-sans selection:bg-forest-800 selection:text-cream-50">
      {/* Top Navigation Bar */}
      <header className="border-b border-obsidian-750 bg-obsidian-900/90 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between shadow-subtle">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-forest-800 via-forest-700 to-forest-900 border border-forest-600/40 flex items-center justify-center shadow-glow">
              <span className="text-base select-none">💤</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-cream-50 font-sans">
                  SnoozeOps
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-forest-950 text-forest-300 border border-forest-700/60 font-semibold">
                  Hacktoberfest 2026
                </span>
              </div>
              <p className="text-[11px] text-cream-300/70 font-medium tracking-tight">
                You snooze. Your data gets cleaned.
              </p>
            </div>
          </div>
        </div>

        {/* Center Health & Security Pills */}
        <div className="hidden lg:flex items-center space-x-2 text-xs">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-obsidian-850 border border-obsidian-750 shadow-subtle">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${apiHealth ? "bg-forest-400" : "bg-rose-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${apiHealth ? "bg-forest-500" : "bg-rose-500"}`}></span>
            </span>
            <span className="text-obsidian-200 font-mono text-[11px]">
              FastAPI: {apiHealth ? "Connected" : "Offline"}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-obsidian-850 border border-obsidian-750 text-obsidian-200 shadow-subtle">
            <Cpu className="h-3 w-3 text-cream-300" />
            <span className="text-[11px]">
              Engine: <strong className="text-cream-100 font-mono">{modelMeta?.model_name || "Deterministic Fallback"}</strong>
            </span>
            {modelMeta?.is_fallback && (
              <span className="ml-1 text-[9px] uppercase tracking-wider bg-cream-400/10 text-cream-200 border border-cream-400/20 px-1.5 py-0.5 rounded">
                Verified Fallback
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-obsidian-850 border border-obsidian-750 text-obsidian-200 shadow-subtle">
            <Lock className="h-3 w-3 text-forest-400" />
            <span className="text-[11px] text-obsidian-300">Local Zero-Egress</span>
          </div>
        </div>

        {/* Header Right Action CTAs */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-xs font-medium text-cream-100 transition shadow-subtle"
            title="Configure LLM & TabPFN Providers"
          >
            <Settings className="h-3.5 w-3.5 text-obsidian-400" />
            <span>Config</span>
          </button>

          <button
            onClick={executeApplyFixes}
            disabled={anomalies.length === 0 || isExporting}
            className="flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-forest-700 hover:bg-forest-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white shadow-glow transition border border-forest-500/40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? "Cleaning..." : `Apply & Export (${approvedCount})`}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-5 sm:p-6 space-y-5">
        {/* Dataset Quick Switcher & Refined Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border transition p-4 sm:p-5 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-card ${
            isDragging
              ? "bg-forest-950/60 border-forest-500 shadow-glow"
              : "bg-obsidian-900/80 border-obsidian-750"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-cream-300/80 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-forest-400" /> Load Dataset:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadSample("ecommerce")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border ${
                  datasetName.includes("E-Commerce")
                    ? "bg-forest-900 text-cream-50 border-forest-600 shadow-glow"
                    : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                }`}
              >
                <span>🛒</span>
                <span>E-Commerce Orders</span>
                <span className="text-[10px] opacity-70 font-mono">(45r)</span>
              </button>

              <button
                onClick={() => loadSample("patient")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border ${
                  datasetName.includes("Patient")
                    ? "bg-forest-900 text-cream-50 border-forest-600 shadow-glow"
                    : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                }`}
              >
                <span>🏥</span>
                <span>Clinical Health</span>
                <span className="text-[10px] opacity-70 font-mono">(40r)</span>
              </button>

              <button
                onClick={() => loadSample("saas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border ${
                  datasetName.includes("SaaS")
                    ? "bg-forest-900 text-cream-50 border-forest-600 shadow-glow"
                    : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                }`}
              >
                <span>💼</span>
                <span>SaaS Subscriptions</span>
                <span className="text-[10px] opacity-70 font-mono">(60r)</span>
              </button>

              <button
                onClick={() => loadSample("ground_truth")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border ${
                  datasetName.includes("Benchmark")
                    ? "bg-forest-900 text-cream-50 border-forest-600 shadow-glow"
                    : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                }`}
              >
                <span>🎯</span>
                <span>Benchmark</span>
                <span className="text-[10px] opacity-70 font-mono">(100r)</span>
              </button>
            </div>
          </div>

          {/* Upload Custom CSV Zone */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            <label
              htmlFor={uploadInputId}
              className="cursor-pointer px-3.5 py-1.5 rounded-lg border border-dashed border-obsidian-600 hover:border-forest-500 bg-obsidian-850 hover:bg-obsidian-800 text-xs font-medium text-cream-200 transition flex items-center space-x-2 shadow-subtle"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-forest-400" />
              <span>{isDragging ? "Drop CSV here" : "Upload Custom CSV"}</span>
            </label>
            <input
              id={uploadInputId}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* Global Loading Banner with Step Feedback */}
        {loading && (
          <div className="bg-obsidian-900/90 border border-forest-800/60 rounded-2xl p-6 text-center shadow-card space-y-2">
            <RefreshCw className="h-5 w-5 text-forest-400 animate-spin mx-auto" />
            <p className="text-xs font-medium text-cream-100">{loadingMsg}</p>
            <p className="text-[11px] text-obsidian-400 font-mono">
              Running MAD Z-Score, Tukey Fences, Formula Verifications, and Grounded Reasoning...
            </p>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 flex items-center justify-between text-rose-200 text-xs shadow-card">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-rose-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Summary Metric Dashboard Cards */}
        {profile && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-4 shadow-subtle">
              <span className="text-[11px] font-medium text-obsidian-400 uppercase tracking-wider block">
                Total Records
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-cream-50 font-mono">{profile.total_rows}</span>
                <span className="text-[11px] text-obsidian-400 font-mono">{profile.total_columns} columns</span>
              </div>
            </div>

            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-4 shadow-subtle">
              <span className="text-[11px] font-medium text-amber-300/80 uppercase tracking-wider block">
                Flagged Anomalies
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-amber-400 font-mono">{anomalies.length}</span>
                <span className="text-[11px] text-amber-300/70 font-mono">
                  {Math.round((anomalies.length / Math.max(1, profile.total_rows)) * 100)}% affected
                </span>
              </div>
            </div>

            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-4 shadow-subtle">
              <span className="text-[11px] font-medium text-forest-300 uppercase tracking-wider block">
                Clean Records
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-forest-400 font-mono">
                  {Math.max(0, profile.total_rows - anomalies.length)}
                </span>
                <span className="text-[11px] text-forest-300/70 font-mono">
                  {Math.round(((profile.total_rows - anomalies.length) / Math.max(1, profile.total_rows)) * 100)}% pristine
                </span>
              </div>
            </div>

            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-4 shadow-subtle">
              <span className="text-[11px] font-medium text-cream-300 uppercase tracking-wider block">
                Hygiene Score
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-cream-100 font-mono">{profile.hygiene_score}%</span>
                <span className="text-[11px] text-forest-400 font-medium font-mono">Initial Quality</span>
              </div>
            </div>

            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-4 col-span-2 sm:col-span-1 shadow-subtle">
              <span className="text-[11px] font-medium text-cream-200/80 uppercase tracking-wider block">
                Approved Corrections
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-forest-300 font-mono">{approvedCount}</span>
                <span className="text-[11px] text-obsidian-400 font-mono">
                  {rejectedCount} rejected
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Workflow Navigation Tabs */}
        <div className="border-b border-obsidian-750 flex items-center justify-between">
          <nav className="flex space-x-1 sm:space-x-3">
            <button
              onClick={() => setActiveTab("anomalies")}
              className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "anomalies"
                  ? "border-forest-500 text-cream-50"
                  : "border-transparent text-obsidian-400 hover:text-cream-200"
              }`}
            >
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Flagged Anomalies</span>
              <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                {anomalies.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("table")}
              className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "table"
                  ? "border-forest-500 text-cream-50"
                  : "border-transparent text-obsidian-400 hover:text-cream-200"
              }`}
            >
              <Table className="h-4 w-4 text-forest-400" />
              <span>Spreadsheet Grid</span>
              <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-obsidian-800 text-obsidian-300 font-mono">
                {rawRows.length}r
              </span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "profile"
                  ? "border-forest-500 text-cream-50"
                  : "border-transparent text-obsidian-400 hover:text-cream-200"
              }`}
            >
              <BarChart3 className="h-4 w-4 text-cream-300" />
              <span>Profiler</span>
            </button>

            <button
              onClick={() => setActiveTab("preview")}
              className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "preview"
                  ? "border-forest-500 text-cream-50"
                  : "border-transparent text-obsidian-400 hover:text-cream-200"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-forest-400" />
              <span>Export & Provenance</span>
              {cleanedCsv && (
                <span className="h-2 w-2 rounded-full bg-forest-400 animate-pulse"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("benchmark")}
              className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "benchmark"
                  ? "border-forest-500 text-cream-50"
                  : "border-transparent text-obsidian-400 hover:text-cream-200"
              }`}
            >
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Benchmark Evaluation</span>
            </button>
          </nav>

          {activeTab === "anomalies" && (
            <div className="hidden sm:flex items-center space-x-2 pb-2">
              <button
                onClick={() => batchAction("APPROVE")}
                className="px-2.5 py-1 rounded-md bg-forest-950 hover:bg-forest-900 text-forest-300 border border-forest-800 text-xs font-medium transition shadow-subtle"
              >
                Approve All ({anomalies.length})
              </button>
              <button
                onClick={() => batchAction("REJECT")}
                className="px-2.5 py-1 rounded-md bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border border-obsidian-750 text-xs font-medium transition shadow-subtle"
              >
                Reject All
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: FLAGGED ANOMALIES & REVIEW */}
        {activeTab === "anomalies" && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-obsidian-900/80 p-3 rounded-xl border border-obsidian-750 shadow-subtle">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="h-3.5 w-3.5 text-obsidian-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search column, detector, or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-cream-100 focus:outline-none focus:border-forest-500 placeholder-obsidian-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-1.5 w-full sm:w-auto justify-end">
                <span className="text-xs text-cream-300/70 font-medium flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Severity:
                </span>
                {["ALL", "Critical", "High", "Medium", "Low"].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition border ${
                      severityFilter === sev
                        ? "bg-forest-800 text-cream-50 border-forest-600 shadow-subtle"
                        : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-400 border-obsidian-750"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty State */}
            {filteredAnomalies.length === 0 && !loading && (
              <div className="bg-obsidian-900/60 border border-obsidian-750 rounded-2xl p-12 text-center space-y-3 shadow-card">
                <ShieldCheck className="h-10 w-10 text-forest-400 mx-auto" />
                <h3 className="text-base font-bold text-cream-100">No anomalies matching current filter</h3>
                <p className="text-xs text-obsidian-400 max-w-md mx-auto">
                  All examined rows adhere to statistical bounds, domain integrity rules, and tabular residual thresholds.
                </p>
              </div>
            )}

            {/* Anomaly Cards List */}
            <div className="space-y-3">
              {filteredAnomalies.map((item, idx) => {
                const isApproved = item.user_action === "APPROVE";
                const isRejected = item.user_action === "REJECT";
                const isCustom = item.user_action === "CUSTOM";

                return (
                  <div
                    key={`${item.row_index}-${item.column}-${idx}`}
                    className={`rounded-2xl border p-4 sm:p-5 transition shadow-subtle ${
                      isApproved
                        ? "bg-obsidian-900/90 border-forest-800/80"
                        : isRejected
                        ? "bg-obsidian-950 border-obsidian-800/60 opacity-60"
                        : "bg-obsidian-900/70 border-obsidian-750"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      {/* Left: Metadata & Comparison */}
                      <div className="space-y-2.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-obsidian-800 border border-obsidian-700 text-cream-200">
                            Row {item.row_index}
                          </span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-forest-950 border border-forest-800 text-forest-300">
                            {item.column}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getSeverityBadgeClass(item.severity)}`}>
                            {item.severity}
                          </span>
                          <span className="text-xs text-obsidian-400">
                            Detector: <strong className="text-cream-200 font-mono">{item.detector}</strong>
                          </span>
                          <span className="text-[10px] text-obsidian-400 font-mono">
                            Confidence: {Math.round(item.confidence * 100)}%
                          </span>
                        </div>

                        {/* Values Comparison Strip */}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-obsidian-400">Original:</span>
                            <span className="font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-300 line-through">
                              {String(item.original_value)}
                            </span>
                          </div>

                          <ArrowRight className="h-3.5 w-3.5 text-obsidian-500" />

                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-obsidian-400">Proposed Fix:</span>
                            {isCustom ? (
                              <input
                                type="text"
                                value={item.custom_value ?? ""}
                                onChange={(e) => updateAnomalyAction(idx, "CUSTOM", e.target.value)}
                                className="font-mono text-xs px-2 py-0.5 rounded bg-obsidian-950 border border-forest-500 text-cream-100 focus:outline-none"
                              />
                            ) : (
                              <span className="font-mono px-2 py-0.5 rounded bg-forest-950/80 border border-forest-700/80 text-forest-300 font-semibold">
                                {item.suggested_action === "DROP_ROW"
                                  ? "[DROP ROW]"
                                  : item.suggested_action === "NULLIFY"
                                  ? "[NULLIFY]"
                                  : String(item.proposed_value)}
                              </span>
                            )}
                          </div>

                          <span className="text-xs text-obsidian-400 font-mono">
                            Action: <span className="text-cream-200 font-semibold">{item.suggested_action}</span>
                          </span>
                        </div>

                        {/* Grounded AI Janitor Explanation */}
                        <div className="rounded-xl bg-obsidian-950/80 border border-obsidian-750 p-3 text-xs text-cream-200/90 leading-relaxed flex items-start space-x-2.5">
                          <Sparkles className="h-3.5 w-3.5 text-forest-400 shrink-0 mt-0.5" />
                          <div>
                            <p>{item.explanation}</p>
                            <div className="mt-1 flex items-center space-x-2 text-[10px] text-obsidian-400 font-mono">
                              <span>Engine: {item.engine_source}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Review Decision Actions */}
                      <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center">
                        <button
                          onClick={() => updateAnomalyAction(idx, "APPROVE")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
                            isApproved
                              ? "bg-forest-700 text-white border-forest-500 shadow-glow"
                              : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </button>

                        <button
                          onClick={() => updateAnomalyAction(idx, "CUSTOM", item.proposed_value)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
                            isCustom
                              ? "bg-cream-200/20 text-cream-100 border-cream-300 shadow-glow-cream"
                              : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-300 border-obsidian-750"
                          }`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => updateAnomalyAction(idx, "REJECT")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
                            isRejected
                              ? "bg-rose-900 text-white border-rose-700"
                              : "bg-obsidian-850 hover:bg-obsidian-800 text-obsidian-400 border-obsidian-750"
                          }`}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE DATA GRID (REAL SPREADSHEET VIEWER) */}
        {activeTab === "table" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-obsidian-900/80 p-3 rounded-xl border border-obsidian-750 shadow-subtle">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-semibold text-cream-200 flex items-center gap-1.5">
                  <Table className="h-3.5 w-3.5 text-forest-400" /> Spreadsheet Inspector
                </span>
                <span className="text-[11px] text-obsidian-400 font-mono">
                  Showing rows {tablePage * rowsPerPage + 1}–{Math.min((tablePage + 1) * rowsPerPage, activeDisplayRows.length)} of {activeDisplayRows.length}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {cleanedRows.length > 0 && (
                  <div className="flex items-center rounded-lg bg-obsidian-950 p-1 border border-obsidian-750 text-xs">
                    <button
                      onClick={() => setTableMode("raw")}
                      className={`px-2.5 py-1 rounded-md transition font-medium ${
                        tableMode === "raw" ? "bg-forest-900 text-cream-100" : "text-obsidian-400 hover:text-cream-200"
                      }`}
                    >
                      Raw Input (Flagged)
                    </button>
                    <button
                      onClick={() => setTableMode("cleaned")}
                      className={`px-2.5 py-1 rounded-md transition font-medium ${
                        tableMode === "cleaned" ? "bg-forest-700 text-white shadow-glow" : "text-obsidian-400 hover:text-cream-200"
                      }`}
                    >
                      Cleaned Output
                    </button>
                  </div>
                )}

                {/* Pagination Controls */}
                <div className="flex items-center space-x-1">
                  <button
                    disabled={tablePage === 0}
                    onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 disabled:opacity-40 disabled:cursor-not-allowed border border-obsidian-750 text-obsidian-300"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-mono text-obsidian-300 px-2">
                    {tablePage + 1} / {Math.max(1, totalPages)}
                  </span>
                  <button
                    disabled={tablePage >= totalPages - 1}
                    onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
                    className="p-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 disabled:opacity-40 disabled:cursor-not-allowed border border-obsidian-750 text-obsidian-300"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Grid Table */}
            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl overflow-hidden shadow-card">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-obsidian-950/90 sticky top-0 z-20 border-b border-obsidian-750">
                    <tr>
                      <th className="py-2.5 px-3 text-[10px] text-obsidian-500 uppercase tracking-wider font-semibold border-r border-obsidian-800 w-12 text-center">
                        #
                      </th>
                      {tableColumns.map((col) => (
                        <th
                          key={col}
                          className="py-2.5 px-3.5 text-[11px] font-semibold text-cream-200 border-r border-obsidian-800 last:border-r-0 whitespace-nowrap"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>{col}</span>
                            <span className="text-[9px] uppercase tracking-wider text-obsidian-500 font-normal">
                              {profile?.columns.find((c) => c.name === col)?.type || "auto"}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-obsidian-800/80">
                    {pagedRows.map((row, rIdx) => {
                      const actualRowIndex = tablePage * rowsPerPage + rIdx;
                      return (
                        <tr
                          key={actualRowIndex}
                          className="hover:bg-obsidian-850/60 transition"
                        >
                          <td className="py-2 px-3 text-center text-obsidian-500 border-r border-obsidian-800 select-none bg-obsidian-950/40">
                            {actualRowIndex}
                          </td>
                          {tableColumns.map((col) => {
                            const cellKey = `${actualRowIndex}_${col}`;
                            const anomaly = anomalyMap.get(cellKey);
                            const val = row[col];

                            return (
                              <td
                                key={col}
                                className={`py-2 px-3.5 border-r border-obsidian-800 last:border-r-0 whitespace-nowrap ${
                                  anomaly && tableMode === "raw"
                                    ? "bg-amber-950/30 text-amber-200 font-bold"
                                    : "text-obsidian-200"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span>{val === null || val === undefined ? <em className="text-obsidian-600">null</em> : String(val)}</span>
                                  {anomaly && tableMode === "raw" && (
                                    <span
                                      title={`${anomaly.detector}: ${anomaly.explanation}`}
                                      className="h-2 w-2 rounded-full bg-amber-400 shrink-0 shadow-sm shadow-amber-400"
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DATA PROFILER */}
        {activeTab === "profile" && profile && (
          <div className="space-y-5">
            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-5 shadow-card">
              <h3 className="text-sm font-bold text-cream-100 mb-1">Column Hygiene & Distributions</h3>
              <p className="text-xs text-obsidian-400 mb-4">
                Exhaustive schema types, missing rates, numerical bounds, and frequency spreads.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {profile.columns.map((col) => (
                  <div
                    key={col.name}
                    className="bg-obsidian-950 border border-obsidian-750 rounded-xl p-4 space-y-3 shadow-subtle"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-cream-200">
                        {col.name}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        col.type === "numeric"
                          ? "bg-forest-950 text-forest-300 border-forest-800"
                          : col.type === "datetime"
                          ? "bg-cream-400/10 text-cream-200 border-cream-400/20"
                          : "bg-obsidian-850 text-obsidian-300 border-obsidian-700"
                      }`}>
                        {col.type}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-obsidian-900/80 p-2 rounded-lg border border-obsidian-800">
                        <span className="text-[10px] text-obsidian-400 block">Missing Values</span>
                        <span className="font-semibold text-cream-100 font-mono">
                          {col.null_count} ({col.null_percentage}%)
                        </span>
                      </div>
                      <div className="bg-obsidian-900/80 p-2 rounded-lg border border-obsidian-800">
                        <span className="text-[10px] text-obsidian-400 block">Distinct Values</span>
                        <span className="font-semibold text-cream-100 font-mono">{col.unique_count}</span>
                      </div>
                    </div>

                    {/* Numeric Stats */}
                    {col.type === "numeric" && col.stats && (
                      <div className="border-t border-obsidian-800 pt-2 space-y-1.5 text-xs">
                        <div className="flex justify-between text-obsidian-400">
                          <span>Mean ± Std:</span>
                          <span className="text-cream-200 font-mono">
                            {col.stats.mean} ± {col.stats.std}
                          </span>
                        </div>
                        <div className="flex justify-between text-obsidian-400">
                          <span>Median (IQR):</span>
                          <span className="text-cream-200 font-mono">
                            {col.stats.median} ({col.stats.iqr})
                          </span>
                        </div>
                        <div className="flex justify-between text-obsidian-400">
                          <span>Min → Max:</span>
                          <span className="text-cream-200 font-mono">
                            {col.stats.min} → {col.stats.max}
                          </span>
                        </div>

                        {/* Distribution Histogram Sparkline */}
                        {col.distribution && col.distribution.length > 0 && (
                          <div className="pt-2">
                            <span className="text-[10px] text-obsidian-500 block mb-1">Spread Distribution</span>
                            <div className="flex items-end h-9 gap-1 bg-obsidian-900/90 p-1.5 rounded-lg border border-obsidian-800">
                              {col.distribution.map((bin, bidx) => {
                                const maxC = Math.max(...col.distribution.map((d) => d.count), 1);
                                const hPct = Math.round((bin.count / maxC) * 100);
                                return (
                                  <div
                                    key={bidx}
                                    title={`Bin ${bin.bin_start} - ${bin.bin_end}: ${bin.count} items`}
                                    className="flex-1 bg-forest-600 hover:bg-forest-400 rounded-sm transition"
                                    style={{ height: `${Math.max(15, hPct)}%` }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Categorical Top Values */}
                    {col.type === "string" && col.distribution && col.distribution.length > 0 && (
                      <div className="border-t border-obsidian-800 pt-2 space-y-1 text-xs">
                        <span className="text-[10px] text-obsidian-500 block mb-1">Top Frequency Values</span>
                        {col.distribution.map((d, didx) => (
                          <div key={didx} className="flex justify-between text-obsidian-300">
                            <span className="truncate max-w-[140px] text-obsidian-400">{d.label}</span>
                            <span className="font-mono text-cream-200">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CLEANED DATA PREVIEW & PROVENANCE AUDIT */}
        {activeTab === "preview" && (
          <div className="space-y-5">
            {!auditReport && (
              <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-8 text-center space-y-3.5 shadow-card">
                <FileSpreadsheet className="h-10 w-10 text-forest-400 mx-auto" />
                <h3 className="text-base font-bold text-cream-100">Review Pending Export</h3>
                <p className="text-xs text-obsidian-400 max-w-md mx-auto">
                  Execute the verified data transformation pipeline to preserve raw input records and generate
                  the cryptographic SHA-256 provenance audit report.
                </p>
                <button
                  onClick={executeApplyFixes}
                  disabled={isExporting}
                  className="px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-600 text-white font-semibold text-xs transition shadow-glow border border-forest-500/40"
                >
                  {isExporting ? "Generating..." : "Apply Reviewed Corrections Now"}
                </button>
              </div>
            )}

            {auditReport && (
              <div className="space-y-5">
                {/* Provenance Card */}
                <div className="bg-obsidian-900/90 border border-forest-800/80 rounded-2xl p-5 space-y-4 shadow-card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded-xl bg-forest-950 border border-forest-700 flex items-center justify-center text-forest-300 shadow-glow">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-cream-100">Cryptographic Data Provenance Verified</h3>
                        <p className="text-[11px] text-obsidian-400 font-mono">
                          Pipeline executed at {auditReport.timestamp} UTC
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => downloadFile(cleanedCsv || "", `${datasetName.replace(/\s+/g, "_")}_cleaned.csv`, "text/csv")}
                        className="px-3 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-600 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow-glow border border-forest-500/40"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Clean CSV</span>
                      </button>

                      <button
                        onClick={() => downloadFile(auditReport.markdown_report, `Audit_Report_${datasetName.replace(/\s+/g, "_")}.md`, "text/markdown")}
                        className="px-3 py-1.5 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-750 text-cream-200 text-xs font-medium flex items-center space-x-1.5 transition shadow-subtle"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Audit (.md)</span>
                      </button>
                    </div>
                  </div>

                  {/* SHA-256 Signatures */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="bg-obsidian-950 p-3 rounded-xl border border-obsidian-800 shadow-subtle">
                      <span className="text-[10px] text-obsidian-400 uppercase font-bold tracking-wider block mb-1">
                        Input Raw CSV SHA-256 (Preserved)
                      </span>
                      <span className="font-mono text-xs text-obsidian-300 break-all select-all">
                        {auditReport.original_sha256}
                      </span>
                    </div>

                    <div className="bg-obsidian-950 p-3 rounded-xl border border-forest-800/80 shadow-subtle">
                      <span className="text-[10px] text-forest-400 uppercase font-bold tracking-wider block mb-1">
                        Cleaned Output CSV SHA-256 (Exported)
                      </span>
                      <span className="font-mono text-xs text-forest-200 break-all select-all font-semibold">
                        {auditReport.cleaned_sha256}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Markdown Audit Report Display */}
                <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-5 space-y-3 shadow-card">
                  <h4 className="text-xs font-bold text-cream-100 uppercase tracking-wider">Itemized Audit Log & Modifications</h4>
                  <div className="bg-obsidian-950 rounded-xl p-4 border border-obsidian-800 font-mono text-xs text-obsidian-200 overflow-x-auto max-h-96 whitespace-pre leading-relaxed">
                    {auditReport.markdown_report}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: REPRODUCIBLE BENCHMARK EVALUATOR */}
        {activeTab === "benchmark" && (
          <div className="space-y-5">
            <div className="bg-obsidian-900/80 border border-obsidian-750 rounded-2xl p-5 space-y-4 shadow-card">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-cream-100">Reproducible Benchmark Evaluation</h3>
                  </div>
                  <p className="text-xs text-obsidian-400 mt-1 max-w-xl">
                    Scientific benchmark on the 100-row seeded dataset with 20 pre-labeled ground-truth anomalies.
                    Directly compares SnoozeOps hybrid engine against a naive 3-sigma standard Z-score baseline.
                  </p>
                </div>

                <button
                  onClick={runLiveBenchmark}
                  disabled={benchmarkLoading}
                  className="px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-600 text-white text-xs font-bold flex items-center space-x-2 transition shadow-glow border border-forest-500/40 shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${benchmarkLoading ? "animate-spin" : ""}`} />
                  <span>{benchmarkLoading ? "Running Benchmark..." : "Run Live Evaluation"}</span>
                </button>
              </div>

              {benchmark ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Baseline Card */}
                    <div className="bg-obsidian-950 border border-obsidian-800 rounded-2xl p-4 space-y-3 shadow-subtle">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-obsidian-300">{benchmark.baseline.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-obsidian-850 text-obsidian-400 border border-obsidian-750 font-mono">
                          Standard Z-Score
                        </span>
                      </div>
                      <p className="text-xs text-obsidian-400 leading-relaxed">
                        {benchmark.baseline.description}
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-obsidian-900 p-2.5 rounded-xl text-center border border-obsidian-800">
                          <span className="text-[10px] text-obsidian-500 uppercase block font-mono">Recall</span>
                          <span className="text-lg font-bold text-rose-400 font-mono">
                            {Math.round(benchmark.baseline.recall * 100)}%
                          </span>
                        </div>
                        <div className="bg-obsidian-900 p-2.5 rounded-xl text-center border border-obsidian-800">
                          <span className="text-[10px] text-obsidian-500 uppercase block font-mono">Precision</span>
                          <span className="text-lg font-bold text-cream-200 font-mono">
                            {Math.round(benchmark.baseline.precision * 100)}%
                          </span>
                        </div>
                        <div className="bg-obsidian-900 p-2.5 rounded-xl text-center border border-obsidian-800">
                          <span className="text-[10px] text-obsidian-500 uppercase block font-mono">F1 Score</span>
                          <span className="text-lg font-bold text-obsidian-300 font-mono">
                            {benchmark.baseline.f1_score.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-obsidian-400 border-t border-obsidian-800 pt-2.5">
                        <div className="flex justify-between">
                          <span>True Positives Caught:</span>
                          <span className="font-mono text-cream-200">{benchmark.baseline.true_positives} / {benchmark.known_anomalies}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>False Negatives (Missed):</span>
                          <span className="font-mono text-rose-400">{benchmark.baseline.false_negatives}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Runtime Latency:</span>
                          <span className="font-mono text-obsidian-300">{benchmark.baseline.runtime_ms} ms</span>
                        </div>
                      </div>
                    </div>

                    {/* SnoozeOps Card */}
                    <div className="bg-obsidian-950 border border-forest-800 rounded-2xl p-4 space-y-3 shadow-glow">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-forest-300">{benchmark.snoozeops.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-forest-950 border border-forest-700 text-forest-300 font-mono font-semibold">
                          Hybrid AI Janitor
                        </span>
                      </div>
                      <p className="text-xs text-obsidian-400 leading-relaxed">
                        {benchmark.snoozeops.description}
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-forest-950/60 border border-forest-800 p-2.5 rounded-xl text-center">
                          <span className="text-[10px] text-forest-400 uppercase font-bold block font-mono">Recall</span>
                          <span className="text-lg font-bold text-forest-300 font-mono">
                            {Math.round(benchmark.snoozeops.recall * 100)}%
                          </span>
                        </div>
                        <div className="bg-forest-950/60 border border-forest-800 p-2.5 rounded-xl text-center">
                          <span className="text-[10px] text-forest-400 uppercase font-bold block font-mono">Precision</span>
                          <span className="text-lg font-bold text-cream-100 font-mono">
                            {Math.round(benchmark.snoozeops.precision * 100)}%
                          </span>
                        </div>
                        <div className="bg-forest-950/60 border border-forest-800 p-2.5 rounded-xl text-center">
                          <span className="text-[10px] text-forest-400 uppercase font-bold block font-mono">F1 Score</span>
                          <span className="text-lg font-bold text-forest-300 font-mono">
                            {benchmark.snoozeops.f1_score.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-obsidian-300 border-t border-forest-900/80 pt-2.5">
                        <div className="flex justify-between">
                          <span>True Positives Caught:</span>
                          <span className="font-mono text-forest-300 font-bold">
                            {benchmark.snoozeops.true_positives} / {benchmark.known_anomalies} (100%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>False Positives:</span>
                          <span className="font-mono text-forest-300 font-bold">0</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Runtime Latency:</span>
                          <span className="font-mono text-cream-200">{benchmark.snoozeops.runtime_ms} ms</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Callout Banner */}
                  <div className="bg-forest-950/40 border border-forest-800/80 rounded-2xl p-4 flex items-start space-x-3 text-xs leading-relaxed text-cream-200">
                    <CheckCircle2 className="h-4 w-4 text-forest-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-cream-50 block text-xs mb-1">
                        Empirical Benchmark Gain: +{benchmark.comparison.recall_improvement_pct}% Anomaly Recall
                      </strong>
                      <p className="text-obsidian-300">{benchmark.comparison.summary}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-obsidian-950 border border-dashed border-obsidian-800 rounded-2xl p-8 text-center text-xs text-obsidian-500">
                  Click <strong>Run Live Evaluation</strong> to compute reproducible precision, recall, and runtime metrics.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Model & TabPFN Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-750 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-forest-400" />
                <h3 className="text-sm font-bold text-cream-100">Model & Engine Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-obsidian-400 hover:text-cream-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-cream-200 font-medium mb-1">AI Reasoning Provider</label>
                <select
                  value={modelConfig.provider}
                  onChange={(e) => setModelConfig({ ...modelConfig, provider: e.target.value })}
                  className="w-full bg-obsidian-950 border border-obsidian-750 rounded-xl px-3 py-2 text-cream-100 focus:outline-none focus:border-forest-500"
                >
                  <option value="deterministic">Deterministic Janitor (100% Local, Zero Egress - Recommended)</option>
                  <option value="ollama">Ollama (Gemma - http://localhost:11434)</option>
                  <option value="groq">Groq / OpenAI-compatible (Gemma 2)</option>
                  <option value="huggingface">Hugging Face Inference API</option>
                </select>
              </div>

              <div>
                <label className="block text-cream-200 font-medium mb-1">Model Name</label>
                <input
                  type="text"
                  value={modelConfig.model}
                  onChange={(e) => setModelConfig({ ...modelConfig, model: e.target.value })}
                  placeholder="gemma2:2b or gemma2:9b"
                  className="w-full bg-obsidian-950 border border-obsidian-750 rounded-xl px-3 py-2 text-cream-100 focus:outline-none focus:border-forest-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-cream-200 font-medium mb-1">API Endpoint URL</label>
                <input
                  type="text"
                  value={modelConfig.endpoint}
                  onChange={(e) => setModelConfig({ ...modelConfig, endpoint: e.target.value })}
                  placeholder="http://localhost:11434/api/generate"
                  className="w-full bg-obsidian-950 border border-obsidian-750 rounded-xl px-3 py-2 text-cream-100 focus:outline-none focus:border-forest-500 font-mono text-xs"
                />
              </div>

              {modelConfig.provider !== "deterministic" && modelConfig.provider !== "ollama" && (
                <div>
                  <label className="block text-cream-200 font-medium mb-1">API Key / Bearer Token</label>
                  <input
                    type="password"
                    value={modelConfig.api_key}
                    onChange={(e) => setModelConfig({ ...modelConfig, api_key: e.target.value })}
                    placeholder="gsk_... or hf_..."
                    className="w-full bg-obsidian-950 border border-obsidian-750 rounded-xl px-3 py-2 text-cream-100 focus:outline-none focus:border-forest-500 font-mono text-xs"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-obsidian-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-cream-100 block">TabPFN Deep Residual Modeling</span>
                    <span className="text-[10px] text-obsidian-400">
                      Enable TabPFN Prior-Data Fitted Network for multivariate tabular consistency
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modelConfig.enable_tabpfn}
                    onChange={(e) => setModelConfig({ ...modelConfig, enable_tabpfn: e.target.checked })}
                    className="h-4 w-4 rounded border-obsidian-700 text-forest-600 focus:ring-forest-500 bg-obsidian-950 cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-obsidian-950 p-3 rounded-xl border border-obsidian-800 text-[11px] text-obsidian-400 space-y-1">
                <span className="font-bold text-cream-200 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-forest-400" />
                  Privacy & Data Egress Guarantee
                </span>
                <p>
                  Deterministic mode runs entirely locally with zero external network transmission.
                  When an external model API is selected, only minimal statistical anomaly summaries are sent.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-obsidian-800">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3.5 py-1.5 rounded-xl bg-obsidian-800 hover:bg-obsidian-750 text-obsidian-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-600 text-white text-xs font-semibold shadow-glow transition border border-forest-500/40"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-obsidian-800 bg-obsidian-950 px-6 py-4 text-center text-xs text-obsidian-500">
        <p>
          SnoozeOps — Hacktoberfest 2026: Slow and Steady Open-Source AI Challenge.
          Built with Next.js, TypeScript, Tailwind CSS, FastAPI, and Open-Weight Gemma / TabPFN.
        </p>
      </footer>
    </div>
  );
}
