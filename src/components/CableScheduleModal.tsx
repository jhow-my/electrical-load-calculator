import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CableScheduleEntry,
  CableDefinitionEntry,
  CableCategoryType,
  BreakerType,
} from '../types/electrical';
import {
  DEFAULT_CABLE_SCHEDULE,
  DEFAULT_CABLE_DEFINITIONS,
} from '../utils/electricalCalculations';
import {
  exportSizingReferenceToExcel,
  parseExcelToSizingReference,
} from '../utils/excelProjectHandler';
import {
  X,
  Cable,
  Shield,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Search,
  Info,
  CheckCircle2,
  Layers,
  ArrowRight,
  AlertTriangle,
  ExternalLink,
  Download,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { NumericInput } from './NumericInput';

interface CableScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSchedule?: CableScheduleEntry[];
  currentCableDefinitions?: CableDefinitionEntry[];
  onApplySchedule: (
    newSchedule: CableScheduleEntry[],
    newCableDefinitions?: CableDefinitionEntry[]
  ) => void;
}

export const CableScheduleModal: React.FC<CableScheduleModalProps> = ({
  isOpen,
  onClose,
  currentSchedule,
  currentCableDefinitions,
  onApplySchedule,
}) => {
  // Main View Switcher: 'CABLE' (Cable Schedule) vs 'BREAKER' (Breaker Schedule)
  const [mainView, setMainView] = useState<'CABLE' | 'BREAKER'>('CABLE');

  // Cable Schedule Sub-Tabs: 1-Phase cable, 3-Phase cable, Busduct
  const [cableTab, setCableTab] = useState<CableCategoryType>('3P');

  // Breaker Schedule Sub-Tabs: 1-Phase, 3-Phase
  const [breakerTab, setBreakerTab] = useState<'1P' | '3P'>('3P');

  // Search query & feedback state
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  // Local editable state for Cables
  const [cableDefinitions, setCableDefinitions] = useState<CableDefinitionEntry[]>(() => {
    return currentCableDefinitions && currentCableDefinitions.length > 0
      ? JSON.parse(JSON.stringify(currentCableDefinitions))
      : JSON.parse(JSON.stringify(DEFAULT_CABLE_DEFINITIONS));
  });

  // Local editable state for Breakers
  const [breakerSchedule, setBreakerSchedule] = useState<CableScheduleEntry[]>(() => {
    return currentSchedule && currentSchedule.length > 0
      ? JSON.parse(JSON.stringify(currentSchedule))
      : JSON.parse(JSON.stringify(DEFAULT_CABLE_SCHEDULE));
  });

  // Synchronize on modal open or prop change
  useEffect(() => {
    if (isOpen) {
      setCableDefinitions(
        currentCableDefinitions && currentCableDefinitions.length > 0
          ? JSON.parse(JSON.stringify(currentCableDefinitions))
          : JSON.parse(JSON.stringify(DEFAULT_CABLE_DEFINITIONS))
      );
      setBreakerSchedule(
        currentSchedule && currentSchedule.length > 0
          ? JSON.parse(JSON.stringify(currentSchedule))
          : JSON.parse(JSON.stringify(DEFAULT_CABLE_SCHEDULE))
      );
      setSearchQuery('');
    }
  }, [isOpen, currentSchedule, currentCableDefinitions]);

  // Map of cable name -> count of breakers referencing it
  const cableUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of breakerSchedule) {
      const key = b.cableSize.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [breakerSchedule]);

  // Filtered Cables for Cable Schedule View
  const filteredCables = useMemo(() => {
    return cableDefinitions.filter((item) => {
      if (item.category !== cableTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.cableSize.toLowerCase().includes(q) ||
          item.maxAmps.toString().includes(q) ||
          item.mvPerAmpMeter.toString().includes(q) ||
          (item.cpcSize || '').toLowerCase().includes(q) ||
          (item.installationMethod || '').toLowerCase().includes(q) ||
          (item.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cableDefinitions, cableTab, searchQuery]);

  // Filtered Breakers for Breaker Schedule View
  const filteredBreakers = useMemo(() => {
    return breakerSchedule.filter((item) => {
      if (item.phaseSystem !== breakerTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.breakerRating.toString().includes(q) ||
          item.breakerType.toLowerCase().includes(q) ||
          item.cableSize.toLowerCase().includes(q) ||
          item.maxAmps.toString().includes(q) ||
          (item.notes || '').toLowerCase().includes(q) ||
          (item.cpcSize || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [breakerSchedule, breakerTab, searchQuery]);

  // Overall coordination audit (checks if any breaker rating exceeds referenced conductor capacity)
  const coordinationSummary = useMemo(() => {
    let compliantCount = 0;
    let warningCount = 0;
    for (const b of breakerSchedule) {
      if (b.breakerRating <= b.maxAmps) {
        compliantCount++;
      } else {
        warningCount++;
      }
    }
    return { compliantCount, warningCount, total: breakerSchedule.length };
  }, [breakerSchedule]);

  if (!isOpen) return null;

  // --- Cable Schedule Actions ---
  const handleUpdateCable = (id: string, patch: Partial<CableDefinitionEntry>) => {
    setCableDefinitions((prev) => {
      const oldItem = prev.find((c) => c.id === id);
      const updated = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));

      // If cable size or rating/mV changed, auto-update all breakers referencing this cable
      if (oldItem && patch.cableSize && patch.cableSize !== oldItem.cableSize) {
        const oldName = oldItem.cableSize.trim().toLowerCase();
        const newName = patch.cableSize;
        setBreakerSchedule((prevBreakers) =>
          prevBreakers.map((b) =>
            b.cableSize.trim().toLowerCase() === oldName
              ? {
                  ...b,
                  cableSize: newName,
                  maxAmps: patch.maxAmps !== undefined ? patch.maxAmps : b.maxAmps,
                  mvPerAmpMeter:
                    patch.mvPerAmpMeter !== undefined ? patch.mvPerAmpMeter : b.mvPerAmpMeter,
                  cpcSize: patch.cpcSize !== undefined ? patch.cpcSize : b.cpcSize,
                }
              : b
          )
        );
      } else if (oldItem) {
        const currentName = oldItem.cableSize.trim().toLowerCase();
        setBreakerSchedule((prevBreakers) =>
          prevBreakers.map((b) =>
            b.cableSize.trim().toLowerCase() === currentName
              ? {
                  ...b,
                  maxAmps: patch.maxAmps !== undefined ? patch.maxAmps : b.maxAmps,
                  mvPerAmpMeter:
                    patch.mvPerAmpMeter !== undefined ? patch.mvPerAmpMeter : b.mvPerAmpMeter,
                  cpcSize: patch.cpcSize !== undefined ? patch.cpcSize : b.cpcSize,
                  installationMethod:
                    patch.installationMethod !== undefined
                      ? patch.installationMethod
                      : b.installationMethod,
                }
              : b
          )
        );
      }

      return updated;
    });
  };

  const handleAddCable = () => {
    let newEntry: CableDefinitionEntry;
    if (cableTab === '1P') {
      newEntry = {
        id: `cdef-custom-${Date.now()}`,
        category: '1P',
        cableSize: `2x1C 95.0mm² Cu/XLPE +E (Custom)`,
        maxAmps: 269,
        mvPerAmpMeter: 0.5,
        cpcSize: '50.0mm² Cu',
        installationMethod: 'Perforated Cable Tray Method E',
        notes: 'Custom 1-Phase cable specification',
      };
    } else if (cableTab === '3P') {
      newEntry = {
        id: `cdef-custom-${Date.now()}`,
        category: '3P',
        cableSize: `4x1C 35.0mm² Cu/PVC +E (Custom ${Date.now().toString().slice(-4)})`,
        maxAmps: 110,
        mvPerAmpMeter: 1.10,
        cpcSize: '16.0mm² Cu',
        installationMethod: 'Perforated Cable Tray Method E',
        notes: 'Custom 3-Phase cable specification',
      };
    } else {
      newEntry = {
        id: `cdef-bus-custom-${Date.now()}`,
        category: 'BUSDUCT',
        cableSize: `Copper Busduct 1500A (Custom)`,
        maxAmps: 1500,
        mvPerAmpMeter: 0.045,
        cpcSize: 'Integral Copper Ground Bus',
        installationMethod: 'Sandwich Busway',
        notes: 'Custom Busduct feeder system',
      };
    }
    setCableDefinitions((prev) => [...prev, newEntry]);
  };

  const handleDeleteCable = (id: string, name: string) => {
    const usage = cableUsageMap.get(name.trim().toLowerCase()) || 0;
    if (usage > 0) {
      if (
        !window.confirm(
          `Notice: "${name}" is currently referenced by ${usage} protective breaker(s) in the Breaker Schedule. Are you sure you want to delete this cable specification?`
        )
      ) {
        return;
      }
    }
    setCableDefinitions((prev) => prev.filter((c) => c.id !== id));
  };

  const handleResetCableDefaults = () => {
    if (
      window.confirm(
        'Reset Cable Schedule back to standard IEC 60364 / BS 7671 conductor ratings and mV/A/m voltage drop factors?'
      )
    ) {
      setCableDefinitions(JSON.parse(JSON.stringify(DEFAULT_CABLE_DEFINITIONS)));
    }
  };

  // --- Breaker Schedule Actions ---
  const handleUpdateBreaker = (id: string, patch: Partial<CableScheduleEntry>) => {
    setBreakerSchedule((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  // Reference cable selection from Cable Schedule dropdown
  const handleSelectCableForBreaker = (breakerId: string, chosenCableSize: string) => {
    // Find matching cable definition in our cableDefinitions state
    const matched = cableDefinitions.find(
      (c) => c.cableSize.trim().toLowerCase() === chosenCableSize.trim().toLowerCase()
    );

    if (matched) {
      handleUpdateBreaker(breakerId, {
        cableSize: matched.cableSize,
        maxAmps: matched.maxAmps,
        mvPerAmpMeter: matched.mvPerAmpMeter,
        cpcSize: matched.cpcSize,
        installationMethod: matched.installationMethod,
        notes: matched.notes ? `Ref: ${matched.notes}` : undefined,
      });
    } else {
      handleUpdateBreaker(breakerId, {
        cableSize: chosenCableSize,
      });
    }
  };

  const handleAddBreaker = () => {
    const is3P = breakerTab === '3P';
    const fallbackCable = is3P
      ? cableDefinitions.find((c) => c.category === '3P') || cableDefinitions[0]
      : cableDefinitions.find((c) => c.category === '1P') || cableDefinitions[0];

    const newEntry: CableScheduleEntry = {
      id: `cs-custom-${Date.now()}`,
      phaseSystem: is3P ? '3P' : '1P',
      breakerRating: is3P ? 160 : 32,
      breakerType: is3P ? 'MCCB' : 'MCB',
      poles: is3P ? 3 : 1,
      cableSize: fallbackCable?.cableSize || (is3P ? '4x1C 70.0mm² Cu/XLPE/PVC +E' : '2x1C 6.0mm² Cu/PVC +E'),
      maxAmps: fallbackCable?.maxAmps || (is3P ? 222 : 36),
      mvPerAmpMeter: fallbackCable?.mvPerAmpMeter || (is3P ? 0.65 : 6.4),
      cpcSize: fallbackCable?.cpcSize || (is3P ? '35.0mm² Cu' : '6.0mm² Cu'),
      installationMethod:
        fallbackCable?.installationMethod || 'Perforated Cable Tray Method E',
      notes: 'Custom protective device rule',
    };
    setBreakerSchedule((prev) => [...prev, newEntry]);
  };

  const handleDeleteBreaker = (id: string) => {
    if (breakerSchedule.length <= 1) return;
    setBreakerSchedule((prev) => prev.filter((b) => b.id !== id));
  };

  const handleResetBreakerDefaults = () => {
    if (
      window.confirm(
        'Reset Breaker Schedule back to standard IEC 60364 / BS 7671 baseline protective ratings?'
      )
    ) {
      setBreakerSchedule(JSON.parse(JSON.stringify(DEFAULT_CABLE_SCHEDULE)));
    }
  };

  // --- Excel Import & Export for Sizing Reference ---
  const handleExportExcel = () => {
    try {
      exportSizingReferenceToExcel(cableDefinitions, breakerSchedule, 'Sizing_Reference');
      setSaveSuccessMessage(
        'Sizing Reference exported to Excel (.xlsx) with separate Cable Schedule & Breaker Schedule sheets!'
      );
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleImportExcelClick = () => {
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
      excelFileInputRef.current.click();
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) throw new Error('File buffer is empty.');

        const { cableDefinitions: importedDefs, breakerSchedule: importedBreakers, summary } =
          parseExcelToSizingReference(arrayBuffer);

        setCableDefinitions(importedDefs);
        setBreakerSchedule(importedBreakers);
        setSaveSuccessMessage(summary);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } catch (err: any) {
        alert(`Import Error: ${err.message || 'Failed to parse Sizing Reference Excel file.'}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- Save & Apply Globally ---
  const handleSaveAndApply = () => {
    onApplySchedule(breakerSchedule, cableDefinitions);
    setSaveSuccessMessage(
      'Sizing Reference updated: Cable Schedule & Breaker Schedules applied globally across all DBs!'
    );
    setTimeout(() => {
      setSaveSuccessMessage(null),
      onClose();
    }, 1100);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ======================================================== */}
        {/* 1. MODAL HEADER: Sizing Reference */}
        {/* ======================================================== */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-600 shadow-2xs shrink-0">
              <Layers className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  Sizing Reference
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                  IEC 60364 / BS 7671 Standard Sizing
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1">
                Modular engineering reference library for Cables and Protective Devices. Breakers directly reference conductors from the Cable Schedule.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ======================================================== */}
        {/* 2. MAIN VIEW SWITCHER: Cable Schedule vs Breaker Schedule */}
        {/* ======================================================== */}
        <div className="px-4 sm:px-5 py-1.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/80">
            <button
              onClick={() => {
                setMainView('CABLE');
                setSearchQuery('');
              }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mainView === 'CABLE'
                  ? 'bg-white text-slate-950 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cable className="w-3.5 h-3.5 text-amber-600" />
              <span>Cable Schedule</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
                {cableDefinitions.length}
              </span>
            </button>

            <button
              onClick={() => {
                setMainView('BREAKER');
                setSearchQuery('');
              }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mainView === 'BREAKER'
                  ? 'bg-white text-slate-950 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Breaker Schedule</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-semibold">
                {breakerSchedule.length}
              </span>
            </button>
          </div>

          {/* Quick Stats or Guidance badge */}
          <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
            {mainView === 'CABLE' ? (
              <span className="hidden sm:inline text-[11px]">
                Contains conductors, I<sub>z</sub> ampacity, and mV/A/m voltage drop factors
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                {coordinationSummary.warningCount === 0 ? (
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>All {coordinationSummary.total} breakers comply with I<sub>n</sub> ≤ I<sub>z</sub></span>
                  </span>
                ) : (
                  <span className="text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>{coordinationSummary.warningCount} breaker(s) exceed referenced cable rating!</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUB-TABS & TOOLBAR: Tailored to Active Schedule */}
        {/* ======================================================== */}
        <div className="px-4 sm:px-5 py-1.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Sub-Tabs */}
          {mainView === 'CABLE' ? (
            /* Cable Schedule Subdivided into 3 Tabs: 1-Phase cable, 3-Phase cable, Busduct */
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setCableTab('1P')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  cableTab === '1P'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                <span>1-Phase cable ({cableDefinitions.filter((c) => c.category === '1P').length})</span>
              </button>
              <button
                onClick={() => setCableTab('3P')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  cableTab === '3P'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-700" />
                <span>3-Phase cable ({cableDefinitions.filter((c) => c.category === '3P').length})</span>
              </button>
              <button
                onClick={() => setCableTab('BUSDUCT')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  cableTab === 'BUSDUCT'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-300" />
                <span>Busduct ({cableDefinitions.filter((c) => c.category === 'BUSDUCT').length})</span>
              </button>
            </div>
          ) : (
            /* Breaker Schedule Subdivided into 2 Tabs: 1-Phase, 3-Phase */
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setBreakerTab('1P')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  breakerTab === '1P'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                <span>1-Phase ({breakerSchedule.filter((b) => b.phaseSystem === '1P').length})</span>
              </button>
              <button
                onClick={() => setBreakerTab('3P')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  breakerTab === '3P'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-700" />
                <span>3-Phase ({breakerSchedule.filter((b) => b.phaseSystem === '3P').length})</span>
              </button>
            </div>
          )}

          {/* Search Input & Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  mainView === 'CABLE'
                    ? 'Search cable or mV/A/m...'
                    : 'Search breaker or cable...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44 sm:w-48 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {mainView === 'CABLE' ? (
              <>
                <button
                  onClick={handleAddCable}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-600" />
                  <span>Add</span>
                </button>

                <button
                  onClick={handleResetCableDefaults}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Reset cable schedule to standard defaults"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleAddBreaker}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Add</span>
                </button>

                <button
                  onClick={handleResetBreakerDefaults}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Reset breaker schedule to standard defaults"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset</span>
                </button>
              </>
            )}

            {/* Excel Export & Import for Sizing Reference */}
            <div className="h-4 w-px bg-slate-300 mx-0.5 hidden sm:block" />
            <button
              onClick={handleExportExcel}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Export Sizing Reference (Cable Schedule & Breaker Schedule) to Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export</span>
            </button>

            <button
              onClick={handleImportExcelClick}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              title="Import Cable Schedule & Breaker Schedule from Excel (.xlsx)"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>Import</span>
            </button>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. TABLE CONTENT AREA */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-auto p-2.5 sm:p-3.5 bg-slate-50/50">
          {mainView === 'CABLE' ? (
            /* -------------------------------------------------------- */
            /* VIEW A: CABLE SCHEDULE TABLE */
            /* -------------------------------------------------------- */
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                    <th className="py-1.5 px-2.5 w-10 text-center">#</th>
                    <th className="py-1.5 px-2.5 w-14 text-center">Type</th>
                    <th className="py-1.5 px-2.5 min-w-[200px]">Cable Size / Conductor Spec</th>
                    <th className="py-1.5 px-2.5 w-24 text-right">I<sub>z</sub> Capacity</th>
                    <th className="py-1.5 px-2.5 w-28 text-right font-semibold text-amber-900">Voltage Drop</th>
                    <th className="py-1.5 px-2.5 min-w-[160px]">Installation / Ref Method</th>
                    <th className="py-1.5 px-2 min-w-[95px] text-center">Breakers</th>
                    <th className="py-1.5 px-2 w-12 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {filteredCables.map((cable, index) => {
                    const usage = cableUsageMap.get(cable.cableSize.trim().toLowerCase()) || 0;
                    const typeBadgeColors =
                      cable.category === '3P'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : cable.category === '1P'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200';

                    return (
                      <tr
                        key={cable.id}
                        className="hover:bg-amber-50/40 transition-all duration-150 group"
                      >
                        {/* Index */}
                        <td className="py-1 px-2.5 text-center text-slate-500 font-mono font-medium">
                          {index + 1}
                        </td>

                        {/* Type Badge */}
                        <td className="py-1 px-2 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono ${typeBadgeColors}`}
                          >
                            {cable.category}
                          </span>
                        </td>

                        {/* Cable Size (Editable String) */}
                        <td className="py-1 px-2.5 font-sans">
                          <input
                            type="text"
                            value={cable.cableSize}
                            onChange={(e) =>
                              handleUpdateCable(cable.id, { cableSize: e.target.value })
                            }
                            className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-900 font-semibold focus:outline-none transition-colors"
                            placeholder="e.g. 4C 25.0mm² Cu/XLPE"
                          />
                        </td>

                        {/* Iz Capacity (Editable Number) */}
                        <td className="py-1 px-2 text-right">
                          <div className="flex items-center justify-end">
                            <NumericInput
                              step={1}
                              min={1}
                              max={10000}
                              allowDecimals={false}
                              fallbackValue={20}
                              value={cable.maxAmps}
                              onChange={(val) =>
                                handleUpdateCable(cable.id, {
                                  maxAmps: val,
                                })
                              }
                              className="w-14 text-right bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1 py-0.5 text-xs font-bold text-slate-900 tabular-nums focus:outline-none transition-colors"
                              aria-label={`Current Capacity Iz for ${cable.cableSize}`}
                            />
                            <span className="text-slate-500 text-[11px] ml-1 font-mono">A</span>
                          </div>
                        </td>

                        {/* Voltage Drop (mV/A/m Voltage Drop Factor - Editable Float) */}
                        <td className="py-1 px-2 text-right">
                          <div className="flex items-center justify-end">
                            <NumericInput
                              step={0.001}
                              min={0.001}
                              max={100}
                              allowDecimals={true}
                              fallbackValue={1.0}
                              value={cable.mvPerAmpMeter}
                              onChange={(val) =>
                                handleUpdateCable(cable.id, {
                                  mvPerAmpMeter: val,
                                })
                              }
                              className="w-16 text-right bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1 py-0.5 text-xs font-bold text-amber-700 tabular-nums focus:outline-none transition-colors"
                              aria-label={`Voltage drop factor for ${cable.cableSize}`}
                            />
                            <span className="text-amber-700/80 text-[10px] ml-1 font-sans font-medium whitespace-nowrap">
                              mV/A/m
                            </span>
                          </div>
                        </td>

                        {/* Installation Method */}
                        <td className="py-1 px-2.5 font-sans">
                          <input
                            type="text"
                            value={cable.installationMethod || ''}
                            onChange={(e) =>
                              handleUpdateCable(cable.id, {
                                installationMethod: e.target.value,
                              })
                            }
                            className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none transition-colors"
                            placeholder="e.g. Perforated Tray Method E"
                          />
                        </td>

                        {/* Referenced By Badge */}
                        <td className="py-1 px-1.5 text-center">
                          <button
                            onClick={() => {
                              setMainView('BREAKER');
                              setBreakerTab(cable.category === '1P' ? '1P' : '3P');
                              setSearchQuery(cable.cableSize);
                            }}
                            className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap cursor-pointer transition-colors ${
                              usage > 0
                                ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-semibold'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                            }`}
                            title={`Referenced by ${usage} protective breaker(s). Click to view.`}
                          >
                            <span className="whitespace-nowrap">{usage} Breaker{usage === 1 ? '' : 's'}</span>
                            <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                          </button>
                        </td>

                        {/* Action */}
                        <td className="py-1 px-2 text-center">
                          <button
                            onClick={() => handleDeleteCable(cable.id, cable.cableSize)}
                            disabled={filteredCables.length <= 1}
                            className={`p-1 rounded transition-colors ${
                              filteredCables.length <= 1
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer'
                            }`}
                            title="Delete cable specification"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* -------------------------------------------------------- */
            /* VIEW B: BREAKER SCHEDULE TABLE */
            /* -------------------------------------------------------- */
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                    <th className="py-1.5 px-2.5 w-10 text-center">#</th>
                    <th className="py-1.5 px-2.5 w-14 text-center">System</th>
                    <th className="py-1.5 px-2.5 w-24 text-right">Rating (I<sub>n</sub>)</th>
                    <th className="py-1.5 px-2 w-20 text-center">Type</th>
                    <th className="py-1.5 px-2 w-16 text-center">Poles</th>
                    <th className="py-1.5 px-2.5 min-w-[240px]">Referenced Cable</th>
                    <th className="py-1.5 px-2.5 min-w-[130px] text-center">I<sub>z</sub> Conductor</th>
                    <th className="py-1.5 px-2.5 w-20 text-right font-semibold text-amber-900">mV/A/m</th>
                    <th className="py-1.5 px-2 w-12 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {filteredBreakers.map((breaker, index) => {
                    const isOverloaded = breaker.breakerRating > breaker.maxAmps;
                    const systemBadgeColors =
                      breaker.phaseSystem === '3P'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-blue-50 text-blue-800 border-blue-200';

                    return (
                      <tr
                        key={breaker.id}
                        className={`hover:bg-amber-50/40 transition-all duration-150 group ${
                          isOverloaded ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        {/* Index */}
                        <td className="py-1 px-2.5 text-center text-slate-500 font-mono font-medium">
                          {index + 1}
                        </td>

                        {/* System Badge */}
                        <td className="py-1 px-2 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono ${systemBadgeColors}`}
                          >
                            {breaker.phaseSystem}
                          </span>
                        </td>

                        {/* Breaker Rating In */}
                        <td className="py-1 px-2 text-right">
                          <div className="flex items-center justify-end">
                            <NumericInput
                              step={1}
                              min={1}
                              max={10000}
                              allowDecimals={false}
                              fallbackValue={32}
                              value={breaker.breakerRating}
                              onChange={(val) =>
                                handleUpdateBreaker(breaker.id, {
                                  breakerRating: val,
                                })
                              }
                              className={`w-14 text-right bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1 py-0.5 text-xs font-bold tabular-nums focus:outline-none transition-colors ${
                                isOverloaded ? 'text-rose-700' : 'text-slate-900'
                              }`}
                              aria-label={`Breaker Rating for ${breaker.breakerRating}A`}
                            />
                            <span className="text-slate-600 font-semibold text-[11px] ml-1 font-mono">A</span>
                          </div>
                        </td>

                        {/* Breaker Type */}
                        <td className="py-1 px-2 text-center">
                          <select
                            value={breaker.breakerType}
                            onChange={(e) =>
                              handleUpdateBreaker(breaker.id, {
                                breakerType: e.target.value as BreakerType,
                              })
                            }
                            className="bg-transparent text-slate-700 text-xs rounded border-0 hover:bg-slate-100 py-0.5 px-1.5 focus:ring-1 focus:ring-amber-500 cursor-pointer font-mono font-medium"
                          >
                            <option value="MCB">MCB</option>
                            <option value="MCCB">MCCB</option>
                            <option value="ACB">ACB</option>
                          </select>
                        </td>

                        {/* Poles */}
                        <td className="py-1 px-2 text-center">
                          <select
                            value={breaker.poles}
                            onChange={(e) =>
                              handleUpdateBreaker(breaker.id, {
                                poles: parseInt(e.target.value) as 1 | 2 | 3 | 4,
                              })
                            }
                            className="bg-transparent text-slate-700 text-xs rounded border-0 hover:bg-slate-100 py-0.5 px-1.5 focus:ring-1 focus:ring-amber-500 cursor-pointer font-mono text-center font-medium"
                          >
                            <option value="1">1P</option>
                            <option value="2">2P</option>
                            <option value="3">3P</option>
                            <option value="4">4P</option>
                          </select>
                        </td>

                        {/* Referenced Cable from Cable Schedule (Dropdown Selector) */}
                        <td className="py-1 px-2.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={breaker.cableSize}
                              onChange={(e) =>
                                handleSelectCableForBreaker(breaker.id, e.target.value)
                              }
                              className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer truncate transition-colors"
                            >
                              {breaker.phaseSystem === '1P' ? (
                                <optgroup label="— 1-Phase Cables —">
                                  {cableDefinitions
                                    .filter((c) => c.category === '1P')
                                    .map((c) => (
                                      <option key={c.id} value={c.cableSize}>
                                        {c.cableSize} (Iz: {c.maxAmps}A | {c.mvPerAmpMeter} mV/A/m)
                                      </option>
                                    ))}
                                </optgroup>
                              ) : (
                                <>
                                  <optgroup label="— 3-Phase Cables —">
                                    {cableDefinitions
                                      .filter((c) => c.category === '3P')
                                      .map((c) => (
                                        <option key={c.id} value={c.cableSize}>
                                          {c.cableSize} (Iz: {c.maxAmps}A | {c.mvPerAmpMeter} mV/A/m)
                                        </option>
                                      ))}
                                  </optgroup>
                                  <optgroup label="— Sandwich Busduct Systems —">
                                    {cableDefinitions
                                      .filter((c) => c.category === 'BUSDUCT')
                                      .map((c) => (
                                        <option key={c.id} value={c.cableSize}>
                                          {c.cableSize} (Iz: {c.maxAmps}A | {c.mvPerAmpMeter} mV/A/m)
                                        </option>
                                      ))}
                                  </optgroup>
                                </>
                              )}
                              {!cableDefinitions.some(
                                (c) =>
                                  c.cableSize.trim().toLowerCase() ===
                                  breaker.cableSize.trim().toLowerCase()
                              ) && (
                                <option value={breaker.cableSize}>
                                  {breaker.cableSize} (Custom Entry)
                                </option>
                              )}
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                setMainView('CABLE');
                                setCableTab(
                                  breaker.cableSize.toLowerCase().includes('busduct')
                                    ? 'BUSDUCT'
                                    : breaker.phaseSystem === '1P'
                                    ? '1P'
                                    : '3P'
                                );
                                setSearchQuery(breaker.cableSize);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded shrink-0 cursor-pointer transition-colors"
                              title="Inspect this conductor in Cable Schedule"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Iz Capacity & Coordination Status (rating on left, checker on right) */}
                        <td className="py-1 px-2.5">
                          <div className="flex items-center justify-between gap-2 leading-tight">
                            <span
                              className={`font-bold text-left shrink-0 ${
                                isOverloaded ? 'text-rose-700' : 'text-slate-900'
                              }`}
                            >
                              {breaker.maxAmps} A
                            </span>
                            {isOverloaded ? (
                              <span className="text-[9px] text-rose-600 font-sans font-semibold flex items-center gap-0.5 whitespace-nowrap text-right shrink-0">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>I<sub>n</sub> &gt; I<sub>z</sub>!</span>
                              </span>
                            ) : (
                              <span className="text-[9px] text-emerald-600 font-sans font-medium whitespace-nowrap text-right shrink-0">
                                ✓ I<sub>n</sub> ≤ I<sub>z</sub>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* mV/A/m Voltage Drop Factor */}
                        <td className="py-1 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                          {breaker.mvPerAmpMeter !== undefined
                            ? breaker.mvPerAmpMeter
                            : '--'}
                        </td>

                        {/* Action */}
                        <td className="py-1 px-2 text-center">
                          <button
                            onClick={() => handleDeleteBreaker(breaker.id)}
                            disabled={breakerSchedule.length <= 1}
                            className={`p-1 rounded transition-colors ${
                              breakerSchedule.length <= 1
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer'
                            }`}
                            title="Delete breaker rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 4. FOOTER BAR */}
        {/* ======================================================== */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-3">
            {saveSuccessMessage ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-medium">{saveSuccessMessage}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono hidden sm:flex items-center gap-2">
                <span>Library: {cableDefinitions.length} Conductors</span>
                <span aria-hidden="true">·</span>
                <span>{breakerSchedule.length} Breakers Configured</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 text-slate-950" />
              <span>Save and Apply Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
