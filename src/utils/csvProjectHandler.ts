/**
 * CSV Export & Import Utility for Electrical Load Calculator
 * Packages complete multi-tier electrical project hierarchy:
 * - Multi-MSB tabs, Sub-DBs, Final DBs, Circuits, Major Equipment Direct Loads
 * - Voltage System parameters & busbar configuration
 * - Cable Definitions, Breaker Schedule, and Circuit Presets
 * And restores exact state without data duplication or name corruption.
 */

import {
  ElectricalProject,
  DistributionBoard,
  SubDistributionBoard,
  MainSwitchBoard,
  MsbDirectLoad,
  Circuit,
  CircuitCategory,
  PhaseType,
  EssentialGensetType,
  VoltageSystem,
  CableScheduleEntry,
  CableDefinitionEntry,
  CircuitPreset,
  BusbarMaterial,
  GeneratorSizingScope,
} from '../types/electrical';
import {
  recalculateAll,
  VOLTAGE_PRESETS,
  DEFAULT_CABLE_SCHEDULE,
  DEFAULT_CABLE_DEFINITIONS,
  DEFAULT_CIRCUIT_PRESETS,
  normalizeCableName,
} from './electricalCalculations';

/**
 * Escapes a cell value for CSV (quotes if contains comma, quote, or newline)
 */
function escapeCSV(val: any): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Parses raw CSV text into a 2D string array, respecting quoted strings, escaped quotes, and newlines.
 */
export function parseCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  // Normalize line breaks
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.length > 0 && r.some((c) => c !== ''));
}

/**
 * Fallback mapping to resolve corrupted internal IDs to human-readable cable sizes
 */
function healCableString(rawStr: string | undefined): string {
  if (!rawStr) return '';
  const s = rawStr.trim();
  if (s.startsWith('cdef-') || s.startsWith('cs-')) {
    const matchDef = DEFAULT_CABLE_DEFINITIONS.find((c) => c.id === s);
    if (matchDef) return matchDef.cableSize;
    const matchSched = DEFAULT_CABLE_SCHEDULE.find((c) => c.id === s);
    if (matchSched) return matchSched.cableSize;
  }
  return s;
}

/**
 * Safely parses integer values preserving 0 (does not treat 0 as falsy fallback).
 */
function parseSafeInt(val: any, fallback: number = 1): number {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const clean = String(val).replace(/[^0-9-]/g, '').trim();
  const parsed = parseInt(clean, 10);
  return !isNaN(parsed) ? parsed : fallback;
}

/**
 * Safely parses float values preserving 0 (does not treat 0 as falsy fallback).
 */
function parseSafeFloat(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const clean = String(val).replace(/[^0-9.-]/g, '').trim();
  const parsed = parseFloat(clean);
  return !isNaN(parsed) ? parsed : fallback;
}

/**
 * Packages the entire project into a structured and human-readable CSV.
 */
