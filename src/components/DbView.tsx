import React, { useState, useMemo, useEffect } from 'react';
import {
  DistributionBoard,
  Circuit,
  CircuitCategory,
  PhaseType,
  VoltageSystem,
  SubDistributionBoard,
  MainSwitchBoard,
  CircuitPreset,
  CableScheduleEntry,
} from '../types/electrical';
import {
  CATEGORY_DEFAULTS,
  DEFAULT_CIRCUIT_PRESETS,
  autoBalanceDBPhases,
  getDuplicateCircuitName,
  getStepCableSize,
  getStepBreakerSize,
  getDbVoltageDropValidation,
} from '../utils/electricalCalculations';
import { PresetGroupsModal } from './PresetGroupsModal';
import { NumericInput } from './NumericInput';
import {
  Plus,
  Trash2,
  Copy,
  Scale,
  ShieldCheck,
  Cable,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Plug,
  Fan,
  Utensils,
  Cog,
  Server,
  HelpCircle,
  Table as TableIcon,
  CreditCard,
  Sliders,
  GripVertical,
  Zap,
  ArrowLeftRight,
  ArrowRight,
  Lock,
} from 'lucide-react';

interface DbViewProps {
  dbs: DistributionBoard[];
  subDbs: SubDistributionBoard[];
  selectedDbId: string;
  onSelectDbId: (id: string) => void;
  onUpdateDb: (updated: DistributionBoard) => void;
  onAddDb: () => void;
  onDeleteDb: (id: string) => void;
  onDuplicateDb?: (db: DistributionBoard) => void;
  voltageSystem: VoltageSystem;
  msb?: MainSwitchBoard;
  msbs?: MainSwitchBoard[];
  onNavigateToSubDb?: (subDbId: string) => void;
  onNavigateToMsb?: (msbId?: string) => void;
  circuitPresets?: CircuitPreset[];
  onUpdateCircuitPresets?: (newPresets: CircuitPreset[]) => void;
  allDbs?: DistributionBoard[];
  cableSchedule?: CableScheduleEntry[];
}

const CATEGORY_ICONS: Record<CircuitCategory, React.ReactNode> = {
  LIGHTING: <Lightbulb className="w-3.5 h-3.5 text-amber-500" />,
  RECEPTACLE: <Plug className="w-3.5 h-3.5 text-blue-500" />,
  HVAC: <Fan className="w-3.5 h-3.5 text-cyan-500" />,
  POWER_APPLIANCE: <Utensils className="w-3.5 h-3.5 text-orange-500" />,
  MOTOR_PUMP: <Cog className="w-3.5 h-3.5 text-purple-500" />,
  IT_CRITICAL: <Server className="w-3.5 h-3.5 text-rose-500" />,
  SPARE: <HelpCircle className="w-3.5 h-3.5 text-slate-400" />,
  CUSTOM: <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />,
};

// Standardized NumericInput alias for backward compatibility
const DecimalInput = NumericInput;

