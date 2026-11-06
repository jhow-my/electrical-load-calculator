/**
 * Electrical Engineering Data Types & Interfaces
 * Standards: IEC 60364, BS 7671, NEC NFPA 70
 */

export type PhaseType = 'R' | 'Y' | 'B' | '3P';

export type CircuitCategory =
  | 'LIGHTING'
  | 'RECEPTACLE'
  | 'HVAC'
  | 'POWER_APPLIANCE'
  | 'MOTOR_PUMP'
  | 'IT_CRITICAL'
  | 'SPARE'
  | 'CUSTOM';

export type BreakerType = 'MCB' | 'MCCB' | 'ACB';
export type BreakerCurve = 'B' | 'C' | 'D';

export interface VoltageSystem {
  id: string;
  label: string;
  standard: 'IEC' | 'BS' | 'NEC' | 'CUSTOM';
  Vll: number; // Line to Line Voltage (e.g. 400V, 415V, 480V, 208V)
  Vln: number; // Line to Neutral Voltage (e.g. 230V, 240V, 277V, 120V)
  frequency: number; // 50Hz or 60Hz
}

export interface BreakerSizingResult {
  rating: number; // Amperes (e.g., 16A, 32A, 100A, 800A)
  type: BreakerType;
  poles: 1 | 2 | 3 | 4;
  curve?: BreakerCurve;
  breakingCapacityKA: number; // kA rating
  frameSize?: number; // Frame rating in Amperes
  description: string;
}

export interface CircuitPreset {
  id: string;
  name: string; // e.g. "Type A", "Type B"
  quantity: number;
  unitWatts: number; // Watts per unit
  powerFactor: number; // cos phi (0.1 to 1.0)
  diversityFactor: number; // 0.0 to 1.0
  category?: CircuitCategory; // Default underlying category
  description?: string;
}

export interface Circuit {
  id: string;
  name: string;
  category: CircuitCategory;
  presetId?: string; // If bound to a CircuitPreset group (e.g. Type A, Type B)
  phase: PhaseType;
  quantity: number;
  unitWatts: number; // Watts per unit
  powerFactor: number; // cos phi (0.1 to 1.0)
  diversityFactor: number; // 0.0 to 1.0 (circuit coincidence / diversity)
  // Computed values
  connectedLoadKW: number;
  connectedLoadKVA: number;
  maximumDemandKW: number;
  maximumDemandKVA: number;
  currentIb: number; // Design current in Amperes
  recommendedBreaker: BreakerSizingResult;
  recommendedCable: string;
  notes?: string;
}

export interface PhaseLoadSummary {
  connectedKW: number;
  connectedKVA: number;
  demandKW: number;
  demandKVA: number;
  currentAmps: number;
}

export interface DBPhaseBalance {
  phaseR: PhaseLoadSummary;
  phaseY: PhaseLoadSummary;
  phaseB: PhaseLoadSummary;
  neutralCurrentAmps: number;
  unbalancePercent: number; // Max deviation from average / average * 100%
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'POOR';
}

export type EssentialGensetType = 'NORMAL' | 'FIRE_LIFT_SAFETY' | 'ESSENTIAL';

