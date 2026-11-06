/**
 * Robust Excel (.xlsx) Export & Import Utility for Electrical Load Calculator
 * Multi-tab workbook structure with full fidelity restoration of:
 * 1. Project Overview & Complete Metadata (Name, Description, Client, Engineer, Voltage System)
 * 2. MSB Plant Sizing & Direct Major Equipment Loads (all parameters, capacitor steps, and genset)
 * 3. Sub-Distribution Boards (Level 2) with group diversity, safety margins, and essential genset status
 * 4. Final Distribution Boards (Level 1) with 3P/1P phase systems, assigned supply phases, margins, and diversity
 * 5. Branch Circuit Schedules with descriptions, categories, phases, quantities, unit watts, PF, DF, and notes
 * 6. Cable Schedule (Conductor Specifications Library for 1P, 3P & Busduct with Iz, mV/A/m, CPC & methods)
 * 7. Breaker Schedule (Protective Device Ratings MCB/MCCB/ACB mapped to referenced Cable Conductors with In ≤ Iz)
 * 8. Circuit Presets (Reusable load templates with preset quantities, unit watts, PF, and DF)
 */

import * as XLSX from 'xlsx';
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
  CableCategoryType,
  BreakerType,
  CapacitorBankStep,
  MajorEquipmentType,
  CircuitPreset,
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

// =========================================================================
// NORMALIZATION HELPERS
// =========================================================================

function normalizeCircuitCategory(val: any): CircuitCategory {
  const s = String(val || '').toUpperCase().trim();
  if (s.includes('LIGHT')) return 'LIGHTING';
  if (s.includes('RECEPT') || s.includes('SOCKET') || (s.includes('POWER') && !s.includes('APPLIANCE'))) return 'RECEPTACLE';
  if (s.includes('HVAC') || s.includes('AC') || s.includes('AIR') || s.includes('FAN') || s.includes('VENT')) return 'HVAC';
  if (s.includes('APPLIANCE') || s.includes('COOK') || s.includes('HEATER') || s.includes('OVEN') || s.includes('KITCHEN')) return 'POWER_APPLIANCE';
  if (s.includes('MOTOR') || s.includes('PUMP') || s.includes('COMPRESSOR')) return 'MOTOR_PUMP';
  if (s.includes('IT') || s.includes('SERVER') || s.includes('CRITICAL') || s.includes('RACK') || s.includes('UPS') || s.includes('DATA')) return 'IT_CRITICAL';
  if (s.includes('SPARE') || s.includes('PROVISION')) return 'SPARE';
  return 'CUSTOM';
}

function normalizeMajorEquipmentType(val: any): MajorEquipmentType {
  const s = String(val || '').toUpperCase().trim();
  if (s.includes('CHILL')) return 'CHILLER';
  if (s.includes('LIFT') || s.includes('ELEVAT')) return 'ELEVATOR';
  if (s.includes('FIRE') || s.includes('PUMP')) return 'FIRE_PUMP';
  if (s.includes('COMPRESS') || s.includes('AIR')) return 'AIR_COMPRESSOR';
  if (s.includes('EV') || s.includes('CHARG')) return 'EV_CHARGING';
  if (s.includes('SOLAR') || s.includes('PV')) return 'SOLAR_PV';
  return 'OTHER';
}

function normalizePhase(val: any, isBoardThreePhase: boolean, boardPhase?: 'R' | 'Y' | 'B'): PhaseType {
  if (!isBoardThreePhase) {
    return boardPhase || 'R';
  }
  const s = String(val || '').toUpperCase().trim();
  if (s.includes('3') || s === '3P' || s.includes('THREE') || s === 'TP' || s === 'TPN') return '3P';
  if (s.includes('Y') || s.includes('YELLOW') || s === 'L2' || s === 'PHASE 2' || s === 'PHASE Y' || s === 'B_US') return 'Y';
  if (s.includes('B') || s.includes('BLUE') || s === 'L3' || s === 'PHASE 3' || s === 'PHASE B' || s === 'C_US') return 'B';
  return 'R'; // L1, RED, Phase 1, Phase R, R
}

function normalizeEssentialGenset(val: any): EssentialGensetType | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).toUpperCase().trim();
  if (!s || s === 'N/A' || s === 'NONE' || s === '-' || s === 'NO') return undefined;
  if (s.includes('FIRE') || s.includes('LIFT')) return 'FIRE_LIFT_SAFETY';
  if (s.includes('ESSENTIAL') || s.includes('GENSET') || s === 'YES' || s === 'TRUE') return 'ESSENTIAL';
  if (s === 'NORMAL' || s.includes('NORM')) return 'NORMAL';
  return undefined;
}

function parseSafeNumber(val: any, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return !isNaN(val) ? val : fallback;
  const str = String(val).trim();
  // If string is an identifier (e.g. "cdef-1p-1.5", "cs-1p-6", "db-1", "msb-main"), do not parse as number
  if (/^(?:cdef|cs|db|sb|msb|proj|preset|c)-/i.test(str) || /^[a-z_]+$/i.test(str)) {
    return fallback;
  }
  // Strip trailing electrical units like A, Amps, kA, kW, kVA, kVAr, V, mV, Hz, m, %
  const cleanStr = str.replace(/\s*(?:a|amps?|ka|kw|kva|kvar|v|mv|hz|m|%)\s*$/i, '').trim();
  // If string still contains letters (e.g. cable spec like "4x1C 1.5mm²"), do not parse as pure number
  if (/[a-zA-Z]/.test(cleanStr)) return fallback;
  const num = parseFloat(cleanStr.replace(/[^0-9.-]/g, ''));
  return !isNaN(num) ? num : fallback;
}

// =========================================================================
// EXPORT PROJECT TO EXCEL (.XLSX)
// =========================================================================