export const DbView: React.FC<DbViewProps> = ({
  dbs,
  subDbs,
  selectedDbId,
  onSelectDbId,
  onUpdateDb,
  onAddDb,
  onDeleteDb,
  onDuplicateDb,
  voltageSystem,
  msb,
  msbs = [],
  onNavigateToSubDb,
  onNavigateToMsb,
  circuitPresets,
  onUpdateCircuitPresets,
  allDbs,
  cableSchedule,
}) => {
  const currentDb = dbs.find((d) => d.id === selectedDbId) || dbs[0];
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [localPresets, setLocalPresets] = useState<CircuitPreset[]>(() =>
    circuitPresets && circuitPresets.length > 0 ? circuitPresets : DEFAULT_CIRCUIT_PRESETS
  );

  useEffect(() => {
    if (circuitPresets && circuitPresets.length > 0) {
      setLocalPresets(circuitPresets);
    }
  }, [circuitPresets]);

  const activePresets = circuitPresets || localPresets;

  // Circuit usage counts across all DBs
  const circuitUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const boards = allDbs && allDbs.length > 0 ? allDbs : dbs;
    boards.forEach((board) => {
      board.circuits.forEach((c) => {
        if (c.presetId) {
          counts[c.presetId] = (counts[c.presetId] || 0) + 1;
        }
      });
    });
    return counts;
  }, [allDbs, dbs]);

  // Synchronize changes to presets across circuits
  const handleUpdatePresets = (newPresets: CircuitPreset[]) => {
    if (onUpdateCircuitPresets) {
      onUpdateCircuitPresets(newPresets);
    } else {
      setLocalPresets(newPresets);
      const updatedCircuits = currentDb.circuits.map((c) => {
        if (c.presetId) {
          const matched = newPresets.find((p) => p.id === c.presetId);
          if (matched) {
            return {
              ...c,
              unitWatts: matched.unitWatts,
              powerFactor: matched.powerFactor,
              diversityFactor: matched.diversityFactor,
              category: matched.category || c.category,
            };
          }
          return { ...c, presetId: undefined };
        }
        return c;
      });
      onUpdateDb({ ...currentDb, circuits: updatedCircuits });
    }
  };

  const isDirectMsb =
    currentDb?.subDbId?.toUpperCase() === 'MSB' ||
    Boolean(
      msb &&
        (currentDb?.subDbId === msb.id ||
          currentDb?.subDbId?.toLowerCase() === msb.code?.toLowerCase())
    ) ||
    Boolean(
      msbs.some(
        (m) =>
          m.id === currentDb?.subDbId ||
          m.code?.toLowerCase() === currentDb?.subDbId?.toLowerCase()
      )
    );

  // Upstream supply source resolution for direct navigation
  const matchedSubDb = subDbs.find(
    (s) => s.id === currentDb?.subDbId || s.code?.toLowerCase() === currentDb?.subDbId?.toLowerCase()
  );
  const matchedMsb =
    (msbs.length > 0 ? msbs : msb ? [msb] : []).find(
      (m) => m.id === currentDb?.subDbId || m.code?.toLowerCase() === currentDb?.subDbId?.toLowerCase()
    ) || (isDirectMsb ? (msbs[0] || msb) : undefined);

  const handleGoToFedFromBoard = () => {
    if (matchedSubDb && onNavigateToSubDb) {
      onNavigateToSubDb(matchedSubDb.id);
    } else if ((matchedMsb || isDirectMsb) && onNavigateToMsb) {
      onNavigateToMsb(matchedMsb?.id);
    }
  };

  const upstreamTargetLabel = matchedSubDb
    ? `Go to Sub-DB: ${matchedSubDb.code}${matchedSubDb.name ? ` (${matchedSubDb.name})` : ''}`
    : matchedMsb
    ? `Go to MSB: ${matchedMsb.code}${matchedMsb.name ? ` (${matchedMsb.name})` : ''}`
    : isDirectMsb
    ? 'Go to Main Switchboard (MSB)'
    : 'Go to fed from board';
  const [balanceMessage, setBalanceMessage] = useState<string | null>(null);
  // View mode for mobile/tablet: 'table' or 'cards'
  const [circuitDisplayMode, setCircuitDisplayMode] = useState<'table' | 'cards'>('table');
  const [autoBalanceCount, setAutoBalanceCount] = useState<number>(0);

  // Drag and Drop state for manual Circuit Schedule reordering (strictly initiated via Drag Handle)
  const [draggedCircuitIndex, setDraggedCircuitIndex] = useState<number | null>(null);
  const [dragOverCircuitIndex, setDragOverCircuitIndex] = useState<number | null>(null);
  const [canDragCircuitIndex, setCanDragCircuitIndex] = useState<number | null>(null);

  // Column sorting state for Circuit Schedule ("Circuit Description")
  const [circuitSortDirection, setCircuitSortDirection] = useState<'none' | 'asc' | 'desc'>('none');

  const toggleCircuitSort = () => {
    setCircuitSortDirection((prev) => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  // Sorted circuits list (natural alphanumeric sorting A-Z and Z-A, or default original order)
  const sortedCircuits = useMemo(() => {
    if (circuitSortDirection === 'none') {
      return currentDb.circuits;
    }
    return [...currentDb.circuits].sort((a, b) => {
      const cmp = (a.name || '').localeCompare(b.name || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return circuitSortDirection === 'asc' ? cmp : -cmp;
    });
  }, [currentDb.circuits, circuitSortDirection]);

  const handleCircuitDragStart = (e: React.DragEvent, index: number) => {
    // Disable manual drag-reordering while an active column sort is applied
    if (circuitSortDirection !== 'none') {
      e.preventDefault();
      return;
    }
    // Only allow drag-and-drop if initiated from the drag handle
    if (canDragCircuitIndex !== index) {
      e.preventDefault();
      return;
    }
    const targetTag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'OPTION', 'TEXTAREA'].includes(targetTag)) {
      e.preventDefault();
      return;
    }
    setDraggedCircuitIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleCircuitDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedCircuitIndex !== null && draggedCircuitIndex !== index) {
      setDragOverCircuitIndex(index);
    }
  };

  const handleCircuitDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedCircuitIndex !== null && draggedCircuitIndex !== targetIndex) {
      const reordered = [...currentDb.circuits];
      const [moved] = reordered.splice(draggedCircuitIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      onUpdateDb({
        ...currentDb,
        circuits: reordered,
      });
    }
    setDraggedCircuitIndex(null);
    setDragOverCircuitIndex(null);
    setCanDragCircuitIndex(null);
  };

  const handleCircuitDragEnd = () => {
    setDraggedCircuitIndex(null);
    setDragOverCircuitIndex(null);
    setCanDragCircuitIndex(null);
  };

  // Natural Alphanumeric Sort for DB tabs (case-insensitive, natural number order e.g. L5 before L10)
  const sortedDbs = useMemo(() => {
    return [...dbs].sort((a, b) =>
      (a.code || '').localeCompare(b.code || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      }) ||
      (a.name || '').localeCompare(b.name || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [dbs]);

  if (!currentDb) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <p>No Distribution Board created yet.</p>
        <button
          onClick={onAddDb}
          className="mt-3 px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-md text-sm"
        >
          Create First DB
        </button>
      </div>
    );
  }

  // Handle adding circuit
  const handleAddCircuit = () => {
    const defaultCat: CircuitCategory = 'LIGHTING';
    const def = CATEGORY_DEFAULTS[defaultCat];
    const newCircuit: Circuit = {
      id: `c-${Date.now()}`,
      name: `New Circuit ${currentDb.circuits.length + 1}`,
      category: defaultCat,
      phase: 'R',
      quantity: 1,
      unitWatts: 1000,
      powerFactor: def.defaultPowerFactor,
      diversityFactor: def.defaultDiversity,
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      currentIb: 0,
      recommendedBreaker: {} as any,
      recommendedCable: '',
    };
    onUpdateDb({
      ...currentDb,
      circuits: [...currentDb.circuits, newCircuit],
    });
  };

  // Handle circuit change (supports circuitId or index)
  const handleCircuitChange = (target: string | number, patch: Partial<Circuit>) => {
    const targetIndex =
      typeof target === 'number'
        ? target
        : currentDb.circuits.findIndex((c) => c.id === target);
    if (targetIndex === -1) return;
    const updated = [...currentDb.circuits];
    const old = updated[targetIndex];
    const revised = { ...old, ...patch };

    // If custom category changed without preset, update defaults for DF and PF
    if (patch.category && patch.category !== old.category && !patch.presetId && !old.presetId) {
      const def = CATEGORY_DEFAULTS[patch.category];
      if (def) {
        revised.powerFactor = def.defaultPowerFactor;
        revised.diversityFactor = def.defaultDiversity;
      }
    }

    updated[targetIndex] = revised;
    onUpdateDb({
      ...currentDb,
      circuits: updated,
    });
  };

  // Handle delete circuit (supports circuitId or index)
  const handleDeleteCircuit = (target: string | number) => {
    const updated =
      typeof target === 'number'
        ? currentDb.circuits.filter((_, i) => i !== target)
        : currentDb.circuits.filter((c) => c.id !== target);
    onUpdateDb({
      ...currentDb,
      circuits: updated,
    });
  };

  // Handle duplicate circuit
  const handleDuplicateCircuit = (circuit: Circuit) => {
    const dup: Circuit = {
      ...circuit,
      id: `c-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: getDuplicateCircuitName(circuit.name),
    };
    onUpdateDb({
      ...currentDb,
      circuits: [...currentDb.circuits, dup],
    });
  };

  // Handle toggling between 3-phase and 1-phase DB incomer
  const handleToggleThreePhase = (is3P: boolean) => {
    let updatedCircuits = currentDb.circuits;
    const assignedPhase = currentDb.phase || 'R';
    if (!is3P) {
      // If switching to 1-phase DB, convert any 3P circuits to the assigned 1P phase
      updatedCircuits = updatedCircuits.map((c) =>
        c.phase === '3P' ? { ...c, phase: assignedPhase as PhaseType } : { ...c, phase: assignedPhase as PhaseType }
      );
    }
    onUpdateDb({
      ...currentDb,
      isThreePhase: is3P,
      phase: is3P ? undefined : assignedPhase,
      circuits: updatedCircuits,
    });
  };

  // Handle selecting supply phase for 1-phase DB
  const handleSelect1Phase = (newPhase: 'R' | 'Y' | 'B') => {
    const updatedCircuits = currentDb.circuits.map((c) => ({
      ...c,
      phase: newPhase as PhaseType,
    }));
    onUpdateDb({
      ...currentDb,
      phase: newPhase,
      circuits: updatedCircuits,
    });
  };

  // Run Phase Auto-Balancer with rotational priority sequence:
  // Click 1: Y (Highest) > B (2nd Highest) > R (Lowest)
  // Click 2: B (Highest) > R (2nd Highest) > Y (Lowest)
  // Click 3: R (Highest) > Y (2nd Highest) > B (Lowest)
  // Click 4: Resets back to Click 1
  const handleAutoBalance = () => {
    if (!currentDb.isThreePhase) return;
    const nextCount = autoBalanceCount + 1;
    setAutoBalanceCount(nextCount);

    const cycle = ((nextCount - 1) % 3) + 1;
    let priority: ('R' | 'Y' | 'B')[];
    let priorityLabel: string;
    if (cycle === 1) {
      priority = ['Y', 'B', 'R'];
      priorityLabel = 'Y (Highest) → B (2nd) → R (Lowest)';
    } else if (cycle === 2) {
      priority = ['B', 'R', 'Y'];
      priorityLabel = 'B (Highest) → R (2nd) → Y (Lowest)';
    } else {
      priority = ['R', 'Y', 'B'];
      priorityLabel = 'R (Highest) → Y (2nd) → B (Lowest)';
    }

    const balanced = autoBalanceDBPhases(currentDb, voltageSystem, priority);
    onUpdateDb(balanced);
    setBalanceMessage(`Auto-Balanced (Step ${cycle}/3: ${priorityLabel})`);
    setTimeout(() => setBalanceMessage(null), 5000);
  };

  // Phase max for bar calculation & sizing reference
  const pR = currentDb.phaseBalance?.phaseR?.currentAmps || 0;
  const pY = currentDb.phaseBalance?.phaseY?.currentAmps || 0;
  const pB = currentDb.phaseBalance?.phaseB?.currentAmps || 0;
  const maxPhaseAmps = Math.max(1, pR, pY, pB);
  const maxPhaseLabel = pR >= pY && pR >= pB ? 'R' : pY >= pB ? 'Y' : 'B';

  // Dynamic Color Logic:
  // 1. For 1-Phase (230V): Adapts to active phase selection string (R, Y, or B)
  const active1PPhase: 'R' | 'Y' | 'B' = (currentDb.phase as 'R' | 'Y' | 'B') || 'R';
  const singlePhaseIncomerBarColor =
    active1PPhase === 'R'
      ? 'bg-red-500'
      : active1PPhase === 'Y'
      ? 'bg-yellow-500'
      : 'bg-blue-500';

  // 2. For 3-Phase (400V): Dynamically changes color to match highest current phase Max(I_R, I_Y, I_B)
  const maxPhaseCurrent = Math.max(pR, pY, pB);
  let highestAmperagePhase: 'R' | 'Y' | 'B' = 'R';
  let threePhaseIncomerBarColor = 'bg-red-500';

  if (pR === maxPhaseCurrent) {
    highestAmperagePhase = 'R';
    threePhaseIncomerBarColor = 'bg-red-500';
  } else if (pY === maxPhaseCurrent) {
    highestAmperagePhase = 'Y';
    threePhaseIncomerBarColor = 'bg-yellow-500';
  } else {
    highestAmperagePhase = 'B';
    threePhaseIncomerBarColor = 'bg-blue-500';
  }

  return (
    <div className="space-y-1 sm:space-y-1.5">
      {/* Board Selector Bar - Wrapped & Touch Friendly */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 py-0.5 pr-24 sm:pr-28 min-w-0">
          {sortedDbs.map((db) => {
            const isSelected = db.id === currentDb.id;
            return (
              <button
                key={db.id}
                type="button"
                onClick={() => onSelectDbId(db.id)}
                className={`px-2 sm:px-2.5 py-1 rounded-md font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
                }`}
                title={`Select ${db.code}`}
              >
                <span>{db.code}</span>
                {db.voltageDropStatus === 'EXCEEDED' && (
                  <span
                    className="p-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center"
                    title={`Voltage drop exceeds allowable limit: ${(db.voltageDropPercent ?? 0).toFixed(2)}% > ${(db.allowableVoltageDropPercent ?? 4).toFixed(2)}%`}
                  >
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Action buttons locked to top-right corner: Add DB (+), Duplicate DB (copy), Delete DB (trash) */}
        <div className="absolute top-0.5 right-0 flex items-center gap-1 z-10 bg-slate-50/80 backdrop-blur-xs pl-1 rounded">
          <button
            type="button"
            onClick={onAddDb}
            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
            title="Add DB"
            aria-label="Add DB"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {onDuplicateDb && (
            <button
              type="button"
              onClick={() => onDuplicateDb(currentDb)}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Duplicate DB (${currentDb.code})`}
              aria-label={`Duplicate DB ${currentDb.code}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {dbs.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteDb(currentDb.id)}
              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Delete DB (${currentDb.code})`}
              aria-label={`Delete DB ${currentDb.code}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* DB Content Sections */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* DB Overview Header Card - Bright Theme */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 items-start">
          {/* Metadata & Board Settings */}
          <div className="lg:col-span-4 space-y-2 sm:space-y-2.5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={currentDb.code}
                  onChange={(e) => onUpdateDb({ ...currentDb, code: e.target.value })}
                  className="font-mono font-bold text-base sm:text-lg text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-amber-500 focus:outline-none w-32"
                  title="Board Tag / Code"
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleThreePhase(!currentDb.isThreePhase)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleToggleThreePhase(!currentDb.isThreePhase);
                    }
                  }}
                  className={`ml-auto px-2 py-0.5 rounded text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer select-none transition-all hover:scale-[1.02] active:scale-95 shadow-2xs ${
                    currentDb.isThreePhase
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
                      : (currentDb.phase || 'R') === 'R'
                      ? 'bg-red-50 text-red-900 border-red-300 hover:bg-red-100 hover:border-red-400'
                      : currentDb.phase === 'Y'
                      ? 'bg-yellow-50 text-yellow-900 border-yellow-300 hover:bg-yellow-100 hover:border-yellow-400'
                      : 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100 hover:border-blue-400'
                  }`}
                  title="Click to toggle between 3-Phase and 1-Phase supply"
                >
                  <span>
                    {currentDb.isThreePhase
                      ? '3-Phase (4-Wire)'
                      : '1-Phase (2-Wire)'}
                  </span>
                  <ArrowLeftRight className="w-3 h-3 opacity-60 hover:opacity-100 transition-opacity" />
                </span>
                {!currentDb.isThreePhase && (
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentDb.phase || 'R';
                      const next = cur === 'R' ? 'Y' : cur === 'Y' ? 'B' : 'R';
                      handleSelect1Phase(next);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border cursor-pointer select-none transition-all hover:scale-105 active:scale-95 shadow-2xs inline-flex items-center justify-center min-w-[24px] ${
                      (currentDb.phase || 'R') === 'R'
                        ? 'bg-red-600 hover:bg-red-500 text-white border-red-700'
                        : currentDb.phase === 'Y'
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-500 font-extrabold'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700'
                    }`}
                    title={`Current supply phase: ${currentDb.phase || 'R'}. Click to toggle phase (R -> Y -> B)`}
                    aria-label={`Toggle supply phase (currently ${currentDb.phase || 'R'})`}
                  >
                    <span>{currentDb.phase || 'R'}</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={currentDb.name ?? ''}
                onChange={(e) => onUpdateDb({ ...currentDb, name: e.target.value })}
                className="text-xs sm:text-sm text-slate-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none w-full mt-0.5"
                placeholder="Board description or room"
                aria-label="Board description"
                title="Board description"
              />
            </div>

            {/* Diversity Factor & Safety Margin Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Board Diversity (DF):</label>
                <div className="flex items-center gap-1.5">
                  <NumericInput
                    step={0.05}
                    min={0.1}
                    max={1.0}
                    fallbackValue={1.0}
                    value={currentDb.boardDiversityFactor ?? 1}
                    onChange={(val) =>
                      onUpdateDb({
                        ...currentDb,
                        boardDiversityFactor: val,
                      })
                    }
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Board Diversity Factor"
                  />
                  <span className="text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    ({((currentDb.boardDiversityFactor ?? 1) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Utilization (%):</label>
                <div className="flex items-center gap-1.5">
                  <NumericInput
                    step={5}
                    min={10}
                    max={100}
                    fallbackValue={80}
                    allowDecimals={false}
                    value={
                      currentDb.utilizationPercent ??
                      (currentDb.safetyMarginPercent && currentDb.safetyMarginPercent >= 40
                        ? currentDb.safetyMarginPercent
                        : (currentDb.safetyMarginPercent ? 100 - currentDb.safetyMarginPercent : 80))
                    }
                    onChange={(val) => {
                      onUpdateDb({
                        ...currentDb,
                        utilizationPercent: val,
                        safetyMarginPercent: val,
                      });
                    }}
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="DB Utilization Percent"
                  />
                  <span
                    className="text-slate-500 font-mono text-[11px] whitespace-nowrap"
                    title="Protective breaker sizing: Required Breaker Capacity ≥ Ib / Utilization"
                  >
                    ({currentDb.utilizationPercent ??
                      (currentDb.safetyMarginPercent && currentDb.safetyMarginPercent >= 40
                        ? currentDb.safetyMarginPercent
                        : (currentDb.safetyMarginPercent ? 100 - currentDb.safetyMarginPercent : 80))}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Upstream Supply Source: Fed From */}
            <div className="text-xs pt-0.5">
              <label className="text-slate-500 block mb-0.5 text-[11px] font-medium">Fed From:</label>
              <div className="flex items-center gap-1.5">
                <select
                  value={currentDb.subDbId}
                  onChange={(e) => onUpdateDb({ ...currentDb, subDbId: e.target.value })}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 font-medium"
                >
                  <optgroup label="Direct Main Switchboards (MSB)">
                    {(msbs.length > 0 ? msbs : msb ? [msb] : []).map((m, mIdx) => (
                      <option key={`db-fed-msb-${m.id || m.code}-${mIdx}`} value={m.id}>
                        Direct from {m.code}{m.name ? ` (${m.name})` : ''}
                      </option>
                    ))}
                    {msbs.length === 0 && !msb && (
                      <option value="MSB">Direct from Main Switchboard (MSB)</option>
                    )}
                  </optgroup>
                  <optgroup label="Sub-Distribution Boards (Sub-DB)">
                    {subDbs.map((sb) => (
                      <option key={sb.id} value={sb.id}>
                        {sb.code}{sb.name ? ` - ${sb.name}` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>

                <button
                  type="button"
                  onClick={handleGoToFedFromBoard}
                  className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  title={upstreamTargetLabel}
                  aria-label={upstreamTargetLabel}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Sizing & Incomer Recommendation */}
          <div className="lg:col-span-4 bg-slate-50/60 rounded-lg p-3 sm:p-3.5 border border-slate-200/80 space-y-2">
            <div className="text-xs pb-1 border-b border-slate-200">
              <span className="font-semibold text-slate-800">
                Calculated Incomer
              </span>
            </div>

            {/* Breaker & Cable Recommendations without subtitles */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-900 font-mono truncate" title={currentDb.incomerBreaker?.description}>
                    {currentDb.incomerBreaker?.description || 'Pending calculation'}
                  </span>
                  {currentDb.manualIncomerBreakerRating !== undefined && (
                    <button
                      type="button"
                      onClick={() => onUpdateDb({ ...currentDb, manualIncomerBreakerRating: undefined })}
                      className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded shrink-0 cursor-pointer transition-colors"
                      title="Breaker rating has been manually adjusted. Click to reset to auto-calculated sizing."
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Manual Breaker Size Adjustment Controls (-) and (+) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentDb.incomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'DOWN', currentDb.isThreePhase, cableSchedule);
                      if (next) onUpdateDb({ ...currentDb, manualIncomerBreakerRating: next.breakerRating });
                    }}
                    disabled={!getStepBreakerSize(currentDb.incomerBreaker?.rating || 0, 'DOWN', currentDb.isThreePhase, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down breaker size to smaller rating in Breaker Schedule"
                    aria-label="Step down breaker size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentDb.incomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'UP', currentDb.isThreePhase, cableSchedule);
                      if (next) onUpdateDb({ ...currentDb, manualIncomerBreakerRating: next.breakerRating });
                    }}
                    disabled={!getStepBreakerSize(currentDb.incomerBreaker?.rating || 0, 'UP', currentDb.isThreePhase, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-amber-900 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step up breaker size to next rating in Breaker Schedule"
                    aria-label="Step up breaker size"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Cable className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-slate-900 font-mono truncate" title={currentDb.incomerCable}>
                    {currentDb.incomerCable || 'Pending calculation'}
                  </span>
                  {currentDb.manualIncomerCable && (
                    <button
                      type="button"
                      onClick={() => onUpdateDb({ ...currentDb, manualIncomerCable: undefined })}
                      className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded shrink-0 cursor-pointer transition-colors"
                      title="Cable size has been manually adjusted. Click to reset to auto-calculated size."
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Manual Cable Size Adjustment Controls (-) and (+) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = getStepCableSize(currentDb.incomerCable, 'DOWN', currentDb.isThreePhase);
                      if (next) onUpdateDb({ ...currentDb, manualIncomerCable: next });
                    }}
                    disabled={!getStepCableSize(currentDb.incomerCable, 'DOWN', currentDb.isThreePhase)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down cable size to smaller standard rating"
                    aria-label="Step down cable size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = getStepCableSize(currentDb.incomerCable, 'UP', currentDb.isThreePhase);
                      if (next) onUpdateDb({ ...currentDb, manualIncomerCable: next });
                    }}
                    disabled={!getStepCableSize(currentDb.incomerCable, 'UP', currentDb.isThreePhase)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-amber-900 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step up cable size to next standard rating (mitigate voltage drop)"
                    aria-label="Step up cable size"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Voltage Drop Information & Cable Route Length Input (BS 7671 / IEC 60364) */}
              {(() => {
                const isDbBreakerBasis = (currentDb.voltageDropBasis || 'BREAKER') === 'BREAKER';
                const dbBreakerAmps = currentDb.incomerBreaker?.rating || currentDb.incomerCurrentAmps;
                const dbActiveCurrent = isDbBreakerBasis ? dbBreakerAmps : currentDb.incomerCurrentAmps;

                // Upstream Hierarchy Validation
                const parentSubDb = !isDirectMsb
                  ? subDbs.find(
                      (s) =>
                        s.id === currentDb.subDbId ||
                        s.code?.toLowerCase() === currentDb.subDbId?.toLowerCase()
                    )
                  : undefined;

                const validation = getDbVoltageDropValidation(currentDb, parentSubDb);
                const { isFedFromSubDb, parentVdPercent, allowableLimit, dbVdPercent, cumulativeVdPercent, status } = validation;

                const handleToggleBasis = () => {
                  const nextBasis = isDbBreakerBasis ? 'DESIGN' : 'BREAKER';
                  onUpdateDb({
                    ...currentDb,
                    voltageDropBasis: nextBasis,
                  });
                };

                return (
                  <div className="pt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-[11px] font-semibold text-slate-600">
                          Voltage Drop (ΔV):
                        </span>
                        <span
                          className="text-[9px] font-mono px-1 py-0.2 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200"
                          title={`Calculation basis: ${isDbBreakerBasis ? 'Breaker Rating (I)' : 'Base Design Current (Ib)'}`}
                        >
                          via {isDbBreakerBasis ? 'I' : 'Ib'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-right">
                        <span
                          className={`font-bold ${
                            status === 'EXCEEDED'
                              ? 'text-rose-600'
                              : status === 'ACCEPTABLE'
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {dbVdPercent.toFixed(2)}% drop
                        </span>
                        <span className="text-slate-500 font-medium text-[11px]">
                          ({(currentDb.voltageDropV ?? 0).toFixed(2)} V)
                        </span>
                      </div>
                    </div>

                    {/* Cable Length Parameter Input & Compliance Status Badge */}
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <label className="text-slate-500 text-[11px] whitespace-nowrap">
                          Cable Length:
                        </label>
                        <div className="inline-flex items-center">
                          <NumericInput
                            min={1}
                            max={2000}
                            step={1}
                            allowDecimals={false}
                            fallbackValue={25}
                            value={currentDb.cableLengthMeters ?? 25}
                            onChange={(val) => {
                              onUpdateDb({
                                ...currentDb,
                                cableLengthMeters: val,
                              });
                            }}
                            className="w-14 font-mono bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none text-center font-bold transition-colors"
                            title="Route length of incomer cable from upstream board to this DB (meters)"
                            aria-label="Cable length in meters"
                          />
                          <span className="ml-1 text-slate-500 font-mono text-[11px]">m</span>
                        </div>
                      </div>

                      {/* Status Indicator Accounting for Upstream Hierarchy */}
                      <div>
                        {status === 'OPTIMAL' ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"
                            title={
                              isFedFromSubDb && parentSubDb
                                ? `Within allowable limit of ≤ ${allowableLimit.toFixed(2)}% (4.00% max MSB minus ${parentVdPercent.toFixed(2)}% from parent ${parentSubDb.code}). Total cumulative drop from MSB: ${cumulativeVdPercent.toFixed(2)}% (≤ 2.5% optimal).`
                                : `Fed directly from MSB. Within recommended 2.5% feeder drop limit (IEC 60364-5-52 / BS 7671).`
                            }
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>≤ {isFedFromSubDb ? `${allowableLimit.toFixed(2)}%` : '4%'} OK</span>
                          </span>
                        ) : status === 'ACCEPTABLE' ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 inline-flex items-center gap-1"
                            title={
                              isFedFromSubDb && parentSubDb
                                ? `Passes allowable limit of ≤ ${allowableLimit.toFixed(2)}% (4.00% max MSB minus ${parentVdPercent.toFixed(2)}% from parent ${parentSubDb.code}). Total cumulative drop from MSB: ${cumulativeVdPercent.toFixed(2)}% (≤ 4.0% acceptable).`
                                : `Fed directly from MSB. Acceptable within 4.0% sub-main limit (BS 7671).`
                            }
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>≤ {isFedFromSubDb ? `${allowableLimit.toFixed(2)}%` : '4%'} Pass</span>
                          </span>
                        ) : (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300 inline-flex items-center gap-1"
                            title={
                              isFedFromSubDb && parentSubDb
                                ? `Voltage drop exceeds dynamic allowable limit of ${allowableLimit.toFixed(2)}% (4.00% max MSB minus ${parentVdPercent.toFixed(2)}% from parent ${parentSubDb.code})! Total cumulative drop to DB: ${cumulativeVdPercent.toFixed(2)}% exceeds 4.00%. Upsize cable using (+) button or shorten run.`
                                : `Fed directly from MSB. Voltage drop exceeds 4.0% limit! Upsize cable using (+) button or shorten run.`
                            }
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>&gt; {isFedFromSubDb ? `${allowableLimit.toFixed(2)}%` : '4%'} High</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Calculation Detail Line with Clickable Current Basis */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                      <span title="Specific voltage drop factor per BS 7671 Table 4D4B / 4E4B" className="text-slate-500">
                        Factor: {(currentDb.voltageDropMvPerAmpMeter ?? 0).toFixed(2)} mV/A/m
                      </span>

                      <span
                        onClick={handleToggleBasis}
                        className="cursor-pointer hover:underline hover:text-amber-900 text-slate-600 transition-colors select-none"
                        title={`Click to switch calculation basis between Breaker Rating (I: ${dbBreakerAmps}A) and Design Current (Ib: ${currentDb.incomerCurrentAmps.toFixed(1)}A)`}
                      >
                        <strong className="text-slate-800 font-bold">{isDbBreakerBasis ? 'I' : 'Ib'}</strong>: {dbActiveCurrent.toFixed(1)}A · L: {currentDb.cableLengthMeters ?? 25}m
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Phase Balance & Incomer Loading Gauge */}
          {currentDb.isThreePhase ? (
            <div className="md:col-span-2 lg:col-span-4 bg-slate-50 rounded-lg p-2.5 sm:p-3 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-slate-800">Phase Balance (R-Y-B)</span>
                </div>
                <button
                  onClick={handleAutoBalance}
                  className="text-[11px] text-amber-900 hover:text-slate-950 bg-amber-400 hover:bg-amber-300 px-2 py-0.5 rounded font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  Auto-Balance
                </button>
              </div>

              {/* Live Bar Graphs for R, Y, B */}
              <div className="space-y-0.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-red-600 font-bold text-center">R</span>
                  <div className="flex-1 bg-slate-200 rounded-sm h-2 overflow-hidden">
                    <div
                      className="bg-red-500 h-full transition-all duration-300"
                      style={{ width: `${(pR / maxPhaseAmps) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-slate-800 text-[11px] tabular-nums font-medium">
                    {pR.toFixed(1)} A
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-4 text-yellow-600 font-bold text-center">Y</span>
                  <div className="flex-1 bg-slate-200 rounded-sm h-2 overflow-hidden">
                    <div
                      className="bg-yellow-500 h-full transition-all duration-300"
                      style={{ width: `${(pY / maxPhaseAmps) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-slate-800 text-[11px] tabular-nums font-medium">
                    {pY.toFixed(1)} A
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-4 text-blue-600 font-bold text-center">B</span>
                  <div className="flex-1 bg-slate-200 rounded-sm h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-300"
                      style={{ width: `${(pB / maxPhaseAmps) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-slate-800 text-[11px] tabular-nums font-medium">
                    {pB.toFixed(1)} A
                  </span>
                </div>
              </div>

              {/* Incomer Load & Metrics Section at lowest position of Phase Balance card */}
              <div className="pt-1.5 border-t border-slate-200 space-y-1">
                <div className="space-y-0.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Connected Load:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.connectedLoadKW.toFixed(2)} kW</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500 font-medium text-[11px]">{currentDb.connectedLoadKVA.toFixed(2)} kVA</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Maximum Demand:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.maximumDemandKW.toFixed(2)} kW</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500 font-medium text-[11px]">{currentDb.maximumDemandKVA.toFixed(2)} kVA</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 gap-2">
                    <span className="shrink-0">Design Current:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.incomerCurrentAmps.toFixed(1)} A</span>
                      <span className="text-slate-500 text-[11px] ml-1 font-normal">
                        Max ({maxPhaseLabel})
                      </span>
                      {currentDb.incomerBreaker?.rating ? (
                        <>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-slate-700 font-medium text-[11px]">
                            {((currentDb.incomerCurrentAmps / currentDb.incomerBreaker.rating) * 100).toFixed(0)}% of In ({currentDb.incomerBreaker.rating}A)
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Single Phase (1-Phase 2-Wire) Incomer Loading Status */
            <div className="md:col-span-2 lg:col-span-4 bg-slate-50 rounded-lg p-2.5 sm:p-3 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-800">1-Phase Incoming Loading</span>
                </div>
              </div>

              <div className="space-y-0.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Assigned Sub-DB Phase:</span>
                  <span
                    className={`font-bold font-mono px-1.5 py-0.5 rounded text-xs ${
                      (currentDb.phase || 'R') === 'R'
                        ? 'bg-red-100 text-red-800'
                        : currentDb.phase === 'Y'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    Phase {currentDb.phase || 'R'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Supply Voltage:</span>
                  <span className="font-bold text-slate-800">{voltageSystem.Vln} V (L-N)</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Phase Line Current (IL):</span>
                  <span className="font-bold text-slate-900">{currentDb.incomerCurrentAmps.toFixed(1)} A</span>
                </div>
              </div>

              {/* Relocated Incomer Load & Metrics Section at lowest position of 1-Phase Incoming Loading card */}
              <div className="pt-1.5 border-t border-slate-200 space-y-1">
                <div className="space-y-0.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Connected Load:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.connectedLoadKW.toFixed(2)} kW</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500 font-medium text-[11px]">{currentDb.connectedLoadKVA.toFixed(2)} kVA</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Maximum Demand:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.maximumDemandKW.toFixed(2)} kW</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-500 font-medium text-[11px]">{currentDb.maximumDemandKVA.toFixed(2)} kVA</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 gap-2">
                    <span className="shrink-0">Design Current:</span>
                    <div className="font-mono text-xs tabular-nums text-right">
                      <span className="font-bold text-slate-900">{currentDb.incomerCurrentAmps.toFixed(1)} A</span>
                      <span className="text-slate-500 text-[11px] ml-1 font-normal">
                        1P ({voltageSystem.Vln}V)
                      </span>
                      {currentDb.incomerBreaker?.rating ? (
                        <>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-slate-700 font-medium text-[11px]">
                            {((currentDb.incomerCurrentAmps / currentDb.incomerBreaker.rating) * 100).toFixed(0)}% of In ({currentDb.incomerBreaker.rating}A)
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {balanceMessage && (
          <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
            {balanceMessage}
          </div>
        )}
      </div>



      {/* Circuit Schedule Table & Responsive Cards */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Circuit Schedule
            </h3>
            {circuitSortDirection !== 'none' && (
              <button
                type="button"
                onClick={() => setCircuitSortDirection('none')}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                title="Click to reset to default order"
              >
                <span>Sorted: {circuitSortDirection === 'asc' ? 'A–Z' : 'Z–A'}</span>
                <span className="font-bold text-amber-600">✕</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Preset Groups Configuration Button (on left side of Table | Cards switcher) */}
            <button
              type="button"
              onClick={() => setIsPresetModalOpen(true)}
              className="px-2.5 h-[30px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Configure and manage circuit preset groups (Type A, Type B, etc.)"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-600" />
              <span>Preset Groups</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold">
                {activePresets.length}
              </span>
            </button>

            {/* View Mode Switcher (Table vs Mobile Cards) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 h-[30px]">
              <button
                onClick={() => setCircuitDisplayMode('table')}
                className={`px-2 h-full rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  circuitDisplayMode === 'table'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Full Data Grid View"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setCircuitDisplayMode('cards')}
                className={`px-2 h-full rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  circuitDisplayMode === 'cards'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Responsive Cards View"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            <button
              onClick={handleAddCircuit}
              className="px-2.5 h-[30px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Add a new branch circuit"
            >
              <Plus className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Circuit</span>
            </button>
          </div>
        </div>

        {/* RESPONSIVE CARD VIEW (Optimized for Mobile/Tablet) */}
        {circuitDisplayMode === 'cards' && (
          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedCircuits.map((circuit, index) => {
              const isPresetLocked = Boolean(circuit.presetId);
              const currentPreset = circuit.presetId
                ? activePresets.find((p) => p.id === circuit.presetId)
                : null;
              const lockTooltip = isPresetLocked
                ? `Locked by preset "${currentPreset?.name || 'Preset'}". Modify values in Preset Groups modal.`
                : undefined;

              const phaseBadgeColors = !currentDb.isThreePhase
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : {
                    R: 'bg-red-50 text-red-700 border-red-200',
                    Y: 'bg-yellow-50 text-yellow-800 border-yellow-200',
                    B: 'bg-blue-50 text-blue-700 border-blue-200',
                    '3P': 'bg-slate-100 text-slate-900 border-slate-300 font-bold',
                  }[circuit.phase] || 'bg-slate-100 text-slate-800 border-slate-300';

              return (
                <div
                  key={circuit.id}
                  className="border rounded-lg p-3 space-y-2.5 text-xs font-mono bg-slate-50/70 border-slate-200 transition-all duration-150 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 text-center font-bold text-[11px] flex items-center justify-center">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={circuit.name}
                        onChange={(e) => handleCircuitChange(circuit.id, { name: e.target.value })}
                        className="font-sans font-semibold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs w-48 sm:w-60 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Circuit Description"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDuplicateCircuit(circuit)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded cursor-pointer"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCircuit(circuit.id)}
                        className="p-1.5 text-rose-600 hover:text-rose-800 bg-white border border-slate-200 rounded cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-500 block">Group / Category:</span>
                        {isPresetLocked && (
                          <span
                            className="text-[9px] font-sans font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded inline-flex items-center gap-0.5"
                            title={lockTooltip}
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Preset</span>
                          </span>
                        )}
                      </div>
                      <select
                        value={
                          circuit.presetId
                            ? `preset:${circuit.presetId}`
                            : `custom:${circuit.category}`
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.startsWith('preset:')) {
                            const pid = val.replace('preset:', '');
                            const preset = activePresets.find((p) => p.id === pid);
                            if (preset) {
                              handleCircuitChange(circuit.id, {
                                presetId: preset.id,
                                category: preset.category || 'CUSTOM',
                                quantity: preset.quantity,
                                unitWatts: preset.unitWatts,
                                powerFactor: preset.powerFactor,
                                diversityFactor: preset.diversityFactor,
                              });
                            }
                          } else {
                            const cat = val.replace('custom:', '') as CircuitCategory;
                            const def = CATEGORY_DEFAULTS[cat];
                            handleCircuitChange(circuit.id, {
                              presetId: undefined,
                              category: cat,
                              powerFactor: def ? def.defaultPowerFactor : circuit.powerFactor,
                              diversityFactor: def ? def.defaultDiversity : circuit.diversityFactor,
                            });
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 font-sans cursor-pointer font-medium"
                      >
                        <optgroup label="-Custom-">
                          <option value="custom:LIGHTING">Lighting Circuits</option>
                          <option value="custom:RECEPTACLE">Small Power / Receptacles</option>
                          <option value="custom:HVAC">HVAC & Mechanical</option>
                          <option value="custom:POWER_APPLIANCE">Appliances & Cooking</option>
                          <option value="custom:MOTOR_PUMP">Motors & Pumps</option>
                          <option value="custom:IT_CRITICAL">IT & Critical Racks</option>
                          <option value="custom:SPARE">Spare / Provision</option>
                          <option value="custom:CUSTOM">Custom Load</option>
                        </optgroup>
                        <optgroup label="-Preset-">
                          {activePresets.map((p) => (
                            <option key={p.id} value={`preset:${p.id}`}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-0.5">Phase:</span>
                      <select
                        value={circuit.phase}
                        onChange={(e) =>
                          handleCircuitChange(circuit.id, { phase: e.target.value as PhaseType })
                        }
                        className={`w-full text-xs font-bold rounded px-2 py-1 border ${phaseBadgeColors} cursor-pointer`}
                      >
                        {currentDb.isThreePhase ? (
                          <>
                            <option value="R">Phase R</option>
                            <option value="Y">Phase Y</option>
                            <option value="B">Phase B</option>
                            <option value="3P">3-Phase</option>
                          </>
                        ) : (
                          <option value="R">1-Phase (L-N)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Inputs sequence: Qty -> Unit(W) -> PF -> DF */}
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-500 block">Qty:</span>
                      </div>
                      <NumericInput
                        min={0}
                        step={1}
                        allowDecimals={false}
                        fallbackValue={1}
                        value={circuit.quantity}
                        onChange={(val) => {
                          handleCircuitChange(circuit.id, { quantity: val });
                        }}
                        className="w-full rounded px-1.5 py-1 text-xs bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        aria-label={`Quantity for ${circuit.name}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-500 block">Load (W):</span>
                        {isPresetLocked && (
                          <span title={lockTooltip} className="inline-flex items-center">
                            <Lock className="w-2.5 h-2.5 text-amber-600" />
                          </span>
                        )}
                      </div>
                      <NumericInput
                        step={10}
                        min={0}
                        allowDecimals={true}
                        disabled={isPresetLocked}
                        title={lockTooltip}
                        fallbackValue={1000}
                        value={circuit.unitWatts}
                        onChange={(val) =>
                          handleCircuitChange(circuit.id, { unitWatts: val })
                        }
                        className={`w-full rounded px-1.5 py-1 text-xs ${
                          isPresetLocked
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed select-none border border-slate-200'
                            : 'bg-white border border-slate-300'
                        }`}
                        aria-label={`Unit Load (W) for ${circuit.name}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-500 block">PF:</span>
                        {isPresetLocked && (
                          <span title={lockTooltip} className="inline-flex items-center">
                            <Lock className="w-2.5 h-2.5 text-amber-600" />
                          </span>
                        )}
                      </div>
                      <DecimalInput
                        min={0}
                        max={1.0}
                        step={0.01}
                        disabled={isPresetLocked}
                        title={lockTooltip}
                        value={circuit.powerFactor}
                        onChange={(val) =>
                          handleCircuitChange(circuit.id, { powerFactor: val })
                        }
                        className={`w-full rounded px-1.5 py-1 text-xs ${
                          isPresetLocked
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed select-none border border-slate-200'
                            : 'bg-white border border-slate-300'
                        }`}
                        aria-label={`Power Factor for ${circuit.name}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-500 block">DF:</span>
                        {isPresetLocked && (
                          <span title={lockTooltip} className="inline-flex items-center">
                            <Lock className="w-2.5 h-2.5 text-amber-600" />
                          </span>
                        )}
                      </div>
                      <DecimalInput
                        min={0}
                        max={1.0}
                        step={0.05}
                        disabled={isPresetLocked}
                        title={lockTooltip}
                        value={circuit.diversityFactor}
                        onChange={(val) =>
                          handleCircuitChange(circuit.id, { diversityFactor: val })
                        }
                        className={`w-full rounded px-1.5 py-1 text-xs font-bold ${
                          isPresetLocked
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed select-none border border-slate-200'
                            : 'bg-white border border-slate-300'
                        }`}
                        aria-label={`Diversity Factor for ${circuit.name}`}
                      />
                    </div>
                  </div>

                  {/* Calculated outputs arranged immediately after DF: CL(kW) -> MD(kW) -> I(A) */}
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">CL (kW):</span>
                      <span className="font-semibold text-slate-800">
                        {circuit.connectedLoadKW.toFixed(2)} kW
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">MD (kW):</span>
                      <span className="font-bold text-amber-700">
                        {circuit.maximumDemandKW.toFixed(2)} kW
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">I (A):</span>
                      <span className="font-bold text-slate-900">
                        {circuit.currentIb.toFixed(1)} A
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FULL DATA GRID TABLE VIEW */}
        {circuitDisplayMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-1.5 px-2 w-8 text-center text-slate-400 select-none" title="Drag handle to reorder rows">
                    <GripVertical className="w-3.5 h-3.5 mx-auto text-slate-400" />
                  </th>
                  <th className="py-1.5 px-2.5 w-10 text-center">#</th>
                  <th
                    onClick={toggleCircuitSort}
                    className="py-1.5 px-2.5 min-w-[180px] cursor-pointer select-none hover:bg-slate-200/60 transition-colors group/col"
                    title={
                      circuitSortDirection === 'asc'
                        ? 'Sorted A–Z (Ascending). Click to sort Z–A.'
                        : circuitSortDirection === 'desc'
                        ? 'Sorted Z–A (Descending). Click to reset to default order.'
                        : 'Click to sort alphabetically by Circuit Description (A–Z)'
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={circuitSortDirection !== 'none' ? 'text-amber-900 font-bold' : ''}>
                        Circuit Description
                      </span>
                      {circuitSortDirection === 'asc' ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold text-xs" aria-label="Sorted A to Z">
                          ▲ <span className="text-[9px] font-sans font-semibold bg-amber-100 text-amber-800 px-1 rounded">A–Z</span>
                        </span>
                      ) : circuitSortDirection === 'desc' ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold text-xs" aria-label="Sorted Z to A">
                          ▼ <span className="text-[9px] font-sans font-semibold bg-amber-100 text-amber-800 px-1 rounded">Z–A</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px] opacity-40 group-hover/col:opacity-100 transition-opacity">
                          ▲▼
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-1.5 px-2.5 min-w-[130px]">Group / Category</th>
                  <th className="py-1.5 px-2.5 w-16 text-center">Phase</th>
                  <th className="py-1.5 px-2.5 w-16 text-right">Qty</th>
                  <th className="py-1.5 px-2.5 w-20 text-right">Load (W)</th>
                  <th className="py-1.5 px-2.5 w-16 text-right">PF</th>
                  <th className="py-1.5 px-2.5 w-16 text-right">DF</th>
                  <th className="py-1.5 px-2.5 w-20 text-right">CL (kW)</th>
                  <th className="py-1.5 px-2.5 w-20 text-right font-semibold text-amber-900">MD (kW)</th>
                  <th className="py-1.5 px-2.5 w-16 text-right">I (A)</th>
                  <th className="py-1.5 px-2.5 w-16 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {sortedCircuits.map((circuit, index) => {
                  const isPresetLocked = Boolean(circuit.presetId);
                  const currentPreset = circuit.presetId
                    ? activePresets.find((p) => p.id === circuit.presetId)
                    : null;
                  const lockTooltip = isPresetLocked
                    ? `Locked by preset "${currentPreset?.name || 'Preset'}". Modify values in Preset Groups modal.`
                    : undefined;

                  const phaseBadgeColors = !currentDb.isThreePhase
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : {
                        R: 'bg-red-50 text-red-700 border-red-200',
                        Y: 'bg-yellow-50 text-yellow-800 border-yellow-200',
                        B: 'bg-blue-50 text-blue-700 border-blue-200',
                        '3P': 'bg-slate-100 text-slate-900 border-slate-300 font-bold',
                      }[circuit.phase] || 'bg-slate-100 text-slate-800 border-slate-300';

                  return (
                    <tr
                      key={circuit.id}
                      draggable={circuitSortDirection === 'none' && canDragCircuitIndex === index}
                      onDragStart={(e) => handleCircuitDragStart(e, index)}
                      onDragOver={(e) => handleCircuitDragOver(e, index)}
                      onDrop={(e) => handleCircuitDrop(e, index)}
                      onDragEnd={handleCircuitDragEnd}
                      className={`transition-all duration-150 group ${
                        draggedCircuitIndex === index
                          ? 'opacity-35 bg-amber-50/70 border-2 border-dashed border-amber-400 scale-[0.99]'
                          : dragOverCircuitIndex === index
                          ? 'bg-amber-100/90 border-y-2 border-amber-500 shadow-sm'
                          : 'hover:bg-amber-50/40'
                      }`}
                    >
                      {/* Drag Handle (Only this handle initiates row reordering) */}
                      <td
                        className="py-1 px-1 text-center text-slate-400 select-none"
                        title={
                          circuitSortDirection !== 'none'
                            ? 'Manual reordering is disabled while sorted. Reset sort to reorder.'
                            : 'Click and drag handle to reorder circuit'
                        }
                      >
                        <span
                          onMouseDown={() => {
                            if (circuitSortDirection === 'none') setCanDragCircuitIndex(index);
                          }}
                          onMouseUp={() => setCanDragCircuitIndex(null)}
                          onTouchStart={() => {
                            if (circuitSortDirection === 'none') setCanDragCircuitIndex(index);
                          }}
                          onTouchEnd={() => setCanDragCircuitIndex(null)}
                          className={`inline-flex p-0.5 rounded transition-colors ${
                            circuitSortDirection !== 'none'
                              ? 'cursor-not-allowed opacity-30 text-slate-300'
                              : 'hover:bg-slate-200/80 hover:text-slate-700 cursor-grab active:cursor-grabbing text-slate-400 group-hover:text-slate-600'
                          }`}
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                      </td>

                      {/* Index */}
                      <td className="py-1 px-2.5 text-center text-slate-500 font-mono font-medium">
                        {index + 1}
                      </td>

                      {/* Circuit Name */}
                      <td className="py-1 px-2.5 font-sans">
                        <input
                          type="text"
                          value={circuit.name}
                          onChange={(e) => handleCircuitChange(circuit.id, { name: e.target.value })}
                          className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* Group / Category */}
                      <td className="py-1 px-2.5 font-sans">
                        <div className="flex items-center gap-1.5">
                          {isPresetLocked ? (
                            <span
                              title={`Preset: ${currentPreset?.name || 'Preset'}`}
                              className="inline-flex items-center"
                            >
                              <Sliders className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            </span>
                          ) : (
                            CATEGORY_ICONS[circuit.category]
                          )}
                          <select
                            value={
                              circuit.presetId
                                ? `preset:${circuit.presetId}`
                                : `custom:${circuit.category}`
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith('preset:')) {
                                const pid = val.replace('preset:', '');
                                const preset = activePresets.find((p) => p.id === pid);
                                if (preset) {
                                  handleCircuitChange(circuit.id, {
                                    presetId: preset.id,
                                    category: preset.category || 'CUSTOM',
                                    quantity: preset.quantity,
                                    unitWatts: preset.unitWatts,
                                    powerFactor: preset.powerFactor,
                                    diversityFactor: preset.diversityFactor,
                                  });
                                }
                              } else {
                                const cat = val.replace('custom:', '') as CircuitCategory;
                                const def = CATEGORY_DEFAULTS[cat];
                                handleCircuitChange(circuit.id, {
                                  presetId: undefined,
                                  category: cat,
                                  powerFactor: def ? def.defaultPowerFactor : circuit.powerFactor,
                                  diversityFactor: def ? def.defaultDiversity : circuit.diversityFactor,
                                });
                              }
                            }}
                            className="bg-transparent text-slate-700 text-xs rounded border-0 hover:bg-slate-100 py-0.5 px-1 focus:ring-1 focus:ring-amber-500 cursor-pointer font-medium"
                          >
                            <optgroup label="-Custom-">
                              <option value="custom:LIGHTING">Lighting Circuits</option>
                              <option value="custom:RECEPTACLE">Small Power / Receptacles</option>
                              <option value="custom:HVAC">HVAC & Mechanical</option>
                              <option value="custom:POWER_APPLIANCE">Appliances & Cooking</option>
                              <option value="custom:MOTOR_PUMP">Motors & Pumps</option>
                              <option value="custom:IT_CRITICAL">IT & Critical Racks</option>
                              <option value="custom:SPARE">Spare / Provision</option>
                              <option value="custom:CUSTOM">Custom Load</option>
                            </optgroup>
                            <optgroup label="-Preset-">
                              {activePresets.map((p) => (
                                <option key={p.id} value={`preset:${p.id}`}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </td>

                      {/* Phase Allocation */}
                      <td className="py-1 px-2.5 text-center">
                        <select
                          value={circuit.phase}
                          onChange={(e) =>
                            handleCircuitChange(circuit.id, { phase: e.target.value as PhaseType })
                          }
                          className={`text-[11px] font-bold rounded px-1.5 py-0.5 border ${phaseBadgeColors} focus:outline-none cursor-pointer`}
                        >
                          {currentDb.isThreePhase ? (
                            <>
                              <option value="R">Phase R</option>
                              <option value="Y">Phase Y</option>
                              <option value="B">Phase B</option>
                              <option value="3P">3-Phase</option>
                            </>
                          ) : (
                            <option value="R">1-Phase (L-N)</option>
                          )}
                        </select>
                      </td>

                      {/* Quantity: 1. Qty */}
                      <td className="py-1 px-2.5 text-right">
                        <NumericInput
                          min={0}
                          step={1}
                          allowDecimals={false}
                          fallbackValue={1}
                          value={circuit.quantity}
                          onChange={(val) => {
                            handleCircuitChange(circuit.id, {
                              quantity: val,
                            });
                          }}
                          className="w-12 text-right rounded px-1 py-0.5 text-xs tabular-nums bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 text-slate-800"
                          aria-label={`Quantity for ${circuit.name}`}
                        />
                      </td>

                      {/* Unit Watts: 2. Unit(W) */}
                      <td className="py-1 px-2.5 text-right">
                        <NumericInput
                          step={10}
                          min={0}
                          allowDecimals={true}
                          disabled={isPresetLocked}
                          title={lockTooltip}
                          fallbackValue={1000}
                          value={circuit.unitWatts}
                          onChange={(val) =>
                            handleCircuitChange(circuit.id, {
                              unitWatts: val,
                            })
                          }
                          className={`w-16 text-right rounded px-1 py-0.5 text-xs tabular-nums ${
                            isPresetLocked
                              ? 'bg-slate-100/90 text-slate-500 cursor-not-allowed select-none border border-slate-200/80'
                              : 'bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500'
                          }`}
                          aria-label={`Unit Load (W) for ${circuit.name}`}
                        />
                      </td>

                      {/* Power Factor: 3. PF */}
                      <td className="py-1 px-2.5 text-right">
                        <DecimalInput
                          min={0}
                          max={1.0}
                          step={0.01}
                          disabled={isPresetLocked}
                          title={lockTooltip}
                          value={circuit.powerFactor}
                          onChange={(val) =>
                            handleCircuitChange(circuit.id, { powerFactor: val })
                          }
                          className={`w-12 text-right rounded px-1 py-0.5 text-xs tabular-nums ${
                            isPresetLocked
                              ? 'bg-slate-100/90 text-slate-500 cursor-not-allowed select-none border border-slate-200/80'
                              : 'bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500'
                          }`}
                          aria-label={`Power Factor for ${circuit.name}`}
                        />
                      </td>

                      {/* Diversity Factor: 4. DF */}
                      <td className="py-1 px-2.5 text-right">
                        <DecimalInput
                          min={0}
                          max={1.0}
                          step={0.05}
                          disabled={isPresetLocked}
                          title={lockTooltip}
                          value={circuit.diversityFactor}
                          onChange={(val) =>
                            handleCircuitChange(circuit.id, { diversityFactor: val })
                          }
                          className={`w-12 text-right rounded px-1 py-0.5 text-xs font-semibold tabular-nums ${
                            isPresetLocked
                              ? 'bg-slate-100/90 text-slate-500 cursor-not-allowed select-none border border-slate-200/80'
                              : 'bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 text-slate-800'
                          }`}
                          aria-label={`Diversity Factor for ${circuit.name}`}
                        />
                      </td>

                      {/* Connected Load kW: 5. CL(kw) after DF */}
                      <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                        {circuit.connectedLoadKW.toFixed(2)}
                      </td>

                      {/* Maximum Demand kW: MD(kW) */}
                      <td className="py-1 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                        {circuit.maximumDemandKW.toFixed(2)}
                      </td>

                      {/* Current Ib: 6. Ib (A) */}
                      <td className="py-1 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                        {circuit.currentIb.toFixed(1)}
                      </td>

                      {/* Actions */}
                      <td className="py-1 px-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDuplicateCircuit(circuit)}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                            title="Duplicate Circuit"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCircuit(circuit.id)}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Delete Circuit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preset Groups Configuration Modal */}
      <PresetGroupsModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        presets={activePresets}
        onUpdatePresets={handleUpdatePresets}
        circuitUsageCounts={circuitUsageCounts}
      />
    </div>
  </div>
  );
};
