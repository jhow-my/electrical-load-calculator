import React, { useState, useMemo } from 'react';
import {
  SubDistributionBoard,
  DistributionBoard,
  VoltageSystem,
  CableScheduleEntry,
} from '../types/electrical';
import { getStepCableSize, getStepBreakerSize, getDbVoltageDropValidation } from '../utils/electricalCalculations';
import { NumericInput } from './NumericInput';
import {
  Plus,
  Trash2,
  Copy,
  ShieldCheck,
  Cable,
  ArrowRight,
  Table as TableIcon,
  CreditCard,
  Scale,
  CheckCircle2,
  AlertTriangle,
  GripVertical,
  Zap,
} from 'lucide-react';

interface SubDbViewProps {
  subDbs: SubDistributionBoard[];
  dbs: DistributionBoard[];
  selectedSubDbId: string;
  onSelectSubDbId: (id: string) => void;
  onUpdateSubDb: (updated: SubDistributionBoard) => void;
  onAddSubDb: () => void;
  onDeleteSubDb: (id: string) => void;
  onDuplicateSubDb?: (subDb: SubDistributionBoard) => void;
  onNavigateToDb: (dbId: string) => void;
  onNavigateToMsb?: (msbId?: string) => void;
  onAutoBalanceSubDb?: (subDbId: string, priorityOrder?: ('R' | 'Y' | 'B')[], cycleIndex?: number) => void;
  voltageSystem: VoltageSystem;
  onUpdateDb?: (updated: DistributionBoard) => void;
  onDuplicateDb?: (db: DistributionBoard) => void;
  onDeleteDb?: (dbId: string) => void;
  onReorderDbs?: (reorderedDbs: DistributionBoard[]) => void;
  msbs?: import('../types/electrical').MainSwitchBoard[];
  cableSchedule?: CableScheduleEntry[];
}