export function exportProjectToExcel(project: ElectricalProject, customFilename?: string): void {
  const wb = XLSX.utils.book_new();
  const { msb, subDbs, dbs, msbDirectLoads, voltageSystem } = project;
  const cableSchedule = project.cableSchedule || DEFAULT_CABLE_SCHEDULE;
  const cableDefinitions = project.cableDefinitions || DEFAULT_CABLE_DEFINITIONS;
  const circuitPresets = project.circuitPresets || DEFAULT_CIRCUIT_PRESETS;
  const allMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [msb];

  // -----------------------------------------------------------------------
  // SHEET 1: Project Overview
  // -----------------------------------------------------------------------
  const overviewData: any[][] = [
    ['ELECTRICAL LOAD SCHEDULE & ENGINEERING CALCULATION REPORT'],
    ['Generated by Electric Load Calculator (IEC 60364 / BS 7671)'],
    [],
    ['PROJECT METADATA', ''],
    ['Project Name', project.name || 'Electrical Project'],
    ['Project Description', project.description || ''],
    ['Client', project.client || ''],
    ['Engineer / Consultant', project.engineer || 'Consulting Electrical Engineer'],
    ['Standard', voltageSystem.standard],
    ['Voltage System ID', voltageSystem.id],
    ['Voltage System Label', voltageSystem.label],
    ['Line-to-Line Voltage (Vll)', voltageSystem.Vll],
    ['Line-to-Neutral Voltage (Vln)', voltageSystem.Vln],
    ['Operating Frequency (Hz)', voltageSystem.frequency],
    ['Date Created', project.dateCreated || new Date().toISOString().split('T')[0]],
    ['Last Modified', project.lastModified || new Date().toISOString()],
    ['Exported Timestamp', new Date().toISOString()],
    [],
    ['EXECUTIVE SUMMARY', ''],
    ['Total Main Switchboards (MSBs)', allMsbs.length],
    ['Total Sub-Distribution Boards', subDbs.length],
    ['Total Final Distribution Boards', dbs.length],
    ['Total Final Branch Circuits', dbs.reduce((acc, d) => acc + d.circuits.length, 0)],
    ['Total Cable Specifications in Library', cableDefinitions.length],
    ['Total Protective Breaker Rules Configured', cableSchedule.length],
    ['Total Reusable Circuit Presets Configured', circuitPresets.length],
    [],
    ['MAIN SWITCHBOARDS OVERVIEW', ''],
    ...allMsbs.flatMap((m, idx) => [
      [`MSB #${idx + 1}: ${m.code}${m.name ? ` - ${m.name}` : ''}`, ''],
      ['  Maximum Demand (kW / kVA)', `${Number(m.totalPlantMaximumDemandKW.toFixed(2))} kW / ${Number(m.totalPlantMaximumDemandKVA.toFixed(2))} kVA`],
      ['  Connected Load (kW / kVA)', `${Number(m.connectedLoadKW.toFixed(2))} kW / ${Number(m.connectedLoadKVA.toFixed(2))} kVA`],
      ['  Design Current Ib (A)', `${Number(m.totalPlantCurrentAmps.toFixed(1))} A`],
      ['  Main Busbar Sizing', m.busbarSizing?.formattedDescription || `${Number(m.totalPlantCurrentAmps.toFixed(1))} A`],
      ['  Main Incomer Breaker', m.mainIncomerBreaker?.description || ''],
      ['  Recommended Transformer', `${m.transformerSizing?.recommendedKVA || 0} kVA (${Number((m.transformerSizing?.loadingPercent || 0).toFixed(1))}%)`],
      ['  Recommended Generator Prime', `${m.generatorSizing?.recommendedPrimeKVA || 0} kVA`],
      ['  PFC Capacitor Bank', `${m.capacitorBankSizing?.recommendedBankKVAr || 0} kVAr`],
      [],
    ]),
  ];

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  wsOverview['!cols'] = [{ wch: 42 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Project Overview');

  // -----------------------------------------------------------------------
  // SHEET 2: MSB Plant Sizing
  // -----------------------------------------------------------------------
  const msbData: any[][] = [
    ['MAIN SWITCH BOARD (MSB) CONFIGURATION & RESULTS'],
    [],
    [
      'MSB ID',
      'MSB Code',
      'MSB Name',
      'Location',
      'Building Overall DF',
      'Safety Margin %',
      'Transformer Utilization %',
      'Target Power Factor',
      'Generator Sizing Scope',
      'Manual Breaker Override (A)',
      'Manual Transformer Override (kVA)',
      'Manual Generator Override (kVA)',
      'Busbar Material',
      'Busbar Current Density (A/mm2)',
      'Busbar Design Current Override (A)',
      'Busbar Icw (kA)',
      'Busbar Fault Duration (s)',
      'Busbar Material Constant k',
      'Busbar Selected Width (mm)',
      'Busbar Selected Thickness (mm)',
      'Busbar Selected Runs',
      'Busbar Manual Override',
      'Capacitor Vrated (V)',
      'Capacitor Vsupply (V)',
      'Capacitor Steps Count',
      'Initial Power Factor',
      'Configured Steps (JSON)',
      'Total Connected Load (kW)',
      'Total Connected Load (kVA)',
      'Total Plant MD (kW)',
      'Total Plant MD (kVA)',
      'Main Busbar Current (A)',
      'Main Busbar Sizing',
      'Main Incomer Breaker',
      'Transformer (kVA)',
      'Transformer Loading %',
      'Generator Prime (kVA)',
      'Capacitor Bank (kVAr)',
    ],
    ...allMsbs.map((m) => [
      m.id,
      m.code,
      m.name,
      m.location || 'Main Substation',
      m.overallBuildingDiversityFactor,
      m.safetyMarginPercent ?? 25,
      m.txUtilizationPercent ?? m.utilizationPercent ?? 80,
      m.targetPowerFactor ?? 0.99,
      m.generatorSizingScope || 'ESSENTIAL_LOADS_ONLY',
      m.manualMainIncomerBreakerRating || m.manualIncomerBreakerRating || '',
      m.manualTransformerKVA || '',
      m.manualGeneratorKVA || '',
      m.busbarMaterial || 'COPPER',
      m.busbarCurrentDensity ?? 1.4,
      m.busbarDesignCurrentId || '',
      m.busbarIcwKA ?? 65,
      m.busbarFaultDuration ?? 1.0,
      m.busbarMaterialConstantK ?? 143,
      m.busbarSelectedWidth || '',
      m.busbarSelectedThickness || '',
      m.busbarSelectedRuns || '',
      m.busbarManualOverride ? 'TRUE' : 'FALSE',
      m.vRated ?? 525,
      m.vSupply ?? 420,
      m.capacitorStepsCount ?? 12,
      m.initialPowerFactor ?? 0.8,
      m.customCapacitorSteps ? JSON.stringify(m.customCapacitorSteps) : '',
      Number(m.connectedLoadKW.toFixed(2)),
      Number(m.connectedLoadKVA.toFixed(2)),
      Number(m.totalPlantMaximumDemandKW.toFixed(2)),
      Number(m.totalPlantMaximumDemandKVA.toFixed(2)),
      Number(m.totalPlantCurrentAmps.toFixed(1)),
      m.busbarSizing?.formattedDescription || `${Number(m.totalPlantCurrentAmps.toFixed(1))} A`,
      m.mainIncomerBreaker?.description || '',
      m.transformerSizing?.recommendedKVA || '',
      Number((m.transformerSizing?.loadingPercent || 0).toFixed(1)),
      m.generatorSizing?.recommendedPrimeKVA || '',
      m.capacitorBankSizing?.recommendedBankKVAr || '',
    ]),
    [],
    ['DIRECT MAJOR LOADS CONNECTED TO MSB'],
    [
      'Load ID',
      'Supplying MSB ID',
      'Supplying MSB Code',
      'Equipment Code',
      'Equipment Name',
      'Equipment Type',
      'Essential Genset Status',
      'Quantity',
      'Unit Rating (Watts)',
      'Power Factor',
      'Diversity Factor',
      'Connected Load (kW)',
      'Maximum Demand (kW)',
      'Design Current Ib (A)',
      'Protective Breaker',
      'Feeder Cable',
      'Notes',
    ],
    ...(msbDirectLoads || []).map((l) => {
      const parentMsb = allMsbs.find((m) => m.id === (l as any).msbId) || msb;
      return [
        l.id,
        (l as any).msbId || parentMsb.id,
        parentMsb.code,
        l.code || '',
        l.name,
        l.equipmentType,
        l.isEssential ? 'YES' : 'NO',
        l.quantity,
        l.unitWatts,
        l.powerFactor,
        l.diversityFactor,
        Number(l.connectedLoadKW.toFixed(2)),
        Number(l.maximumDemandKW.toFixed(2)),
        Number(l.currentIb.toFixed(1)),
        l.recommendedBreaker?.description || '',
        l.recommendedCable || '',
        l.notes || '',
      ];
    }),
    [],
    ['PFC CAPACITOR BANK STEP LADDER & BREAKER SCHEDULE'],
    [
      'MSB ID',
      'MSB Code',
      'Step #',
      'Unit Rated Q (kVAr)',
      'Unit Effective Q (kVAr)',
      'Configured Quantity',
      'Total Rated Q (kVAr)',
      'Total Effective Q (kVAr)',
      'Operating Current (1.5x FLC A)',
      'Proposed Step MCCB Breaker',
    ],
    ...allMsbs.flatMap((m) => {
      const cb = m.capacitorBankSizing;
      if (!cb || !cb.steps) return [];
      return cb.steps.map((s, idx) => [
        m.id,
        m.code,
        idx + 1,
        s.sizeKVAr,
        Number((s.sizeKVAr * cb.ratio).toFixed(2)),
        s.quantity,
        s.totalKVArRated,
        Number(s.effectiveKVArSupply.toFixed(2)),
        Number(s.operatingCurrentAmps.toFixed(2)),
        `${s.proposedMCCBRating}A 3-Pole MCCB`,
      ]);
    }),
  ];

  const wsMsb = XLSX.utils.aoa_to_sheet(msbData);
  wsMsb['!cols'] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 15 },
    { wch: 18 },
    { wch: 24 },
    { wch: 22 },
    { wch: 24 },
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 24 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 28 },
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMsb, 'MSB Plant Sizing');

  // -----------------------------------------------------------------------
  // SHEET 3: Sub-DBs (Level 2)
  // -----------------------------------------------------------------------
  const subDbData: any[][] = [
    ['SUB-DISTRIBUTION BOARDS (LEVEL 2) FEEDER SCHEDULE'],
    [],
    [
      'Sub-DB ID',
      'Supplying MSB ID',
      'Supplying MSB Code',
      'Sub-DB Code',
      'Sub-DB Name / Zone',
      'Location',
      'Group Diversity (DF)',
      'Safety Margin %',
      'Utilization %',
      'Essential Genset Status',
      'Connected DB IDs (Comma Separated)',
      'Connected DBs Count',
      'Summed CL (kW)',
      'Summed CL (kVA)',
      'Diversified MD (kW)',
      'Diversified MD (kVA)',
      'Design Current Ib (A)',
      'Phase R (A)',
      'Phase Y (A)',
      'Phase B (A)',
      'Phase Unbalance %',
      'Incomer Breaker',
      'Feeder Cable',
      'Cable Length (m)',
      'Voltage Drop Basis',
      'Manual Cable Override',
      'Manual Breaker Override',
      'Voltage Drop (V)',
      'Voltage Drop (%)',
    ],
    ...subDbs.map((sb) => {
      const pR = sb.phaseBalance?.phaseR.currentAmps || 0;
      const pY = sb.phaseBalance?.phaseY.currentAmps || 0;
      const pB = sb.phaseBalance?.phaseB.currentAmps || 0;
      const unb = sb.phaseBalance?.unbalancePercent || 0;
      const parentMsb = allMsbs.find((m) => m.id === sb.msbId) || msb;
      return [
        sb.id,
        sb.msbId || parentMsb.id,
        parentMsb.code,
        sb.code,
        sb.name,
        sb.location || 'Sub-Switchroom',
        sb.groupDiversityFactor,
        sb.safetyMarginPercent ?? 20,
        sb.utilizationPercent ?? 80,
        sb.essentialGenset || '',
        (sb.connectedDbIds || []).join(', '),
        (sb.connectedDbIds || []).length,
        Number(sb.connectedLoadKW.toFixed(2)),
        Number(sb.connectedLoadKVA.toFixed(2)),
        Number(sb.maximumDemandKW.toFixed(2)),
        Number(sb.maximumDemandKVA.toFixed(2)),
        Number(sb.incomerCurrentAmps.toFixed(1)),
        Number(pR.toFixed(1)),
        Number(pY.toFixed(1)),
        Number(pB.toFixed(1)),
        Number(unb.toFixed(1)),
        sb.incomerBreaker?.description || '',
        sb.incomerCable || '',
        sb.cableLengthMeters ?? 35,
        sb.voltageDropBasis || 'BREAKER',
        sb.manualIncomerCable || '',
        sb.manualIncomerBreakerRating || '',
        Number((sb.voltageDropV ?? 0).toFixed(2)),
        Number((sb.voltageDropPercent ?? 0).toFixed(2)),
      ];
    }),
  ];

  const wsSubDbs = XLSX.utils.aoa_to_sheet(subDbData);
  wsSubDbs['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 32 },
    { wch: 22 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 30 },
    { wch: 26 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSubDbs, 'Sub-DBs (Level 2)');

  // -----------------------------------------------------------------------
  // SHEET 4: Distribution Boards (Level 1)
  // -----------------------------------------------------------------------
  const dbData: any[][] = [
    ['FINAL DISTRIBUTION BOARDS (LEVEL 1) SCHEDULE'],
    [],
    [
      'DB ID',
      'Supplying Sub-DB or MSB ID',
      'Supplying Sub-DB or MSB Code',
      'DB Code',
      'Board Description',
      'Location',
      'Is Three Phase',
      'Assigned Phase (1P)',
      'Board Diversity (DF)',
      'Safety Margin %',
      'Utilization %',
      'Essential Genset Status',
      'Total Circuits Count',
      'Connected Load (kW)',
      'Connected Load (kVA)',
      'Maximum Demand (kW)',
      'Maximum Demand (kVA)',
      'Incomer Current Ib (A)',
      'Phase Unbalance %',
      'Incomer Breaker',
      'Incomer Cable',
      'Cable Length (m)',
      'Voltage Drop Basis',
      'Manual Cable Override',
      'Manual Breaker Override',
      'Voltage Drop (V)',
      'Voltage Drop (%)',
    ],
    ...dbs.map((db) => {
      const parentSub = subDbs.find((s) => s.id === db.subDbId);
      const parentMsb = allMsbs.find((m) => m.id === db.subDbId || m.code === db.subDbId);
      const parentCode = parentSub ? parentSub.code : parentMsb ? parentMsb.code : 'MSB';

      return [
        db.id,
        db.subDbId,
        parentCode,
        db.code,
        db.name,
        db.location || 'Electrical Riser',
        db.isThreePhase ? 'TRUE' : 'FALSE',
        db.isThreePhase ? '3P' : db.phase || 'R',
        db.boardDiversityFactor,
        db.safetyMarginPercent ?? 10,
        db.utilizationPercent ?? 80,
        db.essentialGenset || '',
        db.circuits.length,
        Number(db.connectedLoadKW.toFixed(2)),
        Number(db.connectedLoadKVA.toFixed(2)),
        Number(db.maximumDemandKW.toFixed(2)),
        Number(db.maximumDemandKVA.toFixed(2)),
        Number(db.incomerCurrentAmps.toFixed(1)),
        db.isThreePhase ? Number((db.phaseBalance?.unbalancePercent || 0).toFixed(1)) : 'N/A (1P)',
        db.incomerBreaker?.description || '',
        db.incomerCable || '',
        db.cableLengthMeters ?? 25,
        db.voltageDropBasis || 'BREAKER',
        db.manualIncomerCable || '',
        db.manualIncomerBreakerRating || '',
        Number((db.voltageDropV ?? 0).toFixed(2)),
        Number((db.voltageDropPercent ?? 0).toFixed(2)),
      ];
    }),
  ];

  const wsDbs = XLSX.utils.aoa_to_sheet(dbData);
  wsDbs['!cols'] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 15 },
    { wch: 32 },
    { wch: 22 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 30 },
    { wch: 26 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDbs, 'Distribution Boards');

  // -----------------------------------------------------------------------
  // SHEET 5: Circuits Schedule
  // -----------------------------------------------------------------------
  const circuitRows: any[][] = [
    ['FINAL BRANCH CIRCUITS DETAILED SCHEDULE'],
    [],
    [
      'Circuit ID',
      'DB ID',
      'DB Code',
      'Circuit #',
      'Circuit Description',
      'Category',
      'Phase',
      'Quantity',
      'Unit Watts (W)',
      'Power Factor (cos phi)',
      'Diversity Factor (DF)',
      'Connected Load (kW)',
      'Maximum Demand (kW)',
      'Design Current Ib (A)',
      'Recommended Breaker',
      'Recommended Cable',
      'Preset Group ID',
      'Circuit Notes',
    ],
  ];

  dbs.forEach((db) => {
    db.circuits.forEach((c, idx) => {
      circuitRows.push([
        c.id,
        db.id,
        db.code,
        idx + 1,
        c.name,
        c.category,
        c.phase,
        c.quantity,
        c.unitWatts,
        c.powerFactor,
        c.diversityFactor,
        Number(c.connectedLoadKW.toFixed(2)),
        Number(c.maximumDemandKW.toFixed(2)),
        Number(c.currentIb.toFixed(1)),
        c.recommendedBreaker?.description || '',
        c.recommendedCable || '',
        c.presetId || '',
        c.notes || '',
      ]);
    });
  });

  const wsCircuits = XLSX.utils.aoa_to_sheet(circuitRows);
  wsCircuits['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 15 },
    { wch: 10 },
    { wch: 34 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 30 },
    { wch: 26 },
    { wch: 18 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCircuits, 'Circuits Schedule');

  // -----------------------------------------------------------------------
  // SHEET 6: Cable Schedule (Conductor Library View)
  // -----------------------------------------------------------------------
  const wsCable = buildCableScheduleSheet(cableDefinitions, cableSchedule);
  XLSX.utils.book_append_sheet(wb, wsCable, 'Cable Schedule');

  // -----------------------------------------------------------------------
  // SHEET 7: Breaker Schedule (Protective Device Sizing View)
  // -----------------------------------------------------------------------
  const wsBreakers = buildBreakerScheduleSheet(cableSchedule, cableDefinitions);
  XLSX.utils.book_append_sheet(wb, wsBreakers, 'Breaker Schedule');

  // -----------------------------------------------------------------------
  // SHEET 8: Circuit Presets (Reusable load templates)
  // -----------------------------------------------------------------------
  const presetRows: any[][] = [
    ['CIRCUIT PRESET TEMPLATES (REUSABLE LOAD GROUPS)'],
    ['Configured Preset Groups with standard quantities, load wattages, PF, and DF'],
    [],
    [
      'Preset ID',
      'Preset Name',
      'Category',
      'Quantity',
      'Unit Watts (W)',
      'Power Factor',
      'Diversity Factor',
      'Description',
    ],
    ...circuitPresets.map((p) => [
      p.id,
      p.name,
      p.category || 'CUSTOM',
      p.quantity,
      p.unitWatts,
      p.powerFactor,
      p.diversityFactor,
      p.description || '',
    ]),
  ];
  const wsPresets = XLSX.utils.aoa_to_sheet(presetRows);
  wsPresets['!cols'] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPresets, 'Circuit Presets');

  // Trigger browser download
  const defaultName = (project.name || 'Electrical_Project')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40);
  const finalFilename = customFilename
    ? (customFilename.toLowerCase().endsWith('.xlsx') ? customFilename : `${customFilename}.xlsx`)
    : `${defaultName}_Load_Schedule.xlsx`;
  XLSX.writeFile(wb, finalFilename);
}

