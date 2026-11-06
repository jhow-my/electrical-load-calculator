import React, { useState } from 'react';
import { VoltageSystem } from '../types/electrical';
import { VOLTAGE_PRESETS } from '../utils/electricalCalculations';
import { X, Check } from 'lucide-react';
import { NumericInput } from './NumericInput';

interface VoltageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVoltage: VoltageSystem;
  onSelectVoltage: (v: VoltageSystem) => void;
}

export const VoltageSelectorModal: React.FC<VoltageSelectorModalProps> = ({
  isOpen,
  onClose,
  currentVoltage,
  onSelectVoltage,
}) => {
  const [customVll, setCustomVll] = useState(currentVoltage.Vll);
  const [customVln, setCustomVln] = useState(currentVoltage.Vln);
  const [customFreq, setCustomFreq] = useState(currentVoltage.frequency);

  if (!isOpen) return null;

  const handleApplyCustom = () => {
    onSelectVoltage({
      id: `custom-${customVll}-${customVln}`,
      label: `Custom ${customVll}V / ${customVln}V ${customFreq}Hz`,
      standard: 'CUSTOM',
      Vll: customVll,
      Vln: customVln,
      frequency: customFreq,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              System Voltage & Electrical Standards
            </h3>
            <p className="text-xs text-slate-500">
              Select country standard or configure custom line-to-line and line-to-neutral voltages.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Standard Presets */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-slate-700 block">
            Standard International Presets
          </label>
          <div className="grid grid-cols-1 gap-2">
            {VOLTAGE_PRESETS.map((preset) => {
              const isSelected = currentVoltage.id === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelectVoltage(preset);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">
                      {preset.label}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      V_line-line: {preset.Vll}V · V_line-neutral: {preset.Vln}V · {preset.frequency}Hz
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Voltage Fields */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <label className="text-xs font-semibold text-slate-700 block">
            Or Configure Custom Voltage System
          </label>
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div>
              <span className="text-slate-500 block mb-1">V_LL (Line-Line)</span>
              <NumericInput
                min={50}
                max={1500}
                step={5}
                allowDecimals={false}
                fallbackValue={400}
                value={customVll}
                onChange={(val) => setCustomVll(val)}
                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-900"
                aria-label="Line-to-Line Voltage Vll"
              />
            </div>
            <div>
              <span className="text-slate-500 block mb-1">V_LN (Line-Neutral)</span>
              <NumericInput
                min={50}
                max={1000}
                step={5}
                allowDecimals={false}
                fallbackValue={230}
                value={customVln}
                onChange={(val) => setCustomVln(val)}
                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-900"
                aria-label="Line-to-Neutral Voltage Vln"
              />
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Frequency</span>
              <select
                value={customFreq}
                onChange={(e) => setCustomFreq(parseInt(e.target.value) || 50)}
                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-900"
              >
                <option value={50}>50 Hz</option>
                <option value={60}>60 Hz</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleApplyCustom}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors mt-2"
          >
            Apply Custom Voltage Parameters
          </button>
        </div>
      </div>
    </div>
  );
};