export interface DistributionBoard {
  id: string;
  code: string; // e.g. "DB-L1A"
  name: string; // e.g. "Level 1 North Lighting & Power"
  location: string; // e.g. "Riser 1, Level 1"
  subDbId: string; // Associated Sub-DB ID
  isThreePhase: boolean; // 3-Phase 4-wire or 1-Phase 2-wire
  phase?: 'R' | 'Y' | 'B'; // For 1-Phase DBs: assigned supply phase from upstream Sub-DB (e.g. 'R', 'Y', or 'B')
  boardDiversityFactor: number; // Board level diversity multiplier (usually 0.85-1.00)
  utilizationPercent?: number; // Target breaker utilization percentage (e.g. 80%). Required Breaker Capacity ≥ Ib / Utilization
  safetyMarginPercent?: number; // Kept for backward compatibility
  essentialGenset?: EssentialGensetType; // Emergency Standby Generator feeding status
  circuits: Circuit[];
  cableLengthMeters?: number; // Incomer cable route length in meters (default 25m)
  // Computed properties
  connectedLoadKW: number;
  connectedLoadKVA: number;
  maximumDemandKW: number;
  maximumDemandKVA: number;
  incomerCurrentAmps: number;
  phaseBalance: DBPhaseBalance;
  incomerBreaker: BreakerSizingResult;
  manualIncomerBreakerRating?: number; // Manually adjusted/overridden breaker rating
  incomerCable: string;
  manualIncomerCable?: string; // Manually adjusted/overridden cable size
  voltageDropV?: number; // Calculated voltage drop in Volts
  voltageDropPercent?: number; // Calculated voltage drop %
  cumulativeVoltageDropPercent?: number; // Cumulative % drop from MSB to this DB
  allowableVoltageDropPercent?: number; // Max allowable % drop (4.0% if from MSB, or 4.0% - parentSubDb.voltageDropPercent if from Sub-DB)
  upstreamSourceType?: 'MSB' | 'SUBDB'; // Supply origin hierarchy
  voltageDropMvPerAmpMeter?: number; // Cable voltage drop factor (mV/A/m)
  voltageDropStatus?: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED';
  voltageDropBasis?: 'BREAKER' | 'DESIGN'; // 'BREAKER' (I) or 'DESIGN' (Ib). Default: 'BREAKER'
}

export interface SubDistributionBoard {
  id: string;
  code: string; // e.g. "SB-PODIUM"
  name: string; // e.g. "Podium Sub-Distribution Board"
  location: string;
  msbId: string;
  groupDiversityFactor: number; // Group diversity factor applied to sum of DB maximum demands (e.g. 0.80 - 0.90)
  utilizationPercent?: number; // Target breaker utilization percentage (e.g. 80%). Required Breaker Capacity ≥ I_SB / Utilization
  safetyMarginPercent?: number; // Kept for backward compatibility
  essentialGenset?: EssentialGensetType; // Emergency Standby Generator feeding status
  cableLengthMeters?: number; // Incomer cable route length in meters (default 35m)
  manualIncomerCable?: string; // Manually adjusted/overridden cable size
  manualIncomerBreakerRating?: number; // Manually adjusted/overridden breaker rating
  // Computed properties
  connectedDbIds: string[]; // Dynamically linked DB IDs
  connectedLoadKW: number;
  connectedLoadKVA: number;
  maximumDemandKW: number;
  maximumDemandKVA: number;
  incomerCurrentAmps: number;
  phaseBalance?: DBPhaseBalance;
  incomerBreaker: BreakerSizingResult;
  incomerCable: string;
  voltageDropV?: number; // Calculated voltage drop in Volts
  voltageDropPercent?: number; // Calculated voltage drop %
  cumulativeVoltageDropPercent?: number; // Cumulative % drop from MSB (same as voltageDropPercent)
  allowableVoltageDropPercent?: number; // Max allowable % drop from MSB (4.0%)
  upstreamSourceType?: 'MSB'; // Sub-DBs are fed directly from MSB
  voltageDropMvPerAmpMeter?: number; // Cable voltage drop factor (mV/A/m)
  voltageDropStatus?: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED';
  voltageDropBasis?: 'BREAKER' | 'DESIGN'; // 'BREAKER' (I) or 'DESIGN' (Ib). Default: 'BREAKER'
}

export interface VoltageDropResult {
  voltageDropV: number;
  voltageDropPercent: number;
  mvPerAmpMeter: number;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'EXCEEDED';
  cableSize: string;
  cableLengthMeters: number;
  currentAmps: number;
  systemVoltage: number;
  isThreePhase: boolean;
  basis: 'BREAKER' | 'DESIGN';
}