// =========================================================================
// SIZING REFERENCE DEDICATED EXCEL EXPORT & BUILDERS
// =========================================================================

/**
 * Builds the Cable Schedule worksheet containing all conductor specifications
 */
export function buildCableScheduleSheet(
  cableDefinitions: CableDefinitionEntry[],
  breakerSchedule: CableScheduleEntry[] = []
): XLSX.WorkSheet {
  const usageMap = new Map<string, number>();
  for (const b of breakerSchedule) {
    const key = (b.cableSize || '').trim().toLowerCase();
    usageMap.set(key, (usageMap.get(key) || 0) + 1);
  }

  // Group by category: 1P, 3P, BUSDUCT, sorted by maxAmps
  const sortedDefs = [...cableDefinitions].sort((a, b) => {
    const catOrder: Record<string, number> = { '1P': 1, '3P': 2, 'BUSDUCT': 3 };
    const orderA = catOrder[a.category] || 99;
    const orderB = catOrder[b.category] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.maxAmps - b.maxAmps;
  });

  const rows: any[][] = [
    ['CABLE SCHEDULE & CONDUCTOR SPECIFICATIONS LIBRARY (IEC 60364 / BS 7671)'],
    ['Conductor Current-Carrying Capacity (Iz), Voltage Drop Factor (mV/A/m), CPC Sizes & Reference Methods'],
    [],
    [
      'Cable ID',
      'Category',
      'Cable Size / Conductor Specification',
      'Current-Carrying Capacity Iz (A)',
      'Voltage Drop Factor (mV/A/m)',
      'Earth / CPC Size',
      'Installation / Reference Method',
      'Referenced by Breakers Count',
      'Standard Notes / Application',
    ],
    ...sortedDefs.map((c) => {
      const usage = usageMap.get((c.cableSize || '').trim().toLowerCase()) || 0;
      return [
        c.id,
        c.category,
        c.cableSize,
        c.maxAmps,
        c.mvPerAmpMeter !== undefined ? c.mvPerAmpMeter : '',
        c.cpcSize || '',
        c.installationMethod || '',
        usage > 0 ? `${usage} Breaker${usage === 1 ? '' : 's'}` : '0 (Unassigned)',
        c.notes || '',
      ];
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 34 },
    { wch: 32 },
    { wch: 28 },
    { wch: 22 },
    { wch: 35 },
    { wch: 26 },
    { wch: 40 },
  ];
  return ws;
}

/**
 * Builds the Breaker Schedule worksheet containing protective device sizing & conductor pairings
 */
export function buildBreakerScheduleSheet(
  breakerSchedule: CableScheduleEntry[],
  cableDefinitions: CableDefinitionEntry[] = []
): XLSX.WorkSheet {
  const sortedBreakers = [...breakerSchedule].sort((a, b) => {
    if (a.phaseSystem !== b.phaseSystem) {
      return a.phaseSystem === '1P' ? -1 : 1;
    }
    return a.breakerRating - b.breakerRating;
  });

  const rows: any[][] = [
    ['BREAKER SCHEDULE & PROTECTIVE DEVICE SIZING (IEC 60364 / BS 7671)'],
    ['Protective Breakers (MCB / MCCB / ACB) with Referenced Cable Conductors (Ib ≤ In ≤ Iz)'],
    [],
    [
      'Rule ID',
      'Phase System',
      'Breaker Rating In (A)',
      'Breaker Type',
      'Poles',
      'Referenced Cable Specification',
      'Conductor Capacity Iz (A)',
      'Coordination Status (In ≤ Iz)',
      'Voltage Drop Factor (mV/A/m)',
      'Earth / CPC Size',
      'Installation Method',
      'Standard Notes',
    ],
    ...sortedBreakers.map((b) => {
      const isOverloaded = b.breakerRating > b.maxAmps;
      const statusText = isOverloaded
        ? 'WARNING: OVERLOADED (In > Iz)'
        : 'COMPLIANT (In ≤ Iz)';
      return [
        b.id,
        b.phaseSystem,
        b.breakerRating,
        b.breakerType,
        b.poles === 1 ? '1P' : b.poles === 2 ? '2P' : b.poles === 3 ? '3P' : `${b.poles}P`,
        b.cableSize,
        b.maxAmps,
        statusText,
        b.mvPerAmpMeter !== undefined ? b.mvPerAmpMeter : '',
        b.cpcSize || '',
        b.installationMethod || '',
        b.notes || '',
      ];
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 34 },
    { wch: 26 },
    { wch: 32 },
    { wch: 28 },
    { wch: 22 },
    { wch: 35 },
    { wch: 38 },
  ];
  return ws;
}

/**
 * Exports just the Sizing Reference library (Cable Schedule + Breaker Schedule) to a standalone Excel file
 */
export function exportSizingReferenceToExcel(
  cableDefinitions: CableDefinitionEntry[] = DEFAULT_CABLE_DEFINITIONS,
  breakerSchedule: CableScheduleEntry[] = DEFAULT_CABLE_SCHEDULE,
  projectName: string = 'Sizing_Reference'
): void {
  const wb = XLSX.utils.book_new();

  const wsCable = buildCableScheduleSheet(cableDefinitions, breakerSchedule);
  XLSX.utils.book_append_sheet(wb, wsCable, 'Cable Schedule');

  const wsBreakers = buildBreakerScheduleSheet(breakerSchedule, cableDefinitions);
  XLSX.utils.book_append_sheet(wb, wsBreakers, 'Breaker Schedule');

  const sanitizedName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  XLSX.writeFile(wb, `${sanitizedName}.xlsx`);
}

/**
 * Parses Cable Definitions from a 2D sheet row array
 * Uses strict row filtering so subtitle/description rows are never misidentified as table headers!
 */
export function parseCableDefinitionsSheet(rows: any[][]): CableDefinitionEntry[] {
  if (!rows || rows.length === 0) return [];

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 3) continue; // Real table header has at least 3 columns!

    const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
    if (
      (rowStr.includes('cable id') || rowStr.includes('conductor id') || rowStr.includes('category')) &&
      (rowStr.includes('size') || rowStr.includes('conductor') || rowStr.includes('capacity') || /\biz\b/i.test(rowStr))
    ) {
      headerIdx = i;
      break;
    }
  }

  // Fallback check
  if (headerIdx === -1) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
      if (nonEmptyCells.length < 3) continue;

      const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
      if (
        (rowStr.includes('cable') || rowStr.includes('conductor')) &&
        (rowStr.includes('size') || rowStr.includes('capacity') || /\biz\b/i.test(rowStr) || rowStr.includes('amp'))
      ) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map((c: any) => String(c).toLowerCase().trim());
  const idCol = headers.findIndex((h: string) => (h.includes('cable id') || h.includes('conductor id') || h === 'id') && !h.includes('size'));
  const catCol = headers.findIndex((h: string) => h.includes('category') || h.includes('type') || h.includes('phase system'));
  const sizeCol = headers.findIndex(
    (h: string) =>
      (h.includes('cable size') || h.includes('conductor spec') || h.includes('specification') || (h.includes('cable') && h.includes('spec')) || h === 'cable' || h === 'size') &&
      !h.includes('cpc') && !h.includes('earth') && !h.includes('id') && !h.includes('capacity') &&
      !(/\biz\b/i.test(h) && !h.includes('size'))
  );
  // Important: Must exclude 'size' because the word 'size' contains the substring 'iz' ('s-iz-e')!
  const maxAmpsCol = headers.findIndex(
    (h: string) =>
      !h.includes('size') &&
      !h.includes('breaker') &&
      !h.includes('voltage') &&
      !h.includes('drop') &&
      !h.includes('status') &&
      !h.includes('coordination') &&
      (/\biz\b/i.test(h) || h.includes('capacity') || h.includes('max amp') || h.includes('current-carrying') || h.includes('current carrying') || h === 'iz' || h === 'iz (a)')
  );
  const mvCol = headers.findIndex((h: string) => h.includes('mv') || h.includes('voltage drop') || (h.includes('drop') && !h.includes('cpc')));
  const cpcCol = headers.findIndex((h: string) => h.includes('cpc') || h.includes('earth') || h.includes('ground'));
  const methodCol = headers.findIndex((h: string) => h.includes('method') || h.includes('installation'));
  const notesCol = headers.findIndex((h: string) => h.includes('note') || h.includes('application') || h.includes('standard'));

  const parsedCables: CableDefinitionEntry[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;

    const rawSize = String(sizeCol !== -1 && r[sizeCol] !== undefined ? r[sizeCol] : r[2] || '').trim();
    if (!rawSize || rawSize.toUpperCase().includes('CABLE SIZE') || rawSize.toUpperCase().includes('CONDUCTOR SPEC')) {
      continue;
    }

    let cableSize = rawSize;
    // Auto-healing safeguard: if cable size is an ID (e.g. 'cdef-1p-1.5' or 'cs-1p-6'), restore actual cable definition
    if ((cableSize.startsWith('cdef-') || cableSize.startsWith('cs-')) && !cableSize.includes(' ') && !cableSize.includes('mm')) {
      const matchInDefs = DEFAULT_CABLE_DEFINITIONS.find((d) => d.id === cableSize);
      if (matchInDefs) {
        cableSize = matchInDefs.cableSize;
      } else {
        const matchInSchedule = DEFAULT_CABLE_SCHEDULE.find((s) => s.id === cableSize);
        if (matchInSchedule) {
          cableSize = matchInSchedule.cableSize;
        }
      }
    }

    const rawCat = String(catCol !== -1 && r[catCol] !== undefined ? r[catCol] : r[1] || '').toUpperCase();
    let category: CableCategoryType = '3P';
    if (rawCat.includes('BUS') || cableSize.toUpperCase().includes('BUSDUCT')) {
      category = 'BUSDUCT';
    } else if (
      rawCat.includes('1P') ||
      rawCat.includes('SINGLE') ||
      rawCat.includes('1-PHASE') ||
      cableSize.toUpperCase().includes('3C ') ||
      cableSize.toUpperCase().includes('1P')
    ) {
      category = '1P';
    } else {
      category = '3P';
    }

    // Match with default standard definitions by cable name to get standard fallback
    const normName = normalizeCableName(cableSize);
    const matchedDef = DEFAULT_CABLE_DEFINITIONS.find(
      (d) => normalizeCableName(d.cableSize) === normName
    );
    const standardFallback = matchedDef ? matchedDef.maxAmps : (category === '1P' ? 20 : category === '3P' ? 50 : 800);

    const maxAmps = Math.max(1, Math.round(parseSafeNumber(maxAmpsCol !== -1 ? r[maxAmpsCol] : r[3], standardFallback)));
    const rawMv = parseSafeNumber(mvCol !== -1 ? r[mvCol] : r[4], 0);
    const mvPerAmpMeter = rawMv > 0 ? rawMv : (matchedDef?.mvPerAmpMeter || (category === '1P' ? 4.4 : category === '3P' ? 1.1 : 0.05));
    const cpcSize = String(cpcCol !== -1 && r[cpcCol] ? r[cpcCol] : matchedDef?.cpcSize || r[5] || '').trim();
    const installationMethod = String(methodCol !== -1 && r[methodCol] ? r[methodCol] : matchedDef?.installationMethod || r[6] || '').trim();
    const notes = String(notesCol !== -1 && r[notesCol] ? r[notesCol] : (matchedDef?.notes || r[8] || '')).trim();
    const id = String(idCol !== -1 && r[idCol] ? r[idCol] : (matchedDef?.id || `cdef-${category.toLowerCase()}-${maxAmps}-${i}`)).trim();

    parsedCables.push({
      id,
      category,
      cableSize,
      maxAmps,
      mvPerAmpMeter,
      cpcSize: cpcSize || undefined,
      installationMethod: installationMethod || undefined,
      notes: notes || undefined,
    });
  }

  return parsedCables;
}

/**
 * Parses Breaker Schedule entries from a 2D sheet row array
 * Uses strict row filtering so subtitle/description rows are never misidentified as table headers!
 */
