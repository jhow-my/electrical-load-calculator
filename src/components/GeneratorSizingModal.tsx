import React from 'react';
import {
  X,
  Flame,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Info,
  Layers,
  ChevronRight,
  Zap,
} from 'lucide-react';
import {
  MainSwitchBoard,
  SubDistributionBoard,
  DistributionBoard,
  MsbDirectLoad,
  VoltageSystem,
  GeneratorSizingScope,
} from '../types/electrical';
import {
  STANDARD_GENERATOR_KVA,
  getStepGeneratorSize,
  getGeneratorScopeLabel,
} from '../utils/electricalCalculations';

interface GeneratorSizingModalProps {
  isOpen: boolean;
  onClose: () => void;
  msb: MainSwitchBoard;
  onUpdateMsb: (updated: MainSwitchBoard) => void;
  subDbs?: SubDistributionBoard[];
  dbs?: DistributionBoard[];
  directLoads?: MsbDirectLoad[];
  voltageSystem: VoltageSystem;
}

export const GeneratorSizingModal: React.FC<GeneratorSizingModalProps> = ({
  isOpen,
  onClose,
  msb,
  onUpdateMsb,
  subDbs = [],
  dbs = [],
  directLoads = [],
  voltageSystem,
}) => {
  if (!isOpen) return null;

  const gen = msb.generatorSizing;
  const rawScope = msb.generatorSizingScope || 'FIRE_LIFT_SAFETY_AND_ESSENTIAL';
  const scope: GeneratorSizingScope =
    rawScope === 'ESSENTIAL_LOADS_ONLY' ? 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' : rawScope;

  const fireLiftKVA = gen?.fireLiftSafetyDemandKVA ?? 0;
  const fireLiftKW = gen?.fireLiftSafetyDemandKW ?? 0;
  const essentialOnlyKVA = gen?.essentialOnlyDemandKVA ?? 0;
  const essentialOnlyKW = gen?.essentialOnlyDemandKW ?? 0;
  const combinedEssentialKVA = gen?.essentialDemandKVA ?? (fireLiftKVA + essentialOnlyKVA);
  const combinedEssentialKW = gen?.essentialDemandKW ?? (fireLiftKW + essentialOnlyKW);
  const totalPlantKVA = gen?.totalPlantDemandKVA ?? 0;
  const totalPlantKW = gen?.totalPlantDemandKW ?? 0;

  let basisKVA = combinedEssentialKVA;
  let basisKW = combinedEssentialKW;
  let scopeShortName = 'Fire Lift-Safety + Essential';

  if (scope === 'FIRE_LIFT_SAFETY_ONLY') {
    basisKVA = fireLiftKVA;
    basisKW = fireLiftKW;
    scopeShortName = 'Fire Lift-Safety Load ONLY';
  } else if (scope === 'ESSENTIAL_ONLY') {
    basisKVA = essentialOnlyKVA;
    basisKW = essentialOnlyKW;
    scopeShortName = 'Essential Load ONLY';
  } else if (scope === 'FULL_PLANT') {
    basisKVA = totalPlantKVA;
    basisKW = totalPlantKW;
    scopeShortName = '100% Full Plant Standby';
  }

  const requiredPrimeKVA = basisKVA * 1.25;
  const primeKVA = gen?.recommendedPrimeKVA ?? 0;
  const standbyKVA = gen?.recommendedStandbyKVA ?? Math.round(primeKVA * 1.1);
  const loadingPct = gen?.loadingPercent ?? (primeKVA > 0 ? (basisKVA / primeKVA) * 100 : 0);
  const flcAmps =
    gen?.fullLoadCurrentAmps ??
    (primeKVA > 0 ? (primeKVA * 1000) / (Math.sqrt(3) * voltageSystem.Vll) : 0);

  // Contributing feeders categorized
  const assignedSubDbs = subDbs.filter((sb) => (sb.msbId || 'msb-main') === msb.id);
  const assignedDirectDbs = dbs.filter(
    (db) =>
      db.subDbId === msb.id ||
      db.subDbId === msb.code ||
      db.subDbId === 'MSB' ||
      db.subDbId === 'msb'
  );
  const assignedMajorLoads = directLoads.filter(
    (l) => (l.msbId || 'msb-main') === msb.id
  );

  const isLoadActiveInScope = (type: 'FIRE_LIFT_SAFETY' | 'ESSENTIAL' | 'NORMAL') => {
    if (scope === 'FULL_PLANT') return true;
    if (scope === 'FIRE_LIFT_SAFETY_ONLY') return type === 'FIRE_LIFT_SAFETY';
    if (scope === 'ESSENTIAL_ONLY') return type === 'ESSENTIAL';
    // Scope A: FIRE_LIFT_SAFETY_AND_ESSENTIAL
    return type === 'FIRE_LIFT_SAFETY' || type === 'ESSENTIAL';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Emergency Diesel Generator Sizing & Formula Engineering
                </h3>
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">
                  {msb.code}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Standards: ISO 8528 / IEC 60034 / NFPA 110 Multi-Scope Generator Engineering
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close dialog"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          {/* Key Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-500 mb-1 truncate" title={scopeShortName}>
                Basis Demand ({scopeShortName.split(':')[0]})
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                {basisKVA.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-500">kVA</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {basisKW.toFixed(1)} kW
              </div>
            </div>

            <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200">
              <div className="text-[11px] font-medium text-amber-800 mb-1">
                Motor Inrush Headroom
              </div>
              <div className="text-lg font-bold text-amber-900 font-mono">
                +25% <span className="text-xs font-normal text-amber-700">(1.25×)</span>
              </div>
              <div className="text-[11px] text-amber-700 font-mono">
                Req: {requiredPrimeKVA.toFixed(1)} kVA
              </div>
            </div>

            <div className="bg-rose-50/80 rounded-xl p-3 border border-rose-200">
              <div className="text-[11px] font-medium text-rose-800 mb-1">
                Recommended Rating
              </div>
              <div className="text-lg font-bold text-rose-700 font-mono">
                {primeKVA}{' '}
                <span className="text-xs font-normal text-rose-600">kVA Prime</span>
              </div>
              <div className="text-[11px] text-rose-600 font-mono">
                Standby: {standbyKVA} kVA (110%)
              </div>
            </div>

            <div className="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200">
              <div className="text-[11px] font-medium text-emerald-800 mb-1">
                Operating Load & FLC
              </div>
              <div className="text-lg font-bold text-emerald-700 font-mono">
                {loadingPct.toFixed(1)}%
              </div>
              <div className="text-[11px] text-emerald-600 font-mono">
                FLC: {flcAmps.toFixed(1)} A @ {voltageSystem.Vll}V
              </div>
            </div>
          </div>

          {/* Quick Scope & Adjustment Toolbar with 4 scopes */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-500" />
                Select Generator Sizing Scope:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">Manual Size Stepping:</span>
                <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => {
                      const next = getStepGeneratorSize(primeKVA, 'DOWN');
                      if (next) onUpdateMsb({ ...msb, manualGeneratorKVA: next });
                    }}
                    disabled={!getStepGeneratorSize(primeKVA, 'DOWN')}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 text-xs font-bold cursor-pointer"
                    title="Step down generator rating"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold text-slate-900 px-1 text-xs">
                    {primeKVA} kVA
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = getStepGeneratorSize(primeKVA, 'UP');
                      if (next) onUpdateMsb({ ...msb, manualGeneratorKVA: next });
                    }}
                    disabled={!getStepGeneratorSize(primeKVA, 'UP')}
                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 disabled:opacity-30 text-xs font-bold cursor-pointer"
                    title="Step up generator rating"
                  >
                    +
                  </button>
                </div>

                {msb.manualGeneratorKVA !== undefined && (
                  <button
                    type="button"
                    onClick={() => onUpdateMsb({ ...msb, manualGeneratorKVA: undefined })}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded border border-amber-300 transition-colors cursor-pointer"
                    title="Reset to auto-calculated standard rating"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* 4 Scope Selector Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateMsb({ ...msb, generatorSizingScope: 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' })
                }
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'FIRE_LIFT_SAFETY_AND_ESSENTIAL'
                    ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                    : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>Fire Lift-Safety + Essential</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    scope === 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {combinedEssentialKVA.toFixed(1)} kVA
                  </span>
                </div>
                <div className="text-[10px] mt-1 opacity-80 leading-tight">
                  Life safety, fire pumps, lifts & emergency power.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateMsb({ ...msb, generatorSizingScope: 'FIRE_LIFT_SAFETY_ONLY' })
                }
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'FIRE_LIFT_SAFETY_ONLY'
                    ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                    : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>Fire Lift-Safety Load ONLY</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    scope === 'FIRE_LIFT_SAFETY_ONLY' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {fireLiftKVA.toFixed(1)} kVA
                  </span>
                </div>
                <div className="text-[10px] mt-1 opacity-80 leading-tight">
                  Strictly designated fire pumps, smoke extract & fire lifts.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateMsb({ ...msb, generatorSizingScope: 'ESSENTIAL_ONLY' })
                }
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'ESSENTIAL_ONLY'
                    ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                    : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>Essential Load ONLY</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    scope === 'ESSENTIAL_ONLY' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {essentialOnlyKVA.toFixed(1)} kVA
                  </span>
                </div>
                <div className="text-[10px] mt-1 opacity-80 leading-tight">
                  Critical business loads, server rooms & emergency lighting.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateMsb({ ...msb, generatorSizingScope: 'FULL_PLANT' })
                }
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'FULL_PLANT'
                    ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                    : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>100% Full Plant Standby</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    scope === 'FULL_PLANT' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {totalPlantKVA.toFixed(1)} kVA
                  </span>
                </div>
                <div className="text-[10px] mt-1 opacity-80 leading-tight">
                  Full building backup including regular distribution boards.
                </div>
              </button>
            </div>
          </div>

          {/* Mathematical Formula Step-by-Step Breakdown */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" />
              Generator Sizing Calculation Formula & Step Breakdown
            </h4>

            {/* Step 1 */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Step 1: Determine Demand Basis (S_basis) across Scopes
                </span>
                <span className="font-mono text-[11px] bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded font-semibold">
                  Active: {getGeneratorScopeLabel(scope)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 text-[11px] space-y-1.5">
                <div className={scope === 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                  • Fire Lift-Safety + Essential: <code>S_basis = Σ(Fire Lift-Safety) + Σ(Essential) = {combinedEssentialKVA.toFixed(2)} kVA</code>
                </div>
                <div className={scope === 'FIRE_LIFT_SAFETY_ONLY' ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                  • Fire Lift-Safety Load ONLY: <code>S_basis = Σ(Fire Lift-Safety Loads) = {fireLiftKVA.toFixed(2)} kVA</code>
                </div>
                <div className={scope === 'ESSENTIAL_ONLY' ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                  • Essential Load ONLY: <code>S_basis = Σ(Essential Standby Loads) = {essentialOnlyKVA.toFixed(2)} kVA</code>
                </div>
                <div className={scope === 'FULL_PLANT' ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                  • 100% Full Plant Standby: <code>S_basis = Plant Maximum Demand = {totalPlantKVA.toFixed(2)} kVA</code>
                </div>
              </div>
              <div className="text-slate-700 font-medium text-xs">
                Active Calculation Basis: <span className="font-mono font-bold text-rose-700">{basisKVA.toFixed(2)} kVA</span> ({basisKW.toFixed(2)} kW)
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Step 2: Motor Starting Inrush & Headroom Margin (+25% / 1.25×)
                </span>
                <span className="font-mono text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">
                  ISO 8528 / NFPA 110 Headroom
                </span>
              </div>
              <p className="text-slate-600 text-xs">
                A 25% safety margin is applied to the basis demand to accommodate motor direct-on-line (DOL)
                and star-delta starting inrush currents, alternator transient reactance ($X''d$), and step-load
                voltage dip limitations (maximum 15–20% instantaneous dip).
              </p>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 text-[11px]">
                <code>S_required = S_basis × 1.25 = {basisKVA.toFixed(2)} × 1.25 = </code>
                <span className="font-bold text-amber-700">{requiredPrimeKVA.toFixed(2)} kVA</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Step 3: Commercial Prime Rating Selection from Standard kVA Ratings
                </span>
                <span className="font-mono text-[11px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-semibold">
                  Standard Generator Sizes
                </span>
              </div>
              <p className="text-slate-600 text-xs">
                The generator is selected as the next available standard prime commercial rating matching or exceeding
                <code>S_required</code>:
              </p>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 text-[11px]">
                <code>Recommended Prime Rating = min&#123; r ∈ STANDARD_RATINGS | r ≥ S_required &#125;</code>
                <div className="mt-1 font-semibold text-rose-700">
                  Selected Prime Rating = {primeKVA} kVA
                  {msb.manualGeneratorKVA !== undefined && ' (Manually Adjusted)'}
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Standard Commercial Series (kVA):{' '}
                <span className="font-mono">
                  {STANDARD_GENERATOR_KVA.map((val) => (
                    <span
                      key={val}
                      className={`inline-block px-1 py-0.5 mx-0.5 rounded text-[10px] ${
                        val === primeKVA
                          ? 'bg-rose-600 text-white font-bold'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {val}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Step 4 & 5 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="font-bold text-slate-800 text-xs block">
                  Step 4: Standby Rating Derivation (ESP)
                </span>
                <p className="text-slate-600 text-[11px]">
                  Emergency Standby Power (ESP) per ISO 8528 allows 10% overload above Prime Power rating for
                  emergency utility interruption service:
                </p>
                <div className="bg-white p-2 rounded border border-slate-200 font-mono text-slate-800 text-[11px]">
                  <code>S_standby = round(S_prime × 1.10) = </code>
                  <span className="font-bold text-slate-900">{standbyKVA} kVA</span>
                </div>
              </div>

              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="font-bold text-slate-800 text-xs block">
                  Step 5: Full Load Current (I_FLC) & Operating Loading
                </span>
                <p className="text-slate-600 text-[11px]">
                  Calculates 3-phase line current at line-to-line voltage ({voltageSystem.Vll}V) and steady-state load percentage:
                </p>
                <div className="bg-white p-2 rounded border border-slate-200 font-mono text-slate-800 text-[11px] space-y-0.5">
                  <div>
                    <code>I_FLC = (kVA × 1000) / (√3 × {voltageSystem.Vll}V) = </code>
                    <span className="font-bold text-emerald-700">{flcAmps.toFixed(1)} A</span>
                  </div>
                  <div>
                    <code>Loading = ({basisKVA.toFixed(1)} / {primeKVA}) × 100% = </code>
                    <span className="font-bold text-emerald-700">{loadingPct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Feeders Status Under Current Scope */}
          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-white">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Downstream Feeders Classification for Generator
              </span>
              <span className="text-[11px] text-slate-500">
                Filtered and highlighted for {scopeShortName}
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
              {assignedSubDbs.map((sb) => {
                const gensetType = sb.essentialGenset || 'NORMAL';
                const active = isLoadActiveInScope(gensetType);
                return (
                  <div
                    key={sb.id}
                    className={`p-2 flex items-center justify-between text-xs transition-colors ${
                      active ? 'bg-rose-50/40' : 'bg-slate-50/20 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{sb.code || sb.name}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                        gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'bg-rose-100 text-rose-700'
                          : gensetType === 'ESSENTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'Fire & Lift Safety'
                          : gensetType === 'ESSENTIAL'
                          ? 'Essential'
                          : 'Normal'}
                      </span>
                      {active && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          ✓ Included in {scope.split('_')[0]}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-slate-700">
                      {sb.maximumDemandKVA.toFixed(1)} kVA / {sb.maximumDemandKW.toFixed(1)} kW
                    </div>
                  </div>
                );
              })}

              {assignedDirectDbs.map((db) => {
                const gensetType = db.essentialGenset || 'NORMAL';
                const active = isLoadActiveInScope(gensetType);
                return (
                  <div
                    key={db.id}
                    className={`p-2 flex items-center justify-between text-xs transition-colors ${
                      active ? 'bg-rose-50/40' : 'bg-slate-50/20 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{db.code || db.name}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                        gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'bg-rose-100 text-rose-700'
                          : gensetType === 'ESSENTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'Fire & Lift Safety'
                          : gensetType === 'ESSENTIAL'
                          ? 'Essential'
                          : 'Normal'}
                      </span>
                      {active && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          ✓ Included in {scope.split('_')[0]}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-slate-700">
                      {db.maximumDemandKVA.toFixed(1)} kVA / {db.maximumDemandKW.toFixed(1)} kW
                    </div>
                  </div>
                );
              })}

              {assignedMajorLoads.map((l) => {
                const gensetType: 'FIRE_LIFT_SAFETY' | 'ESSENTIAL' | 'NORMAL' = !l.isEssential
                  ? 'NORMAL'
                  : l.equipmentType === 'FIRE_PUMP' || l.equipmentType === 'ELEVATOR'
                  ? 'FIRE_LIFT_SAFETY'
                  : 'ESSENTIAL';
                const active = isLoadActiveInScope(gensetType);
                return (
                  <div
                    key={l.id}
                    className={`p-2 flex items-center justify-between text-xs transition-colors ${
                      active ? 'bg-rose-50/40' : 'bg-slate-50/20 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{l.name || l.code}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                        gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'bg-rose-100 text-rose-700'
                          : gensetType === 'ESSENTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {gensetType === 'FIRE_LIFT_SAFETY'
                          ? 'Fire & Lift Safety Major Load'
                          : gensetType === 'ESSENTIAL'
                          ? 'Essential Major Load'
                          : 'Normal Major Load'}
                      </span>
                      {active && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          ✓ Included
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-slate-700">
                      {l.maximumDemandKVA.toFixed(1)} kVA / {l.maximumDemandKW.toFixed(1)} kW
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>To tag Sub-DBs or DBs with Genset categories, click the Genset column in their respective tables.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
          >
            Close Sizing Sheet
          </button>
        </div>
      </div>
    </div>
  );
};