export type MajorEquipmentType =
  | 'CHILLER'
  | 'ELEVATOR'
  | 'FIRE_PUMP'
  | 'AIR_COMPRESSOR'
  | 'EV_CHARGING'
  | 'SOLAR_PV'
  | 'OTHER';

export interface MsbDirectLoad {
  id: string;
  name: string;
  code: string;
  equipmentType: MajorEquipmentType;
  isEssential: boolean; // Runs on Emergency Generator during outage
  quantity: number;
  unitWatts: number;
  powerFactor: number;
  diversityFactor: number;
  // Computed
  connectedLoadKW: number;
  connectedLoadKVA: number;
  maximumDemandKW: number;
  maximumDemandKVA: number;
  currentIb: number;
  recommendedBreaker: BreakerSizingResult;
  recommendedCable: string;
  notes?: string;
  msbId?: string;
}

export interface TransformerSizingResult {
  recommendedKVA: number;
  standardRatings: number[];
  loadingPercent: number; // Actual MD / Transformer Rating * 100%
  spareCapacityKVA: number;
  recommendedUnits: number; // e.g. 1 x 1000 kVA or 2 x 630 kVA
  unitRatingKVA: number;
  efficiencyAssumed: number;
  fullLoadCurrentAmps: number;
  recommendationNote: string;
}

export type GeneratorSizingScope =
  | 'FIRE_LIFT_SAFETY_AND_ESSENTIAL'
  | 'FIRE_LIFT_SAFETY_ONLY'
  | 'ESSENTIAL_ONLY'
  | 'FULL_PLANT'
  | 'ESSENTIAL_LOADS_ONLY';

export interface GeneratorSizingResult {
  fireLiftSafetyDemandKW?: number;
  fireLiftSafetyDemandKVA?: number;
  essentialOnlyDemandKW?: number;
  essentialOnlyDemandKVA?: number;
  essentialDemandKW: number;
  essentialDemandKVA: number;
  totalPlantDemandKW: number;
  totalPlantDemandKVA: number;
  recommendedPrimeKVA: number;
  recommendedStandbyKVA: number;
  loadingPercent: number;
  sizingBasis: GeneratorSizingScope;
  fullLoadCurrentAmps: number;
  recommendationNote: string;
}

export interface CapacitorBankStep {
  sizeKVAr: number; // Capacitor unit rating at Vrated (e.g. 5, 10, 20, 40, 80, 160, 320, 640 kVAr)
  quantity: number;
  totalKVArRated: number; // quantity * sizeKVAr (at Vrated)
  effectiveKVArSupply: number; // totalKVArRated * (Vsupply/Vrated)^2
  operatingCurrentAmps: number; // (Vsupply/Vrated)^2 * (sizeKVAr * 1000 / (sqrt(3)*Vsupply)) * 1.5
  proposedMCCBRating: number; // Standard MCCB rating (e.g. 15, 30, 60, 125, 250, 500 A)
}

export interface CapacitorBankResult {
  vRated: number; // Rated capacitor voltage, default 525V
  vSupply: number; // Supply operating voltage, default 420V
  stepsCount: number; // Target number of APFC controller steps, default 12
  vRatio: number; // Vsupply / Vrated (e.g. 420/525 = 0.80)
  ratio: number; // (Vsupply / Vrated)^2 (e.g. 0.64)
  safetyFactor: number; // 1.5
  initialPowerFactor: number; // cos θ1 (e.g. 0.80)
  targetPowerFactor: number; // cos θ2 (e.g. 0.99)
  theta1Rad: number; // acos(PF1) in radians
  theta1Deg: number; // acos(PF1) in degrees
  theta2Rad: number; // acos(PF2) in radians
  theta2Deg: number; // acos(PF2) in degrees
  activePowerKW: number;
  requiredKVArSupply: number; // Required Q at Vsupply e.g. 742.98 kVAr
  requiredKVArRated: number; // Required Q at Vrated e.g. 1160.91 kVAr
  requiredKVAr: number; // Required Q at Vrated (alias for backward compatibility)
  recommendedBankKVAr: number; // Configured total kVAr at Vrated (e.g. 1160 or 1170 kVAr)
  totalConfiguredKVArRated: number; // Sum of configured steps * sizeKVAr (at Vrated)
  totalConfiguredKVArSupply: number; // Total effective reactive output at Vsupply
  totalConfiguredSteps: number; // Sum of step quantities
  mainIncomerCurrentAmps: number; // Icap with 1.5x safety factor (e.g. 1,530.8 A)
  mainIncomerBreakerRating: number; // Proposed main breaker (e.g. 1600 A)
  steps: CapacitorBankStep[];
  recommendedSteps: string; // e.g., "12 steps: 2×5k, 1×10k, 1×20k, 2×40k, 3×80k, 1×160k, 2×320k"
  detunedReactorRecommendation: string;
  paybackNote: string;
}

