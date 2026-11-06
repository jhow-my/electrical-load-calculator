/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ElectricalProject,
  DistributionBoard,
  SubDistributionBoard,
  MainSwitchBoard,
  MsbDirectLoad,
  VoltageSystem,
} from './types/electrical';
import { recalculateAll, autoBalanceSubDBDownstreamDBs, autoBalanceMsbDownstream, getDuplicateFeederName } from './utils/electricalCalculations';
import {
  createCommercialOfficeProject,
  createResidentialTowerProject,
  createBuildingManagementProject,
  createBlankProject,
} from './utils/sampleProjects';
import { Header } from './components/Header';
import { DbView } from './components/DbView';
import { SubDbView } from './components/SubDbView';
import { MsbView } from './components/MsbView';
import { SingleLineDiagram } from './components/SingleLineDiagram';
import { VoltageSelectorModal } from './components/VoltageSelectorModal';
import { FormulaExplainerModal } from './components/FormulaExplainerModal';
import { ReportModal } from './components/ReportModal';
import { CableScheduleModal } from './components/CableScheduleModal';
import { TemplateSelectorModal } from './components/TemplateSelectorModal';
import { CableScheduleEntry, CableDefinitionEntry, CircuitPreset } from './types/electrical';
import { DEFAULT_CABLE_SCHEDULE, DEFAULT_CABLE_DEFINITIONS, DEFAULT_CIRCUIT_PRESETS } from './utils/electricalCalculations';

