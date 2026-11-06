import React from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  GitFork,
  Sparkles,
} from 'lucide-react';
import {
  MainSwitchBoard,
  BusbarMaterial,
  VoltageSystem,
} from '../types/electrical';
import {
  STANDARD_BUSBAR_SIZES,
  calculateBusbarSizing,
  autoSelectBusbar,
} from '../utils/electricalCalculations';
import { NumericInput } from './NumericInput';

interface BusbarSizingModalProps {
  isOpen: boolean;
  onClose: () => void;
  msb: MainSwitchBoard;
  onUpdateMsb: (updated: MainSwitchBoard) => void;
  voltageSystem: VoltageSystem;
}

export const BusbarSizingModal: React.FC<BusbarSizingModalProps> = ({
  isOpen,
  onClose,
  msb,
  onUpdateMsb,
  voltageSystem: _voltageSystem,
}) => {
  if (!isOpen) return null;

  const currentBreakerRating = msb.mainIncomerBreaker?.rating || 100;
  const currentPlantAmps = msb.totalPlantCurrentAmps || 0;

  // Compute live busbar sizing based on current MSB values
  const busbarSizing =
    msb.busbarSizing ||
    calculateBusbarSizing({
      material: msb.busbarMaterial,
      currentDensityJ: msb.busbarCurrentDensity,
      designCurrentId: msb.busbarDesignCurrentId,
      breakerRating: currentBreakerRating,
      totalPlantCurrentAmps: currentPlantAmps,
      shortCircuitCurrentIcwKA: msb.busbarIcwKA,
      faultDurationSec: msb.busbarFaultDuration,
      materialConstantK: msb.busbarMaterialConstantK,
      selectedWidth: msb.busbarSelectedWidth,
      selectedThickness: msb.busbarSelectedThickness,
      selectedRuns: msb.busbarSelectedRuns,
      manualOverride: msb.busbarManualOverride,
    });

  const material = busbarSizing.material;
  const currentDensityJ = busbarSizing.currentDensityJ;
  const designCurrentId = busbarSizing.designCurrentId;
  const IcwKA = busbarSizing.shortCircuitCurrentIcwKA;
  const faultDuration = busbarSizing.faultDurationSec;
  const kConstant = busbarSizing.materialConstantK;

  const selectedWidth = busbarSizing.width;
  const selectedThickness = busbarSizing.thickness;
  const selectedRuns = busbarSizing.runsPerPhase;
  const totalArea = busbarSizing.totalArea;
  const governingRequiredArea = busbarSizing.governingRequiredArea;

  const isCompliant = totalArea >= governingRequiredArea;
  const compliancePercent =
    governingRequiredArea > 0 ? (totalArea / governingRequiredArea) * 100 : 100;

  // Handlers for interactive editing
  const handleMaterialChange = (newMat: BusbarMaterial) => {
    const defaultJ = newMat === 'ALUMINIUM' ? 0.7 : 1.4;
    const defaultK = newMat === 'ALUMINIUM' ? 110 : 143;
    onUpdateMsb({
      ...msb,
      busbarMaterial: newMat,
      busbarCurrentDensity: defaultJ,
      busbarMaterialConstantK: defaultK,
    });
  };

  const handleUpdateParameter = (field: keyof MainSwitchBoard, value: any) => {
    onUpdateMsb({
      ...msb,
      [field]: value,
    });
  };

  const handleSelectBarSize = (width: number, thickness: number) => {
    onUpdateMsb({
      ...msb,
      busbarSelectedWidth: width,
      busbarSelectedThickness: thickness,
      busbarManualOverride: true,
    });
  };

  const handleSelectRuns = (runs: number) => {
    onUpdateMsb({
      ...msb,
      busbarSelectedRuns: runs,
      busbarManualOverride: true,
    });
  };

  const handleAutoSelect = () => {
    const optimal = autoSelectBusbar(governingRequiredArea);
    onUpdateMsb({
      ...msb,
      busbarSelectedWidth: optimal.width,
      busbarSelectedThickness: optimal.thickness,
      busbarSelectedRuns: optimal.runs,
      busbarManualOverride: false,
    });
  };

  const handleResetDefaults = () => {
    onUpdateMsb({
      ...msb,
      busbarMaterial: 'COPPER',
      busbarCurrentDensity: 1.4,
      busbarDesignCurrentId: undefined,
      busbarIcwKA: 65,
      busbarFaultDuration: 1.0,
      busbarMaterialConstantK: 143,
      busbarSelectedWidth: undefined,
      busbarSelectedThickness: undefined,
      busbarSelectedRuns: undefined,
      busbarManualOverride: false,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-3 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-4xl w-full p-3 sm:p-4 shadow-2xl border border-slate-200 space-y-2.5 h-[94vh] max-h-[96vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <GitFork className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Main Switchboard Busbar Sizing & Thermal Withstand Calculator
              </h3>
              <span className="font-mono text-[11px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-semibold">
                {msb.code}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Control Bar: Compact Grid */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 shrink-0">
          <div className="overflow-x-auto pb-0.5">
            <div className="grid grid-cols-6 gap-2.5 items-center text-xs min-w-[620px] lg:min-w-0 w-full">
              {/* 1. Material */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  Mat:
                </span>
                <div className="flex rounded bg-white border border-slate-300 p-0.5 shadow-2xs flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleMaterialChange('COPPER')}
                    className={`flex-1 py-0.5 px-1 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                      material === 'COPPER'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Copper (Cu)"
                  >
                    (Cu)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMaterialChange('ALUMINIUM')}
                    className={`flex-1 py-0.5 px-1 text-[11px] font-semibold rounded transition-colors cursor-pointer text-center ${
                      material === 'ALUMINIUM'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Aluminium (Al)"
                  >
                    (AI)
                  </button>
                </div>
              </div>

              {/* 2. Design Current ID */}
              <div className="flex items-center gap-1 min-w-0">
                <label className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  I<sub>D</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={1}
                    max={10000}
                    step={1}
                    allowDecimals={false}
                    fallbackValue={100}
                    value={designCurrentId}
                    onChange={(val) => handleUpdateParameter('busbarDesignCurrentId', val)}
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 pr-3.5"
                    aria-label="Design Current ID"
                  />
                  <span className="absolute right-1 top-0.5 text-[10px] text-slate-400 font-mono pointer-events-none">
                    A
                  </span>
                </div>
                {msb.busbarDesignCurrentId !== undefined && (
                  <button
                    type="button"
                    onClick={() => handleUpdateParameter('busbarDesignCurrentId', undefined)}
                    className="text-[9px] text-amber-700 hover:underline cursor-pointer shrink-0"
                    title="Reset to incomer breaker rating"
                  >
                    ↺
                  </button>
                )}
              </div>

              {/* 3. Target Current Density J */}
              <div className="flex items-center gap-1 min-w-0">
                <label className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  J:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={0.1}
                    max={5.0}
                    step={0.05}
                    allowDecimals={true}
                    fallbackValue={1.4}
                    value={currentDensityJ}
                    onChange={(val) => handleUpdateParameter('busbarCurrentDensity', val)}
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 pr-8"
                    aria-label="Current Density J"
                  />
                  <span className="absolute right-1 top-0.5 text-[9px] text-slate-400 font-mono pointer-events-none">
                    A/mm²
                  </span>
                </div>
              </div>

              {/* 4. Prospective RMS Fault Current Icw */}
              <div className="flex items-center gap-1 min-w-0">
                <label className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  I<sub>cw</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={1}
                    max={200}
                    step={5}
                    allowDecimals={false}
                    fallbackValue={65}
                    value={IcwKA}
                    onChange={(val) => handleUpdateParameter('busbarIcwKA', val)}
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 pr-5"
                    aria-label="Short Circuit Current Icw"
                  />
                  <span className="absolute right-1 top-0.5 text-[10px] text-slate-400 font-mono pointer-events-none">
                    kA
                  </span>
                </div>
              </div>

              {/* 5. Fault Duration t */}
              <div className="flex items-center gap-1 min-w-0">
                <label className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  t:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={0.05}
                    max={5.0}
                    step={0.1}
                    allowDecimals={true}
                    fallbackValue={1.0}
                    value={faultDuration}
                    onChange={(val) => handleUpdateParameter('busbarFaultDuration', val)}
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500 pr-3.5"
                    aria-label="Fault Duration t"
                  />
                  <span className="absolute right-1 top-0.5 text-[10px] text-slate-400 font-mono pointer-events-none">
                    s
                  </span>
                </div>
              </div>

              {/* 6. Material Constant k */}
              <div className="flex items-center gap-1 min-w-0">
                <label className="text-slate-600 font-medium text-[11px] whitespace-nowrap shrink-0">
                  k:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={10}
                    max={300}
                    step={1}
                    allowDecimals={false}
                    fallbackValue={143}
                    value={kConstant}
                    onChange={(val) => handleUpdateParameter('busbarMaterialConstantK', val)}
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 text-xs focus:ring-1 focus:ring-amber-500"
                    aria-label="Material Constant k"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Center Body */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 min-h-0">
          {/* Streamlined Calculation Step Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            {/* Step 1: Continuous Ampacity */}
            <div
              className={`p-2 rounded-lg border text-xs transition-colors ${
                busbarSizing.governingCriterion === 'CONTINUOUS_AMPACITY'
                  ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300/60'
                  : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Step 1: Continuous Ampacity
                </span>
                {busbarSizing.governingCriterion === 'CONTINUOUS_AMPACITY' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-slate-950">
                    Governing
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between font-mono gap-1 text-[11px]">
                <div className="flex items-baseline gap-1 truncate pr-1">
                  <span className="text-slate-700 font-medium whitespace-nowrap">
                    A<sub>req</sub> = I<sub>D</sub> / J
                  </span>
                  <span className="text-slate-400">=</span>
                  <span className="text-slate-500 truncate">
                    ({designCurrentId} A / {currentDensityJ} A/mm²)
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-900 shrink-0 whitespace-nowrap">
                  = {busbarSizing.initialRequiredAreaAreq.toFixed(1)} mm²
                </span>
              </div>
            </div>

            {/* Step 2: Thermal Short-Circuit Withstand */}
            <div
              className={`p-2 rounded-lg border text-xs transition-colors ${
                busbarSizing.governingCriterion === 'SHORT_CIRCUIT_WITHSTAND'
                  ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300/60'
                  : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Step 2: Thermal Withstand (I<sub>cw</sub>)
                </span>
                {busbarSizing.governingCriterion === 'SHORT_CIRCUIT_WITHSTAND' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-slate-950">
                    Governing
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between font-mono gap-1 text-[11px]">
                <div className="flex items-baseline gap-1 truncate pr-1">
                  <span className="text-slate-700 font-medium whitespace-nowrap">
                    A<sub>min</sub> ≥ (I<sub>cw</sub>√t) / k
                  </span>
                  <span className="text-slate-400">=</span>
                  <span className="text-slate-500 truncate">
                    ({IcwKA * 1000} A × √{faultDuration}s / {kConstant})
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-900 shrink-0 whitespace-nowrap">
                  = {busbarSizing.minimumWithstandAreaAmin.toFixed(1)} mm²
                </span>
              </div>
            </div>
          </div>

          {/* Compact Selected Configuration Card */}
          <div className="bg-white border border-amber-400/90 rounded-lg px-2.5 py-1.5 shadow-2xs space-y-1 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold font-mono text-slate-900 whitespace-nowrap">
                    Busbar: {busbarSizing.formattedDescription}
                  </span>
                  <span className="text-[11px] text-slate-500 hidden md:inline">
                    ({material === 'COPPER' ? 'Cu' : 'Al'} · {selectedRuns}× {selectedWidth}×{selectedThickness}mm)
                  </span>
                </div>

                {/* Inlined Parallel Bars Buttons */}
                <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-slate-200">
                  <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">
                    Runs/Phase:
                  </span>
                  <div className="flex rounded bg-slate-100 p-0.5 border border-slate-200">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleSelectRuns(n)}
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                          selectedRuns === n
                            ? 'bg-amber-500 text-slate-950 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {n}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Badge & Auto-Select Button */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <div
                  className={`px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 ${
                    isCompliant
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-50 text-rose-800 border border-rose-300'
                  }`}
                >
                  {isCompliant ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Compliant ({compliancePercent.toFixed(0)}%)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>
                        Undersized ({(governingRequiredArea - totalArea).toFixed(0)} mm² deficit)
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAutoSelect}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-2xs transition-colors cursor-pointer shrink-0"
                  title="Automatically select optimal standard size from reference table"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Select</span>
                </button>
              </div>
            </div>

            {/* Compact Performance Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 border-t border-slate-100/90 text-[11px] font-mono">
              <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Total Area:</span>
                <span className="font-bold text-slate-900">{totalArea} mm²</span>
              </div>
              <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Cap. (I<sub>z</sub>):</span>
                <span className="font-bold text-slate-900">
                  {busbarSizing.continuousCurrentCapacity.toFixed(0)} A
                  <span className="text-[10px] text-slate-400 ml-1">(≥{designCurrentId}A)</span>
                </span>
              </div>
              <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">I<sub>cw</sub> (1s):</span>
                <span className="font-bold text-slate-900">
                  {busbarSizing.thermalWithstandCapacityKA.toFixed(1)} kA
                  <span className="text-[10px] text-slate-400 ml-1">(≥{IcwKA}kA)</span>
                </span>
              </div>
              <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Target I<sub>D</sub>:</span>
                <span className="font-bold text-slate-900">{designCurrentId} A</span>
              </div>
            </div>
          </div>

          {/* Interactive Standard Busbar Reference Table: High Density */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                Standard Busbar Reference Table
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Showing total area for <span className="font-bold text-slate-800">{selectedRuns}×</span> runs per phase
              </span>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono sticky top-0 z-10 text-[11px]">
                    <tr>
                      <th className="py-1.5 px-2.5 font-semibold">Size (W × T)</th>
                      <th className="py-1.5 px-2.5 font-semibold text-right">Single Area</th>
                      <th className="py-1.5 px-2.5 font-semibold text-right">
                        Total Area ({selectedRuns}×)
                      </th>
                      <th className="py-1.5 px-2.5 font-semibold text-right">Ampacity (I<sub>z</sub>)</th>
                      <th className="py-1.5 px-2.5 font-semibold text-right">Withstand (I<sub>cw</sub>)</th>
                      <th className="py-1.5 px-2.5 font-semibold text-center">Status</th>
                      <th className="py-1.5 px-2.5 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {STANDARD_BUSBAR_SIZES.map((size) => {
                      const rowTotalArea = selectedRuns * size.area;
                      const rowAmpacity = rowTotalArea * currentDensityJ;
                      const rowWithstandKA =
                        (rowTotalArea * kConstant) / (Math.sqrt(faultDuration) * 1000);
                      const rowMeetsRequirement = rowTotalArea >= governingRequiredArea;
                      const isSelected =
                        selectedWidth === size.width && selectedThickness === size.thickness;

                      return (
                        <tr
                          key={`${size.width}x${size.thickness}`}
                          onClick={() => handleSelectBarSize(size.width, size.thickness)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-50 hover:bg-amber-100/80 font-bold'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-1 px-2.5 text-slate-900 font-medium">
                            <div className="flex items-center gap-1.5">
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              )}
                              <span>
                                {size.width} × {size.thickness} mm
                              </span>
                            </div>
                          </td>
                          <td className="py-1 px-2.5 text-right text-slate-600">
                            {size.area} mm²
                          </td>
                          <td className="py-1 px-2.5 text-right font-bold text-slate-900">
                            {rowTotalArea} mm²
                          </td>
                          <td className="py-1 px-2.5 text-right text-slate-700">
                            {rowAmpacity.toFixed(0)} A
                          </td>
                          <td className="py-1 px-2.5 text-right text-slate-700">
                            {rowWithstandKA.toFixed(1)} kA
                          </td>
                          <td className="py-1 px-2.5 text-center">
                            {rowMeetsRequirement ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Pass</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] text-slate-400 bg-slate-50 px-1 py-0.2 rounded">
                                <span>Undersized</span>
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-2.5 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectBarSize(size.width, size.thickness);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isSelected ? 'Active' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              Selected: <strong className="text-slate-800">{busbarSizing.formattedDescription}</strong>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
            >
              Done & Apply to MSB
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