export function exportProjectToCSV(project: ElectricalProject, customFilename?: string): string {
  const { msb, subDbs, dbs, msbDirectLoads, voltageSystem } = project;
  const allMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [msb];
  const rows: string[][] = [];

  // 1. PROJECT METADATA SECTION
  rows.push(['#SECTION:PROJECT_METADATA']);
  rows.push(['Field', 'Value']);
  rows.push(['Project Name', project.name || 'Electrical Project']);
  rows.push(['Description', project.description || '']);
  rows.push(['Engineer / Consultant', project.engineer || 'Consulting Electrical Engineer']);
  rows.push(['Client', project.client || '']);
  rows.push(['Standard', voltageSystem.standard]);
  rows.push(['Voltage System ID', voltageSystem.id]);
  rows.push(['Voltage System Label', voltageSystem.label]);
  rows.push(['Vll (Line-Line Volts)', voltageSystem.Vll.toString()]);
  rows.push(['Vln (Line-Neutral Volts)', voltageSystem.Vln.toString()]);
  rows.push(['Frequency (Hz)', voltageSystem.frequency.toString()]);
  rows.push(['Export Timestamp', new Date().toISOString()]);
  rows.push([]);

  // 2. MAIN SWITCHBOARD (MSB) SECTION - ALL MSBS
  rows.push(['#SECTION:MAIN_SWITCHBOARDS']);
  rows.push([
    'MSB ID',
    'MSB Code',
    'MSB Name',
    'Location',
    'Overall Diversity Factor',
    'Safety Margin Percent',
    'Transformer Utilization Percent',
    'Target Power Factor',
    'Generator Sizing Scope',
    'Manual Transformer kVA',
    'Manual Generator kVA',
    'Manual Incomer Breaker Rating',
    'Busbar Material',
    'Busbar Current Density',
    'Busbar Design Current ID',
    'Busbar Icw kA',
    'Busbar Fault Duration',
    'Busbar Selected Width',
    'Busbar Selected Thickness',
    'Busbar Selected Runs',
    'Busbar Manual Override',
    'V Rated',
    'V Supply',
    'Capacitor Steps Count',
    'Initial Power Factor',
    'Custom Capacitor Steps (JSON)',
  ]);

  allMsbs.forEach((m) => {
    rows.push([
      m.id,
      m.code,
      m.name,
      m.location || 'Main Substation',
      m.overallBuildingDiversityFactor.toString(),
      (m.safetyMarginPercent ?? 25).toString(),
      (m.txUtilizationPercent ?? m.utilizationPercent ?? 80).toString(),
      (m.targetPowerFactor ?? 0.99).toString(),
      m.generatorSizingScope || 'ESSENTIAL_LOADS_ONLY',
      m.manualTransformerKVA !== undefined ? m.manualTransformerKVA.toString() : '',
      m.manualGeneratorKVA !== undefined ? m.manualGeneratorKVA.toString() : '',
      m.manualMainIncomerBreakerRating !== undefined ? m.manualMainIncomerBreakerRating.toString() : '',
      m.busbarMaterial || 'COPPER',
      m.busbarCurrentDensity !== undefined ? m.busbarCurrentDensity.toString() : '',
      m.busbarDesignCurrentId !== undefined ? m.busbarDesignCurrentId.toString() : 'INCOMER_BREAKER',
      m.busbarIcwKA !== undefined ? m.busbarIcwKA.toString() : '',
      m.busbarFaultDuration !== undefined ? m.busbarFaultDuration.toString() : '',
      m.busbarSelectedWidth !== undefined ? m.busbarSelectedWidth.toString() : '',
      m.busbarSelectedThickness !== undefined ? m.busbarSelectedThickness.toString() : '',
      m.busbarSelectedRuns !== undefined ? m.busbarSelectedRuns.toString() : '',
      m.busbarManualOverride ? 'TRUE' : 'FALSE',
      (m.vRated ?? 525).toString(),
      (m.vSupply ?? 420).toString(),
      (m.capacitorStepsCount ?? 12).toString(),
      (m.initialPowerFactor ?? 0.8).toString(),
      m.customCapacitorSteps ? JSON.stringify(m.customCapacitorSteps) : '',
    ]);
  });
  rows.push([]);

  // 3. DIRECT MAJOR EQUIPMENT LOADS
  if (msbDirectLoads && msbDirectLoads.length > 0) {
    rows.push(['#SECTION:DIRECT_MAJOR_LOADS']);
    rows.push([
      'Load ID',
      'Supplying MSB ID',
      'Equipment Code',
      'Equipment Name',
      'Equipment Type',
      'Essential (Genset)',
      'Quantity',
      'Unit Watts (W)',
      'Power Factor',
      'Diversity Factor',
      'Connected Load (kW)',
      'Maximum Demand (kW)',
      'Current Ib (A)',
      'Protective Breaker',
      'Recommended Cable',
      'Notes',
    ]);
    msbDirectLoads.forEach((l) => {
      rows.push([
        l.id,
        (l as any).msbId || allMsbs[0]?.id || 'msb-main',
        l.code || '',
        l.name,
        l.equipmentType,
        l.isEssential ? 'YES' : 'NO',
        l.quantity.toString(),
        l.unitWatts.toString(),
        l.powerFactor.toString(),
        l.diversityFactor.toString(),
        l.connectedLoadKW.toFixed(2),
        l.maximumDemandKW.toFixed(2),
        l.currentIb.toFixed(1),
        l.recommendedBreaker?.description || '',
        l.recommendedCable || '',
        l.notes || '',
      ]);
    });
    rows.push([]);
  }

  // 4. SUB-DISTRIBUTION BOARDS (LEVEL 2)
  rows.push(['#SECTION:SUB_DISTRIBUTION_BOARDS']);
  rows.push([
    'Sub-DB ID',
    'Supplying MSB ID',
    'Sub-DB Code',
    'Sub-DB Name',
    'Location',
    'Group Diversity Factor',
    'Safety Margin Percent',
    'Utilization Percent',
    'Essential Genset',
    'Cable Length (m)',
    'Voltage Drop Basis',
    'Manual Cable Override',
    'Manual Breaker Rating Override',
  ]);
  subDbs.forEach((sb) => {
    rows.push([
      sb.id,
      sb.msbId || allMsbs[0]?.id || 'msb-main',
      sb.code,
      sb.name,
      sb.location || 'Sub-Switchroom',
      sb.groupDiversityFactor.toString(),
      (sb.safetyMarginPercent ?? 20).toString(),
      (sb.utilizationPercent ?? 80).toString(),
      sb.essentialGenset || '',
      (sb.cableLengthMeters ?? 35).toString(),
      sb.voltageDropBasis || 'BREAKER',
      sb.manualIncomerCable || '',
      sb.manualIncomerBreakerRating ? sb.manualIncomerBreakerRating.toString() : '',
    ]);
  });
  rows.push([]);

  // 5. FINAL DISTRIBUTION BOARDS (LEVEL 1)
  rows.push(['#SECTION:FINAL_DISTRIBUTION_BOARDS']);
  rows.push([
    'DB ID',
    'Supplying Sub-DB ID',
    'DB Code',
    'DB Name',
    'Location',
    'Is Three Phase',
    'Assigned Single Phase',
    'Board Diversity Factor',
    'Safety Margin Percent',
    'Utilization Percent',
    'Essential Genset',
    'Cable Length (m)',
    'Voltage Drop Basis',
    'Manual Cable Override',
    'Manual Breaker Rating Override',
  ]);
  dbs.forEach((db) => {
    rows.push([
      db.id,
      db.subDbId,
      db.code,
      db.name,
      db.location || 'Electrical Riser',
      db.isThreePhase ? 'TRUE' : 'FALSE',
      db.phase || 'R',
      db.boardDiversityFactor.toString(),
      (db.safetyMarginPercent ?? 10).toString(),
      (db.utilizationPercent ?? 80).toString(),
      db.essentialGenset || '',
      (db.cableLengthMeters ?? 25).toString(),
      db.voltageDropBasis || 'BREAKER',
      db.manualIncomerCable || '',
      db.manualIncomerBreakerRating ? db.manualIncomerBreakerRating.toString() : '',
    ]);
  });
  rows.push([]);

  // 6. CIRCUITS SCHEDULE
  rows.push(['#SECTION:CIRCUITS_SCHEDULE']);
  rows.push([
    'Circuit ID',
    'DB ID',
    'DB Code',
    'Circuit Number',
    'Circuit Description',
    'Category',
    'Phase',
    'Quantity',
    'Unit Watts (W)',
    'Power Factor',
    'Diversity Factor',
    'Connected Load (kW)',
    'Maximum Demand (kW)',
    'Design Current Ib (A)',
    'Protective Breaker',
    'Recommended Cable',
    'Circuit Notes',
    'Preset ID',
  ]);
  dbs.forEach((db) => {
    db.circuits.forEach((c, idx) => {
      rows.push([
        c.id,
        db.id,
        db.code,
        (idx + 1).toString(),
        c.name,
        c.category,
        c.phase,
        c.quantity.toString(),
        c.unitWatts.toString(),
        c.powerFactor.toString(),
        c.diversityFactor.toString(),
        c.connectedLoadKW.toFixed(2),
        c.maximumDemandKW.toFixed(2),
        c.currentIb.toFixed(1),
        c.recommendedBreaker?.description || '',
        c.recommendedCable || '',
        c.notes || '',
        c.presetId || '',
      ]);
    });
  });
  rows.push([]);

  // 7. CIRCUIT PRESETS
  const presets = project.circuitPresets && project.circuitPresets.length > 0
    ? project.circuitPresets
    : DEFAULT_CIRCUIT_PRESETS;
  rows.push(['#SECTION:CIRCUIT_PRESETS']);
  rows.push([
    'Preset ID',
    'Preset Name',
    'Description',
    'Category',
    'Quantity',
    'Unit Watts (W)',
    'Power Factor',
    'Diversity Factor',
  ]);
  presets.forEach((p) => {
    rows.push([
      p.id,
      p.name,
      p.description || '',
      p.category || 'LIGHTING',
      p.quantity.toString(),
      p.unitWatts.toString(),
      p.powerFactor.toString(),
      p.diversityFactor.toString(),
    ]);
  });
  rows.push([]);

  // 8. CABLE DEFINITIONS
  const cableDefs = project.cableDefinitions && project.cableDefinitions.length > 0
    ? project.cableDefinitions
    : DEFAULT_CABLE_DEFINITIONS;
  rows.push(['#SECTION:CABLE_DEFINITIONS']);
  rows.push([
    'Definition ID',
    'Category',
    'Cable Size / Description',
    'Max Current Rating (A)',
    'mV/A/m',
    'CPC Size',
    'Installation Method',
  ]);
  cableDefs.forEach((cd) => {
    rows.push([
      cd.id,
      cd.category,
      cd.cableSize,
      cd.maxAmps.toString(),
      cd.mvPerAmpMeter.toString(),
      cd.cpcSize || '',
      cd.installationMethod || '',
    ]);
  });
  rows.push([]);

  // 9. BREAKER SCHEDULE
  const breakerSchedule = project.cableSchedule && project.cableSchedule.length > 0
    ? project.cableSchedule
    : DEFAULT_CABLE_SCHEDULE;
  rows.push(['#SECTION:BREAKER_SCHEDULE']);
  rows.push([
    'Schedule ID',
    'Phase System',
    'Breaker Rating (A)',
    'Breaker Type',
    'Poles',
    'Standard Cable Size',
    'Cable Max Amps (A)',
    'mV/A/m',
    'CPC Size',
    'Installation Method',
  ]);
  breakerSchedule.forEach((bs) => {
    rows.push([
      bs.id,
      bs.phaseSystem,
      bs.breakerRating.toString(),
      bs.breakerType,
      bs.poles.toString(),
      bs.cableSize,
      bs.maxAmps.toString(),
      (bs.mvPerAmpMeter ?? 1.0).toString(),
      bs.cpcSize || '',
      bs.installationMethod || '',
    ]);
  });

  // Convert to CSV with UTF-8 BOM for Microsoft Excel / Sheets compatibility
  const csvContent =
    '\uFEFF' +
    rows.map((row) => row.map((cell) => escapeCSV(cell)).join(',')).join('\r\n');

  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const defaultFilename = `${(project.name || 'Electrical_Project').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)}_Load_Schedule.csv`;
    link.setAttribute('download', customFilename || defaultFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return csvContent;
}

/**
 * Parses an exported or legacy CSV file back into a full ElectricalProject
 */
export function parseCSVToProject(
  csvText: string,
  fallbackProject: ElectricalProject
): { project: ElectricalProject; summary: string } {
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) {
    throw new Error('The uploaded CSV file is empty.');
  }

  // Check whether this is our modern sectioned format (#SECTION:...) or legacy report format
  const hasSections = rows.some((r) => r[0]?.startsWith('#SECTION:'));

  if (hasSections) {
    return parseSectionedCSV(rows, fallbackProject);
  } else {
    return parseLegacyReportCSV(rows, fallbackProject);
  }
}