export const SubDbView: React.FC<SubDbViewProps> = ({
  subDbs,
  dbs,
  selectedSubDbId,
  onSelectSubDbId,
  onUpdateSubDb,
  onAddSubDb,
  onDeleteSubDb,
  onDuplicateSubDb,
  onNavigateToDb,
  onNavigateToMsb,
  onAutoBalanceSubDb,
  voltageSystem: _voltageSystem,
  onUpdateDb,
  onDuplicateDb,
  onDeleteDb,
  onReorderDbs,
  msbs = [],
  cableSchedule,
}) => {
  const currentSubDb = subDbs.find((s) => s.id === selectedSubDbId) || subDbs[0];
  const [dbDisplayMode, setDbDisplayMode] = useState<'table' | 'cards'>('table');
  const [balanceMessage, setBalanceMessage] = useState<string | null>(null);
  const [autoBalanceCount, setAutoBalanceCount] = useState<number>(0);

  // Drag and Drop state for Feeder Schedule reordering (strictly initiated via Drag Handle)
  const [draggedDbIndex, setDraggedDbIndex] = useState<number | null>(null);
  const [dragOverDbIndex, setDragOverDbIndex] = useState<number | null>(null);
  const [canDragDbIndex, setCanDragDbIndex] = useState<number | null>(null);

  const handleDbDragStart = (e: React.DragEvent, index: number) => {
    if (feederSortDirection !== 'none') {
      e.preventDefault();
      return;
    }
    if (canDragDbIndex !== index) {
      e.preventDefault();
      return;
    }
    const targetTag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'OPTION', 'TEXTAREA'].includes(targetTag)) {
      e.preventDefault();
      return;
    }
    setDraggedDbIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDbDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedDbIndex !== null && draggedDbIndex !== index) {
      setDragOverDbIndex(index);
    }
  };

  const handleDbDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedDbIndex !== null && draggedDbIndex !== targetIndex && onReorderDbs) {
      const currentLinked = [...linkedDbs];
      const [moved] = currentLinked.splice(draggedDbIndex, 1);
      currentLinked.splice(targetIndex, 0, moved);

      // Re-map into global dbs array preserving positions of other DBs
      let linkedIdx = 0;
      const newDbs = dbs.map((db) => {
        if (db.subDbId === currentSubDb.id) {
          const item = currentLinked[linkedIdx];
          linkedIdx++;
          return item;
        }
        return db;
      });
      onReorderDbs(newDbs);
    }
    setDraggedDbIndex(null);
    setDragOverDbIndex(null);
    setCanDragDbIndex(null);
  };

  const handleDbDragEnd = () => {
    setDraggedDbIndex(null);
    setDragOverDbIndex(null);
    setCanDragDbIndex(null);
  };

  // Natural Alphanumeric Sort for Sub-DB tabs (case-insensitive, natural number order e.g. SB-1 before SB-10)
  const sortedSubDbs = useMemo(() => {
    return [...subDbs].sort((a, b) =>
      (a.code || '').localeCompare(b.code || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      }) ||
      (a.name || '').localeCompare(b.name || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [subDbs]);

  // Linked DBs for this Sub-DB, maintaining user's custom sequence in dbs
  const linkedDbs = useMemo(() => {
    if (!currentSubDb) return [];
    return dbs.filter((db) => db.subDbId === currentSubDb.id);
  }, [dbs, currentSubDb]);

  // Column sorting state for Feeder Schedule ("Board Code")
  const [feederSortDirection, setFeederSortDirection] = useState<'none' | 'asc' | 'desc'>('none');

  const toggleFeederSort = () => {
    setFeederSortDirection((prev) => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  // Sorted Linked DBs list (natural alphanumeric sorting A-Z and Z-A, or default original order)
  const sortedLinkedDbs = useMemo(() => {
    if (feederSortDirection === 'none') {
      return linkedDbs;
    }
    return [...linkedDbs].sort((a, b) => {
      const cmp = (a.code || '').localeCompare(b.code || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return feederSortDirection === 'asc' ? cmp : -cmp;
    });
  }, [linkedDbs, feederSortDirection]);

  const unlinkedDbs = useMemo(() => {
    if (!currentSubDb) return [];
    return dbs.filter((db) => db.subDbId !== currentSubDb.id);
  }, [dbs, currentSubDb]);

  if (!currentSubDb) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <p>No Sub-Distribution Board created yet.</p>
        <button
          onClick={onAddSubDb}
          className="mt-3 px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-md text-sm cursor-pointer"
        >
          Create First Sub-DB
        </button>
      </div>
    );
  }

  // Phase currents from aggregate phase balance tracking
  const pR = currentSubDb.phaseBalance?.phaseR?.currentAmps || 0;
  const pY = currentSubDb.phaseBalance?.phaseY?.currentAmps || 0;
  const pB = currentSubDb.phaseBalance?.phaseB?.currentAmps || 0;
  const maxPhaseAmps = Math.max(1, pR, pY, pB);
  const maxPhaseLabel = pR >= pY && pR >= pB ? 'R' : pY >= pB ? 'Y' : 'B';

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

  const handleAutoBalance = () => {
    const nextCount = autoBalanceCount + 1;
    setAutoBalanceCount(nextCount);

    const cycle = ((nextCount - 1) % 3) + 1;
    const cycleIndex = (nextCount - 1) % 3;

    if (onAutoBalanceSubDb) {
      onAutoBalanceSubDb(currentSubDb.id, undefined, cycleIndex);
    }
    setBalanceMessage(
      `Auto-Balanced (Bottom-Up Pattern ${cycle}/3): Downstream DBs balanced locally first, then staggered across Sub-DB phases.`
    );
    setTimeout(() => setBalanceMessage(null), 5000);
  };

  return (
    <div className="space-y-1 sm:space-y-1.5">
      {/* Sub-DB Selector Bar - Wrapped & Touch Friendly */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 py-0.5 pr-24 sm:pr-28 min-w-0">
          {sortedSubDbs.map((sb) => {
            const isSelected = sb.id === currentSubDb.id;
            const count = dbs.filter((d) => d.subDbId === sb.id).length;
            return (
              <button
                key={sb.id}
                type="button"
                onClick={() => onSelectSubDbId(sb.id)}
                className={`px-2 sm:px-2.5 py-1 rounded-md font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
                }`}
                title={`${sb.code} (${count} DBs · ${sb.maximumDemandKW.toFixed(1)} kW)`}
              >
                <span>{sb.code}</span>
                {sb.voltageDropStatus === 'EXCEEDED' && (
                  <span
                    className="p-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center"
                    title={`Voltage drop exceeds allowable limit: ${(sb.voltageDropPercent ?? 0).toFixed(2)}%`}
                  >
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Action buttons locked to top-right corner: Add Sub-DB (+), Duplicate Sub-DB (copy), Delete Sub-DB (trash) */}
        <div className="absolute top-0.5 right-0 flex items-center gap-1 z-10 bg-slate-50/80 backdrop-blur-xs pl-1 rounded">
          <button
            type="button"
            onClick={onAddSubDb}
            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
            title="Add Sub-DB"
            aria-label="Add Sub-DB"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {onDuplicateSubDb && (
            <button
              type="button"
              onClick={() => onDuplicateSubDb(currentSubDb)}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Duplicate Sub-DB (${currentSubDb.code})`}
              aria-label={`Duplicate Sub-DB ${currentSubDb.code}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {subDbs.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteSubDb(currentSubDb.id)}
              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer flex items-center justify-center"
              title={`Delete Sub-DB (${currentSubDb.code})`}
              aria-label={`Delete Sub-DB ${currentSubDb.code}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-DB Content Sections */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* Sub-DB 3-Column Overview Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 items-start">
          {/* Column 1 (Left Side) - Input Panel */}
          <div className="lg:col-span-4 space-y-2 sm:space-y-2.5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={currentSubDb.code}
                  onChange={(e) => onUpdateSubDb({ ...currentSubDb, code: e.target.value })}
                  className="font-mono font-bold text-base sm:text-lg text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-amber-500 focus:outline-none w-32"
                  title="Sub-DB Tag"
                />
                <span className="ml-auto px-2 py-0.5 rounded text-[11px] font-semibold border inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border-amber-300 shadow-2xs">
                  <span>3-Phase (4-Wire)</span>
                </span>
              </div>
              <input
                type="text"
                value={currentSubDb.name ?? ''}
                onChange={(e) => onUpdateSubDb({ ...currentSubDb, name: e.target.value })}
                className="text-xs sm:text-sm text-slate-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none w-full mt-0.5"
                placeholder="Sub-DB description or plant zone"
                aria-label="Sub DB description"
                title="Sub DB description"
              />
            </div>

            {/* Diversity Factor & Safety Margin Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-500 block mb-0.5 text-[11px]">Group Diversity (DF):</label>
                <div className="flex items-center gap-1.5">
                  <NumericInput
                    step={0.05}
                    min={0.1}
                    max={1.0}
                    fallbackValue={0.9}
                    value={currentSubDb.groupDiversityFactor ?? 0.9}
                    onChange={(val) => {
                      onUpdateSubDb({
                        ...currentSubDb,
                        groupDiversityFactor: val,
                      });
                    }}
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Sub-DB Group Diversity Factor"
                  />
                  <span className="text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    ({(((currentSubDb.groupDiversityFactor ?? 0.9)) * 100).toFixed(0)}%)
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
                      currentSubDb.utilizationPercent ??
                      (currentSubDb.safetyMarginPercent && currentSubDb.safetyMarginPercent >= 40
                        ? currentSubDb.safetyMarginPercent
                        : (currentSubDb.safetyMarginPercent ? 100 - currentSubDb.safetyMarginPercent : 80))
                    }
                    onChange={(val) => {
                      onUpdateSubDb({
                        ...currentSubDb,
                        utilizationPercent: val,
                        safetyMarginPercent: val,
                      });
                    }}
                    className="w-full font-mono bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Sub-DB Utilization Percent"
                  />
                  <span
                    className="text-slate-500 font-mono text-[11px] whitespace-nowrap"
                    title="Protective breaker sizing: Required Breaker Capacity ≥ I_SB / Utilization"
                  >
                    ({currentSubDb.utilizationPercent ??
                      (currentSubDb.safetyMarginPercent && currentSubDb.safetyMarginPercent >= 40
                        ? currentSubDb.safetyMarginPercent
                        : (currentSubDb.safetyMarginPercent ? 100 - currentSubDb.safetyMarginPercent : 80))}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Upstream Supply Source: Fed From MSB */}
            <div className="text-xs pt-0.5">
              <label className="text-slate-500 block mb-0.5 text-[11px] font-medium">Fed From:</label>
              <div className="flex items-center gap-1.5">
                <select
                  value={currentSubDb.msbId || (msbs?.[0]?.id || 'msb-main')}
                  onChange={(e) => onUpdateSubDb({ ...currentSubDb, msbId: e.target.value })}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 font-medium"
                >
                  {(msbs.length > 0 ? msbs : [{ id: 'msb-main', code: 'MSB-01', name: 'Main Switchboard' }]).map((m, mIdx) => (
                    <option key={`subdb-fed-msb-${m.id || m.code}-${mIdx}`} value={m.id}>
                      {m.code}{m.name ? ` - ${m.name}` : ''}
                    </option>
                  ))}
                </select>

                {onNavigateToMsb && (
                  <button
                    type="button"
                    onClick={() => onNavigateToMsb(currentSubDb.msbId || msbs[0]?.id)}
                    className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0"
                    title={`Go to MSB: ${(msbs.find((m) => m.id === currentSubDb.msbId) || msbs[0])?.code || 'MSB'}`}
                    aria-label="Go to fed from MSB"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Column 2 (Center) - Calculated Incomer */}
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
                  <span className="font-semibold text-slate-900 font-mono truncate" title={currentSubDb.incomerBreaker?.description}>
                    {currentSubDb.incomerBreaker?.description || 'Pending calculation'}
                  </span>
                  {currentSubDb.manualIncomerBreakerRating !== undefined && (
                    <button
                      type="button"
                      onClick={() => onUpdateSubDb({ ...currentSubDb, manualIncomerBreakerRating: undefined })}
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
                      const cur = currentSubDb.incomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'DOWN', true, cableSchedule);
                      if (next) onUpdateSubDb({ ...currentSubDb, manualIncomerBreakerRating: next.breakerRating });
                    }}
                    disabled={!getStepBreakerSize(currentSubDb.incomerBreaker?.rating || 0, 'DOWN', true, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down breaker size to smaller rating in Breaker Schedule"
                    aria-label="Step down breaker size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = currentSubDb.incomerBreaker?.rating || 0;
                      const next = getStepBreakerSize(cur, 'UP', true, cableSchedule);
                      if (next) onUpdateSubDb({ ...currentSubDb, manualIncomerBreakerRating: next.breakerRating });
                    }}
                    disabled={!getStepBreakerSize(currentSubDb.incomerBreaker?.rating || 0, 'UP', true, cableSchedule)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-amber-100 hover:border-amber-400 active:bg-amber-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 hover:text-amber-900 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step up breaker size to next rating in Breaker Schedule"
                    aria-label="Step up breaker size"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Cable className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-slate-900 font-mono truncate" title={currentSubDb.incomerCable}>
                    {currentSubDb.incomerCable || 'Pending calculation'}
                  </span>
                  {currentSubDb.manualIncomerCable && (
                    <button
                      type="button"
                      onClick={() => onUpdateSubDb({ ...currentSubDb, manualIncomerCable: undefined })}
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
                      const next = getStepCableSize(currentSubDb.incomerCable, 'DOWN', true);
                      if (next) onUpdateSubDb({ ...currentSubDb, manualIncomerCable: next });
                    }}
                    disabled={!getStepCableSize(currentSubDb.incomerCable, 'DOWN', true)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 text-xs font-bold leading-none transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed select-none"
                    title="Step down cable size to smaller standard rating"
                    aria-label="Step down cable size"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = getStepCableSize(currentSubDb.incomerCable, 'UP', true);
                      if (next) onUpdateSubDb({ ...currentSubDb, manualIncomerCable: next });
                    }}
                    disabled={!getStepCableSize(currentSubDb.incomerCable, 'UP', true)}
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
                const isSbBreakerBasis = (currentSubDb.voltageDropBasis || 'BREAKER') === 'BREAKER';
                const sbBreakerAmps = currentSubDb.incomerBreaker?.rating || currentSubDb.incomerCurrentAmps;
                const sbActiveCurrent = isSbBreakerBasis ? sbBreakerAmps : currentSubDb.incomerCurrentAmps;

                const handleToggleBasis = () => {
                  const nextBasis = isSbBreakerBasis ? 'DESIGN' : 'BREAKER';
                  onUpdateSubDb({
                    ...currentSubDb,
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
                          className="text-[9px] font-mono px-1 py-0.2 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer hover:bg-slate-200"
                          onClick={handleToggleBasis}
                          title={`Calculation basis: ${isSbBreakerBasis ? 'Breaker Rating (I)' : 'Base Design Current (Ib)'}. Click to toggle.`}
                        >
                          via {isSbBreakerBasis ? 'I' : 'Ib'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-right">
                        <span
                          className={`font-bold ${
                            (currentSubDb.voltageDropPercent ?? 0) > 4.0
                              ? 'text-rose-600'
                              : (currentSubDb.voltageDropPercent ?? 0) > 2.5
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {(currentSubDb.voltageDropPercent ?? 0).toFixed(2)}% drop
                        </span>
                        <span className="text-slate-500 font-medium text-[11px]">
                          ({(currentSubDb.voltageDropV ?? 0).toFixed(2)} V)
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
                            fallbackValue={35}
                            value={currentSubDb.cableLengthMeters ?? 35}
                            onChange={(val) => {
                              onUpdateSubDb({
                                ...currentSubDb,
                                cableLengthMeters: val,
                              });
                            }}
                            className="w-14 font-mono bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none text-center font-bold transition-colors"
                            title="Route length of incoming sub-main cable from MSB to this Sub-DB (meters)"
                            aria-label="Cable length in meters"
                          />
                          <span className="ml-1 text-slate-500 font-mono text-[11px]">m</span>
                        </div>
                      </div>

                      {/* Status Indicator (Fed directly from MSB: Allowable <= 4.0%) */}
                      <div>
                        {(currentSubDb.voltageDropPercent ?? 0) <= 2.5 ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"
                            title={`Fed directly from MSB. Within recommended 2.5% feeder drop limit (IEC 60364-5-52 / BS 7671). Remaining budget for downstream DBs: ${Math.max(0, 4.0 - (currentSubDb.voltageDropPercent ?? 0)).toFixed(2)}%.`}
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>≤ 4% OK</span>
                          </span>
                        ) : (currentSubDb.voltageDropPercent ?? 0) <= 4.0 ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 inline-flex items-center gap-1"
                            title={`Fed directly from MSB. Acceptable within 4.0% sub-main limit (BS 7671). Remaining budget for downstream DBs: ${Math.max(0, 4.0 - (currentSubDb.voltageDropPercent ?? 0)).toFixed(2)}%.`}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>≤ 4% Pass</span>
                          </span>
                        ) : (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300 inline-flex items-center gap-1"
                            title="Fed directly from MSB. Voltage drop exceeds 4.0% sub-main limit! Upsize cable using (+) button or shorten run."
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>&gt; 4% High</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Calculation Detail Line with Clickable Current Basis */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                      <span title="Specific voltage drop factor per BS 7671 Table 4D4B / 4E4B" className="text-slate-500">
                        Factor: {(currentSubDb.voltageDropMvPerAmpMeter ?? 0).toFixed(2)} mV/A/m
                      </span>

                      <span
                        onClick={handleToggleBasis}
                        className="cursor-pointer hover:underline hover:text-amber-900 text-slate-600 transition-colors select-none"
                        title={`Click to switch calculation basis between Breaker Rating (I: ${sbBreakerAmps}A) and Design Current (Ib: ${currentSubDb.incomerCurrentAmps.toFixed(1)}A)`}
                      >
                        <strong className="text-slate-800 font-bold">{isSbBreakerBasis ? 'I' : 'Ib'}</strong>: {sbActiveCurrent.toFixed(1)}A · L: {currentSubDb.cableLengthMeters ?? 35}m
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Column 3 (Right Side) - Phase Balance System */}
          <div className="md:col-span-2 lg:col-span-4 bg-slate-50/60 rounded-lg p-3 sm:p-3.5 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-slate-800">Phase Balance (R-Y-B)</span>
              </div>
              <button
                type="button"
                onClick={handleAutoBalance}
                className="text-[11px] text-amber-900 hover:text-slate-950 bg-amber-400 hover:bg-amber-300 px-2 py-0.5 rounded font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                title="Dynamically balance circuits across all downstream Final DBs to optimize Sub-DB symmetry"
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

            {/* Incomer Load & Metrics Section at lowest position of Phase Balance card */}
            <div className="pt-1.5 border-t border-slate-200 space-y-1">
              <div className="space-y-0.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Connected Load:</span>
                  <div className="font-mono text-xs tabular-nums text-right">
                    <span className="font-bold text-slate-900">{currentSubDb.connectedLoadKW.toFixed(2)} kW</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-slate-500 font-medium text-[11px]">{currentSubDb.connectedLoadKVA.toFixed(2)} kVA</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Maximum Demand:</span>
                  <div className="font-mono text-xs tabular-nums text-right">
                    <span className="font-bold text-amber-700">{currentSubDb.maximumDemandKW.toFixed(2)} kW</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-slate-500 font-medium text-[11px]">{currentSubDb.maximumDemandKVA.toFixed(2)} kVA</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-600 gap-2">
                  <span className="shrink-0">Design Current:</span>
                  <div className="font-mono text-xs tabular-nums text-right">
                    <span className="font-bold text-slate-900">{currentSubDb.incomerCurrentAmps.toFixed(1)} A</span>
                    <span className="text-slate-500 text-[11px] ml-1 font-normal">
                      Max ({maxPhaseLabel})
                    </span>
                    {currentSubDb.incomerBreaker?.rating ? (
                      <>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-700 font-medium text-[11px]">
                          {((currentSubDb.incomerCurrentAmps / currentSubDb.incomerBreaker.rating) * 100).toFixed(0)}% of In ({currentSubDb.incomerBreaker.rating}A)
                        </span>
                      </>
                    ) : null}
                  </div>
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

      {/* Linked DBs Schedule & Responsive Cards */}
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

          {/* View Mode Switcher for Connected DBs */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 h-[30px]">
            <button
              onClick={() => setDbDisplayMode('table')}
              className={`px-2 h-full rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                dbDisplayMode === 'table'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              onClick={() => setDbDisplayMode('cards')}
              className={`px-2 h-full rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                dbDisplayMode === 'cards'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>

        {linkedDbs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No Distribution Boards currently connected to this Sub-DB.
            {unlinkedDbs.length > 0 && (
              <p className="mt-2 text-slate-400">
                You can assign DBs from the Level 1 tab or change their feeder Sub-DB.
              </p>
            )}
          </div>
        ) : dbDisplayMode === 'cards' ? (
          /* RESPONSIVE CARD VIEW FOR CONNECTED DBS (Mobile/Tablet Friendly) */
          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedLinkedDbs.map((db, idx) => (
              <div
                key={db.id}
                className="border rounded-lg p-3 space-y-2.5 text-xs font-mono bg-slate-50/70 border-slate-200 transition-all duration-150 group"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 text-center font-bold text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={db.code}
                        onChange={(e) => onUpdateDb?.({ ...db, code: e.target.value })}
                        className="font-mono font-bold text-slate-900 text-sm bg-transparent hover:bg-white focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1 py-0.5 w-28 focus:outline-none"
                        title="Click to edit Board Code"
                      />
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold border shrink-0 ${
                          db.isThreePhase
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : (db.phase || 'R') === 'R'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : db.phase === 'Y'
                            ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        {db.isThreePhase ? '3P' : `1P (Phase ${db.phase || 'R'})`}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={db.name}
                      onChange={(e) => onUpdateDb?.({ ...db, name: e.target.value })}
                      placeholder="Board description"
                      className="text-slate-600 font-sans block text-xs w-full bg-transparent hover:bg-white focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1 py-0.5 focus:outline-none"
                      title="Click to edit Board Description"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onNavigateToDb(db.id)}
                      className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors"
                      title="Open DB in Level 1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDuplicateDb?.(db)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 bg-white border border-slate-200 rounded transition-colors"
                      title="Duplicate DB"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteDb?.(db.id)}
                      disabled={dbs.length <= 1}
                      className={`p-1.5 rounded transition-colors bg-white border border-slate-200 ${
                        dbs.length <= 1
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title={dbs.length <= 1 ? 'Cannot delete the only DB' : 'Delete DB'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-white p-2 rounded border border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Connected</span>
                    <span className="font-bold text-slate-900">{db.connectedLoadKW.toFixed(1)} kW</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">MD</span>
                    <span className="font-bold text-amber-700">{db.maximumDemandKW.toFixed(1)} kW</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Current (I)</span>
                    <span className="font-bold text-slate-900">{db.incomerCurrentAmps.toFixed(1)} A</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200 flex justify-between">
                  <span>Feeder: {db.incomerBreaker.description}</span>
                </div>

                {/* Voltage Drop with Upstream Sub-DB Dynamic Hierarchy Validation */}
                {(() => {
                  const validation = getDbVoltageDropValidation(db, currentSubDb);
                  return (
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between items-center flex-wrap gap-1">
                      <span className="truncate max-w-[170px]" title={db.incomerCable}>
                        {db.incomerCable || 'N/A'} ({db.cableLengthMeters ?? 25}m)
                      </span>
                      <div className="flex items-center gap-1 font-mono">
                        <span className="font-semibold text-slate-700">{(db.voltageDropPercent ?? 0).toFixed(2)}%</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-semibold inline-flex items-center gap-0.5 ${
                            validation.status === 'OPTIMAL'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : validation.status === 'ACCEPTABLE'
                              ? 'bg-amber-50 text-amber-700 border border-amber-300'
                              : 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                          }`}
                          title={`Upstream Sub-DB (${currentSubDb.code}): ${(currentSubDb.voltageDropPercent ?? 0).toFixed(2)}% + DB (${db.code}): ${(db.voltageDropPercent ?? 0).toFixed(2)}% = Total ${validation.cumulativeVdPercent.toFixed(2)}% / 4.00% max. Dynamic allowable: ≤ ${validation.allowableLimit.toFixed(2)}%.`}
                        >
                          {validation.status === 'OPTIMAL' ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className={`w-2.5 h-2.5 shrink-0 ${validation.status === 'ACCEPTABLE' ? 'text-amber-600' : 'text-rose-600'}`} />
                          )}
                          <span>{validation.indicatorLabel}</span>
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        ) : (
          /* TABLE VIEW WITH HORIZONTAL SCROLL */
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
                        : 'Click to sort alphabetically by Board Code (A–Z)'
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={feederSortDirection !== 'none' ? 'text-amber-900 font-bold' : ''}>
                        Board Code
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
                  <th className="py-1.5 px-2.5 w-[20%] min-w-[170px]">Description</th>
                  <th className="py-1.5 px-2.5 w-24 text-right">CL (kW)</th>
                  <th className="py-1.5 px-2.5 w-24 text-right font-semibold text-amber-900">
                    MD (kW)
                  </th>
                  <th className="py-1.5 px-2.5 w-24 text-right">MD (kVA)</th>
                  <th className="py-1.5 px-2.5 w-20 text-right">I (A)</th>
                  <th className="py-1.5 px-2.5 min-w-[130px] whitespace-nowrap">Feeder Breaker</th>
                  <th className="py-1.5 px-2.5 w-[24%] min-w-[245px] whitespace-nowrap">Feeder Cable & VD</th>
                  <th className="py-1.5 px-2.5 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {sortedLinkedDbs.map((db, idx) => (
                  <tr
                    key={db.id}
                    draggable={feederSortDirection === 'none' && canDragDbIndex === idx}
                    onDragStart={(e) => handleDbDragStart(e, idx)}
                    onDragOver={(e) => handleDbDragOver(e, idx)}
                    onDragLeave={() => {
                      if (dragOverDbIndex === idx) setDragOverDbIndex(null);
                    }}
                    onDrop={(e) => handleDbDrop(e, idx)}
                    onDragEnd={handleDbDragEnd}
                    className={`transition-all duration-150 group ${
                      draggedDbIndex === idx
                        ? 'opacity-35 bg-amber-50/70 border-2 border-dashed border-amber-400 scale-[0.99]'
                        : dragOverDbIndex === idx
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
                          if (feederSortDirection === 'none') setCanDragDbIndex(idx);
                        }}
                        onMouseUp={() => setCanDragDbIndex(null)}
                        onTouchStart={() => {
                          if (feederSortDirection === 'none') setCanDragDbIndex(idx);
                        }}
                        onTouchEnd={() => setCanDragDbIndex(null)}
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

                    {/* Inline Editable Board Code */}
                    <td className="py-1 px-2.5 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={db.code}
                          onChange={(e) => onUpdateDb?.({ ...db, code: e.target.value })}
                          className="w-24 font-mono font-bold bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none"
                          title="Click to edit Board Code"
                        />
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border shrink-0 ${
                            db.isThreePhase
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : (db.phase || 'R') === 'R'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : db.phase === 'Y'
                              ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {db.isThreePhase ? '3P' : `1P (${db.phase || 'R'})`}
                        </span>
                      </div>
                    </td>

                    {/* Inline Editable Description */}
                    <td className="py-1 px-2.5 font-sans text-slate-700 min-w-[170px]">
                      <input
                        type="text"
                        value={db.name}
                        onChange={(e) => onUpdateDb?.({ ...db, name: e.target.value })}
                        placeholder="Board description / service area"
                        className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
                        title="Click to edit Board Description"
                      />
                    </td>

                    <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                      {db.connectedLoadKW.toFixed(2)}
                    </td>
                    <td className="py-1 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                      {db.maximumDemandKW.toFixed(2)}
                    </td>
                    <td className="py-1 px-2.5 text-right text-slate-700 tabular-nums">
                      {db.maximumDemandKVA.toFixed(2)}
                    </td>
                    <td className="py-1 px-2.5 text-right font-semibold text-slate-800 tabular-nums">
                      {db.incomerCurrentAmps.toFixed(1)}
                    </td>
                    <td className="py-1 px-2.5">
                      <span className="text-slate-800 font-semibold block truncate max-w-[150px]" title={db.incomerBreaker?.description || 'N/A'}>
                        {db.incomerBreaker?.description || 'N/A'}
                      </span>
                    </td>

                    {/* Feeder Cable & Voltage Drop Accounting for Sub-DB Upstream Hierarchy */}
                    <td className="py-1 px-2.5 min-w-[245px]">
                      {(() => {
                        const validation = getDbVoltageDropValidation(db, currentSubDb);
                        return (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800 block truncate max-w-[280px]" title={db.incomerCable}>
                              {db.incomerCable || 'N/A'}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500">
                                {db.cableLengthMeters ?? 25}m · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}%
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold inline-flex items-center gap-0.5 ${
                                  validation.status === 'OPTIMAL'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : validation.status === 'ACCEPTABLE'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-300'
                                    : 'bg-rose-50 text-rose-700 border border-rose-300 font-bold'
                                }`}
                                title={`Upstream Sub-DB (${currentSubDb.code}): ${(currentSubDb.voltageDropPercent ?? 0).toFixed(2)}% + Final DB (${db.code}): ${(db.voltageDropPercent ?? 0).toFixed(2)}% = Total ${validation.cumulativeVdPercent.toFixed(2)}% / 4.00% max. Dynamic allowable: ≤ ${validation.allowableLimit.toFixed(2)}%.`}
                              >
                                {validation.status === 'OPTIMAL' ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <AlertTriangle className={`w-2.5 h-2.5 shrink-0 ${validation.status === 'ACCEPTABLE' ? 'text-amber-600' : 'text-rose-600'}`} />
                                )}
                                <span>{validation.indicatorLabel}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Action Column: [ ➔ ] [ ❐ Duplicate ] [ 🗑️ Delete ] */}
                    <td className="py-1 px-2.5 text-center font-sans">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onNavigateToDb(db.id)}
                          className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                          title="Open DB in Level 1"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDuplicateDb?.(db)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Duplicate DB"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteDb?.(db.id)}
                          disabled={dbs.length <= 1}
                          className={`p-1 rounded transition-colors ${
                            dbs.length <= 1
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={dbs.length <= 1 ? 'Cannot delete the only DB' : 'Delete DB'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};
