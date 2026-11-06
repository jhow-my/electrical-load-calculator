import React, { useState, useMemo } from 'react';
import {
  MainSwitchBoard,
  SubDistributionBoard,
  DistributionBoard,
  MsbDirectLoad,
  VoltageSystem,
  EssentialGensetType,
  CableScheduleEntry,
  GeneratorSizingScope,
} from '../types/electrical';
import {
  ShieldCheck,
  Zap,
  Flame,
  BatteryCharging,
  Trash2,
  Cpu,
  ArrowRight,
  Copy,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Plus,
  GripVertical,
  Calculator,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  GitFork,
} from 'lucide-react';
import {
  calculateMsbPhaseBalance,
  autoConfigureCapacitorSteps,
  getStepTransformerSize,
  getStepBreakerSize,
  calculateBusbarSizing,
  getGeneratorScopeLabel,
} from '../utils/electricalCalculations';
import { CapacitorBankModal } from './CapacitorBankModal';
import { BusbarSizingModal } from './BusbarSizingModal';
import { GeneratorSizingModal } from './GeneratorSizingModal';
import { NumericInput } from './NumericInput';

interface MsbViewProps {
  msb?: MainSwitchBoard;
  msbs: MainSwitchBoard[];
  selectedMsbId: string;
  onSelectMsbId: (id: string) => void;
  onAddMsb: () => void;
  onDeleteMsb: (id: string) => void;
  onDuplicateMsb?: (msb: MainSwitchBoard) => void;
  onUpdateMsb: (updated: MainSwitchBoard) => void;
  subDbs: SubDistributionBoard[];
  dbs?: DistributionBoard[];
  directLoads?: MsbDirectLoad[];
  onUpdateDirectLoads?: (loads: MsbDirectLoad[]) => void;
  onNavigateToSubDb: (subDbId: string) => void;
  onNavigateToDb?: (dbId: string) => void;
  onDuplicateSubDb?: (subDb: SubDistributionBoard) => void;
  onDeleteSubDb?: (subDbId: string) => void;
  onDuplicateDb?: (db: DistributionBoard) => void;
  onDeleteDb?: (dbId: string) => void;
  onUpdateSubDb?: (updated: SubDistributionBoard) => void;
  onUpdateDb?: (updated: DistributionBoard) => void;
  onReorderSubDbs?: (reorderedSubDbs: SubDistributionBoard[]) => void;
  onReorderDbs?: (reorderedDbs: DistributionBoard[]) => void;
  onAutoBalanceMsb?: (priorityOrder?: ('R' | 'Y' | 'B')[], cycleIndex?: number) => void;
  voltageSystem: VoltageSystem;
  cableSchedule?: CableScheduleEntry[];
}

