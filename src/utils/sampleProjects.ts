/**
 * Industry-standard Realistic Electrical Projects for Quick Demonstration & Testing
 */

import { ElectricalProject } from '../types/electrical';
import mediniTemplateData from '../data/mediniManagementTemplate.json';
import mediniResidentialTowerData from '../data/mediniResidentialTowerTemplate.json';
import mediniResidentialTowerBusductData from '../data/mediniResidentialTowerBusductTemplate.json';
import {
  VOLTAGE_PRESETS,
  recalculateAll,
  DEFAULT_CABLE_SCHEDULE,
  DEFAULT_CABLE_DEFINITIONS,
  DEFAULT_CIRCUIT_PRESETS,
} from './electricalCalculations';

export function createCommercialOfficeProject(): ElectricalProject {
  const baseData = mediniResidentialTowerBusductData.projectData as unknown as ElectricalProject;
  const cloned: ElectricalProject = JSON.parse(JSON.stringify(baseData));

  // Run recalculateAll to ensure all breaker ratings, phase balance, busbar, and plant demand are up to date
  const calculated = recalculateAll(
    cloned.dbs,
    cloned.subDbs,
    cloned.msb,
    cloned.msbDirectLoads || [],
    cloned.voltageSystem,
    cloned.cableSchedule,
    cloned.msbs,
    cloned.cableDefinitions
  );

  return {
    ...cloned,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
  };
}

export const createResidentialTowerBusductProject = createCommercialOfficeProject;

export function createResidentialTowerProject(): ElectricalProject {
  const baseData = mediniResidentialTowerData.projectData as unknown as ElectricalProject;
  const cloned: ElectricalProject = JSON.parse(JSON.stringify(baseData));

  // Run recalculateAll to ensure all breaker ratings, phase balance, busbar, and plant demand are up to date
  const calculated = recalculateAll(
    cloned.dbs,
    cloned.subDbs,
    cloned.msb,
    cloned.msbDirectLoads || [],
    cloned.voltageSystem,
    cloned.cableSchedule,
    cloned.msbs,
    cloned.cableDefinitions
  );

  return {
    ...cloned,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
  };
}

export function createBlankProject(): ElectricalProject {
  const voltage = VOLTAGE_PRESETS[0];

  const db1 = {
    id: 'db-1',
    code: 'DB-01',
    name: 'Distribution Board 1',
    location: 'Electrical Cupboard 1',
    subDbId: 'sb-1',
    isThreePhase: true,
    boardDiversityFactor: 1,
    safetyMarginPercent: 30,
    circuits: [
      {
        id: 'c-1',
        name: 'Lighting Circuit 1',
        category: 'LIGHTING' as const,
        phase: 'R' as const,
        quantity: 10,
        unitWatts: 50,
        powerFactor: 0.95,
        diversityFactor: 0.9,
        connectedLoadKW: 0,
        connectedLoadKVA: 0,
        maximumDemandKW: 0,
        maximumDemandKVA: 0,
        currentIb: 0,
        recommendedBreaker: {} as any,
        recommendedCable: '',
      },
      {
        id: 'c-2',
        name: 'General Sockets 1',
        category: 'RECEPTACLE' as const,
        phase: 'Y' as const,
        quantity: 12,
        unitWatts: 300,
        powerFactor: 0.85,
        diversityFactor: 0.4,
        connectedLoadKW: 0,
        connectedLoadKVA: 0,
        maximumDemandKW: 0,
        maximumDemandKVA: 0,
        currentIb: 0,
        recommendedBreaker: {} as any,
        recommendedCable: '',
      },
      {
        id: 'c-3',
        name: 'Air Conditioner 1',
        category: 'HVAC' as const,
        phase: '3P' as const,
        quantity: 1,
        unitWatts: 3500,
        powerFactor: 0.85,
        diversityFactor: 0.8,
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

  const sb1 = {
    id: 'sb-1',
    code: 'SB-01',
    name: 'Sub-Distribution Board 1',
    location: 'Floor Riser',
    msbId: 'msb-main',
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

  const msb = {
    id: 'msb-main',
    code: 'MSB-01',
    name: 'Main Switch Board',
    location: 'Main Switchroom',
    overallBuildingDiversityFactor: 0.80,
    targetPowerFactor: 0.99,
    safetyMarginPercent: 25,
    generatorSizingScope: 'FIRE_LIFT_SAFETY_AND_ESSENTIAL' as const,
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

  const calculated = recalculateAll([db1], [sb1], msb, [], voltage);

  return {
    id: 'proj-new-system',
    name: 'New Electrical Distribution Design',
    description: 'Custom electrical installation project',
    engineer: 'Project Electrical Engineer',
    dateCreated: '2026-10-26',
    lastModified: '2026-10-26',
    voltageSystem: voltage,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
    cableSchedule: DEFAULT_CABLE_SCHEDULE,
    cableDefinitions: DEFAULT_CABLE_DEFINITIONS,
    circuitPresets: JSON.parse(JSON.stringify(DEFAULT_CIRCUIT_PRESETS)),
  };
}

export function createBuildingManagementProject(): ElectricalProject {
  const baseData = mediniTemplateData.projectData as unknown as ElectricalProject;
  const cloned: ElectricalProject = JSON.parse(JSON.stringify(baseData));

  // Run recalculateAll to ensure all breaker ratings, phase balance, busbar, and plant demand are up to date
  const calculated = recalculateAll(
    cloned.dbs,
    cloned.subDbs,
    cloned.msb,
    cloned.msbDirectLoads || [],
    cloned.voltageSystem,
    cloned.cableSchedule,
    cloned.msbs,
    cloned.cableDefinitions
  );

  return {
    ...cloned,
    msb: calculated.msb,
    msbs: calculated.msbs,
    subDbs: calculated.subDbs,
    dbs: calculated.dbs,
    msbDirectLoads: calculated.directLoads,
  };
}
