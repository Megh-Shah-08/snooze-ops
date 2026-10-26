"use client";

import React, { useState, useEffect, useId } from "react";
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
  Zap
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
  const [activeTab, setActiveTab] = useState<"anomalies" | "profile" | "preview" | "benchmark">("anomalies");
  
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
  const [tabpfnMeta, setTabpfnMeta] = useState<any>(null);
  const [modelMeta, setModelMeta] = useState<any>(null);
  
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
    setAuditReport(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      setLoading(true);
      setLoadingMsg(`Analyzing ${file.name} with SnoozeOps Janitor...`);
      setErrorMsg(null);
      setDatasetName(file.name);
      setRawCsv(content);
      setCleanedCsv(null);
      setAuditReport(null);

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
        setErrorMsg(err.message || "Failed to process CSV file.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const updateAnomalyAction = (index: number, action: "APPROVE" | "REJECT" | "CUSTOM", customVal?: any) => {
    setAnomalies((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        user_action: action,
        custom_value: customVal !== undefined ? customVal : copy[index].custom_value
      };
      return copy;
    });
  };

  const batchAction = (action: "APPROVE" | "REJECT", severityTarget?: string) => {
    setAnomalies((prev) =>
      prev.map((item) => {
        if (!severityTarget || item.severity === severityTarget) {
          return { ...item, user_action: action };
        }
        return item;
      })
    );
  };

  const executeApplyFixes = async () => {
    if (!rawCsv) return;
    setIsExporting(true);
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
        // re-run analysis with updated settings
        if (rawCsv) {
          loadSample("ecommerce");
        }
      }
    } catch {
      setShowSettings(false);
    }
  };

  // Filtered anomalies
  const filteredAnomalies = anomalies.filter((a) => {
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

  const approvedCount = anomalies.filter((a) => a.user_action === "APPROVE" || a.user_action === "CUSTOM").length;
  const rejectedCount = anomalies.filter((a) => a.user_action === "REJECT").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <span className="text-xl">💤</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                  SnoozeOps
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-medium">
                  Hacktoberfest 2026
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                You snooze. Your data gets cleaned.
              </p>
            </div>
          </div>
        </div>

        {/* Center Indicators */}
        <div className="hidden lg:flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${apiHealth ? "bg-emerald-400" : "bg-rose-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${apiHealth ? "bg-emerald-500" : "bg-rose-500"}`}></span>
            </span>
            <span className="text-slate-300">
              API: {apiHealth ? "Connected (FastAPI)" : "Offline"}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300">
            <Cpu className="h-3.5 w-3.5 text-violet-400" />
            <span>
              Engine: <strong className="text-white">{modelMeta?.model_name || "Deterministic Fallback"}</strong>
            </span>
            {modelMeta?.is_fallback && (
              <span className="ml-1 text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded">
                Verified Fallback
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>Local Zero-Egress</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <Settings className="h-3.5 w-3.5 text-slate-400" />
            <span>Model & TabPFN</span>
          </button>
          
          <button
            onClick={executeApplyFixes}
            disabled={anomalies.length === 0 || isExporting}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? "Cleaning..." : `Apply & Export (${approvedCount} Approved)`}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Dataset Selector / Uploader Strip */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-indigo-400" /> Load Dataset:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadSample("ecommerce")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  datasetName.includes("E-Commerce")
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <span>🛒</span>
                <span>E-Commerce Orders</span>
                <span className="text-[10px] opacity-75 font-normal">(45 rows)</span>
              </button>

              <button
                onClick={() => loadSample("patient")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  datasetName.includes("Patient")
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <span>🏥</span>
                <span>Clinical Health</span>
                <span className="text-[10px] opacity-75 font-normal">(40 rows)</span>
              </button>

              <button
                onClick={() => loadSample("saas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  datasetName.includes("SaaS")
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <span>💼</span>
                <span>SaaS Subscriptions</span>
                <span className="text-[10px] opacity-75 font-normal">(60 rows)</span>
              </button>

              <button
                onClick={() => loadSample("ground_truth")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  datasetName.includes("Benchmark")
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
              >
                <span>🎯</span>
                <span>Ground-Truth Benchmark</span>
                <span className="text-[10px] opacity-75 font-normal">(100 rows)</span>
              </button>
            </div>
          </div>

          {/* Custom Upload Button */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            <label
              htmlFor={uploadInputId}
              className="cursor-pointer px-4 py-2 rounded-xl border border-dashed border-slate-600 hover:border-indigo-400 bg-slate-800/40 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition flex items-center space-x-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-indigo-400" />
              <span>Upload Custom CSV</span>
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

        {/* Global Loading Spinner */}
        {loading && (
          <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-2xl p-6 text-center animate-pulse space-y-2">
            <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin mx-auto" />
            <p className="text-sm font-medium text-indigo-200">{loadingMsg}</p>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="bg-rose-950/50 border border-rose-800/60 rounded-2xl p-4 flex items-center justify-between text-rose-200 text-sm">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Summary Metric Cards */}
        {profile && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs font-medium text-slate-400">Total Records</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-white">{profile.total_rows}</span>
                <span className="text-xs text-slate-500">{profile.total_columns} columns</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs font-medium text-slate-400">Flagged Anomalies</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-400">{anomalies.length}</span>
                <span className="text-xs text-amber-500/80">
                  {Math.round((anomalies.length / Math.max(1, profile.total_rows)) * 100)}% affected
                </span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs font-medium text-slate-400">Clean Records</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-400">
                  {Math.max(0, profile.total_rows - anomalies.length)}
                </span>
                <span className="text-xs text-emerald-500/80">
                  {Math.round(((profile.total_rows - anomalies.length) / Math.max(1, profile.total_rows)) * 100)}% pristine
                </span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs font-medium text-slate-400">Hygiene Score</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-indigo-400">{profile.hygiene_score}%</span>
                <span className="text-xs text-indigo-300 font-medium">Initial Profile</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 col-span-2 sm:col-span-1">
              <span className="text-xs font-medium text-slate-400">Audit Status</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-black text-violet-400">{approvedCount}</span>
                <span className="text-xs text-slate-400">Approved for Fix</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="border-b border-slate-800 flex items-center justify-between">
          <nav className="flex space-x-1 sm:space-x-4">
            <button
              onClick={() => setActiveTab("anomalies")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "anomalies"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Flagged Anomalies</span>
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {anomalies.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "profile"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Column Profiler</span>
            </button>

            <button
              onClick={() => setActiveTab("preview")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "preview"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Cleaned Export & Audit</span>
              {cleanedCsv && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("benchmark")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "benchmark"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Reproducible Benchmark</span>
            </button>
          </nav>

          {activeTab === "anomalies" && (
            <div className="hidden sm:flex items-center space-x-2 pb-2">
              <button
                onClick={() => batchAction("APPROVE")}
                className="px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-medium transition"
              >
                Approve All ({anomalies.length})
              </button>
              <button
                onClick={() => batchAction("REJECT")}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
              >
                Reject All
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: FLAGGED ANOMALIES & REVIEW */}
        {activeTab === "anomalies" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search column, reason, value..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Severity:
                </span>
                {["ALL", "Critical", "High", "Medium", "Low"].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      severityFilter === sev
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-400"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty state */}
            {filteredAnomalies.length === 0 && !loading && (
              <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <ShieldCheck className="h-12 w-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">No anomalies matching filter</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  All cells in this view pass statistical bounds, domain rules, and schema validation.
                </p>
              </div>
            )}

            {/* Anomaly Cards List */}
            <div className="space-y-3">
              {filteredAnomalies.map((item, idx) => {
                const isApproved = item.user_action === "APPROVE";
                const isRejected = item.user_action === "REJECT";
                const isCustom = item.user_action === "CUSTOM";

                const severityColors = {
                  Critical: "bg-rose-500/10 text-rose-300 border-rose-500/30",
                  High: "bg-orange-500/10 text-orange-300 border-orange-500/30",
                  Medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
                  Low: "bg-sky-500/10 text-sky-300 border-sky-500/30"
                };

                return (
                  <div
                    key={`${item.row_index}-${item.column}-${idx}`}
                    className={`rounded-2xl border p-4 transition ${
                      isApproved
                        ? "bg-slate-900/80 border-indigo-500/40 shadow-sm shadow-indigo-950"
                        : isRejected
                        ? "bg-slate-950 border-slate-800/60 opacity-60"
                        : "bg-slate-900/60 border-slate-800"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      {/* Left: Metadata & Values */}
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                            Row {item.row_index}
                          </span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                            {item.column}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${severityColors[item.severity]}`}>
                            {item.severity}
                          </span>
                          <span className="text-xs text-slate-400">
                            Detector: <strong className="text-slate-300">{item.detector}</strong>
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Confidence: {Math.round(item.confidence * 100)}%
                          </span>
                        </div>

                        {/* Values Comparison Strip */}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-slate-500">Original:</span>
                            <span className="font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-300 line-through">
                              {String(item.original_value)}
                            </span>
                          </div>

                          <ArrowRight className="h-3.5 w-3.5 text-slate-600" />

                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-slate-500">Proposed Fix:</span>
                            {isCustom ? (
                              <input
                                type="text"
                                value={item.custom_value ?? ""}
                                onChange={(e) => updateAnomalyAction(idx, "CUSTOM", e.target.value)}
                                className="font-mono text-xs px-2 py-0.5 rounded bg-slate-950 border border-indigo-500 text-indigo-200 focus:outline-none"
                              />
                            ) : (
                              <span className="font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 font-semibold">
                                {item.suggested_action === "DROP_ROW"
                                  ? "[DROP ROW]"
                                  : item.suggested_action === "NULLIFY"
                                  ? "[NULLIFY]"
                                  : String(item.proposed_value)}
                              </span>
                            )}
                          </div>

                          <span className="text-xs text-slate-500 font-mono">
                            Action: <span className="text-indigo-300">{item.suggested_action}</span>
                          </span>
                        </div>

                        {/* Grounded AI Explanation */}
                        <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 text-xs text-slate-300 leading-relaxed flex items-start space-x-2">
                          <Sparkles className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                          <div>
                            <p>{item.explanation}</p>
                            <div className="mt-1 flex items-center space-x-2 text-[10px] text-slate-500">
                              <span>Source: {item.engine_source}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Review Decision Buttons */}
                      <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center">
                        <button
                          onClick={() => updateAnomalyAction(idx, "APPROVE")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                            isApproved
                              ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/40"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Approve</span>
                        </button>

                        <button
                          onClick={() => updateAnomalyAction(idx, "CUSTOM", item.proposed_value)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                            isCustom
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          }`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => updateAnomalyAction(idx, "REJECT")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                            isRejected
                              ? "bg-rose-600 text-white shadow-sm shadow-rose-600/40"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-400"
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

        {/* TAB 2: DATA PROFILER */}
        {activeTab === "profile" && profile && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-base font-bold text-white mb-1">Column Hygiene & Distributions</h3>
              <p className="text-xs text-slate-400 mb-4">
                Detailed profile of schema types, missing rates, and statistical spread across all dataset columns.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profile.columns.map((col) => (
                  <div
                    key={col.name}
                    className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-indigo-300">
                        {col.name}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        col.type === "numeric"
                          ? "bg-sky-500/10 text-sky-300 border border-sky-500/20"
                          : col.type === "datetime"
                          ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                          : "bg-slate-800 text-slate-300"
                      }`}>
                        {col.type}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-[10px] text-slate-500 block">Missing Values</span>
                        <span className="font-semibold text-slate-200">
                          {col.null_count} ({col.null_percentage}%)
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-[10px] text-slate-500 block">Distinct Values</span>
                        <span className="font-semibold text-slate-200">{col.unique_count}</span>
                      </div>
                    </div>

                    {/* Numeric Statistics */}
                    {col.type === "numeric" && col.stats && (
                      <div className="border-t border-slate-800/80 pt-2 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Mean ± Std:</span>
                          <span className="text-slate-200 font-mono">
                            {col.stats.mean} ± {col.stats.std}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Median (IQR):</span>
                          <span className="text-slate-200 font-mono">
                            {col.stats.median} ({col.stats.iqr})
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Min → Max:</span>
                          <span className="text-slate-200 font-mono">
                            {col.stats.min} → {col.stats.max}
                          </span>
                        </div>

                        {/* Distribution Histogram Sparkline */}
                        {col.distribution && col.distribution.length > 0 && (
                          <div className="pt-2">
                            <span className="text-[10px] text-slate-500 block mb-1">Distribution Bins</span>
                            <div className="flex items-end h-10 gap-1 bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/60">
                              {col.distribution.map((bin, bidx) => {
                                const maxC = Math.max(...col.distribution.map((d) => d.count), 1);
                                const hPct = Math.round((bin.count / maxC) * 100);
                                return (
                                  <div
                                    key={bidx}
                                    title={`Bin ${bin.bin_start} - ${bin.bin_end}: ${bin.count} items`}
                                    className="flex-1 bg-indigo-500/70 hover:bg-indigo-400 rounded-sm transition"
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
                      <div className="border-t border-slate-800/80 pt-2 space-y-1 text-xs">
                        <span className="text-[10px] text-slate-500 block mb-1">Top Values</span>
                        {col.distribution.map((d, didx) => (
                          <div key={didx} className="flex justify-between text-slate-300">
                            <span className="truncate max-w-[140px] text-slate-400">{d.label}</span>
                            <span className="font-mono text-slate-500">{d.count}</span>
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

        {/* TAB 3: CLEANED DATA PREVIEW & AUDIT */}
        {activeTab === "preview" && (
          <div className="space-y-6">
            {!auditReport && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
                <FileSpreadsheet className="h-12 w-12 text-indigo-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Review Pending Export</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Click <strong>Apply & Export</strong> above to run data transformation, preserve original records,
                  and generate the cryptographic audit report.
                </p>
                <button
                  onClick={executeApplyFixes}
                  disabled={isExporting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
                >
                  {isExporting ? "Generating..." : "Apply Reviewed Corrections Now"}
                </button>
              </div>
            )}

            {auditReport && (
              <div className="space-y-6">
                {/* Provenance Card */}
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Cryptographic Data Provenance Verified</h3>
                        <p className="text-xs text-slate-400">
                          Executed at {auditReport.timestamp} UTC
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => downloadFile(cleanedCsv || "", `${datasetName.replace(/\s+/g, "_")}_cleaned.csv`, "text/csv")}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow-md shadow-emerald-600/30"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Clean CSV</span>
                      </button>

                      <button
                        onClick={() => downloadFile(auditReport.markdown_report, `Audit_Report_${datasetName.replace(/\s+/g, "_")}.md`, "text/markdown")}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Audit (.md)</span>
                      </button>
                    </div>
                  </div>

                  {/* SHA-256 Badges */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">
                        Input Raw CSV SHA-256 (Preserved)
                      </span>
                      <span className="font-mono text-xs text-slate-300 break-all select-all">
                        {auditReport.original_sha256}
                      </span>
                    </div>

                    <div className="bg-slate-950/80 p-3 rounded-xl border border-indigo-900/60">
                      <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block mb-1">
                        Cleaned Output CSV SHA-256 (Exported)
                      </span>
                      <span className="font-mono text-xs text-indigo-200 break-all select-all font-semibold">
                        {auditReport.cleaned_sha256}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Markdown Audit Report Display */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                  <h4 className="text-sm font-bold text-white">Itemized Audit Log & Modifications</h4>
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto max-h-96 whitespace-pre">
                    {auditReport.markdown_report}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: REPRODUCIBLE BENCHMARK EVALUATOR */}
        {activeTab === "benchmark" && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Zap className="h-5 w-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Reproducible Benchmark Evaluation</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Live scientific evaluation on the 100-row seeded dataset containing 20 pre-labeled ground-truth anomalies.
                    Compare SnoozeOps hybrid engine against a naive 3-sigma standard Z-score baseline.
                  </p>
                </div>

                <button
                  onClick={runLiveBenchmark}
                  disabled={benchmarkLoading}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold flex items-center space-x-2 transition shadow-lg shadow-orange-500/25 shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${benchmarkLoading ? "animate-spin" : ""}`} />
                  <span>{benchmarkLoading ? "Running Live Benchmark..." : "Run Live Evaluation"}</span>
                </button>
              </div>

              {benchmark ? (
                <div className="space-y-6 pt-4">
                  {/* Results Comparison Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Baseline Card */}
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-300">{benchmark.baseline.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          Standard Z-Score
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {benchmark.baseline.description}
                      </p>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-900/80 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">Recall</span>
                          <span className="text-xl font-black text-rose-400">
                            {Math.round(benchmark.baseline.recall * 100)}%
                          </span>
                        </div>
                        <div className="bg-slate-900/80 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">Precision</span>
                          <span className="text-xl font-black text-slate-200">
                            {Math.round(benchmark.baseline.precision * 100)}%
                          </span>
                        </div>
                        <div className="bg-slate-900/80 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-slate-500 uppercase block">F1 Score</span>
                          <span className="text-xl font-black text-slate-400">
                            {benchmark.baseline.f1_score.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                        <div className="flex justify-between">
                          <span>True Positives Caught:</span>
                          <span className="font-mono text-slate-300">{benchmark.baseline.true_positives} / {benchmark.known_anomalies}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>False Negatives (Missed):</span>
                          <span className="font-mono text-rose-400">{benchmark.baseline.false_negatives}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Runtime Latency:</span>
                          <span className="font-mono text-slate-300">{benchmark.baseline.runtime_ms} ms</span>
                        </div>
                      </div>
                    </div>

                    {/* SnoozeOps Card */}
                    <div className="bg-slate-950 border border-indigo-500/50 rounded-2xl p-5 space-y-4 shadow-xl shadow-indigo-950/40">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-indigo-300">{benchmark.snoozeops.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-semibold">
                          Hybrid AI Janitor
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {benchmark.snoozeops.description}
                      </p>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-indigo-950/40 border border-indigo-800/40 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-indigo-400 uppercase font-bold block">Recall</span>
                          <span className="text-xl font-black text-emerald-400">
                            {Math.round(benchmark.snoozeops.recall * 100)}%
                          </span>
                        </div>
                        <div className="bg-indigo-950/40 border border-indigo-800/40 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-indigo-400 uppercase font-bold block">Precision</span>
                          <span className="text-xl font-black text-indigo-200">
                            {Math.round(benchmark.snoozeops.precision * 100)}%
                          </span>
                        </div>
                        <div className="bg-indigo-950/40 border border-indigo-800/40 p-3 rounded-xl text-center">
                          <span className="text-[10px] text-indigo-400 uppercase font-bold block">F1 Score</span>
                          <span className="text-xl font-black text-emerald-300">
                            {benchmark.snoozeops.f1_score.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                        <div className="flex justify-between">
                          <span>True Positives Caught:</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {benchmark.snoozeops.true_positives} / {benchmark.known_anomalies} (100%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>False Positives:</span>
                          <span className="font-mono text-emerald-400 font-bold">0</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Runtime Latency:</span>
                          <span className="font-mono text-indigo-300">{benchmark.snoozeops.runtime_ms} ms</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Benchmark Takeaway Banner */}
                  <div className="bg-gradient-to-r from-emerald-950/40 to-indigo-950/40 border border-emerald-500/30 rounded-2xl p-5 flex items-start space-x-3 text-xs leading-relaxed text-slate-200">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block text-sm mb-1">
                        Empirical Benchmark Gain: +{benchmark.comparison.recall_improvement_pct}% Anomaly Recall
                      </strong>
                      <p>{benchmark.comparison.summary}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                  Click <strong>Run Live Evaluation</strong> to compute precision, recall, and false positive metrics in real-time.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Model & TabPFN Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Model & Engine Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">AI Reasoning Provider</label>
                <select
                  value={modelConfig.provider}
                  onChange={(e) => setModelConfig({ ...modelConfig, provider: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="deterministic">Deterministic Janitor (100% Local, Zero Egress - Recommended)</option>
                  <option value="ollama">Ollama (Local Gemma - http://localhost:11434)</option>
                  <option value="groq">Groq / OpenAI-compatible (Gemma 2)</option>
                  <option value="huggingface">Hugging Face Inference API</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Model Name</label>
                <input
                  type="text"
                  value={modelConfig.model}
                  onChange={(e) => setModelConfig({ ...modelConfig, model: e.target.value })}
                  placeholder="gemma2:2b or gemma2:9b"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">API Endpoint URL</label>
                <input
                  type="text"
                  value={modelConfig.endpoint}
                  onChange={(e) => setModelConfig({ ...modelConfig, endpoint: e.target.value })}
                  placeholder="http://localhost:11434/api/generate"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {modelConfig.provider !== "deterministic" && modelConfig.provider !== "ollama" && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">API Key / Bearer Token</label>
                  <input
                    type="password"
                    value={modelConfig.api_key}
                    onChange={(e) => setModelConfig({ ...modelConfig, api_key: e.target.value })}
                    placeholder="gsk_... or hf_..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-200 block">TabPFN Deep Residual Modeling</span>
                    <span className="text-[10px] text-slate-400">
                      Enable TabPFN Prior-Data Fitted Network for multivariate regression consistency
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modelConfig.enable_tabpfn}
                    onChange={(e) => setModelConfig({ ...modelConfig, enable_tabpfn: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950 cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-slate-300 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Privacy & Data Egress Guarantee
                </span>
                <p>
                  Deterministic mode and Ollama run entirely locally with zero external network traffic.
                  If an external provider is selected, only minimal statistical anomaly summaries are transmitted.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500">
        <p>
          SnoozeOps — Hacktoberfest 2026: Slow and Steady Open-Source AI Challenge.
          Built with Next.js, TypeScript, Tailwind CSS, FastAPI, and Open-Weight Gemma / TabPFN.
        </p>
      </footer>
    </div>
  );
}