export const MsbView: React.FC<MsbViewProps> = ({
  msbs,
  selectedMsbId,
  onSelectMsbId,
  onAddMsb,
  onDeleteMsb,
  onDuplicateMsb,
  onUpdateMsb,
  subDbs,
  dbs = [],
  directLoads = [],
  onUpdateDirectLoads: _onUpdateDirectLoads,
  onNavigateToSubDb,
  onNavigateToDb,
  onDuplicateSubDb,
  onDeleteSubDb,
  onDuplicateDb,
  onDeleteDb,
  onUpdateSubDb,
  onUpdateDb,
  onReorderSubDbs,
  onReorderDbs,
  onAutoBalanceMsb,
  voltageSystem,
  cableSchedule,
}) => {
  const currentMsb = useMemo(() => {
    return msbs.find((m) => m.id === selectedMsbId) || msbs[0];
  }, [msbs, selectedMsbId]);

  const [balanceMessage, setBalanceMessage] = useState<string | null>(null);
  const [autoBalanceCount, setAutoBalanceCount] = useState<number>(0);

  // Capacitor Bank state and handlers
  const [isCapacitorModalOpen, setIsCapacitorModalOpen] = useState(false);

  // Busbar Sizing Calculator modal state
  const [isBusbarModalOpen, setIsBusbarModalOpen] = useState(false);

  // Generator Sizing Formula & Workings modal state
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);

  // Live Busbar Sizing calculation
  const activeBusbarSizing = useMemo(() => {
    if (currentMsb?.busbarSizing) return currentMsb.busbarSizing;
    if (!currentMsb) return undefined;
    return calculateBusbarSizing({
      material: currentMsb.busbarMaterial,
      currentDensityJ: currentMsb.busbarCurrentDensity,
      designCurrentId: currentMsb.busbarDesignCurrentId,
      breakerRating: currentMsb.mainIncomerBreaker?.rating,
      totalPlantCurrentAmps: currentMsb.totalPlantCurrentAmps,
      shortCircuitCurrentIcwKA: currentMsb.busbarIcwKA,
      faultDurationSec: currentMsb.busbarFaultDuration,
      materialConstantK: currentMsb.busbarMaterialConstantK,
      selectedWidth: currentMsb.busbarSelectedWidth,
      selectedThickness: currentMsb.busbarSelectedThickness,
      selectedRuns: currentMsb.busbarSelectedRuns,
      manualOverride: currentMsb.busbarManualOverride,
    });
  }, [currentMsb]);

  const handleAutoConfigureCapacitor = () => {
    if (!currentMsb) return;
    const stepsCount = currentMsb.capacitorStepsCount ?? 12;
    const requiredQ = currentMsb.capacitorBankSizing?.requiredKVArRated || 0;
    const autoAllocations = autoConfigureCapacitorSteps(requiredQ, stepsCount);
    onUpdateMsb({
      ...currentMsb,
      customCapacitorSteps: autoAllocations,
    });
  };

  const handleUpdateStepQty = (sizeKVAr: number, newQty: number) => {
    if (!currentMsb) return;
    const qty = Math.max(0, Math.min(32, newQty));
    const currentSteps = currentMsb.capacitorBankSizing?.steps || [];
    const updated = currentSteps.map((s) =>
      s.sizeKVAr === sizeKVAr ? { sizeKVAr: s.sizeKVAr, quantity: qty } : { sizeKVAr: s.sizeKVAr, quantity: s.quantity }
    );
    onUpdateMsb({
      ...currentMsb,
      customCapacitorSteps: updated,
    });
  };

  // Column sorting state for Feeder Schedule ("Feeder Code")
  const [feederSortDirection, setFeederSortDirection] = useState<'none' | 'asc' | 'desc'>('none');

  const toggleFeederSort = () => {
    setFeederSortDirection((prev) => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  // Drag and Drop state for Sub-DB feeders reordering (strictly initiated via Drag Handle)
  const [draggedSubDbIndex, setDraggedSubDbIndex] = useState<number | null>(null);
  const [dragOverSubDbIndex, setDragOverSubDbIndex] = useState<number | null>(null);
  const [canDragSubDbIndex, setCanDragSubDbIndex] = useState<number | null>(null);

  // Drag and Drop state for Direct DB feeders reordering (strictly initiated via Drag Handle)
  const [draggedDirectDbIndex, setDraggedDirectDbIndex] = useState<number | null>(null);
  const [dragOverDirectDbIndex, setDragOverDirectDbIndex] = useState<number | null>(null);
  const [canDragDirectDbIndex, setCanDragDirectDbIndex] = useState<number | null>(null);

  const handleSubDbDragStart = (e: React.DragEvent, index: number) => {
    if (feederSortDirection !== 'none') {
      e.preventDefault();
      return;
    }
    if (canDragSubDbIndex !== index) {
      e.preventDefault();
      return;
    }
    const targetTag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'OPTION', 'TEXTAREA'].includes(targetTag)) {
      e.preventDefault();
      return;
    }
    setDraggedSubDbIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleSubDbDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedSubDbIndex !== null && draggedSubDbIndex !== index) {
      setDragOverSubDbIndex(index);
    }
  };

  const handleSubDbDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedSubDbIndex !== null && draggedSubDbIndex !== targetIndex && onReorderSubDbs) {
      const currentLinked = [...linkedSubDbs];
      const [moved] = currentLinked.splice(draggedSubDbIndex, 1);
      currentLinked.splice(targetIndex, 0, moved);

      let linkedIdx = 0;
      const newSubDbs = subDbs.map((sb) => {
        const isLinked = sb.msbId === currentMsb.id || (!sb.msbId && currentMsb.id === msbs[0]?.id);
        if (isLinked) {
          const item = currentLinked[linkedIdx];
          linkedIdx++;
          return item;
        }
        return sb;
      });
      onReorderSubDbs(newSubDbs);
    }
    setDraggedSubDbIndex(null);
    setDragOverSubDbIndex(null);
    setCanDragSubDbIndex(null);
  };

  const handleSubDbDragEnd = () => {
    setDraggedSubDbIndex(null);
    setDragOverSubDbIndex(null);
    setCanDragSubDbIndex(null);
  };

  const handleToggleSubDbEssential = (sb: SubDistributionBoard) => {
    const cur = sb.essentialGenset || 'NORMAL';
    const next: EssentialGensetType =
      cur === 'NORMAL' ? 'ESSENTIAL' : cur === 'ESSENTIAL' ? 'FIRE_LIFT_SAFETY' : 'NORMAL';
    onUpdateSubDb?.({
      ...sb,
      essentialGenset: next,
    });
  };

  const handleToggleDbEssential = (db: DistributionBoard) => {
    const cur = db.essentialGenset || 'NORMAL';
    const next: EssentialGensetType =
      cur === 'NORMAL' ? 'ESSENTIAL' : cur === 'ESSENTIAL' ? 'FIRE_LIFT_SAFETY' : 'NORMAL';
    onUpdateDb?.({
      ...db,
      essentialGenset: next,
    });
  };

  const handleDirectDbDragStart = (e: React.DragEvent, index: number) => {
    if (feederSortDirection !== 'none') {
      e.preventDefault();
      return;
    }
    if (canDragDirectDbIndex !== index) {
      e.preventDefault();
      return;
    }
    const targetTag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'OPTION', 'TEXTAREA'].includes(targetTag)) {
      e.preventDefault();
      return;
    }
    setDraggedDirectDbIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDirectDbDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedDirectDbIndex !== null && draggedDirectDbIndex !== index) {
      setDragOverDirectDbIndex(index);
    }
  };

  const handleDirectDbDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedDirectDbIndex !== null && draggedDirectDbIndex !== targetIndex && onReorderDbs) {
      const currentDirect = [...directDbs];
      const [moved] = currentDirect.splice(draggedDirectDbIndex, 1);
      currentDirect.splice(targetIndex, 0, moved);

      let directIdx = 0;
      const newDbs = dbs.map((db) => {
        const isDirect =
          db.subDbId === currentMsb.id ||
          db.subDbId === currentMsb.code ||
          (currentMsb.id === msbs[0]?.id && (db.subDbId === 'MSB' || db.subDbId === 'msb'));
        if (isDirect) {
          const item = currentDirect[directIdx];
          directIdx++;
          return item;
        }
        return db;
      });
      onReorderDbs(newDbs);
    }
    setDraggedDirectDbIndex(null);
    setDragOverDirectDbIndex(null);
    setCanDragDirectDbIndex(null);
  };

  const handleDirectDbDragEnd = () => {
    setDraggedDirectDbIndex(null);
    setDragOverDirectDbIndex(null);
    setCanDragDirectDbIndex(null);
  };

  // Natural Alphanumeric Sort for MSB tabs (e.g. MSB-01 before MSB-02, MSB-10)
  const sortedMsbs = useMemo(() => {
    const seen = new Set<string>();
    const unique = msbs.filter((m) => {
      if (!m || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return unique.sort((a, b) =>
      (a.code || '').localeCompare(b.code || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      }) ||
      (a.name || '').localeCompare(b.name || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [msbs]);

  // Sub-DBs assigned to the currently selected MSB, maintaining user's custom sequence in subDbs
  const linkedSubDbs = useMemo(() => {
    if (!currentMsb) return [];
    return subDbs.filter(
      (sb) => sb.msbId === currentMsb.id || (!sb.msbId && currentMsb.id === msbs[0]?.id)
    );
  }, [subDbs, currentMsb, msbs]);

  // Sub-DBs currently assigned to other MSBs (for quick linking)
  const unlinkedSubDbs = useMemo(() => {
    if (!currentMsb) return [];
    return subDbs.filter(
      (sb) => sb.msbId !== currentMsb.id && (sb.msbId || currentMsb.id !== msbs[0]?.id)
    );
  }, [subDbs, currentMsb, msbs]);

  // Direct DBs fed directly from this MSB
  const directDbs = useMemo(() => {
    if (!currentMsb) return [];
    return dbs.filter(
      (db) =>
        db.subDbId === currentMsb.id ||
        db.subDbId === currentMsb.code ||
        (currentMsb.id === msbs[0]?.id && (db.subDbId === 'MSB' || db.subDbId === 'msb'))
    );
  }, [dbs, currentMsb, msbs]);

  // Combined and sorted feeders (Sub-DBs and Direct DBs) for Feeder Schedule
  interface MsbFeederRow {
    type: 'subDb' | 'db';
    code: string;
    subDb?: SubDistributionBoard;
    db?: DistributionBoard;
    originalIndex: number;
  }

  const sortedFeeders = useMemo<MsbFeederRow[]>(() => {
    const list: MsbFeederRow[] = [
      ...linkedSubDbs.map((sb, idx) => ({
        type: 'subDb' as const,
        code: sb.code || '',
        subDb: sb,
        originalIndex: idx,
      })),
      ...directDbs.map((db, idx) => ({
        type: 'db' as const,
        code: db.code || '',
        db: db,
        originalIndex: idx,
      })),
    ];

    if (feederSortDirection === 'none') {
      return list;
    }

    return [...list].sort((a, b) => {
      const cmp = (a.code || '').localeCompare(b.code || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return feederSortDirection === 'asc' ? cmp : -cmp;
    });
  }, [linkedSubDbs, directDbs, feederSortDirection]);

  // Overall Phase Balance for current MSB
  const msbPhaseBalance = useMemo(() => {
    if (currentMsb?.phaseBalance) return currentMsb.phaseBalance;
    if (!currentMsb) return undefined;
    return calculateMsbPhaseBalance(
      linkedSubDbs,
      directDbs,
      directLoads,
      voltageSystem,
      currentMsb.overallBuildingDiversityFactor
    );
  }, [
    currentMsb,
    linkedSubDbs,
    directDbs,
    directLoads,
    voltageSystem,
  ]);

  // Essential and Fire Life-Safety calculations for the selected MSB
  const totalFireSafetyKW = useMemo(() => {
    const subDbsVal = linkedSubDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);
    const majorVal = directLoads
      .filter(
        (l) =>
          l.equipmentType === 'FIRE_PUMP' ||
          (l.isEssential &&
            (l.code?.toLowerCase().includes('fire') ||
              l.name?.toLowerCase().includes('fire')))
      )
      .reduce((sum, l) => sum + l.maximumDemandKW, 0);
    return subDbsVal + directDbsVal + majorVal;
  }, [linkedSubDbs, directDbs, directLoads]);

  const totalFireSafetyKVA = useMemo(() => {
    const subDbsVal = linkedSubDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);
    const majorVal = directLoads
      .filter(
        (l) =>
          l.equipmentType === 'FIRE_PUMP' ||
          (l.isEssential &&
            (l.code?.toLowerCase().includes('fire') ||
              l.name?.toLowerCase().includes('fire')))
      )
      .reduce((sum, l) => sum + l.maximumDemandKVA, 0);
    return subDbsVal + directDbsVal + majorVal;
  }, [linkedSubDbs, directDbs, directLoads]);

  const totalEssentialKW = useMemo(() => {
    const subDbsVal = linkedSubDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);
    const majorVal = directLoads
      .filter(
        (l) =>
          l.isEssential &&
          l.equipmentType !== 'FIRE_PUMP' &&
          !l.code?.toLowerCase().includes('fire') &&
          !l.name?.toLowerCase().includes('fire')
      )
      .reduce((sum, l) => sum + l.maximumDemandKW, 0);
    return subDbsVal + directDbsVal + majorVal;
  }, [linkedSubDbs, directDbs, directLoads]);

  const totalEssentialKVA = useMemo(() => {
    const subDbsVal = linkedSubDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);
    const majorVal = directLoads
      .filter(
        (l) =>
          l.isEssential &&
          l.equipmentType !== 'FIRE_PUMP' &&
          !l.code?.toLowerCase().includes('fire') &&
          !l.name?.toLowerCase().includes('fire')
      )
      .reduce((sum, l) => sum + l.maximumDemandKVA, 0);
    return subDbsVal + directDbsVal + majorVal;
  }, [linkedSubDbs, directDbs, directLoads]);

  if (!currentMsb) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <p>No Main Low Voltage Switchboard created yet.</p>
        <button
          onClick={onAddMsb}
          className="mt-3 px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-md text-sm cursor-pointer"
        >
          Create First MSB
        </button>
      </div>
    );
  }

  // Phase currents from aggregate phase balance tracking
  const pR = msbPhaseBalance?.phaseR?.currentAmps || 0;
  const pY = msbPhaseBalance?.phaseY?.currentAmps || 0;
  const pB = msbPhaseBalance?.phaseB?.currentAmps || 0;
  const maxPhaseAmps = Math.max(1, pR, pY, pB);

  // Dynamic Color Logic: matches highest current (amperage) phase Max(I_R, I_Y, I_B)
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

  const msbDesignCurrent = currentMsb.incomerCurrentAmps ?? Math.max(currentMsb.totalPlantCurrentAmps || 0, maxPhaseCurrent);
  const msbIncomerBreakerRating = currentMsb.mainIncomerBreaker?.rating;

  const handleAutoBalance = () => {
    const nextCount = autoBalanceCount + 1;
    setAutoBalanceCount(nextCount);

    const cycle = ((nextCount - 1) % 3) + 1;
    const cycleIndex = (nextCount - 1) % 3;

    if (onAutoBalanceMsb) {
      onAutoBalanceMsb(undefined, cycleIndex);
    }
    setBalanceMessage(
      `Auto-Balanced (Bottom-Up Hierarchy Pattern ${cycle}/3): DBs balanced locally first, Sub-DBs coordinated, and MSB feeders balanced without compromising DB health.`
    );
    setTimeout(() => setBalanceMessage(null), 5000);
  };

  return (
    <div className="space-y-1 sm:space-y-1.5">
      {/* 1. MSB Tab Bar & Management - Styled to match DBs Page */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 py-0.5 pr-24 sm:pr-28 min-w-0">
          {sortedMsbs.map((m, idx) => {
            const isSelected = m.id === currentMsb.id;
            const subCount = subDbs.filter(
              (sb) => sb.msbId === m.id || (!sb.msbId && m.id === msbs[0]?.id)
            ).length;
            const dbCount = dbs.filter(
              (d) =>
                d.subDbId === m.id ||
                d.subDbId === m.code ||
                (m.id === msbs[0]?.id && (d.subDbId === 'MSB' || d.subDbId === 'msb'))
            ).length;
            const totalFeeders = subCount + dbCount;

            return (
              <button
                key={`msb-tab-${m.id || m.code}-${idx}`}
                type="button"
                onClick={() => onSelectMsbId(m.id)}
                className={`px-2 sm:px-2.5 py-1 rounded-md font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
                }`}
                title={`${m.code} (${totalFeeders} Feeders · ${m.totalPlantMaximumDemandKW.toFixed(1)} kW)`}
              >
                <span>{m.code}</span>
              </button>
            );
          })}
        </div>

        {/* Action buttons locked to top-right corner: Add MSB (+), Duplicate MSB (copy), Delete MSB (trash) */}
        <div className="absolute top-0.5 right-0 flex items-center gap-1 z-10 bg-slate-50/80 backdrop-blur-xs pl-1 rounded">
          <button
            type="button"
            onClick={onAddMsb}
            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
            title="Add MSB"
            aria-label="Add MSB"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {onDuplicateMsb && (
            <button
              type="button"
              onClick={() => onDuplicateMsb(currentMsb)}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Duplicate MSB (${currentMsb.code})`}
              aria-label={`Duplicate MSB ${currentMsb.code}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {msbs.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteMsb(currentMsb.id)}
              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Delete MSB (${currentMsb.code})`}
              aria-label={`Delete MSB ${currentMsb.code}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* MSB Content Sections */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* 2. MSB 3-Column Overview Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 items-start">
          {/* Column 1 (Left Card) - MSB Info & Sizing Parameters */}
          <div className="lg:col-span-4 space-y-2 sm:space-y-2.5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={currentMsb.code}
                  onChange={(e) => onUpdateMsb({ ...currentMsb, code: e.target.value })}
                  className="font-mono font-bold text-base sm:text-lg text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-amber-500 focus:outline-none w-32"
                  title="MSB Identifier"
                />
                <span className="ml-auto px-2 py-0.5 rounded text-[11px] font-semibold border inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border-amber-300 shadow-2xs">
                  <span>3-Phase (4-Wire)</span>
                </span>
              </div>
              <input
                type="text"
                value={currentMsb.name ?? ''}
                onChange={(e) => onUpdateMsb({ ...currentMsb, name: e.target.value })}
                className="text-xs sm:text-sm text-slate-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none w-full mt-0.5"
                placeholder="Main Switchboard description or plant zone"
                aria-label="Main Switchboard description"
                title="Main Switchboard description"
              />
            </div>

            {/* Sizing Parameters Grid: Overall Diversity, Target Power Factor, Transformer Margin, Emergency Generator */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Overall Diversity:</label>
                <div className="flex items-center gap-1.5">
                  <NumericInput
                    step={0.01}
                    min={0.1}
                    max={1.0}
                    fallbackValue={0.8}
                    value={currentMsb.overallBuildingDiversityFactor ?? 0.8}
                    onChange={(val) => {
                      onUpdateMsb({
                        ...currentMsb,
                        overallBuildingDiversityFactor: val,
                      });
                    }}
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Overall Building Diversity Factor"
                  />
                  <span className="text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    ({(((currentMsb.overallBuildingDiversityFactor ?? 0.8)) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Target Power Factor:</label>
                <NumericInput
                  step={0.01}
                  min={0.5}
                  max={1.0}
                  fallbackValue={0.99}
                  value={currentMsb.targetPowerFactor ?? 0.99}
                  onChange={(val) => {
                    onUpdateMsb({
                      ...currentMsb,
                      targetPowerFactor: val,
                    });
                  }}
                  className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                  aria-label="Target Power Factor"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">TX Utilization (%):</label>
                <div className="flex items-center gap-1.5">
                  <NumericInput
                    step={5}
                    min={10}
                    max={100}
                    fallbackValue={80}
                    allowDecimals={false}
                    value={
                      currentMsb.txUtilizationPercent ??
                      currentMsb.utilizationPercent ??
                      (currentMsb.safetyMarginPercent && currentMsb.safetyMarginPercent >= 40
                        ? currentMsb.safetyMarginPercent
                        : (currentMsb.safetyMarginPercent ? 100 - currentMsb.safetyMarginPercent : 80))
                    }
                    onChange={(val) => {
                      onUpdateMsb({
                        ...currentMsb,
                        txUtilizationPercent: val,
                        utilizationPercent: val,
                        safetyMarginPercent: val,
                      });
                    }}
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Transformer Utilization Percent"
                  />
                  <span
                    className="text-slate-500 font-mono text-[11px] whitespace-nowrap"
                    title="Transformer & Main Incomer sizing: Required Capacity ≥ Demand / TX Utilization"
                  >
                    ({currentMsb.txUtilizationPercent ??
                      currentMsb.utilizationPercent ??
                      (currentMsb.safetyMarginPercent && currentMsb.safetyMarginPercent >= 40
                        ? currentMsb.safetyMarginPercent
                        : (currentMsb.safetyMarginPercent ? 100 - currentMsb.safetyMarginPercent : 80))}%)
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Emergency Generator:</label>
                <select
                  value={
                    currentMsb.generatorSizingScope === 'ESSENTIAL_LOADS_ONLY'
                      ? 'FIRE_LIFT_SAFETY_AND_ESSENTIAL'
                      : currentMsb.generatorSizingScope || 'FIRE_LIFT_SAFETY_AND_ESSENTIAL'
                  }
                  onChange={(e) =>
                    onUpdateMsb({
                      ...currentMsb,
                      generatorSizingScope: e.target.value as GeneratorSizingScope,
                    })
                  }
                  className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-slate-800 text-xs font-semibold shadow-2xs focus:ring-2 focus:ring-amber-200/60 outline-none transition-all cursor-pointer"
                >
                  <option value="FIRE_LIFT_SAFETY_AND_ESSENTIAL">
                    Fire Lift-Safety + Essential
                  </option>
                  <option value="FIRE_LIFT_SAFETY_ONLY">
                    Fire Lift-Safety Load ONLY
                  </option>
                  <option value="ESSENTIAL_ONLY">
                    Essential Load ONLY
                  </option>
                  <option value="FULL_PLANT">
                    100% Full Plant Standby
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Column 2 (Center Card) - Calculated Incomer & Loads */}
          <div className="lg:col-span-4 bg-slate-50/60 rounded-lg p-3 sm:p-3.5 border border-slate-200/80 space-y-2">
            <div className="text-xs pb-1 border-b border-slate-200">
              <span className="font-semibold text-slate-800">
                Calculated Incomer & Loads
              </span>
            </div>

            {/* Incomer, Busbar & Sizing Equipment Specifications */}
            <div className="space-y-1.5 text-xs font-mono">
              {/* Breaker */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-900 truncate" title={currentMsb.mainIncomerBreaker?.description}>
                    {currentMsb.mainIncomerBreaker?.description || 'Main Incomer Pending'}
                  </span>
                  {(currentMsb.manualMainIncomerBreakerRating !== undefined || currentMsb.manualIncomerBreakerRating !== undefined) && (
                    <button
                      type="button"
                      onClick={() => onUpdateMsb({
                        ...currentMsb,
                        manualMainIncomerBreakerRating: undefined,
                        manualIncomerBreakerRating: undefined,
                      })}
                      className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded shrink-0 cursor-pointer transition-colors"
                      title="Main breaker rating has been manually adjusted. Click to reset to auto-calculated sizing."
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Manual Main Incomer Breaker Size Adjustment Controls (-) and (+) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentMsb.mainIncomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'DOWN', true, cableSchedule);
                      if (next) onUpdateMsb({
                        ...currentMsb,
                        manualMainIncomerBreakerRating: next.breakerRating,
                        manualIncomerBreakerRating: next.breakerRating,
                      });
                    }}
                    disabled={!getStepBreakerSize(currentMsb.mainIncomerBreaker?.rating || 0, 'DOWN', true, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down main breaker size to smaller rating in Breaker Schedule"
                    aria-label="Step down main breaker size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentMsb.mainIncomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'UP', true, cableSchedule);
                      if (next) onUpdateMsb({
                        ...currentMsb,
                        manualMainIncomerBreakerRating: next.breakerRating,
                        manualIncomerBreakerRating: next.breakerRating,
                      });
                    }}
                    disabled={!getStepBreakerSize(currentMsb.mainIncomerBreaker?.rating || 0, 'UP', true, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-amber-900 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step up main breaker size to next rating in Breaker Schedule"
                    aria-label="Step up main breaker size"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Busbar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <GitFork className="w-4 h-4 text-amber-500 shrink-0" />
                  <span
                    className="font-semibold text-slate-900 truncate"
                    title={`Busbar: ${activeBusbarSizing?.formattedDescription || '1200 mm2 (2 x 100 x 6mm)'}`}
                  >
                    Busbar: {activeBusbarSizing?.formattedDescription || '1200 mm2 (2 x 100 x 6mm)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBusbarModalOpen(true)}
                  className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                  title="Open Busbar Sizing & Thermal Withstand Calculator"
                  aria-label="Open Busbar Sizing Calculator"
                >
                  <Calculator className="w-3.5 h-3.5 text-slate-500 hover:text-amber-600 transition-colors" />
                </button>
              </div>

              {/* Transformer */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold text-slate-900 truncate">
                    Transformer: {currentMsb.transformerSizing?.recommendedKVA ?? 0} kVA{' '}
                    <span className="text-emerald-700 font-medium">
                      ({(currentMsb.transformerSizing?.loadingPercent ?? 0).toFixed(1)}%)
                    </span>
                  </span>
                  {currentMsb.manualTransformerKVA !== undefined && (
                    <button
                      type="button"
                      onClick={() => onUpdateMsb({ ...currentMsb, manualTransformerKVA: undefined })}
                      className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded shrink-0 cursor-pointer transition-colors"
                      title="Transformer size has been manually adjusted. Click to reset to auto-calculated size."
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Manual Transformer Size Adjustment Controls (-) and (+) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentMsb.transformerSizing?.recommendedKVA ?? 0;
                      const next = getStepTransformerSize(cur, 'DOWN');
                      if (next) onUpdateMsb({ ...currentMsb, manualTransformerKVA: next });
                    }}
                    disabled={!getStepTransformerSize(currentMsb.transformerSizing?.recommendedKVA ?? 0, 'DOWN')}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down transformer size to smaller standard rating"
                    aria-label="Step down transformer size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentMsb.transformerSizing?.recommendedKVA ?? 0;
                      const next = getStepTransformerSize(cur, 'UP');
                      if (next) onUpdateMsb({ ...currentMsb, manualTransformerKVA: next });
                    }}
                    disabled={!getStepTransformerSize(currentMsb.transformerSizing?.recommendedKVA ?? 0, 'UP')}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-amber-900 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step up transformer size to next standard rating"
                    aria-label="Step up transformer size"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Generator */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                  <span
                    className="font-semibold text-slate-900 truncate"
                    title={`Generator Sizing Formula (${getGeneratorScopeLabel(currentMsb.generatorSizingScope)}): Basis Demand (${(
                      currentMsb.generatorSizingScope === 'FIRE_LIFT_SAFETY_ONLY'
                        ? currentMsb.generatorSizing?.fireLiftSafetyDemandKVA ?? 0
                        : currentMsb.generatorSizingScope === 'ESSENTIAL_ONLY'
                        ? currentMsb.generatorSizing?.essentialOnlyDemandKVA ?? 0
                        : currentMsb.generatorSizingScope === 'FULL_PLANT'
                        ? currentMsb.generatorSizing?.totalPlantDemandKVA ?? 0
                        : currentMsb.generatorSizing?.essentialDemandKVA ?? 0
                    ).toFixed(1)} kVA) × 1.25 motor inrush headroom = ${(
                      (currentMsb.generatorSizingScope === 'FIRE_LIFT_SAFETY_ONLY'
                        ? currentMsb.generatorSizing?.fireLiftSafetyDemandKVA ?? 0
                        : currentMsb.generatorSizingScope === 'ESSENTIAL_ONLY'
                        ? currentMsb.generatorSizing?.essentialOnlyDemandKVA ?? 0
                        : currentMsb.generatorSizingScope === 'FULL_PLANT'
                        ? currentMsb.generatorSizing?.totalPlantDemandKVA ?? 0
                        : currentMsb.generatorSizing?.essentialDemandKVA ?? 0) * 1.25
                    ).toFixed(1)} kVA required.`}
                  >
                    Generator: {currentMsb.generatorSizing?.recommendedPrimeKVA ?? 0} kVA Prime{' '}
                    <span className="text-emerald-700 font-medium">
                      ({(currentMsb.generatorSizing?.loadingPercent ?? 0).toFixed(1)}%)
                    </span>
                  </span>
                  {currentMsb.manualGeneratorKVA !== undefined && (
                    <button
                      type="button"
                      onClick={() => onUpdateMsb({ ...currentMsb, manualGeneratorKVA: undefined })}
                      className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded shrink-0 cursor-pointer transition-colors"
                      title="Generator size has been manually adjusted. Click to reset to auto-calculated size."
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Sizing Sheet Trigger */}
                <button
                  type="button"
                  onClick={() => setIsGeneratorModalOpen(true)}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 shadow-2xs"
                  title="Open Generator Sizing Formula & Workings Sheet"
                  aria-label="Open Generator Sizing Calculator"
                >
                  <Calculator className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600 transition-colors" />
                </button>
              </div>

              {/* Capacity Bank */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-semibold text-slate-900">
                      Cap. Bank: {currentMsb.capacitorBankSizing?.recommendedBankKVAr ?? 0} kVAr@{currentMsb.vRated ?? 525}V{' '}
                      <span className="text-emerald-700 font-medium">
                        ({Math.round(currentMsb.capacitorBankSizing?.totalConfiguredKVArSupply ?? 0)} kVAr@{currentMsb.vSupply ?? 420}V)
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCapacitorModalOpen(true)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                    title="Open Detailed Step Schedule & CI Medini Formula Sheet"
                    aria-label="Open Capacity Bank Workings"
                  >
                    <Calculator className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600 transition-colors" />
                  </button>
                </div>
                <div className="pl-6 text-[11px] text-slate-500 font-medium">
                  {currentMsb.capacitorBankSizing?.recommendedSteps || '0 steps configured'}
                </div>
              </div>
            </div>
          </div>

          {/* Column 3 (Right Card) - Overall R-Y-B Phase Balance */}
          <div className="md:col-span-2 lg:col-span-4 bg-slate-50/60 rounded-lg p-3 sm:p-3.5 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-slate-800">
                  Phase Balance (R-Y-B)
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoBalance}
                className="text-[11px] text-amber-900 hover:text-slate-950 bg-amber-400 hover:bg-amber-300 px-2 py-0.5 rounded font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                title="Dynamically balance circuits across downstream Sub-DBs and Final DBs for this MSB"
              >
                Auto-Balance
              </button>
            </div>

            {/* Live Graphical Bar Graphs for R, Y, B */}
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



            {/* Relocated Load Metrics from Center Card */}
            <div className="pt-1.5 border-t border-slate-200 space-y-0.5 text-xs font-mono">
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Total MD (Diversified):</span>
                <div className="font-mono text-xs tabular-nums text-right">
                  <span className="font-bold text-amber-700">
                    {currentMsb.totalPlantMaximumDemandKW.toFixed(1)} kW
                  </span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    {currentMsb.totalPlantMaximumDemandKVA.toFixed(1)} kVA
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600 gap-2">
                <span className="shrink-0">Design Current:</span>
                <div className="font-mono text-xs tabular-nums text-right">
                  <span className="font-bold text-slate-900">{msbDesignCurrent.toFixed(1)} A</span>
                  <span className="text-slate-500 text-[11px] ml-1 font-normal">
                    Max ({highestAmperagePhase})
                  </span>
                  {msbIncomerBreakerRating ? (
                    <>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-slate-700 font-medium text-[11px]">
                        {((msbDesignCurrent / msbIncomerBreakerRating) * 100).toFixed(0)}% of In ({msbIncomerBreakerRating}A)
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Total Essential Load:</span>
                <div className="font-mono text-xs tabular-nums text-right">
                  <span className="font-bold text-emerald-700">
                    {totalEssentialKW.toFixed(1)} kW
                  </span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    {totalEssentialKVA.toFixed(1)} kVA
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Total Fire Life-Safety Load:</span>
                <div className="font-mono text-xs tabular-nums text-right">
                  <span className="font-bold text-rose-700">
                    {totalFireSafetyKW.toFixed(1)} kW
                  </span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    {totalFireSafetyKVA.toFixed(1)} kVA
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Total Connected Load:</span>
                <div className="font-mono text-xs tabular-nums text-right">
                  <span className="font-bold text-slate-900">
                    {currentMsb.connectedLoadKW.toFixed(1)} kW
                  </span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    {currentMsb.connectedLoadKVA.toFixed(1)} kVA
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {balanceMessage && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{balanceMessage}</span>
          </div>
        )}
      </div>



      {/* 4. Sub-DBs / DBs Feeders Summary Table for this MSB */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Feeder Schedule
            </h3>
            {feederSortDirection !== 'none' && (
              <button
                type="button"
                onClick={() => setFeederSortDirection('none')}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                title="Click to reset to default order"
              >
                <span>Sorted: {feederSortDirection === 'asc' ? 'A–Z' : 'Z–A'}</span>
                <span className="font-bold text-amber-600">✕</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick-Link Unassigned Sub-DB dropdown */}
            {unlinkedSubDbs.length > 0 && onUpdateSubDb && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-xs shadow-2xs h-[30px]">
                <span className="text-slate-600 font-medium">Link Sub-DB:</span>
                <select
                  onChange={(e) => {
                    const sbToLink = subDbs.find((s) => s.id === e.target.value);
                    if (sbToLink && onUpdateSubDb) {
                      onUpdateSubDb({ ...sbToLink, msbId: currentMsb.id });
                    }
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-mono font-medium focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="" disabled>+ Assign to {currentMsb.code}...</option>
                  {unlinkedSubDbs.map((sb) => (
                    <option key={sb.id} value={sb.id}>
                      {sb.code}{sb.name ? ` - ${sb.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <span className="text-xs text-slate-500 font-mono">
              {linkedSubDbs.length} Sub-Boards{directDbs.length > 0 ? ` · ${directDbs.length} Direct DBs` : ''} Connected
            </span>
          </div>
        </div>

        {linkedSubDbs.length === 0 && directDbs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-white">
            <p className="font-medium text-slate-700">No feeders currently connected to {currentMsb.code}.</p>
            {unlinkedSubDbs.length > 0 && (
              <p className="mt-1 text-slate-500">
                Use the &ldquo;Link Sub-DB&rdquo; selector above or change the supply source on the Sub-DBs page.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-1.5 px-2 w-8 text-center text-slate-400 select-none" title="Drag handle to reorder rows">
                    <GripVertical className="w-3.5 h-3.5 mx-auto text-slate-400" />
                  </th>
                  <th className="py-1.5 px-2.5 w-10 text-center">#</th>
                  <th
                    onClick={toggleFeederSort}
                    className="py-1.5 px-2.5 min-w-[145px] whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/60 transition-colors group/col"
                    title={
                      feederSortDirection === 'asc'
                        ? 'Sorted A–Z (Ascending). Click to sort Z–A.'
                        : feederSortDirection === 'desc'
                        ? 'Sorted Z–A (Descending). Click to reset to default order.'
                        : 'Click to sort alphabetically by Feeder Code (A–Z)'
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={feederSortDirection !== 'none' ? 'text-amber-900 font-bold' : ''}>
                        Feeder Code
                      </span>
                      {feederSortDirection === 'asc' ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold text-xs" aria-label="Sorted A to Z">
                          ▲ <span className="text-[9px] font-sans font-semibold bg-amber-100 text-amber-800 px-1 rounded">A–Z</span>
                        </span>
                      ) : feederSortDirection === 'desc' ? (
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
                  <th className="py-1.5 px-2.5 w-[16%] min-w-[140px]">Description</th>
                  <th className="py-1.5 px-2.5 text-right">TCL (kW)</th>
                  <th className="py-1.5 px-2.5 text-right font-semibold text-amber-900">
                    MD (kW)
                  </th>
                  <th className="py-1.5 px-2.5 text-right">MD (kVA)</th>
                  <th className="py-1.5 px-2.5 text-right">I (A)</th>
                  <th className="py-1.5 px-2.5 min-w-[130px] whitespace-nowrap">Incomer Breaker</th>
                  <th className="py-1.5 px-2.5 w-[20%] min-w-[220px] whitespace-nowrap">Cable & VD</th>
                  <th className="py-1.5 px-2.5 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {sortedFeeders.map((entry, idx) => {
                  if (entry.type === 'subDb' && entry.subDb) {
                    const sb = entry.subDb;
                    return (
                      <tr
                        key={sb.id}
                        draggable={feederSortDirection === 'none' && canDragSubDbIndex === entry.originalIndex}
                        onDragStart={(e) => handleSubDbDragStart(e, entry.originalIndex)}
                        onDragOver={(e) => handleSubDbDragOver(e, entry.originalIndex)}
                        onDragLeave={() => {
                          if (dragOverSubDbIndex === entry.originalIndex) setDragOverSubDbIndex(null);
                        }}
                        onDrop={(e) => handleSubDbDrop(e, entry.originalIndex)}
                        onDragEnd={handleSubDbDragEnd}
                        className={`transition-all duration-150 group ${
                          draggedSubDbIndex === entry.originalIndex
                            ? 'opacity-35 bg-amber-50/70 border-2 border-dashed border-amber-400 scale-[0.99]'
                            : dragOverSubDbIndex === entry.originalIndex
                            ? 'bg-amber-100/90 border-y-2 border-amber-500 shadow-sm'
                            : 'hover:bg-amber-50/40'
                        }`}
                      >
                        {/* Drag Handle (Only this handle initiates row reordering) */}
                        <td
                          className="py-1 px-1 text-center text-slate-400 select-none"
                          title={
                            feederSortDirection !== 'none'
                              ? 'Manual reordering is disabled while sorted. Reset sort to reorder.'
                              : 'Click and drag handle to reorder feeder'
                          }
                        >
                          <span
                            onMouseDown={() => {
                              if (feederSortDirection === 'none') setCanDragSubDbIndex(entry.originalIndex);
                            }}
                            onMouseUp={() => setCanDragSubDbIndex(null)}
                            onTouchStart={() => {
                              if (feederSortDirection === 'none') setCanDragSubDbIndex(entry.originalIndex);
                            }}
                            onTouchEnd={() => setCanDragSubDbIndex(null)}
                            className={`inline-flex p-0.5 rounded transition-colors ${
                              feederSortDirection !== 'none'
                                ? 'cursor-not-allowed opacity-30 text-slate-300'
                                : 'hover:bg-slate-200/80 hover:text-slate-700 cursor-grab active:cursor-grabbing text-slate-400 group-hover:text-slate-600'
                            }`}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                        </td>
                        <td className="py-1 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-1 px-2.5 font-bold text-slate-900 min-w-[145px]">
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-mono whitespace-nowrap" title={sb.code}>{sb.code}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleSubDbEssential(sb)}
                              className={`w-6 h-5 inline-flex items-center justify-center rounded text-[10px] font-sans font-bold border shrink-0 cursor-pointer select-none transition-all hover:scale-105 active:scale-95 shadow-2xs ${
                                sb.essentialGenset === 'FIRE_LIFT_SAFETY'
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                                  : sb.essentialGenset === 'ESSENTIAL'
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                              title={`Supply: ${
                                sb.essentialGenset === 'FIRE_LIFT_SAFETY'
                                  ? 'Fire life-safety (F)'
                                  : sb.essentialGenset === 'ESSENTIAL'
                                  ? 'Essential (E)'
                                  : 'Normal (N)'
                              }. Click to toggle (Normal → Essential → Fire)`}
                              aria-label={`Toggle supply for ${sb.code}`}
                            >
                              {sb.essentialGenset === 'FIRE_LIFT_SAFETY'
                                ? 'F'
                                : sb.essentialGenset === 'ESSENTIAL'
                                ? 'E'
                                : 'N'}
                            </button>
                          </div>
                        </td>
                        <td className="py-1 px-2.5 font-sans text-slate-700 min-w-[140px]">
                          {onUpdateSubDb ? (
                            <input
                              type="text"
                              value={sb.name}
                              onChange={(e) => onUpdateSubDb({ ...sb, name: e.target.value })}
                              placeholder="Sub-DB description"
                              className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
                              title="Click to edit Sub-DB description"
                            />
                          ) : (
                            sb.name || <span className="text-slate-400 italic text-xs">No description</span>
                          )}
                        </td>
                        <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                          {sb.connectedLoadKW.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                          {sb.maximumDemandKW.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                          {sb.maximumDemandKVA.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                          {sb.incomerCurrentAmps.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5">
                          <span className="font-semibold text-slate-800 block truncate max-w-[150px]" title={sb.incomerBreaker?.description || 'N/A'}>
                            {sb.incomerBreaker?.description || 'N/A'}
                          </span>
                        </td>
                        {/* Sub-DB Cable & Voltage Drop (Fed directly from MSB: Allowable <= 4.0%) */}
                        <td className="py-1 px-2.5 min-w-[220px]">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800 block truncate max-w-[260px]" title={sb.incomerCable}>
                              {sb.incomerCable || 'N/A'}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500">
                                {sb.cableLengthMeters ?? 35}m · ΔV: {(sb.voltageDropPercent ?? 0).toFixed(2)}%
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold inline-flex items-center gap-0.5 ${
                                  (sb.voltageDropPercent ?? 0) <= 2.5
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : (sb.voltageDropPercent ?? 0) <= 4.0
                                    ? 'bg-amber-50 text-amber-700 border border-amber-300'
                                    : 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                                }`}
                                title={`Fed directly from MSB (${currentMsb.code}). Allowable drop limit: ≤ 4.00%. Remaining for DBs: ${Math.max(0, 4.0 - (sb.voltageDropPercent ?? 0)).toFixed(2)}%.`}
                              >
                                {(sb.voltageDropPercent ?? 0) <= 2.5 ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (sb.voltageDropPercent ?? 0) <= 4.0 ? (
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                )}
                                <span>
                                  {(sb.voltageDropPercent ?? 0) <= 2.5
                                    ? '≤ 4% OK'
                                    : (sb.voltageDropPercent ?? 0) <= 4.0
                                    ? '≤ 4% Pass'
                                    : '> 4% High'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-1 px-2.5 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onNavigateToSubDb(sb.id)}
                              className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                              title="Open Sub-DB in Level 2"
                              aria-label={`Open Sub-DB ${sb.code}`}
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDuplicateSubDb?.(sb)}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Duplicate Sub-DB"
                              aria-label={`Duplicate Sub-DB ${sb.code}`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteSubDb?.(sb.id)}
                              disabled={subDbs.length <= 1}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                subDbs.length <= 1
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={subDbs.length <= 1 ? 'Cannot delete the only Sub-DB' : 'Delete Sub-DB'}
                              aria-label={`Delete Sub-DB ${sb.code}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (entry.type === 'db' && entry.db) {
                    const db = entry.db;
                    return (
                      <tr
                        key={db.id}
                        draggable={feederSortDirection === 'none' && canDragDirectDbIndex === entry.originalIndex}
                        onDragStart={(e) => handleDirectDbDragStart(e, entry.originalIndex)}
                        onDragOver={(e) => handleDirectDbDragOver(e, entry.originalIndex)}
                        onDragLeave={() => {
                          if (dragOverDirectDbIndex === entry.originalIndex) setDragOverDirectDbIndex(null);
                        }}
                        onDrop={(e) => handleDirectDbDrop(e, entry.originalIndex)}
                        onDragEnd={handleDirectDbDragEnd}
                        className={`transition-all duration-150 group ${
                          draggedDirectDbIndex === entry.originalIndex
                            ? 'opacity-35 bg-amber-50/70 border-2 border-dashed border-amber-400 scale-[0.99]'
                            : dragOverDirectDbIndex === entry.originalIndex
                            ? 'bg-amber-100/90 border-y-2 border-amber-500 shadow-sm'
                            : 'hover:bg-amber-50/40 bg-amber-50/20'
                        }`}
                      >
                        {/* Drag Handle (Only this handle initiates row reordering) */}
                        <td
                          className="py-1 px-1 text-center text-slate-400 select-none"
                          title={
                            feederSortDirection !== 'none'
                              ? 'Manual reordering is disabled while sorted. Reset sort to reorder.'
                              : 'Click and drag handle to reorder feeder'
                          }
                        >
                          <span
                            onMouseDown={() => {
                              if (feederSortDirection === 'none') setCanDragDirectDbIndex(entry.originalIndex);
                            }}
                            onMouseUp={() => setCanDragDirectDbIndex(null)}
                            onTouchStart={() => {
                              if (feederSortDirection === 'none') setCanDragDirectDbIndex(entry.originalIndex);
                            }}
                            onTouchEnd={() => setCanDragDirectDbIndex(null)}
                            className={`inline-flex p-0.5 rounded transition-colors ${
                              feederSortDirection !== 'none'
                                ? 'cursor-not-allowed opacity-30 text-slate-300'
                                : 'hover:bg-slate-200/80 hover:text-slate-700 cursor-grab active:cursor-grabbing text-slate-400 group-hover:text-slate-600'
                            }`}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                        </td>
                        <td className="py-1 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-1 px-2.5 font-bold text-slate-900 min-w-[145px]">
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="font-mono whitespace-nowrap" title={db.code}>{db.code}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleDbEssential(db)}
                              className={`w-6 h-5 inline-flex items-center justify-center rounded text-[10px] font-sans font-bold border shrink-0 cursor-pointer select-none transition-all hover:scale-105 active:scale-95 shadow-2xs ${
                                db.essentialGenset === 'FIRE_LIFT_SAFETY'
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                                  : db.essentialGenset === 'ESSENTIAL'
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                              title={`Supply: ${
                                db.essentialGenset === 'FIRE_LIFT_SAFETY'
                                  ? 'Fire life-safety (F)'
                                  : db.essentialGenset === 'ESSENTIAL'
                                  ? 'Essential (E)'
                                  : 'Normal (N)'
                              }. Click to toggle (Normal → Essential → Fire)`}
                              aria-label={`Toggle supply for ${db.code}`}
                            >
                              {db.essentialGenset === 'FIRE_LIFT_SAFETY'
                                ? 'F'
                                : db.essentialGenset === 'ESSENTIAL'
                                ? 'E'
                                : 'N'}
                            </button>
                          </div>
                        </td>
                        <td className="py-1 px-2.5 font-sans text-slate-700 min-w-[140px]">
                          {onUpdateDb ? (
                            <input
                              type="text"
                              value={db.name}
                              onChange={(e) => onUpdateDb({ ...db, name: e.target.value })}
                              placeholder="Board description"
                              className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
                              title="Click to edit Board description"
                            />
                          ) : (
                            db.name || <span className="text-slate-400 italic text-xs">No description</span>
                          )}
                        </td>
                        <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                          {db.connectedLoadKW.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                          {db.maximumDemandKW.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                          {db.maximumDemandKVA.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                          {db.incomerCurrentAmps.toFixed(1)}
                        </td>
                        <td className="py-1 px-2.5">
                          <span className="font-semibold text-slate-800 block truncate max-w-[150px]" title={db.incomerBreaker?.description || 'N/A'}>
                            {db.incomerBreaker?.description || 'N/A'}
                          </span>
                        </td>
                        {/* Direct DB Cable & Voltage Drop (Fed directly from MSB: Allowable <= 4.0%) */}
                        <td className="py-1 px-2.5 min-w-[220px]">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800 block truncate max-w-[260px]" title={db.incomerCable}>
                              {db.incomerCable || 'N/A'}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500">
                                {db.cableLengthMeters ?? 25}m · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}%
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold inline-flex items-center gap-0.5 ${
                                  (db.voltageDropPercent ?? 0) <= 2.5
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : (db.voltageDropPercent ?? 0) <= 4.0
                                    ? 'bg-amber-50 text-amber-700 border border-amber-300'
                                    : 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                                }`}
                                title={`Fed directly from MSB (${currentMsb.code}). Allowable drop limit: ≤ 4.00%`}
                              >
                                {(db.voltageDropPercent ?? 0) <= 2.5 ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (db.voltageDropPercent ?? 0) <= 4.0 ? (
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                )}
                                <span>
                                  {(db.voltageDropPercent ?? 0) <= 2.5
                                    ? '≤ 4% OK'
                                    : (db.voltageDropPercent ?? 0) <= 4.0
                                    ? '≤ 4% Pass'
                                    : '> 4% High'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Action Column: [ ➔ Open ] [ ❐ Duplicate ] [ 🗑 Delete ] */}
                        <td className="py-1 px-2.5 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onNavigateToDb?.(db.id)}
                              className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                              title="Open DB in Level 1"
                              aria-label={`Open DB ${db.code}`}
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDuplicateDb?.(db)}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Duplicate DB"
                              aria-label={`Duplicate DB ${db.code}`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteDb?.(db.id)}
                              disabled={dbs.length <= 1}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                dbs.length <= 1
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={dbs.length <= 1 ? 'Cannot delete the only DB' : 'Delete DB'}
                              aria-label={`Delete DB ${db.code}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return null;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

      {/* Capacitor Bank Detailed Schedule & CI Medini Calculation Modal */}
      <CapacitorBankModal
        isOpen={isCapacitorModalOpen}
        onClose={() => setIsCapacitorModalOpen(false)}
        msb={currentMsb}
        onUpdateMsb={onUpdateMsb}
      />

      {/* Busbar Sizing & Thermal Withstand Calculation Modal */}
      <BusbarSizingModal
        isOpen={isBusbarModalOpen}
        onClose={() => setIsBusbarModalOpen(false)}
        msb={currentMsb}
        onUpdateMsb={onUpdateMsb}
        voltageSystem={voltageSystem}
      />

      {/* Generator Sizing Formula & Workings Modal */}
      <GeneratorSizingModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        msb={currentMsb}
        onUpdateMsb={onUpdateMsb}
        subDbs={subDbs}
        dbs={dbs}
        directLoads={directLoads}
        voltageSystem={voltageSystem}
      />
    </div>
  );
};