export type BusbarMaterial = 'COPPER' | 'ALUMINIUM';

export interface BusbarStandardSize {
  width: number; // mm
  thickness: number; // mm
  area: number; // mm2
}

export interface BusbarSizingResult {
  material: BusbarMaterial; // 'COPPER' | 'ALUMINIUM'
  currentDensityJ: number; // A/mm2 (default 1.4 for Cu, 0.7 for Al)
  designCurrentId: number; // Amperes, breaker rating ID (or totalPlantCurrentAmps)
  initialRequiredAreaAreq: number; // Areq = Id / J (mm2)
  shortCircuitCurrentIcwKA: number; // kA, default 65 kA
  faultDurationSec: number; // seconds, default 1.0 s
  materialConstantK: number; // k factor, default 143 for Cu, 110 for Al
  minimumWithstandAreaAmin: number; // Amin = (Icw * 1000 * sqrt(t)) / k (mm2)
  governingRequiredArea: number; // max(Areq, Amin)
  governingCriterion: 'CONTINUOUS_AMPACITY' | 'SHORT_CIRCUIT_WITHSTAND';
  // Selected configuration
  width: number; // mm e.g. 100
  thickness: number; // mm e.g. 6
  barArea: number; // width * thickness e.g. 600 mm2
  runsPerPhase: number; // number of parallel bars per phase e.g. 2
  totalArea: number; // runsPerPhase * barArea e.g. 1200 mm2
  continuousCurrentCapacity: number; // totalArea * currentDensityJ (Amperes)
  thermalWithstandCapacityKA: number; // (totalArea * k) / (sqrt(t) * 1000) (kA)
  formattedDescription: string; // e.g. "1200 mm2 (2 x 100 x 6mm)"
  isCustomManualSelection?: boolean;
}

