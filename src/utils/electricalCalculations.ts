/**
 * Electrical Engineering Calculations & Automatic Sizing Utilities
 * Compliant with IEC 60364, BS 7671, and standard electrical engineering codes.
 */

import {
  Circuit,
  CircuitCategory,
  DistributionBoard,
  SubDistributionBoard,
  MsbDirectLoad,
  MainSwitchBoard,
  VoltageSystem,
  BreakerSizingResult,
  DBPhaseBalance,
  PhaseLoadSummary,
  TransformerSizingResult,
  GeneratorSizingResult,
  GeneratorSizingScope,
  CapacitorBankResult,
  CapacitorBankStep,
  PhaseType,
  CableScheduleEntry,
  CableDefinitionEntry,
  CableCategoryType,
  VoltageDropResult,
  CircuitPreset,
  BusbarMaterial,
  BusbarStandardSize,
  BusbarSizingResult,
} from '../types/electrical';

// Standard Busbar reference sizes (Width x Thickness in mm and cross-sectional area mm2)
export const STANDARD_BUSBAR_SIZES: BusbarStandardSize[] = [
  { width: 20, thickness: 3, area: 60 },
  { width: 25, thickness: 3, area: 75 },
  { width: 30, thickness: 3, area: 90 },
  { width: 25, thickness: 5, area: 125 },
  { width: 30, thickness: 5, area: 150 },
  { width: 40, thickness: 5, area: 200 },
  { width: 50, thickness: 5, area: 250 },
  { width: 30, thickness: 6, area: 180 },
  { width: 40, thickness: 6, area: 240 },
  { width: 50, thickness: 6, area: 300 },
  { width: 100, thickness: 5, area: 500 },
  { width: 100, thickness: 6, area: 600 },
  { width: 100, thickness: 10, area: 1000 },
];

export interface BusbarCalculationInput {
  material?: BusbarMaterial;
  currentDensityJ?: number;
  designCurrentId?: number;
  breakerRating?: number;
  totalPlantCurrentAmps?: number;
  shortCircuitCurrentIcwKA?: number;
  faultDurationSec?: number;
  materialConstantK?: number;
  selectedWidth?: number;
  selectedThickness?: number;
  selectedRuns?: number;
  manualOverride?: boolean;
}

/**
 * Automatically selects the standard busbar size and parallel runs per phase
 * Minimizes unnecessary oversizing while following practical electrical engineering guidelines:
 * - Uses parallel bars for higher currents / areas to enhance heat dissipation and mitigate skin effect at 50/60 Hz
 */
export function autoSelectBusbar(designArea: number): {
  width: number;
  thickness: number;
  runs: number;
  area: number;
  totalArea: number;
} {
  const runsOptions = [1, 2, 3, 4];
  interface Candidate {
    width: number;
    thickness: number;
    runs: number;
    area: number;
    totalArea: number;
    score: number;
  }

  const validCandidates: Candidate[] = [];

  for (const runs of runsOptions) {
    for (const size of STANDARD_BUSBAR_SIZES) {
      const totalArea = runs * size.area;
      if (totalArea >= designArea) {
        const areaOverage = totalArea - designArea;
        let preferencePenalty = 0;

        // Engineering preference heuristic:
        if (designArea <= 300) {
          // For small areas, 1 bar is preferred
          preferencePenalty = (runs - 1) * 300;
        } else if (designArea <= 600) {
          // 1 or 2 bars
          preferencePenalty = runs === 1 ? 0 : runs === 2 ? 40 : (runs - 2) * 400;
        } else if (designArea <= 1200) {
          // 2 bars strongly preferred (e.g. 2 x 100 x 6mm = 1200 mm2 for 1600A breaker)
          preferencePenalty = runs === 2 ? 0 : runs === 1 ? 250 : runs === 3 ? 150 : 500;
        } else if (designArea <= 2000) {
          // 2 or 3 bars preferred
          preferencePenalty = runs === 2 ? 0 : runs === 3 ? 50 : runs === 4 ? 200 : 800;
        } else {
          // > 2000 mm2: 3 or 4 bars
          preferencePenalty = runs === 3 ? 0 : runs === 4 ? 30 : 500;
        }

        const score = areaOverage + preferencePenalty;
        validCandidates.push({
          width: size.width,
          thickness: size.thickness,
          runs,
          area: size.area,
          totalArea,
          score,
        });
      }
    }
  }

  if (validCandidates.length > 0) {
    validCandidates.sort((a, b) => a.score - b.score);
    return validCandidates[0];
  }

  // Fallback for very high demand installations: 4 runs of 100x10mm
  return {
    width: 100,
    thickness: 10,
    runs: 4,
    area: 1000,
    totalArea: 4000,
  };
}

/**
 * Busbar Sizing and Thermal Withstand Calculations (IEC 61439-1/2, BS EN 61439, IEC 60865)
 * Step 1: Continuous Ampacity: Areq = Id / J
 * Step 2: Thermal Short-Circuit Withstand: Amin >= (Icw * sqrt(t)) / k
 * Step 3: Sizing Selection: Adesign = max(Areq, Amin)
 */
export function calculateBusbarSizing(input: BusbarCalculationInput): BusbarSizingResult {
  const material: BusbarMaterial = input.material || 'COPPER';

  // Target Current Density J: Copper = 1.4 A/mm2, Aluminium = 0.7 A/mm2 (default)
  const defaultJ = material === 'ALUMINIUM' ? 0.7 : 1.4;
  const currentDensityJ =
    input.currentDensityJ !== undefined && input.currentDensityJ > 0
      ? input.currentDensityJ
      : defaultJ;

  // Material thermal constant k: Copper = 143, Aluminium = 110 (default)
  const defaultK = material === 'ALUMINIUM' ? 110 : 143;
  const materialConstantK =
    input.materialConstantK !== undefined && input.materialConstantK > 0
      ? input.materialConstantK
      : defaultK;

  // Design Current Id: Breaker Ampere Rating (default) or total plant current
  const fallbackId =
    input.breakerRating && input.breakerRating > 0
      ? input.breakerRating
      : input.totalPlantCurrentAmps && input.totalPlantCurrentAmps > 0
      ? Math.ceil(input.totalPlantCurrentAmps)
      : 100;

  const designCurrentId =
    input.designCurrentId !== undefined && input.designCurrentId > 0
      ? input.designCurrentId
      : fallbackId;

  // Step 1: Initial Required Area for Continuous Ampacity (mm2): Areq = Id / J
  const initialRequiredAreaAreq = designCurrentId / currentDensityJ;

  // Short-Circuit Parameters
  const shortCircuitCurrentIcwKA =
    input.shortCircuitCurrentIcwKA !== undefined && input.shortCircuitCurrentIcwKA > 0
      ? input.shortCircuitCurrentIcwKA
      : 65; // 65 kA default
  const faultDurationSec =
    input.faultDurationSec !== undefined && input.faultDurationSec > 0
      ? input.faultDurationSec
      : 1.0; // 1.0 s default

  // Step 2: Check Short-Circuit Thermal Withstand Area Amin (mm2): Amin >= (Icw * sqrt(t)) / k
  const IcwAmps = shortCircuitCurrentIcwKA * 1000;
  const minimumWithstandAreaAmin = (IcwAmps * Math.sqrt(faultDurationSec)) / materialConstantK;

  // Step 3: Sizing Selection Rule: select the higher between Areq and Amin
  const governingRequiredArea = Math.max(initialRequiredAreaAreq, minimumWithstandAreaAmin);
  const governingCriterion: 'CONTINUOUS_AMPACITY' | 'SHORT_CIRCUIT_WITHSTAND' =
    initialRequiredAreaAreq >= minimumWithstandAreaAmin
      ? 'CONTINUOUS_AMPACITY'
      : 'SHORT_CIRCUIT_WITHSTAND';

  // Sizing Selection & Reference Table Matching
  let width = input.selectedWidth;
  let thickness = input.selectedThickness;
  let runsPerPhase = input.selectedRuns || 1;
  const isCustomManualSelection = !!input.manualOverride && width !== undefined && thickness !== undefined;

  if (!isCustomManualSelection) {
    const optimal = autoSelectBusbar(governingRequiredArea);
    width = optimal.width;
    thickness = optimal.thickness;
    runsPerPhase = optimal.runs;
  }

  if (!width || !thickness) {
    width = 100;
    thickness = 6;
    runsPerPhase = 2;
  }

  const barArea = width * thickness;
  const totalArea = runsPerPhase * barArea;
  const continuousCurrentCapacity = totalArea * currentDensityJ;
  const thermalWithstandCapacityKA = (totalArea * materialConstantK) / (Math.sqrt(faultDurationSec) * 1000);

  // Formatted Description e.g. "1200 mm2 (2 x 100 x 6mm)"
  const formattedDescription = `${Math.round(totalArea)} mm2 (${runsPerPhase} x ${width} x ${thickness}mm)`;

  return {
    material,
    currentDensityJ,
    designCurrentId,
    initialRequiredAreaAreq,
    shortCircuitCurrentIcwKA,
    faultDurationSec,
    materialConstantK,
    minimumWithstandAreaAmin,
    governingRequiredArea,
    governingCriterion,
    width,
    thickness,
    barArea,
    runsPerPhase,
    totalArea,
    continuousCurrentCapacity,
    thermalWithstandCapacityKA,
    formattedDescription,
    isCustomManualSelection,
  };
}

// Standard MCB (Miniature Circuit Breaker) ratings in Amperes (IEC 60898)
export const STANDARD_MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

// Standard MCCB (Molded Case Circuit Breaker) ratings in Amperes (IEC 60947-2)
export const STANDARD_MCCB_RATINGS = [
  16, 20, 25, 32, 40, 50, 63, 75, 80, 100, 125, 150, 160, 200, 250, 300, 315, 350, 400, 500, 600, 630, 800, 1000, 1250,
];

// Standard ACB (Air Circuit Breaker) ratings in Amperes
export const STANDARD_ACB_RATINGS = [
  630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000,
];

// Standard Distribution Transformer kVA ratings (IEC 60076)
export const STANDARD_TRANSFORMER_KVA = [
  100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000,
];

// Standard Diesel Generator kVA ratings
export const STANDARD_GENERATOR_KVA = [
  50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 650, 800, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500,
];

// Standard Power Factor Correction Capacitor Bank sizes (kVAr)
export const STANDARD_CAPACITOR_KVAR = [
  25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000,
];

// Standard Copper Cable current-carrying capacities (Reference Method E / Perforated Tray / Conduit)
interface CableCapacity {
  maxAmps: number;
  sizeString: string;
}

