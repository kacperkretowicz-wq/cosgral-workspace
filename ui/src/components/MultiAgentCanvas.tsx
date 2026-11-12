import React, { useState, useMemo } from "react";
import {
  Bot,
  Cpu,
  Eye,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Shield,
  Activity,
  Layers,
  Terminal,
  Code,
  Share2,
  Sliders,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  Check,
  Maximize2,
  ChevronRight,
  ChevronDown,
  Lock,
  Workflow
} from "lucide-react";

export type AgentRole = "Coordinator" | "Executor" | "Auditor" | "Vision Lead" | "Standby";

export type AgentStatus = "working" | "thinking" | "waiting" | "quota_limit" | "idle";

export interface CanvasAgent {
  id: string;
  name: string;
  avatar: string;
  role: AgentRole;
  status: AgentStatus;
  model: string;
  tokenUsagePercent: number;
  currentTask: string;
  lastActive: string;
  draftSnippet?: string;
  color: string;
}

export interface TaskEdge {
  from: string;
  to: string;
  label: string;
  status: "active" | "completed" | "waiting";
}

export interface SharedVariable {
  key: string;
  value: string;
  updatedBy: string;
  timestamp: string;
}

export interface BoundingBoxDetection {
  id: string;
  label: string;
  coords: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  confidence: number;
}

