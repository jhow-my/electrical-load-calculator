import React from 'react';
import { Zap, FileText, Settings2, HelpCircle, Cable, Layers, LayoutTemplate } from 'lucide-react';
import { VoltageSystem } from '../types/electrical';

interface HeaderProps {
  activeTab: 'MSB' | 'SUBDB' | 'DB' | 'SLD';
  setActiveTab: (tab: 'MSB' | 'SUBDB' | 'DB' | 'SLD') => void;
  voltageSystem: VoltageSystem;
  onOpenTemplateModal: () => void;
  onOpenVoltageModal: () => void;
  onOpenFormulaModal: () => void;
  onOpenReportModal: () => void;
  onOpenCableScheduleModal: () => void;
  selectedDbCode?: string;
  selectedSubDbCode?: string;
  onSelectPreset?: (preset: 'commercial' | 'residential' | 'blank') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  voltageSystem,
  onOpenTemplateModal,
  onOpenVoltageModal,
  onOpenFormulaModal,
  onOpenReportModal,
  onOpenCableScheduleModal,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 text-slate-900 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-2 sm:gap-4 flex-wrap sm:flex-nowrap">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-500/20" />
            </div>
            <div>
              <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap block">
                Electric Load Calculator
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 hidden xl:block -mt-0.5">
                DB → Sub-DB → MSB Sizing
              </span>
            </div>
          </div>

          {/* Center: Calculation Path & SLD Navigation Stepper */}
          <div className="flex items-center gap-1 sm:gap-1.5 font-mono text-xs overflow-x-auto py-1 scrollbar-none shrink-0">
            <span className="font-bold text-amber-900 text-xs shrink-0 hidden lg:inline mr-0.5">
              Path:
            </span>

            <button
              type="button"
              onClick={() => setActiveTab('DB')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center shrink-0 ${
                activeTab === 'DB'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
              }`}
              title="Navigate to Level 1: Final DBs"
            >
              1. DBs
            </button>

            <span className="text-amber-500 font-bold shrink-0 text-xs select-none" aria-hidden="true">→</span>

            <button
              type="button"
              onClick={() => setActiveTab('SUBDB')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center shrink-0 ${
                activeTab === 'SUBDB'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
              }`}
              title="Navigate to Level 2: Sub-DBs"
            >
              2. Sub-DBs
            </button>

            <span className="text-amber-500 font-bold shrink-0 text-xs select-none" aria-hidden="true">→</span>

            <button
              type="button"
              onClick={() => setActiveTab('MSB')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center shrink-0 ${
                activeTab === 'MSB'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
              }`}
              title="Navigate to Level 3: MSB Plant"
            >
              3. MSB
            </button>

            <span className="text-slate-400 font-bold shrink-0 px-0.5 select-none" aria-hidden="true">—</span>

            <button
              type="button"
              onClick={() => setActiveTab('SLD')}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                activeTab === 'SLD'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-400 shadow-2xs'
              }`}
              title="Navigate to Single Line Diagram (SLD)"
            >
              <Layers className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>SLD</span>
            </button>
          </div>

          {/* Top-Right Action Controls: Templates button, Voltage pill, Cable Schedule icon, Formulas icon, and Report button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Project Templates & Saved Configurations Button (Placed directly on the left of Voltage Selection) */}
            <button
              onClick={onOpenTemplateModal}
              className="flex items-center gap-1.5 text-slate-700 hover:text-amber-700 transition-colors bg-white hover:bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md border border-slate-300 shadow-2xs text-xs cursor-pointer min-h-[36px]"
              title="Project Templates & Saved Configurations"
              aria-label="Project Templates"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-semibold text-slate-800">Templates</span>
            </button>

            {/* Voltage Configuration Button/Pill */}
            <button
              onClick={onOpenVoltageModal}
              className="flex items-center gap-1.5 text-slate-700 hover:text-amber-700 transition-colors bg-white hover:bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md border border-slate-300 shadow-2xs text-xs cursor-pointer min-h-[36px]"
              title={`System Voltage Configuration (${voltageSystem.standard})`}
              aria-label="Voltage Configuration"
            >
              <Settings2 className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-mono font-medium">{voltageSystem.Vll}V / {voltageSystem.Vln}V</span>
            </button>

            {/* Sizing Reference Link */}
            <button
              onClick={onOpenCableScheduleModal}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-300 shadow-2xs transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Sizing Reference (Cable & Breaker Schedules)"
              aria-label="Sizing Reference"
            >
              <Cable className="w-4 h-4 text-amber-600" />
            </button>

            {/* Icon-Only Formulas & Sizing Guide Link */}
            <button
              onClick={onOpenFormulaModal}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-300 shadow-2xs transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Formulas & Sizing Guide"
              aria-label="Formulas & Sizing Guide"
            >
              <HelpCircle className="w-4 h-4 text-amber-600" />
            </button>

            {/* Report Button */}
            <button
              onClick={onOpenReportModal}
              className="flex items-center gap-1.5 text-slate-700 hover:text-amber-700 transition-colors bg-white hover:bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md border border-slate-300 shadow-2xs text-xs cursor-pointer min-h-[36px]"
              title="View & Print Report"
              aria-label="Report"
            >
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-semibold text-slate-800">Report</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