/**
 * Parser for modern #SECTION:... CSV format
 */
function parseSectionedCSV(
  rows: string[][],
  fallbackProject: ElectricalProject
): { project: ElectricalProject; summary: string } {
  // Map sections
  const sectionMap: Record<string, string[][]> = {};
  let currentSection = 'HEADER';

  for (const row of rows) {
    if (row[0]?.startsWith('#SECTION:')) {
      currentSection = row[0].replace('#SECTION:', '').trim();
      sectionMap[currentSection] = [];
    } else if (sectionMap[currentSection]) {
      sectionMap[currentSection].push(row);
    }
  }

  // 1. Metadata
  let projName = fallbackProject.name;
  let projDesc = fallbackProject.description;
  let projEng = fallbackProject.engineer;
  let projClient = fallbackProject.client;
  let voltage = fallbackProject.voltageSystem;

  const metaRows = sectionMap['PROJECT_METADATA'] || [];
  for (const r of metaRows) {
    const key = (r[0] || '').toLowerCase();
    const val = r[1] || '';
    if (key.includes('project name')) projName = val;
    else if (key.includes('description')) projDesc = val;
    else if (key.includes('engineer')) projEng = val;
    else if (key.includes('client')) projClient = val;
    else if (key.includes('voltage system id')) {
      const match = VOLTAGE_PRESETS.find((v) => v.id === val);
      if (match) voltage = match;
    }
  }

  // 2. MAIN SWITCHBOARDS (Multi-MSB support)
  const msbRows = sectionMap['MAIN_SWITCHBOARDS'] || [];
  const parsedMsbs: MainSwitchBoard[] = [];
  const msbHeaders = (msbRows[0] || []).map((c) => c.toLowerCase().trim());
  const hasMsbHeaders = msbHeaders.some((h) => h.includes('code') || h.includes('name'));

  const mIdCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h === 'msb id' || h === 'id') : 0;
  const mCodeCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('code')) : 1;
  const mNameCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('name')) : 2;
  const mLocCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('location')) : 3;
  const mDfCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('diversity') || h.includes('df')) : 4;
  const mMarginCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('margin')) : 5;
  const mUtilCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('utilization')) : -1;
  const mTargetPfCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('target power') || h.includes('target pf')) : 6;
  const mScopeCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('generator') || h.includes('scope')) : 7;
  const mTxCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('manual transformer')) : 8;
  const mGenCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('manual generator')) : 9;
  const mBreakerCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('manual incomer') || h.includes('breaker rating')) : 10;
  const mMatCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('busbar material')) : 11;
  const mDensityCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('busbar current density')) : 12;
  const mDesignICol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('design current')) : 13;
  const mIcwCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('icw')) : 14;
  const mDurationCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('fault duration')) : 15;
  const mWidthCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('selected width')) : 16;
  const mThickCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('selected thickness')) : 17;
  const mRunsCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('selected runs')) : 18;
  const mOverrideCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('manual override')) : 19;
  const mVRatedCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('v rated') || h.includes('vrated')) : 20;
  const mVSupplyCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('v supply') || h.includes('vsupply')) : 21;
  const mStepsCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('steps count')) : 22;
  const mInitPfCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('initial power') || h.includes('initial pf')) : 23;
  const mCustomStepsCol = hasMsbHeaders ? msbHeaders.findIndex((h) => h.includes('custom capacitor') || h.includes('steps (json)')) : 24;

  for (let i = 1; i < msbRows.length; i++) {
    const r = msbRows[i];
    if (r.length < 3) continue;
    const id = (mIdCol !== -1 && r[mIdCol]) || `msb-${Date.now()}-${i}`;
    const code = (mCodeCol !== -1 && r[mCodeCol]) || `MSB-0${i}`;
    const name = mNameCol !== -1 && r[mNameCol] !== undefined && r[mNameCol] !== null
      ? r[mNameCol].trim()
      : '';
    const location = (mLocCol !== -1 && r[mLocCol]) || 'Main Switchroom';
    const overallBuildingDiversityFactor = parseFloat(mDfCol !== -1 ? r[mDfCol] : r[4]) || 0.8;
    const safetyMarginPercent = parseFloat(mMarginCol !== -1 ? r[mMarginCol] : r[5]) || 25;
    const txUtilizationPercent = mUtilCol !== -1 && r[mUtilCol] ? parseFloat(r[mUtilCol]) : undefined;
    const targetPowerFactor = parseFloat(mTargetPfCol !== -1 ? r[mTargetPfCol] : r[6]) || 0.99;
    const rawScope = String(mScopeCol !== -1 ? r[mScopeCol] : r[7] || '').toUpperCase();
    let generatorSizingScope: GeneratorSizingScope = 'FIRE_LIFT_SAFETY_AND_ESSENTIAL';
    if (rawScope.includes('FULL')) {
      generatorSizingScope = 'FULL_PLANT';
    } else if (rawScope.includes('FIRE') && !rawScope.includes('ESSENTIAL')) {
      generatorSizingScope = 'FIRE_LIFT_SAFETY_ONLY';
    } else if (rawScope.includes('ESSENTIAL_ONLY') || (rawScope.includes('ESSENTIAL') && !rawScope.includes('FIRE'))) {
      generatorSizingScope = 'ESSENTIAL_ONLY';
    } else {
      generatorSizingScope = 'FIRE_LIFT_SAFETY_AND_ESSENTIAL';
    }
    const manualTransformerKVA = (mTxCol !== -1 && r[mTxCol]) ? parseFloat(r[mTxCol]) : undefined;
    const manualGeneratorKVA = (mGenCol !== -1 && r[mGenCol]) ? parseFloat(r[mGenCol]) : undefined;
    const manualMainIncomerBreakerRating = (mBreakerCol !== -1 && r[mBreakerCol]) ? parseFloat(r[mBreakerCol]) : undefined;
    const busbarMaterial = (((mMatCol !== -1 ? r[mMatCol] : r[11]) || '').toUpperCase().includes('ALUM') ? 'ALUMINIUM' : 'COPPER') as BusbarMaterial;
    const busbarCurrentDensity = (mDensityCol !== -1 && r[mDensityCol]) ? parseFloat(r[mDensityCol]) : undefined;
    const busbarDesignCurrentId = ((mDesignICol !== -1 ? r[mDesignICol] : r[13]) as any) || 'INCOMER_BREAKER';
    const busbarIcwKA = (mIcwCol !== -1 && r[mIcwCol]) ? parseFloat(r[mIcwCol]) : undefined;
    const busbarFaultDuration = (mDurationCol !== -1 && r[mDurationCol]) ? parseFloat(r[mDurationCol]) : undefined;
    const busbarSelectedWidth = (mWidthCol !== -1 && r[mWidthCol]) ? parseFloat(r[mWidthCol]) : undefined;
    const busbarSelectedThickness = (mThickCol !== -1 && r[mThickCol]) ? parseFloat(r[mThickCol]) : undefined;
    const busbarSelectedRuns = (mRunsCol !== -1 && r[mRunsCol]) ? parseInt(r[mRunsCol], 10) : undefined;
    const busbarManualOverride = ((mOverrideCol !== -1 ? r[mOverrideCol] : r[19]) || '').toUpperCase() === 'TRUE';
    const vRated = (mVRatedCol !== -1 && r[mVRatedCol]) ? parseFloat(r[mVRatedCol]) : 525;
    const vSupply = (mVSupplyCol !== -1 && r[mVSupplyCol]) ? parseFloat(r[mVSupplyCol]) : 420;
    const capacitorStepsCount = (mStepsCol !== -1 && r[mStepsCol]) ? parseInt(r[mStepsCol], 10) : 12;
    const initialPowerFactor = (mInitPfCol !== -1 && r[mInitPfCol]) ? parseFloat(r[mInitPfCol]) : 0.8;

    let customCapacitorSteps: { sizeKVAr: number; quantity: number }[] | undefined;
    const rawSteps = mCustomStepsCol !== -1 ? r[mCustomStepsCol] : r[24];
    if (rawSteps) {
      try {
        const parsedSteps = JSON.parse(rawSteps);
        if (Array.isArray(parsedSteps) && parsedSteps.length > 0 && typeof parsedSteps[0] === 'object' && 'sizeKVAr' in parsedSteps[0]) {
          customCapacitorSteps = parsedSteps;
        }
      } catch {
        // ignore parse error
      }
    }

    parsedMsbs.push({
      id,
      code,
      name,
      location,
      overallBuildingDiversityFactor,
      safetyMarginPercent,
      txUtilizationPercent,
      utilizationPercent: txUtilizationPercent,
      targetPowerFactor,
      generatorSizingScope,
      manualTransformerKVA: isNaN(manualTransformerKVA as number) ? undefined : manualTransformerKVA,
      manualGeneratorKVA: isNaN(manualGeneratorKVA as number) ? undefined : manualGeneratorKVA,
      manualMainIncomerBreakerRating: isNaN(manualMainIncomerBreakerRating as number) ? undefined : manualMainIncomerBreakerRating,
      busbarMaterial,
      busbarCurrentDensity,
      busbarDesignCurrentId,
      busbarIcwKA,
      busbarFaultDuration,
      busbarSelectedWidth,
      busbarSelectedThickness,
      busbarSelectedRuns,
      busbarManualOverride,
      vRated,
      vSupply,
      capacitorStepsCount,
      initialPowerFactor,
      customCapacitorSteps,
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
    });
  }

  const primaryMsb = parsedMsbs[0] || fallbackProject.msb;

  // 3. Direct Major Loads
  const directRows = sectionMap['DIRECT_MAJOR_LOADS'] || [];
  const parsedDirectLoads: MsbDirectLoad[] = [];
  const directHeaders = (directRows[0] || []).map((c) => c.toLowerCase().trim());
  const hasDirectHeaders = directHeaders.some((h) => h.includes('name') || h.includes('code'));
  const dIdCol = hasDirectHeaders ? directHeaders.findIndex((h) => h === 'load id' || h === 'id') : 0;
  const dMsbIdCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('msb')) : 1;
  const dCodeCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('code')) : 2;
  const dNameCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('name')) : 3;
  const dTypeCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('type')) : 4;
  const dGensetCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('essential') || h.includes('genset')) : 5;
  const dQtyCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('quantity') || h.includes('qty')) : 6;
  const dWattsCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('watt') || h.includes('rating')) : 7;
  const dPfCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('power factor') || h.includes('pf')) : 8;
  const dDfCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('diversity') || h.includes('df')) : 9;
  const dCableCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('cable')) : 14;
  const dNotesCol = hasDirectHeaders ? directHeaders.findIndex((h) => h.includes('note')) : 15;

  for (let i = 1; i < directRows.length; i++) {
    const r = directRows[i];
    if (r.length < 5) continue;
    const id = (dIdCol !== -1 && r[dIdCol]) || `load-${Date.now()}-${i}`;
    const msbId = (dMsbIdCol !== -1 && r[dMsbIdCol]) || primaryMsb.id;
    const code = (dCodeCol !== -1 && r[dCodeCol]) || `ML-0${i}`;
    const name = (dNameCol !== -1 && r[dNameCol]) || `Major Load ${i}`;
    const equipmentType = ((dTypeCol !== -1 ? r[dTypeCol] : r[4]) as any) || 'OTHER';
    const rawEssential = (dGensetCol !== -1 ? r[dGensetCol] : r[5]) || '';
    const isEssential = rawEssential.toUpperCase() === 'YES' || rawEssential.toUpperCase() === 'TRUE';
    const rawDQty = dQtyCol !== -1 ? r[dQtyCol] : r[6];
    const quantity = Math.max(0, parseSafeInt(rawDQty, 1));
    const unitWatts = parseSafeFloat(dWattsCol !== -1 ? r[dWattsCol] : r[7], 10000);
    const powerFactor = Math.min(1.0, Math.max(0.1, parseSafeFloat(dPfCol !== -1 ? r[dPfCol] : r[8], 0.85)));
    const diversityFactor = Math.min(1.0, Math.max(0.0, parseSafeFloat(dDfCol !== -1 ? r[dDfCol] : r[9], 1.0)));
    const recommendedCable = healCableString(dCableCol !== -1 ? r[dCableCol] : r[14]);
    const notes = (dNotesCol !== -1 && r[dNotesCol]) ? r[dNotesCol] : undefined;

    parsedDirectLoads.push({
      id,
      code,
      name,
      equipmentType,
      isEssential,
      quantity,
      unitWatts,
      powerFactor,
      diversityFactor,
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      currentIb: 0,
      recommendedBreaker: {} as any,
      recommendedCable,
      notes,
      msbId,
    } as any);
  }

  // 4. Sub-DBs
  const subDbRows = sectionMap['SUB_DISTRIBUTION_BOARDS'] || [];
  const parsedSubDbs: SubDistributionBoard[] = [];
  const subHeaders = (subDbRows[0] || []).map((c) => c.toLowerCase().trim());
  const hasSubHeaders = subHeaders.some((h) => h.includes('code') || h.includes('name'));
  const sIdCol = hasSubHeaders ? subHeaders.findIndex((h) => h === 'sub-db id' || h === 'id') : 0;
  const sMsbIdCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('msb')) : 1;
  const sCodeCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('code') && !h.includes('msb')) : 2;
  const sNameCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('name')) : 3;
  const sLocCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('location')) : 4;
  const sDfCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('diversity') || h.includes('df')) : 5;
  const sMarginCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('margin')) : 6;
  const sUtilCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('utilization')) : -1;
  const sGensetCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('essential') || h.includes('genset')) : 7;
  const sLenCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('cable length') || h.includes('length')) : 8;
  const sBasisCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('drop basis') || h.includes('basis')) : 9;
  const sCableCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('cable')) : 10;
  const sBreakerCol = hasSubHeaders ? subHeaders.findIndex((h) => h.includes('breaker')) : 11;

  for (let i = 1; i < subDbRows.length; i++) {
    const r = subDbRows[i];
    if (r.length < 3) continue;
    const id = (sIdCol !== -1 && r[sIdCol]) || `sb-${Date.now()}-${i}`;
    const msbId = (sMsbIdCol !== -1 && r[sMsbIdCol]) || primaryMsb.id;
    const code = (sCodeCol !== -1 && r[sCodeCol]) || `SB-0${i}`;
    const name = sNameCol !== -1 && r[sNameCol] !== undefined && r[sNameCol] !== null
      ? r[sNameCol].trim()
      : '';
    const location = (sLocCol !== -1 && r[sLocCol]) || 'Sub-Switchroom';
    const groupDiversityFactor = parseFloat(sDfCol !== -1 ? r[sDfCol] : r[5]) || 0.9;
    const safetyMarginPercent = parseFloat(sMarginCol !== -1 ? r[sMarginCol] : r[6]) || 20;
    const utilizationPercent = sUtilCol !== -1 && r[sUtilCol] ? parseFloat(r[sUtilCol]) : undefined;
    const rawGenset = (sGensetCol !== -1 ? r[sGensetCol] : r[7]) || '';
    const essentialGenset = rawGenset && rawGenset !== 'NORMAL' ? (rawGenset as EssentialGensetType) : rawGenset === 'NORMAL' ? 'NORMAL' : undefined;
    const cableLengthMeters = parseFloat(sLenCol !== -1 ? r[sLenCol] : r[8]) || 35;
    const rawBasis = ((sBasisCol !== -1 ? r[sBasisCol] : r[9]) || '').toUpperCase();
    const voltageDropBasis: 'BREAKER' | 'DESIGN' = rawBasis.includes('DESIGN') || rawBasis === 'IB' ? 'DESIGN' : 'BREAKER';
    const manualIncomerCable = healCableString(sCableCol !== -1 ? r[sCableCol] : r[10]) || undefined;
    const rawBreaker = sBreakerCol !== -1 ? r[sBreakerCol] : r[11];
    const manualIncomerBreakerRating = rawBreaker ? parseFloat(rawBreaker) : undefined;

    parsedSubDbs.push({
      id,
      msbId,
      code,
      name,
      location,
      groupDiversityFactor,
      safetyMarginPercent,
      utilizationPercent,
      essentialGenset,
      cableLengthMeters,
      voltageDropBasis,
      manualIncomerCable,
      manualIncomerBreakerRating: isNaN(manualIncomerBreakerRating as number) ? undefined : manualIncomerBreakerRating,
      connectedDbIds: [],
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      incomerCurrentAmps: 0,
      incomerBreaker: {} as any,
      incomerCable: '',
    });
  }

  // 5. Final DBs
  const dbRows = sectionMap['FINAL_DISTRIBUTION_BOARDS'] || [];
  const parsedDbsMap = new Map<string, DistributionBoard>();
  const dbCodeToIdMap = new Map<string, string>();
  const dbHeaders = (dbRows[0] || []).map((c) => c.toLowerCase().trim());
  const hasDbHeaders = dbHeaders.some((h) => h.includes('code') || h.includes('name'));
  const dbIdCol = hasDbHeaders ? dbHeaders.findIndex((h) => h === 'db id' || h === 'id') : 0;
  const dbSubDbIdCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('supplying') || h.includes('sub-db')) : 1;
  const dbCodeCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('code') && !h.includes('supplying') && !h.includes('sub-db')) : 2;
  const dbNameCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('name') || h.includes('description')) : 3;
  const dbLocCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('location')) : 4;
  const db3PCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('three phase') || h.includes('3 phase')) : 5;
  const dbPhaseCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('phase') && !h.includes('three')) : 6;
  const dbDfCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('diversity') || h.includes('df')) : 7;
  const dbMarginCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('margin')) : 8;
  const dbUtilCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('utilization')) : -1;
  const dbGensetCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('essential') || h.includes('genset')) : 9;
  const dbLenCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('cable length') || h.includes('length')) : 10;
  const dbBasisCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('drop basis') || h.includes('basis')) : 11;
  const dbCableCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('cable')) : 12;
  const dbBreakerCol = hasDbHeaders ? dbHeaders.findIndex((h) => h.includes('breaker')) : 13;

  for (let i = 1; i < dbRows.length; i++) {
    const r = dbRows[i];
    if (r.length < 3) continue;
    const id = (dbIdCol !== -1 && r[dbIdCol]) || `db-${Date.now()}-${i}`;
    const rawSubDbId = (dbSubDbIdCol !== -1 && r[dbSubDbIdCol]) || r[1] || '';
    const code = (dbCodeCol !== -1 && r[dbCodeCol]) || `DB-0${i}`;
    const name = dbNameCol !== -1 && r[dbNameCol] !== undefined && r[dbNameCol] !== null
      ? r[dbNameCol].trim()
      : '';
    const location = (dbLocCol !== -1 && r[dbLocCol]) || 'Electrical Riser';
    const raw3P = ((db3PCol !== -1 ? r[db3PCol] : r[5]) || '').toUpperCase();
    const isThreePhase = raw3P === 'TRUE' || raw3P.includes('3') || raw3P.includes('TP');
    const phase = ((dbPhaseCol !== -1 ? r[dbPhaseCol] : r[6]) as 'R' | 'Y' | 'B') || 'R';
    const boardDiversityFactor = parseFloat(dbDfCol !== -1 ? r[dbDfCol] : r[7]) || 1.0;
    const safetyMarginPercent = parseFloat(dbMarginCol !== -1 ? r[dbMarginCol] : r[8]) || 10;
    const utilizationPercent = dbUtilCol !== -1 && r[dbUtilCol] ? parseFloat(r[dbUtilCol]) : undefined;
    const rawGenset = (dbGensetCol !== -1 ? r[dbGensetCol] : r[9]) || '';
    const essentialGenset = rawGenset && rawGenset !== 'NORMAL' ? (rawGenset as EssentialGensetType) : rawGenset === 'NORMAL' ? 'NORMAL' : undefined;
    const cableLengthMeters = parseFloat(dbLenCol !== -1 ? r[dbLenCol] : r[10]) || 25;
    const rawDbBasis = ((dbBasisCol !== -1 ? r[dbBasisCol] : r[11]) || '').toUpperCase();
    const voltageDropBasis: 'BREAKER' | 'DESIGN' = rawDbBasis.includes('DESIGN') || rawDbBasis === 'IB' ? 'DESIGN' : 'BREAKER';
    const manualIncomerCable = healCableString(dbCableCol !== -1 ? r[dbCableCol] : r[12]) || undefined;
    const rawBreaker = dbBreakerCol !== -1 ? r[dbBreakerCol] : r[13];
    const manualIncomerBreakerRating = rawBreaker ? parseFloat(rawBreaker) : undefined;

    const dbObj: DistributionBoard = {
      id,
      subDbId: rawSubDbId,
      code,
      name,
      location,
      isThreePhase,
      phase,
      boardDiversityFactor,
      safetyMarginPercent,
      utilizationPercent,
      essentialGenset,
      cableLengthMeters,
      voltageDropBasis,
      manualIncomerCable,
      manualIncomerBreakerRating: isNaN(manualIncomerBreakerRating as number) ? undefined : manualIncomerBreakerRating,
      circuits: [],
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      incomerCurrentAmps: 0,
      phaseBalance: {} as any,
      incomerBreaker: {} as any,
      incomerCable: '',
    };
    parsedDbsMap.set(id, dbObj);
    dbCodeToIdMap.set(code.toUpperCase(), id);
  }

  // 6. Circuits Schedule
  const circuitRows = sectionMap['CIRCUITS_SCHEDULE'] || [];
  let totalCircuits = 0;
  for (let i = 1; i < circuitRows.length; i++) {
    const r = circuitRows[i];
    if (r.length < 5) continue;
    const circuitId = r[0] || `c-${Date.now()}-${i}`;
    const dbId = r[1];
    const dbCode = (r[2] || '').toUpperCase();

    // Match DB by ID or by Code
    let targetDb = parsedDbsMap.get(dbId);
    if (!targetDb && dbCode) {
      const matchedId = dbCodeToIdMap.get(dbCode);
      if (matchedId) targetDb = parsedDbsMap.get(matchedId);
    }
    if (!targetDb && parsedDbsMap.size > 0) {
      targetDb = Array.from(parsedDbsMap.values())[0];
    }
    if (!targetDb) continue;

    const cDesc = r[4] || `Circuit ${targetDb.circuits.length + 1}`;
    const category = (r[5] as CircuitCategory) || 'LIGHTING';
    const phase = (r[6] as PhaseType) || (targetDb.isThreePhase ? '3P' : targetDb.phase || 'R');
    const quantity = Math.max(0, parseSafeInt(r[7], 1));
    const unitWatts = parseSafeFloat(r[8], 100);
    const powerFactor = Math.min(1.0, Math.max(0.1, parseSafeFloat(r[9], 0.9)));
    const diversityFactor = Math.min(1.0, Math.max(0.0, parseSafeFloat(r[10], 1.0)));
    const notes = r[16] || '';
    const presetId = r[17] || undefined;

    targetDb.circuits.push({
      id: circuitId,
      name: cDesc,
      category,
      phase,
      quantity,
      unitWatts,
      powerFactor,
      diversityFactor,
      connectedLoadKW: 0,
      connectedLoadKVA: 0,
      maximumDemandKW: 0,
      maximumDemandKVA: 0,
      currentIb: 0,
      recommendedBreaker: {} as any,
      recommendedCable: healCableString(r[15]),
      notes,
      presetId,
    });
    totalCircuits++;
  }

  // 7. Circuit Presets
  const presetRows = sectionMap['CIRCUIT_PRESETS'] || [];
  let parsedCircuitPresets: CircuitPreset[] = [];
  for (let i = 1; i < presetRows.length; i++) {
    const r = presetRows[i];
    if (r.length < 4) continue;
    parsedCircuitPresets.push({
      id: r[0],
      name: r[1],
      description: r[2] || '',
      category: (r[3] as CircuitCategory) || 'LIGHTING',
      quantity: Math.max(0, parseSafeInt(r[4], 1)),
      unitWatts: parseSafeFloat(r[5], 100),
      powerFactor: Math.min(1.0, Math.max(0.1, parseSafeFloat(r[6], 0.9))),
      diversityFactor: Math.min(1.0, Math.max(0.0, parseSafeFloat(r[7], 1.0))),
    });
  }
  if (parsedCircuitPresets.length === 0) {
    parsedCircuitPresets = fallbackProject.circuitPresets || DEFAULT_CIRCUIT_PRESETS;
  }

  // 8. Cable Definitions
  const cableDefRows = sectionMap['CABLE_DEFINITIONS'] || [];
  let parsedCableDefinitions: CableDefinitionEntry[] = [];
  for (let i = 1; i < cableDefRows.length; i++) {
    const r = cableDefRows[i];
    if (r.length < 3) continue;
    const id = r[0];
    const category = (r[1] as any) || '1P';
    const cableSize = healCableString(r[2]);
    const normName = normalizeCableName(cableSize);
    const matchedDef = DEFAULT_CABLE_DEFINITIONS.find(
      (d) => normalizeCableName(d.cableSize) === normName
    );
    const standardFallback = matchedDef ? matchedDef.maxAmps : (category === '1P' ? 20 : category === '3P' ? 50 : 800);
    const cleanAmps = parseFloat(String(r[3] || '').replace(/[^0-9.-]/g, ''));
    const maxAmps = !isNaN(cleanAmps) && cleanAmps > 0 ? cleanAmps : standardFallback;
    const cleanMv = parseFloat(String(r[4] || '').replace(/[^0-9.-]/g, ''));
    const mvPerAmpMeter = !isNaN(cleanMv) && cleanMv > 0 ? cleanMv : (matchedDef?.mvPerAmpMeter || 1.0);
    const cpcSize = r[5] || matchedDef?.cpcSize || '';
    const installationMethod = r[6] || matchedDef?.installationMethod || '';

    parsedCableDefinitions.push({
      id: id || matchedDef?.id || `cdef-${category.toLowerCase()}-${maxAmps}-${i}`,
      category,
      cableSize,
      maxAmps,
      mvPerAmpMeter,
      cpcSize,
      installationMethod,
    });
  }
  if (parsedCableDefinitions.length === 0) {
    parsedCableDefinitions = fallbackProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS;
  }

  // 9. Breaker Schedule
  const breakerScheduleRows = sectionMap['BREAKER_SCHEDULE'] || [];
  let parsedCableSchedule: CableScheduleEntry[] = [];
  for (let i = 1; i < breakerScheduleRows.length; i++) {
    const r = breakerScheduleRows[i];
    if (r.length < 5) continue;
    const id = r[0];
    const phaseSystem = (r[1] as any) || '3P';
    const breakerRating = parseFloat(String(r[2] || '').replace(/[^0-9.-]/g, '')) || 32;
    const breakerType = (r[3] as any) || 'MCB';
    const poles = (parseInt(String(r[4] || '').replace(/[^0-9]/g, ''), 10) || (phaseSystem === '1P' ? 1 : 3)) as 1 | 3 | 4;
    const cableSize = healCableString(r[5]);
    const normName = normalizeCableName(cableSize);
    const matchedDef =
      parsedCableDefinitions.find((c) => normalizeCableName(c.cableSize) === normName) ||
      DEFAULT_CABLE_DEFINITIONS.find((d) => normalizeCableName(d.cableSize) === normName);

    const cleanAmps = parseFloat(String(r[6] || '').replace(/[^0-9.-]/g, ''));
    const maxAmps = !isNaN(cleanAmps) && cleanAmps > 0 ? cleanAmps : (matchedDef?.maxAmps || breakerRating * 1.25);
    const cleanMv = parseFloat(String(r[7] || '').replace(/[^0-9.-]/g, ''));
    const mvPerAmpMeter = !isNaN(cleanMv) && cleanMv > 0 ? cleanMv : (matchedDef?.mvPerAmpMeter || 1.0);
    const cpcSize = r[8] || matchedDef?.cpcSize || '';
    const installationMethod = r[9] || matchedDef?.installationMethod || '';

    parsedCableSchedule.push({
      id,
      phaseSystem,
      breakerRating,
      breakerType,
      poles,
      cableSize,
      maxAmps,
      mvPerAmpMeter,
      cpcSize,
      installationMethod,
    });
  }
  if (parsedCableSchedule.length === 0) {
    parsedCableSchedule = fallbackProject.cableSchedule || DEFAULT_CABLE_SCHEDULE;
  }

  const parsedDbs = Array.from(parsedDbsMap.values());

  // Build bi-directional lookup maps for Sub-DBs and MSBs
  const subDbResolver = new Map<string, string>();
  parsedSubDbs.forEach((sb) => {
    subDbResolver.set(sb.id, sb.id);
    subDbResolver.set(sb.id.toUpperCase(), sb.id);
    subDbResolver.set(sb.code.trim().toUpperCase(), sb.id);
    subDbResolver.set(sb.code.trim(), sb.id);
  });

  const msbResolver = new Map<string, string>();
  parsedMsbs.forEach((m) => {
    msbResolver.set(m.id, m.id);
    msbResolver.set(m.id.toUpperCase(), m.id);
    msbResolver.set(m.code.trim().toUpperCase(), m.id);
    msbResolver.set(m.code.trim(), m.id);
  });
  msbResolver.set('MSB', primaryMsb.id);
  msbResolver.set('MSB-MAIN', primaryMsb.id);

  parsedSubDbs.forEach((sb) => {
    const raw = (sb.msbId || '').trim();
    if (msbResolver.has(raw)) sb.msbId = msbResolver.get(raw)!;
    else if (msbResolver.has(raw.toUpperCase())) sb.msbId = msbResolver.get(raw.toUpperCase())!;
    else sb.msbId = primaryMsb.id;
  });

  parsedDbs.forEach((db) => {
    const raw = (db.subDbId || '').trim();
    if (subDbResolver.has(raw)) db.subDbId = subDbResolver.get(raw)!;
    else if (subDbResolver.has(raw.toUpperCase())) db.subDbId = subDbResolver.get(raw.toUpperCase())!;
    else if (msbResolver.has(raw)) db.subDbId = msbResolver.get(raw)!;
    else if (msbResolver.has(raw.toUpperCase())) db.subDbId = msbResolver.get(raw.toUpperCase())!;
    else db.subDbId = parsedSubDbs[0]?.id || primaryMsb.id;
  });

  // Link DBs to Sub-DBs
  parsedSubDbs.forEach((sb) => {
    sb.connectedDbIds = parsedDbs
      .filter((d) => d.subDbId === sb.id || d.subDbId === sb.code)
      .map((d) => d.id);
  });

  // Calculate everything with exact cable definitions and schedule
  const effectiveMsbs = parsedMsbs.length > 0 ? parsedMsbs : [primaryMsb];
  const calculated = recalculateAll(
    parsedDbs,
    parsedSubDbs,
    primaryMsb,
    parsedDirectLoads,
    voltage,
    parsedCableSchedule,
    effectiveMsbs,
    parsedCableDefinitions
  );

  const finalProject: ElectricalProject = {
    id: `proj-${Date.now()}`,
    name: projName,
    description: projDesc,
    engineer: projEng,
    client: projClient,
    dateCreated: new Date().toISOString().split('T')[0],
    lastModified: new Date().toISOString(),
    voltageSystem: voltage,
    cableSchedule: parsedCableSchedule,
    cableDefinitions: parsedCableDefinitions,
    circuitPresets: parsedCircuitPresets,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
  };

  const msbCount = calculated.msbs?.length || 1;
  const summary = `Successfully imported "${projName}": ${msbCount} MSB${msbCount > 1 ? 's' : ''}, ${calculated.subDbs.length} Sub-DBs, ${calculated.dbs.length} Final DBs, and ${totalCircuits} circuits restored with automatic breaker and cable sizing.`;

  return { project: finalProject, summary };
}