export interface MainSwitchBoard {
  id: string;
  code: string; // e.g. "MSB-MAIN"
  name: string; // e.g. "Main Low Voltage Switchboard"
  location: string;
  overallBuildingDiversityFactor: number; // Diversity factor applied to sum of (Sub-DBs + Major Loads) (e.g. 0.75 - 0.85)
  targetPowerFactor: number; // e.g. 0.95 or 0.98
  txUtilizationPercent?: number; // Target transformer & main incomer utilization percentage (e.g. 80%). Required Capacity ≥ Load / TX_Utilization
  utilizationPercent?: number; // Alias
  safetyMarginPercent: number; // Kept for backward compatibility
  generatorSizingScope: GeneratorSizingScope;
  // Busbar custom sizing inputs / overrides
  busbarMaterial?: BusbarMaterial; // 'COPPER' | 'ALUMINIUM'
  busbarCurrentDensity?: number; // A/mm2
  busbarDesignCurrentId?: number; // Amperes override (otherwise uses incomer breaker rating)
  busbarIcwKA?: number; // kA (default 65)
  busbarFaultDuration?: number; // seconds (default 1.0)
  busbarMaterialConstantK?: number; // k factor
  busbarSelectedWidth?: number; // mm
  busbarSelectedThickness?: number; // mm
  busbarSelectedRuns?: number; // runs per phase
  busbarManualOverride?: boolean;
  busbarSizing?: BusbarSizingResult;
  // Capacitor Bank custom inputs
  vRated?: number; // e.g. 525V (default)
  vSupply?: number; // e.g. 420V (default)
  capacitorStepsCount?: number; // e.g. 12 steps (default)
  initialPowerFactor?: number; // e.g. 0.80 (default)
  customCapacitorSteps?: { sizeKVAr: number; quantity: number }[];
  manualTransformerKVA?: number; // Manually adjusted/overridden transformer rating (kVA)
  manualGeneratorKVA?: number; // Manually adjusted/overridden generator prime rating (kVA)
  manualMainIncomerBreakerRating?: number; // Manually adjusted/overridden main incomer breaker rating
  manualIncomerBreakerRating?: number; // Alias for consistency
  // Computed properties
  connectedLoadKW: number;
  connectedLoadKVA: number;
  summedSubDbDemandKW: number;
  summedSubDbDemandKVA: number;
  summedMajorLoadsDemandKW: number;
  summedMajorLoadsDemandKVA: number;
  essentialLoadsDemandKW: number;
  essentialLoadsDemandKVA: number;
  totalPlantMaximumDemandKW: number;
  totalPlantMaximumDemandKVA: number;
  totalPlantCurrentAmps: number;
  incomerCurrentAmps?: number;
  phaseBalance?: DBPhaseBalance;
  mainIncomerBreaker: BreakerSizingResult;
  transformerSizing: TransformerSizingResult;
  generatorSizing: GeneratorSizingResult;
  capacitorBankSizing: CapacitorBankResult;
}

export type CableCategoryType = '1P' | '3P' | 'BUSDUCT';

export interface CableDefinitionEntry {
  id: string;
  category: CableCategoryType; // '1P' | '3P' | 'BUSDUCT'
  cableSize: string; // e.g. "4C 25.0mm² Cu/XLPE" or "Copper Busduct 1000A"
  maxAmps: number; // Current-carrying capacity Iz (A)
  mvPerAmpMeter: number; // Voltage drop factor in mV/A/m (per BS 7671 / IEC 60364)
  cpcSize?: string; // Earth / CPC conductor size e.g. "16mm² Cu"
  installationMethod?: string; // e.g. "Method E - Perforated Cable Tray"
  notes?: string;
}

export interface CableScheduleEntry {
  id: string;
  phaseSystem: '1P' | '3P'; // '1P' (230V) or '3P' (400V)
  breakerRating: number; // e.g. 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, etc.
  breakerType: BreakerType; // 'MCB' | 'MCCB' | 'ACB'
  poles: 1 | 2 | 3 | 4;
  cableSize: string; // e.g. "4C 25.0mm² Cu/XLPE"
  maxAmps: number; // Current-carrying capacity Iz (A)
  cpcSize?: string; // Earth / CPC conductor size e.g. "16mm² Cu"
  installationMethod?: string; // e.g. "Method E - Perforated Cable Tray"
  notes?: string;
  mvPerAmpMeter?: number; // Voltage drop factor in mV/A/m
}

export interface ElectricalProject {
  id: string;
  name: string;
  description: string;
  client?: string;
  engineer?: string;
  dateCreated: string;
  lastModified: string;
  voltageSystem: VoltageSystem;
  cableSchedule?: CableScheduleEntry[]; // User-customized or baseline protective breaker schedule
  cableDefinitions?: CableDefinitionEntry[]; // User-customized or baseline cable & busduct specifications
  circuitPresets?: CircuitPreset[]; // Reusable circuit preset templates (Type A, Type B, etc.)
  msb: MainSwitchBoard;
  msbs?: MainSwitchBoard[];
  subDbs: SubDistributionBoard[];
  dbs: DistributionBoard[];
  msbDirectLoads: MsbDirectLoad[];
}