export function parseBreakerScheduleSheet(
  rows: any[][],
  knownCableDefs: CableDefinitionEntry[] = []
): CableScheduleEntry[] {
  if (!rows || rows.length === 0) return [];

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 3) continue; // Real table header has at least 3 columns!

    const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
    if (
      (rowStr.includes('rule id') || rowStr.includes('phase system') || rowStr.includes('breaker rating')) &&
      (rowStr.includes('cable') || rowStr.includes('breaker') || rowStr.includes('conductor'))
    ) {
      headerIdx = i;
      break;
    }
  }

  // Fallback check
  if (headerIdx === -1) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
      if (nonEmptyCells.length < 3) continue;

      const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
      if (
        (rowStr.includes('breaker') || rowStr.includes('rating') || rowStr.includes('in (a)')) &&
        (rowStr.includes('cable') || rowStr.includes('conductor') || rowStr.includes('size'))
      ) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map((c: any) => String(c).toLowerCase().trim());
  const idCol = headers.findIndex((h: string) => (h.includes('rule id') || h.includes('breaker id') || h === 'id') && !h.includes('cable') && !h.includes('phase'));
  const sysCol = headers.findIndex((h: string) => (h.includes('phase') || h.includes('system')) && !h.includes('cable') && !h.includes('breaker') && !h.includes('notes'));
  const ratingCol = headers.findIndex((h: string) => (h.includes('rating') || h.includes('in (a)') || h.includes('breaker rating')) && !h.includes('cable') && !h.includes('capacity') && !h.includes('voltage'));
  const typeCol = headers.findIndex((h: string) => (h.includes('breaker type') || h === 'type') && !h.includes('system') && !h.includes('phase'));
  const polesCol = headers.findIndex((h: string) => h.includes('pole'));
  const sizeCol = headers.findIndex(
    (h: string) =>
      (h.includes('referenced cable') || h.includes('cable spec') || h.includes('cable size') || (h.includes('cable') && !h.includes('id') && !h.includes('schedule'))) &&
      !h.includes('capacity') && !(/\biz\b/i.test(h) && !h.includes('size'))
  );
  // Important: Must exclude 'size' because 'size' contains 'iz'!
  const maxAmpsCol = headers.findIndex(
    (h: string) =>
      !h.includes('size') &&
      !h.includes('breaker') &&
      !h.includes('rating') &&
      !h.includes('drop') &&
      !h.includes('status') &&
      !h.includes('coordination') &&
      (/\biz\b/i.test(h) || h.includes('conductor capacity') || h.includes('capacity') || h.includes('current-carrying') || h.includes('current carrying'))
  );
  const mvCol = headers.findIndex((h: string) => h.includes('mv') || h.includes('voltage drop') || (h.includes('drop') && !h.includes('cpc')));
  const cpcCol = headers.findIndex((h: string) => h.includes('cpc') || h.includes('earth') || h.includes('ground'));
  const methodCol = headers.findIndex((h: string) => h.includes('method') || h.includes('installation'));
  const notesCol = headers.findIndex((h: string) => h.includes('note'));

  const parsedBreakers: CableScheduleEntry[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;

    const rawRating = parseSafeNumber(ratingCol !== -1 ? r[ratingCol] : r[2], 0);
    if (rawRating <= 0) continue;

    const rawSys = String(sysCol !== -1 && r[sysCol] !== undefined ? r[sysCol] : r[1] || '3P').toUpperCase();
    const phaseSystem: '1P' | '3P' = rawSys.includes('1') ? '1P' : '3P';

    const rawType = String(typeCol !== -1 && r[typeCol] !== undefined ? r[typeCol] : r[3] || 'MCB').toUpperCase();
    let breakerType: BreakerType = 'MCB';
    if (rawType.includes('ACB')) breakerType = 'ACB';
    else if (rawType.includes('MCCB')) breakerType = 'MCCB';

    const rawPoles = parseInt(String(polesCol !== -1 && r[polesCol] !== undefined ? r[polesCol] : r[4]), 10);
    const poles: 1 | 2 | 3 | 4 = (rawPoles === 1 || rawPoles === 2 || rawPoles === 3 || rawPoles === 4)
      ? rawPoles
      : phaseSystem === '1P'
      ? 1
      : 3;

    const rawCable = String(
      sizeCol !== -1 && r[sizeCol] !== undefined ? r[sizeCol] : r[5] || (phaseSystem === '1P' ? '2x1C 1.5mm² Cu/PVC +E' : '4x1C 25.0mm² Cu/PVC +E')
    ).trim();

    let cableSize = rawCable;
    // Auto-healing safeguard: if breaker cableSize is an ID (e.g. 'cs-1p-6' or 'cdef-1p-1.5'), restore actual specification
    if ((cableSize.startsWith('cs-') || cableSize.startsWith('cdef-')) && !cableSize.includes(' ') && !cableSize.includes('mm')) {
      const matchInSchedule = DEFAULT_CABLE_SCHEDULE.find((s) => s.id === cableSize);
      if (matchInSchedule) {
        cableSize = matchInSchedule.cableSize;
      } else {
        const matchInDefs = knownCableDefs.find((d) => d.id === cableSize) || DEFAULT_CABLE_DEFINITIONS.find((d) => d.id === cableSize);
        if (matchInDefs) {
          cableSize = matchInDefs.cableSize;
        }
      }
    }

    // Look up cable definition if available
    const normCable = normalizeCableName(cableSize);
    const matchedDef =
      knownCableDefs.find((c) => normalizeCableName(c.cableSize) === normCable) ||
      DEFAULT_CABLE_DEFINITIONS.find((c) => normalizeCableName(c.cableSize) === normCable);

    const fallbackAmps = matchedDef?.maxAmps || rawRating * 1.25;
    const maxAmps = parseSafeNumber(
      maxAmpsCol !== -1 ? r[maxAmpsCol] : r[6],
      fallbackAmps
    );
    const rawMv = parseSafeNumber(mvCol !== -1 ? r[mvCol] : r[8], 0);
    const mvPerAmpMeter = rawMv > 0 ? rawMv : matchedDef?.mvPerAmpMeter;
    const cpcSize = String(cpcCol !== -1 && r[cpcCol] ? r[cpcCol] : matchedDef?.cpcSize || '').trim();
    const installationMethod = String(methodCol !== -1 && r[methodCol] ? r[methodCol] : matchedDef?.installationMethod || '').trim();
    const notes = String(notesCol !== -1 && r[notesCol] ? r[notesCol] : '').trim();
    const id = String(idCol !== -1 && r[idCol] ? r[idCol] : `cs-${phaseSystem.toLowerCase()}-${rawRating}-${i}`);

    parsedBreakers.push({
      id,
      phaseSystem,
      breakerRating: rawRating,
      breakerType,
      poles,
      cableSize,
      maxAmps,
      mvPerAmpMeter,
      cpcSize: cpcSize || undefined,
      installationMethod: installationMethod || undefined,
      notes: notes || undefined,
    });
  }

  return parsedBreakers;
}

/**
 * Parses Circuit Presets from a 2D sheet row array
 */
export function parseCircuitPresetsSheet(rows: any[][]): CircuitPreset[] {
  if (!rows || rows.length === 0) return [];

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 2) continue;

    const rowStr = row.map((c: any) => String(c).toLowerCase()).join(' ');
    if (rowStr.includes('preset id') || (rowStr.includes('preset') && (rowStr.includes('name') || rowStr.includes('unit watts')))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map((c: any) => String(c).toLowerCase().trim());
  const idCol = headers.findIndex((h) => h === 'preset id' || h === 'id' || (h.includes('preset') && h.includes('id')));
  const nameCol = headers.findIndex((h) => h === 'preset name' || h === 'name');
  const catCol = headers.findIndex((h) => h.includes('category'));
  const qtyCol = headers.findIndex((h) => h.includes('quantity') || h.includes('qty'));
  const wattsCol = headers.findIndex((h) => h.includes('watt'));
  const pfCol = headers.findIndex((h) => h.includes('pf') || h.includes('power factor'));
  const dfCol = headers.findIndex((h) => h.includes('df') || h.includes('diversity'));
  const descCol = headers.findIndex((h) => h.includes('desc'));

  const presets: CircuitPreset[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;

    const name = String(nameCol !== -1 && r[nameCol] !== undefined ? r[nameCol] : r[1] || '').trim();
    if (!name || name.toUpperCase().includes('PRESET NAME')) continue;

    const id = String(idCol !== -1 && r[idCol] ? r[idCol] : `preset-${i}`).trim();
    const category = normalizeCircuitCategory(catCol !== -1 ? r[catCol] : 'CUSTOM');
    const rawQtyCell = (qtyCol !== -1 && r[qtyCol] !== undefined && r[qtyCol] !== null && String(r[qtyCol]).trim() !== '')
      ? r[qtyCol]
      : (r[2] !== undefined && r[2] !== null && String(r[2]).trim() !== '' ? r[2] : undefined);
    const quantity = Math.max(0, Math.round(parseSafeNumber(rawQtyCell, 1)));
    const unitWatts = parseSafeNumber(wattsCol !== -1 ? r[wattsCol] : 1000, 1000);
    const powerFactor = Math.min(1.0, Math.max(0.1, parseSafeNumber(pfCol !== -1 ? r[pfCol] : 0.85, 0.85)));
    const diversityFactor = Math.min(1.0, Math.max(0.0, parseSafeNumber(dfCol !== -1 ? r[dfCol] : 1.0, 1.0)));
    const description = String(descCol !== -1 && r[descCol] ? r[descCol] : '').trim();

    presets.push({
      id,
      name,
      category,
      quantity,
      unitWatts,
      powerFactor,
      diversityFactor,
      description: description || undefined,
    });
  }

  return presets;
}

/**
 * Dedicated parser for standalone Sizing Reference Excel workbooks containing Cable Schedule & Breaker Schedule
 */
export function parseExcelToSizingReference(
  fileData: ArrayBuffer
): {
  cableDefinitions: CableDefinitionEntry[];
  breakerSchedule: CableScheduleEntry[];
  summary: string;
} {
  const wb = XLSX.read(fileData, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }

  const sheetToRows = (ws?: XLSX.WorkSheet): any[][] => {
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  };

  let wsCableDefs: XLSX.WorkSheet | undefined = undefined;
  let wsBreakers: XLSX.WorkSheet | undefined = undefined;

  for (const name of wb.SheetNames) {
    const lower = name.toLowerCase().trim();
    if (lower.includes('breaker') || lower.includes('protective')) {
      wsBreakers = wb.Sheets[name];
    } else if (
      lower.includes('cable schedule') ||
      lower.includes('cable spec') ||
      lower.includes('cable def') ||
      lower.includes('conductor') ||
      lower.includes('cable lib') ||
      lower === 'cables'
    ) {
      wsCableDefs = wb.Sheets[name];
    }
  }

  // Fallback check if single sheet
  if (!wsCableDefs && !wsBreakers) {
    const wsFirst = wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToRows(wsFirst);
    const isBreaker = rows.some((r) =>
      r.map((c: any) => String(c).toLowerCase()).join(' ').includes('breaker rating')
    );
    if (isBreaker) {
      wsBreakers = wsFirst;
    } else {
      wsCableDefs = wsFirst;
    }
  }

  let cableDefinitions: CableDefinitionEntry[] = DEFAULT_CABLE_DEFINITIONS;
  if (wsCableDefs) {
    const parsed = parseCableDefinitionsSheet(sheetToRows(wsCableDefs));
    if (parsed.length > 0) cableDefinitions = parsed;
  }

  let breakerSchedule: CableScheduleEntry[] = DEFAULT_CABLE_SCHEDULE;
  if (wsBreakers) {
    const parsed = parseBreakerScheduleSheet(sheetToRows(wsBreakers), cableDefinitions);
    if (parsed.length > 0) breakerSchedule = parsed;
  }

  // Reconcile referenced conductors
  for (const b of breakerSchedule) {
    const cableName = (b.cableSize || '').trim();
    if (!cableName) continue;
    const exists = cableDefinitions.some(
      (c) => c.cableSize.trim().toLowerCase() === cableName.toLowerCase()
    );
    if (!exists) {
      const isBusduct = cableName.toLowerCase().includes('busduct');
      const is1P = b.phaseSystem === '1P' || cableName.startsWith('2x1C') || cableName.startsWith('3C');
      cableDefinitions.push({
        id: `cdef-auto-${cableDefinitions.length + 1}`,
        category: isBusduct ? 'BUSDUCT' : is1P ? '1P' : '3P',
        cableSize: cableName,
        maxAmps: b.maxAmps || b.breakerRating * 1.25,
        mvPerAmpMeter: b.mvPerAmpMeter || (isBusduct ? 0.05 : is1P ? 4.4 : 1.1),
        cpcSize: b.cpcSize,
        installationMethod: b.installationMethod,
        notes: `Imported with ${b.breakerRating}A ${b.breakerType}`,
      });
    }
  }

  const summary = `Successfully imported Sizing Reference: ${cableDefinitions.length} Cable Specifications and ${breakerSchedule.length} Breaker Sizing Rules restored.`;

  return { cableDefinitions, breakerSchedule, summary };
}