/**
 * Parser for legacy or human-formatted load schedule CSVs
 */
function parseLegacyReportCSV(
  rows: string[][],
  fallbackProject: ElectricalProject
): { project: ElectricalProject; summary: string } {
  let projName = fallbackProject.name;
  let projDesc = fallbackProject.description;
  let projClient = fallbackProject.client;
  let projEng = fallbackProject.engineer;
  let voltage = fallbackProject.voltageSystem;

  let msbCode = fallbackProject.msb.code;
  let msbName = fallbackProject.msb.name;
  let msbIncomerBreaker = fallbackProject.msb.manualMainIncomerBreakerRating;
  let msbTransformerKVA = fallbackProject.msb.manualTransformerKVA;
  let msbGeneratorKVA = fallbackProject.msb.manualGeneratorKVA;
  let msbCapacitorKVAr: number | undefined = undefined;
  let msbBusbarRuns = fallbackProject.msb.busbarSelectedRuns;
  let msbBusbarWidth = fallbackProject.msb.busbarSelectedWidth;
  let msbBusbarThickness = fallbackProject.msb.busbarSelectedThickness;
  let msbBusbarOverride = fallbackProject.msb.busbarManualOverride;

  const parsedSubDbs: SubDistributionBoard[] = [];
  const parsedDbs: DistributionBoard[] = [];
  let currentDb: DistributionBoard | null = null;
  let parsingSection = '';
  let circuitHeadersSeen = false;
  let totalCircuits = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCell = (row[0] || '').trim();

    if (firstCell.startsWith('Project Name')) {
      projName = row[1] || projName;
    } else if (firstCell.startsWith('Project Description') || firstCell.startsWith('Description')) {
      projDesc = row[1] || projDesc;
    } else if (firstCell.startsWith('Client')) {
      projClient = row[1] || projClient;
    } else if (firstCell.startsWith('Engineer')) {
      projEng = row[1] || projEng;
    } else if (firstCell.startsWith('Voltage System ID')) {
      const matched = VOLTAGE_PRESETS.find((v) => v.id === row[1]?.trim());
      if (matched) voltage = matched;
    } else if (firstCell.startsWith('Standard / System Voltage')) {
      const matched = VOLTAGE_PRESETS.find((v) => (row[1] || '').includes(String(v.Vll)));
      if (matched) voltage = matched;
    } else if (firstCell.startsWith('MSB #') || firstCell.includes('Primary MSB Identifier')) {
      if (firstCell.includes(':')) {
        const afterColon = firstCell.substring(firstCell.indexOf(':') + 1).trim();
        const parts = afterColon.split(' - ');
        if (parts[0]) msbCode = parts[0].trim();
        if (parts[1]) msbName = parts.slice(1).join(' - ').trim();
      } else if (row[1]) {
        msbCode = row[1].trim();
      }
    } else if (firstCell.includes('Main Busbar Sizing')) {
      const val = row[1] || '';
      const match = val.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
      if (match) {
        msbBusbarRuns = parseInt(match[1], 10);
        msbBusbarWidth = parseInt(match[2], 10);
        msbBusbarThickness = parseInt(match[3], 10);
        msbBusbarOverride = true;
      }
    } else if (firstCell.includes('Main Incomer Breaker') || firstCell.includes('Main Incomer Protective Breaker')) {
      const val = row[1] || '';
      const match = val.match(/(\d+)\s*A/i);
      if (match) {
        msbIncomerBreaker = parseInt(match[1], 10);
      }
    } else if (firstCell.includes('Recommended Transformer')) {
      const val = row[1] || '';
      const match = val.match(/(\d+)\s*kVA/i);
      if (match) {
        msbTransformerKVA = parseInt(match[1], 10);
      }
    } else if (firstCell.includes('Recommended Generator Prime') || firstCell.includes('Recommended Generator')) {
      const val = row[1] || '';
      const match = val.match(/(\d+)\s*kVA/i);
      if (match) {
        msbGeneratorKVA = parseInt(match[1], 10);
      }
    } else if (firstCell.includes('PFC Capacitor Bank') || firstCell.includes('Capacitor Bank')) {
      const val = row[1] || '';
      const match = val.match(/(\d+)\s*kVAr/i);
      if (match) {
        msbCapacitorKVAr = parseInt(match[1], 10);
      }
    } else if (firstCell.includes('LEVEL 2: SUB-DISTRIBUTION BOARDS')) {
      parsingSection = 'SUB_DBS';
    } else if (firstCell.includes('LEVEL 1: DISTRIBUTION BOARDS')) {
      parsingSection = 'DBS';
    } else if (parsingSection === 'SUB_DBS') {
      if (row.length >= 3 && !isNaN(parseInt(firstCell, 10))) {
        const sbCode = row[1];
        const sbName = row[2] !== undefined && row[2] !== null ? row[2].trim() : '';
        const groupDF = parseFloat(row[4]) || 0.9;
        const newSb: SubDistributionBoard = {
          id: `sb-${Date.now()}-${parsedSubDbs.length + 1}`,
          code: sbCode,
          name: sbName,
          location: 'Sub-Switchroom',
          msbId: fallbackProject.msb.id,
          groupDiversityFactor: groupDF,
          safetyMarginPercent: 20,
          essentialGenset: 'NORMAL',
          connectedDbIds: [],
          connectedLoadKW: 0,
          connectedLoadKVA: 0,
          maximumDemandKW: 0,
          maximumDemandKVA: 0,
          incomerCurrentAmps: 0,
          incomerBreaker: {} as any,
          incomerCable: '',
        };
        parsedSubDbs.push(newSb);
      }
    } else if (parsingSection === 'DBS') {
      if (firstCell.startsWith('BOARD:')) {
        circuitHeadersSeen = false;
        const boardLine = firstCell.replace('BOARD:', '').trim();
        const codeMatch = boardLine.match(/^([A-Za-z0-9_-]+)/);
        const code = codeMatch ? codeMatch[1] : `DB-${parsedDbs.length + 1}`;
        const is3P = boardLine.toLowerCase().includes('3-phase');
        const phaseMatch = boardLine.match(/phase\s+([RYB])/i);
        const assignedPhase = (phaseMatch ? phaseMatch[1].toUpperCase() : 'R') as 'R' | 'Y' | 'B';

        const subDbMatch = boardLine.match(/Sub-DB:\s*([A-Za-z0-9_-]+)/i);
        const subDbCodeOrId = subDbMatch ? subDbMatch[1] : '';
        const matchedSb = parsedSubDbs.find((s) => s.code === subDbCodeOrId || s.id === subDbCodeOrId);
        const subDbId = matchedSb ? matchedSb.id : parsedSubDbs[0]?.id || fallbackProject.msb.id;

        const newDb: DistributionBoard = {
          id: `db-${Date.now()}-${parsedDbs.length + 1}`,
          code,
          name: boardLine.includes(' - ') ? boardLine.split(' - ').slice(1).join(' - ').trim() : '',
          location: 'Electrical Riser',
          subDbId,
          isThreePhase: is3P,
          phase: assignedPhase,
          boardDiversityFactor: 1.0,
          safetyMarginPercent: 10,
          essentialGenset: 'NORMAL',
          circuits: [],
          connectedLoadKW: 0,
          connectedLoadKVA: 0,
          maximumDemandKW: 0,
          maximumDemandKVA: 0,
          incomerCurrentAmps: 0,
          phaseBalance: {} as any,
          incomerBreaker: {} as any,
          incomerCable: '',
        };
        parsedDbs.push(newDb);
        currentDb = newDb;
      } else if (firstCell === 'Ckt #' || firstCell.toLowerCase().includes('circuit')) {
        circuitHeadersSeen = true;
      } else if (circuitHeadersSeen && currentDb && !isNaN(parseInt(firstCell, 10)) && row.length >= 6) {
        const cDesc = row[1] || `Circuit ${currentDb.circuits.length + 1}`;
        const category = (row[2] as CircuitCategory) || 'LIGHTING';
        const phase = (row[3] as PhaseType) || (currentDb.isThreePhase ? '3P' : currentDb.phase || 'R');
        const qty = Math.max(0, parseSafeInt(row[4], 1));
        const unitWatts = parseSafeFloat(row[5], 100);
        const pf = Math.min(1.0, Math.max(0.1, parseSafeFloat(row[6], 0.9)));
        const df = Math.min(1.0, Math.max(0.0, parseSafeFloat(row[7], 1.0)));

        currentDb.circuits.push({
          id: `c-${Date.now()}-${currentDb.circuits.length + 1}`,
          name: cDesc,
          category,
          phase,
          quantity: qty,
          unitWatts,
          powerFactor: pf,
          diversityFactor: df,
          connectedLoadKW: 0,
          connectedLoadKVA: 0,
          maximumDemandKW: 0,
          maximumDemandKVA: 0,
          currentIb: 0,
          recommendedBreaker: {} as any,
          recommendedCable: '',
        });
        totalCircuits++;
      }
    }
  }

  const effectiveSubDbs = parsedSubDbs.length > 0 ? parsedSubDbs : fallbackProject.subDbs;
  const effectiveDbs = parsedDbs.length > 0 ? parsedDbs : fallbackProject.dbs;

  effectiveSubDbs.forEach((sb) => {
    sb.connectedDbIds = effectiveDbs.filter((d) => d.subDbId === sb.id).map((d) => d.id);
  });

  const targetMsb: MainSwitchBoard = {
    ...fallbackProject.msb,
    code: msbCode || fallbackProject.msb.code,
    name: msbName !== undefined ? msbName : fallbackProject.msb.name,
    manualMainIncomerBreakerRating: msbIncomerBreaker,
    manualTransformerKVA: msbTransformerKVA,
    manualGeneratorKVA: msbGeneratorKVA,
    initialPowerFactor: msbCapacitorKVAr && msbCapacitorKVAr >= 580 ? 0.80 : fallbackProject.msb.initialPowerFactor,
    busbarSelectedRuns: msbBusbarRuns,
    busbarSelectedWidth: msbBusbarWidth,
    busbarSelectedThickness: msbBusbarThickness,
    busbarManualOverride: msbBusbarOverride,
  };

  const calculated = recalculateAll(
    effectiveDbs,
    effectiveSubDbs,
    targetMsb,
    fallbackProject.msbDirectLoads,
    voltage,
    DEFAULT_CABLE_SCHEDULE
  );

  const finalProject: ElectricalProject = {
    ...fallbackProject,
    id: `proj-${Date.now()}`,
    name: projName,
    description: projDesc,
    client: projClient,
    engineer: projEng,
    voltageSystem: voltage,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
    lastModified: new Date().toISOString(),
  };

  const summary =
    totalCircuits > 0
      ? `Restored project "${projName}": ${calculated.subDbs.length} Sub-DBs, ${calculated.dbs.length} Final DBs, and ${totalCircuits} circuits parsed from CSV.`
      : `Loaded project "${projName}": MSB "${targetMsb.code} - ${targetMsb.name || ''}" configured with ${calculated.subDbs.length} Sub-DBs and ${calculated.dbs.length} Final DBs.`;

  return { project: finalProject, summary };
}
