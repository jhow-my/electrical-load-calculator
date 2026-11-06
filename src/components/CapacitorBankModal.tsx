import React from 'react';
import {
  X,
  BatteryCharging,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { MainSwitchBoard } from '../types/electrical';
import { autoConfigureCapacitorSteps } from '../utils/electricalCalculations';
import { NumericInput } from './NumericInput';

interface CapacitorBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  msb: MainSwitchBoard;
  onUpdateMsb: (updated: MainSwitchBoard) => void;
}

export const CapacitorBankModal: React.FC<CapacitorBankModalProps> = ({
  isOpen,
  onClose,
  msb,
  onUpdateMsb,
}) => {
  if (!isOpen) return null;

  const cap = msb.capacitorBankSizing;
  const vSupply = msb.vSupply ?? 420;
  const vRated = msb.vRated ?? 525;
  const stepsCount = msb.capacitorStepsCount ?? 12;
  const initialPF = msb.initialPowerFactor ?? 0.80;
  const targetPF = msb.targetPowerFactor ?? 0.99;

  // Step quantity update handler
  const handleUpdateStepQty = (sizeKVAr: number, newQty: number) => {
    const qty = Math.max(0, Math.min(32, newQty));
    const currentSteps = cap?.steps || [];
    const updated = currentSteps.map((s) =>
      s.sizeKVAr === sizeKVAr ? { sizeKVAr: s.sizeKVAr, quantity: qty } : { sizeKVAr: s.sizeKVAr, quantity: s.quantity }
    );
    onUpdateMsb({
      ...msb,
      customCapacitorSteps: updated,
    });
  };

  // Reset to auto-configured steps
  const handleAutoConfigure = () => {
    const autoAllocations = autoConfigureCapacitorSteps(
      cap?.requiredKVArRated || 0,
      stepsCount
    );
    onUpdateMsb({
      ...msb,
      customCapacitorSteps: autoAllocations,
    });
  };

  const isCovered = (cap?.totalConfiguredKVArRated || 0) >= (cap?.requiredKVArRated || 0) * 0.98;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  PFC Capacitor Bank Engineering & Step Sizing
                </h3>
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">
                  {msb.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                IEC 60831 & BS 7671 Automatic Step Ladder (5, 10, 20, 40, 80, 160, 320, 640 kVAr)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar: Vsupply, Vrated, APFC Steps, Initial PF, Target PF in a single horizontal row */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shrink-0">
          <div className="overflow-x-auto pb-0.5">
            <div className="grid grid-cols-5 gap-2.5 items-center text-xs min-w-[700px] sm:min-w-0">
              {/* 1. Vsupply */}
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-slate-700 font-medium whitespace-nowrap text-xs shrink-0">
                  V<sub>supply</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={100}
                    max={1000}
                    step={5}
                    allowDecimals={false}
                    fallbackValue={420}
                    value={vSupply}
                    onChange={(val) =>
                      onUpdateMsb({
                        ...msb,
                        vSupply: val,
                      })
                    }
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 pr-5"
                    aria-label="Vsupply voltage in Volts"
                  />
                  <span className="absolute right-1.5 top-1 text-[11px] text-slate-400 font-mono pointer-events-none">
                    V
                  </span>
                </div>
              </div>

              {/* 2. Vrated */}
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-slate-700 font-medium whitespace-nowrap text-xs shrink-0">
                  V<sub>rated</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={100}
                    max={1000}
                    step={5}
                    allowDecimals={false}
                    fallbackValue={525}
                    value={vRated}
                    onChange={(val) =>
                      onUpdateMsb({
                        ...msb,
                        vRated: val,
                      })
                    }
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 pr-5"
                    aria-label="Vrated voltage in Volts"
                  />
                  <span className="absolute right-1.5 top-1 text-[11px] text-slate-400 font-mono pointer-events-none">
                    V
                  </span>
                </div>
              </div>

              {/* 3. APFC Steps */}
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-slate-700 font-medium whitespace-nowrap text-xs shrink-0">
                  APFC Steps:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={1}
                    max={32}
                    step={1}
                    allowDecimals={false}
                    fallbackValue={12}
                    value={stepsCount}
                    onChange={(val) =>
                      onUpdateMsb({
                        ...msb,
                        capacitorStepsCount: val,
                      })
                    }
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 pr-8"
                    aria-label="APFC Steps Count"
                  />
                  <span className="absolute right-1.5 top-1 text-[11px] text-slate-400 font-mono pointer-events-none">
                    steps
                  </span>
                </div>
              </div>

              {/* 4. Initial PF */}
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-slate-700 font-medium whitespace-nowrap text-xs shrink-0" title="Initial Power Factor">
                  PF<sub>initial</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={0.50}
                    max={0.99}
                    step={0.01}
                    allowDecimals={true}
                    fallbackValue={0.80}
                    value={initialPF}
                    onChange={(val) =>
                      onUpdateMsb({
                        ...msb,
                        initialPowerFactor: val,
                      })
                    }
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                    aria-label="Initial Power Factor PFinitial"
                  />
                </div>
              </div>

              {/* 5. Target PF */}
              <div className="flex items-center gap-1.5 min-w-0">
                <label className="text-slate-700 font-medium whitespace-nowrap text-xs shrink-0" title="Target Power Factor">
                  PF<sub>target</sub>:
                </label>
                <div className="relative flex-1 min-w-0">
                  <NumericInput
                    min={0.70}
                    max={1.00}
                    step={0.01}
                    allowDecimals={true}
                    fallbackValue={0.99}
                    value={targetPF}
                    onChange={(val) =>
                      onUpdateMsb({
                        ...msb,
                        targetPowerFactor: val,
                      })
                    }
                    className="w-full font-mono font-semibold bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
                    aria-label="Target Power Factor PFtarget"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-3 flex-wrap text-slate-700">
              <span>
                Required Q @ {vSupply}V:{' '}
                <strong className="text-slate-900">{cap?.requiredKVArSupply.toFixed(1)} kVAr</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Ratio (V<sub>sup</sub>/V<sub>rat</sub>)<sup>2</sup>:{' '}
                <strong className="text-blue-700">{cap?.ratio.toFixed(2)}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Required Q @ {vRated}V:{' '}
                <strong className="text-amber-700">{cap?.requiredKVArRated.toFixed(1)} kVAr</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                  isCovered
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {isCovered ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {cap?.totalConfiguredKVArRated} kVAr Configured
              </span>
              <button
                type="button"
                onClick={handleAutoConfigure}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="Automatically configure optimal 5..320 kVAr step ladder based on APFC controller steps"
              >
                <RotateCcw className="w-3 h-3 text-blue-600" />
                Auto-Configure
              </button>
            </div>
          </div>
        </div>

        {/* Section Header: Capacitor Steps & MCCB Sizing Table */}
        <div className="flex items-center gap-2 border-b border-slate-200 shrink-0">
          <div className="px-3 py-2 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center gap-1.5">
            <BatteryCharging className="w-3.5 h-3.5" />
            <span>Capacitor Steps & MCCB Sizing Table</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-4">
            {/* Step Schedule Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-28 text-center">Qty</th>
                    <th className="py-2.5 px-4 text-right">
                      Cap. Size Q <span className="text-[10px] text-slate-500 font-normal">(@{vRated}V)</span>
                    </th>
                    <th className="py-2.5 px-4 text-right">
                      Effective Q <span className="text-[10px] text-slate-500 font-normal">(@{vSupply}V)</span>
                    </th>
                    <th className="py-2.5 px-4 text-right font-semibold text-slate-900">
                      Total Q <span className="text-[10px] text-slate-500 font-normal">(@{vRated}V)</span>
                    </th>
                    <th className="py-2.5 px-4 text-right text-slate-700">
                      Operating Current <span className="text-[10px] text-slate-500 font-normal">(1.5× FLC)</span>
                    </th>
                    <th className="py-2.5 px-4 text-center font-semibold text-blue-900">
                      Proposed MCCB
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {cap?.steps.map((step, idx) => (
                    <tr
                      key={step.sizeKVAr}
                      className={`transition-colors ${
                        step.quantity > 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/50 text-slate-400'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                      {/* Qty with increment/decrement buttons */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center border border-slate-300 rounded bg-white overflow-hidden shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleUpdateStepQty(step.sizeKVAr, step.quantity - 1)}
                            disabled={step.quantity <= 0}
                            className="px-2 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="32"
                            value={step.quantity}
                            onChange={(e) =>
                              handleUpdateStepQty(step.sizeKVAr, parseInt(e.target.value) || 0)
                            }
                            className="w-10 text-center font-bold text-slate-900 text-xs py-0.5 border-x border-slate-200 focus:outline-none no-spinner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateStepQty(step.sizeKVAr, step.quantity + 1)}
                            className="px-2 py-0.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                        {step.sizeKVAr} kVAr
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600">
                        {step.quantity > 0
                          ? `${(step.sizeKVAr * cap.ratio).toFixed(1)} kVAr`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-amber-700">
                        {step.quantity > 0 ? `${step.totalKVArRated} kVAr` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-700">
                        {step.quantity > 0 ? `${step.operatingCurrentAmps.toFixed(2)} A` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {step.quantity > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded font-bold text-blue-900 bg-blue-100 border border-blue-200">
                            {step.proposedMCCBRating} A
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals & Main Breaker Row */}
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={2} className="py-3 px-3 text-center">
                      Total: {cap?.totalConfiguredSteps} / {stepsCount} Steps
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      Req: {cap?.requiredKVArRated.toFixed(1)}k
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {cap?.totalConfiguredKVArSupply.toFixed(1)} kVAr
                    </td>
                    <td className="py-3 px-4 text-right text-amber-800 text-sm">
                      {cap?.totalConfiguredKVArRated} kVAr
                    </td>
                    <td className="py-3 px-4 text-right text-slate-900">
                      I<sub>cap</sub> = {cap?.mainIncomerCurrentAmps.toFixed(1)} A
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500 text-slate-950 rounded font-bold shadow-xs">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {cap?.mainIncomerBreakerRating} A
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Engineering Summary Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block">
                  Main Breaker & Incomer
                </span>
                <span className="text-lg font-bold font-mono text-slate-900 block">
                  {cap?.mainIncomerBreakerRating} A MCCB / ACB
                </span>
                <span className="text-xs text-blue-700 font-mono block">
                  I<sub>cap</sub> = {cap?.mainIncomerCurrentAmps.toFixed(1)} A (F = 1.5 Safety Factor)
                </span>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                  Effective Reactive Output
                </span>
                <span className="text-lg font-bold font-mono text-slate-900 block">
                  {cap?.totalConfiguredKVArSupply.toFixed(1)} kVAr @ {vSupply}V
                </span>
                <span className="text-xs text-emerald-700 font-mono block">
                  Target: {cap?.requiredKVArSupply.toFixed(1)} kVAr ({initialPF.toFixed(2)} → {targetPF.toFixed(2)})
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                  Harmonic Reactor Filter
                </span>
                <span className="text-sm font-bold font-mono text-slate-900 block mt-1">
                  7% Detuned (189 Hz)
                </span>
                <span className="text-xs text-amber-800 block">
                  Protects 525V capacitors from 5th/7th harmonic resonance
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-mono">
            Configured: <strong className="text-slate-800">{cap?.totalConfiguredKVArRated} kVAr</strong> ({cap?.totalConfiguredSteps} steps)
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