export const MultiAgentCanvas: React.FC = () => {
  // --- View States ---
  const [viewMode, setViewMode] = useState<"dag" | "matrix" | "vision">("dag");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("agent-geminek");
  const [isDockOpen, setIsDockOpen] = useState<boolean>(true);
  const [dockTab, setDockTab] = useState<"telemetry" | "grok-eyes" | "plugins" | "memory">("telemetry");

  // --- Agents State ---
  const [agents, setAgents] = useState<CanvasAgent[]>([
    {
      id: "agent-gremlinek",
      name: "Gremlinek",
      avatar: "👑",
      role: "Coordinator",
      status: "working",
      model: "OpenCode / DeepSeek-V3",
      tokenUsagePercent: 42,
      currentTask: "Orkiestracja zadań zespołu i kontrola limitów tokenów",
      lastActive: "Przed chwilą (12ms)",
      draftSnippet: "Nadzór nad synchronizacją gałęzi; delegacja UI do Geminka.",
      color: "#3B82F6"
    },
    {
      id: "agent-geminek",
      name: "Geminek",
      avatar: "👁️",
      role: "Designer/Vision" as AgentRole,
      status: "working",
      model: "Gemini-2.5-Pro",
      tokenUsagePercent: 58,
      currentTask: "Implementacja MultiAgentCanvas.tsx (OLED Dark #090A0F)",
      lastActive: "Teraz",
      draftSnippet: "export const MultiAgentCanvas: React.FC = () => { ... }",
      color: "#06B6D4"
    },
    {
      id: "agent-cursork",
      name: "Cursor K",
      avatar: "⚡",
      role: "Executor",
      status: "working",
      model: "Claude 3.7 Sonnet",
      tokenUsagePercent: 71,
      currentTask: "Integracja autostartu loopbacku z procesem Electron .EXE",
      lastActive: "4s temu",
      draftSnippet: "app-shell/src/main.js -> autostart backend child process.",
      color: "#10B981"
    },
    {
      id: "agent-claudek",
      name: "Claude K",
      avatar: "🛡️",
      role: "Auditor",
      status: "working",
      model: "Claude 3.7 Sonnet",
      tokenUsagePercent: 64,
      currentTask: "Wdrożenie adaptera Grok-Eyes i weryfikatora wtyczek JIT",
      lastActive: "1s temu",
      draftSnippet: "desktopCapturer stream buffer validation -> OK",
      color: "#8B5CF6"
    },
    {
      id: "agent-terra",
      name: "Terra",
      avatar: "⏸️",
      role: "Standby",
      status: "quota_limit",
      model: "OpenRouter / Qwen-2.5",
      tokenUsagePercent: 98,
      currentTask: "Rezerwa robocza (Reset limitu o 01:00)",
      lastActive: "15 min temu",
      color: "#F43F5E"
    }
  ]);

  // --- Shared Session Memory State ---
  const [sharedMemory, setSharedMemory] = useState<SharedVariable[]>([
    { key: "TARGET_EXE", value: "COSGRAL Workspace.exe (195 MB)", updatedBy: "Cursor K", timestamp: "00:26" },
    { key: "LOOPBACK_URL", value: "http://127.0.0.1:3100", updatedBy: "Cursor K", timestamp: "00:28" },
    { key: "VISION_STREAM_FPS", value: "5.0 FPS (WebRTC zero-copy)", updatedBy: "Claude K", timestamp: "08:15" },
    { key: "ACTIVE_SPEC", value: "DESIGN.md (Impeccable OLED Anti-Slop)", updatedBy: "Geminek", timestamp: "08:20" }
  ]);

  // --- Grok-Eyes Telemetry ---
  const visionDetections: BoundingBoxDetection[] = [
    { id: "box-1", label: "Button [Kompiluj EXE]", coords: [120, 340, 160, 480], confidence: 0.99 },
    { id: "box-2", label: "Console Error Log", coords: [540, 100, 680, 920], confidence: 0.96 },
    { id: "box-3", label: "Sidebar Navigation Item", coords: [40, 12, 80, 240], confidence: 0.98 }
  ];

  // --- Interactive Handlers ---
  const handleRoleChange = (agentId: string, newRole: AgentRole) => {
    setAgents(prev =>
      prev.map(a => (a.id === agentId ? { ...a, role: newRole } : a))
    );
  };

  const handleTriggerSuccession = (exhaustedAgentId: string) => {
    setAgents(prev => {
      const standbyAgent = prev.find(a => a.role === "Standby");
      if (!standbyAgent) return prev;
      return prev.map(a => {
        if (a.id === exhaustedAgentId) {
          return { ...a, role: "Standby", status: "quota_limit" };
        }
        if (a.id === standbyAgent.id) {
          return { ...a, role: "Executor", status: "working", tokenUsagePercent: 0 };
        }
        return a;
      });
    });
  };

  const selectedAgent = useMemo(
    () => agents.find(a => a.id === selectedAgentId) || agents[0],
    [agents, selectedAgentId]
  );

  return (
    <div className="flex h-screen w-full flex-col bg-[#090A0F] text-[#F8FAFC] font-sans antialiased select-none overflow-hidden">
      {/* =========================================================================
          TOP TOOLBAR: Session Header & Quick Controls
      ========================================================================== */}
      <header className="flex h-13 items-center justify-between border-b border-[#2A3142] bg-[#12151D] px-4 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1A1E29] border border-[#2A3142] text-[#06B6D4]">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-semibold tracking-wider text-[#94A3B8] uppercase">
                COSGRAL WORKSPACE
              </span>
              <span className="text-[#2A3142]">/</span>
              <h1 className="text-sm font-semibold text-[#F8FAFC]">
                Multi-Agent Canvas: Sesja Kooperacyjna
              </h1>
              <span className="inline-flex items-center rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-medium text-[#10B981] border border-[#10B981]/20">
                <span className="mr-1 h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                MESH LIVE (4 AKTYWNYCH)
              </span>
            </div>
          </div>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center rounded-lg border border-[#2A3142] bg-[#090A0F] p-0.5">
          <button
            onClick={() => setViewMode("dag")}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              viewMode === "dag"
                ? "bg-[#242A38] text-[#F8FAFC] shadow-sm"
                : "text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-[#06B6D4]" />
            <span>Graf Zadań (DAG)</span>
          </button>
          <button
            onClick={() => setViewMode("matrix")}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              viewMode === "matrix"
                ? "bg-[#242A38] text-[#F8FAFC] shadow-sm"
                : "text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-[#8B5CF6]" />
            <span>Matryca Ról</span>
          </button>
          <button
            onClick={() => setViewMode("vision")}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              viewMode === "vision"
                ? "bg-[#242A38] text-[#F8FAFC] shadow-sm"
                : "text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            <Eye className="h-3.5 w-3.5 text-[#06B6D4]" />
            <span>Grok-Eyes HUD</span>
          </button>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center space-x-2">
          <div className="hidden lg:flex items-center space-x-1.5 rounded bg-[#1A1E29] border border-[#2A3142] px-2.5 py-1 text-[11px] text-[#94A3B8] font-mono">
            <span className="font-semibold text-[#F8FAFC]">Ctrl+Space</span>
            <span>widok</span>
            <span className="text-[#2A3142]">|</span>
            <span className="font-semibold text-[#F8FAFC]">1-3</span>
            <span>decyzje</span>
          </div>

          <button
            onClick={() => handleTriggerSuccession("agent-cursork")}
            className="flex items-center space-x-1.5 rounded border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-2.5 py-1.5 text-xs font-medium text-[#F43F5E] hover:bg-[#F43F5E]/20 transition-colors"
            title="Wymuś przekazanie zadań do agenta rezerwowego"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Wymuś Sukcesję</span>
          </button>

          <button
            onClick={() => setIsDockOpen(!isDockOpen)}
            className={`rounded p-1.5 border transition-colors ${
              isDockOpen
                ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]"
                : "border-[#2A3142] text-[#94A3B8] hover:bg-[#1A1E29]"
            }`}
            title="Przełącz Panel Kontekstu"
          >
            <Sliders className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN WORKSPACE LAYOUT (3-Pane: Left Rail + Center Canvas + Right Dock)
      ========================================================================== */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* -----------------------------------------------------------------------
            LEFT RAIL: Active Agents & Roles Matrix (280px)
        ------------------------------------------------------------------------ */}
        <aside className="w-72 shrink-0 border-r border-[#2A3142] bg-[#12151D] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between p-3 border-b border-[#2A3142]">
              <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                Zespół Agentów ({agents.length})
              </span>
              <span className="text-[10px] font-mono text-[#06B6D4] bg-[#06B6D4]/10 border border-[#06B6D4]/20 px-1.5 py-0.5 rounded">
                AUTONOMIA 100%
              </span>
            </div>

            <div className="divide-y divide-[#2A3142]/50 overflow-y-auto max-h-[calc(100vh-180px)]">
              {agents.map(agent => {
                const isSelected = agent.id === selectedAgentId;
                const isLimit = agent.status === "quota_limit";

                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#1A1E29] border-l-2 border-[#06B6D4]"
                        : "hover:bg-[#1A1E29]/50 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-base">{agent.avatar}</span>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-medium text-[#F8FAFC]">
                              {agent.name}
                            </span>
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: isLimit
                                  ? "#F43F5E"
                                  : agent.status === "working"
                                  ? "#10B981"
                                  : "#F59E0B"
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-[#64748B]">
                            {agent.model}
                          </span>
                        </div>
                      </div>

                      {/* Role Pill */}
                      <span className="rounded bg-[#242A38] border border-[#2A3142] px-2 py-0.5 text-[10px] font-mono text-[#94A3B8]">
                        {agent.role}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#94A3B8] line-clamp-1 mb-2">
                      {agent.currentTask}
                    </p>

                    {/* Token Gas Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-[#64748B]">
                        <span>Kontekst / Tokeny</span>
                        <span className={agent.tokenUsagePercent > 80 ? "text-[#F43F5E]" : ""}>
                          {agent.tokenUsagePercent}%
                        </span>
                      </div>
                      <div className="h-1 w-full bg-[#090A0F] rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${agent.tokenUsagePercent}%`,
                            backgroundColor:
                              agent.tokenUsagePercent > 80
                                ? "#F43F5E"
                                : agent.tokenUsagePercent > 60
                                ? "#F59E0B"
                                : "#10B981"
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Footer Action in Sidebar */}
          <div className="p-3 border-t border-[#2A3142] bg-[#090A0F]">
            <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
              <span className="flex items-center space-x-1">
                <Shield className="h-3.5 w-3.5 text-[#10B981]" />
                <span>Pętla Safe-Sandbox</span>
              </span>
              <span className="font-mono text-[#10B981]">AKTYWNA</span>
            </div>
          </div>
        </aside>

        {/* -----------------------------------------------------------------------
            CENTER AREA: Multi-Agent Canvas (Visual DAG, Flow & Decision Cards)
        ------------------------------------------------------------------------ */}
        <main className="flex-1 flex flex-col bg-[#090A0F] overflow-y-auto relative p-6">
          {/* Canvas Background Grid Pattern */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle, #2A3142 1px, transparent 1px)",
              backgroundSize: "24px 24px"
            }}
          />

          {/* Canvas Sub-Header: Active Focus View */}
          <div className="relative z-10 flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-[#F8FAFC]">
                Interaktywne Płótno Operacyjne
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Wizualizacja zależności w czasie rzeczywistym z podglądem szkiców botów
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-[#94A3B8] bg-[#12151D] border border-[#2A3142] px-2.5 py-1 rounded">
                Kompilacja: <strong className="text-[#10B981]">OK (12ms)</strong>
              </span>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              VISUAL GRAPH NODES (Interactive DAG Layout)
          -------------------------------------------------------------------- */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {agents.map(agent => {
              const isSelected = agent.id === selectedAgentId;
              const isWorking = agent.status === "working";

              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`rounded-lg border bg-[#1A1E29] p-4 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "border-[#3B82F6] ring-1 ring-[#3B82F6] shadow-lg shadow-[#3B82F6]/10"
                      : "border-[#2A3142] hover:border-[#3B82F6]/50"
                  }`}
                >
                  {/* Node Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#12151D] border border-[#2A3142] text-xl">
                        {agent.avatar}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <h3 className="text-sm font-semibold text-[#F8FAFC]">
                            {agent.name}
                          </h3>
                          {isWorking && (
                            <span className="flex h-2 w-2 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#64748B]">
                          {agent.model}
                        </span>
                      </div>
                    </div>

                    {/* Role Dropdown Selector */}
                    <select
                      value={agent.role}
                      onChange={e =>
                        handleRoleChange(agent.id, e.target.value as AgentRole)
                      }
                      onClick={e => e.stopPropagation()}
                      className="rounded border border-[#2A3142] bg-[#12151D] px-2 py-1 text-[11px] font-mono text-[#06B6D4] focus:border-[#3B82F6] focus:outline-none"
                    >
                      <option value="Coordinator">Coordinator</option>
                      <option value="Executor">Executor</option>
                      <option value="Auditor">Auditor</option>
                      <option value="Vision Lead">Vision Lead</option>
                      <option value="Standby">Standby</option>
                    </select>
                  </div>

                  {/* Active Task Box */}
                  <div className="rounded border border-[#2A3142] bg-[#12151D] p-2.5 mb-3">
                    <div className="flex items-center justify-between text-[10px] text-[#64748B] mb-1 font-mono">
                      <span>BIEŻĄCE ZADANIE</span>
                      <span className="text-[#06B6D4] font-medium">PRIORYTET P0</span>
                    </div>
                    <p className="text-xs text-[#F8FAFC] font-medium leading-relaxed">
                      {agent.currentTask}
                    </p>
                  </div>

                  {/* Draft Stream Preview (Anti-Slop Transparency) */}
                  {agent.draftSnippet && (
                    <div className="rounded border border-[#2A3142]/70 bg-[#090A0F] p-2 mb-3 font-mono text-[11px] text-[#94A3B8] overflow-hidden">
                      <div className="flex items-center justify-between text-[9px] text-[#64748B] mb-1">
                        <span className="flex items-center space-x-1">
                          <Terminal className="h-3 w-3 text-[#10B981]" />
                          <span>Podgląd Szkicu w Locie</span>
                        </span>
                        <span>{agent.lastActive}</span>
                      </div>
                      <div className="truncate text-[#10B981] font-mono">
                        {agent.draftSnippet}
                      </div>
                    </div>
                  )}

                  {/* Node Bottom Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#2A3142]/50 text-[10px] font-mono">
                    <span className="text-[#64748B]">
                      Zużycie limitu:{" "}
                      <strong className="text-[#F8FAFC]">
                        {agent.tokenUsagePercent}%
                      </strong>
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleRoleChange(
                          agent.id,
                          agent.role === "Auditor" ? "Executor" : "Auditor"
                        );
                      }}
                      className="text-[#06B6D4] hover:underline"
                    >
                      Zmień Rolę →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* -------------------------------------------------------------------
              INTERACTIVE DECISION CARD (In-Canvas Approval Guard / ask_user)
          -------------------------------------------------------------------- */}
          <div className="relative z-10 rounded-lg border border-[#F59E0B]/30 bg-[#12151D] p-4 mb-6 shadow-md">
            <div className="flex items-start space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-[#F8FAFC] uppercase tracking-wider">
                    Approval Guard: Wymagana Autoryzacja Zmiany Architektury
                  </h4>
                  <span className="rounded bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2 py-0.5 text-[10px] font-mono text-[#F59E0B]">
                    KROK KRYTYCZNY
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] mb-3">
                  Agent <strong>Claude K</strong> przygotował skrypt instalacyjny dla wtyczki Grok-Eyes. 
                  Czy zatwierdzasz wdrożenie do runtime bez restartu aplikacji?
                </p>

                {/* 1-2-3 Quick Decision Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button className="flex items-center space-x-1.5 rounded border border-[#10B981] bg-[#10B981]/20 px-3 py-1.5 text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/30 transition-all">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-[#10B981] text-[#090A0F] text-[10px]">
                      1
                    </span>
                    <span>Zatwierdź i Włącz JIT (Enter)</span>
                  </button>

                  <button className="flex items-center space-x-1.5 rounded border border-[#2A3142] bg-[#1A1E29] px-3 py-1.5 text-xs font-medium text-[#F8FAFC] hover:bg-[#242A38] transition-all">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-[#242A38] text-[#94A3B8] text-[10px]">
                      2
                    </span>
                    <span>Wymagaj Weryfikacji przez Sol</span>
                  </button>

                  <button className="flex items-center space-x-1.5 rounded border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-3 py-1.5 text-xs font-medium text-[#F43F5E] hover:bg-[#F43F5E]/20 transition-all">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-[#F43F5E]/20 text-[#F43F5E] text-[10px]">
                      3
                    </span>
                    <span>Odrzuć Kod (Esc)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              SHARED STATE & BLACKBOARD TABLE
          -------------------------------------------------------------------- */}
          <div className="relative z-10 rounded-lg border border-[#2A3142] bg-[#12151D] p-4">
            <div className="flex items-center justify-between mb-3 border-b border-[#2A3142] pb-2">
              <div className="flex items-center space-x-2">
                <Share2 className="h-4 w-4 text-[#06B6D4]" />
                <h4 className="text-xs font-semibold text-[#F8FAFC] uppercase tracking-wider">
                  Wspólna Tablica Pamięci Sesji (Shared Blackboard)
                </h4>
              </div>
              <span className="text-[10px] font-mono text-[#64748B]">
                SYNCHRONIZACJA WEBSOCKET: 0ms
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#2A3142] text-[#64748B] text-[11px]">
                    <th className="pb-2 font-medium">ZMIENNA</th>
                    <th className="pb-2 font-medium">WARTOŚĆ W PAMIĘCI</th>
                    <th className="pb-2 font-medium">ZAKTUALIZOWAŁ</th>
                    <th className="pb-2 font-medium">CZAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3142]/40 text-[#94A3B8]">
                  {sharedMemory.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#1A1E29]/40">
                      <td className="py-2 text-[#06B6D4]">{item.key}</td>
                      <td className="py-2 text-[#F8FAFC] font-semibold">{item.value}</td>
                      <td className="py-2 text-[#8B5CF6]">{item.updatedBy}</td>
                      <td className="py-2 text-[#64748B]">{item.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* -----------------------------------------------------------------------
            RIGHT DOCK: Collapsible Inspection Drawer (320px)
        ------------------------------------------------------------------------ */}
        {isDockOpen && (
          <aside className="w-80 shrink-0 border-l border-[#2A3142] bg-[#12151D] flex flex-col">
            {/* Dock Header Tabs */}
            <div className="flex border-b border-[#2A3142] bg-[#090A0F] text-xs font-medium">
              <button
                onClick={() => setDockTab("telemetry")}
                className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
                  dockTab === "telemetry"
                    ? "border-[#06B6D4] text-[#06B6D4] bg-[#12151D]"
                    : "border-transparent text-[#94A3B8] hover:text-[#F8FAFC]"
                }`}
              >
                Telemetria
              </button>
              <button
                onClick={() => setDockTab("grok-eyes")}
                className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
                  dockTab === "grok-eyes"
                    ? "border-[#06B6D4] text-[#06B6D4] bg-[#12151D]"
                    : "border-transparent text-[#94A3B8] hover:text-[#F8FAFC]"
                }`}
              >
                Grok-Eyes
              </button>
              <button
                onClick={() => setDockTab("plugins")}
                className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
                  dockTab === "plugins"
                    ? "border-[#06B6D4] text-[#06B6D4] bg-[#12151D]"
                    : "border-transparent text-[#94A3B8] hover:text-[#F8FAFC]"
                }`}
              >
                Pluginy JIT
              </button>
            </div>

            {/* Dock Content Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {dockTab === "telemetry" && (
                <div className="space-y-4 text-xs font-mono">
                  <div className="rounded border border-[#2A3142] bg-[#1A1E29] p-3">
                    <span className="text-[10px] text-[#64748B] block mb-1">
                      CZAS ODPOWIEDZI UI
                    </span>
                    <span className="text-xl font-bold text-[#10B981]">11.4 ms</span>
                    <span className="text-[10px] text-[#94A3B8] block mt-1">
                      Stałe 60 FPS (Vite + Electron)
                    </span>
                  </div>

                  <div className="rounded border border-[#2A3142] bg-[#1A1E29] p-3">
                    <span className="text-[10px] text-[#64748B] block mb-1">
                      ZUŻYCIE PAMIĘCI RAM
                    </span>
                    <span className="text-xl font-bold text-[#F8FAFC]">142 MB</span>
                    <span className="text-[10px] text-[#10B981] block mt-1">
                      Optymalnie (&lt; 200 MB target)
                    </span>
                  </div>

                  <div className="rounded border border-[#2A3142] bg-[#1A1E29] p-3">
                    <span className="text-[10px] text-[#64748B] block mb-1">
                      AKTYWNY AGENT W FOKUSIE
                    </span>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-lg">{selectedAgent.avatar}</span>
                      <div>
                        <div className="font-semibold text-[#F8FAFC]">
                          {selectedAgent.name}
                        </div>
                        <div className="text-[10px] text-[#06B6D4]">
                          {selectedAgent.role}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {dockTab === "grok-eyes" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#F8FAFC]">Wykryte Kontrolki UI (HUD)</span>
                    <span className="text-[10px] font-mono text-[#06B6D4]">3 OBIEKTY</span>
                  </div>

                  {visionDetections.map(det => (
                    <div
                      key={det.id}
                      className="rounded border border-[#2A3142] bg-[#1A1E29] p-2.5 font-mono text-[11px]"
                    >
                      <div className="flex items-center justify-between text-[#F8FAFC] font-semibold mb-1">
                        <span>{det.label}</span>
                        <span className="text-[#10B981]">
                          {(det.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        BBox: [{det.coords.join(", ")}]
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {dockTab === "plugins" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#F8FAFC]">Dynamiczne Studio Pluginów</span>
                    <span className="text-[10px] font-mono text-[#10B981]">JIT READY</span>
                  </div>

                  <div className="rounded border border-[#2A3142] bg-[#090A0F] p-2.5 font-mono text-[10px] text-[#94A3B8]">
                    <span className="text-[#06B6D4] block mb-1">
                      // Wygenerowane w locie przez bota
                    </span>
                    <code>
                      export async function captureScreen() &#123;
                      <br />
                      &nbsp;&nbsp;return await window.electronAPI.desktopCapture();
                      <br />
                      &#125;
                    </code>
                  </div>

                  <button className="w-full rounded border border-[#06B6D4] bg-[#06B6D4]/10 py-2 text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/20 transition-colors">
                    Kompiluj Nowe Narzędzie JIT
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default MultiAgentCanvas;
