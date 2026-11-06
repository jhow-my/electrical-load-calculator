import React, { useState, useMemo, useEffect } from 'react';
import { CircuitPreset } from '../types/electrical';
import { DEFAULT_CIRCUIT_PRESETS } from '../utils/electricalCalculations';
import {
  X,
  Sliders,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  Check,
  Search,
  Lock,
  Zap,
  Info,
  Layers,
  ArrowRight,
  GripVertical,
} from 'lucide-react';
import { NumericInput } from './NumericInput';

const DecimalInput = NumericInput;

interface PresetGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: CircuitPreset[];
  onUpdatePresets: (newPresets: CircuitPreset[]) => void;
  circuitUsageCounts?: Record<string, number>; // presetId -> count of circuits using it
}

export const PresetGroupsModal: React.FC<PresetGroupsModalProps> = ({
  isOpen,
  onClose,
  presets,
  onUpdatePresets,
  circuitUsageCounts = {},
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Drag-and-drop state for manual row reordering
  const [draggedPresetId, setDraggedPresetId] = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);
  const [canDragPresetId, setCanDragPresetId] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filtered presets based on search query
  const filteredPresets = presets.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  // Update a single preset
  const handlePresetChange = (presetId: string, patch: Partial<CircuitPreset>) => {
    const updated = presets.map((p) => (p.id === presetId ? { ...p, ...patch } : p));
    onUpdatePresets(updated);
  };

  // Drag and drop handlers for reordering preset rows
  const handlePresetDragStart = (e: React.DragEvent, id: string) => {
    if (searchQuery.trim()) {
      e.preventDefault();
      return;
    }
    if (canDragPresetId !== id) {
      e.preventDefault();
      return;
    }
    const targetTag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'BUTTON', 'OPTION', 'TEXTAREA'].includes(targetTag)) {
      e.preventDefault();
      return;
    }
    setDraggedPresetId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handlePresetDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedPresetId !== null && draggedPresetId !== id) {
      setDragOverPresetId(id);
    }
  };

  const handlePresetDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedPresetId !== null && draggedPresetId !== targetId) {
      const fromIndex = presets.findIndex((p) => p.id === draggedPresetId);
      const toIndex = presets.findIndex((p) => p.id === targetId);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const reordered = [...presets];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        onUpdatePresets(reordered);
      }
    }
    setDraggedPresetId(null);
    setDragOverPresetId(null);
    setCanDragPresetId(null);
  };

  const handlePresetDragEnd = () => {
    setDraggedPresetId(null);
    setDragOverPresetId(null);
    setCanDragPresetId(null);
  };

  // Add a new preset group (suggesting next sequence like Type C, Type D, etc.)
  const handleAddPreset = () => {
    // Generate next unique name
    const existingNames = new Set(presets.map((p) => p.name.trim().toLowerCase()));
    let nextLetter = 'C';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      const candidate = `Type ${alphabet[i]}`;
      if (!existingNames.has(candidate.toLowerCase())) {
        nextLetter = alphabet[i];
        break;
      }
    }
    const newName = `Type ${nextLetter}`;
    const newId = `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newPreset: CircuitPreset = {
      id: newId,
      name: newName,
      category: 'CUSTOM',
      quantity: 1,
      unitWatts: 1,
      powerFactor: 1,
      diversityFactor: 1,
      description: `${newName} preset group`,
    };

    const updated = [...presets, newPreset];
    onUpdatePresets(updated);
  };

  // Duplicate an existing preset
  const handleDuplicatePreset = (source: CircuitPreset) => {
    const newId = `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newPreset: CircuitPreset = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
    };
    const updated = [...presets, newPreset];
    onUpdatePresets(updated);
  };

  // Delete a preset
  const handleDeletePreset = (presetId: string) => {
    const target = presets.find((p) => p.id === presetId);
    const usage = circuitUsageCounts[presetId] || 0;
    if (usage > 0) {
      const confirmDelete = window.confirm(
        `Preset "${target?.name || presetId}" is currently in use by ${usage} circuit${
          usage > 1 ? 's' : ''
        }.\n\nDeleting it will unlock these circuits into custom loads. Proceed?`
      );
      if (!confirmDelete) return;
    }
    const updated = presets.filter((p) => p.id !== presetId);
    onUpdatePresets(updated);
  };

  // Reset to default presets (Type A & Type B)
  const handleResetToDefaults = () => {
    const confirmReset = window.confirm(
      'Reset all presets back to the default Type A and Type B presets?'
    );
    if (!confirmReset) return;
    onUpdatePresets(JSON.parse(JSON.stringify(DEFAULT_CIRCUIT_PRESETS)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] flex flex-col">
        {/* Header Block */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <Sliders className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Circuit Preset Groups
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                {presets.length} Presets
              </span>
            </div>
            <p className="text-xs text-slate-500 w-full leading-relaxed">
              Standardize circuit specifications across your project. When a circuit selects a
              preset from the dropdown, electrical parameters (<strong>Load, PF, DF</strong>) are locked to the preset group,
              while <strong>Qty</strong> remains customizable per circuit in the schedule. Any modification to electrical baselines here instantly propagates to all linked circuits.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Close (Esc)"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search, Reset, Add Preset */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search preset name or category..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Reset presets list to default Type A and Type B"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleAddPreset}
              className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Preset Group</span>
            </button>
          </div>
        </div>

        {/* Table View structured similarly to Circuit Schedule */}
        <div className="flex-1 overflow-x-auto border border-slate-200 rounded-xl bg-white min-h-[220px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                <th className="py-2 px-1 w-8 text-center text-slate-400 select-none" title="Drag handle to reorder rows">
                  <GripVertical className="w-3.5 h-3.5 mx-auto text-slate-400" />
                </th>
                <th className="py-2 px-2.5 w-10 text-center">#</th>
                <th className="py-2 px-2.5 w-[20%] min-w-[130px]">Preset Name</th>
                <th className="py-2 px-2.5 w-16 text-right" title="Preset default Quantity">
                  Qty
                </th>
                <th className="py-2 px-2.5 w-20 text-right" title="Preset Watts per unit">
                  Load (W)
                </th>
                <th className="py-2 px-2.5 w-16 text-right" title="Preset Power Factor">
                  PF
                </th>
                <th className="py-2 px-2.5 w-16 text-right" title="Preset Diversity Factor">
                  DF
                </th>
                <th
                  className="py-2 px-2.5 w-20 text-right text-slate-600"
                  title="Connected Load: (Qty × Unit Watts) ÷ 1000"
                >
                  CL (kW)
                </th>
                <th
                  className="py-2 px-2.5 w-20 text-right font-semibold text-amber-900"
                  title="Maximum Demand: CL × DF"
                >
                  MD (kW)
                </th>
                <th className="py-2 px-2.5 w-[20%] min-w-[140px] text-center" title="Active circuits using this preset">
                  Circuits Using
                </th>
                <th className="py-2 px-2.5 w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
              {filteredPresets.map((preset, index) => {
                const clKW = (preset.quantity * preset.unitWatts) / 1000;
                const mdKW = clKW * preset.diversityFactor;
                const usage = circuitUsageCounts[preset.id] || 0;
                const isSearching = Boolean(searchQuery.trim());

                return (
                  <tr
                    key={preset.id}
                    draggable={!isSearching && canDragPresetId === preset.id}
                    onDragStart={(e) => handlePresetDragStart(e, preset.id)}
                    onDragOver={(e) => handlePresetDragOver(e, preset.id)}
                    onDragLeave={() => {
                      if (dragOverPresetId === preset.id) setDragOverPresetId(null);
                    }}
                    onDrop={(e) => handlePresetDrop(e, preset.id)}
                    onDragEnd={handlePresetDragEnd}
                    className={`transition-all duration-150 group ${
                      draggedPresetId === preset.id
                        ? 'opacity-35 bg-amber-50/70 border-2 border-dashed border-amber-400 scale-[0.99]'
                        : dragOverPresetId === preset.id
                        ? 'bg-amber-100/90 border-y-2 border-amber-500 shadow-sm'
                        : 'hover:bg-amber-50/40'
                    }`}
                  >
                    {/* Drag Handle (Only this handle initiates row reordering) */}
                    <td
                      className="py-1 px-1 text-center text-slate-400 select-none"
                      title={
                        isSearching
                          ? 'Manual reordering is disabled while search filter is active. Clear search to reorder.'
                          : 'Click and drag handle to reorder preset group'
                      }
                    >
                      <span
                        onMouseDown={() => {
                          if (!isSearching) setCanDragPresetId(preset.id);
                        }}
                        onMouseUp={() => setCanDragPresetId(null)}
                        onTouchStart={() => {
                          if (!isSearching) setCanDragPresetId(preset.id);
                        }}
                        onTouchEnd={() => setCanDragPresetId(null)}
                        className={`inline-flex p-0.5 rounded transition-colors ${
                          isSearching
                            ? 'cursor-not-allowed opacity-30 text-slate-300'
                            : 'hover:bg-slate-200/80 hover:text-slate-700 cursor-grab active:cursor-grabbing text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                    </td>

                    {/* Index */}
                    <td className="py-1.5 px-2.5 text-center text-slate-500 font-medium">
                      {index + 1}
                    </td>

                    {/* Preset Name */}
                    <td className="py-1.5 px-2.5 font-sans">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <input
                          type="text"
                          value={preset.name}
                          onChange={(e) =>
                            handlePresetChange(preset.id, { name: e.target.value })
                          }
                          className="w-full bg-transparent hover:bg-slate-100 focus:bg-white border-b border-transparent focus:border-amber-500 rounded px-1.5 py-0.5 text-xs text-slate-900 font-bold focus:outline-none"
                          placeholder="Preset Name (e.g. Type A)"
                        />
                      </div>
                    </td>

                    {/* Qty */}
                    <td className="py-1.5 px-2.5 text-right">
                      <NumericInput
                        min={0}
                        step={1}
                        allowDecimals={false}
                        fallbackValue={1}
                        value={preset.quantity}
                        onChange={(val) => {
                          handlePresetChange(preset.id, {
                            quantity: val,
                          });
                        }}
                        className="w-12 text-right bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-amber-500 rounded px-1 py-0.5 text-xs tabular-nums font-semibold text-slate-800"
                        aria-label={`Quantity for ${preset.name}`}
                      />
                    </td>

                    {/* Load (W) */}
                    <td className="py-1.5 px-2.5 text-right">
                      <NumericInput
                        min={0}
                        step={10}
                        allowDecimals={true}
                        fallbackValue={1000}
                        value={preset.unitWatts}
                        onChange={(val) =>
                          handlePresetChange(preset.id, {
                            unitWatts: val,
                          })
                        }
                        className="w-16 text-right bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-amber-500 rounded px-1 py-0.5 text-xs tabular-nums font-semibold text-slate-800"
                        aria-label={`Load (W) for ${preset.name}`}
                      />
                    </td>

                    {/* PF */}
                    <td className="py-1.5 px-2.5 text-right">
                      <DecimalInput
                        min={0}
                        max={1.0}
                        step={0.01}
                        value={preset.powerFactor}
                        onChange={(val) => handlePresetChange(preset.id, { powerFactor: val })}
                        className="w-12 text-right bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-amber-500 rounded px-1 py-0.5 text-xs tabular-nums font-semibold text-slate-800"
                        aria-label={`Power factor for ${preset.name}`}
                      />
                    </td>

                    {/* DF */}
                    <td className="py-1.5 px-2.5 text-right">
                      <DecimalInput
                        min={0}
                        max={1.0}
                        step={0.05}
                        value={preset.diversityFactor}
                        onChange={(val) =>
                          handlePresetChange(preset.id, { diversityFactor: val })
                        }
                        className="w-12 text-right bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-amber-500 rounded px-1 py-0.5 text-xs tabular-nums font-bold text-slate-900"
                        aria-label={`Diversity factor for ${preset.name}`}
                      />
                    </td>

                    {/* CL (kW) */}
                    <td className="py-1.5 px-2.5 text-right text-slate-700 tabular-nums font-medium">
                      {clKW.toFixed(2)}
                    </td>

                    {/* MD (kW) */}
                    <td className="py-1.5 px-2.5 text-right font-bold text-amber-700 tabular-nums">
                      {mdKW.toFixed(2)}
                    </td>

                    {/* Active Circuits in Project */}
                    <td className="py-1.5 px-2.5 text-center font-sans">
                      {usage > 0 ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1"
                          title={`${usage} circuit${usage > 1 ? 's' : ''} in this project use this preset`}
                        >
                          <Lock className="w-2.5 h-2.5 text-amber-700" />
                          <span>{usage} circuit{usage > 1 ? 's' : ''}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">0 circuits</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-1.5 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicatePreset(preset)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Duplicate Preset"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset.id)}
                          disabled={presets.length <= 1}
                          className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                          title={
                            presets.length <= 1
                              ? 'At least one preset must remain'
                              : 'Delete Preset'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredPresets.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400 font-sans">
                    No preset groups found matching &ldquo;{searchQuery}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & Done button */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Preset changes are automatically applied and synchronized across all active circuits. Click and drag the handle to reorder rows.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer shadow-xs ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