const SINGLE_PHASE_CABLE_TABLE: CableCapacity[] = [
  { maxAmps: 14, sizeString: '2x1C 1.5mm² Cu/PVC +E' },
  { maxAmps: 20, sizeString: '2x1C 2.5mm² Cu/PVC +E' },
  { maxAmps: 26, sizeString: '2x1C 4.0mm² Cu/PVC +E' },
  { maxAmps: 36, sizeString: '2x1C 6.0mm² Cu/PVC +E' },
  { maxAmps: 50, sizeString: '2x1C 10.0mm² Cu/PVC +E' },
  { maxAmps: 68, sizeString: '2x1C 16.0mm² Cu/PVC +E' },
  { maxAmps: 89, sizeString: '2x1C 25.0mm² Cu/PVC +E' },
  { maxAmps: 110, sizeString: '2x1C 35.0mm² Cu/PVC +E' },
  { maxAmps: 175, sizeString: '2x1C 50.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 222, sizeString: '2x1C 70.0mm² Cu/XLPE/PVC +E' },
];

const THREE_PHASE_CABLE_TABLE: CableCapacity[] = [
  { maxAmps: 14, sizeString: '4x1C 1.5mm² Cu/PVC +E' },
  { maxAmps: 20, sizeString: '4x1C 2.5mm² Cu/PVC +E' },
  { maxAmps: 26, sizeString: '4x1C 4.0mm² Cu/PVC +E' },
  { maxAmps: 36, sizeString: '4x1C 6.0mm² Cu/PVC +E' },
  { maxAmps: 50, sizeString: '4x1C 10.0mm² Cu/PVC +E' },
  { maxAmps: 68, sizeString: '4x1C 16.0mm² Cu/PVC +E' },
  { maxAmps: 89, sizeString: '4x1C 25.0mm² Cu/PVC +E' },
  { maxAmps: 110, sizeString: '4x1C 35.0mm² Cu/PVC +E' },
  { maxAmps: 175, sizeString: '4x1C 50.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 222, sizeString: '4x1C 70.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 269, sizeString: '4x1C 95.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 383, sizeString: '4x1C 120.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 444, sizeString: '4x1C 150.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 510, sizeString: '4x1C 185.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 607, sizeString: '4x1C 240.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 703, sizeString: '4x1C 300.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 823, sizeString: '4x1C 400.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 946, sizeString: '4x1C 500.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 1088, sizeString: '4x1C 630.0mm² Cu/XLPE/PVC +E' },
  { maxAmps: 1124, sizeString: '2x (4x1C 300.0mm² Cu/XLPE +E)' },
  { maxAmps: 1316, sizeString: '2x (4x1C 400.0mm² Cu/XLPE +E)' },
  { maxAmps: 1513, sizeString: '2x (4x1C 500.0mm² Cu/XLPE +E)' },
  { maxAmps: 1740, sizeString: '2x (4x1C 630.0mm² Cu/XLPE +E)' },
  { maxAmps: 2000, sizeString: 'Copper Busduct 2000A' },
  { maxAmps: 2500, sizeString: 'Copper Busduct 2500A' },
];

/**
 * Standard baseline Cable Schedule definitions with voltage drop factors (mV/A/m)
 * per IEC 60364-5-52, BS 7671 Table 4D4B / 4E4B, and MS 1933.
 * Subdivided into:
 * 1. 1-Phase cable (10 standard ratings)
 * 2. 3-Phase cable (23 standard ratings)
 * 3. Busduct (7 standard ratings)
 */
export const DEFAULT_CABLE_DEFINITIONS: CableDefinitionEntry[] = [
  // 1-Phase Cables (230V / 240V L-N)
  { id: 'cdef-1p-1.5', category: '1P', cableSize: '2x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-1p-2.5', category: '1P', cableSize: '2x1C 2.5mm² Cu/PVC +E', maxAmps: 20, mvPerAmpMeter: 18.0, cpcSize: '2.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-1p-4.0', category: '1P', cableSize: '2x1C 4.0mm² Cu/PVC +E', maxAmps: 26, mvPerAmpMeter: 11.0, cpcSize: '4.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-1p-6.0', category: '1P', cableSize: '2x1C 6.0mm² Cu/PVC +E', maxAmps: 36, mvPerAmpMeter: 6.4, cpcSize: '6.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-1p-10.0', category: '1P', cableSize: '2x1C 10.0mm² Cu/PVC +E', maxAmps: 50, mvPerAmpMeter: 3.8, cpcSize: '10.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-1p-16.0', category: '1P', cableSize: '2x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Tray / Trunking' },
  { id: 'cdef-1p-25.0', category: '1P', cableSize: '2x1C 25.0mm² Cu/PVC +E', maxAmps: 89, mvPerAmpMeter: 1.55, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-1p-35.0', category: '1P', cableSize: '2x1C 35.0mm² Cu/PVC +E', maxAmps: 110, mvPerAmpMeter: 1.1, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-1p-50.0', category: '1P', cableSize: '2x1C 50.0mm² Cu/XLPE/PVC +E', maxAmps: 175, mvPerAmpMeter: 0.9, cpcSize: '25.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-1p-70.0', category: '1P', cableSize: '2x1C 70.0mm² Cu/XLPE/PVC +E', maxAmps: 222, mvPerAmpMeter: 0.65, cpcSize: '35.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },

  // 3-Phase Cables (400V / 415V L-L)
  { id: 'cdef-3p-1.5', category: '3P', cableSize: '4x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-3p-2.5', category: '3P', cableSize: '4x1C 2.5mm² Cu/PVC +E', maxAmps: 20, mvPerAmpMeter: 18.0, cpcSize: '2.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-3p-4.0', category: '3P', cableSize: '4x1C 4.0mm² Cu/PVC +E', maxAmps: 26, mvPerAmpMeter: 11.0, cpcSize: '4.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-3p-6.0', category: '3P', cableSize: '4x1C 6.0mm² Cu/PVC +E', maxAmps: 36, mvPerAmpMeter: 6.4, cpcSize: '6.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cdef-3p-10.0', category: '3P', cableSize: '4x1C 10.0mm² Cu/PVC +E', maxAmps: 50, mvPerAmpMeter: 3.8, cpcSize: '10.0mm² Cu', installationMethod: 'Perforated Cable Tray' },
  { id: 'cdef-3p-16.0', category: '3P', cableSize: '4x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-25.0', category: '3P', cableSize: '4x1C 25.0mm² Cu/PVC +E', maxAmps: 89, mvPerAmpMeter: 1.55, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-35.0', category: '3P', cableSize: '4x1C 35.0mm² Cu/PVC +E', maxAmps: 110, mvPerAmpMeter: 1.1, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-50.0', category: '3P', cableSize: '4x1C 50.0mm² Cu/XLPE/PVC +E', maxAmps: 175, mvPerAmpMeter: 0.9, cpcSize: '25.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-70.0', category: '3P', cableSize: '4x1C 70.0mm² Cu/XLPE/PVC +E', maxAmps: 222, mvPerAmpMeter: 0.65, cpcSize: '35.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-95.0', category: '3P', cableSize: '4x1C 95.0mm² Cu/XLPE/PVC +E', maxAmps: 269, mvPerAmpMeter: 0.5, cpcSize: '50.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-120.0', category: '3P', cableSize: '4x1C 120.0mm² Cu/XLPE/PVC +E', maxAmps: 383, mvPerAmpMeter: 0.37, cpcSize: '70.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-150.0', category: '3P', cableSize: '4x1C 150.0mm² Cu/XLPE/PVC +E', maxAmps: 444, mvPerAmpMeter: 0.31, cpcSize: '70.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-185.0', category: '3P', cableSize: '4x1C 185.0mm² Cu/XLPE/PVC +E', maxAmps: 510, mvPerAmpMeter: 0.26, cpcSize: '95.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-240.0', category: '3P', cableSize: '4x1C 240.0mm² Cu/XLPE/PVC +E', maxAmps: 607, mvPerAmpMeter: 0.22, cpcSize: '120.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-300.0', category: '3P', cableSize: '4x1C 300.0mm² Cu/XLPE/PVC +E', maxAmps: 703, mvPerAmpMeter: 0.195, cpcSize: '150.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-400.0', category: '3P', cableSize: '4x1C 400.0mm² Cu/XLPE/PVC +E', maxAmps: 823, mvPerAmpMeter: 0.175, cpcSize: '185.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-500.0', category: '3P', cableSize: '4x1C 500.0mm² Cu/XLPE/PVC +E', maxAmps: 946, mvPerAmpMeter: 0.16, cpcSize: '240.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-630.0', category: '3P', cableSize: '4x1C 630.0mm² Cu/XLPE/PVC +E', maxAmps: 1088, mvPerAmpMeter: 0.15, cpcSize: '300.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-2x300', category: '3P', cableSize: '2x (4x1C 300.0mm² Cu/XLPE +E)', maxAmps: 1124, mvPerAmpMeter: 0.097, cpcSize: '2x 150.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-2x400', category: '3P', cableSize: '2x (4x1C 400.0mm² Cu/XLPE +E)', maxAmps: 1316, mvPerAmpMeter: 0.087, cpcSize: '2x 185.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-2x500', category: '3P', cableSize: '2x (4x1C 500.0mm² Cu/XLPE +E)', maxAmps: 1513, mvPerAmpMeter: 0.08, cpcSize: '2x 240.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cdef-3p-2x630', category: '3P', cableSize: '2x (4x1C 630.0mm² Cu/XLPE +E)', maxAmps: 1740, mvPerAmpMeter: 0.075, cpcSize: '2x 300.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },

  // Busduct (Sandwich Busway Systems)
  { id: 'cdef-bus-630', category: 'BUSDUCT', cableSize: 'Copper Busduct 630A', maxAmps: 630, mvPerAmpMeter: 0.226, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-800', category: 'BUSDUCT', cableSize: 'Copper Busduct 800A', maxAmps: 800, mvPerAmpMeter: 0.135, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-1000', category: 'BUSDUCT', cableSize: 'Copper Busduct 1000A', maxAmps: 1000, mvPerAmpMeter: 0.123, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-1250', category: 'BUSDUCT', cableSize: 'Copper Busduct 1250A', maxAmps: 1250, mvPerAmpMeter: 0.098, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-1600', category: 'BUSDUCT', cableSize: 'Copper Busduct 1600A', maxAmps: 1600, mvPerAmpMeter: 0.076, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-2000', category: 'BUSDUCT', cableSize: 'Copper Busduct 2000A', maxAmps: 2000, mvPerAmpMeter: 0.05, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-2500', category: 'BUSDUCT', cableSize: 'Copper Busduct 2500A', maxAmps: 2500, mvPerAmpMeter: 0.035, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-3200', category: 'BUSDUCT', cableSize: 'Copper Busduct 3200A', maxAmps: 3200, mvPerAmpMeter: 0.02, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-4000', category: 'BUSDUCT', cableSize: 'Copper Busduct 4000A', maxAmps: 4000, mvPerAmpMeter: 0.016, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cdef-bus-5000', category: 'BUSDUCT', cableSize: 'Copper Busduct 5000A', maxAmps: 5000, mvPerAmpMeter: 0.012, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
];

/**
 * Standard baseline Breaker Schedule mapping Protective Devices (MCB/MCCB/ACB)
 * to corresponding Cable Sizes (IEC 60364 / BS 7671 / MS 1933)
 */
export const DEFAULT_CABLE_SCHEDULE: CableScheduleEntry[] = [
  // 1-Phase (230V / 240V L-N) Standard Baseline Pairings (12 entries)
  { id: 'cs-1p-6', phaseSystem: '1P', breakerRating: 6, breakerType: 'MCB', poles: 1, cableSize: '2x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-10', phaseSystem: '1P', breakerRating: 10, breakerType: 'MCB', poles: 1, cableSize: '2x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-16', phaseSystem: '1P', breakerRating: 16, breakerType: 'MCB', poles: 1, cableSize: '2x1C 2.5mm² Cu/PVC +E', maxAmps: 20, mvPerAmpMeter: 18.0, cpcSize: '2.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-20', phaseSystem: '1P', breakerRating: 20, breakerType: 'MCB', poles: 1, cableSize: '2x1C 4.0mm² Cu/PVC +E', maxAmps: 26, mvPerAmpMeter: 11.0, cpcSize: '4.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-25', phaseSystem: '1P', breakerRating: 25, breakerType: 'MCB', poles: 1, cableSize: '2x1C 6.0mm² Cu/PVC +E', maxAmps: 36, mvPerAmpMeter: 6.4, cpcSize: '6.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-32', phaseSystem: '1P', breakerRating: 32, breakerType: 'MCB', poles: 1, cableSize: '2x1C 10.0mm² Cu/PVC +E', maxAmps: 50, mvPerAmpMeter: 3.8, cpcSize: '10.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-1p-40', phaseSystem: '1P', breakerRating: 40, breakerType: 'MCB', poles: 1, cableSize: '2x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Tray / Trunking' },
  { id: 'cs-1p-50', phaseSystem: '1P', breakerRating: 50, breakerType: 'MCB', poles: 1, cableSize: '2x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Tray / Trunking' },
  { id: 'cs-1p-63', phaseSystem: '1P', breakerRating: 63, breakerType: 'MCB', poles: 1, cableSize: '2x1C 25.0mm² Cu/PVC +E', maxAmps: 89, mvPerAmpMeter: 1.55, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-1p-80', phaseSystem: '1P', breakerRating: 80, breakerType: 'MCB', poles: 1, cableSize: '2x1C 35.0mm² Cu/PVC +E', maxAmps: 110, mvPerAmpMeter: 1.1, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-1p-100', phaseSystem: '1P', breakerRating: 100, breakerType: 'MCB', poles: 1, cableSize: '2x1C 50.0mm² Cu/XLPE/PVC +E', maxAmps: 175, mvPerAmpMeter: 0.9, cpcSize: '25.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-1p-125', phaseSystem: '1P', breakerRating: 125, breakerType: 'MCCB', poles: 1, cableSize: '2x1C 70.0mm² Cu/XLPE/PVC +E', maxAmps: 222, mvPerAmpMeter: 0.65, cpcSize: '35.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },

  // 3-Phase (400V / 415V L-L) Standard Baseline Pairings (24 entries)
  { id: 'cs-3p-6', phaseSystem: '3P', breakerRating: 6, breakerType: 'MCB', poles: 3, cableSize: '4x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-3p-10', phaseSystem: '3P', breakerRating: 10, breakerType: 'MCB', poles: 3, cableSize: '4x1C 1.5mm² Cu/PVC +E', maxAmps: 14, mvPerAmpMeter: 29.0, cpcSize: '1.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-3p-16', phaseSystem: '3P', breakerRating: 16, breakerType: 'MCB', poles: 3, cableSize: '4x1C 2.5mm² Cu/PVC +E', maxAmps: 20, mvPerAmpMeter: 18.0, cpcSize: '2.5mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-3p-20', phaseSystem: '3P', breakerRating: 20, breakerType: 'MCB', poles: 3, cableSize: '4x1C 4.0mm² Cu/PVC +E', maxAmps: 26, mvPerAmpMeter: 11.0, cpcSize: '4.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-3p-25', phaseSystem: '3P', breakerRating: 25, breakerType: 'MCB', poles: 3, cableSize: '4x1C 6.0mm² Cu/PVC +E', maxAmps: 36, mvPerAmpMeter: 6.4, cpcSize: '6.0mm² Cu', installationMethod: 'Conduit / Trunking' },
  { id: 'cs-3p-32', phaseSystem: '3P', breakerRating: 32, breakerType: 'MCB', poles: 3, cableSize: '4x1C 10.0mm² Cu/PVC +E', maxAmps: 50, mvPerAmpMeter: 3.8, cpcSize: '10.0mm² Cu', installationMethod: 'Perforated Cable Tray' },
  { id: 'cs-3p-40', phaseSystem: '3P', breakerRating: 40, breakerType: 'MCB', poles: 3, cableSize: '4x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-50', phaseSystem: '3P', breakerRating: 50, breakerType: 'MCB', poles: 3, cableSize: '4x1C 16.0mm² Cu/PVC +E', maxAmps: 68, mvPerAmpMeter: 2.4, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-63', phaseSystem: '3P', breakerRating: 63, breakerType: 'MCB', poles: 3, cableSize: '4x1C 25.0mm² Cu/PVC +E', maxAmps: 89, mvPerAmpMeter: 1.55, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-75', phaseSystem: '3P', breakerRating: 75, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 35.0mm² Cu/PVC +E', maxAmps: 110, mvPerAmpMeter: 1.1, cpcSize: '16.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-100', phaseSystem: '3P', breakerRating: 100, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 50.0mm² Cu/XLPE/PVC +E', maxAmps: 175, mvPerAmpMeter: 0.9, cpcSize: '25.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-125', phaseSystem: '3P', breakerRating: 125, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 70.0mm² Cu/XLPE/PVC +E', maxAmps: 222, mvPerAmpMeter: 0.65, cpcSize: '35.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-150', phaseSystem: '3P', breakerRating: 150, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 95.0mm² Cu/XLPE/PVC +E', maxAmps: 269, mvPerAmpMeter: 0.5, cpcSize: '50.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-160', phaseSystem: '3P', breakerRating: 160, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 95.0mm² Cu/XLPE/PVC +E', maxAmps: 269, mvPerAmpMeter: 0.5, cpcSize: '50.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-200', phaseSystem: '3P', breakerRating: 200, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 120.0mm² Cu/XLPE/PVC +E', maxAmps: 383, mvPerAmpMeter: 0.37, cpcSize: '70.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-250', phaseSystem: '3P', breakerRating: 250, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 150.0mm² Cu/XLPE/PVC +E', maxAmps: 444, mvPerAmpMeter: 0.31, cpcSize: '70.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-300', phaseSystem: '3P', breakerRating: 300, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 185.0mm² Cu/XLPE/PVC +E', maxAmps: 510, mvPerAmpMeter: 0.26, cpcSize: '95.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-350', phaseSystem: '3P', breakerRating: 350, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 185.0mm² Cu/XLPE/PVC +E', maxAmps: 510, mvPerAmpMeter: 0.26, cpcSize: '95.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-400', phaseSystem: '3P', breakerRating: 400, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 240.0mm² Cu/XLPE/PVC +E', maxAmps: 607, mvPerAmpMeter: 0.22, cpcSize: '120.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-500', phaseSystem: '3P', breakerRating: 500, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 300.0mm² Cu/XLPE/PVC +E', maxAmps: 703, mvPerAmpMeter: 0.195, cpcSize: '150.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-600', phaseSystem: '3P', breakerRating: 600, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 400.0mm² Cu/XLPE/PVC +E', maxAmps: 823, mvPerAmpMeter: 0.175, cpcSize: '185.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-630', phaseSystem: '3P', breakerRating: 630, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 400.0mm² Cu/XLPE/PVC +E', maxAmps: 823, mvPerAmpMeter: 0.175, cpcSize: '185.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-800', phaseSystem: '3P', breakerRating: 800, breakerType: 'MCCB', poles: 3, cableSize: '4x1C 630.0mm² Cu/XLPE/PVC +E', maxAmps: 1088, mvPerAmpMeter: 0.15, cpcSize: '300.0mm² Cu', installationMethod: 'Perforated Cable Tray Method E' },
  { id: 'cs-3p-1000', phaseSystem: '3P', breakerRating: 1000, breakerType: 'MCCB', poles: 3, cableSize: 'Copper Busduct 1250A', maxAmps: 1250, mvPerAmpMeter: 0.098, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-1250', phaseSystem: '3P', breakerRating: 1250, breakerType: 'MCCB', poles: 3, cableSize: 'Copper Busduct 1600A', maxAmps: 1600, mvPerAmpMeter: 0.076, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-1600', phaseSystem: '3P', breakerRating: 1600, breakerType: 'ACB', poles: 3, cableSize: 'Copper Busduct 2000A', maxAmps: 2000, mvPerAmpMeter: 0.05, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-2000', phaseSystem: '3P', breakerRating: 2000, breakerType: 'ACB', poles: 3, cableSize: 'Copper Busduct 2500A', maxAmps: 2500, mvPerAmpMeter: 0.035, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-2500', phaseSystem: '3P', breakerRating: 2500, breakerType: 'ACB', poles: 3, cableSize: 'Copper Busduct 3200A', maxAmps: 3200, mvPerAmpMeter: 0.02, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-3200', phaseSystem: '3P', breakerRating: 3200, breakerType: 'ACB', poles: 3, cableSize: 'Copper Busduct 4000A', maxAmps: 4000, mvPerAmpMeter: 0.016, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
  { id: 'cs-3p-4000', phaseSystem: '3P', breakerRating: 4000, breakerType: 'ACB', poles: 3, cableSize: 'Copper Busduct 5000A', maxAmps: 5000, mvPerAmpMeter: 0.012, cpcSize: 'Integral Copper Ground Bus', installationMethod: 'Sandwich Busway' },
];

/**
 * Standard Voltage Presets
 */
export const VOLTAGE_PRESETS: VoltageSystem[] = [
  {
    id: 'iec-400-230',
    label: '400V / 230V 50Hz (IEC Standard)',
    standard: 'IEC',
    Vll: 400,
    Vln: 230,
    frequency: 50,
  },
  {
    id: 'bs-415-240',
    label: '415V / 240V 50Hz (BS 7671 / Commonwealth)',
    standard: 'BS',
    Vll: 415,
    Vln: 240,
    frequency: 50,
  },
  {
    id: 'nec-480-277',
    label: '480V / 277V 60Hz (NEC Commercial)',
    standard: 'NEC',
    Vll: 480,
    Vln: 277,
    frequency: 60,
  },
  {
    id: 'nec-208-120',
    label: '208V / 120V 60Hz (NEC Light Commercial)',
    standard: 'NEC',
    Vll: 208,
    Vln: 120,
    frequency: 60,
  },
];

/**
 * Default Diversity Factors and Power Factors by Circuit Category
 */
export const CATEGORY_DEFAULTS: Record<
  CircuitCategory,
  {
    label: string;
    defaultDiversity: number;
    defaultPowerFactor: number;
    recommendedCurve: 'B' | 'C' | 'D';
    typicalPoles: 1 | 3;
    description: string;
  }
> = {
  LIGHTING: {
    label: 'Lighting Circuits',
    defaultDiversity: 0.85,
    defaultPowerFactor: 0.95,
    recommendedCurve: 'B',
    typicalPoles: 1,
    description: 'LED fixtures, troffers, architectural downlights. IEC standard 80-90% diversity.',
  },
  RECEPTACLE: {
    label: 'Small Power / Receptacles',
    defaultDiversity: 0.40,
    defaultPowerFactor: 0.85,
    recommendedCurve: 'C',
    typicalPoles: 1,
    description: '13A/15A/20A socket outlets. Coincidence factor typically 30-50% for workstations.',
  },
  HVAC: {
    label: 'HVAC & Mechanical',
    defaultDiversity: 0.80,
    defaultPowerFactor: 0.82,
    recommendedCurve: 'C',
    typicalPoles: 3,
    description: 'Split ACs, VRV/VRF fan coils, ventilation fans, fresh air blowers.',
  },
  POWER_APPLIANCE: {
    label: 'Appliances & Cooking',
    defaultDiversity: 0.60,
    defaultPowerFactor: 0.95,
    recommendedCurve: 'C',
    typicalPoles: 1,
    description: 'Water heaters, pantries, ovens, microwaves, boiling water dispensers.',
  },
  MOTOR_PUMP: {
    label: 'Motors & Pumps',
    defaultDiversity: 0.80,
    defaultPowerFactor: 0.80,
    recommendedCurve: 'D',
    typicalPoles: 3,
    description: 'Water booster pumps, drainage sump pumps, mechanical extract fans with high inrush.',
  },
  IT_CRITICAL: {
    label: 'IT & Critical Racks',
    defaultDiversity: 1.00,
    defaultPowerFactor: 0.95,
    recommendedCurve: 'C',
    typicalPoles: 1,
    description: 'Server rack PDUs, UPS feeds, network switches. No diversity allowance (100% duty).',
  },
  SPARE: {
    label: 'Spare / Provision',
    defaultDiversity: 0.20,
    defaultPowerFactor: 0.85,
    recommendedCurve: 'C',
    typicalPoles: 1,
    description: 'Future expansion reserve, allowance for additional loads.',
  },
  CUSTOM: {
    label: 'Custom Load',
    defaultDiversity: 0.80,
    defaultPowerFactor: 0.85,
    recommendedCurve: 'C',
    typicalPoles: 1,
    description: 'User-defined bespoke electrical equipment.',
  },
};

/**
 * Standard baseline Circuit Preset Groups (Type A, Type B, etc.)
 * Provides default pre-configured quantities, load wattages, PF, and DF
 */
export const DEFAULT_CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'preset-type-a',
    name: 'Type A',
    quantity: 1,
    unitWatts: 3500,
    powerFactor: 0.85,
    diversityFactor: 0.87,
    category: 'CUSTOM',
    description: 'Type A standard load group (3.50 kW)',
  },
  {
    id: 'preset-type-b',
    name: 'Type B',
    quantity: 1,
    unitWatts: 5750,
    powerFactor: 0.85,
    diversityFactor: 0.87,
    category: 'CUSTOM',
    description: 'Type B standard load group (5.75 kW)',
  },
];

/**
 * Size standard breaker for a given design current
 */
export function sizeBreaker(
  currentIb: number,
  isThreePhase: boolean,
  category?: CircuitCategory,
  applicationLevel: 'CIRCUIT' | 'DB_INCOMER' | 'SUBDB_INCOMER' | 'MSB_INCOMER' = 'CIRCUIT'
): BreakerSizingResult {
  const poles = isThreePhase ? (applicationLevel === 'CIRCUIT' ? 3 : 4) : 1;
  const targetRating = Math.max(1, currentIb);

  if (applicationLevel === 'CIRCUIT') {
    const curve = category ? CATEGORY_DEFAULTS[category].recommendedCurve : 'C';
    // MCB selection
    const mcb = STANDARD_MCB_RATINGS.find((r) => r >= targetRating) || 125;
    const kA = mcb > 63 ? 10 : 6;
    return {
      rating: mcb,
      type: mcb > 63 ? 'MCCB' : 'MCB',
      poles: isThreePhase ? 3 : 1,
      curve,
      breakingCapacityKA: kA,
      description: `${mcb}A Type-${curve} ${isThreePhase ? '3P' : '1P'} ${mcb > 63 ? 'MCCB' : 'MCB'}`,
    };
  }

  if (applicationLevel === 'DB_INCOMER') {
    // DB Incomer: up to 63A or 80A can be MCB, above is MCCB
    const rating =
      STANDARD_MCCB_RATINGS.find((r) => r >= targetRating) ||
      STANDARD_ACB_RATINGS.find((r) => r >= targetRating) ||
      250;
    const type = rating <= 63 ? 'MCB' : 'MCCB';
    const kA = rating <= 63 ? 10 : rating <= 160 ? 18 : 25;
    return {
      rating,
      type,
      poles: isThreePhase ? 4 : 2,
      breakingCapacityKA: kA,
      description: `${rating}A ${isThreePhase ? '4-Pole' : '2-Pole'} ${type}`,
    };
  }

  if (applicationLevel === 'SUBDB_INCOMER') {
    // Sub-DB Incomer: MCCB typically 100A to 800A
    const rating =
      STANDARD_MCCB_RATINGS.find((r) => r >= targetRating) ||
      STANDARD_ACB_RATINGS.find((r) => r >= targetRating) ||
      800;
    const kA = rating <= 250 ? 25 : 36;
    return {
      rating,
      type: rating >= 800 ? 'ACB' : 'MCCB',
      poles: 4,
      breakingCapacityKA: kA,
      description: `${rating}A 4-Pole ${rating >= 800 ? 'ACB' : 'MCCB'}`,
    };
  }

  // MSB Incomer: MCCB or ACB (Air Circuit Breaker)
  if (targetRating <= 400) {
    const rating = STANDARD_MCCB_RATINGS.find((r) => r >= targetRating) || 400;
    return {
      rating,
      type: 'MCCB',
      poles: 4,
      breakingCapacityKA: 36,
      frameSize: rating,
      description: `${rating}A 4-Pole MCCB`,
    };
  }

  const acbRating = STANDARD_ACB_RATINGS.find((r) => r >= targetRating) || 4000;
  return {
    rating: acbRating,
    type: 'ACB',
    poles: 4,
    breakingCapacityKA: 50,
    frameSize: acbRating,
    description: `${acbRating}A 4-Pole Air Circuit Breaker (ACB)`,
  };
}

/**
 * Size standard breaker for a given design current, referencing custom Cable Schedule if provided.
 * Incomers (DB, Sub-DB, MSB) support the full range of protective breaker devices (all MCB, MCCB, ACB types in the Breaker Schedule).
 */
export function sizeBreakerWithSchedule(
  currentIb: number,
  isThreePhase: boolean,
  category?: CircuitCategory,
  applicationLevel: 'CIRCUIT' | 'DB_INCOMER' | 'SUBDB_INCOMER' | 'MSB_INCOMER' = 'CIRCUIT',
  schedule?: CableScheduleEntry[],
  preferredRating?: number
): BreakerSizingResult {
  const activeSchedule = schedule && schedule.length > 0 ? schedule : DEFAULT_CABLE_SCHEDULE;
  const phaseKey: '1P' | '3P' = isThreePhase ? '3P' : '1P';
  const targetRating = Math.max(1, currentIb);

  // Check matching rules in the active schedule for this phase system
  const matching = activeSchedule.filter((e) => e.phaseSystem === phaseKey);

  if (matching.length > 0) {
    // Sort ascending by breaker rating
    const sorted = [...matching].sort((a, b) => a.breakerRating - b.breakerRating);

    let candidates = sorted;
    if (applicationLevel === 'CIRCUIT') {
      const circuitSpecific = sorted.filter((e) => e.breakerType === 'MCB' || e.breakerRating <= 125);
      if (circuitSpecific.length > 0) candidates = circuitSpecific;
    }
    // Incomer breaker sizing (DB, Sub-DB, MSB) supports the full range of protective devices (MCB, MCCB, ACB)

    let matched: CableScheduleEntry | undefined;

    // Direct match if preferredRating is specified (manual breaker override)
    if (preferredRating !== undefined && preferredRating > 0) {
      matched = candidates.find((e) => e.breakerRating === preferredRating) ||
                sorted.find((e) => e.breakerRating === preferredRating);
    }

    if (!matched) {
      matched = candidates.find((e) => e.breakerRating >= targetRating) || candidates[candidates.length - 1];
    }

    if (matched) {
      const curve = category ? CATEGORY_DEFAULTS[category].recommendedCurve : 'C';
      const kA = matched.breakerType === 'ACB'
        ? 50
        : matched.breakerRating <= 63
        ? 10
        : matched.breakerRating <= 160
        ? 18
        : matched.breakerRating <= 250
        ? 25
        : matched.breakerRating <= 630
        ? 36
        : 50;

      let poles: 1 | 2 | 3 | 4;
      if (applicationLevel === 'CIRCUIT') {
        poles = isThreePhase ? 3 : 1;
      } else {
        poles = isThreePhase ? (matched.poles === 3 ? 3 : 4) : 2;
      }

      const poleLabel = `${poles}-Pole`;
      const description =
        applicationLevel === 'CIRCUIT'
          ? `${matched.breakerRating}A Type-${curve} ${isThreePhase ? '3P' : '1P'} ${matched.breakerType}`
          : `${matched.breakerRating}A ${poleLabel} ${matched.breakerType}`;

      return {
        rating: matched.breakerRating,
        type: matched.breakerType,
        poles,
        curve: applicationLevel === 'CIRCUIT' ? curve : undefined,
        breakingCapacityKA: kA,
        frameSize: matched.breakerRating >= 160 ? matched.breakerRating : undefined,
        description,
      };
    }
  }

  return sizeBreaker(currentIb, isThreePhase, category, applicationLevel);
}

/**
 * Retrieve sorted Breaker Schedule entries for the specified phase system.
 * Contains the full range of protective breaker devices (MCB, MCCB, ACB).
 */
export function getScheduleBreakers(
  isThreePhase: boolean,
  schedule?: CableScheduleEntry[]
): CableScheduleEntry[] {
  const activeSchedule = schedule && schedule.length > 0 ? schedule : DEFAULT_CABLE_SCHEDULE;
  const phaseKey: '1P' | '3P' = isThreePhase ? '3P' : '1P';
  const matching = activeSchedule.filter((e) => e.phaseSystem === phaseKey);
  return [...matching].sort((a, b) => a.breakerRating - b.breakerRating);
}

/**
 * Step incomer breaker size sequentially up or down across the entire Breaker Schedule range.
 * Supports all MCB, MCCB, and ACB protective devices.
 */
export function getStepBreakerSize(
  currentRating: number,
  direction: 'UP' | 'DOWN',
  isThreePhase: boolean,
  schedule?: CableScheduleEntry[]
): CableScheduleEntry | null {
  const list = getScheduleBreakers(isThreePhase, schedule);
  if (list.length === 0) return null;

  const exactIdx = list.findIndex((b) => b.breakerRating === currentRating);
  if (exactIdx !== -1) {
    if (direction === 'UP') {
      return exactIdx < list.length - 1 ? list[exactIdx + 1] : null;
    } else {
      return exactIdx > 0 ? list[exactIdx - 1] : null;
    }
  }

  if (direction === 'UP') {
    return list.find((b) => b.breakerRating > currentRating) || null;
  } else {
    const smaller = [...list].reverse().find((b) => b.breakerRating < currentRating);
    return smaller || null;
  }
}

/**
 * Size recommended copper cable
 */
export function sizeCable(currentIb: number, isThreePhase: boolean): string {
  const table = isThreePhase ? THREE_PHASE_CABLE_TABLE : SINGLE_PHASE_CABLE_TABLE;
  const match = table.find((item) => item.maxAmps >= currentIb);
  if (match) {
    return match.sizeString;
  }
  return isThreePhase
    ? `Custom Busduct / Parallel Cables (> ${currentIb.toFixed(0)}A)`
    : `Custom Heavy Feeder Cable (> ${currentIb.toFixed(0)}A)`;
}

/**
 * Size recommended cable, referencing the active Cable Schedule
 */
export function sizeCableWithSchedule(
  currentOrBreakerAmps: number,
  isThreePhase: boolean,
  schedule?: CableScheduleEntry[],
  preferredBreakerRating?: number
): string {
  const activeSchedule = schedule && schedule.length > 0 ? schedule : DEFAULT_CABLE_SCHEDULE;
  const phaseKey: '1P' | '3P' = isThreePhase ? '3P' : '1P';

  const matching = activeSchedule.filter((e) => e.phaseSystem === phaseKey);
  if (matching.length > 0) {
    // 1. Direct match on breaker rating
    if (preferredBreakerRating) {
      const exact = matching.find((e) => e.breakerRating === preferredBreakerRating);
      if (exact && exact.cableSize) {
        return exact.cableSize;
      }
    }

    // 2. Smallest rating >= currentOrBreakerAmps
    const sorted = [...matching].sort((a, b) => a.breakerRating - b.breakerRating);
    const byBreaker = sorted.find((e) => e.breakerRating >= currentOrBreakerAmps);
    if (byBreaker && byBreaker.cableSize) {
      return byBreaker.cableSize;
    }

    // 3. Match by current capacity Iz
    const byCapacity = sorted.find((e) => e.maxAmps >= currentOrBreakerAmps);
    if (byCapacity && byCapacity.cableSize) {
      return byCapacity.cableSize;
    }

    // Highest available cable
    return sorted[sorted.length - 1].cableSize;
  }

  return sizeCable(currentOrBreakerAmps, isThreePhase);
}

/**
 * Accurately parses the number of parallel conductor runs for a feeder or circuit.
 * Distinctly identifies parallel runs (e.g., "2x (4x1C 300mm²)", "2x 4x1C", "3x (4x1C...)")
 * while ensuring standard core-count notations (e.g., "4x1C", "2x1C", "3x1C", "1x4C")
 * are correctly recognized as a single run (1 run).
 */
export function parseParallelRuns(cableString: string): number {
  if (!cableString) return 1;
  const s = cableString.trim();

  // Pattern 1: Leading multiplier with parentheses, e.g. "2x (" or "2 x (" or "3x("
  const parenMatch = s.match(/^(\d+)\s*x\s*\(/i);
  if (parenMatch) return Math.max(1, parseInt(parenMatch[1], 10));

  // Pattern 2: Multiplier before another core x notation, e.g. "2x 4x1C" or "2 x 4x"
  const multiXMatch = s.match(/^(\d+)\s*x\s*\d+\s*x/i);
  if (multiXMatch) return Math.max(1, parseInt(multiXMatch[1], 10));

  // Pattern 3: Multiplier before multi-core notation, e.g. "2x 4C" or "2 x 3C" or "2x 5C" (NOT 1C!)
  const multiCoreMatch = s.match(/^(\d+)\s*x\s*[2-5]\s*c\b/i);
  if (multiCoreMatch) return Math.max(1, parseInt(multiCoreMatch[1], 10));

  // Pattern 4: Explicit "runs", "sets", "nos", e.g. "2 runs of 4x1C", "2 sets (4x1C...)"
  const runsMatch = s.match(/^(\d+)\s*(?:runs?|sets?|nos?)\b/i);
  if (runsMatch) return Math.max(1, parseInt(runsMatch[1], 10));

  return 1;
}

/**
 * Normalizes cable size string for resilient comparison across formats
 * (e.g. "4x1C 1.5mm²" vs "4x1C 1.5mm2" vs "4x1C 1.5 mm²" vs "4x1C 10.0mm²" vs "4x1C 10mm²")
 */
export function normalizeCableName(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/mm[²2]/g, 'mm')
    .replace(/\.0+(?=[a-z\s\(\)\[\]\+]|$)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Lookup / calculate mV/A/m voltage drop factor per BS 7671 Table 4D4B / 4E4B & IEC 60364-5-52
 * for copper cables at operating conductor temperature (70°C for PVC / 90°C for XLPE).
 * Follows active project Cable Definitions & Schedule first, with resilient fallback.
 */
export function getCableMvPerAmpMeter(
  cableString: string,
  isThreePhase: boolean,
  customDefs?: (CableDefinitionEntry | CableScheduleEntry)[],
  cableDefinitions?: CableDefinitionEntry[]
): number {
  if (!cableString) return isThreePhase ? 0.55 : 2.8;

  // Combine definitions: custom project definitions take highest precedence, then schedule, then defaults
  const allDefinitions: (CableDefinitionEntry | CableScheduleEntry)[] = [
    ...(cableDefinitions || []),
    ...(customDefs || []),
    ...DEFAULT_CABLE_DEFINITIONS,
    ...DEFAULT_CABLE_SCHEDULE,
  ];

  const clean = cableString.trim().toLowerCase();
  const targetNorm = normalizeCableName(cableString);

  // 1. Direct exact string match
  const exactMatch = allDefinitions.find((c) => {
    return c.cableSize && c.cableSize.trim().toLowerCase() === clean;
  });
  if (exactMatch && typeof exactMatch.mvPerAmpMeter === 'number' && exactMatch.mvPerAmpMeter > 0) {
    return exactMatch.mvPerAmpMeter;
  }

  // 2. Normalized string match (handles mm² vs mm2, extra spaces, trailing zero in 10.0mm vs 10mm)
  const normMatch = allDefinitions.find((c) => {
    return c.cableSize && normalizeCableName(c.cableSize) === targetNorm;
  });
  if (normMatch && typeof normMatch.mvPerAmpMeter === 'number' && normMatch.mvPerAmpMeter > 0) {
    return normMatch.mvPerAmpMeter;
  }

  // Low impedance busduct
  if (clean.includes('busduct') || clean.includes('busway')) {
    const busMatch = cableString.match(/(\d{3,5})\s*a/i);
    const busAmps = busMatch ? parseInt(busMatch[1], 10) : 1000;
    if (busAmps <= 630) return 0.226;
    if (busAmps <= 800) return 0.135;
    if (busAmps <= 1000) return 0.123;
    if (busAmps <= 1250) return 0.098;
    if (busAmps <= 1600) return 0.076;
    if (busAmps <= 2000) return 0.050;
    if (busAmps <= 2500) return 0.035;
    if (busAmps <= 3200) return 0.020;
    if (busAmps <= 4000) return 0.016;
    return 0.012;
  }

  // Detect parallel sets properly (e.g. 2x (4x1C 300mm²) = 2 runs, 4x1C 1.5mm² = 1 run)
  const parallelRuns = parseParallelRuns(cableString);

  // Detect mm² size: e.g. "70.0mm²" or "70mm²" or "1.5 mm²"
  const sizeMatch = cableString.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 0;

  // Standard BS 7671 / IEC 60364 mV/A/m table for copper cables
  const table3P: Record<number, number> = {
    1.5: 29.0,
    2.5: 18.0,
    4: 11.0,
    6: 6.4,
    10: 3.8,
    16: 2.4,
    25: 1.55,
    35: 1.10,
    50: 0.90,
    70: 0.65,
    95: 0.50,
    120: 0.37,
    150: 0.31,
    185: 0.26,
    240: 0.22,
    300: 0.195,
    400: 0.175,
    500: 0.160,
    630: 0.150,
  };

  const table1P: Record<number, number> = {
    1.5: 29.0,
    2.5: 18.0,
    4: 11.0,
    6: 6.4,
    10: 3.8,
    16: 2.4,
    25: 1.55,
    35: 1.10,
    50: 0.90,
    70: 0.65,
    95: 0.50,
    120: 0.37,
    150: 0.31,
    185: 0.26,
    240: 0.22,
    300: 0.195,
    400: 0.175,
    500: 0.160,
    630: 0.150,
  };

  const activeTable = isThreePhase ? table3P : table1P;

  if (size in activeTable) {
    return activeTable[size] / parallelRuns;
  }

  // Exact fallback formula for custom cable sizes:
  // For 1-Phase: ΔV/I/L = 2 * (rho / A) * 1000 (mV/A/m)
  // For 3-Phase: ΔV/I/L = sqrt(3) * (rho / A) * 1000 (mV/A/m)
  // rho copper at 70°C = 0.0225 ohm*mm2/m
  if (size > 0) {
    const b = isThreePhase ? Math.sqrt(3) : 2;
    const baseMv = (b * (0.0225 / size)) * 1000;
    return baseMv / parallelRuns;
  }

  return (isThreePhase ? 0.55 : 2.8) / parallelRuns;
}

/**
 * Calculate Voltage Drop (ΔV in Volts and % drop)
 * Formula:
 * ΔV (Volts) = (mV/A/m * Ib * Length_m) / 1000
 * % Drop = (ΔV / V_system) * 100%
 * Standard Limits (IEC 60364-5-52 / BS 7671):
 * - Sub-mains / Feeders: Recommended <= 2.5% to 3.0%, Acceptable <= 4.0%, Exceeded > 4.0%
 */
export function calculateVoltageDrop(
  cableSize: string,
  currentIb: number,
  lengthMeters: number,
  isThreePhase: boolean,
  voltage: VoltageSystem,
  basis: 'BREAKER' | 'DESIGN' = 'BREAKER',
  customDefs?: (CableDefinitionEntry | CableScheduleEntry)[],
  cableDefinitions?: CableDefinitionEntry[]
): VoltageDropResult {
  const L = Math.max(0, lengthMeters);
  const I = Math.max(0, currentIb);
  const systemVoltage = isThreePhase ? voltage.Vll : voltage.Vln;
  const mvPerAmpMeter = getCableMvPerAmpMeter(cableSize, isThreePhase, customDefs, cableDefinitions);

  const voltageDropV = (mvPerAmpMeter * I * L) / 1000;
  const voltageDropPercent = systemVoltage > 0 ? (voltageDropV / systemVoltage) * 100 : 0;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED' = 'OPTIMAL';
  if (voltageDropPercent > 4.0) {
    status = 'EXCEEDED';
  } else if (voltageDropPercent > 2.5) {
    status = 'ACCEPTABLE';
  }

  return {
    voltageDropV,
    voltageDropPercent,
    mvPerAmpMeter,
    status,
    cableSize,
    cableLengthMeters: L,
    currentAmps: I,
    systemVoltage,
    isThreePhase,
    basis,
  };
}

/**
 * Validates Distribution Board voltage drop accounting for upstream hierarchy (MSB vs Sub-DB):
 * - Sub-DBs (fed directly from MSB): Max allowable voltage drop limit is <= 4.0%
 * - DBs fed directly from MSB: Max allowable voltage drop limit is <= 4.0%
 * - DBs fed from Sub-DBs: Max allowable voltage drop limit is dynamically adjusted to
 *   <= (4.0% minus the voltage drop of the parent Sub-DB it is connected to)
 */
/**
 * Validates Distribution Board voltage drop accounting for upstream hierarchy (MSB vs Sub-DB):
 * - Sub-DBs (fed directly from MSB): Max allowable voltage drop limit check figure remains <= 4.0% from MSB.
 * - DBs fed directly from MSB: Max allowable voltage drop limit check figure remains <= 4.0% from MSB.
 * - DBs fed from Sub-DBs: Max allowable voltage drop limit check figure is adjusted dynamically to
 *   <= (4.0% minus the voltage drop of the parent Sub-DB it is connected to).
 */
export function getDbVoltageDropValidation(
  db: DistributionBoard,
  parentSubDb?: SubDistributionBoard
): {
  isFedFromSubDb: boolean;
  parentVdPercent: number;
  allowableLimit: number;
  dbVdPercent: number;
  cumulativeVdPercent: number;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED';
  indicatorLabel: string;
} {
  const parentVdPercent = parentSubDb?.voltageDropPercent ?? 0;
  const isFedFromSubDb = !!parentSubDb;
  // Dynamic allowable limit for this DB: (4.0% - parent Sub-DB VD), or 4.0% if fed from MSB
  const allowableLimit = isFedFromSubDb ? Math.max(0, 4.0 - parentVdPercent) : 4.0;
  const dbVdPercent = db.voltageDropPercent ?? 0;
  const cumulativeVdPercent = dbVdPercent + parentVdPercent;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED' = 'OPTIMAL';
  if (cumulativeVdPercent > 4.0 || dbVdPercent > allowableLimit) {
    status = 'EXCEEDED';
  } else if (cumulativeVdPercent > 2.5) {
    status = 'ACCEPTABLE';
  }

  // Format indicator label e.g., "≤ 2.80% OK" or "≤ 4% OK"
  const limitStr = isFedFromSubDb ? `${allowableLimit.toFixed(2)}%` : '4%';
  let indicatorLabel = `≤ ${limitStr} OK`;
  if (status === 'ACCEPTABLE') {
    indicatorLabel = `≤ ${limitStr} Pass`;
  } else if (status === 'EXCEEDED') {
    indicatorLabel = `> ${limitStr} High`;
  }

  return {
    isFedFromSubDb,
    parentVdPercent,
    allowableLimit,
    dbVdPercent,
    cumulativeVdPercent,
    status,
    indicatorLabel,
  };
}

/**
 * Validates Sub-Distribution Board voltage drop:
 * Sub-DBs are fed directly from the MSB, so the maximum allowable check figure remains <= 4.0% from MSB.
 */
export function getSubDbVoltageDropValidation(
  subDb: SubDistributionBoard
): {
  vdPercent: number;
  allowableLimit: number;
  cumulativeVdPercent: number;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED';
  indicatorLabel: string;
} {
  const vdPercent = subDb.voltageDropPercent ?? 0;
  const allowableLimit = 4.0;
  const cumulativeVdPercent = vdPercent;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED' = 'OPTIMAL';
  if (vdPercent > 4.0) {
    status = 'EXCEEDED';
  } else if (vdPercent > 2.5) {
    status = 'ACCEPTABLE';
  }

  const indicatorLabel =
    status === 'EXCEEDED'
      ? '> 4% High'
      : status === 'ACCEPTABLE'
      ? '≤ 4% Pass'
      : '≤ 4% OK';

  return {
    vdPercent,
    allowableLimit,
    cumulativeVdPercent,
    status,
    indicatorLabel,
  };
}

/**
 * Standard progression of cable sizing options for 3-Phase and 1-Phase feeders
 * (IEC 60364 / BS 7671 Table 4D4A / 4E4A)
 */
export const STANDARD_3P_CABLE_OPTIONS: string[] = [
  '4x1C 1.5mm² Cu/PVC +E',
  '4x1C 2.5mm² Cu/PVC +E',
  '4x1C 4.0mm² Cu/PVC +E',
  '4x1C 6.0mm² Cu/PVC +E',
  '4x1C 10.0mm² Cu/PVC +E',
  '4x1C 16.0mm² Cu/PVC +E',
  '4x1C 25.0mm² Cu/PVC +E',
  '4x1C 35.0mm² Cu/PVC +E',
  '4x1C 50.0mm² Cu/XLPE/PVC +E',
  '4x1C 70.0mm² Cu/XLPE/PVC +E',
  '4x1C 95.0mm² Cu/XLPE/PVC +E',
  '4x1C 120.0mm² Cu/XLPE/PVC +E',
  '4x1C 150.0mm² Cu/XLPE/PVC +E',
  '4x1C 185.0mm² Cu/XLPE/PVC +E',
  '4x1C 240.0mm² Cu/XLPE/PVC +E',
  '4x1C 300.0mm² Cu/XLPE/PVC +E',
  '4x1C 400.0mm² Cu/XLPE/PVC +E',
  '4x1C 500.0mm² Cu/XLPE/PVC +E',
  '4x1C 630.0mm² Cu/XLPE/PVC +E',
  '2x (4x1C 300.0mm² Cu/XLPE +E)',
  '2x (4x1C 400.0mm² Cu/XLPE +E)',
  '2x (4x1C 500.0mm² Cu/XLPE +E)',
  '2x (4x1C 630.0mm² Cu/XLPE +E)',
  'Copper Busduct 630A',
  'Copper Busduct 800A',
  'Copper Busduct 1000A',
  'Copper Busduct 1250A',
  'Copper Busduct 1600A',
  'Copper Busduct 2000A',
  'Copper Busduct 2500A',
];

export const STANDARD_1P_CABLE_OPTIONS: string[] = [
  '2x1C 1.5mm² Cu/PVC +E',
  '2x1C 2.5mm² Cu/PVC +E',
  '2x1C 4.0mm² Cu/PVC +E',
  '2x1C 6.0mm² Cu/PVC +E',
  '2x1C 10.0mm² Cu/PVC +E',
  '2x1C 16.0mm² Cu/PVC +E',
  '2x1C 25.0mm² Cu/PVC +E',
  '2x1C 35.0mm² Cu/PVC +E',
  '2x1C 50.0mm² Cu/XLPE/PVC +E',
  '2x1C 70.0mm² Cu/XLPE/PVC +E',
];

/**
 * Find index of a cable specification in the progressive standard options list
 */
export function findCableSizeIndex(cableString: string, isThreePhase: boolean): number {
  if (!cableString) return -1;
  const list = isThreePhase ? STANDARD_3P_CABLE_OPTIONS : STANDARD_1P_CABLE_OPTIONS;

  // 1. Direct match
  const exactIdx = list.findIndex(
    (c) => c.toLowerCase().trim() === cableString.toLowerCase().trim()
  );
  if (exactIdx !== -1) return exactIdx;

  // 2. Normalized match (ignoring whitespace and trailing decimal zero before mm)
  const norm = (s: string) => s.toLowerCase().replace(/\.0(?=mm)/g, '').replace(/\s+/g, '');
  const targetNorm = norm(cableString);
  const normIdx = list.findIndex((c) => norm(c) === targetNorm);
  if (normIdx !== -1) return normIdx;

  // 3. Busduct matching
  const lower = cableString.toLowerCase();
  if (lower.includes('busduct') || lower.includes('busway')) {
    const busMatch = cableString.match(/(\d{3,5})\s*a/i);
    const busAmps = busMatch ? parseInt(busMatch[1], 10) : 800;
    const busIdx = list.findIndex((c) => {
      const m = c.match(/(\d{3,5})\s*a/i);
      return m && parseInt(m[1], 10) >= busAmps;
    });
    return busIdx !== -1 ? busIdx : list.length - 1;
  }

  // 4. Physical cross-section matching (parallel runs and conductor area)
  const parallelRuns = parseParallelRuns(cableString);

  const mmMatch = cableString.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const mm = mmMatch ? parseFloat(mmMatch[1]) : 0;

  if (mm > 0) {
    const matchedIdx = list.findIndex((c) => {
      const cP = parseParallelRuns(c);
      const cMmMatch = c.match(/(\d+(?:\.\d+)?)\s*mm/i);
      const cMm = cMmMatch ? parseFloat(cMmMatch[1]) : 0;
      return cP === parallelRuns && Math.abs(cMm - mm) < 0.1;
    });
    if (matchedIdx !== -1) return matchedIdx;
  }

  return -1;
}

/**
 * Step cable size up or down to the next standard rating
 */
export function getStepCableSize(
  currentCable: string,
  direction: 'UP' | 'DOWN',
  isThreePhase: boolean
): string | null {
  const list = isThreePhase ? STANDARD_3P_CABLE_OPTIONS : STANDARD_1P_CABLE_OPTIONS;
  const currentIdx = findCableSizeIndex(currentCable, isThreePhase);

  if (currentIdx === -1) {
    return direction === 'UP' ? list[1] || list[0] : list[0];
  }

  if (direction === 'UP') {
    if (currentIdx < list.length - 1) {
      return list[currentIdx + 1];
    }
    return null; // Already at maximum standard rating
  } else {
    if (currentIdx > 0) {
      return list[currentIdx - 1];
    }
    return null; // Already at minimum standard rating
  }
}

/**
 * Calculate single circuit values
 */
export function calculateCircuit(
  circuit: Circuit,
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[]
): Circuit {
  const totalWatts = Math.max(0, circuit.unitWatts * Math.max(0, circuit.quantity ?? 0));
  const connectedLoadKW = totalWatts / 1000;
  const rawPf = circuit.powerFactor !== undefined && !isNaN(circuit.powerFactor) ? circuit.powerFactor : 0.85;
  // Support range 0 to 1; clamp divisor to minimum 0.001 to prevent division by zero in apparent power kVA
  const effectivePf = rawPf <= 0 ? 0.001 : Math.min(1.0, rawPf);
  const connectedLoadKVA = connectedLoadKW === 0 ? 0 : connectedLoadKW / effectivePf;

  const rawDf = circuit.diversityFactor !== undefined && !isNaN(circuit.diversityFactor) ? circuit.diversityFactor : 1.0;
  const df = Math.max(0, Math.min(1.0, rawDf));
  const maximumDemandKW = connectedLoadKW * df;
  const maximumDemandKVA = connectedLoadKVA * df;

  let currentIb = 0;
  const is3P = circuit.phase === '3P';

  if (is3P) {
    // 3-Phase current: I = (kVA * 1000) / (sqrt(3) * Vll)
    currentIb = (maximumDemandKVA * 1000) / (Math.sqrt(3) * voltage.Vll);
  } else {
    // 1-Phase current: I = (kVA * 1000) / Vln
    currentIb = (maximumDemandKVA * 1000) / voltage.Vln;
  }

  const recommendedBreaker = sizeBreakerWithSchedule(currentIb, is3P, circuit.category, 'CIRCUIT', schedule);
  const recommendedCable = sizeCableWithSchedule(currentIb, is3P, schedule, recommendedBreaker.rating);

  return {
    ...circuit,
    connectedLoadKW,
    connectedLoadKVA,
    maximumDemandKW,
    maximumDemandKVA,
    currentIb,
    recommendedBreaker,
    recommendedCable,
  };
}

/**
 * Calculate Phase Balance and Unbalance % for a Distribution Board
 */
export function calculateDBPhaseBalance(
  circuits: Circuit[],
  voltage: VoltageSystem,
  boardDF: number = 1.0
): DBPhaseBalance {
  const phaseR: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseY: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseB: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };

  const validBoardDF = Math.max(0.001, Math.min(1.0, boardDF !== undefined && !isNaN(boardDF) ? boardDF : 1.0));

  for (const c of circuits) {
    if (c.phase === 'R') {
      phaseR.connectedKW += c.connectedLoadKW;
      phaseR.connectedKVA += c.connectedLoadKVA;
      phaseR.demandKW += c.maximumDemandKW;
      phaseR.demandKVA += c.maximumDemandKVA;
    } else if (c.phase === 'Y') {
      phaseY.connectedKW += c.connectedLoadKW;
      phaseY.connectedKVA += c.connectedLoadKVA;
      phaseY.demandKW += c.maximumDemandKW;
      phaseY.demandKVA += c.maximumDemandKVA;
    } else if (c.phase === 'B') {
      phaseB.connectedKW += c.connectedLoadKW;
      phaseB.connectedKVA += c.connectedLoadKVA;
      phaseB.demandKW += c.maximumDemandKW;
      phaseB.demandKVA += c.maximumDemandKVA;
    } else if (c.phase === '3P') {
      // Symmetrically distributed across all 3 phases
      const kwEach = c.maximumDemandKW / 3;
      const kvaEach = c.maximumDemandKVA / 3;
      const clKwEach = c.connectedLoadKW / 3;
      const clKvaEach = c.connectedLoadKVA / 3;

      phaseR.connectedKW += clKwEach;
      phaseR.connectedKVA += clKvaEach;
      phaseR.demandKW += kwEach;
      phaseR.demandKVA += kvaEach;

      phaseY.connectedKW += clKwEach;
      phaseY.connectedKVA += clKvaEach;
      phaseY.demandKW += kwEach;
      phaseY.demandKVA += kvaEach;

      phaseB.connectedKW += clKwEach;
      phaseB.connectedKVA += clKvaEach;
      phaseB.demandKW += kwEach;
      phaseB.demandKVA += kvaEach;
    }
  }

  // Apply DB Board Diversity (boardDF) to phase demand loads
  phaseR.demandKW *= validBoardDF;
  phaseR.demandKVA *= validBoardDF;
  phaseY.demandKW *= validBoardDF;
  phaseY.demandKVA *= validBoardDF;
  phaseB.demandKW *= validBoardDF;
  phaseB.demandKVA *= validBoardDF;

  // Calculate current per phase in Amperes:
  // In a balanced 3-phase system, Vphase = Vll / sqrt(3) (e.g. 400V / sqrt(3) = 230.94V)
  const phaseVoltage = voltage.Vll ? voltage.Vll / Math.sqrt(3) : (voltage.Vln || 230);
  phaseR.currentAmps = phaseVoltage > 0 ? (phaseR.demandKVA * 1000) / phaseVoltage : 0;
  phaseY.currentAmps = phaseVoltage > 0 ? (phaseY.demandKVA * 1000) / phaseVoltage : 0;
  phaseB.currentAmps = phaseVoltage > 0 ? (phaseB.demandKVA * 1000) / phaseVoltage : 0;

  const currents = [phaseR.currentAmps, phaseY.currentAmps, phaseB.currentAmps];
  const maxI = Math.max(...currents);
  const minI = Math.min(...currents);
  const avgI = (phaseR.currentAmps + phaseY.currentAmps + phaseB.currentAmps) / 3;

  let unbalancePercent = 0;
  if (avgI > 0) {
    unbalancePercent = ((maxI - minI) / avgI) * 100;
  }

  // Approximate neutral current for 3-phase system: In = sqrt(Ir^2 + Iy^2 + Ib^2 - (Ir*Iy + Iy*Ib + Ib*Ir))
  const ir = phaseR.currentAmps;
  const iy = phaseY.currentAmps;
  const ib = phaseB.currentAmps;
  const neutralTerm = ir * ir + iy * iy + ib * ib - (ir * iy + iy * ib + ib * ir);
  const neutralCurrentAmps = neutralTerm > 0 ? Math.sqrt(neutralTerm) : 0;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'POOR' = 'OPTIMAL';
  if (unbalancePercent > 20) {
    status = 'POOR';
  } else if (unbalancePercent > 10) {
    status = 'ACCEPTABLE';
  }

  return {
    phaseR,
    phaseY,
    phaseB,
    neutralCurrentAmps,
    unbalancePercent,
    status,
  };
}

/**
 * Recalculate a Distribution Board (DB)
 * DB Level: Group circuits -> Apply circuit-specific diversity -> Get DB Maximum Demand -> Size Incomer Breaker & Cable
 */
export function recalculateDB(
  db: DistributionBoard,
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[],
  cableDefinitions?: CableDefinitionEntry[]
): DistributionBoard {
  const updatedCircuits = db.circuits.map((c) => calculateCircuit(c, voltage, schedule));

  const totalConnectedKW = updatedCircuits.reduce((sum, c) => sum + c.connectedLoadKW, 0);
  const totalConnectedKVA = updatedCircuits.reduce((sum, c) => sum + c.connectedLoadKVA, 0);

  // Sum of circuit maximum demands
  const sumCircuitDemandKW = updatedCircuits.reduce((sum, c) => sum + c.maximumDemandKW, 0);
  const sumCircuitDemandKVA = updatedCircuits.reduce((sum, c) => sum + c.maximumDemandKVA, 0);

  // Board Level: Design Current (Ib) Calculation
  // Formula: DB Maximum Demand = (Sum of Circuit MDs) * Board Diversity Factor (DF)
  const boardDF = Math.max(0.1, Math.min(1.0, db.boardDiversityFactor !== undefined ? db.boardDiversityFactor : 1.0));
  const rawUtilization = db.utilizationPercent !== undefined
    ? db.utilizationPercent
    : (db.safetyMarginPercent !== undefined
        ? (db.safetyMarginPercent >= 40 ? db.safetyMarginPercent : 100 - db.safetyMarginPercent)
        : 80);
  const utilizationPercent = Math.max(10, Math.min(100, rawUtilization));
  const utilizationDecimal = utilizationPercent / 100;

  const maximumDemandKW = sumCircuitDemandKW * boardDF;
  const maximumDemandKVA = sumCircuitDemandKVA * boardDF;

  let phaseBalance: DBPhaseBalance;
  let incomerCurrentAmps = 0;
  let finalCircuits = updatedCircuits;

  if (db.isThreePhase) {
    phaseBalance = calculateDBPhaseBalance(updatedCircuits, voltage, boardDF);

    // Balanced 3-phase calculation: (MD_kVA * 1000) / (sqrt(3) * Vll)
    const balancedCurrentAmps = (maximumDemandKVA * 1000) / (Math.sqrt(3) * voltage.Vll);

    // Phase currents from actual circuit distribution (R, Y, B), already diversified with board diversity
    const maxPhaseCurrentAmps = Math.max(
      phaseBalance.phaseR.currentAmps,
      phaseBalance.phaseY.currentAmps,
      phaseBalance.phaseB.currentAmps
    );

    // 3-Phase DB Incomer Design Current (Ib) based on actual diversified maximum demand
    incomerCurrentAmps = Math.max(balancedCurrentAmps, maxPhaseCurrentAmps);
  } else {
    const assignedPhase: 'R' | 'Y' | 'B' = db.phase || 'R';
    const phaseVoltage = voltage.Vll ? voltage.Vll / Math.sqrt(3) : (voltage.Vln || 230);
    incomerCurrentAmps = (maximumDemandKVA * 1000) / phaseVoltage;

    // Ensure all circuits in a 1-Phase DB match its assigned supply phase
    finalCircuits = updatedCircuits.map((c) =>
      c.phase !== assignedPhase ? { ...c, phase: assignedPhase } : c
    );

    const emptyPhase: PhaseLoadSummary = {
      connectedKW: 0,
      connectedKVA: 0,
      demandKW: 0,
      demandKVA: 0,
      currentAmps: 0,
    };

    const activePhase: PhaseLoadSummary = {
      connectedKW: totalConnectedKW,
      connectedKVA: totalConnectedKVA,
      demandKW: maximumDemandKW,
      demandKVA: maximumDemandKVA,
      currentAmps: incomerCurrentAmps,
    };

    phaseBalance = {
      phaseR: assignedPhase === 'R' ? activePhase : { ...emptyPhase },
      phaseY: assignedPhase === 'Y' ? activePhase : { ...emptyPhase },
      phaseB: assignedPhase === 'B' ? activePhase : { ...emptyPhase },
      neutralCurrentAmps: incomerCurrentAmps,
      unbalancePercent: 0,
      status: 'OPTIMAL',
    };
  }

  // Overcurrent Protective Device (Breaker) Sizing:
  // Formula: Required Breaker Capacity ≥ Ib / Utilization
  const requiredBreakerCapacity = incomerCurrentAmps / utilizationDecimal;

  const incomerBreaker = sizeBreakerWithSchedule(
    db.manualIncomerBreakerRating ?? requiredBreakerCapacity,
    db.isThreePhase,
    undefined,
    'DB_INCOMER',
    schedule,
    db.manualIncomerBreakerRating
  );
  const calculatedIncomerCable = sizeCableWithSchedule(
    Math.max(incomerCurrentAmps, incomerBreaker.rating),
    db.isThreePhase,
    schedule,
    incomerBreaker.rating
  );
  const incomerCable = db.manualIncomerCable || calculatedIncomerCable;

  const voltageDropBasis: 'BREAKER' | 'DESIGN' = db.voltageDropBasis || 'BREAKER';
  const calculationCurrent = voltageDropBasis === 'BREAKER'
    ? (incomerBreaker?.rating || incomerCurrentAmps)
    : incomerCurrentAmps;

  const cableLengthMeters = db.cableLengthMeters !== undefined ? db.cableLengthMeters : 25;
  const vdResult = calculateVoltageDrop(
    incomerCable,
    calculationCurrent,
    cableLengthMeters,
    db.isThreePhase,
    voltage,
    voltageDropBasis,
    schedule,
    cableDefinitions
  );

  return {
    ...db,
    phase: db.isThreePhase ? undefined : (db.phase || 'R'),
    utilizationPercent,
    safetyMarginPercent: utilizationPercent,
    cableLengthMeters,
    voltageDropBasis,
    manualIncomerCable: db.manualIncomerCable,
    manualIncomerBreakerRating: db.manualIncomerBreakerRating,
    circuits: finalCircuits,
    connectedLoadKW: totalConnectedKW,
    connectedLoadKVA: totalConnectedKVA,
    maximumDemandKW,
    maximumDemandKVA,
    incomerCurrentAmps,
    phaseBalance,
    incomerBreaker,
    incomerCable,
    voltageDropV: vdResult.voltageDropV,
    voltageDropPercent: vdResult.voltageDropPercent,
    voltageDropMvPerAmpMeter: vdResult.mvPerAmpMeter,
    voltageDropStatus: vdResult.status,
  };
}

/**
 * Phase Auto-Balancer algorithm:
 * Given a DB with 1-phase circuits, reassigns their phase ('R', 'Y', 'B') to minimize unbalance
 * according to the rotational priority allocation:
 * - Cycle 1: Y (Highest) > B (2nd Highest) > R (Lowest)
 * - Cycle 2: B (Highest) > R (2nd Highest) > Y (Lowest)
 * - Cycle 3: R (Highest) > Y (2nd Highest) > B (Lowest)
 */
export function autoBalanceDBPhases(
  db: DistributionBoard,
  voltage: VoltageSystem,
  priorityOrder: ('R' | 'Y' | 'B')[] = ['Y', 'B', 'R'],
  schedule?: CableScheduleEntry[],
  cableDefinitions?: CableDefinitionEntry[]
): DistributionBoard {
  if (!db.isThreePhase) {
    return recalculateDB(db, voltage, schedule, cableDefinitions);
  }

  // Separate 3P circuits from 1P circuits
  const threePhaseCircuits = db.circuits.filter((c) => c.phase === '3P');
  const singlePhaseCircuits = db.circuits.filter((c) => c.phase !== '3P');

  if (singlePhaseCircuits.length === 0) {
    return recalculateDB(db, voltage, schedule, cableDefinitions);
  }

  // Sort single phase circuits descending by maximumDemandKVA (LPT greedy bin packing order)
  const sorted1P = [...singlePhaseCircuits].sort(
    (a, b) => b.maximumDemandKVA - a.maximumDemandKVA
  );

  // Initialize phase load tracking (3P loads are balanced 1/3 per phase)
  let fixedPerPhaseKVA = 0;
  for (const c of threePhaseCircuits) {
    fixedPerPhaseKVA += c.maximumDemandKVA / 3;
  }

  const phaseLoads: Record<'R' | 'Y' | 'B', number> = {
    R: fixedPerPhaseKVA,
    Y: fixedPerPhaseKVA,
    B: fixedPerPhaseKVA,
  };

  const assigned1P: { circuit: Circuit; phase: 'R' | 'Y' | 'B' }[] = [];

  // Greedy minimax allocation: strictly prioritize minimizing spread (max - min)
  // Priority order is used strictly as a gentle tie-breaker without artificial heavy penalties
  for (let i = 0; i < sorted1P.length; i++) {
    const c = sorted1P[i];
    const kva = c.maximumDemandKVA;

    const candidates: ('R' | 'Y' | 'B')[] = ['R', 'Y', 'B'];
    let bestPhase: 'R' | 'Y' | 'B' = priorityOrder[0];
    let bestScore = Infinity;

    for (const phase of candidates) {
      const trial: Record<'R' | 'Y' | 'B', number> = {
        ...phaseLoads,
        [phase]: phaseLoads[phase] + kva,
      };

      const maxL = Math.max(trial.R, trial.Y, trial.B);
      const minL = Math.min(trial.R, trial.Y, trial.B);
      const spread = maxL - minL;

      // Gentle tie-breaker preferring priorityOrder (pHigh, then pMid, then pLow)
      const prefIdx = priorityOrder.indexOf(phase);
      const tieBreaker = (prefIdx >= 0 ? prefIdx : 0) * 0.0001;

      // Strict Priority 1: Minimize local spread and peak phase load
      const score = spread * 100.0 + maxL + tieBreaker;

      if (score < bestScore) {
        bestScore = score;
        bestPhase = phase;
      }
    }

    phaseLoads[bestPhase] += kva;
    assigned1P.push({
      circuit: c,
      phase: bestPhase,
    });
  }

  // 2-opt refinement pass: check if moving a circuit or swapping two circuits further reduces local spread
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 20) {
    improved = false;
    iterations++;

    const currentMaxPhase = (['R', 'Y', 'B'] as const).reduce((a, b) =>
      phaseLoads[a] >= phaseLoads[b] ? a : b
    );
    const currentMinPhase = (['R', 'Y', 'B'] as const).reduce((a, b) =>
      phaseLoads[a] <= phaseLoads[b] ? a : b
    );
    const currentSpread = phaseLoads[currentMaxPhase] - phaseLoads[currentMinPhase];

    // Attempt moving a circuit from the highest-loaded phase to the min-loaded phase
    for (let i = 0; i < assigned1P.length; i++) {
      if (assigned1P[i].phase === currentMaxPhase) {
        const kva = assigned1P[i].circuit.maximumDemandKVA;
        const newMaxLoad = phaseLoads[currentMaxPhase] - kva;
        const newMinLoad = phaseLoads[currentMinPhase] + kva;
        const otherPhase = (['R', 'Y', 'B'] as const).find(
          (p) => p !== currentMaxPhase && p !== currentMinPhase
        )!;
        const otherLoad = phaseLoads[otherPhase];
        const newSpread = Math.max(newMaxLoad, newMinLoad, otherLoad) - Math.min(newMaxLoad, newMinLoad, otherLoad);

        if (newSpread < currentSpread - 0.001) {
          phaseLoads[currentMaxPhase] = newMaxLoad;
          phaseLoads[currentMinPhase] = newMinLoad;
          assigned1P[i].phase = currentMinPhase;
          improved = true;
          break;
        }
      }
    }

    if (improved) continue;

    // Attempt swapping two circuits between distinct phases
    for (let i = 0; i < assigned1P.length; i++) {
      for (let j = i + 1; j < assigned1P.length; j++) {
        const itemA = assigned1P[i];
        const itemB = assigned1P[j];
        if (itemA.phase === itemB.phase) continue;

        const kvaA = itemA.circuit.maximumDemandKVA;
        const kvaB = itemB.circuit.maximumDemandKVA;
        if (Math.abs(kvaA - kvaB) < 0.0001) continue;

        const simLoads = { ...phaseLoads };
        simLoads[itemA.phase] = simLoads[itemA.phase] - kvaA + kvaB;
        simLoads[itemB.phase] = simLoads[itemB.phase] - kvaB + kvaA;

        const simSpread = Math.max(simLoads.R, simLoads.Y, simLoads.B) - Math.min(simLoads.R, simLoads.Y, simLoads.B);
        if (simSpread < currentSpread - 0.001) {
          const oldPhaseA = itemA.phase;
          itemA.phase = itemB.phase;
          itemB.phase = oldPhaseA;
          phaseLoads.R = simLoads.R;
          phaseLoads.Y = simLoads.Y;
          phaseLoads.B = simLoads.B;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  const allUpdated = [
    ...threePhaseCircuits,
    ...assigned1P.map((item) => ({ ...item.circuit, phase: item.phase })),
  ];

  return recalculateDB({ ...db, circuits: allUpdated }, voltage, schedule, cableDefinitions);
}

/**
 * Rotate a DB's phases by shift (0, 1, or 2 shifts):
 * Shift 0: R -> R, Y -> Y, B -> B
 * Shift 1: R -> Y, Y -> B, B -> R
 * Shift 2: R -> B, Y -> R, B -> Y
 *
 * CRITICAL GUARANTEE: Phase rotation preserves 100% of the DB's internal balance,
 * local spread, unbalance %, breaker rating, and cable sizing (0% degradation),
 * while rotating which upstream bus phase receives each load.
 */
export function rotateDB(
  db: DistributionBoard,
  shift: number,
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[],
  cableDefinitions?: CableDefinitionEntry[]
): DistributionBoard {
  const s = ((shift % 3) + 3) % 3;
  if (s === 0) return db;

  const rotatePhase = (phase: 'R' | 'Y' | 'B' | '3P', amt: number): 'R' | 'Y' | 'B' | '3P' => {
    if (phase === '3P') return '3P';
    const m = ((amt % 3) + 3) % 3;
    if (m === 0) return phase;
    const map1: Record<'R' | 'Y' | 'B', 'R' | 'Y' | 'B'> = { R: 'Y', Y: 'B', B: 'R' };
    const map2: Record<'R' | 'Y' | 'B', 'R' | 'Y' | 'B'> = { R: 'B', Y: 'R', B: 'Y' };
    return m === 1 ? map1[phase] : map2[phase];
  };

  if (!db.isThreePhase) {
    const newAssignedPhase = rotatePhase(db.phase || 'R', s) as 'R' | 'Y' | 'B';
    const updatedCircuits = db.circuits.map((c) => ({
      ...c,
      phase: newAssignedPhase,
    }));
    return recalculateDB(
      { ...db, phase: newAssignedPhase, circuits: updatedCircuits },
      voltage,
      schedule,
      cableDefinitions
    );
  }

  const updatedCircuits = db.circuits.map((c) => ({
    ...c,
    phase: rotatePhase(c.phase, s),
  }));
  return recalculateDB({ ...db, circuits: updatedCircuits }, voltage, schedule, cableDefinitions);
}

/**
 * Calculate Phase Balance and Unbalance % for a Sub-Distribution Board
 * Aggregates phase loads across all connected downstream Final DBs
 */
export function calculateSubDBPhaseBalance(
  linkedDbs: DistributionBoard[],
  voltage: VoltageSystem,
  groupDF: number = 1.0
): DBPhaseBalance {
  const phaseR: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseY: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseB: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };

  const validGroupDF = Math.max(0.001, Math.min(1.0, groupDF !== undefined && !isNaN(groupDF) ? groupDF : 1.0));

  for (const db of linkedDbs) {
    if (!db.phaseBalance) continue;
    phaseR.connectedKW += db.phaseBalance.phaseR.connectedKW;
    phaseR.connectedKVA += db.phaseBalance.phaseR.connectedKVA;
    phaseR.demandKW += db.phaseBalance.phaseR.demandKW * validGroupDF;
    phaseR.demandKVA += db.phaseBalance.phaseR.demandKVA * validGroupDF;

    phaseY.connectedKW += db.phaseBalance.phaseY.connectedKW;
    phaseY.connectedKVA += db.phaseBalance.phaseY.connectedKVA;
    phaseY.demandKW += db.phaseBalance.phaseY.demandKW * validGroupDF;
    phaseY.demandKVA += db.phaseBalance.phaseY.demandKVA * validGroupDF;

    phaseB.connectedKW += db.phaseBalance.phaseB.connectedKW;
    phaseB.connectedKVA += db.phaseBalance.phaseB.connectedKVA;
    phaseB.demandKW += db.phaseBalance.phaseB.demandKW * validGroupDF;
    phaseB.demandKVA += db.phaseBalance.phaseB.demandKVA * validGroupDF;
  }

  // Calculate current per phase in Amperes: I_phase = (kVA * 1000) / Vphase
  const phaseVoltage = voltage.Vll ? voltage.Vll / Math.sqrt(3) : (voltage.Vln || 230);
  phaseR.currentAmps = phaseVoltage > 0 ? (phaseR.demandKVA * 1000) / phaseVoltage : 0;
  phaseY.currentAmps = phaseVoltage > 0 ? (phaseY.demandKVA * 1000) / phaseVoltage : 0;
  phaseB.currentAmps = phaseVoltage > 0 ? (phaseB.demandKVA * 1000) / phaseVoltage : 0;

  const currents = [phaseR.currentAmps, phaseY.currentAmps, phaseB.currentAmps];
  const maxI = Math.max(...currents);
  const minI = Math.min(...currents);
  const avgI = (phaseR.currentAmps + phaseY.currentAmps + phaseB.currentAmps) / 3;

  let unbalancePercent = 0;
  if (avgI > 0) {
    unbalancePercent = ((maxI - minI) / avgI) * 100;
  }

  const ir = phaseR.currentAmps;
  const iy = phaseY.currentAmps;
  const ib = phaseB.currentAmps;
  const neutralTerm = ir * ir + iy * iy + ib * ib - (ir * iy + iy * ib + ib * ir);
  const neutralCurrentAmps = neutralTerm > 0 ? Math.sqrt(neutralTerm) : 0;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'POOR' = 'OPTIMAL';
  if (unbalancePercent > 20) {
    status = 'POOR';
  } else if (unbalancePercent > 10) {
    status = 'ACCEPTABLE';
  }

  return {
    phaseR,
    phaseY,
    phaseB,
    neutralCurrentAmps,
    unbalancePercent,
    status,
  };
}

/**
 * Auto-Balance algorithm at Sub-Distribution Board level:
 * Dynamically re-routes and balances the circuit phases of all underlying,
 * downstream Final DBs connected directly to this Sub-Board to optimize
 * aggregate structure symmetry at the Sub-DB while preserving local DB balance.
 */
/**
 * Auto-Balance algorithm at Sub-Distribution Board level:
 * Independently and intelligently distributes/staggers the connected downstream DB loads
 * across R, Y, and B phases to minimize overall phase imbalance at the Sub-DB,
 * rather than forcing all connected DBs into a uniform lockstep phase pattern.
 *
 * Algorithm Strategy:
 * 1. Base tracking: Computes symmetrical 3-phase circuits (which naturally divide 1/3 to R, Y, B).
 * 2. Staggered distribution: Each connected downstream DB receives an independent, staggered
 *    phase preference order, ensuring complementary phase loadings across the bus.
 * 3. Dynamic joint-cost optimization: Assigns 1-phase circuits using aggregate Sub-DB spread
 *    and local DB balance without artificial uniform order penalties.
 * 4. Phase rotation refinement: Evaluates rotational permutations for 3-phase DBs to minimize
 *    the aggregate Sub-DB spread while strictly preserving each DB's internal balance and sizing.
 * 5. Greedy & 2-opt single-phase DB balancing: Distributes single-phase DBs across R, Y, B to
 *    counter any residual differences.
 */
/**
 * Auto-Balance algorithm at Sub-Distribution Board level:
 * Strict Bottom-Up Hierarchy:
 * 1. First Priority (Highest): Ensure each individual downstream DB is locally balanced first
 *    so its internal phases (R, Y, B) are as evenly distributed as possible.
 * 2. Second Priority: Balance the Sub-DB level using staggered distribution and phase rotation
 *    among connected downstream DBs, and distributing single-phase DBs across R, Y, B.
 *    Individual DB internal phase health is 100% protected and never compromised.
 */
export function autoBalanceSubDBDownstreamDBs(
  subDbId: string,
  allDbs: DistributionBoard[],
  voltage: VoltageSystem,
  priorityOrder?: ('R' | 'Y' | 'B')[],
  schedule?: CableScheduleEntry[],
  cableDefinitions?: CableDefinitionEntry[],
  cycleIndex?: number
): DistributionBoard[] {
  const linkedDbs = allDbs.filter((db) => db.subDbId === subDbId);
  if (linkedDbs.length === 0) return allDbs;

  const cycleOffset =
    cycleIndex !== undefined
      ? cycleIndex
      : priorityOrder
      ? priorityOrder[0] === 'Y'
        ? 0
        : priorityOrder[0] === 'B'
        ? 1
        : 2
      : 0;

  const getStaggerSequence = (offset: number): ('R' | 'Y' | 'B')[] => {
    const mod = ((offset % 3) + 3) % 3;
    if (mod === 0) return ['R', 'Y', 'B'];
    if (mod === 1) return ['Y', 'B', 'R'];
    return ['B', 'R', 'Y'];
  };

  const threePhaseDbs = linkedDbs.filter((d) => d.isThreePhase);
  const singlePhaseDbs = linkedDbs.filter((d) => !d.isThreePhase);

  // STEP 1: (FIRST PRIORITY - HIGHEST)
  // Locally balance each 3-phase downstream DB so its internal phases (R, Y, B) are as evenly distributed as possible.
  // Each DB receives a staggered priority sequence for its minor residual differences.
  const locallyBalanced3PDbs: DistributionBoard[] = [];
  for (let idx = 0; idx < threePhaseDbs.length; idx++) {
    const rawDb = threePhaseDbs[idx];
    const staggerSeq = getStaggerSequence(idx + cycleOffset);
    const balancedDb = autoBalanceDBPhases(rawDb, voltage, staggerSeq, schedule, cableDefinitions);
    locallyBalanced3PDbs.push(balancedDb);
  }

  // STEP 2: (SECOND PRIORITY)
  // Balance the Sub-DB level using staggered distribution among connected DBs.
  // We use phase rotation (shifts 0, 1, 2) on 3-phase DBs.
  // CRITICAL GUARANTEE: Phase rotation preserves 100% of each DB's internal balance (0% degradation in local spread).

  // Sort three-phase DBs descending by maximumDemandKVA to allocate larger loads first
  const sorted3PDbs = [...locallyBalanced3PDbs].sort(
    (a, b) => b.maximumDemandKVA - a.maximumDemandKVA
  );

  const aggregateKVA = { R: 0, Y: 0, B: 0 };
  const rotated3PDbs: DistributionBoard[] = [];

  for (let i = 0; i < sorted3PDbs.length; i++) {
    const db = sorted3PDbs[i];

    // Evaluate shift 0, 1, 2 for this DB against current aggregate
    let bestShift = 0;
    let bestSpread = Infinity;

    for (const shift of [0, 1, 2]) {
      const trialDb = rotateDB(db, shift, voltage, schedule, cableDefinitions);
      const trialR = aggregateKVA.R + (trialDb.phaseBalance?.phaseR.demandKVA || 0);
      const trialY = aggregateKVA.Y + (trialDb.phaseBalance?.phaseY.demandKVA || 0);
      const trialB = aggregateKVA.B + (trialDb.phaseBalance?.phaseB.demandKVA || 0);
      const spread = Math.max(trialR, trialY, trialB) - Math.min(trialR, trialY, trialB);

      // Gentle tie-breaker according to staggered sequence
      const prefBonus = shift === 0 ? 0 : shift === 1 ? 0.001 : 0.002;
      const score = spread + prefBonus;

      if (score < bestSpread) {
        bestSpread = score;
        bestShift = shift;
      }
    }

    const finalShiftedDb = rotateDB(db, bestShift, voltage, schedule, cableDefinitions);
    rotated3PDbs.push(finalShiftedDb);
    aggregateKVA.R += finalShiftedDb.phaseBalance?.phaseR.demandKVA || 0;
    aggregateKVA.Y += finalShiftedDb.phaseBalance?.phaseY.demandKVA || 0;
    aggregateKVA.B += finalShiftedDb.phaseBalance?.phaseB.demandKVA || 0;
  }

  // 2-opt rotation pass on 3-phase DBs to reach optimal Sub-DB spread
  if (rotated3PDbs.length >= 2) {
    let improved = true;
    let iter = 0;
    while (improved && iter < 10) {
      improved = false;
      iter++;
      for (let i = 0; i < rotated3PDbs.length; i++) {
        const db = rotated3PDbs[i];
        const currentR = db.phaseBalance?.phaseR.demandKVA || 0;
        const currentY = db.phaseBalance?.phaseY.demandKVA || 0;
        const currentB = db.phaseBalance?.phaseB.demandKVA || 0;

        const aggWithout = {
          R: aggregateKVA.R - currentR,
          Y: aggregateKVA.Y - currentY,
          B: aggregateKVA.B - currentB,
        };
        const currentSpread = Math.max(aggregateKVA.R, aggregateKVA.Y, aggregateKVA.B) -
                              Math.min(aggregateKVA.R, aggregateKVA.Y, aggregateKVA.B);

        for (const shift of [1, 2]) {
          const shiftedDb = rotateDB(db, shift, voltage, schedule, cableDefinitions);
          const trialAgg = {
            R: aggWithout.R + (shiftedDb.phaseBalance?.phaseR.demandKVA || 0),
            Y: aggWithout.Y + (shiftedDb.phaseBalance?.phaseY.demandKVA || 0),
            B: aggWithout.B + (shiftedDb.phaseBalance?.phaseB.demandKVA || 0),
          };
          const spread = Math.max(trialAgg.R, trialAgg.Y, trialAgg.B) -
                         Math.min(trialAgg.R, trialAgg.Y, trialAgg.B);

          if (spread < currentSpread - 0.001) {
            rotated3PDbs[i] = shiftedDb;
            aggregateKVA.R = trialAgg.R;
            aggregateKVA.Y = trialAgg.Y;
            aggregateKVA.B = trialAgg.B;
            improved = true;
            break;
          }
        }
      }
    }
  }

  // STEP 3: Distribute Single-Phase DBs to balance any remaining Sub-DB spread
  // Single-Phase DBs have no internal 3-phase balance; assigning them to R, Y, or B
  // perfectly counters any residual differences without affecting any 3P DB.
  const sorted1PDbs = [...singlePhaseDbs].sort(
    (a, b) => b.maximumDemandKVA - a.maximumDemandKVA
  );

  const reallocated1PDbs: DistributionBoard[] = [];
  for (let idx = 0; idx < sorted1PDbs.length; idx++) {
    const spDb = sorted1PDbs[idx];
    const phases: ('R' | 'Y' | 'B')[] = ['R', 'Y', 'B'];

    let bestPhase: 'R' | 'Y' | 'B' = 'R';
    let minSpread = Infinity;

    for (const p of phases) {
      const trial = {
        ...aggregateKVA,
        [p]: aggregateKVA[p] + spDb.maximumDemandKVA,
      };
      const spread = Math.max(trial.R, trial.Y, trial.B) - Math.min(trial.R, trial.Y, trial.B);
      if (spread < minSpread) {
        minSpread = spread;
        bestPhase = p;
      }
    }

    const updatedSpDb = recalculateDB(
      {
        ...spDb,
        phase: bestPhase,
        circuits: spDb.circuits.map((c) => ({ ...c, phase: bestPhase })),
      },
      voltage,
      schedule,
      cableDefinitions
    );

    reallocated1PDbs.push(updatedSpDb);
    aggregateKVA[bestPhase] += spDb.maximumDemandKVA;
  }

  // 2-opt swap pass for Single-Phase DBs
  if (reallocated1PDbs.length >= 2) {
    let improved = true;
    let iter = 0;
    while (improved && iter < 10) {
      improved = false;
      iter++;
      for (let i = 0; i < reallocated1PDbs.length; i++) {
        for (let j = i + 1; j < reallocated1PDbs.length; j++) {
          const dbA = reallocated1PDbs[i];
          const dbB = reallocated1PDbs[j];
          const phaseA = dbA.phase || 'R';
          const phaseB = dbB.phase || 'R';
          if (phaseA === phaseB) continue;

          const currentSpread = Math.max(aggregateKVA.R, aggregateKVA.Y, aggregateKVA.B) -
                                Math.min(aggregateKVA.R, aggregateKVA.Y, aggregateKVA.B);

          const sim = { ...aggregateKVA };
          sim[phaseA] = sim[phaseA] - dbA.maximumDemandKVA + dbB.maximumDemandKVA;
          sim[phaseB] = sim[phaseB] - dbB.maximumDemandKVA + dbA.maximumDemandKVA;
          const swapSpread = Math.max(sim.R, sim.Y, sim.B) - Math.min(sim.R, sim.Y, sim.B);

          if (swapSpread < currentSpread - 0.001) {
            reallocated1PDbs[i] = recalculateDB(
              {
                ...dbA,
                phase: phaseB,
                circuits: dbA.circuits.map((c) => ({ ...c, phase: phaseB })),
              },
              voltage,
              schedule,
              cableDefinitions
            );
            reallocated1PDbs[j] = recalculateDB(
              {
                ...dbB,
                phase: phaseA,
                circuits: dbB.circuits.map((c) => ({ ...c, phase: phaseA })),
              },
              voltage,
              schedule,
              cableDefinitions
            );
            aggregateKVA.R = sim.R;
            aggregateKVA.Y = sim.Y;
            aggregateKVA.B = sim.B;
            improved = true;
          }
        }
      }
    }
  }

  // Combine updated DBs for this Sub-DB, preserving unlinked DBs
  const updatedLinkedMap = new Map<string, DistributionBoard>();
  for (const db of [...rotated3PDbs, ...reallocated1PDbs]) {
    updatedLinkedMap.set(db.id, db);
  }

  return allDbs.map((db) => updatedLinkedMap.get(db.id) || db);
}

/**
 * Recalculate Sub-Distribution Board (SB)
 * Sub-DB Level: Sum DB Maximum Demands -> Apply group diversity -> Get Sub-DB Maximum Demand -> Size Incomer
 */
export function recalculateSubDB(
  subDb: SubDistributionBoard,
  dbs: DistributionBoard[],
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[],
  cableDefinitions?: CableDefinitionEntry[]
): SubDistributionBoard {
  const linkedDbs = dbs.filter((db) => db.subDbId === subDb.id);
  const connectedDbIds = linkedDbs.map((db) => db.id);

  const totalConnectedKW = linkedDbs.reduce((sum, db) => sum + db.connectedLoadKW, 0);
  const totalConnectedKVA = linkedDbs.reduce((sum, db) => sum + db.connectedLoadKVA, 0);

  // Sum of DB Maximum Demands
  const sumDbDemandKW = linkedDbs.reduce((sum, db) => sum + db.maximumDemandKW, 0);
  const sumDbDemandKVA = linkedDbs.reduce((sum, db) => sum + db.maximumDemandKVA, 0);

  // Sub-DB Maximum Demand strictly represents diversified demand
  // Formula: Sub-DB Maximum Demand = (Sum of DB MDs) * Group Diversity Factor (DF)
  const groupDF = Math.max(0.1, Math.min(1.0, subDb.groupDiversityFactor !== undefined ? subDb.groupDiversityFactor : 0.9));
  const rawSubUtilization = subDb.utilizationPercent !== undefined
    ? subDb.utilizationPercent
    : (subDb.safetyMarginPercent !== undefined
        ? (subDb.safetyMarginPercent >= 40 ? subDb.safetyMarginPercent : 100 - subDb.safetyMarginPercent)
        : 80);
  const subUtilizationPercent = Math.max(10, Math.min(100, rawSubUtilization));
  const subUtilizationDecimal = subUtilizationPercent / 100;

  const maximumDemandKW = sumDbDemandKW * groupDF;
  const maximumDemandKVA = sumDbDemandKVA * groupDF;

  // Phase balance aggregation across all connected DBs
  const phaseBalance = calculateSubDBPhaseBalance(linkedDbs, voltage, groupDF);

  const balancedCurrentAmps = (maximumDemandKVA * 1000) / (Math.sqrt(3) * voltage.Vll);
  const maxPhaseAmps = Math.max(
    phaseBalance.phaseR.currentAmps,
    phaseBalance.phaseY.currentAmps,
    phaseBalance.phaseB.currentAmps
  );
  // Sized on the higher of balanced current or peak phase current to represent true operational Ib
  const incomerCurrentAmps = Math.max(balancedCurrentAmps, maxPhaseAmps);

  // Overcurrent Protective Device (Breaker) Sizing:
  // Formula: Required Breaker Capacity ≥ I_SB / Utilization
  const requiredBreakerCapacity = incomerCurrentAmps / subUtilizationDecimal;

  const incomerBreaker = sizeBreakerWithSchedule(
    subDb.manualIncomerBreakerRating ?? requiredBreakerCapacity,
    true,
    undefined,
    'SUBDB_INCOMER',
    schedule,
    subDb.manualIncomerBreakerRating
  );
  const calculatedIncomerCable = sizeCableWithSchedule(
    Math.max(incomerCurrentAmps, incomerBreaker.rating),
    true,
    schedule,
    incomerBreaker.rating
  );
  const incomerCable = subDb.manualIncomerCable || calculatedIncomerCable;

  const voltageDropBasis: 'BREAKER' | 'DESIGN' = subDb.voltageDropBasis || 'BREAKER';
  const calculationCurrent = voltageDropBasis === 'BREAKER'
    ? (incomerBreaker?.rating || incomerCurrentAmps)
    : incomerCurrentAmps;

  const cableLengthMeters = subDb.cableLengthMeters !== undefined ? subDb.cableLengthMeters : 35;
  const vdResult = calculateVoltageDrop(
    incomerCable,
    calculationCurrent,
    cableLengthMeters,
    true,
    voltage,
    voltageDropBasis,
    schedule,
    cableDefinitions
  );

  return {
    ...subDb,
    connectedDbIds,
    utilizationPercent: subUtilizationPercent,
    safetyMarginPercent: subUtilizationPercent,
    cableLengthMeters,
    voltageDropBasis,
    manualIncomerCable: subDb.manualIncomerCable,
    manualIncomerBreakerRating: subDb.manualIncomerBreakerRating,
    connectedLoadKW: totalConnectedKW,
    connectedLoadKVA: totalConnectedKVA,
    maximumDemandKW,
    maximumDemandKVA,
    incomerCurrentAmps,
    phaseBalance,
    incomerBreaker,
    incomerCable,
    voltageDropV: vdResult.voltageDropV,
    voltageDropPercent: vdResult.voltageDropPercent,
    voltageDropMvPerAmpMeter: vdResult.mvPerAmpMeter,
    voltageDropStatus: vdResult.status,
  };
}

/**
 * Sizing of Distribution Transformer for MSB
 * Formula: Required kVA = Total Plant MD kVA / TX_Utilization
 * Selection: Standard IEC Transformer rating >= Required kVA (or manual override)
 */
export function sizeTransformer(
  plantMaximumDemandKVA: number,
  txUtilizationOrMargin: number,
  voltage: VoltageSystem,
  manualKVA?: number
): TransformerSizingResult {
  const rawTxUtil = txUtilizationOrMargin >= 40 ? txUtilizationOrMargin : (100 - txUtilizationOrMargin);
  const txUtilizationPercent = Math.max(10, Math.min(100, rawTxUtil || 80));
  const txUtilizationDecimal = txUtilizationPercent / 100;
  const targetKVA = plantMaximumDemandKVA / txUtilizationDecimal;

  let recommendedKVA: number;
  let recommendedUnits = 1;
  let unitRatingKVA: number;

  if (manualKVA && manualKVA > 0) {
    recommendedKVA = manualKVA;
    unitRatingKVA = manualKVA;
  } else {
    // Find standard transformer rating
    recommendedKVA =
      STANDARD_TRANSFORMER_KVA.find((rating) => rating >= targetKVA) ||
      STANDARD_TRANSFORMER_KVA[STANDARD_TRANSFORMER_KVA.length - 1];
    unitRatingKVA = recommendedKVA;

    // If load exceeds largest single transformer (3150 kVA), split into 2 or 3 transformers
    if (targetKVA > 3150) {
      recommendedUnits = Math.ceil(targetKVA / 2000);
      const unitTarget = targetKVA / recommendedUnits;
      unitRatingKVA =
        STANDARD_TRANSFORMER_KVA.find((r) => r >= unitTarget) || 2500;
      recommendedKVA = unitRatingKVA * recommendedUnits;
    }
  }

  const loadingPercent =
    recommendedKVA > 0 ? (plantMaximumDemandKVA / recommendedKVA) * 100 : 0;
  const spareCapacityKVA = Math.max(0, recommendedKVA - plantMaximumDemandKVA);

  // Full load current: I = (kVA * 1000) / (sqrt(3) * Vll)
  const fullLoadCurrentAmps =
    (recommendedKVA * 1000) / (Math.sqrt(3) * voltage.Vll);

  const recommendationNote =
    recommendedUnits === 1
      ? `1 x ${unitRatingKVA} kVA Cast Resin / Oil-Immersed Transformer (${loadingPercent.toFixed(1)}% operating load)`
      : `${recommendedUnits} x ${unitRatingKVA} kVA Transformers operated in parallel/dual-incomer setup`;

  return {
    recommendedKVA,
    standardRatings: STANDARD_TRANSFORMER_KVA,
    loadingPercent,
    spareCapacityKVA,
    recommendedUnits,
    unitRatingKVA,
    efficiencyAssumed: 0.985,
    fullLoadCurrentAmps,
    recommendationNote,
  };
}

/**
 * Step transformer size up or down to the next standard rating
 */
export function getStepTransformerSize(
  currentKVA: number,
  direction: 'UP' | 'DOWN'
): number | undefined {
  if (!currentKVA || currentKVA <= 0) {
    return direction === 'UP' ? STANDARD_TRANSFORMER_KVA[0] : undefined;
  }
  const list = STANDARD_TRANSFORMER_KVA;
  const idx = list.indexOf(currentKVA);
  if (idx !== -1) {
    if (direction === 'UP') {
      return idx < list.length - 1 ? list[idx + 1] : undefined;
    } else {
      return idx > 0 ? list[idx - 1] : undefined;
    }
  }
  if (direction === 'UP') {
    return list.find((r) => r > currentKVA);
  } else {
    const smaller = list.filter((r) => r < currentKVA);
    return smaller.length > 0 ? smaller[smaller.length - 1] : undefined;
  }
}

/**
 * Label helpers for Generator Sizing Scopes
 * Scope A: Fire Lift-Safety + Essential Load
 * Scope B: Fire Lift-Safety Load ONLY
 * Scope C: Essential Load ONLY
 * Scope D: 100% Full Plant Standby
 */
export function getGeneratorScopeLabel(scope?: GeneratorSizingScope): string {
  switch (scope) {
    case 'FIRE_LIFT_SAFETY_ONLY':
      return 'Fire Lift-Safety Load ONLY';
    case 'ESSENTIAL_ONLY':
      return 'Essential Load ONLY';
    case 'FULL_PLANT':
      return '100% Full Plant Standby';
    case 'FIRE_LIFT_SAFETY_AND_ESSENTIAL':
    case 'ESSENTIAL_LOADS_ONLY':
    default:
      return 'Fire Lift-Safety + Essential';
  }
}

export function getGeneratorScopeShortLabel(scope?: GeneratorSizingScope): string {
  switch (scope) {
    case 'FIRE_LIFT_SAFETY_ONLY':
      return 'Fire Lift-Safety ONLY';
    case 'ESSENTIAL_ONLY':
      return 'Essential Load ONLY';
    case 'FULL_PLANT':
      return '100% Full Plant';
    case 'FIRE_LIFT_SAFETY_AND_ESSENTIAL':
    case 'ESSENTIAL_LOADS_ONLY':
    default:
      return 'Fire Lift-Safety + Essential';
  }
}

/**
 * Sizing of Diesel Generator (Genset) for MSB
 * Sized across 4 distinct engineering scopes:
 * Scope A: Fire Lift-Safety + Essential Load
 * Scope B: Fire Lift-Safety Load ONLY
 * Scope C: Essential Load ONLY
 * Scope D: 100% Full Plant Standby
 */
export function sizeGenerator(
  fireLiftSafetyDemandKVA: number,
  fireLiftSafetyDemandKW: number,
  essentialOnlyDemandKVA: number,
  essentialOnlyDemandKW: number,
  totalPlantDemandKVA: number,
  totalPlantDemandKW: number,
  scope: GeneratorSizingScope = 'FIRE_LIFT_SAFETY_AND_ESSENTIAL',
  voltage: VoltageSystem,
  manualPrimeKVA?: number
): GeneratorSizingResult {
  const combinedEssentialKVA = fireLiftSafetyDemandKVA + essentialOnlyDemandKVA;
  const combinedEssentialKW = fireLiftSafetyDemandKW + essentialOnlyDemandKW;

  let basisKVA = combinedEssentialKVA;
  let basisKW = combinedEssentialKW;
  let scopeLabel = 'Scope A: Fire Lift-Safety + Essential Load';

  if (scope === 'FIRE_LIFT_SAFETY_ONLY') {
    basisKVA = fireLiftSafetyDemandKVA;
    basisKW = fireLiftSafetyDemandKW;
    scopeLabel = 'Scope B: Fire Lift-Safety Load ONLY';
  } else if (scope === 'ESSENTIAL_ONLY') {
    basisKVA = essentialOnlyDemandKVA;
    basisKW = essentialOnlyDemandKW;
    scopeLabel = 'Scope C: Essential Load ONLY';
  } else if (scope === 'FULL_PLANT') {
    basisKVA = totalPlantDemandKVA;
    basisKW = totalPlantDemandKW;
    scopeLabel = 'Scope D: 100% Full Plant Standby';
  } else {
    // 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' or legacy 'ESSENTIAL_LOADS_ONLY'
    basisKVA = combinedEssentialKVA;
    basisKW = combinedEssentialKW;
    scopeLabel = 'Scope A: Fire Lift-Safety + Essential Load';
  }

  // Add 25% safety margin for motor starting inrush & step loading
  const requiredPrimeKVA = basisKVA * 1.25;

  let recommendedPrimeKVA: number;
  if (manualPrimeKVA && manualPrimeKVA > 0) {
    recommendedPrimeKVA = manualPrimeKVA;
  } else {
    recommendedPrimeKVA =
      STANDARD_GENERATOR_KVA.find((r) => r >= requiredPrimeKVA) ||
      STANDARD_GENERATOR_KVA[STANDARD_GENERATOR_KVA.length - 1];
  }

  // Standby rating is typically 110% of prime rating
  const recommendedStandbyKVA = Math.round(recommendedPrimeKVA * 1.1);

  const loadingPercent =
    recommendedPrimeKVA > 0 ? (basisKVA / recommendedPrimeKVA) * 100 : 0;

  const fullLoadCurrentAmps =
    (recommendedPrimeKVA * 1000) / (Math.sqrt(3) * voltage.Vll);

  const note =
    scope === 'FULL_PLANT'
      ? `Full-plant backup generator (${totalPlantDemandKVA.toFixed(1)} kVA base demand)`
      : `Rated for ${basisKVA.toFixed(1)} kVA (${scopeLabel}) + 25% motor inrush headroom`;

  return {
    fireLiftSafetyDemandKW,
    fireLiftSafetyDemandKVA,
    essentialOnlyDemandKW,
    essentialOnlyDemandKVA,
    essentialDemandKW: combinedEssentialKW,
    essentialDemandKVA: combinedEssentialKVA,
    totalPlantDemandKW,
    totalPlantDemandKVA,
    recommendedPrimeKVA,
    recommendedStandbyKVA,
    loadingPercent,
    sizingBasis: scope,
    fullLoadCurrentAmps,
    recommendationNote: note,
  };
}

/**
 * Step generator size up or down to the next standard rating
 */
export function getStepGeneratorSize(
  currentKVA: number,
  direction: 'UP' | 'DOWN'
): number | undefined {
  if (!currentKVA || currentKVA <= 0) {
    return direction === 'UP' ? STANDARD_GENERATOR_KVA[0] : undefined;
  }
  const list = STANDARD_GENERATOR_KVA;
  const idx = list.indexOf(currentKVA);
  if (idx !== -1) {
    if (direction === 'UP') {
      return idx < list.length - 1 ? list[idx + 1] : undefined;
    } else {
      return idx > 0 ? list[idx - 1] : undefined;
    }
  }
  if (direction === 'UP') {
    return list.find((r) => r > currentKVA);
  } else {
    const smaller = list.filter((r) => r < currentKVA);
    return smaller.length > 0 ? smaller[smaller.length - 1] : undefined;
  }
}

// Standard geometric capacitor step sizes: 5, 10, 20, 40, 80, 160, 320, 640 kVAr
export const CAPACITOR_STEP_SIZES = [5, 10, 20, 40, 80, 160, 320, 640];

// Standard Breaker / MCCB ratings for capacitor bank stages & incomer
export const STANDARD_CAPACITOR_BREAKER_RATINGS = [
  15, 20, 25, 30, 40, 50, 60, 63, 75, 80, 100, 125, 150, 160, 200, 225, 250, 300, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200,
];

export function getStandardCapacitorBreaker(amps: number): number {
  const found = STANDARD_CAPACITOR_BREAKER_RATINGS.find((r) => r >= amps);
  return found || Math.ceil(amps / 100) * 100;
}

/**
 * Automatically configures APFC capacitor bank stages in geometric binary sequence
 * (5, 10, 20, 40, 80, 160, 320, 640 kVAr) to satisfy targetQRated within maxSteps.
 * Follows professional electrical panel building standards:
 * - Allocates fine stages (5, 10, 20) for low-load precision without hunting
 * - Allocates bulk stages (40, 80, 160, 320) for base reactive demand
 * - Maximizes utilization of available controller steps (e.g. 12 steps)
 * - Minimizes reactive power overshoot
 */
export function autoConfigureCapacitorSteps(
  targetQRated: number,
  maxSteps: number = 12
): { sizeKVAr: number; quantity: number }[] {
  if (targetQRated <= 0 || maxSteps <= 0) {
    return CAPACITOR_STEP_SIZES.map((size) => ({ sizeKVAr: size, quantity: 0 }));
  }

  // Filter sizes appropriate for the target load
  const activeSizes = CAPACITOR_STEP_SIZES.filter(
    (s) => s <= Math.max(80, targetQRated * 0.9)
  );
  if (activeSizes.length === 0) activeSizes.push(5);

  let bestCounts: number[] = new Array(activeSizes.length).fill(0);
  let bestScore = Infinity;

  function recurse(
    index: number,
    remainingSteps: number,
    currentKVAr: number,
    counts: number[]
  ) {
    if (index === activeSizes.length - 1) {
      const s = activeSizes[index];
      const needed = Math.max(0, targetQRated - currentKVAr);
      const minC = Math.max(0, Math.min(remainingSteps, Math.floor(needed / s)));
      const maxC = Math.min(remainingSteps, Math.ceil(needed / s) + 1);

      for (let c = minC; c <= maxC; c++) {
        counts[index] = c;
        const totalKVAr = currentKVAr + c * s;
        const totalSteps = maxSteps - remainingSteps + c;

        let score = 0;
        if (totalKVAr < targetQRated) {
          // Strong penalty for failing to meet target reactive power
          score += (targetQRated - totalKVAr) * 10000;
        } else {
          // Minimal overshoot preferred
          score += (totalKVAr - targetQRated) * 5;
        }

        // Prefer utilizing available steps for fine-grain regulation
        score += (maxSteps - totalSteps) * 20;

        // Moderate penalty for excessive count of any single size (> 3)
        for (let i = 0; i < counts.length; i++) {
          if (counts[i] > 3) score += (counts[i] - 3) * 40;
          if (counts[i] > 5) score += (counts[i] - 5) * 150;
        }

        // Resolution bonus: encourage at least one fine step for fine-tuning
        if (counts[0] >= 1) score -= 25;
        if (counts[1] >= 1) score -= 15;

        // Geometric ladder diversity bonus
        const distinct = counts.filter((x) => x > 0).length;
        score -= distinct * 10;

        if (score < bestScore) {
          bestScore = score;
          bestCounts = [...counts];
        }
      }
      return;
    }

    const s = activeSizes[index];
    const maxCount = Math.min(remainingSteps, 4);
    for (let c = 0; c <= maxCount; c++) {
      counts[index] = c;
      recurse(index + 1, remainingSteps - c, currentKVAr + c * s, counts);
    }
  }

  const tempCounts = new Array(activeSizes.length).fill(0);
  recurse(0, maxSteps, 0, tempCounts);

  return CAPACITOR_STEP_SIZES.map((size) => {
    const idx = activeSizes.indexOf(size);
    return {
      sizeKVAr: size,
      quantity: idx >= 0 ? bestCounts[idx] || 0 : 0,
    };
  });
}

/**
 * Sizing of Power Factor Correction (PFC) Capacitor Bank
 * IEC / BS Sizing Methodology:
 * 1. Base reactive power required at Vsupply:
 *    cos θ1 = Initial PF, cos θ2 = Target PF
 *    Q_required (Vsupply) = P (kW) * [tan(θ1) - tan(θ2)]
 * 2. Voltage de-rating compensation:
 *    Ratio = (Vsupply / Vrated)^2
 *    Required Q (Vrated) = Q_required (Vsupply) * (Vrated / Vsupply)^2
 * 3. Step configuration:
 *    Automated distribution across geometric sizes 5, 10, 20, 40, 80, 160, 320, 640 kVAr
 * 4. Current rating per step and main switchboard incomer:
 *    Safety Factor F = 1.5 (IEC 60831 standard for overvoltage, inrush, and harmonic currents)
 *    Icap_step = (Vsupply / Vrated)^2 * [Q_step / (√3 * Vsupply)] * 1.5
 *    Icap_main = (Vsupply / Vrated)^2 * [Q_total_rated / (√3 * Vsupply)] * 1.5
 */
export function sizeCapacitorBank(
  activePowerKW: number,
  initialPF: number = 0.80,
  targetPF: number = 0.99,
  vSupply: number = 420,
  vRated: number = 525,
  stepsCount: number = 12,
  customSteps?: { sizeKVAr: number; quantity: number }[]
): CapacitorBankResult {
  const pf1 = Math.max(0.5, Math.min(0.999, initialPF || 0.80));
  const pf2 = Math.max(pf1, Math.min(1.0, targetPF || 0.99));
  const vSup = Math.max(100, vSupply || 420);
  const vRat = Math.max(100, vRated || 525);
  const maxSteps = Math.max(1, Math.min(32, stepsCount || 12));

  // Angles θ1 and θ2
  const theta1Rad = Math.acos(pf1);
  const theta2Rad = Math.acos(pf2);
  const theta1Deg = (theta1Rad * 180) / Math.PI;
  const theta2Deg = (theta2Rad * 180) / Math.PI;

  const tanTheta1 = Math.tan(theta1Rad);
  const tanTheta2 = Math.tan(theta2Rad);

  // Required Q at Vsupply: Q (Vsupply) = P * (tan θ1 - tan θ2)
  const requiredKVArSupply = Math.max(0, activePowerKW * (tanTheta1 - tanTheta2));

  // Voltage ratio and de-rating factor: Ratio = (Vsupply / Vrated)^2
  const vRatio = vSup / vRat;
  const ratio = (vSup / vRat) * (vSup / vRat);

  // Required Q at Vrated: Q (Vrated) = Q (Vsupply) * (Vrated / Vsupply)^2
  const requiredKVArRated = ratio > 0 ? requiredKVArSupply / ratio : requiredKVArSupply;

  // Configure steps (either from customSteps or autoConfigureCapacitorSteps)
  let stepAllocations: { sizeKVAr: number; quantity: number }[];
  if (customSteps && customSteps.length > 0) {
    stepAllocations = customSteps;
  } else {
    stepAllocations = autoConfigureCapacitorSteps(requiredKVArRated, maxSteps);
  }

  // Safety Factor F = 1.5 (IEC 60831 standard for harmonics, tolerance & inrush)
  const safetyFactor = 1.5;

  // Build individual CapacitorBankStep records
  const steps: CapacitorBankStep[] = stepAllocations.map((item) => {
    const q = item.sizeKVAr;
    const qty = Math.max(0, item.quantity);
    const totalKVArRated = qty * q;
    const effectiveKVArSupply = totalKVArRated * ratio;
    // Current per step: Icap = (Vsupply / Vrated)^2 * (Q * 1000 / (sqrt(3) * Vsupply)) * 1.5
    const operatingCurrentAmps =
      ratio * ((q * 1000) / (Math.sqrt(3) * vSup)) * safetyFactor;
    const proposedMCCBRating = getStandardCapacitorBreaker(operatingCurrentAmps);

    return {
      sizeKVAr: q,
      quantity: qty,
      totalKVArRated,
      effectiveKVArSupply,
      operatingCurrentAmps,
      proposedMCCBRating,
    };
  });

  const totalConfiguredKVArRated = steps.reduce((sum, s) => sum + s.totalKVArRated, 0);
  const totalConfiguredKVArSupply = steps.reduce((sum, s) => sum + s.effectiveKVArSupply, 0);
  const totalConfiguredSteps = steps.reduce((sum, s) => sum + s.quantity, 0);

  // Main Capacitor Bank Incomer Current & Breaker
  // Icap_main = (Vsupply / Vrated)^2 * (Q_total_rated * 1000 / (sqrt(3) * Vsupply)) * 1.5
  const mainIncomerCurrentAmps =
    ratio * ((totalConfiguredKVArRated * 1000) / (Math.sqrt(3) * vSup)) * safetyFactor;
  const mainIncomerBreakerRating = getStandardCapacitorBreaker(mainIncomerCurrentAmps);

  // Descriptive summary e.g. "12 steps: 2×5k, 1×10k, 1×20k, 2×40k, 3×80k, 1×160k, 2×320k"
  const activeStepsList = steps
    .filter((s) => s.quantity > 0)
    .map((s) => `${s.quantity}×${s.sizeKVAr}k`);
  const recommendedSteps =
    activeStepsList.length > 0
      ? `${totalConfiguredSteps} steps: ${activeStepsList.join(', ')}`
      : '0 steps configured';

  return {
    vRated: vRat,
    vSupply: vSup,
    stepsCount: maxSteps,
    vRatio,
    ratio,
    safetyFactor,
    initialPowerFactor: pf1,
    targetPowerFactor: pf2,
    theta1Rad,
    theta1Deg,
    theta2Rad,
    theta2Deg,
    activePowerKW,
    requiredKVArSupply,
    requiredKVArRated,
    requiredKVAr: requiredKVArRated,
    recommendedBankKVAr: totalConfiguredKVArRated,
    totalConfiguredKVArRated,
    totalConfiguredKVArSupply,
    totalConfiguredSteps,
    mainIncomerCurrentAmps,
    mainIncomerBreakerRating,
    steps,
    recommendedSteps,
    detunedReactorRecommendation: '7% Detuned Harmonic Filter (189Hz anti-resonance for 5th harmonic)',
    paybackNote: `Avoids low power factor penalties and frees up ~${(totalConfiguredKVArSupply * 0.7).toFixed(0)} kVA transformer capacity`,
  };
}

/**
 * Recalculate Main Switch Board (MSB)
 * MSB Level: Sum Sub-DB Maximum Demands + Add Direct Major Equipment -> Apply overall building diversity -> Get Total Plant Maximum Demand
 * Then sizes: Main Incomer Breaker, Transformers, Generators, Capacitor Banks!
 */
export function recalculateMSB(
  msb: MainSwitchBoard,
  subDbs: SubDistributionBoard[],
  directLoads: MsbDirectLoad[],
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[],
  directDbs: DistributionBoard[] = []
): MainSwitchBoard {
  // Sum Sub-DB Maximum Demands
  const subDbsDemandKW = subDbs.reduce((sum, sb) => sum + sb.maximumDemandKW, 0);
  const subDbsDemandKVA = subDbs.reduce((sum, sb) => sum + sb.maximumDemandKVA, 0);

  // Sum Direct DB Maximum Demands (Final DBs fed directly from MSB)
  const directDbsDemandKW = directDbs.reduce((sum, db) => sum + db.maximumDemandKW, 0);
  const directDbsDemandKVA = directDbs.reduce((sum, db) => sum + db.maximumDemandKVA, 0);

  // Total upstream Feeders Demand (Sub-DBs + Directly-fed DBs)
  const summedSubDbDemandKW = subDbsDemandKW + directDbsDemandKW;
  const summedSubDbDemandKVA = subDbsDemandKVA + directDbsDemandKVA;

  // Recalculate Direct Loads
  const updatedDirectLoads = directLoads.map((load) => {
    const totalWatts = Math.max(0, load.unitWatts * Math.max(0, load.quantity ?? 0));
    const connectedLoadKW = totalWatts / 1000;
    const rawPf = load.powerFactor !== undefined && !isNaN(load.powerFactor) ? load.powerFactor : 0.85;
    const effectivePf = rawPf <= 0 ? 0.001 : Math.min(1.0, rawPf);
    const connectedLoadKVA = connectedLoadKW === 0 ? 0 : connectedLoadKW / effectivePf;
    const rawDf = load.diversityFactor !== undefined && !isNaN(load.diversityFactor) ? load.diversityFactor : 1.0;
    const df = Math.max(0, Math.min(1.0, rawDf));
    const maximumDemandKW = connectedLoadKW * df;
    const maximumDemandKVA = connectedLoadKVA * df;
    const currentIb = (maximumDemandKVA * 1000) / (Math.sqrt(3) * voltage.Vll);
    const recommendedBreaker = sizeBreakerWithSchedule(currentIb, true, undefined, 'SUBDB_INCOMER', schedule);
    const recommendedCable = sizeCableWithSchedule(currentIb, true, schedule, recommendedBreaker.rating);

    return {
      ...load,
      connectedLoadKW,
      connectedLoadKVA,
      maximumDemandKW,
      maximumDemandKVA,
      currentIb,
      recommendedBreaker,
      recommendedCable,
    };
  });

  const summedMajorLoadsDemandKW = updatedDirectLoads.reduce((sum, l) => sum + l.maximumDemandKW, 0);
  const summedMajorLoadsDemandKVA = updatedDirectLoads.reduce((sum, l) => sum + l.maximumDemandKVA, 0);

  // Generator Sizing Feeder Breakdowns:
  // Scope A: Fire Lift-Safety + Essential Load
  // Scope B: Fire Lift-Safety Load ONLY
  // Scope C: Essential Load ONLY
  // Scope D: 100% Full Plant Standby
  const fireLiftSafetyFeedersKW =
    subDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0) +
    directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);

  const fireLiftSafetyFeedersKVA =
    subDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0) +
    directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);

  const fireLiftSafetyMajorKW = updatedDirectLoads
    .filter((l) => l.isEssential && (l.equipmentType === 'FIRE_PUMP' || l.equipmentType === 'ELEVATOR'))
    .reduce((sum, l) => sum + l.maximumDemandKW, 0);

  const fireLiftSafetyMajorKVA = updatedDirectLoads
    .filter((l) => l.isEssential && (l.equipmentType === 'FIRE_PUMP' || l.equipmentType === 'ELEVATOR'))
    .reduce((sum, l) => sum + l.maximumDemandKVA, 0);

  const essentialOnlyFeedersKW =
    subDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0) +
    directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);

  const essentialOnlyFeedersKVA =
    subDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0) +
    directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);

  const essentialOnlyMajorKW = updatedDirectLoads
    .filter((l) => l.isEssential && l.equipmentType !== 'FIRE_PUMP' && l.equipmentType !== 'ELEVATOR')
    .reduce((sum, l) => sum + l.maximumDemandKW, 0);

  const essentialOnlyMajorKVA = updatedDirectLoads
    .filter((l) => l.isEssential && l.equipmentType !== 'FIRE_PUMP' && l.equipmentType !== 'ELEVATOR')
    .reduce((sum, l) => sum + l.maximumDemandKVA, 0);

  const hasExplicitFeederConfig =
    subDbs.some((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY' || sb.essentialGenset === 'ESSENTIAL') ||
    directDbs.some((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY' || db.essentialGenset === 'ESSENTIAL');

  // If specific feeders have Genset classification configured, use exact sums.
  // Otherwise fall back to realistic allocation heuristics (20% for Fire/Lift, 15% for Essential).
  const fireLiftSafetyDemandKW = hasExplicitFeederConfig
    ? fireLiftSafetyFeedersKW + fireLiftSafetyMajorKW
    : fireLiftSafetyMajorKW + (summedSubDbDemandKW * 0.20);

  const fireLiftSafetyDemandKVA = hasExplicitFeederConfig
    ? fireLiftSafetyFeedersKVA + fireLiftSafetyMajorKVA
    : fireLiftSafetyMajorKVA + (summedSubDbDemandKVA * 0.20);

  const essentialOnlyDemandKW = hasExplicitFeederConfig
    ? essentialOnlyFeedersKW + essentialOnlyMajorKW
    : essentialOnlyMajorKW + (summedSubDbDemandKW * 0.15);

  const essentialOnlyDemandKVA = hasExplicitFeederConfig
    ? essentialOnlyFeedersKVA + essentialOnlyMajorKVA
    : essentialOnlyMajorKVA + (summedSubDbDemandKVA * 0.15);

  // Apply MSB Overall Building Diversity Factor (default 0.80 / 80%)
  const buildingDF = Math.max(0.1, Math.min(1.0, msb.overallBuildingDiversityFactor ?? 0.8));
  const rawDemandKW = summedSubDbDemandKW + summedMajorLoadsDemandKW;
  const rawDemandKVA = summedSubDbDemandKVA + summedMajorLoadsDemandKVA;

  const totalPlantMaximumDemandKW = rawDemandKW * buildingDF;
  const totalPlantMaximumDemandKVA = rawDemandKVA * buildingDF;

  // Total Plant Current at MSB Busbar: I = (kVA * 1000) / (sqrt(3) * Vll)
  const totalPlantCurrentAmps = (totalPlantMaximumDemandKVA * 1000) / (Math.sqrt(3) * voltage.Vll);

  const phaseBalance = calculateMsbPhaseBalance(
    subDbs,
    directDbs,
    updatedDirectLoads,
    voltage,
    buildingDF
  );

  const maxPhaseAmps = Math.max(
    phaseBalance.phaseR.currentAmps,
    phaseBalance.phaseY.currentAmps,
    phaseBalance.phaseB.currentAmps
  );
  // Sized on the higher of balanced plant current or peak phase current to represent true operational Ib
  const incomerCurrentAmps = Math.max(totalPlantCurrentAmps, maxPhaseAmps);

  // Automatic Sizing recommendations
  // Breaker capacity & Transformer capacity sized with TX Utilization: Required Breaker >= I_plant / TX_Utilization
  const rawMsbUtilization = msb.txUtilizationPercent !== undefined
    ? msb.txUtilizationPercent
    : (msb.utilizationPercent !== undefined
        ? msb.utilizationPercent
        : (msb.safetyMarginPercent !== undefined
            ? (msb.safetyMarginPercent >= 40 ? msb.safetyMarginPercent : 100 - msb.safetyMarginPercent)
            : 80));
  const txUtilizationPercent = Math.max(10, Math.min(100, rawMsbUtilization));
  const txUtilizationDecimal = txUtilizationPercent / 100;
  const requiredMsbBreakerCapacity = incomerCurrentAmps / txUtilizationDecimal;

  const manualMsbRating = msb.manualMainIncomerBreakerRating ?? msb.manualIncomerBreakerRating;

  const mainIncomerBreaker = sizeBreakerWithSchedule(
    manualMsbRating ?? requiredMsbBreakerCapacity,
    true,
    undefined,
    'MSB_INCOMER',
    schedule,
    manualMsbRating
  );

  const transformerSizing = sizeTransformer(
    totalPlantMaximumDemandKVA,
    txUtilizationPercent,
    voltage,
    msb.manualTransformerKVA
  );

  const generatorSizing = sizeGenerator(
    fireLiftSafetyDemandKVA,
    fireLiftSafetyDemandKW,
    essentialOnlyDemandKVA,
    essentialOnlyDemandKW,
    totalPlantMaximumDemandKVA,
    totalPlantMaximumDemandKW,
    msb.generatorSizingScope || 'FIRE_LIFT_SAFETY_AND_ESSENTIAL',
    voltage,
    msb.manualGeneratorKVA
  );

  // Power factor parameters for capacitor bank sizing
  const calculatedPlantPF =
    totalPlantMaximumDemandKVA > 0
      ? totalPlantMaximumDemandKW / totalPlantMaximumDemandKVA
      : 0.80;

  const initialPF =
    msb.initialPowerFactor !== undefined
      ? msb.initialPowerFactor
      : (calculatedPlantPF < 0.95 ? calculatedPlantPF : 0.80);
  const targetPF = msb.targetPowerFactor || 0.99;
  const vSupply = msb.vSupply !== undefined ? msb.vSupply : (voltage.Vll || 420);
  const vRated = msb.vRated !== undefined ? msb.vRated : 525;
  const stepsCount = msb.capacitorStepsCount !== undefined ? msb.capacitorStepsCount : 12;

  const capacitorBankSizing = sizeCapacitorBank(
    totalPlantMaximumDemandKW,
    initialPF,
    targetPF,
    vSupply,
    vRated,
    stepsCount,
    msb.customCapacitorSteps
  );

  // Busbar Sizing and Thermal Withstand (IEC 61439-1/2, BS EN 61439, IEC 60865)
  const busbarSizing = calculateBusbarSizing({
    material: msb.busbarMaterial,
    currentDensityJ: msb.busbarCurrentDensity,
    designCurrentId: msb.busbarDesignCurrentId,
    breakerRating: mainIncomerBreaker?.rating,
    totalPlantCurrentAmps: incomerCurrentAmps,
    shortCircuitCurrentIcwKA: msb.busbarIcwKA,
    faultDurationSec: msb.busbarFaultDuration,
    materialConstantK: msb.busbarMaterialConstantK,
    selectedWidth: msb.busbarSelectedWidth,
    selectedThickness: msb.busbarSelectedThickness,
    selectedRuns: msb.busbarSelectedRuns,
    manualOverride: msb.busbarManualOverride,
  });

  // Total connected load (Sub-DBs + direct DBs + direct major loads)
  const directDbsConnectedKW = directDbs.reduce((sum, db) => sum + db.connectedLoadKW, 0);
  const directDbsConnectedKVA = directDbs.reduce((sum, db) => sum + db.connectedLoadKVA, 0);

  const totalConnectedKW =
    subDbs.reduce((sum, sb) => sum + sb.connectedLoadKW, 0) +
    directDbsConnectedKW +
    updatedDirectLoads.reduce((sum, l) => sum + l.connectedLoadKW, 0);
  const totalConnectedKVA =
    subDbs.reduce((sum, sb) => sum + sb.connectedLoadKVA, 0) +
    directDbsConnectedKVA +
    updatedDirectLoads.reduce((sum, l) => sum + l.connectedLoadKVA, 0);

  return {
    ...msb,
    txUtilizationPercent,
    utilizationPercent: txUtilizationPercent,
    safetyMarginPercent: txUtilizationPercent,
    manualMainIncomerBreakerRating: manualMsbRating,
    manualIncomerBreakerRating: manualMsbRating,
    manualTransformerKVA: msb.manualTransformerKVA,
    manualGeneratorKVA: msb.manualGeneratorKVA,
    busbarMaterial: busbarSizing.material,
    busbarCurrentDensity: busbarSizing.currentDensityJ,
    busbarDesignCurrentId: msb.busbarDesignCurrentId,
    busbarIcwKA: busbarSizing.shortCircuitCurrentIcwKA,
    busbarFaultDuration: busbarSizing.faultDurationSec,
    busbarMaterialConstantK: busbarSizing.materialConstantK,
    busbarSelectedWidth: busbarSizing.width,
    busbarSelectedThickness: busbarSizing.thickness,
    busbarSelectedRuns: busbarSizing.runsPerPhase,
    busbarManualOverride: msb.busbarManualOverride,
    busbarSizing,
    vRated,
    vSupply,
    capacitorStepsCount: stepsCount,
    initialPowerFactor: initialPF,
    customCapacitorSteps: msb.customCapacitorSteps,
    connectedLoadKW: totalConnectedKW,
    connectedLoadKVA: totalConnectedKVA,
    summedSubDbDemandKW,
    summedSubDbDemandKVA,
    summedMajorLoadsDemandKW,
    summedMajorLoadsDemandKVA,
    essentialLoadsDemandKW: generatorSizing.essentialDemandKW,
    essentialLoadsDemandKVA: generatorSizing.essentialDemandKVA,
    totalPlantMaximumDemandKW,
    totalPlantMaximumDemandKVA,
    totalPlantCurrentAmps,
    incomerCurrentAmps,
    phaseBalance,
    mainIncomerBreaker,
    transformerSizing,
    generatorSizing,
    capacitorBankSizing,
  };
}

/**
 * Calculate Phase Balance and Unbalance % for the Main Switch Board (MSB)
 * Aggregates phase loads across all connected Sub-DBs, direct DBs, and direct major loads
 * multiplied by overall building diversity factor
 */
export function calculateMsbPhaseBalance(
  subDbs: SubDistributionBoard[],
  directDbs: DistributionBoard[],
  directLoads: MsbDirectLoad[],
  voltage: VoltageSystem,
  buildingDF: number = 1.0
): DBPhaseBalance {
  const phaseR: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseY: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };
  const phaseB: PhaseLoadSummary = { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 };

  const validBuildingDF = Math.max(0.001, Math.min(1.0, buildingDF !== undefined && !isNaN(buildingDF) ? buildingDF : 1.0));

  // 1. From Sub-DBs (which already have DB boardDF and Sub-DB groupDF applied to demand)
  for (const sb of subDbs) {
    if (!sb.phaseBalance) continue;
    phaseR.connectedKW += sb.phaseBalance.phaseR.connectedKW;
    phaseR.connectedKVA += sb.phaseBalance.phaseR.connectedKVA;
    phaseR.demandKW += sb.phaseBalance.phaseR.demandKW * validBuildingDF;
    phaseR.demandKVA += sb.phaseBalance.phaseR.demandKVA * validBuildingDF;

    phaseY.connectedKW += sb.phaseBalance.phaseY.connectedKW;
    phaseY.connectedKVA += sb.phaseBalance.phaseY.connectedKVA;
    phaseY.demandKW += sb.phaseBalance.phaseY.demandKW * validBuildingDF;
    phaseY.demandKVA += sb.phaseBalance.phaseY.demandKVA * validBuildingDF;

    phaseB.connectedKW += sb.phaseBalance.phaseB.connectedKW;
    phaseB.connectedKVA += sb.phaseBalance.phaseB.connectedKVA;
    phaseB.demandKW += sb.phaseBalance.phaseB.demandKW * validBuildingDF;
    phaseB.demandKVA += sb.phaseBalance.phaseB.demandKVA * validBuildingDF;
  }

  // 2. From Direct DBs (which already have DB boardDF applied to demand)
  for (const db of directDbs) {
    if (!db.phaseBalance) continue;
    phaseR.connectedKW += db.phaseBalance.phaseR.connectedKW;
    phaseR.connectedKVA += db.phaseBalance.phaseR.connectedKVA;
    phaseR.demandKW += db.phaseBalance.phaseR.demandKW * validBuildingDF;
    phaseR.demandKVA += db.phaseBalance.phaseR.demandKVA * validBuildingDF;

    phaseY.connectedKW += db.phaseBalance.phaseY.connectedKW;
    phaseY.connectedKVA += db.phaseBalance.phaseY.connectedKVA;
    phaseY.demandKW += db.phaseBalance.phaseY.demandKW * validBuildingDF;
    phaseY.demandKVA += db.phaseBalance.phaseY.demandKVA * validBuildingDF;

    phaseB.connectedKW += db.phaseBalance.phaseB.connectedKW;
    phaseB.connectedKVA += db.phaseBalance.phaseB.connectedKVA;
    phaseB.demandKW += db.phaseBalance.phaseB.demandKW * validBuildingDF;
    phaseB.demandKVA += db.phaseBalance.phaseB.demandKVA * validBuildingDF;
  }

  // 3. From Direct Major Equipment (symmetrical 3P)
  for (const load of directLoads) {
    const clKwEach = (load.connectedLoadKW || 0) / 3;
    const clKvaEach = (load.connectedLoadKVA || 0) / 3;
    const mdKwEach = ((load.maximumDemandKW || 0) * validBuildingDF) / 3;
    const mdKvaEach = ((load.maximumDemandKVA || 0) * validBuildingDF) / 3;

    phaseR.connectedKW += clKwEach;
    phaseR.connectedKVA += clKvaEach;
    phaseR.demandKW += mdKwEach;
    phaseR.demandKVA += mdKvaEach;

    phaseY.connectedKW += clKwEach;
    phaseY.connectedKVA += clKvaEach;
    phaseY.demandKW += mdKwEach;
    phaseY.demandKVA += mdKvaEach;

    phaseB.connectedKW += clKwEach;
    phaseB.connectedKVA += clKvaEach;
    phaseB.demandKW += mdKwEach;
    phaseB.demandKVA += mdKvaEach;
  }

  // Calculate current per phase in Amperes:
  const phaseVoltage = voltage.Vll ? voltage.Vll / Math.sqrt(3) : (voltage.Vln || 230);
  phaseR.currentAmps = phaseVoltage > 0 ? (phaseR.demandKVA * 1000) / phaseVoltage : 0;
  phaseY.currentAmps = phaseVoltage > 0 ? (phaseY.demandKVA * 1000) / phaseVoltage : 0;
  phaseB.currentAmps = phaseVoltage > 0 ? (phaseB.demandKVA * 1000) / phaseVoltage : 0;

  const currents = [phaseR.currentAmps, phaseY.currentAmps, phaseB.currentAmps];
  const maxI = Math.max(...currents);
  const minI = Math.min(...currents);
  const avgI = (phaseR.currentAmps + phaseY.currentAmps + phaseB.currentAmps) / 3;

  let unbalancePercent = 0;
  if (avgI > 0) {
    unbalancePercent = ((maxI - minI) / avgI) * 100;
  }

  const ir = phaseR.currentAmps;
  const iy = phaseY.currentAmps;
  const ib = phaseB.currentAmps;
  const neutralTerm = ir * ir + iy * iy + ib * ib - (ir * iy + iy * ib + ib * ir);
  const neutralCurrentAmps = neutralTerm > 0 ? Math.sqrt(neutralTerm) : 0;

  let status: 'OPTIMAL' | 'ACCEPTABLE' | 'POOR' = 'OPTIMAL';
  if (unbalancePercent > 20) {
    status = 'POOR';
  } else if (unbalancePercent > 10) {
    status = 'ACCEPTABLE';
  }

  return {
    phaseR,
    phaseY,
    phaseB,
    neutralCurrentAmps,
    unbalancePercent,
    status,
  };
}

/**
 * Auto-Balance across all downstream Sub-DBs and DBs connected to the target MSB (or all MSBs)
 * Independently staggers Sub-DBs and direct DBs to achieve global phase balance at the MSB level.
 */
/**
 * Auto-Balance across all downstream Sub-DBs and DBs connected to the target MSB (or all MSBs).
 *
 * Strict Bottom-Up Hierarchy:
 * 1. First Priority (Highest): Balance each individual downstream DB locally to ensure
 *    its own internal phases (R, Y, B) are as evenly distributed as possible.
 * 2. Second Priority: Balance the Sub-DB level using staggered distribution among its connected
 *    downstream DBs.
 * 3. Final Priority (Lowest): Achieve the overall balance at the MSB level only after ensuring that
 *    individual DB and Sub-DB internal phase health is fully protected and not compromised.
 *    Optimizing the MSB utilizes feeder phase rotation and 1P bus distribution, ensuring zero
 *    degradation to downstream DB phase health.
 */
export function autoBalanceMsbDownstream(
  allDbs: DistributionBoard[],
  subDbs: SubDistributionBoard[],
  voltage: VoltageSystem,
  priorityOrder?: ('R' | 'Y' | 'B')[],
  schedule?: CableScheduleEntry[],
  targetMsbId?: string,
  cableDefinitions?: CableDefinitionEntry[],
  cycleIndex?: number,
  directLoads: MsbDirectLoad[] = [],
  buildingDF: number = 1.0
): DistributionBoard[] {
  let updatedDbs = [...allDbs];
  const targetSubDbs = targetMsbId
    ? subDbs.filter((sb) => sb.msbId === targetMsbId)
    : subDbs;

  const cycleOffset =
    cycleIndex !== undefined
      ? cycleIndex
      : priorityOrder
      ? priorityOrder[0] === 'Y'
        ? 0
        : priorityOrder[0] === 'B'
        ? 1
        : 2
      : 0;

  const validBuildingDF = Math.max(0.001, Math.min(1.0, buildingDF !== undefined && !isNaN(buildingDF) ? buildingDF : 1.0));

  // STEP 1: (FIRST PRIORITY - HIGHEST)
  // Balance each individual downstream DB locally to ensure its own internal phases (R, Y, B)
  // are as evenly distributed as possible.
  updatedDbs = updatedDbs.map((db) => {
    if (!db.isThreePhase) return db;
    if (targetMsbId) {
      const isDirect =
        db.subDbId === targetMsbId ||
        db.subDbId === 'MSB' ||
        db.subDbId === 'msb';
      const isUnderTargetSub = targetSubDbs.some((s) => s.id === db.subDbId);
      if (!isDirect && !isUnderTargetSub) return db;
    }
    return autoBalanceDBPhases(db, voltage, priorityOrder || ['Y', 'B', 'R'], schedule, cableDefinitions);
  });

  // STEP 2: (SECOND PRIORITY)
  // Balance each Sub-DB level using staggered distribution among its connected downstream DBs.
  for (let sbIdx = 0; sbIdx < targetSubDbs.length; sbIdx++) {
    const sb = targetSubDbs[sbIdx];
    updatedDbs = autoBalanceSubDBDownstreamDBs(
      sb.id,
      updatedDbs,
      voltage,
      undefined,
      schedule,
      cableDefinitions,
      (sbIdx + cycleOffset) % 3
    );
  }

  // STEP 3: (FINAL PRIORITY - LOWEST)
  // Achieve overall balance at the MSB level only after ensuring that individual DB and Sub-DB
  // internal phase health is fully protected and not compromised.

  // Direct DBs fed directly from target MSB
  const directDbs = updatedDbs.filter((db) => {
    if (targetMsbId) {
      return (
        db.subDbId === targetMsbId ||
        db.subDbId === 'MSB' ||
        db.subDbId === 'msb'
      );
    }
    return db.subDbId === 'MSB' || db.subDbId === 'msb';
  });

  // Balance direct DBs among themselves using staggered distribution
  if (directDbs.length > 0) {
    const directGroupSubDbId = directDbs[0].subDbId;
    updatedDbs = autoBalanceSubDBDownstreamDBs(
      directGroupSubDbId,
      updatedDbs,
      voltage,
      undefined,
      schedule,
      cableDefinitions,
      (targetSubDbs.length + cycleOffset) % 3
    );
  }

  // Calculate MSB aggregate loads starting with symmetrical direct loads
  const msbLoadKVA = { R: 0, Y: 0, B: 0 };
  for (const dl of directLoads) {
    const each = ((dl.maximumDemandKVA || 0) * validBuildingDF) / 3;
    msbLoadKVA.R += each;
    msbLoadKVA.Y += each;
    msbLoadKVA.B += each;
  }

  const getSubDbDemandKvaByPhase = (subDb: SubDistributionBoard) => {
    const linked = updatedDbs.filter((d) => d.subDbId === subDb.id);
    const groupDF = Math.max(0.1, Math.min(1.0, subDb.groupDiversityFactor ?? 0.9));
    const bal = calculateSubDBPhaseBalance(linked, voltage, groupDF);
    return {
      R: bal.phaseR.demandKVA * validBuildingDF,
      Y: bal.phaseY.demandKVA * validBuildingDF,
      B: bal.phaseB.demandKVA * validBuildingDF,
    };
  };

  // Optimize Sub-DB feeder alignment to MSB via whole-board phase rotation:
  // Rotating all DBs under a Sub-DB together preserves 100% of every DB's internal balance
  // AND 100% of the Sub-DB's internal balance, while rotating its presentation to the MSB.
  for (let sIdx = 0; sIdx < targetSubDbs.length; sIdx++) {
    const sb = targetSubDbs[sIdx];
    const linked = updatedDbs.filter((d) => d.subDbId === sb.id);
    if (linked.length === 0) continue;

    const baseLoads = getSubDbDemandKvaByPhase(sb);
    let bestShift = 0;
    let minMsbSpread = Infinity;

    for (const shift of [0, 1, 2]) {
      const rotatedContrib = {
        R: shift === 0 ? baseLoads.R : shift === 1 ? baseLoads.B : baseLoads.Y,
        Y: shift === 0 ? baseLoads.Y : shift === 1 ? baseLoads.R : baseLoads.B,
        B: shift === 0 ? baseLoads.B : shift === 1 ? baseLoads.Y : baseLoads.R,
      };

      const trialMsb = {
        R: msbLoadKVA.R + rotatedContrib.R,
        Y: msbLoadKVA.Y + rotatedContrib.Y,
        B: msbLoadKVA.B + rotatedContrib.B,
      };

      const spread = Math.max(trialMsb.R, trialMsb.Y, trialMsb.B) -
                     Math.min(trialMsb.R, trialMsb.Y, trialMsb.B);

      const prefBonus = ((shift + cycleOffset) % 3) * 0.001;
      const score = spread + prefBonus;

      if (score < minMsbSpread) {
        minMsbSpread = score;
        bestShift = shift;
      }
    }

    if (bestShift !== 0) {
      updatedDbs = updatedDbs.map((db) => {
        if (db.subDbId !== sb.id) return db;
        return rotateDB(db, bestShift, voltage, schedule, cableDefinitions);
      });
    }

    const finalLoads = getSubDbDemandKvaByPhase(sb);
    msbLoadKVA.R += finalLoads.R;
    msbLoadKVA.Y += finalLoads.Y;
    msbLoadKVA.B += finalLoads.B;
  }

  // Refine direct DBs at MSB
  const updatedDirectDbs = updatedDbs.filter((db) => {
    if (targetMsbId) {
      return (
        db.subDbId === targetMsbId ||
        db.subDbId === 'MSB' ||
        db.subDbId === 'msb'
      );
    }
    return db.subDbId === 'MSB' || db.subDbId === 'msb';
  });

  // Rotate direct 3-phase DBs to minimize MSB spread
  const direct3PDbs = updatedDirectDbs.filter((d) => d.isThreePhase);
  for (const db of direct3PDbs) {
    const curR = (db.phaseBalance?.phaseR.demandKVA || 0) * validBuildingDF;
    const curY = (db.phaseBalance?.phaseY.demandKVA || 0) * validBuildingDF;
    const curB = (db.phaseBalance?.phaseB.demandKVA || 0) * validBuildingDF;

    let bestShift = 0;
    let minMsbSpread = Math.max(msbLoadKVA.R + curR, msbLoadKVA.Y + curY, msbLoadKVA.B + curB) -
                       Math.min(msbLoadKVA.R + curR, msbLoadKVA.Y + curY, msbLoadKVA.B + curB);

    for (const shift of [1, 2]) {
      const trialDb = rotateDB(db, shift, voltage, schedule, cableDefinitions);
      const trialR = (trialDb.phaseBalance?.phaseR.demandKVA || 0) * validBuildingDF;
      const trialY = (trialDb.phaseBalance?.phaseY.demandKVA || 0) * validBuildingDF;
      const trialB = (trialDb.phaseBalance?.phaseB.demandKVA || 0) * validBuildingDF;

      const spread = Math.max(msbLoadKVA.R + trialR, msbLoadKVA.Y + trialY, msbLoadKVA.B + trialB) -
                     Math.min(msbLoadKVA.R + trialR, msbLoadKVA.Y + trialY, msbLoadKVA.B + trialB);

      if (spread < minMsbSpread - 0.001) {
        minMsbSpread = spread;
        bestShift = shift;
      }
    }

    const finalDb = bestShift !== 0 ? rotateDB(db, bestShift, voltage, schedule, cableDefinitions) : db;
    updatedDbs = updatedDbs.map((d) => (d.id === finalDb.id ? finalDb : d));

    msbLoadKVA.R += (finalDb.phaseBalance?.phaseR.demandKVA || 0) * validBuildingDF;
    msbLoadKVA.Y += (finalDb.phaseBalance?.phaseY.demandKVA || 0) * validBuildingDF;
    msbLoadKVA.B += (finalDb.phaseBalance?.phaseB.demandKVA || 0) * validBuildingDF;
  }

  // Allocate direct 1-phase DBs to the lowest-loaded MSB phase
  const direct1PDbs = updatedDirectDbs.filter((d) => !d.isThreePhase);
  for (const spDb of direct1PDbs) {
    const kva = (spDb.maximumDemandKVA || 0) * validBuildingDF;
    const phases: ('R' | 'Y' | 'B')[] = ['R', 'Y', 'B'];

    let bestPhase: 'R' | 'Y' | 'B' = 'R';
    let minSpread = Infinity;

    for (const p of phases) {
      const trial = {
        ...msbLoadKVA,
        [p]: msbLoadKVA[p] + kva,
      };
      const spread = Math.max(trial.R, trial.Y, trial.B) - Math.min(trial.R, trial.Y, trial.B);
      if (spread < minSpread) {
        minSpread = spread;
        bestPhase = p;
      }
    }

    const updatedSpDb = recalculateDB(
      {
        ...spDb,
        phase: bestPhase,
        circuits: spDb.circuits.map((c) => ({ ...c, phase: bestPhase })),
      },
      voltage,
      schedule,
      cableDefinitions
    );

    updatedDbs = updatedDbs.map((d) => (d.id === updatedSpDb.id ? updatedSpDb : d));
    msbLoadKVA[bestPhase] += kva;
  }

  return updatedDbs;
}

/**
 * Master recalculate entire electrical tree (supporting multiple MSBs)
 */
export function recalculateAll(
  dbs: DistributionBoard[],
  subDbs: SubDistributionBoard[],
  msb: MainSwitchBoard,
  directLoads: MsbDirectLoad[],
  voltage: VoltageSystem,
  schedule?: CableScheduleEntry[],
  msbs?: MainSwitchBoard[],
  cableDefinitions?: CableDefinitionEntry[]
): {
  dbs: DistributionBoard[];
  subDbs: SubDistributionBoard[];
  msb: MainSwitchBoard;
  msbs: MainSwitchBoard[];
  directLoads: MsbDirectLoad[];
} {
  // Step 1: Recalculate each DB
  const rawUpdatedDbs = dbs.map((db) => recalculateDB(db, voltage, schedule, cableDefinitions));

  // Step 2: Recalculate each Sub-DB based on its connected DBs (fed directly from MSB)
  const updatedSubDbs = subDbs.map((sb) => {
    const recalculated = recalculateSubDB(sb, rawUpdatedDbs, voltage, schedule, cableDefinitions);
    const subValidation = getSubDbVoltageDropValidation(recalculated);
    return {
      ...recalculated,
      cumulativeVoltageDropPercent: subValidation.cumulativeVdPercent,
      allowableVoltageDropPercent: subValidation.allowableLimit,
      upstreamSourceType: 'MSB' as const,
      voltageDropStatus: subValidation.status,
    };
  });

  // Step 3: Handle Multi-MSB list
  const currentMsbList = msbs && msbs.length > 0 ? msbs : msb ? [msb] : [];
  const primaryMsbId = currentMsbList[0]?.id || msb?.id;

  // Step 4: Enrich DBs with upstream hierarchy validation:
  // - DBs fed directly from MSB: allowable limit remains <= 4.0%
  // - DBs fed from Sub-DBs: dynamic allowable limit is <= (4.0% - parentSubDb.voltageDropPercent)
  const updatedDbs = rawUpdatedDbs.map((db) => {
    const isDirectMsb =
      db.subDbId?.toUpperCase() === 'MSB' ||
      currentMsbList.some(
        (m) => m.id === db.subDbId || m.code?.toLowerCase() === db.subDbId?.toLowerCase()
      );

    const parentSubDb = !isDirectMsb
      ? updatedSubDbs.find(
          (s) => s.id === db.subDbId || s.code?.toLowerCase() === db.subDbId?.toLowerCase()
        )
      : undefined;

    const validation = getDbVoltageDropValidation(db, parentSubDb);

    return {
      ...db,
      cumulativeVoltageDropPercent: validation.cumulativeVdPercent,
      allowableVoltageDropPercent: validation.allowableLimit,
      upstreamSourceType: (validation.isFedFromSubDb ? 'SUBDB' : 'MSB') as 'SUBDB' | 'MSB',
      voltageDropStatus: validation.status,
    };
  });

  const updatedMsbs = currentMsbList.map((m) => {
    // Linked Sub-DBs for this MSB
    const linkedSubDbs = updatedSubDbs.filter(
      (sb) => sb.msbId === m.id || (!sb.msbId && m.id === primaryMsbId)
    );

    // Linked Direct DBs (fed directly from this MSB)
    const directDbs = updatedDbs.filter(
      (db) =>
        db.subDbId === m.id ||
        db.subDbId === m.code ||
        (m.id === primaryMsbId && (db.subDbId === 'MSB' || db.subDbId === 'msb'))
    );

    // Direct loads
    const linkedLoads = directLoads.filter(
      (l) => !(l as any).msbId || (l as any).msbId === m.id
    );

    return recalculateMSB(m, linkedSubDbs, linkedLoads, voltage, schedule, directDbs);
  });

  const updatedPrimaryMsb = updatedMsbs.find((m) => m.id === msb?.id) || updatedMsbs[0];

  return {
    dbs: updatedDbs,
    subDbs: updatedSubDbs,
    msb: updatedPrimaryMsb,
    msbs: updatedMsbs,
    directLoads,
  };
}

/**
 * Generates the new name for a duplicated circuit or feeder according to the following rules:
 * - Rule 1 (Ends in a number): If the original name ends with a number, increment that number by 1.
 *   - Example: "Unit-1" -> "Unit-2", "SB-1" -> "SB-2"
 *   - Example: "DB-L10" -> "DB-L11", "SB-L10" -> "SB-L11"
 *   - Example: "Circuit-9" -> "Circuit-10", "SB-9" -> "SB-10"
 * - Rule 2 (Does not end in a number): If the original name does not end with a number, append "-1" to the end.
 *   - Example: "Unit" -> "Unit-1", "SB" -> "SB-1"
 *   - Example: "Main Pump" -> "Main Pump-1"
 * Edge Cases:
 * - Duplicating a duplicated item again increments sequentially (e.g., "Unit-2" -> "Unit-3", "SB-2" -> "SB-3").
 * - Multi-digit trailing numbers are properly parsed and incremented (e.g., "Circuit-9" -> "Circuit-10", "SB-9" -> "SB-10").
 * - Preserves leading zero padding if present (e.g., "SB-01" -> "SB-02", "DB-L09" -> "DB-L10").
 */
export function getDuplicateCircuitName(name: string): string {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return '1';
  }
  const trimmed = name.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + 1;
    const formattedNum = String(nextNum).padStart(numStr.length, '0');
    return `${prefix}${formattedNum}`;
  }
  return `${trimmed}-1`;
}

export const getDuplicateFeederName = getDuplicateCircuitName;
