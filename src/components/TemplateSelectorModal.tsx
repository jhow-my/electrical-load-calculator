import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  LayoutTemplate,
  Building2,
  Building,
  Home,
  FileCode,
  Sliders,
  Info,
  FileUp,
  FileDown,
  Sparkles,
  ChevronDown,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { ElectricalProject } from '../types/electrical';
import {
  getStandardPresets,
  prepareProjectFromTemplate,
  computeTemplateStats,
} from '../utils/templateManager';
import {
  exportProjectToExcel,
  parseExcelToProject,
} from '../utils/excelProjectHandler';
import {
  exportProjectToCSV,
  parseCSVToProject,
} from '../utils/csvProjectHandler';
import { createBlankProject } from '../utils/sampleProjects';

interface TemplateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject?: ElectricalProject;
  activePresetId?: string;
  isModified?: boolean;
  onApplyTemplate: (project: ElectricalProject, templateId?: string) => void;
}

export const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  activePresetId = 'preset-blank',
  isModified = false,
  onApplyTemplate,
}) => {
  const standardPresets = getStandardPresets();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() =>
    isModified ? 'custom' : activePresetId || 'preset-blank'
  );

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExportMenuOpen]);

  // Automatically shift selection when modal opens:
  useEffect(() => {
    if (isOpen) {
      if (isModified) {
        setSelectedTemplateId('custom');
      } else {
        setSelectedTemplateId(activePresetId || 'preset-blank');
      }
      setNotification(null);
      setIsExportMenuOpen(false);
    }
  }, [isOpen, isModified, activePresetId]);

  if (!isOpen) return null;

  const isCustomSelected = selectedTemplateId === 'custom';

  // Handle Apply Template (only on clicking Apply button)
  const handleApplySelected = () => {
    if (isCustomSelected) {
      // Keep currently active modified configuration
      onClose();
      return;
    }
    const targetPreset = standardPresets.find((t) => t.id === selectedTemplateId);
    if (!targetPreset) return;
    const readyProject = prepareProjectFromTemplate(targetPreset);
    onApplyTemplate(readyProject, targetPreset.id);
    onClose();
  };

  // 1. Export Project to Excel (.xlsx) with all sheets, multiple MSBs, and cable schedules
  const handleExportExcel = () => {
    setIsExportMenuOpen(false);
    if (!currentProject) {
      showNotification('No project data available to export.', 'error');
      return;
    }
    try {
      const projName = currentProject.name || 'Electrical_Project';
      const sanitized = projName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      exportProjectToExcel(currentProject, `${sanitized}_Load_Schedule.xlsx`);
      showNotification('Project exported to Excel with full cable & breaker schedules.', 'success');
    } catch (err: any) {
      showNotification(`Export failed: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  // 2. Export Project Template as JSON (.json)
  const handleExportJSON = () => {
    setIsExportMenuOpen(false);
    if (!currentProject) {
      showNotification('No project data available to export.', 'error');
      return;
    }
    try {
      const projName = currentProject.name || 'Electrical_Project';
      const sanitized = projName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      const templateData = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        name: currentProject.name,
        description: currentProject.description,
        projectData: currentProject,
        stats: computeTemplateStats(currentProject),
      };
      const jsonStr = JSON.stringify(templateData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${sanitized}_Template.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('Project template exported as JSON file.', 'success');
    } catch (err: any) {
      showNotification(`JSON export failed: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  // 3. Export Project as CSV (.csv)
  const handleExportCSVFile = () => {
    setIsExportMenuOpen(false);
    if (!currentProject) {
      showNotification('No project data available to export.', 'error');
      return;
    }
    try {
      const projName = currentProject.name || 'Electrical_Project';
      const sanitized = projName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      exportProjectToCSV(currentProject, `${sanitized}_Load_Schedule.csv`);
      showNotification('Project exported as CSV file.', 'success');
    } catch (err: any) {
      showNotification(`CSV export failed: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  // Open file selector for Import (.xlsx, .xls, .csv, .json)
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fallback = currentProject || createBlankProject();
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
      const textReader = new FileReader();
      textReader.onload = (evt) => {
        try {
          const jsonText = evt.target?.result as string;
          if (!jsonText) {
            throw new Error('Unable to read the uploaded JSON template file.');
          }
          const parsed = JSON.parse(jsonText);
          const projectPayload: ElectricalProject = parsed.projectData || parsed;
          if (!projectPayload || (!projectPayload.dbs && !projectPayload.msb && !projectPayload.msbs)) {
            throw new Error('Invalid project template JSON: missing electrical distribution structure.');
          }
          if (projectPayload.dbs) {
            projectPayload.dbs.forEach((d) => {
              d.name = d.name !== undefined && d.name !== null ? String(d.name).trim() : '';
              if (d.circuits) {
                d.circuits.forEach((c) => {
                  if (c.quantity !== undefined && c.quantity !== null && String(c.quantity).trim() !== '' && !isNaN(Number(c.quantity))) {
                    c.quantity = Math.max(0, Math.round(Number(c.quantity)));
                  }
                });
              }
            });
          }
          if (projectPayload.subDbs) {
            projectPayload.subDbs.forEach((s) => {
              s.name = s.name !== undefined && s.name !== null ? String(s.name).trim() : '';
            });
          }
          if (projectPayload.msb) {
            projectPayload.msb.name = projectPayload.msb.name !== undefined && projectPayload.msb.name !== null ? String(projectPayload.msb.name).trim() : '';
          }
          if (projectPayload.msbs) {
            projectPayload.msbs.forEach((m) => {
              m.name = m.name !== undefined && m.name !== null ? String(m.name).trim() : '';
            });
          }
          const readyProject = prepareProjectFromTemplate({
            id: parsed.id || 'template-imported',
            name: parsed.name || projectPayload.name || 'Imported Template',
            description: parsed.description || projectPayload.description || '',
            category: 'USER',
            dateCreated: parsed.dateCreated || new Date().toISOString(),
            projectData: projectPayload,
            stats: computeTemplateStats(projectPayload),
          });
          onApplyTemplate(readyProject, 'custom');
          setSelectedTemplateId('custom');
          showNotification(
            `Template "${readyProject.name}" imported successfully (${readyProject.dbs?.length || 0} DBs restored).`,
            'success'
          );
        } catch (err: any) {
          showNotification(`Import failed: ${err.message || 'Invalid JSON template file.'}`, 'error');
        }
      };
      textReader.onerror = () => {
        showNotification('Error reading JSON template file.', 'error');
      };
      textReader.readAsText(file, 'utf-8');
    } else if (fileName.endsWith('.csv')) {
      const textReader = new FileReader();
      textReader.onload = (evt) => {
        try {
          const csvText = evt.target?.result as string;
          if (!csvText) {
            throw new Error('Unable to read the uploaded CSV template file.');
          }
          const { project: importedProject, summary } = parseCSVToProject(csvText, fallback);
          onApplyTemplate(importedProject, 'custom');
          setSelectedTemplateId('custom');
          showNotification(summary || 'CSV template imported successfully.', 'success');
        } catch (err: any) {
          showNotification(`Import failed: ${err.message || 'Invalid CSV template file.'}`, 'error');
        }
      };
      textReader.onerror = () => {
        showNotification('Error reading CSV template file.', 'error');
      };
      textReader.readAsText(file, 'utf-8');
    } else {
      const binaryReader = new FileReader();
      binaryReader.onload = (evt) => {
        try {
          const arrayBuffer = evt.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            throw new Error('Unable to read the uploaded template file.');
          }
          const { project: importedProject, summary } = parseExcelToProject(arrayBuffer, fallback);

          // Apply imported project as custom template data (inclusive of all cable & breaker schedules)
          onApplyTemplate(importedProject, 'custom');
          setSelectedTemplateId('custom');
          showNotification(summary || 'Excel template imported successfully with full schedules.', 'success');
        } catch (err: any) {
          showNotification(`Import failed: ${err.message || 'Invalid Excel template file.'}`, 'error');
        }
      };
      binaryReader.onerror = () => {
        showNotification('Error reading Excel template file.', 'error');
      };
      binaryReader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] space-y-4">
        {/* Hidden File Input for Excel/CSV/JSON Import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json"
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-2xs">
              <LayoutTemplate className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Project Templates
              </h3>
              <p className="text-xs text-slate-500">
                Select a template, import an existing file (.xlsx / .csv / .json), or export your current project.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shrink-0 ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <Sparkles
              className={`w-4 h-4 shrink-0 ${
                notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            />
            <span className="truncate">{notification.message}</span>
          </div>
        )}

        {/* Scrollable Templates List */}
        <div className="overflow-y-auto space-y-2.5 pr-1 max-h-[58vh]">
          {/* Built-in Presets */}
          {standardPresets.map((template) => {
            const isSelected = selectedTemplateId === template.id;

            return (
              <div
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                className={`group relative p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                {/* Left Column: Icon + Info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                      template.id.includes('commercial')
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : template.id.includes('management')
                        ? 'bg-teal-50 text-teal-600 border-teal-200'
                        : template.id.includes('residential')
                        ? 'bg-purple-50 text-purple-600 border-purple-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {template.id.includes('commercial') ? (
                      <Building2 className="w-5 h-5 text-blue-600" />
                    ) : template.id.includes('management') ? (
                      <Building className="w-5 h-5 text-teal-600" />
                    ) : template.id.includes('residential') ? (
                      <Home className="w-5 h-5 text-purple-600" />
                    ) : (
                      <FileCode className="w-5 h-5 text-slate-600" />
                    )}
                  </div>

                  {/* Template Title & Description */}
                  <div className="min-w-0">
                    <span
                      className={`text-sm font-bold block ${
                        isSelected ? 'text-amber-950' : 'text-slate-900'
                      }`}
                    >
                      {template.name}
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {template.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Custom Template State/Option */}
          <div
            onClick={() => {
              if (isModified) {
                setSelectedTemplateId('custom');
              }
            }}
            className={`group relative p-3.5 sm:p-4 rounded-xl border transition-all flex items-center justify-between gap-3 ${
              !isModified
                ? 'border-slate-200 bg-slate-50/50 opacity-60 cursor-not-allowed'
                : isCustomSelected
                ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/50 shadow-xs cursor-pointer'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Icon */}
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                  isCustomSelected
                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : isModified
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}
              >
                <Sliders className={`w-5 h-5 ${isModified ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>

              {/* Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold block ${
                      isCustomSelected ? 'text-amber-950' : isModified ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    Custom
                  </span>
                  {isModified && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300">
                      Modified
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  {isModified
                    ? 'Active working configuration with user-modified electrical parameters and distribution layout.'
                    : 'Automatically activates when changes are made to any preset template or an external file is imported.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Import, Export, and Apply buttons */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Export captures all MSB tabs, Sub-DBs, DBs, and schedules. Import restores exact state.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Import Button */}
            <button
              type="button"
              onClick={handleImportClick}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs border bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 hover:border-slate-400"
              title="Import project from Excel (.xlsx), JSON template (.json), or CSV file"
            >
              <FileUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Import</span>
            </button>

            {/* Export Dropdown Button */}
            <div className="relative" ref={exportMenuRef}>
              <div className="inline-flex rounded-lg shadow-2xs">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 rounded-l-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 hover:border-emerald-400"
                  title="Export complete project data to Excel (.xlsx)"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="px-1.5 py-1.5 rounded-r-lg text-xs font-semibold flex items-center transition-colors cursor-pointer border-t border-r border-b border-l-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 hover:border-emerald-400"
                  title="Choose export format (Excel, JSON template, CSV)"
                  aria-expanded={isExportMenuOpen}
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-emerald-700 transition-transform ${
                      isExportMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Dropdown Menu */}
              {isExportMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Export Options
                  </div>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-800">Excel Workbook (.xlsx)</div>
                      <div className="text-[10px] text-slate-500">8 sheets, cable & breaker schedules</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJSON}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 text-slate-700 hover:text-amber-900 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileCode className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-800">Project Template (.json)</div>
                      <div className="text-[10px] text-slate-500">Lossless template backup & restore</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSVFile}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-slate-700 hover:text-blue-900 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-800">CSV Spreadsheet (.csv)</div>
                      <div className="text-[10px] text-slate-500">Plain text tabular schedule</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Apply Button */}
            <button
              type="button"
              onClick={handleApplySelected}
              disabled={isCustomSelected && isModified}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                isCustomSelected && isModified
                  ? 'bg-slate-200 text-slate-400 cursor-default'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isCustomSelected && isModified ? 'Current' : 'Apply'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