// =========================================================================
// IMPORT EXCEL (.XLSX / .XLS) TO PROJECT
// =========================================================================

export function parseExcelToProject(
  fileData: ArrayBuffer,
  fallbackProject: ElectricalProject
): { project: ElectricalProject; summary: string } {
  const wb = XLSX.read(fileData, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }

  // Find sheet by fuzzy keyword matching
  const findSheet = (keywords: string[]): XLSX.WorkSheet | undefined => {
    for (const name of wb.SheetNames) {
      const lower = name.toLowerCase().trim();
      if (keywords.some((k) => lower.includes(k))) {
        return wb.Sheets[name];
      }
    }
    return undefined;
  };

  const wsOverview = findSheet(['overview', 'metadata', 'project', 'info', 'summary']);
  const wsMsb = findSheet(['msb', 'main switch', 'plant', 'main board']);
  const wsSubDbs = findSheet(['sub-db', 'subdb', 'sub dbs', 'sub-dbs', 'level 2', 'sub distribution', 'sub-board', 'sub board', 'sub db']);

  // Isolate final distribution boards sheet (avoid matching sub-distribution)
  const wsDbs = (() => {
    for (const name of wb.SheetNames) {
      const lower = name.toLowerCase().trim();
      if (lower.includes('sub')) continue;
      if (['distribution board', 'distribution', 'final db', 'final dbs', 'level 1', 'dbs', 'panel schedule', 'panels'].some((k) => lower.includes(k))) {
        return wb.Sheets[name];
      }
    }
    return findSheet(['distribution', 'dbs', 'final db', 'level 1']);
  })();

  const wsCircuits = findSheet(['circuit', 'branch', 'circuits schedule', 'circuits', 'load schedule']);
  const wsPresets = findSheet(['circuit preset', 'preset', 'presets']);

  // Disambiguate Cable Schedule and Breaker Schedule worksheets
  let wsCableDefs: XLSX.WorkSheet | undefined = undefined;
  let wsBreakers: XLSX.WorkSheet | undefined = undefined;

  for (const name of wb.SheetNames) {
    const lower = name.toLowerCase().trim();
    if (lower.includes('breaker') || lower.includes('protective')) {
      wsBreakers = wb.Sheets[name];
    } else if (
      lower === 'cable schedule' ||
      lower === 'cable specifications' ||
      lower === 'cable definitions' ||
      lower.includes('conductor') ||
      lower.includes('cable spec') ||
      lower.includes('cable def') ||
      lower.includes('cable lib')
    ) {
      wsCableDefs = wb.Sheets[name];
    }
  }

  // Fallback for legacy single sheet naming
  if (!wsCableDefs && !wsBreakers) {
    const wsLegacy = findSheet(['cable schedule', 'cable schedules', 'cables', 'cable', 'breaker cable']);
    if (wsLegacy) {
      const legacyRows = XLSX.utils.sheet_to_json(wsLegacy, { header: 1, defval: '' }) as any[][];
      const isBreakerSheet = legacyRows.some((r) =>
        r.map((c: any) => String(c).toLowerCase()).join(' ').includes('breaker rating')
      );
      if (isBreakerSheet) {
        wsBreakers = wsLegacy;
      } else {
        wsCableDefs = wsLegacy;
      }
    }
  }

  // Convert worksheet to array of rows
  const sheetToRows = (ws?: XLSX.WorkSheet): any[][] => {
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  };

  const overviewRows = sheetToRows(wsOverview);
  const msbRows = sheetToRows(wsMsb);
  const subDbRows = sheetToRows(wsSubDbs);
  const dbRows = sheetToRows(wsDbs);
  const circuitRows = sheetToRows(wsCircuits);
  const presetRows = sheetToRows(wsPresets);

  // -----------------------------------------------------------------------
  // 1. RESTORE PROJECT OVERVIEW & METADATA
  // -----------------------------------------------------------------------
  let projName = fallbackProject.name;
  let projDesc = fallbackProject.description;
  let projClient = fallbackProject.client || '';
  let projEng = fallbackProject.engineer || '';
  let voltage = fallbackProject.voltageSystem;

  let parsedVll: number | null = null;
  let parsedVln: number | null = null;
  let parsedFreq: number | null = null;
  let parsedStandard: any = null;

  for (const r of overviewRows) {
    const key = String(r[0] || '').toLowerCase().trim();
    const val = r[1] !== undefined ? String(r[1]).trim() : '';
    if (!val) continue;

    if (key.includes('project name')) projName = val;
    else if (key.includes('project description') || key === 'description') projDesc = val;
    else if (key === 'client') projClient = val;
    else if (key.includes('engineer')) projEng = val;
    else if (key.includes('standard')) {
      if (val.toUpperCase().includes('BS')) parsedStandard = 'BS';
      else if (val.toUpperCase().includes('NEC')) parsedStandard = 'NEC';
      else if (val.toUpperCase().includes('IEC')) parsedStandard = 'IEC';
    } else if (key.includes('voltage system id')) {
      const match = VOLTAGE_PRESETS.find((v) => v.id.toLowerCase() === val.toLowerCase());
      if (match) voltage = match;
    } else if (key.includes('line-to-line') || key.includes('vll')) {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) parsedVll = num;
    } else if (key.includes('line-to-neutral') || key.includes('vln')) {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) parsedVln = num;
    } else if (key.includes('frequency')) {
      const num = parseInt(val, 10);
      if (num === 50 || num === 60) parsedFreq = num;
    } else if (key.includes('voltage') && (val.includes('V') || val.includes('v'))) {
      const vMatch = val.match(/(\d{3})\s*V?/i);
      if (vMatch && !parsedVll) {
        parsedVll = parseInt(vMatch[1], 10);
      }
      if (val.includes('60Hz') || val.includes('60 Hz')) parsedFreq = 60;
      else if (val.includes('50Hz') || val.includes('50 Hz')) parsedFreq = 50;
    }
  }

  // If specific voltages were parsed, match preset or build exact VoltageSystem
  if (parsedVll) {
    const matchedPreset = VOLTAGE_PRESETS.find(
      (v) => v.Vll === parsedVll && (!parsedFreq || v.frequency === parsedFreq)
    );
    if (matchedPreset) {
      voltage = matchedPreset;
    } else {
      voltage = {
        id: `custom-${parsedVll}-${parsedVln || Math.round(parsedVll / Math.sqrt(3))}`,
        label: `${parsedVll}V / ${parsedVln || Math.round(parsedVll / Math.sqrt(3))}V ${parsedFreq || 50}Hz (${parsedStandard || 'CUSTOM'})`,
        standard: parsedStandard || 'CUSTOM',
        Vll: parsedVll,
        Vln: parsedVln || Math.round(parsedVll / Math.sqrt(3)),
        frequency: parsedFreq || 50,
      };
    }
  }

  // -----------------------------------------------------------------------
  // 2. RESTORE SIZING REFERENCE (CABLE SCHEDULE & BREAKER SCHEDULE)
  // -----------------------------------------------------------------------
  let restoredCableDefinitions: CableDefinitionEntry[] = fallbackProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS;
  if (wsCableDefs) {
    const parsedDefs = parseCableDefinitionsSheet(sheetToRows(wsCableDefs));
    if (parsedDefs.length > 0) {
      restoredCableDefinitions = parsedDefs;
    }
  }

  let restoredCableSchedule: CableScheduleEntry[] = fallbackProject.cableSchedule || DEFAULT_CABLE_SCHEDULE;
  if (wsBreakers) {
    const parsedBreakers = parseBreakerScheduleSheet(sheetToRows(wsBreakers), restoredCableDefinitions);
    if (parsedBreakers.length > 0) {
      restoredCableSchedule = parsedBreakers;
    }
  }

  // Cross-reconcile: ensure all conductors referenced by breaker rules exist in cableDefinitions
  for (const b of restoredCableSchedule) {
    const cableName = (b.cableSize || '').trim();
    if (!cableName) continue;
    const exists = restoredCableDefinitions.some(
      (c) => c.cableSize.trim().toLowerCase() === cableName.toLowerCase()
    );
    if (!exists) {
      const isBusduct = cableName.toLowerCase().includes('busduct');
      const is1P = b.phaseSystem === '1P' || cableName.startsWith('2x1C') || cableName.startsWith('3C');
      restoredCableDefinitions.push({
        id: `cdef-auto-${restoredCableDefinitions.length + 1}`,
        category: isBusduct ? 'BUSDUCT' : is1P ? '1P' : '3P',
        cableSize: cableName,
        maxAmps: b.maxAmps || b.breakerRating * 1.25,
        mvPerAmpMeter: b.mvPerAmpMeter || (isBusduct ? 0.05 : is1P ? 4.4 : 1.1),
        cpcSize: b.cpcSize,
        installationMethod: b.installationMethod,
        notes: `Imported with ${b.breakerRating}A ${b.breakerType}`,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 2B. RESTORE CIRCUIT PRESETS (Type A, Type B, etc.)
  // -----------------------------------------------------------------------
  let restoredCircuitPresets: CircuitPreset[] = fallbackProject.circuitPresets || DEFAULT_CIRCUIT_PRESETS;
  if (wsPresets) {
    const parsedPresets = parseCircuitPresetsSheet(presetRows);
    if (parsedPresets.length > 0) {
      restoredCircuitPresets = parsedPresets;
    }
  }

  // -----------------------------------------------------------------------
  // 3. RESTORE MAIN SWITCHBOARDS & DIRECT MAJOR LOADS (WITHOUT APPENDING)
  // -----------------------------------------------------------------------
  const parsedMsbs: MainSwitchBoard[] = [];
  const parsedDirectLoads: MsbDirectLoad[] = [];

  type MsbSectionState = 'NONE' | 'MSB_TABLE' | 'DIRECT_LOADS' | 'CAPACITOR_BANK';
  let msbSectionState: MsbSectionState = 'NONE';
  let msbHeaderIdx = -1;
  let msbHeaders: string[] = [];
  let msbIdCol = -1, msbCodeCol = -1, msbNameCol = -1, msbLocCol = -1;
  let msbDfCol = -1, msbMarginCol = -1, msbTargetPfCol = -1, msbGensetScopeCol = -1;
  let msbVRatedCol = -1, msbVSupplyCol = -1, msbCapStepsCol = -1, msbInitPfCol = -1, msbCustomStepsCol = -1;
  let msbManualBreakerCol = -1, msbManualTxCol = -1, msbManualGenCol = -1;
  let msbBusMaterialCol = -1, msbBusDensityCol = -1, msbBusDesignICol = -1, msbBusIcwCol = -1;
  let msbBusDurationCol = -1, msbBusKCol = -1, msbBusWidthCol = -1, msbBusThickCol = -1, msbBusRunsCol = -1, msbBusOverrideCol = -1;

  let directHeaderIdx = -1;
  let directHeaders: string[] = [];
  let dIdCol = -1, dMsbIdCol = -1, dMsbCodeCol = -1, dCodeCol = -1, dNameCol = -1, dTypeCol = -1;
  let dGensetCol = -1, dQtyCol = -1, dWattsCol = -1, dPfCol = -1, dDfCol = -1, dCableCol = -1;
  const seenMsbIds = new Set<string>();
  const seenDirectLoadIds = new Set<string>();

  for (let i = 0; i < msbRows.length; i++) {
    const row = msbRows[i];
    if (!row || row.length === 0) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length === 0) continue;
    const rowStr = row.map((c: any) => String(c)).join(' ').toUpperCase();

    // Section transitions - strict demarcations
    if (rowStr.includes('DIRECT MAJOR LOADS')) {
      msbSectionState = 'DIRECT_LOADS';
      continue;
    }
    if (
      rowStr.includes('PFC CAPACITOR BANK') ||
      rowStr.includes('CAPACITOR BANK STEP LADDER') ||
      rowStr.includes('UNIT RATED Q')
    ) {
      msbSectionState = 'CAPACITOR_BANK';
      continue;
    }
    if (msbSectionState === 'NONE' && (rowStr.includes('MAIN SWITCH') || rowStr.includes('MSB'))) {
      msbSectionState = 'MSB_TABLE';
    }

    if (msbSectionState === 'MSB_TABLE') {
      if (
        msbHeaderIdx === -1 &&
        nonEmptyCells.length >= 3 &&
        (rowStr.includes('MSB CODE') || rowStr.includes('MSB ID') || (rowStr.includes('MSB') && rowStr.includes('NAME')))
      ) {
        msbHeaderIdx = i;
        msbHeaders = row.map((c: any) => String(c).toLowerCase().trim());
        msbIdCol = msbHeaders.findIndex((h) => h === 'msb id' || h === 'id' || (h.includes('msb') && h.includes('id')));
        msbCodeCol = msbHeaders.findIndex((h) => h === 'msb code' || h === 'code' || (h.includes('msb') && h.includes('code')));
        msbNameCol = msbHeaders.findIndex((h) => h === 'msb name' || h === 'name' || (h.includes('msb') && h.includes('name')));
        msbLocCol = msbHeaders.findIndex((h) => h.includes('location'));
        msbDfCol = msbHeaders.findIndex((h) => h.includes('overall') || (h.includes('building') && h.includes('df')) || h === 'building overall df');
        msbMarginCol = msbHeaders.findIndex((h) => h.includes('margin'));
        const msbUtilCol = msbHeaders.findIndex((h) => h.includes('utilization') || h.includes('tx util') || h.includes('transformer util'));
        msbTargetPfCol = msbHeaders.findIndex((h) => h.includes('target power factor') || h.includes('target pf'));
        msbGensetScopeCol = msbHeaders.findIndex((h) => h.includes('generator') || h.includes('scope'));
        msbManualBreakerCol = msbHeaders.findIndex((h) => h.includes('manual breaker') || h.includes('breaker override'));
        msbManualTxCol = msbHeaders.findIndex((h) => h.includes('manual transformer') || h.includes('transformer override'));
        msbManualGenCol = msbHeaders.findIndex((h) => h.includes('manual generator') || h.includes('generator override'));
        msbBusMaterialCol = msbHeaders.findIndex((h) => h.includes('busbar material'));
        msbBusDensityCol = msbHeaders.findIndex((h) => h.includes('busbar current density') || h.includes('current density'));
        msbBusDesignICol = msbHeaders.findIndex((h) => h.includes('busbar design current'));
        msbBusIcwCol = msbHeaders.findIndex((h) => h.includes('icw'));
        msbBusDurationCol = msbHeaders.findIndex((h) => h.includes('fault duration'));
        msbBusKCol = msbHeaders.findIndex((h) => h.includes('material constant'));
        msbBusWidthCol = msbHeaders.findIndex((h) => h.includes('selected width') || h.includes('busbar width'));
        msbBusThickCol = msbHeaders.findIndex((h) => h.includes('selected thickness') || h.includes('busbar thickness'));
        msbBusRunsCol = msbHeaders.findIndex((h) => h.includes('selected runs') || h.includes('busbar runs'));
        msbBusOverrideCol = msbHeaders.findIndex((h) => h.includes('busbar manual'));
        msbVRatedCol = msbHeaders.findIndex((h) => h.includes('vrated'));
        msbVSupplyCol = msbHeaders.findIndex((h) => h.includes('vsupply'));
        msbCapStepsCol = msbHeaders.findIndex((h) => h.includes('steps count') || (h.includes('capacitor') && h.includes('step')));
        msbInitPfCol = msbHeaders.findIndex((h) => h.includes('initial power') || h.includes('initial pf'));
        msbCustomStepsCol = msbHeaders.findIndex((h) => h.includes('configured steps') || h.includes('steps (json)'));
        continue;
      }

      if (msbHeaderIdx !== -1 && i > msbHeaderIdx) {
        if (
          rowStr.includes('MSB CODE') ||
          rowStr.includes('MSB ID') ||
          rowStr.includes('DIRECT MAJOR LOADS') ||
          rowStr.includes('CAPACITOR BANK')
        ) {
          continue;
        }

        const rawCode = String(msbCodeCol !== -1 && row[msbCodeCol] ? row[msbCodeCol] : row[1] || '').trim();
        const rawId = String(msbIdCol !== -1 && row[msbIdCol] ? row[msbIdCol] : row[0] || '').trim();
        if (!rawCode && !rawId) continue;

        const id = rawId || `msb-${parsedMsbs.length + 1}`;
        if (seenMsbIds.has(id)) continue;
        seenMsbIds.add(id);

        const code = rawCode || `MSB-0${parsedMsbs.length + 1}`;
        const name = msbNameCol !== -1 && row[msbNameCol] !== undefined && row[msbNameCol] !== null
          ? String(row[msbNameCol]).trim()
          : '';
        const location = String(msbLocCol !== -1 && row[msbLocCol] ? row[msbLocCol] : row[3] || 'Main Substation').trim();
        const overallBuildingDiversityFactor = parseSafeNumber(msbDfCol !== -1 ? row[msbDfCol] : row[4], 0.8);
        const safetyMarginPercent = parseSafeNumber(msbMarginCol !== -1 ? row[msbMarginCol] : row[5], 25);
        const msbUtilCol = msbHeaders.findIndex((h) => h.includes('utilization') || h.includes('tx util') || h.includes('transformer util'));
        const txUtilizationPercent = msbUtilCol !== -1 && row[msbUtilCol] ? parseSafeNumber(row[msbUtilCol], 80) : undefined;
        const targetPowerFactor = parseSafeNumber(msbTargetPfCol !== -1 ? row[msbTargetPfCol] : row[6], 0.99);
        const rawScope = String(msbGensetScopeCol !== -1 ? row[msbGensetScopeCol] : row[7] || '').toUpperCase();
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

        const manualMainIncomerBreakerRating = msbManualBreakerCol !== -1 && row[msbManualBreakerCol] ? parseSafeNumber(row[msbManualBreakerCol], 0) || undefined : undefined;
        const manualTransformerKVA = msbManualTxCol !== -1 && row[msbManualTxCol] ? parseSafeNumber(row[msbManualTxCol], 0) || undefined : undefined;
        const manualGeneratorKVA = msbManualGenCol !== -1 && row[msbManualGenCol] ? parseSafeNumber(row[msbManualGenCol], 0) || undefined : undefined;

        const busbarMaterial = msbBusMaterialCol !== -1 && String(row[msbBusMaterialCol]).toUpperCase().includes('ALUM') ? ('ALUMINIUM' as const) : ('COPPER' as const);
        const busbarCurrentDensity = msbBusDensityCol !== -1 && row[msbBusDensityCol] ? parseSafeNumber(row[msbBusDensityCol], 1.4) : undefined;
        const busbarDesignCurrentId = msbBusDesignICol !== -1 && row[msbBusDesignICol] ? parseSafeNumber(row[msbBusDesignICol], 0) || undefined : undefined;
        const busbarIcwKA = msbBusIcwCol !== -1 && row[msbBusIcwCol] ? parseSafeNumber(row[msbBusIcwCol], 65) : undefined;
        const busbarFaultDuration = msbBusDurationCol !== -1 && row[msbBusDurationCol] ? parseSafeNumber(row[msbBusDurationCol], 1.0) : undefined;
        const busbarMaterialConstantK = msbBusKCol !== -1 && row[msbBusKCol] ? parseSafeNumber(row[msbBusKCol], 143) : undefined;
        const busbarSelectedWidth = msbBusWidthCol !== -1 && row[msbBusWidthCol] ? parseSafeNumber(row[msbBusWidthCol], 0) || undefined : undefined;
        const busbarSelectedThickness = msbBusThickCol !== -1 && row[msbBusThickCol] ? parseSafeNumber(row[msbBusThickCol], 0) || undefined : undefined;
        const busbarSelectedRuns = msbBusRunsCol !== -1 && row[msbBusRunsCol] ? parseSafeNumber(row[msbBusRunsCol], 0) || undefined : undefined;
        const busbarManualOverride = msbBusOverrideCol !== -1 && String(row[msbBusOverrideCol]).toUpperCase().includes('TRUE');

        const vRated = parseSafeNumber(msbVRatedCol !== -1 ? row[msbVRatedCol] : 525, 525);
        const vSupply = parseSafeNumber(msbVSupplyCol !== -1 ? row[msbVSupplyCol] : 420, 420);
        const capacitorStepsCount = Math.round(parseSafeNumber(msbCapStepsCol !== -1 ? row[msbCapStepsCol] : 12, 12));
        const initialPowerFactor = parseSafeNumber(msbInitPfCol !== -1 ? row[msbInitPfCol] : 0.8, 0.8);

        let customCapacitorSteps: CapacitorBankStep[] | undefined = undefined;
        const rawStepsJson = msbCustomStepsCol !== -1 ? row[msbCustomStepsCol] : undefined;
        if (rawStepsJson) {
          try {
            const parsed = typeof rawStepsJson === 'string' ? JSON.parse(rawStepsJson) : rawStepsJson;
            if (Array.isArray(parsed) && parsed.length > 0) {
              customCapacitorSteps = parsed;
            }
          } catch {
            // ignore JSON parse error
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
          manualMainIncomerBreakerRating,
          manualIncomerBreakerRating: manualMainIncomerBreakerRating,
          manualTransformerKVA,
          manualGeneratorKVA,
          busbarMaterial,
          busbarCurrentDensity,
          busbarDesignCurrentId,
          busbarIcwKA,
          busbarFaultDuration,
          busbarMaterialConstantK,
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
    } else if (msbSectionState === 'DIRECT_LOADS') {
      if (
        directHeaderIdx === -1 &&
        nonEmptyCells.length >= 3 &&
        (rowStr.includes('LOAD ID') || rowStr.includes('EQUIPMENT') || rowStr.includes('RATING'))
      ) {
        directHeaderIdx = i;
        directHeaders = row.map((c: any) => String(c).toLowerCase().trim());
        dIdCol = directHeaders.findIndex((h) => h === 'load id' || h === 'id' || (h.includes('load') && h.includes('id')));
        dMsbIdCol = directHeaders.findIndex((h) => h.includes('supplying msb id') || h === 'msb id' || h === 'msb');
        dMsbCodeCol = directHeaders.findIndex((h) => h.includes('msb code'));
        dCodeCol = directHeaders.findIndex((h) => h === 'equipment code' || h === 'code');
        dNameCol = directHeaders.findIndex((h) => h.includes('name') || h.includes('description') || h.includes('equipment'));
        dTypeCol = directHeaders.findIndex((h) => h.includes('type'));
        dGensetCol = directHeaders.findIndex((h) => h.includes('genset') || h.includes('essential'));
        dQtyCol = directHeaders.findIndex((h) => h.includes('qty') || h.includes('quantity'));
        dWattsCol = directHeaders.findIndex((h) => h.includes('watt') || h.includes('rating') || h.includes('unit'));
        dPfCol = directHeaders.findIndex((h) => h.includes('power factor') || h.includes('pf'));
        dDfCol = directHeaders.findIndex((h) => h.includes('diversity') || h.includes('df'));
        dCableCol = directHeaders.findIndex((h) => h.includes('cable') || h.includes('feeder'));
        const dNotesCol = directHeaders.findIndex((h) => h.includes('note'));
        continue;
      }

      if (directHeaderIdx !== -1 && i > directHeaderIdx) {
        if (
          rowStr.includes('EQUIPMENT CODE') ||
          rowStr.includes('LOAD ID') ||
          rowStr.includes('PFC CAPACITOR') ||
          rowStr.includes('CAPACITOR BANK')
        ) {
          continue;
        }

        const rawLoadId = String(dIdCol !== -1 && row[dIdCol] ? row[dIdCol] : row[0] || `ml-${parsedDirectLoads.length + 1}`).trim();
        const id = seenDirectLoadIds.has(rawLoadId) ? `${rawLoadId}-${parsedDirectLoads.length + 1}` : rawLoadId;
        seenDirectLoadIds.add(id);

        const rawMsbId = String(dMsbIdCol !== -1 && row[dMsbIdCol] ? row[dMsbIdCol] : '').trim();
        const rawMsbCode = String(dMsbCodeCol !== -1 && row[dMsbCodeCol] ? row[dMsbCodeCol] : '').trim();
        let targetMsbId = rawMsbId || parsedMsbs[0]?.id || 'msb-main';
        if (rawMsbCode && parsedMsbs.length > 0) {
          const matchByCode = parsedMsbs.find((m) => m.code.toUpperCase() === rawMsbCode.toUpperCase());
          if (matchByCode) targetMsbId = matchByCode.id;
        }

        const code = String(dCodeCol !== -1 && row[dCodeCol] ? row[dCodeCol] : `ML-0${parsedDirectLoads.length + 1}`).trim();
        const name = String(dNameCol !== -1 && row[dNameCol] ? row[dNameCol] : `Major Load ${parsedDirectLoads.length + 1}`).trim();
        const equipmentType = normalizeMajorEquipmentType(dTypeCol !== -1 ? row[dTypeCol] : 'OTHER');
        const rawGenset = String(dGensetCol !== -1 ? row[dGensetCol] : '').toUpperCase();
        const isEssential = rawGenset.includes('Y') || rawGenset.includes('TRUE') || rawGenset.includes('ESSENTIAL');
        const rawDQty = (dQtyCol !== -1 && row[dQtyCol] !== undefined && row[dQtyCol] !== null && String(row[dQtyCol]).trim() !== '')
          ? row[dQtyCol]
          : (row[6] !== undefined && row[6] !== null && String(row[6]).trim() !== '' ? row[6] : undefined);
        const quantity = Math.max(0, Math.round(parseSafeNumber(rawDQty, 1)));
        const unitWatts = parseSafeNumber(dWattsCol !== -1 ? row[dWattsCol] : 10000, 10000);
        const powerFactor = Math.min(1.0, Math.max(0.1, parseSafeNumber(dPfCol !== -1 ? row[dPfCol] : 0.85, 0.85)));
        const diversityFactor = Math.min(1.0, Math.max(0.0, parseSafeNumber(dDfCol !== -1 ? row[dDfCol] : 1.0, 1.0)));
        const recommendedCable = String(dCableCol !== -1 && row[dCableCol] ? row[dCableCol] : '').trim();
        const dNotesCol = directHeaders.findIndex((h) => h.includes('note'));
        const notes = String(dNotesCol !== -1 && row[dNotesCol] ? row[dNotesCol] : '').trim() || undefined;

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
          msbId: targetMsbId,
        });
      }
    } else if (msbSectionState === 'CAPACITOR_BANK') {
      // Step ladder display section - strictly skipped to avoid creating duplicate MSBs!
      continue;
    }
  }

  const primaryMsb = parsedMsbs[0] || fallbackProject.msb;

  // -----------------------------------------------------------------------
  // 4. RESTORE SUB-DISTRIBUTION BOARDS (LEVEL 2)
  // -----------------------------------------------------------------------
  const parsedSubDbs: SubDistributionBoard[] = [];
  let subDbHeaderIdx = -1;

  for (let i = 0; i < subDbRows.length; i++) {
    const row = subDbRows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 3) continue;

    const rowStr = row.map((c: any) => String(c)).join(' ').toUpperCase();
    if (rowStr.includes('SUB-DB CODE') || rowStr.includes('SUB-DB ID') || rowStr.includes('FEEDER CODE')) {
      subDbHeaderIdx = i;
      break;
    }
  }

  if (subDbHeaderIdx !== -1) {
    const headers = subDbRows[subDbHeaderIdx].map((c: any) => String(c).toLowerCase().trim());
    const idCol = headers.findIndex((h: string) => h === 'sub-db id' || h === 'id' || (h.includes('sub-db') && h.includes('id')));
    const msbIdCol = headers.findIndex((h: string) => h.includes('supplying msb id') || h === 'msb id' || h === 'msb');
    const msbCodeCol = headers.findIndex((h: string) => h.includes('supplying msb code') || h.includes('msb code'));
    let codeCol = headers.findIndex((h: string) => (h.includes('sub-db code') || h.includes('subdb code') || h === 'code' || h.includes('feeder code')) && !h.includes('supplying') && !h.includes('msb'));
    if (codeCol === -1) codeCol = headers.findIndex((h: string) => h.includes('code') && !h.includes('supplying') && !h.includes('msb'));
    let nameCol = headers.findIndex((h: string) => (h.includes('sub-db name') || h.includes('subdb name') || h.includes('zone') || h === 'name') && !h.includes('msb') && !h.includes('code'));
    if (nameCol === -1) nameCol = headers.findIndex((h: string) => (h.includes('name') || h.includes('zone')) && !h.includes('msb') && !h.includes('code'));
    const locCol = headers.findIndex((h: string) => h.includes('location'));
    const dfCol = headers.findIndex((h: string) => h.includes('diversity') || h.includes('df'));
    const marginCol = headers.findIndex((h: string) => h.includes('margin'));
    const utilCol = headers.findIndex((h: string) => h.includes('utilization'));
    const gensetCol = headers.findIndex((h: string) => h.includes('essential') || h.includes('genset'));
    const dbsCol = headers.findIndex((h: string) => h.includes('connected db'));
    const lenCol = headers.findIndex((h: string) => h.includes('cable length') || h.includes('length'));
    const basisCol = headers.findIndex((h: string) => h.includes('voltage drop basis') || h.includes('drop basis'));
    const manualCableCol = headers.findIndex((h: string) => h.includes('manual cable') || h.includes('cable override'));
    const manualBreakerCol = headers.findIndex((h: string) => h.includes('manual breaker') || h.includes('breaker override'));

    for (let i = subDbHeaderIdx + 1; i < subDbRows.length; i++) {
      const r = subDbRows[i];
      if (!r || r.length < 3) continue;

      const code = String(codeCol !== -1 && r[codeCol] ? r[codeCol] : '').trim();
      if (!code || code.toUpperCase().includes('CODE')) continue;

      const id = String(idCol !== -1 && r[idCol] ? r[idCol] : `sb-${Date.now()}-${parsedSubDbs.length + 1}`).trim();
      const rawMsbId = String(msbIdCol !== -1 && r[msbIdCol] ? r[msbIdCol] : '').trim();
      const rawMsbCode = String(msbCodeCol !== -1 && r[msbCodeCol] ? r[msbCodeCol] : '').trim();
      let msbId = rawMsbId || primaryMsb.id;
      if (rawMsbCode && parsedMsbs.length > 0) {
        const matched = parsedMsbs.find((m) => m.code.toUpperCase() === rawMsbCode.toUpperCase());
        if (matched) msbId = matched.id;
      }

      const name = nameCol !== -1 && r[nameCol] !== undefined && r[nameCol] !== null
        ? String(r[nameCol]).trim()
        : '';
      const location = String(locCol !== -1 && r[locCol] ? r[locCol] : 'Sub-Switchroom').trim();
      const groupDiversityFactor = parseSafeNumber(dfCol !== -1 ? r[dfCol] : 0.9, 0.9);
      const safetyMarginPercent = parseSafeNumber(marginCol !== -1 ? r[marginCol] : 20, 20);
      const utilizationPercent = utilCol !== -1 && r[utilCol] ? parseSafeNumber(r[utilCol], 80) : undefined;
      const essentialGenset = normalizeEssentialGenset(gensetCol !== -1 ? r[gensetCol] : undefined);
      const cableLengthMeters = parseSafeNumber(lenCol !== -1 ? r[lenCol] : 35, 35);
      const rawBasis = String(basisCol !== -1 && r[basisCol] ? r[basisCol] : '').toUpperCase();
      const voltageDropBasis: 'BREAKER' | 'DESIGN' = rawBasis.includes('DESIGN') || rawBasis.includes('IB') ? 'DESIGN' : 'BREAKER';
      const manualIncomerCable = (manualCableCol !== -1 && r[manualCableCol] ? String(r[manualCableCol]).trim() : undefined) || undefined;
      const manualIncomerBreakerRating = manualBreakerCol !== -1 && r[manualBreakerCol] ? parseSafeNumber(r[manualBreakerCol], 0) || undefined : undefined;

      const connectedDbIds: string[] = [];
      if (dbsCol !== -1 && r[dbsCol]) {
        const rawList = String(r[dbsCol]).split(/[,;]+/);
        rawList.forEach((item) => {
          const trimmed = item.trim();
          if (trimmed) connectedDbIds.push(trimmed);
        });
      }

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
        manualIncomerBreakerRating,
        connectedDbIds,
        connectedLoadKW: 0,
        connectedLoadKVA: 0,
        maximumDemandKW: 0,
        maximumDemandKVA: 0,
        incomerCurrentAmps: 0,
        incomerBreaker: {} as any,
        incomerCable: '',
      });
    }
  }

  // -----------------------------------------------------------------------
  // 5. RESTORE FINAL DISTRIBUTION BOARDS (LEVEL 1)
  // -----------------------------------------------------------------------
  const parsedDbsMap = new Map<string, DistributionBoard>();
  const dbCodeToIdMap = new Map<string, string>();
  let dbHeaderIdx = -1;

  for (let i = 0; i < dbRows.length; i++) {
    const row = dbRows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 3) continue;

    const rowStr = row.map((c: any) => String(c)).join(' ').toUpperCase();
    if (rowStr.includes('DB CODE') || rowStr.includes('BOARD CODE') || rowStr.includes('DB ID')) {
      dbHeaderIdx = i;
      break;
    }
  }

  if (dbHeaderIdx !== -1) {
    const headers = dbRows[dbHeaderIdx].map((c: any) => String(c).toLowerCase().trim());
    const idCol = headers.findIndex((h: string) => h === 'db id' || h === 'id' || (h.includes('db') && h.includes('id') && !h.includes('supplying') && !h.includes('sub-db')));
    const subDbIdCol = headers.findIndex((h: string) => (h.includes('supplying sub-db') || h.includes('sub-db or msb') || h.includes('supplying')) && h.includes('id'));
    const subDbCodeCol = headers.findIndex((h: string) => (h.includes('supplying sub-db') || h.includes('sub-db or msb') || h.includes('supplying')) && h.includes('code'));
    let codeCol = headers.findIndex((h: string) => (h.includes('db code') || h === 'db code' || h === 'board code' || h === 'code' || h.includes('panel code')) && !h.includes('supplying') && !h.includes('sub-db') && !h.includes('msb'));
    if (codeCol === -1) codeCol = headers.findIndex((h: string) => h.includes('code') && !h.includes('supplying') && !h.includes('sub-db') && !h.includes('msb'));
    let nameCol = headers.findIndex((h: string) => (h.includes('db name') || h.includes('board name') || h.includes('description') || h === 'name') && !h.includes('sub-db') && !h.includes('msb') && !h.includes('code'));
    if (nameCol === -1) nameCol = headers.findIndex((h: string) => (h.includes('description') || h.includes('name')) && !h.includes('sub-db') && !h.includes('msb') && !h.includes('code'));
    const locCol = headers.findIndex((h: string) => h.includes('location'));
    const is3PCol = headers.findIndex((h: string) => h.includes('three phase') || h.includes('phase system'));
    const phaseCol = headers.findIndex((h: string) => h.includes('assigned phase') || h.includes('phase (1p)'));
    const dfCol = headers.findIndex((h: string) => h.includes('diversity') || h.includes('df'));
    const marginCol = headers.findIndex((h: string) => h.includes('margin'));
    const utilCol = headers.findIndex((h: string) => h.includes('utilization'));
    const gensetCol = headers.findIndex((h: string) => h.includes('essential') || h.includes('genset'));
    const lenCol = headers.findIndex((h: string) => h.includes('cable length') || h.includes('length'));
    const basisCol = headers.findIndex((h: string) => h.includes('voltage drop basis') || h.includes('drop basis'));
    const manualCableCol = headers.findIndex((h: string) => h.includes('manual cable') || h.includes('cable override'));
    const manualBreakerCol = headers.findIndex((h: string) => h.includes('manual breaker') || h.includes('breaker override'));

    for (let i = dbHeaderIdx + 1; i < dbRows.length; i++) {
      const r = dbRows[i];
      if (!r || r.length < 3) continue;

      const code = String(codeCol !== -1 && r[codeCol] ? r[codeCol] : '').trim();
      if (!code || code.toUpperCase().includes('CODE')) continue;

      const id = String(idCol !== -1 && r[idCol] ? r[idCol] : `db-${Date.now()}-${parsedDbsMap.size + 1}`).trim();
      const rawSubDbId = String(subDbIdCol !== -1 && r[subDbIdCol] ? r[subDbIdCol] : '').trim();
      const rawSubDbCode = String(subDbCodeCol !== -1 && r[subDbCodeCol] ? r[subDbCodeCol] : '').trim();
      let matchedSubDb = parsedSubDbs.find((s) => s.id === rawSubDbId || (rawSubDbCode && s.code.toUpperCase() === rawSubDbCode.toUpperCase()) || s.code.toUpperCase() === rawSubDbId.toUpperCase());
      let matchedMsb = parsedMsbs.find((m) => m.id === rawSubDbId || (rawSubDbCode && m.code.toUpperCase() === rawSubDbCode.toUpperCase()) || m.code.toUpperCase() === rawSubDbId.toUpperCase());
      let subDbId = matchedSubDb ? matchedSubDb.id : (matchedMsb ? matchedMsb.id : (rawSubDbId || rawSubDbCode || parsedSubDbs[0]?.id || primaryMsb.id));

      const name = nameCol !== -1 && r[nameCol] !== undefined && r[nameCol] !== null
        ? String(r[nameCol]).trim()
        : '';
      const location = String(locCol !== -1 && r[locCol] ? r[locCol] : 'Electrical Riser').trim();

      const raw3P = String(is3PCol !== -1 && r[is3PCol] !== undefined ? r[is3PCol] : '').toUpperCase();
      const rawPhase = String(phaseCol !== -1 && r[phaseCol] !== undefined ? r[phaseCol] : 'R').toUpperCase();

      let isThreePhase = false;
      if (raw3P.includes('3') || raw3P.includes('TRUE') || raw3P.includes('THREE') || raw3P.includes('TP') || raw3P.includes('4W')) {
        isThreePhase = true;
      } else if (raw3P.includes('1') || raw3P.includes('FALSE') || raw3P.includes('SINGLE') || raw3P.includes('SP')) {
        isThreePhase = false;
      } else if (rawPhase.includes('3') || rawPhase === 'TPN' || rawPhase === 'TP') {
        isThreePhase = true;
      }

      let phase: 'R' | 'Y' | 'B' = 'R';
      if (rawPhase.includes('Y') || rawPhase.includes('YELLOW') || rawPhase.includes('L2')) {
        phase = 'Y';
      } else if (rawPhase.includes('B') || rawPhase.includes('BLUE') || rawPhase.includes('L3')) {
        phase = 'B';
      }

      const boardDiversityFactor = parseSafeNumber(dfCol !== -1 ? r[dfCol] : 1.0, 1.0);
      const safetyMarginPercent = parseSafeNumber(marginCol !== -1 ? r[marginCol] : 10, 10);
      const utilizationPercent = utilCol !== -1 && r[utilCol] ? parseSafeNumber(r[utilCol], 80) : undefined;
      const essentialGenset = normalizeEssentialGenset(gensetCol !== -1 ? r[gensetCol] : undefined);
      const cableLengthMeters = parseSafeNumber(lenCol !== -1 ? r[lenCol] : 25, 25);
      const rawBasis = String(basisCol !== -1 && r[basisCol] ? r[basisCol] : '').toUpperCase();
      const voltageDropBasis: 'BREAKER' | 'DESIGN' = rawBasis.includes('DESIGN') || rawBasis.includes('IB') ? 'DESIGN' : 'BREAKER';
      const manualIncomerCable = (manualCableCol !== -1 && r[manualCableCol] ? String(r[manualCableCol]).trim() : undefined) || undefined;
      const manualIncomerBreakerRating = manualBreakerCol !== -1 && r[manualBreakerCol] ? parseSafeNumber(r[manualBreakerCol], 0) || undefined : undefined;

      const dbObj: DistributionBoard = {
        id,
        subDbId,
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
        manualIncomerBreakerRating,
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
  }

  // -----------------------------------------------------------------------
  // 6. RESTORE BRANCH CIRCUITS
  // -----------------------------------------------------------------------
  let circuitHeaderIdx = -1;

  for (let i = 0; i < circuitRows.length; i++) {
    const row = circuitRows[i];
    if (!row) continue;
    const nonEmptyCells = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmptyCells.length < 3) continue;

    const rowStr = row.map((c: any) => String(c)).join(' ').toUpperCase();
    if (rowStr.includes('CIRCUIT DESCRIPTION') || (rowStr.includes('CIRCUIT') && rowStr.includes('CATEGORY'))) {
      circuitHeaderIdx = i;
      break;
    }
  }

  let totalCircuits = 0;

  if (circuitHeaderIdx !== -1) {
    const headers = circuitRows[circuitHeaderIdx].map((c: any) => String(c).toLowerCase().trim());
    const cIdCol = headers.findIndex((h: string) => h.includes('circuit id') || h === 'id');
    const dbIdCol = headers.findIndex((h: string) => h.includes('db id') || h.includes('board id') || h.includes('panel id'));
    const dbCodeCol = headers.findIndex((h: string) => h.includes('db code') || h.includes('board code') || h.includes('panel code') || h === 'db' || h === 'board' || h === 'panel');
    const nameCol = headers.findIndex((h: string) => h.includes('description') || h.includes('circuit name'));
    const catCol = headers.findIndex((h: string) => h.includes('category') || h.includes('type'));
    const phaseCol = headers.findIndex((h: string) => h.includes('phase'));
    const qtyCol = headers.findIndex((h: string) => h.includes('quantity') || h.includes('qty'));
    const wattsCol = headers.findIndex((h: string) => h.includes('watt') || h.includes('load (w)') || h.includes('unit'));
    const pfCol = headers.findIndex((h: string) => h.includes('pf') || h.includes('power factor') || h.includes('cos'));
    const dfCol = headers.findIndex((h: string) => h.includes('df') || h.includes('diversity factor'));
    const presetIdCol = headers.findIndex((h: string) => h.includes('preset'));
    const notesCol = headers.findIndex((h: string) => h.includes('note'));

    for (let i = circuitHeaderIdx + 1; i < circuitRows.length; i++) {
      const r = circuitRows[i];
      if (!r || r.length < 4) continue;

      const rawDbId = String(dbIdCol !== -1 && r[dbIdCol] ? r[dbIdCol] : r[1] || '').trim();
      const rawDbCode = String(dbCodeCol !== -1 && r[dbCodeCol] ? r[dbCodeCol] : r[2] || '').trim().toUpperCase();

      // Resolve parent Distribution Board
      let targetDb: DistributionBoard | undefined = undefined;

      if (rawDbId && parsedDbsMap.has(rawDbId)) {
        targetDb = parsedDbsMap.get(rawDbId);
      }
      if (!targetDb && rawDbCode && dbCodeToIdMap.has(rawDbCode)) {
        targetDb = parsedDbsMap.get(dbCodeToIdMap.get(rawDbCode)!);
      }
      if (!targetDb && rawDbId && dbCodeToIdMap.has(rawDbId.toUpperCase())) {
        targetDb = parsedDbsMap.get(dbCodeToIdMap.get(rawDbId.toUpperCase())!);
      }
      if (!targetDb && rawDbCode) {
        for (const [, board] of parsedDbsMap) {
          if (board.code.trim().toUpperCase() === rawDbCode) {
            targetDb = board;
            break;
          }
        }
      }
      if (!targetDb && parsedDbsMap.size === 1) {
        targetDb = Array.from(parsedDbsMap.values())[0];
      }

      // Auto-synthesize board if referenced in circuits but absent from DB list
      if (!targetDb && (rawDbCode || rawDbId)) {
        const autoCode = rawDbCode || rawDbId;
        const autoId = `db-${autoCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        targetDb = {
          id: autoId,
          subDbId: (parsedSubDbs[0]?.id) || primaryMsb.id,
          code: autoCode,
          name: '',
          location: 'Electrical Riser',
          isThreePhase: true,
          phase: 'R',
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
        parsedDbsMap.set(autoId, targetDb);
        dbCodeToIdMap.set(autoCode.toUpperCase(), autoId);
      }

      if (!targetDb) continue;

      const circuitId = String(cIdCol !== -1 && r[cIdCol] ? r[cIdCol] : `c-${targetDb.code}-${targetDb.circuits.length + 1}`).trim();
      const cName = String(nameCol !== -1 && r[nameCol] ? r[nameCol] : r[4] || `Circuit ${targetDb.circuits.length + 1}`).trim();
      const category = normalizeCircuitCategory(catCol !== -1 ? r[catCol] : r[5]);
      const rawPhase = phaseCol !== -1 ? r[phaseCol] : r[6];
      const phase = normalizePhase(rawPhase, targetDb.isThreePhase, targetDb.phase);
      const rawQtyCell = (qtyCol !== -1 && r[qtyCol] !== undefined && r[qtyCol] !== null && String(r[qtyCol]).trim() !== '')
        ? r[qtyCol]
        : (r[7] !== undefined && r[7] !== null && String(r[7]).trim() !== '' ? r[7] : undefined);
      const quantity = Math.max(0, Math.round(parseSafeNumber(rawQtyCell, 1)));
      const unitWatts = parseSafeNumber(wattsCol !== -1 ? r[wattsCol] : r[8], 100);
      const powerFactor = Math.min(1.0, Math.max(0.1, parseSafeNumber(pfCol !== -1 ? r[pfCol] : r[9], 0.9)));
      const diversityFactor = Math.min(1.0, Math.max(0.0, parseSafeNumber(dfCol !== -1 ? r[dfCol] : r[10], 1.0)));
      const presetId = String(presetIdCol !== -1 && r[presetIdCol] ? r[presetIdCol] : '').trim() || undefined;
      const notes = String(notesCol !== -1 && r[notesCol] ? r[notesCol] : '').trim();

      targetDb.circuits.push({
        id: circuitId,
        name: cName,
        category,
        presetId,
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
        recommendedCable: '',
        notes,
      });
      totalCircuits++;
    }
  }

  // -----------------------------------------------------------------------
  // 7. ROBUST CROSS-LINKING OF SUB-DBS AND DISTRIBUTION BOARDS
  // -----------------------------------------------------------------------
  // Use parsed entities strictly to restore exact project state without appending old fallback records
  const effectiveSubDbs = parsedSubDbs.length > 0 ? parsedSubDbs : (parsedDbsMap.size === 0 ? fallbackProject.subDbs : []);
  const effectiveDbs = parsedDbsMap.size > 0 ? Array.from(parsedDbsMap.values()) : (parsedSubDbs.length === 0 ? fallbackProject.dbs : []);

  // Build bi-directional lookup maps for Sub-DBs and MSBs
  const subDbResolver = new Map<string, string>();
  effectiveSubDbs.forEach((sb) => {
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
  msbResolver.set('MAIN', primaryMsb.id);

  // Normalize Sub-DB msbId references across all MSB tabs
  effectiveSubDbs.forEach((sb) => {
    const rawMsbRef = (sb.msbId || '').trim();
    if (msbResolver.has(rawMsbRef)) {
      sb.msbId = msbResolver.get(rawMsbRef)!;
    } else if (msbResolver.has(rawMsbRef.toUpperCase())) {
      sb.msbId = msbResolver.get(rawMsbRef.toUpperCase())!;
    } else {
      sb.msbId = primaryMsb.id;
    }
  });

  // Normalize Final DB subDbId references with bi-directional reconciliation:
  // - If supplied by Sub-DB, assign to that Sub-DB
  // - If supplied directly by MSB, assign to that MSB
  effectiveDbs.forEach((db) => {
    const rawRef = (db.subDbId || '').trim();
    const rawRefUpper = rawRef.toUpperCase();
    let resolvedId: string | null = null;

    if (subDbResolver.has(rawRef)) {
      resolvedId = subDbResolver.get(rawRef)!;
    } else if (subDbResolver.has(rawRefUpper)) {
      resolvedId = subDbResolver.get(rawRefUpper)!;
    } else if (msbResolver.has(rawRef)) {
      resolvedId = msbResolver.get(rawRef)!;
    } else if (msbResolver.has(rawRefUpper)) {
      resolvedId = msbResolver.get(rawRefUpper)!;
    } else {
      // Check if any Sub-DB already claimed this DB in its connectedDbIds
      for (const sb of effectiveSubDbs) {
        if (
          sb.connectedDbIds &&
          sb.connectedDbIds.some(
            (cId) =>
              cId.trim().toUpperCase() === db.id.toUpperCase() ||
              cId.trim().toUpperCase() === db.code.trim().toUpperCase()
          )
        ) {
          resolvedId = sb.id;
          break;
        }
      }
    }

    db.subDbId = resolvedId || effectiveSubDbs[0]?.id || primaryMsb.id;
  });

  // Re-establish Sub-DB connectedDbIds
  effectiveSubDbs.forEach((sb) => {
    sb.connectedDbIds = effectiveDbs
      .filter((d) => d.subDbId === sb.id || d.subDbId === sb.code)
      .map((d) => d.id);
  });

  // -----------------------------------------------------------------------
  // 8. MASTER ELECTRICAL RECALCULATION
  // -----------------------------------------------------------------------
  const activeMsbList = parsedMsbs.length > 0 ? parsedMsbs : [primaryMsb];
  const calculated = recalculateAll(
    effectiveDbs,
    effectiveSubDbs,
    primaryMsb,
    parsedDirectLoads,
    voltage,
    restoredCableSchedule,
    activeMsbList,
    restoredCableDefinitions
  );

  const activeMsb = calculated.msbs?.find((m) => m.id === primaryMsb.id) || calculated.msbs?.[0] || calculated.msb;

  const finalProject: ElectricalProject = {
    id: `proj-${Date.now()}`,
    name: projName,
    description: projDesc,
    engineer: projEng,
    client: projClient,
    dateCreated: new Date().toISOString().split('T')[0],
    lastModified: new Date().toISOString(),
    voltageSystem: voltage,
    cableSchedule: restoredCableSchedule,
    cableDefinitions: restoredCableDefinitions,
    circuitPresets: restoredCircuitPresets,
    msb: activeMsb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
  };

  const summary = `Successfully imported "${projName}": ${calculated.msbs.length} MSB${calculated.msbs.length === 1 ? '' : 's'}, ${calculated.subDbs.length} Sub-DBs, ${calculated.dbs.length} Final DBs, ${totalCircuits} branch circuits, ${restoredCableDefinitions.length} Cable Specs, and ${restoredCableSchedule.length} Breaker Rules completely restored.`;

  return { project: finalProject, summary };
}
