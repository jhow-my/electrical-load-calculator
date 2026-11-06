/**
 * Comprehensive Electrical Load Schedule & Panel Sizing Report Modal
 * Fully compliant with IEC 60364 & BS 7671 engineering submittal requirements.
 * Revamped with ultra-compact, structured layout matching the UI density of MSB, Sub-DB, and DB views.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ElectricalProject, DistributionBoard } from '../types/electrical';
import {
  X,
  Download,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Flame,
  BatteryCharging,
  Cpu,
  Layers,
  FileSpreadsheet,
  Pencil,
  Check,
  Search,
  Cable,
  Scale,
  GitFork,
} from 'lucide-react';
import { exportProjectToExcel, parseExcelToProject } from '../utils/excelProjectHandler';
import { parseCSVToProject } from '../utils/csvProjectHandler';
import { generatePdfReport } from '../utils/pdfReportGenerator';
import { getGeneratorScopeLabel } from '../utils/electricalCalculations';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ElectricalProject;
  initialMsbId?: string;
  onImportProject?: (project: ElectricalProject) => void;
  onUpdateProject?: (project: ElectricalProject) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  project,
  initialMsbId,
  onImportProject,
  onUpdateProject,
}) => {
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active MSB Tab in Report View (for multi-MSB projects, deduplicated by id)
  const msbList = useMemo(() => {
    const rawList = project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb];
    const seen = new Set<string>();
    const deduplicated: typeof rawList = [];
    rawList.forEach((m) => {
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        deduplicated.push(m);
      }
    });
    return deduplicated.length > 0 ? deduplicated : [project.msb];
  }, [project.msbs, project.msb]);

  const [activeMsbId, setActiveMsbId] = useState<string>(() => {
    if (initialMsbId && msbList.some((m) => m.id === initialMsbId)) {
      return initialMsbId;
    }
    return msbList[0]?.id || project.msb?.id || '';
  });

  const prevIsOpenRef = useRef(false);
  const prevInitialMsbIdRef = useRef(initialMsbId);

  // Synchronize active MSB ONLY when modal initially opens or when initialMsbId prop explicitly changes externally
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const initialChanged = initialMsbId !== prevInitialMsbIdRef.current;

    if (justOpened || initialChanged) {
      if (initialMsbId && msbList.some((m) => m.id === initialMsbId)) {
        setActiveMsbId(initialMsbId);
      } else if (msbList[0]) {
        setActiveMsbId(msbList[0].id);
      }
    } else if (isOpen) {
      // If the currently selected MSB was removed from the project while modal is open, fallback to first
      if (!msbList.some((m) => m.id === activeMsbId) && msbList[0]) {
        setActiveMsbId(msbList[0].id);
      }
    }

    prevIsOpenRef.current = isOpen;
    prevInitialMsbIdRef.current = initialMsbId;
  }, [isOpen, initialMsbId, msbList, activeMsbId]);

  // Current MSB being inspected in the report
  const currentMsb = useMemo(() => {
    return msbList.find((m) => m.id === activeMsbId) || msbList[0] || project.msb;
  }, [msbList, activeMsbId, project.msb]);

  const isPrimaryMsb = currentMsb.id === msbList[0]?.id;

  // Filter / Quick-Jump state for Distribution Boards
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [selectedSubDbFilter, setSelectedSubDbFilter] = useState<string>('ALL');

  // Editable Project Title & Engineer state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.name);
  const [isEditingEngineer, setIsEditingEngineer] = useState(false);
  const [engineerInput, setEngineerInput] = useState(project.engineer || 'Senior Electrical PE');

  useEffect(() => {
    setTitleInput(project.name);
  }, [project.name]);

  useEffect(() => {
    setEngineerInput(project.engineer || 'Senior Electrical PE');
  }, [project.engineer]);

  const { subDbs = [], dbs = [], msbDirectLoads = [], voltageSystem } = project;

  // Linked Sub-DBs connected directly to active MSB
  const linkedSubDbs = useMemo(() => {
    return subDbs.filter(
      (sb) =>
        sb.msbId === currentMsb.id ||
        sb.msbId === currentMsb.code ||
        (!sb.msbId && isPrimaryMsb)
    );
  }, [subDbs, currentMsb, isPrimaryMsb]);

  // Direct DBs fed directly from active MSB (bypassing Sub-DBs)
  const directDbs = useMemo(() => {
    return dbs.filter(
      (db) =>
        db.subDbId === currentMsb.id ||
        db.subDbId === currentMsb.code ||
        (isPrimaryMsb && (db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === 'msb-main'))
    );
  }, [dbs, currentMsb, isPrimaryMsb]);

  // Direct major equipment connected directly to active MSB
  const directLoads = useMemo(() => {
    return msbDirectLoads.filter(
      (l) =>
        l.msbId === currentMsb.id ||
        l.msbId === currentMsb.code ||
        (!l.msbId && isPrimaryMsb)
    );
  }, [msbDirectLoads, currentMsb, isPrimaryMsb]);

  // All Distribution Boards downstream of current MSB (direct DBs + DBs connected via active MSB's Sub-DBs)
  const msbDownstreamDbs = useMemo(() => {
    const linkedSubDbIdSet = new Set(linkedSubDbs.map((sb) => sb.id));
    const linkedSubDbCodeSet = new Set(linkedSubDbs.map((sb) => sb.code?.toLowerCase()));

    return dbs.filter((db) => {
      // 1. Directly fed from active MSB
      const isDirect =
        db.subDbId === currentMsb.id ||
        db.subDbId === currentMsb.code ||
        (isPrimaryMsb && (db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === 'msb-main'));
      if (isDirect) return true;

      // 2. Fed from a Sub-DB connected to active MSB
      if (
        linkedSubDbIdSet.has(db.subDbId) ||
        (db.subDbId && linkedSubDbCodeSet.has(db.subDbId.toLowerCase()))
      ) {
        return true;
      }

      return false;
    });
  }, [dbs, linkedSubDbs, currentMsb, isPrimaryMsb]);

  // Reset Sub-DB filter if active MSB changes and selected Sub-DB is no longer under this MSB
  useEffect(() => {
    if (selectedSubDbFilter !== 'ALL' && selectedSubDbFilter !== 'DIRECT_MSB') {
      const existsInActiveMsb = linkedSubDbs.some((sb) => sb.id === selectedSubDbFilter);
      if (!existsInActiveMsb) {
        setSelectedSubDbFilter('ALL');
      }
    }
  }, [activeMsbId, linkedSubDbs, selectedSubDbFilter]);

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

  // Phase line currents for live graphical level bars
  const pR = currentMsb?.phaseBalance?.phaseR?.currentAmps || 0;
  const pY = currentMsb?.phaseBalance?.phaseY?.currentAmps || 0;
  const pB = currentMsb?.phaseBalance?.phaseB?.currentAmps || 0;
  const maxPhaseAmps = Math.max(1, pR, pY, pB);

  // Filtered DBs for Section 3 (strictly scoped to downstream DBs of active MSB)
  const filteredDbs = useMemo(() => {
    return msbDownstreamDbs.filter((db) => {
      // Filter by Sub-DB
      if (selectedSubDbFilter !== 'ALL') {
        if (selectedSubDbFilter === 'DIRECT_MSB') {
          const isDirect =
            db.subDbId === currentMsb.id ||
            db.subDbId === currentMsb.code ||
            (isPrimaryMsb && (db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === 'msb-main'));
          if (!isDirect) return false;
        } else if (db.subDbId !== selectedSubDbFilter) {
          return false;
        }
      }

      // Filter by text search query
      if (dbSearchQuery.trim()) {
        const q = dbSearchQuery.toLowerCase();
        const matchesCode = db.code?.toLowerCase().includes(q);
        const matchesName = db.name?.toLowerCase().includes(q);
        const matchesLocation = db.location?.toLowerCase().includes(q);
        const matchesCircuits = db.circuits?.some(
          (c) => c.name?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q)
        );
        return matchesCode || matchesName || matchesLocation || matchesCircuits;
      }

      return true;
    });
  }, [msbDownstreamDbs, selectedSubDbFilter, dbSearchQuery, currentMsb, isPrimaryMsb]);

  // Aggregate project statistics for this MSB
  const totalCircuitsCount = msbDownstreamDbs.reduce((acc, d) => acc + d.circuits.length, 0);
  const totalFeedersCount = linkedSubDbs.length + directDbs.length;

  const effectiveProject: ElectricalProject = {
    ...project,
    msb: currentMsb,
    msbs: [currentMsb],
    subDbs: linkedSubDbs,
    dbs: msbDownstreamDbs,
    msbDirectLoads: directLoads,
    name: titleInput.trim() || project.name,
    engineer: engineerInput.trim() || project.engineer,
  };

  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    const trimmed = titleInput.trim() || 'Electrical Project';
    setTitleInput(trimmed);
    if (onUpdateProject) {
      onUpdateProject({
        ...project,
        name: trimmed,
        engineer: engineerInput.trim() || project.engineer,
      });
    }
  };

  const handleSaveEngineer = () => {
    setIsEditingEngineer(false);
    const trimmed = engineerInput.trim() || 'Senior Electrical PE';
    setEngineerInput(trimmed);
    if (onUpdateProject) {
      onUpdateProject({
        ...project,
        name: titleInput.trim() || project.name,
        engineer: trimmed,
      });
    }
  };

  // 1. Export Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      exportProjectToExcel(effectiveProject);
      setFeedbackMessage({
        type: 'success',
        text: 'Multi-tab Excel workbook (.xlsx) with Cable Schedule & Breaker Schedule exported.',
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Export failed: ${err.message || 'Unknown error'}`,
      });
    }
  };

  // 2. Import Excel (.xlsx) / CSV
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          if (!text) throw new Error('File content could not be read.');

          const { project: importedProject, summary } = parseCSVToProject(text, project);
          if (onImportProject) {
            onImportProject(importedProject);
          }
          setFeedbackMessage({
            type: 'success',
            text: summary,
          });
          setTimeout(() => setFeedbackMessage(null), 6000);
        } catch (err: any) {
          setFeedbackMessage({
            type: 'error',
            text: `Import Error: ${err.message || 'Invalid format or missing data.'}`,
          });
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) throw new Error('File content could not be read.');

          const { project: importedProject, summary } = parseExcelToProject(arrayBuffer, project);
          if (onImportProject) {
            onImportProject(importedProject);
          }
          setFeedbackMessage({
            type: 'success',
            text: summary,
          });
          setTimeout(() => setFeedbackMessage(null), 6000);
        } catch (err: any) {
          setFeedbackMessage({
            type: 'error',
            text: `Excel Import Error: ${err.message || 'Invalid Excel workbook structure.'}`,
          });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // 3. Generate & Download PDF
  const handleGeneratePdf = () => {
    try {
      setIsGeneratingPdf(true);
      generatePdfReport(effectiveProject);
      setFeedbackMessage({
        type: 'success',
        text: 'Formatted PDF report downloaded successfully.',
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `PDF Generation Failed: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Early return after all hooks are executed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-3 overflow-y-auto report-modal-backdrop">
      <div className="bg-white rounded-xl max-w-7xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[95vh] overflow-hidden report-modal-dialog">
        {/* 1. COMPACT STICKY TOP TOOLBAR */}
        <div className="shrink-0 px-3 sm:px-4 py-2 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between gap-3 no-print">
          {/* Left: Report identity badge */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 rounded bg-amber-500/10 text-amber-700 border border-amber-300/60 shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-slate-900 tracking-tight whitespace-nowrap">
                  Report Preview
                </span>
                <span className="hidden md:inline-flex items-center text-[10px] font-mono font-medium text-slate-500 bg-slate-200/60 px-1.5 py-0.2 rounded">
                  IEC 60364 / BS 7671
                </span>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons Group */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Multi-MSB Switcher tabs if project has more than 1 MSB */}
            {msbList.length > 1 && (
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-300 shadow-2xs no-print h-7">
                {msbList.map((m, mIdx) => {
                  const isSelected = m.id === currentMsb.id;
                  return (
                    <button
                      key={`report-msb-tab-${m.id || m.code}-${mIdx}`}
                      type="button"
                      onClick={() => setActiveMsbId(m.id)}
                      className={`h-6 px-2.5 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs ring-1 ring-amber-600/30'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title={`Switch to ${m.code} (${m.name || 'MSB'})`}
                    >
                      <span>{m.code}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Download PDF */}
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="px-3 h-7 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Download formatted multi-page PDF document"
            >
              <Download className="w-3 h-3 shrink-0" />
              <span>{isGeneratingPdf ? 'Generating...' : 'PDF'}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-0.5" />

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close Report (Esc)"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div
            className={`px-3 py-1.5 text-xs font-medium flex items-center justify-between no-print border-b ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. SCROLLABLE REPORT BODY */}
        <div id="report-printable-area" className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 text-slate-900">
          {/* HEADER TITLE BLOCK - Structured Executive Drawing Format */}
          <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
            {/* Top row: Project Title & Engineer */}
            <div className="px-3 py-2 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-mono font-bold tracking-wider text-amber-700 uppercase block">
                  ELECTRICAL MAXIMUM DEMAND & LOAD SCHEDULE REPORT
                </span>
                <div className="mt-0.5 flex items-center gap-2">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-1 w-full max-w-lg">
                      <input
                        type="text"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle();
                          if (e.key === 'Escape') {
                            setTitleInput(project.name);
                            setIsEditingTitle(false);
                          }
                        }}
                        onBlur={handleSaveTitle}
                        autoFocus
                        className="text-base sm:text-lg font-bold text-slate-900 font-mono px-1.5 py-0.5 rounded border border-amber-400 bg-amber-50/50 shadow-inner focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
                        placeholder="Enter Project Title"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTitle}
                        className="p-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 shrink-0 cursor-pointer"
                        title="Save Title"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsEditingTitle(true)}
                      className="group cursor-pointer flex items-center gap-1.5 hover:bg-amber-50/80 rounded px-1 py-0.5 -ml-1 transition-colors"
                      title="Click to edit project title"
                    >
                      <h1 className="text-base sm:text-lg font-bold text-slate-900 font-mono group-hover:text-amber-800 transition-colors">
                        {titleInput}
                      </h1>
                      <Pencil className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-amber-600 transition-all shrink-0 no-print" />
                    </div>
                  )}
                </div>
              </div>

              {/* Right side: Engineer & Date block */}
              <div className="flex items-center gap-3 text-xs font-mono self-start sm:self-center shrink-0">
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] block">Engineer:</span>
                  {isEditingEngineer ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={engineerInput}
                        onChange={(e) => setEngineerInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEngineer();
                          if (e.key === 'Escape') {
                            setEngineerInput(project.engineer || 'Senior Electrical PE');
                            setIsEditingEngineer(false);
                          }
                        }}
                        onBlur={handleSaveEngineer}
                        autoFocus
                        className="text-xs font-mono font-semibold text-slate-900 px-1 py-0.5 rounded border border-amber-400 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-500 text-right w-40"
                        placeholder="Engineer Name"
                      />
                      <button
                        type="button"
                        onClick={handleSaveEngineer}
                        className="p-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 shrink-0 cursor-pointer"
                        title="Save Engineer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => setIsEditingEngineer(true)}
                      className="group cursor-pointer inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-amber-800 hover:bg-amber-50/80 rounded px-1 py-0.2 transition-colors"
                      title="Click to edit engineer"
                    >
                      <span>{engineerInput}</span>
                      <Pencil className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-amber-600 transition-all no-print shrink-0" />
                    </span>
                  )}
                </div>

                <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                <div className="text-right hidden sm:block">
                  <span className="text-slate-400 text-[10px] block">Submittal Date:</span>
                  <span className="font-semibold text-slate-800">
                    {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom 4-cell metadata strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/70 text-xs font-mono">
              <div className="p-2 sm:px-3">
                <span className="text-slate-400 text-[10px] block uppercase">Electrical Supply</span>
                <span className="font-semibold text-slate-800 text-[11px]">
                  3P 4-Wire · {voltageSystem.Vll}V / {voltageSystem.Vln}V · {voltageSystem.frequency}Hz
                </span>
              </div>
              <div className="p-2 sm:px-3">
                <span className="text-slate-400 text-[10px] block uppercase">Design Standard</span>
                <span className="font-semibold text-slate-800 text-[11px]">
                  IEC 60364 / BS 7671 Verification
                </span>
              </div>
              <div className="p-2 sm:px-3">
                <span className="text-slate-400 text-[10px] block uppercase">Total Plant MD</span>
                <span className="font-bold text-amber-800 text-[11px]">
                  {currentMsb.totalPlantMaximumDemandKW.toFixed(1)} kW{' '}
                  <span className="text-slate-500 font-normal">({currentMsb.totalPlantMaximumDemandKVA.toFixed(1)} kVA)</span>
                </span>
              </div>
              <div className="p-2 sm:px-3">
                <span className="text-slate-400 text-[10px] block uppercase">Main Incomer & Ib</span>
                <span className="font-semibold text-emerald-800 text-[11px]">
                  {currentMsb.mainIncomerBreaker.description}{' '}
                  <span className="text-slate-500 font-normal">({currentMsb.totalPlantCurrentAmps.toFixed(0)}A)</span>
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1: MAIN SWITCH BOARD (MSB) EQUIPMENT SIZING */}
          <div className="space-y-2 break-inside-avoid">
            {/* Section 1 Header Strip */}
            <div className="bg-slate-100/90 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <h3 className="text-xs font-bold font-mono tracking-wider text-slate-900 uppercase">
                  1. MAIN SWITCH BOARD (MSB): {currentMsb.code} — {currentMsb.name}
                </h3>
              </div>

              <span className="text-[11px] font-mono text-slate-500">
                Building Diversity: {(currentMsb.overallBuildingDiversityFactor * 100).toFixed(0)}% · Target PF: {currentMsb.targetPowerFactor ?? 0.99}
              </span>
            </div>

            {/* 1. MSB 3-Column Overview Header Card (Matching MSB Overview Page UI) */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 items-start">
                {/* Column 1 (Left Card) - MSB Info & Sizing Parameters */}
                <div className="lg:col-span-4 space-y-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-base sm:text-lg text-slate-900">
                        {currentMsb.code}
                      </span>
                      <span className="ml-auto px-2 py-0.5 rounded text-[11px] font-semibold border inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border-amber-300 shadow-2xs">
                        <span>3-Phase (4-Wire)</span>
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
                      {currentMsb.name}
                    </div>
                  </div>

                  {/* Sizing Parameters Grid: Overall Diversity, Target Power Factor, Transformer Margin, Emergency Generator */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Overall Diversity:</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {currentMsb.overallBuildingDiversityFactor ?? 0.8}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          ({(((currentMsb.overallBuildingDiversityFactor ?? 0.8)) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">Target Power Factor:</span>
                      <span className="font-mono font-bold text-slate-800 text-xs">
                        {currentMsb.targetPowerFactor ?? 0.99}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">Transformer Margin:</span>
                      <span className="font-mono font-bold text-slate-800 text-xs">
                        +{currentMsb.safetyMarginPercent ?? 25}%
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">Emergency Generator:</span>
                      <span className="font-sans font-semibold text-slate-800 text-xs truncate block" title={getGeneratorScopeLabel(currentMsb.generatorSizingScope)}>
                        {getGeneratorScopeLabel(currentMsb.generatorSizingScope)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column 2 (Center Card) - Calculated Incomer & Loads */}
                <div className="lg:col-span-4 bg-slate-50/70 rounded-lg p-2.5 sm:p-3 border border-slate-200/80 space-y-2">
                  <div className="text-xs pb-1 border-b border-slate-200">
                    <span className="font-semibold text-slate-800">
                      Calculated Incomer & Loads
                    </span>
                  </div>

                  {/* Incomer, Busbar & Equipment Sizing List */}
                  <div className="space-y-1.5 text-xs font-mono">
                    {/* Breaker */}
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-900">
                        {currentMsb.mainIncomerBreaker?.description || 'Main Incomer Pending'}
                      </span>
                    </div>

                    {/* Busbar */}
                    <div className="flex items-center gap-2">
                      <GitFork className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-semibold text-slate-900">
                        Busbar: {currentMsb.busbarSizing?.formattedDescription || `${currentMsb.totalPlantCurrentAmps.toFixed(0)} A (3P @ ${voltageSystem.Vll}V)`}
                      </span>
                    </div>

                    {/* Transformer */}
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">
                        Transformer: {currentMsb.transformerSizing?.recommendedKVA ?? 0} kVA{' '}
                        <span className="text-emerald-700 font-medium">
                          ({(currentMsb.transformerSizing?.loadingPercent ?? 0).toFixed(1)}%)
                        </span>
                      </span>
                    </div>

                    {/* Generator */}
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">
                        Generator: {currentMsb.generatorSizing?.recommendedPrimeKVA ?? 0} kVA Prime{' '}
                        <span className="text-slate-600 font-medium">
                          ({(currentMsb.generatorSizing?.loadingPercent ?? 0).toFixed(1)}%)
                        </span>
                      </span>
                    </div>

                    {/* Capacitor Bank */}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <BatteryCharging className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="font-semibold text-slate-900 truncate">
                          Cap. Bank: {currentMsb.capacitorBankSizing?.recommendedBankKVAr ?? 0} kVAr@{currentMsb.vRated ?? 525}V{' '}
                          <span className="text-emerald-700 font-medium">
                            ({Math.round(currentMsb.capacitorBankSizing?.totalConfiguredKVArSupply ?? 0)} kVAr@{currentMsb.vSupply ?? 420}V)
                          </span>
                        </span>
                      </div>
                      <div className="pl-6 text-[11px] text-slate-500 font-mono">
                        {currentMsb.capacitorBankSizing?.recommendedSteps || '0 steps configured'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3 (Right Card) - Phase Balance (R-Y-B) & Load Categories Summary */}
                <div className="md:col-span-2 lg:col-span-4 bg-slate-50/70 rounded-lg p-2.5 sm:p-3 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-slate-800">
                        Phase Balance (R-Y-B)
                      </span>
                    </div>
                    {currentMsb.phaseBalance && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          currentMsb.phaseBalance.unbalancePercent <= 10
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : currentMsb.phaseBalance.unbalancePercent <= 20
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {currentMsb.phaseBalance.unbalancePercent.toFixed(1)}% ({currentMsb.phaseBalance.status})
                      </span>
                    )}
                  </div>

                  {/* Graphical Level Bars for R, Y, B */}
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-red-600 font-bold text-center">R</span>
                      <div className="flex-1 bg-slate-200 rounded-sm h-2 overflow-hidden">
                        <div
                          className="bg-red-500 h-full transition-all duration-300"
                          style={{ width: `${(pR / maxPhaseAmps) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-slate-800 text-[11px] tabular-nums font-semibold">
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
                      <span className="w-16 text-right text-slate-800 text-[11px] tabular-nums font-semibold">
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
                      <span className="w-16 text-right text-slate-800 text-[11px] tabular-nums font-semibold">
                        {pB.toFixed(1)} A
                      </span>
                    </div>
                  </div>

                  {/* Load Metrics Strip */}
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
                      <span>Total Fire Life-Safety:</span>
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
            </div>

            {/* MSB Phase Balance Table - Compact & High Density */}
            {currentMsb.phaseBalance && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="py-1 px-2.5">MSB Phase System</th>
                      <th className="py-1 px-2.5 text-right">Connected (kW)</th>
                      <th className="py-1 px-2.5 text-right">Connected (kVA)</th>
                      <th className="py-1 px-2.5 text-right">Demand (kW)</th>
                      <th className="py-1 px-2.5 text-right font-bold text-amber-900">Demand (kVA)</th>
                      <th className="py-1 px-2.5 text-right">Current (A)</th>
                      <th className="py-1 px-2.5 text-center">Neutral Current & Symmetry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-1 px-2.5 font-bold text-red-600 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shrink-0" />
                        <span>Phase R (Red Line)</span>
                      </td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseR.connectedKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseR.connectedKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseR.demandKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right font-bold text-amber-800 tabular-nums">{currentMsb.phaseBalance.phaseR.demandKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums font-semibold">{currentMsb.phaseBalance.phaseR.currentAmps.toFixed(1)} A</td>
                      <td className="py-1 px-2.5 text-center text-slate-500 font-sans text-[10px]">Supply Line 1</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-1 px-2.5 font-bold text-yellow-600 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block shrink-0" />
                        <span>Phase Y (Yellow Line)</span>
                      </td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseY.connectedKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseY.connectedKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseY.demandKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right font-bold text-amber-800 tabular-nums">{currentMsb.phaseBalance.phaseY.demandKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums font-semibold">{currentMsb.phaseBalance.phaseY.currentAmps.toFixed(1)} A</td>
                      <td className="py-1 px-2.5 text-center text-slate-700 font-semibold">
                        Neutral Current: {currentMsb.phaseBalance.neutralCurrentAmps.toFixed(1)} A
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-1 px-2.5 font-bold text-blue-600 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shrink-0" />
                        <span>Phase B (Blue Line)</span>
                      </td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseB.connectedKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseB.connectedKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums">{currentMsb.phaseBalance.phaseB.demandKW.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right font-bold text-amber-800 tabular-nums">{currentMsb.phaseBalance.phaseB.demandKVA.toFixed(1)}</td>
                      <td className="py-1 px-2.5 text-right tabular-nums font-semibold">{currentMsb.phaseBalance.phaseB.currentAmps.toFixed(1)} A</td>
                      <td className="py-1 px-2.5 text-center">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            currentMsb.phaseBalance.unbalancePercent <= 10
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : currentMsb.phaseBalance.unbalancePercent <= 20
                              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          Unbalance: {currentMsb.phaseBalance.unbalancePercent.toFixed(1)}% ({currentMsb.phaseBalance.status})
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* PFC Capacitor Bank Engineering & Step Ladder Schedule */}
            {currentMsb.capacitorBankSizing && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                {/* Header Strip */}
                <div className="bg-slate-100/90 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <BatteryCharging className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                      PFC Capacitor Bank Engineering & Step Ladder Schedule ({currentMsb.code})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-blue-900">
                      {currentMsb.capacitorBankSizing.recommendedBankKVAr} kVAr Bank
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-700 font-semibold">
                      Main Incomer: {currentMsb.capacitorBankSizing.mainIncomerBreakerRating}A ACB/MCCB
                    </span>
                  </div>
                </div>

                {/* Technical Specifications Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70 text-[11px] font-mono border-b border-slate-200">
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">Vsupply (Operating)</span>
                    <span className="font-semibold text-slate-800">{currentMsb.vSupply ?? 420} V (50Hz)</span>
                  </div>
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">Vrated (Capacitor)</span>
                    <span className="font-semibold text-slate-800">{currentMsb.vRated ?? 525} V</span>
                  </div>
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">De-rating Ratio</span>
                    <span className="font-semibold text-blue-700">
                      (V<sub>sup</sub>/V<sub>rat</sub>)<sup>2</sup> = {currentMsb.capacitorBankSizing.ratio.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">Target cos θ</span>
                    <span className="font-semibold text-slate-800">
                      {currentMsb.initialPowerFactor ?? 0.80} → {currentMsb.targetPowerFactor ?? 0.99}
                    </span>
                  </div>
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">Required Q</span>
                    <span className="font-semibold text-amber-800">
                      {currentMsb.capacitorBankSizing.requiredKVArSupply.toFixed(1)} kVAr @ {currentMsb.vSupply ?? 420}V
                    </span>
                  </div>
                  <div className="p-1.5 px-2.5">
                    <span className="text-slate-400 text-[10px] block uppercase">Configured Ladder</span>
                    <span className="font-bold text-emerald-800">
                      {currentMsb.capacitorBankSizing.totalConfiguredSteps ?? 0} of {currentMsb.capacitorStepsCount ?? 12} Steps Active
                    </span>
                  </div>
                </div>

                {/* Capacitor Step Ladder & Proposed Breakers Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-mono">
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                        <th className="py-1 px-2 w-8 text-center">#</th>
                        <th className="py-1 px-2.5 text-right">
                          Cap. Size Q <span className="text-[10px] text-slate-500 font-normal">(@{currentMsb.vRated ?? 525}V)</span>
                        </th>
                        <th className="py-1 px-2.5 text-right">
                          Effective Q <span className="text-[10px] text-slate-500 font-normal">(@{currentMsb.vSupply ?? 420}V)</span>
                        </th>
                        <th className="py-1 px-2 text-center w-24">Configured Qty</th>
                        <th className="py-1 px-2.5 text-right font-bold text-slate-900">
                          Total Q Rated <span className="text-[10px] text-slate-500 font-normal">(@{currentMsb.vRated ?? 525}V)</span>
                        </th>
                        <th className="py-1 px-2.5 text-right text-emerald-800 font-bold">
                          Effective Q <span className="text-[10px] text-slate-500 font-normal">(@{currentMsb.vSupply ?? 420}V)</span>
                        </th>
                        <th className="py-1 px-2.5 text-right">
                          Operating Current <span className="text-[10px] text-slate-500 font-normal">(1.5× FLC)</span>
                        </th>
                        <th className="py-1 px-2.5 text-center font-bold text-slate-900 min-w-[140px]">
                          Proposed Step MCCB Breaker
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {currentMsb.capacitorBankSizing.steps.map((step, idx) => {
                        const isConfigured = step.quantity > 0;
                        return (
                          <tr
                            key={step.sizeKVAr}
                            className={`transition-colors ${
                              isConfigured ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/40 text-slate-400'
                            }`}
                          >
                            <td className="py-1 px-2 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                            <td className="py-1 px-2.5 text-right font-bold text-slate-900">
                              {step.sizeKVAr} kVAr
                            </td>
                            <td className="py-1 px-2.5 text-right text-slate-600">
                              {(step.sizeKVAr * currentMsb.capacitorBankSizing.ratio).toFixed(1)} kVAr
                            </td>
                            <td className="py-1 px-2 text-center">
                              {isConfigured ? (
                                <span className="px-2 py-0.2 rounded font-bold bg-blue-50 text-blue-800 border border-blue-200 text-[10px]">
                                  {step.quantity} {step.quantity === 1 ? 'unit' : 'units'}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">0</span>
                              )}
                            </td>
                            <td className="py-1 px-2.5 text-right font-bold text-amber-800 tabular-nums">
                              {isConfigured ? `${step.totalKVArRated} kVAr` : '—'}
                            </td>
                            <td className="py-1 px-2.5 text-right font-bold text-emerald-800 tabular-nums">
                              {isConfigured ? `${step.effectiveKVArSupply.toFixed(1)} kVAr` : '—'}
                            </td>
                            <td className="py-1 px-2.5 text-right tabular-nums text-slate-800">
                              {isConfigured ? `${step.operatingCurrentAmps.toFixed(2)} A` : '—'}
                            </td>
                            <td className="py-1 px-2.5 text-center">
                              {isConfigured ? (
                                <span className="px-2 py-0.2 rounded font-bold bg-slate-100 text-slate-900 border border-slate-300 text-[10px]">
                                  {step.proposedMCCBRating}A 3-Pole MCCB
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">{step.proposedMCCBRating}A 3P MCCB</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Subtotal / Total Summary row */}
                      <tr className="bg-slate-100/90 font-bold border-t border-slate-300 text-[11px]">
                        <td colSpan={3} className="py-1.5 px-2.5 text-right font-sans text-slate-700 text-[10px] uppercase tracking-wider">
                          TOTAL PFC CAPACITOR BANK:
                        </td>
                        <td className="py-1.5 px-2 text-center text-blue-900 font-bold">
                          {currentMsb.capacitorBankSizing.totalConfiguredSteps ?? 0} active steps
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-bold text-amber-900 tabular-nums">
                          {currentMsb.capacitorBankSizing.totalConfiguredKVArRated} kVAr
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-bold text-emerald-900 tabular-nums">
                          {Math.round(currentMsb.capacitorBankSizing.totalConfiguredKVArSupply)} kVAr
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-600 font-normal text-[10px]">
                          FLC @ {currentMsb.vSupply ?? 420}V
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-bold text-blue-900">
                          {currentMsb.capacitorBankSizing.mainIncomerBreakerRating}A 3-Pole ACB/MCCB
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* MSB Direct Major Loads Table (if any) */}
            {directLoads && directLoads.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50/80 px-2.5 py-1 border-b border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-amber-600" />
                  <span>Direct Major Equipment Connected to {currentMsb.code}</span>
                </div>
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="py-1 px-2 w-7 text-center">#</th>
                      <th className="py-1 px-2">Equipment</th>
                      <th className="py-1 px-2">Category</th>
                      <th className="py-1 px-2 text-center">Genset</th>
                      <th className="py-1 px-2 text-right">Qty</th>
                      <th className="py-1 px-2 text-right">Unit (kW)</th>
                      <th className="py-1 px-2 text-right">CL (kW)</th>
                      <th className="py-1 px-2 text-right">PF</th>
                      <th className="py-1 px-2 text-right">DF</th>
                      <th className="py-1 px-2 text-right font-bold text-amber-900">MD (kW)</th>
                      <th className="py-1 px-2 text-right">Ib (A)</th>
                      <th className="py-1 px-2">Protective Breaker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {directLoads.map((l, i) => (
                      <tr key={`msb-direct-load-${l.id || l.code}-${i}`} className="hover:bg-slate-50/50">
                        <td className="py-1 px-2 text-center text-slate-400">{i + 1}</td>
                        <td className="py-1 px-2 font-bold text-slate-900">{l.name}</td>
                        <td className="py-1 px-2 font-sans text-slate-600">{l.equipmentType}</td>
                        <td className="py-1 px-2 text-center font-sans">
                          {l.isEssential ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Essential
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Normal</span>
                          )}
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums">{l.quantity}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{(l.unitWatts / 1000).toFixed(1)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{l.connectedLoadKW.toFixed(1)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{l.powerFactor.toFixed(2)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{l.diversityFactor.toFixed(2)}</td>
                        <td className="py-1 px-2 text-right font-bold text-amber-800 tabular-nums">
                          {l.maximumDemandKW.toFixed(1)}
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums">{l.currentIb.toFixed(1)}</td>
                        <td className="py-1 px-2 font-semibold text-slate-800 font-sans">{l.recommendedBreaker.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 2: SUB-DISTRIBUTION BOARDS & DIRECT FEEDERS SCHEDULE */}
          <div className="space-y-2 break-inside-avoid">
            <div className="bg-slate-100/90 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono font-bold tracking-wider text-slate-900 uppercase">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>2. SUB-DISTRIBUTION BOARDS (SB) & DIRECT FEEDERS SCHEDULE ({totalFeedersCount} FEEDERS)</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                    <th className="py-1.5 px-2 w-7 text-center">#</th>
                    <th className="py-1.5 px-2">Feeder Code</th>
                    <th className="py-1.5 px-2 min-w-[160px]">Description / Zone</th>
                    <th className="py-1.5 px-2 text-center">Supply Source</th>
                    <th className="py-1.5 px-2 text-right">Summed CL (kW)</th>
                    <th className="py-1.5 px-2 text-right">DF</th>
                    <th className="py-1.5 px-2 text-right font-bold text-amber-900">MD (kW)</th>
                    <th className="py-1.5 px-2 text-right">MD (kVA)</th>
                    <th className="py-1.5 px-2 text-right">Ib (A)</th>
                    <th className="py-1.5 px-2">Incomer Breaker</th>
                    <th className="py-1.5 px-2 text-center">Essential</th>
                    <th className="py-1.5 px-2 min-w-[170px]">Feeder Cable & Voltage Drop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {linkedSubDbs.map((sb, i) => (
                    <tr key={`report-subdb-${sb.id || sb.code}-${i}`} className="hover:bg-slate-50/60">
                      <td className="py-1 px-2 text-center text-slate-400">{i + 1}</td>
                      <td className="py-1 px-2 font-bold text-slate-900 whitespace-nowrap">
                        {sb.code} <span className="text-slate-400 font-normal text-[10px]">(Sub-DB)</span>
                      </td>
                      <td className="py-1 px-2 font-sans text-slate-800">{sb.name}</td>
                      <td className="py-1 px-2 text-center text-slate-600 font-sans text-[11px]">
                        {currentMsb.code}
                      </td>
                      <td className="py-1 px-2 text-right tabular-nums">{sb.connectedLoadKW.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{sb.groupDiversityFactor.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-bold text-amber-800 tabular-nums">
                        {sb.maximumDemandKW.toFixed(1)}
                      </td>
                      <td className="py-1 px-2 text-right tabular-nums">{sb.maximumDemandKVA.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{sb.incomerCurrentAmps.toFixed(1)}</td>
                      <td className="py-1 px-2 font-semibold text-slate-800 font-sans">
                        {sb.incomerBreaker?.description || 'N/A'}
                      </td>
                      <td className="py-1 px-2 text-center font-sans">
                        {sb.essentialGenset === 'FIRE_LIFT_SAFETY' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Fire
                          </span>
                        ) : sb.essentialGenset === 'ESSENTIAL' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Essential
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Normal</span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <div className="font-semibold text-slate-900 text-[11px]">{sb.incomerCable || 'N/A'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {sb.cableLengthMeters ?? 35}m · ΔV: {(sb.voltageDropPercent ?? 0).toFixed(2)}% ({(sb.voltageDropV ?? 0).toFixed(2)}V) ·{' '}
                          <span className={(sb.voltageDropPercent ?? 0) <= 4.0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {(sb.voltageDropPercent ?? 0) <= 4.0 ? '≤ 4% OK' : '> 4% High'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Direct DBs fed directly from MSB */}
                  {directDbs.map((db, i) => (
                    <tr key={`report-directdb-${db.id || db.code}-${i}`} className="bg-amber-50/20 hover:bg-amber-50/40">
                      <td className="py-1 px-2 text-center text-slate-400">{linkedSubDbs.length + i + 1}</td>
                      <td className="py-1 px-2 font-bold text-slate-900 whitespace-nowrap">
                        {db.code} <span className="text-amber-700 font-normal text-[10px]">(Direct DB)</span>
                      </td>
                      <td className="py-1 px-2 font-sans text-slate-800">{db.name}</td>
                      <td className="py-1 px-2 text-center text-amber-800 font-sans font-semibold text-[11px]">
                        Direct ({currentMsb.code})
                      </td>
                      <td className="py-1 px-2 text-right tabular-nums">{db.connectedLoadKW.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{db.boardDiversityFactor.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-bold text-amber-800 tabular-nums">
                        {db.maximumDemandKW.toFixed(1)}
                      </td>
                      <td className="py-1 px-2 text-right tabular-nums">{db.maximumDemandKVA.toFixed(1)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{db.incomerCurrentAmps.toFixed(1)}</td>
                      <td className="py-1 px-2 font-semibold text-slate-800 font-sans">
                        {db.incomerBreaker.description}
                      </td>
                      <td className="py-1 px-2 text-center font-sans">
                        {db.essentialGenset === 'FIRE_LIFT_SAFETY' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Fire
                          </span>
                        ) : db.essentialGenset === 'ESSENTIAL' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Essential
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Normal</span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <div className="font-semibold text-slate-900 text-[11px]">{db.incomerCable}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {db.cableLengthMeters ?? 25}m · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}% ({(db.voltageDropV ?? 0).toFixed(2)}V) ·{' '}
                          <span className={(db.voltageDropPercent ?? 0) <= 4.0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {(db.voltageDropPercent ?? 0) <= 4.0 ? '≤ 4% OK' : '> 4% High'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3: FINAL DISTRIBUTION BOARDS & COMPLETE CIRCUIT SCHEDULES */}
          <div className="space-y-2.5">
            {/* Section 3 Header Bar with Integrated Fast Filter & Search */}
            <div className="bg-slate-100/90 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center justify-between flex-wrap gap-2 text-xs font-mono font-bold tracking-wider text-slate-900 uppercase">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  3. FINAL DISTRIBUTION BOARDS & CIRCUIT SCHEDULES ({filteredDbs.length} of {msbDownstreamDbs.length} BOARDS)
                </span>
              </div>

              {/* Quick Jump & Filter Toolbar */}
              <div className="flex items-center gap-2 no-print font-normal text-xs normal-case">
                {/* Filter by Sub-DB */}
                <select
                  value={selectedSubDbFilter}
                  onChange={(e) => setSelectedSubDbFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                >
                  <option value="ALL">All Sources ({msbDownstreamDbs.length} DBs)</option>
                  {directDbs.length > 0 && (
                    <option value="DIRECT_MSB">Direct {currentMsb.code} ({directDbs.length} DBs)</option>
                  )}
                  {linkedSubDbs.map((s, sIdx) => {
                    const count = msbDownstreamDbs.filter((d) => d.subDbId === s.id || d.subDbId === s.code).length;
                    return (
                      <option key={`filter-subdb-${s.id || s.code}-${sIdx}`} value={s.id}>
                        {s.code} ({count} DBs)
                      </option>
                    );
                  })}
                </select>

                {/* Search input */}
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search boards/circuits..."
                    value={dbSearchQuery}
                    onChange={(e) => setDbSearchQuery(e.target.value)}
                    className="pl-6 pr-2 py-0.5 bg-white border border-slate-300 rounded text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 w-36 sm:w-44 font-sans"
                  />
                  {dbSearchQuery && (
                    <button
                      onClick={() => setDbSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Individual Distribution Board Panels - Single Unified Card Architecture (Zero nested card boxes) */}
            {filteredDbs.map((db, dbIdx) => {
              const isDirectMsb = db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === currentMsb.id || db.subDbId === currentMsb.code;
              const parentSubDb = !isDirectMsb ? subDbs.find((s) => s.id === db.subDbId || s.code === db.subDbId) : undefined;
              const sourceLabel = isDirectMsb ? `Direct MSB (${currentMsb.code})` : parentSubDb?.code || db.subDbId;

              // Phase badge styling matching DbView exactly
              const phaseBadge = db.isThreePhase ? (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300">
                  3-Phase (4W)
                </span>
              ) : (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                    (db.phase || 'R') === 'R'
                      ? 'bg-red-50 text-red-900 border-red-300'
                      : db.phase === 'Y'
                      ? 'bg-yellow-50 text-yellow-900 border-yellow-300'
                      : 'bg-blue-50 text-blue-900 border-blue-300'
                  }`}
                >
                  1-Phase (Phase {db.phase || 'R'} + N)
                </span>
              );

              return (
                <div
                  key={`report-db-card-${db.id || db.code}-${dbIdx}`}
                  className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs break-inside-avoid"
                >
                  {/* Integrated Board Header Bar */}
                  <div className="bg-slate-50/90 border-b border-slate-200 px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    {/* Left: Code, Name, Badges & Upstream Metadata */}
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">
                          {dbIdx + 1}. {db.code}
                        </span>
                        <span className="text-xs text-slate-700 font-medium font-sans truncate">
                          {db.name}
                        </span>
                        {phaseBadge}
                        {db.essentialGenset && db.essentialGenset !== 'NORMAL' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            {db.essentialGenset === 'FIRE_LIFT_SAFETY' ? 'Fire Life-Safety' : 'Essential Standby'}
                          </span>
                        )}
                      </div>

                      {/* Line 2: Parameters & Feed info */}
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                        <span>
                          Fed by: <strong className="text-slate-800 font-medium">{sourceLabel}</strong>
                        </span>
                        <span>·</span>
                        <span>Board DF: {(db.boardDiversityFactor * 100).toFixed(0)}%</span>
                        <span>·</span>
                        <span>Margin: +{db.safetyMarginPercent ?? 30}%</span>
                        <span>·</span>
                        <span>
                          {db.isThreePhase
                            ? `Unbalance: ${db.phaseBalance?.unbalancePercent?.toFixed(1) || 0}% (${db.phaseBalance?.status || 'OPTIMAL'})`
                            : `L-N @ ${voltageSystem.Vln}V`}
                        </span>
                      </div>
                    </div>

                    {/* Right: Board Sizing Summary Badges */}
                    <div className="flex items-center gap-3 text-xs font-mono shrink-0 sm:text-right border-t sm:border-t-0 pt-1 sm:pt-0 border-slate-200">
                      <div>
                        <div className="font-bold text-slate-900 text-[11px]">
                          MD: <span className="text-amber-800">{db.maximumDemandKW.toFixed(2)} kW</span> ({db.incomerCurrentAmps.toFixed(1)}A)
                        </div>
                        <div className="text-[10px] text-slate-600 font-sans">
                          Incomer: <strong className="text-slate-900">{db.incomerBreaker.description}</strong>
                        </div>
                      </div>

                      <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                      <div className="text-right">
                        <div className="font-medium text-slate-800 text-[11px] truncate max-w-[220px]" title={db.incomerCable}>
                          {db.incomerCable}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {db.cableLengthMeters ?? 25}m · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}% ({(db.voltageDropV ?? 0).toFixed(2)}V){' '}
                          <span className={db.voltageDropStatus === 'EXCEEDED' ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
                            {db.upstreamSourceType === 'SUBDB' && db.allowableVoltageDropPercent !== undefined
                              ? `≤ ${db.allowableVoltageDropPercent.toFixed(2)}% ${db.voltageDropStatus === 'EXCEEDED' ? 'High' : 'OK'}`
                              : `≤ 4% ${db.voltageDropStatus === 'EXCEEDED' ? 'High' : 'OK'}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Circuit Schedule Table - Seamlessly Integrated (No extra container nesting) */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead>
                        <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                          <th className="py-1 px-2 w-7 text-center">#</th>
                          <th className="py-1 px-2 font-sans min-w-[170px]">Circuit Description</th>
                          <th className="py-1 px-2 font-sans min-w-[100px]">Category</th>
                          <th className="py-1 px-2 text-center w-12">Phase</th>
                          <th className="py-1 px-2 text-right w-10">Qty</th>
                          <th className="py-1 px-2 text-right w-14">Load (W)</th>
                          <th className="py-1 px-2 text-right w-12">PF</th>
                          <th className="py-1 px-2 text-right w-12">DF</th>
                          <th className="py-1 px-2 text-right w-16">CL (kW)</th>
                          <th className="py-1 px-2 text-right w-16 font-bold text-amber-900">MD (kW)</th>
                          <th className="py-1 px-2 text-right w-14">Ib (A)</th>
                          <th className="py-1 px-2 font-sans min-w-[130px]">Protective Breaker</th>
                          <th className="py-1 px-2 font-sans min-w-[140px]">Cable Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {db.circuits.map((c, idx) => (
                          <tr key={`report-circuit-${db.id}-${c.id || c.name}-${idx}`} className="hover:bg-amber-50/30 transition-colors">
                            <td className="py-1 px-2 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                            <td className="py-1 px-2 font-sans text-slate-900 font-medium">{c.name}</td>
                            <td className="py-1 px-2 font-sans text-slate-600 text-[10px]">
                              {c.presetId ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 text-[10px]">
                                  <span>{effectiveProject.circuitPresets?.find((p) => p.id === c.presetId)?.name || 'Preset'}</span>
                                </span>
                              ) : (
                                c.category
                              )}
                            </td>
                            <td className="py-1 px-2 text-center font-bold">
                              <span
                                className={
                                  !db.isThreePhase
                                    ? 'text-blue-700'
                                    : c.phase === 'R'
                                    ? 'text-red-700'
                                    : c.phase === 'Y'
                                    ? 'text-yellow-700'
                                    : c.phase === 'B'
                                    ? 'text-blue-700'
                                    : 'text-slate-900'
                                }
                              >
                                {!db.isThreePhase ? '1P' : c.phase}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.quantity}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.unitWatts}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.powerFactor.toFixed(2)}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.diversityFactor.toFixed(2)}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.connectedLoadKW.toFixed(2)}</td>
                            <td className="py-1 px-2 text-right font-bold text-amber-800 tabular-nums">
                              {c.maximumDemandKW.toFixed(2)}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">{c.currentIb.toFixed(1)}</td>
                            <td className="py-1 px-2 font-sans text-slate-800 font-medium">
                              {c.recommendedBreaker?.description || 'N/A'}
                            </td>
                            <td className="py-1 px-2 font-sans text-slate-600">
                              {c.recommendedCable || 'N/A'}
                            </td>
                          </tr>
                        ))}

                        {/* Subtotal Row for the Board */}
                        <tr className="bg-slate-100/90 font-bold border-t border-slate-300 text-[11px]">
                          <td colSpan={8} className="py-1 px-2 text-right font-sans text-slate-700 text-[10px] uppercase tracking-wider">
                            TOTAL FOR {db.code}:
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums text-slate-900">
                            {db.connectedLoadKW.toFixed(2)}
                          </td>
                          <td className="py-1 px-2 text-right font-bold tabular-nums text-amber-900">
                            {db.maximumDemandKW.toFixed(2)}
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums text-slate-900">
                            {db.incomerCurrentAmps.toFixed(1)} A
                          </td>
                          <td className="py-1 px-2 font-sans text-slate-800 font-semibold">
                            {db.incomerBreaker.description}
                          </td>
                          <td className="py-1 px-2 font-sans text-slate-700">
                            {db.incomerCable}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {filteredDbs.length === 0 && (
              <div className="p-6 text-center text-slate-500 bg-white rounded-lg border border-slate-200 text-xs">
                No distribution boards match your current search or source filter.
              </div>
            )}
          </div>

          {/* DOCUMENT FOOTER NOTE */}
          <div className="pt-2 text-center text-[10px] text-slate-400 font-mono border-t border-slate-200">
            Report verified under IEC 60364 & BS 7671 engineering criteria · Voltage: {voltageSystem.Vll}V/{voltageSystem.Vln}V ({voltageSystem.frequency}Hz) · Generated by Electric Load Calculator
          </div>
        </div>
      </div>
    </div>
  );
};