export default function App() {
  const [project, setProject] = useState<ElectricalProject>(() =>
    createBlankProject()
  );

  const [activeTab, setActiveTab] = useState<'MSB' | 'SUBDB' | 'DB' | 'SLD'>('DB');
  const [selectedDbId, setSelectedDbId] = useState<string>(
    () => project.dbs[0]?.id || 'db-1'
  );
  const [selectedSubDbId, setSelectedSubDbId] = useState<string>(() => project.subDbs[0]?.id || 'sb-1');
  const [selectedMsbId, setSelectedMsbId] = useState<string>(
    () => project.msbs?.[0]?.id || project.msb?.id || 'msb-main'
  );

  // Preset & modification tracking: Custom activates when user modifies any preset
  const [activePresetId, setActivePresetId] = useState<string>('preset-blank');
  const [isModified, setIsModified] = useState<boolean>(false);

  // Modals state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isVoltageModalOpen, setIsVoltageModalOpen] = useState(false);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isCableScheduleModalOpen, setIsCableScheduleModalOpen] = useState(false);

  // Master update helper that runs recalculateAll with active or customized Sizing Reference & multiple MSBs
  const applyCalculations = (
    dbs: DistributionBoard[],
    subDbs: SubDistributionBoard[],
    msb: MainSwitchBoard,
    directLoads: MsbDirectLoad[],
    voltage: VoltageSystem = project.voltageSystem,
    schedule: CableScheduleEntry[] = project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
    msbs: MainSwitchBoard[] = project.msbs || [msb],
    overrideSelectedMsbId?: string,
    cableDefs: CableDefinitionEntry[] = project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
    circuitPresets: CircuitPreset[] = project.circuitPresets || DEFAULT_CIRCUIT_PRESETS
  ) => {
    setIsModified(true);
    const activeId = overrideSelectedMsbId ?? selectedMsbId;
    const calculated = recalculateAll(dbs, subDbs, msb, directLoads, voltage, schedule, msbs, cableDefs);
    const activeMsb =
      calculated.msbs?.find((m) => m.id === activeId) ||
      calculated.msbs?.[0] ||
      calculated.msb;

    setProject((prev) => ({
      ...prev,
      voltageSystem: voltage,
      cableSchedule: schedule,
      cableDefinitions: cableDefs,
      circuitPresets: circuitPresets || prev.circuitPresets || DEFAULT_CIRCUIT_PRESETS,
      dbs: calculated.dbs,
      subDbs: calculated.subDbs,
      msb: activeMsb,
      msbs: calculated.msbs,
      msbDirectLoads: calculated.directLoads,
      lastModified: new Date().toISOString(),
    }));
  };

  // Update Sizing Reference (Breakers & Cables) Globally
  const handleUpdateCableSchedule = (
    newSchedule: CableScheduleEntry[],
    newCableDefinitions?: CableDefinitionEntry[]
  ) => {
    const activeDefs = newCableDefinitions || project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS;
    applyCalculations(
      project.dbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads,
      project.voltageSystem,
      newSchedule,
      project.msbs || [project.msb],
      undefined,
      activeDefs
    );
  };

  // Switch Project Template
  const handleSelectPreset = (preset: 'commercial' | 'residential' | 'blank' | 'management') => {
    let newProj: ElectricalProject;
    let presetId = 'preset-blank';
    if (preset === 'commercial') {
      newProj = createCommercialOfficeProject();
      presetId = 'preset-commercial';
    } else if (preset === 'residential') {
      newProj = createResidentialTowerProject();
      presetId = 'preset-residential';
    } else if (preset === 'management') {
      newProj = createBuildingManagementProject();
      presetId = 'preset-building-management';
    } else {
      newProj = createBlankProject();
      presetId = 'preset-blank';
    }
    setProject(newProj);
    setActivePresetId(presetId);
    setIsModified(false);
    setSelectedDbId(newProj.dbs[0]?.id || '');
    setSelectedSubDbId(newProj.subDbs[0]?.id || '');
    setSelectedMsbId(newProj.msbs?.[0]?.id || newProj.msb?.id || 'msb-main');
  };

  // Update Circuit Presets Globally and synchronize to all linked circuits
  const handleUpdateCircuitPresets = (newPresets: CircuitPreset[]) => {
    // Propagate changes to all circuits using these presets across all DBs
    const updatedDbs = project.dbs.map((db) => {
      let changed = false;
      const updatedCircuits = db.circuits.map((c) => {
        if (c.presetId) {
          const matched = newPresets.find((p) => p.id === c.presetId);
          if (matched) {
            changed = true;
            return {
              ...c,
              unitWatts: matched.unitWatts,
              powerFactor: matched.powerFactor,
              diversityFactor: matched.diversityFactor,
              category: matched.category || c.category,
            };
          } else {
            // Preset was deleted, unlink circuit to make it custom
            changed = true;
            return {
              ...c,
              presetId: undefined,
            };
          }
        }
        return c;
      });
      return changed ? { ...db, circuits: updatedCircuits } : db;
    });

    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      project.msbs || [project.msb],
      undefined,
      project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
      newPresets
    );
  };

  // Import Project from CSV or External File or Preset Template
  const handleImportProject = (importedProject: ElectricalProject, presetId?: string) => {
    const sanitizedDbs = (importedProject.dbs || []).map((db) => ({
      ...db,
      name: db.name !== undefined && db.name !== null ? String(db.name).trim() : '',
      circuits: (db.circuits || []).map((c) => ({
        ...c,
        quantity:
          typeof c.quantity === 'number' && !isNaN(c.quantity)
            ? Math.max(0, Math.round(c.quantity))
            : c.quantity !== undefined && c.quantity !== null && String(c.quantity).trim() !== '' && !isNaN(Number(c.quantity))
            ? Math.max(0, Math.round(Number(c.quantity)))
            : 1,
      })),
    }));
    const sanitizedSubDbs = (importedProject.subDbs || []).map((sb) => ({
      ...sb,
      name: sb.name !== undefined && sb.name !== null ? String(sb.name).trim() : '',
    }));
    const rawMsbs = (importedProject.msbs && importedProject.msbs.length > 0
      ? importedProject.msbs
      : importedProject.msb
      ? [importedProject.msb]
      : []
    ).map((m) => ({
      ...m,
      name: m.name !== undefined && m.name !== null ? String(m.name).trim() : '',
    }));
    const rawPrimaryMsb = rawMsbs[0] || {
      ...importedProject.msb,
      name: importedProject.msb?.name !== undefined && importedProject.msb?.name !== null ? String(importedProject.msb.name).trim() : '',
    };

    const sanitizedDirectLoads = (importedProject.msbDirectLoads || []).map((l) => ({
      ...l,
      quantity:
        typeof l.quantity === 'number' && !isNaN(l.quantity)
          ? Math.max(0, Math.round(l.quantity))
          : l.quantity !== undefined && l.quantity !== null && String(l.quantity).trim() !== '' && !isNaN(Number(l.quantity))
          ? Math.max(0, Math.round(Number(l.quantity)))
          : 1,
    }));

    const calculated = recalculateAll(
      sanitizedDbs,
      sanitizedSubDbs,
      rawPrimaryMsb,
      sanitizedDirectLoads,
      importedProject.voltageSystem,
      importedProject.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      rawMsbs,
      importedProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS
    );

    const activeMsb = calculated.msbs?.[0] || calculated.msb;
    const finalProject: ElectricalProject = {
      ...importedProject,
      voltageSystem: importedProject.voltageSystem,
      cableSchedule: importedProject.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      cableDefinitions: importedProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
      circuitPresets: importedProject.circuitPresets || DEFAULT_CIRCUIT_PRESETS,
      dbs: calculated.dbs,
      subDbs: calculated.subDbs,
      msb: activeMsb,
      msbs: calculated.msbs,
      msbDirectLoads: calculated.directLoads,
      lastModified: new Date().toISOString(),
    };

    setProject(finalProject);
    if (presetId && presetId !== 'custom') {
      setActivePresetId(presetId);
      setIsModified(false);
    } else {
      setActivePresetId('custom');
      setIsModified(true);
    }
    setSelectedMsbId(activeMsb.id);
    const firstSubDb = calculated.subDbs.find((s) => s.msbId === activeMsb.id) || calculated.subDbs[0];
    setSelectedSubDbId(firstSubDb?.id || '');
    const firstDbForSub = calculated.dbs.find((d) => d.subDbId === firstSubDb?.id || d.subDbId === activeMsb.id) || calculated.dbs[0];
    setSelectedDbId(firstDbForSub?.id || calculated.dbs[0]?.id || '');
  };

  // Change Voltage System
  const handleSelectVoltage = (newVoltage: VoltageSystem) => {
    applyCalculations(
      project.dbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads,
      newVoltage,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      project.msbs || [project.msb]
    );
  };

  // Update Project Info (Name, Engineer, etc.)
  const handleUpdateProject = (updatedProject: ElectricalProject) => {
    setProject(updatedProject);
    setIsModified(true);
  };

  // Update a DB
  const handleUpdateDb = (updatedDb: DistributionBoard) => {
    const updatedDbs = project.dbs.map((d) => (d.id === updatedDb.id ? updatedDb : d));
    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
  };

  // Add DB
  // Add DB
  const handleAddDb = () => {
    const newId = `db-${Date.now()}`;
    const existingDbCodes = new Set(project.dbs.map((d) => d.code.toUpperCase()));
    let newCode = `DB-${project.dbs.length + 1}`;
    while (existingDbCodes.has(newCode.toUpperCase())) {
      newCode = getDuplicateFeederName(newCode);
    }
    const newDb: DistributionBoard = {
      id: newId,
      code: newCode,
      name: '', // Left empty for user to write
      location: 'Electrical Riser',
      subDbId: selectedSubDbId || project.subDbs[0]?.id || 'sb-1',
      isThreePhase: true,
      boardDiversityFactor: 1,
      safetyMarginPercent: 30,
      circuits: [
        {
          id: `c-init-${Date.now()}`,
          name: 'General Lighting Circuit 1',
          category: 'LIGHTING',
          phase: 'R',
          quantity: 12,
          unitWatts: 45,
          powerFactor: 0.95,
          diversityFactor: 0.85,
          connectedLoadKW: 0,
          connectedLoadKVA: 0,
          maximumDemandKW: 0,
          maximumDemandKVA: 0,
          currentIb: 0,
          recommendedBreaker: {} as any,
          recommendedCable: '',
        },
      ],
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      incomerCurrentAmps: 0,
      phaseBalance: {} as any,
      incomerBreaker: {} as any,
      incomerCable: '',
    };
    const updatedDbs = [...project.dbs, newDb];
    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
    setSelectedDbId(newId);
  };

  // Delete DB
  const handleDeleteDb = (id: string) => {
    if (project.dbs.length <= 1) return;
    const updatedDbs = project.dbs.filter((d) => d.id !== id);
    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
    if (selectedDbId === id) {
      setSelectedDbId(updatedDbs[0]?.id || '');
    }
  };

  // Duplicate DB
  const handleDuplicateDb = (db: DistributionBoard) => {
    const newId = `db-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const existingDbCodes = new Set(project.dbs.map((d) => d.code.toUpperCase()));
    let newDbCode = getDuplicateFeederName(db.code);
    while (existingDbCodes.has(newDbCode.toUpperCase())) {
      newDbCode = getDuplicateFeederName(newDbCode);
    }
    const newDb: DistributionBoard = {
      ...db,
      id: newId,
      code: newDbCode,
      name: db.name, // Keep exact same description as original
      circuits: db.circuits.map((c, idx) => ({
        ...c,
        id: `c-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      })),
    };
    const dbIndex = project.dbs.findIndex((d) => d.id === db.id);
    const updatedDbs =
      dbIndex >= 0
        ? [
            ...project.dbs.slice(0, dbIndex + 1),
            newDb,
            ...project.dbs.slice(dbIndex + 1),
          ]
        : [...project.dbs, newDb];

    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
    setSelectedDbId(newId);
  };

  // Reorder DBs globally
  const handleReorderDbs = (reorderedDbs: DistributionBoard[]) => {
    applyCalculations(
      reorderedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
  };

  // Reorder Sub-DBs globally
  const handleReorderSubDbs = (reorderedSubDbs: SubDistributionBoard[]) => {
    applyCalculations(
      project.dbs,
      reorderedSubDbs,
      project.msb,
      project.msbDirectLoads
    );
  };

  // Update a Sub-DB
  const handleUpdateSubDb = (updatedSubDb: SubDistributionBoard) => {
    const updatedSubDbs = project.subDbs.map((s) =>
      s.id === updatedSubDb.id ? updatedSubDb : s
    );
    applyCalculations(
      project.dbs,
      updatedSubDbs,
      project.msb,
      project.msbDirectLoads
    );
  };

  // Add Sub-DB
  const handleAddSubDb = () => {
    const newId = `sb-${Date.now()}`;
    const existingSubDbCodes = new Set(project.subDbs.map((s) => s.code.toUpperCase()));
    let newCode = `SB-${String(project.subDbs.length + 1).padStart(2, '0')}`;
    while (existingSubDbCodes.has(newCode.toUpperCase())) {
      newCode = getDuplicateFeederName(newCode);
    }
    const newSubDb: SubDistributionBoard = {
      id: newId,
      code: newCode,
      name: '', // Left empty for user to write
      location: 'Sub-Switchroom',
      msbId: selectedMsbId || project.msb.id,
      groupDiversityFactor: 0.9,
      safetyMarginPercent: 20,
      connectedDbIds: [],
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      incomerCurrentAmps: 0,
      incomerBreaker: {} as any,
      incomerCable: '',
    };
    const updatedSubDbs = [...project.subDbs, newSubDb];
    applyCalculations(
      project.dbs,
      updatedSubDbs,
      project.msb,
      project.msbDirectLoads
    );
    setSelectedSubDbId(newId);
  };

  // Duplicate Sub-DB with all content and connected DBs / sub-feeders
  const handleDuplicateSubDb = (subDb: SubDistributionBoard) => {
    const newSubDbId = `sb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Generate unique Sub-DB code
    const existingSubDbCodes = new Set(project.subDbs.map((s) => s.code.toUpperCase()));
    let newSubDbCode = getDuplicateFeederName(subDb.code);
    while (existingSubDbCodes.has(newSubDbCode.toUpperCase())) {
      newSubDbCode = getDuplicateFeederName(newSubDbCode);
    }
    const newSubDbName = subDb.name; // Keep exact same description as original

    // Find all Final DBs connected directly to this Sub-DB
    const connectedDbs = project.dbs.filter((db) => db.subDbId === subDb.id);

    // Track DB codes to prevent any collision across existing and cloned DBs
    const existingDbCodes = new Set(project.dbs.map((d) => d.code.toUpperCase()));

    // Deep clone each connected DB, re-pointing subDbId to newSubDbId and cloning all circuits
    const clonedDbs: DistributionBoard[] = connectedDbs.map((db, idx) => {
      const newDbId = `db-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;

      let newDbCode = getDuplicateFeederName(db.code);
      while (existingDbCodes.has(newDbCode.toUpperCase())) {
        newDbCode = getDuplicateFeederName(newDbCode);
      }
      existingDbCodes.add(newDbCode.toUpperCase());

      const newDbName = db.name; // Keep exact same description as original

      const clonedCircuits = db.circuits.map((c, cIdx) => ({
        ...c,
        id: `c-${Date.now()}-${idx}-${cIdx}-${Math.random().toString(36).substring(2, 6)}`,
      }));

      return {
        ...db,
        id: newDbId,
        code: newDbCode,
        name: newDbName,
        subDbId: newSubDbId,
        circuits: clonedCircuits,
      };
    });

    const newSubDb: SubDistributionBoard = {
      ...subDb,
      id: newSubDbId,
      code: newSubDbCode,
      name: newSubDbName,
      connectedDbIds: clonedDbs.map((d) => d.id),
    };

    // Insert new Sub-DB immediately following the original Sub-DB
    const subDbIndex = project.subDbs.findIndex((s) => s.id === subDb.id);
    const updatedSubDbs =
      subDbIndex >= 0
        ? [
            ...project.subDbs.slice(0, subDbIndex + 1),
            newSubDb,
            ...project.subDbs.slice(subDbIndex + 1),
          ]
        : [...project.subDbs, newSubDb];

    // Insert cloned DBs immediately following the last connected DB of this Sub-DB (or at end)
    const lastDbIndex = project.dbs.reduce(
      (maxIdx, d, idx) => (d.subDbId === subDb.id ? idx : maxIdx),
      -1
    );
    const updatedDbs =
      lastDbIndex >= 0
        ? [
            ...project.dbs.slice(0, lastDbIndex + 1),
            ...clonedDbs,
            ...project.dbs.slice(lastDbIndex + 1),
          ]
        : [...project.dbs, ...clonedDbs];

    applyCalculations(
      updatedDbs,
      updatedSubDbs,
      project.msb,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      project.msbs || [project.msb]
    );

    setSelectedSubDbId(newSubDbId);
    if (clonedDbs.length > 0) {
      setSelectedDbId(clonedDbs[0].id);
    }
  };

  // Delete Sub-DB
  const handleDeleteSubDb = (id: string) => {
    if (project.subDbs.length <= 1) return;
    const remaining = project.subDbs.filter((s) => s.id !== id);
    const fallbackSubDbId = remaining[0].id;
    // Reassign orphaned DBs to fallback Sub-DB
    const updatedDbs = project.dbs.map((db) =>
      db.subDbId === id ? { ...db, subDbId: fallbackSubDbId } : db
    );
    applyCalculations(
      updatedDbs,
      remaining,
      project.msb,
      project.msbDirectLoads
    );
    if (selectedSubDbId === id) {
      setSelectedSubDbId(fallbackSubDbId);
    }
  };

  // Run Auto-Balance at Sub-DB level across downstream DBs
  const handleAutoBalanceSubDb = (
    subDbId: string,
    priorityOrder?: ('R' | 'Y' | 'B')[],
    cycleIndex?: number
  ) => {
    const updatedDbs = autoBalanceSubDBDownstreamDBs(
      subDbId,
      project.dbs,
      project.voltageSystem,
      priorityOrder,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
      cycleIndex
    );
    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads
    );
  };

  // Run Auto-Balance at MSB level across all downstream Sub-DBs and DBs
  const handleAutoBalanceMsb = (
    priorityOrder?: ('R' | 'Y' | 'B')[],
    cycleIndex?: number
  ) => {
    const currentMsb =
      project.msbs?.find((m) => m.id === selectedMsbId) ||
      project.msb;
    const updatedDbs = autoBalanceMsbDownstream(
      project.dbs,
      project.subDbs,
      project.voltageSystem,
      priorityOrder,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      selectedMsbId,
      project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
      cycleIndex,
      project.msbDirectLoads || [],
      currentMsb?.overallBuildingDiversityFactor || 1.0
    );
    applyCalculations(
      updatedDbs,
      project.subDbs,
      project.msb,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      project.msbs || [project.msb]
    );
  };

  // Update MSB
  const handleUpdateMsb = (updatedMsb: MainSwitchBoard) => {
    const currentMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb];
    const updatedMsbs = currentMsbs.map((m) => (m.id === updatedMsb.id ? updatedMsb : m));
    applyCalculations(
      project.dbs,
      project.subDbs,
      updatedMsb,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      updatedMsbs,
      updatedMsb.id
    );
  };

  // Add MSB
  const handleAddMsb = () => {
    const currentMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb];
    const newId = `msb-${Date.now()}`;
    const existingMsbCodes = new Set(currentMsbs.map((m) => m.code.toUpperCase()));
    let newCode = `MSB-${String(currentMsbs.length + 1).padStart(2, '0')}`;
    while (existingMsbCodes.has(newCode.toUpperCase())) {
      newCode = getDuplicateFeederName(newCode);
    }
    const newMsb: MainSwitchBoard = {
      id: newId,
      code: newCode,
      name: '', // Left empty for user to write
      location: 'Main Substation / LV Switchroom',
      overallBuildingDiversityFactor: 0.80,
      targetPowerFactor: 0.99,
      safetyMarginPercent: 25,
      generatorSizingScope: 'FIRE_LIFT_SAFETY_AND_ESSENTIAL',
      vRated: 525,
      vSupply: 420,
      capacitorStepsCount: 12,
      initialPowerFactor: 0.80,
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      summedSubDbDemandKW: 0,
      summedSubDbDemandKVA: 0,
      summedMajorLoadsDemandKW: 0,
      summedMajorLoadsDemandKVA: 0,
      essentialLoadsDemandKW: 0,
      essentialLoadsDemandKVA: 0,
      totalPlantMaximumDemandKW: 0,
      totalPlantMaximumDemandKVA: 0,
      totalPlantCurrentAmps: 0,
      mainIncomerBreaker: {} as any,
      transformerSizing: {} as any,
      generatorSizing: {} as any,
      capacitorBankSizing: {} as any,
    };
    const updatedMsbs = [...currentMsbs, newMsb];
    setSelectedMsbId(newId);
    applyCalculations(
      project.dbs,
      project.subDbs,
      newMsb,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      updatedMsbs,
      newId
    );
  };

  // Duplicate MSB
  const handleDuplicateMsb = (sourceMsb: MainSwitchBoard) => {
    const currentMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb];
    const newId = `msb-${Date.now()}`;
    const existingMsbCodes = new Set(currentMsbs.map((m) => m.code.toUpperCase()));
    let newCode = getDuplicateFeederName(sourceMsb.code);
    while (existingMsbCodes.has(newCode.toUpperCase())) {
      newCode = getDuplicateFeederName(newCode);
    }
    const duplicated: MainSwitchBoard = {
      ...sourceMsb,
      id: newId,
      code: newCode,
      name: sourceMsb.name, // Keep exact same description as original
    };
    const updatedMsbs = [...currentMsbs, duplicated];
    setSelectedMsbId(newId);
    applyCalculations(
      project.dbs,
      project.subDbs,
      duplicated,
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      updatedMsbs,
      newId
    );
  };

  // Delete MSB
  const handleDeleteMsb = (id: string) => {
    const currentMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb];
    if (currentMsbs.length <= 1) return;
    const remaining = currentMsbs.filter((m) => m.id !== id);
    const fallbackMsbId = remaining[0].id;
    // Reassign orphaned Sub-DBs to fallback MSB
    const updatedSubDbs = project.subDbs.map((sb) =>
      sb.msbId === id ? { ...sb, msbId: fallbackMsbId } : sb
    );
    // Reassign orphaned direct DBs to fallback MSB
    const updatedDbs = project.dbs.map((db) =>
      db.subDbId === id ? { ...db, subDbId: fallbackMsbId } : db
    );
    const targetId = selectedMsbId === id ? fallbackMsbId : selectedMsbId;
    setSelectedMsbId(targetId);
    applyCalculations(
      updatedDbs,
      updatedSubDbs,
      remaining[0],
      project.msbDirectLoads,
      project.voltageSystem,
      project.cableSchedule || DEFAULT_CABLE_SCHEDULE,
      remaining,
      targetId
    );
  };

  // Update MSB Direct Loads
  const handleUpdateDirectLoads = (loads: MsbDirectLoad[]) => {
    applyCalculations(
      project.dbs,
      project.subDbs,
      project.msb,
      loads
    );
  };

  // Quick navigation handlers between views
  const handleNavigateToDb = (dbId: string) => {
    setSelectedDbId(dbId);
    setActiveTab('DB');
  };

  const handleNavigateToSubDb = (subDbId: string) => {
    setSelectedSubDbId(subDbId);
    setActiveTab('SUBDB');
  };

  const handleNavigateToMsb = (msbId?: string) => {
    if (msbId) {
      setSelectedMsbId(msbId);
    }
    setActiveTab('MSB');
  };

  const activeMsb =
    project.msbs?.find((m) => m.id === selectedMsbId) ||
    project.msbs?.[0] ||
    project.msb;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        voltageSystem={project.voltageSystem}
        onOpenTemplateModal={() => setIsTemplateModalOpen(true)}
        onOpenVoltageModal={() => setIsVoltageModalOpen(true)}
        onOpenFormulaModal={() => setIsFormulaModalOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenCableScheduleModal={() => setIsCableScheduleModalOpen(true)}
        onSelectPreset={handleSelectPreset}
      />

      {/* Main Content Area - Responsive for Mobile & Tablet */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-2 sm:pt-2.5 pb-4 sm:pb-6">
        {/* Tab View Render */}
        {activeTab === 'MSB' && (
          <MsbView
            msb={activeMsb}
            msbs={project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb]}
            selectedMsbId={selectedMsbId}
            onSelectMsbId={setSelectedMsbId}
            onAddMsb={handleAddMsb}
            onDeleteMsb={handleDeleteMsb}
            onDuplicateMsb={handleDuplicateMsb}
            subDbs={project.subDbs}
            dbs={project.dbs}
            directLoads={project.msbDirectLoads}
            onUpdateMsb={handleUpdateMsb}
            onUpdateDirectLoads={handleUpdateDirectLoads}
            onNavigateToSubDb={handleNavigateToSubDb}
            onNavigateToDb={handleNavigateToDb}
            onDuplicateSubDb={handleDuplicateSubDb}
            onDeleteSubDb={handleDeleteSubDb}
            onDuplicateDb={handleDuplicateDb}
            onDeleteDb={handleDeleteDb}
            onUpdateSubDb={handleUpdateSubDb}
            onUpdateDb={handleUpdateDb}
            onReorderSubDbs={handleReorderSubDbs}
            onReorderDbs={handleReorderDbs}
            onAutoBalanceMsb={handleAutoBalanceMsb}
            voltageSystem={project.voltageSystem}
            cableSchedule={project.cableSchedule || DEFAULT_CABLE_SCHEDULE}
          />
        )}

        {activeTab === 'SUBDB' && (
          <SubDbView
            subDbs={project.subDbs}
            dbs={project.dbs}
            msbs={project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb]}
            selectedSubDbId={selectedSubDbId}
            onSelectSubDbId={setSelectedSubDbId}
            onUpdateSubDb={handleUpdateSubDb}
            onAddSubDb={handleAddSubDb}
            onDeleteSubDb={handleDeleteSubDb}
            onDuplicateSubDb={handleDuplicateSubDb}
            onNavigateToDb={handleNavigateToDb}
            onNavigateToMsb={handleNavigateToMsb}
            onAutoBalanceSubDb={handleAutoBalanceSubDb}
            voltageSystem={project.voltageSystem}
            onUpdateDb={handleUpdateDb}
            onDuplicateDb={handleDuplicateDb}
            onDeleteDb={handleDeleteDb}
            onReorderDbs={handleReorderDbs}
            cableSchedule={project.cableSchedule || DEFAULT_CABLE_SCHEDULE}
          />
        )}

        {activeTab === 'DB' && (
          <DbView
            dbs={project.dbs}
            subDbs={project.subDbs}
            msb={activeMsb}
            msbs={project.msbs && project.msbs.length > 0 ? project.msbs : [project.msb]}
            selectedDbId={selectedDbId}
            onSelectDbId={setSelectedDbId}
            onUpdateDb={handleUpdateDb}
            onAddDb={handleAddDb}
            onDeleteDb={handleDeleteDb}
            onDuplicateDb={handleDuplicateDb}
            voltageSystem={project.voltageSystem}
            onNavigateToSubDb={handleNavigateToSubDb}
            onNavigateToMsb={handleNavigateToMsb}
            circuitPresets={project.circuitPresets || DEFAULT_CIRCUIT_PRESETS}
            onUpdateCircuitPresets={handleUpdateCircuitPresets}
            allDbs={project.dbs}
            cableSchedule={project.cableSchedule || DEFAULT_CABLE_SCHEDULE}
          />
        )}

        {activeTab === 'SLD' && (
          <SingleLineDiagram
            msb={activeMsb}
            subDbs={project.subDbs}
            dbs={project.dbs}
            directLoads={project.msbDirectLoads}
            onNavigateToDb={handleNavigateToDb}
            onNavigateToSubDb={handleNavigateToSubDb}
            onNavigateToMsb={handleNavigateToMsb}
            voltageSystem={project.voltageSystem}
          />
        )}
      </main>

      {/* Footer - Bright Theme */}
      <footer className="bg-white border-t border-slate-200 py-3.5 text-xs text-slate-600 font-mono mt-auto no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-semibold text-slate-800">Developed by J.H.WONG</span>
            <span aria-hidden="true"> · </span>
            <span>IEC 60364 / BS 7671</span>
            <span aria-hidden="true"> · </span>
            <span>{project.voltageSystem.label}</span>
          </div>
          <div>
            <span>{activeMsb.code} MD: <strong className="text-amber-700">{activeMsb.totalPlantMaximumDemandKW.toFixed(1)} kW</strong></span>
            <span aria-hidden="true"> · </span>
            <span>Current: <strong className="text-slate-900">{activeMsb.totalPlantCurrentAmps.toFixed(0)} A</strong></span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <TemplateSelectorModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        currentProject={project}
        activePresetId={activePresetId}
        isModified={isModified}
        onApplyTemplate={handleImportProject}
      />

      <VoltageSelectorModal
        isOpen={isVoltageModalOpen}
        onClose={() => setIsVoltageModalOpen(false)}
        currentVoltage={project.voltageSystem}
        onSelectVoltage={handleSelectVoltage}
      />

      <FormulaExplainerModal
        isOpen={isFormulaModalOpen}
        onClose={() => setIsFormulaModalOpen(false)}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        project={project}
        initialMsbId={selectedMsbId}
        onImportProject={handleImportProject}
        onUpdateProject={handleUpdateProject}
      />

      <CableScheduleModal
        isOpen={isCableScheduleModalOpen}
        onClose={() => setIsCableScheduleModalOpen(false)}
        currentSchedule={project.cableSchedule || DEFAULT_CABLE_SCHEDULE}
        currentCableDefinitions={project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS}
        onApplySchedule={handleUpdateCableSchedule}
      />
    </div>
  );
}
