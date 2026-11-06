/**
 * Template Management Utilities for Electrical Load Calculator
 * Manages saving current configurations, storing the "Default" template,
 * and loading built-in industry presets or custom user templates.
 */

import { ElectricalProject } from '../types/electrical';
import {
  createCommercialOfficeProject,
  createResidentialTowerProject,
  createBuildingManagementProject,
  createBlankProject,
} from './sampleProjects';
import {
  recalculateAll,
  DEFAULT_CABLE_SCHEDULE,
  DEFAULT_CABLE_DEFINITIONS,
  DEFAULT_CIRCUIT_PRESETS,
} from './electricalCalculations';

export interface SavedProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'DEFAULT' | 'PRESET' | 'USER';
  isDefault?: boolean;
  isCustomizedDefault?: boolean;
  dateCreated: string;
  lastModified?: string;
  projectData: ElectricalProject;
  stats: {
    voltageLabel: string;
    msbCount: number;
    subDbCount: number;
    dbCount: number;
    totalDemandKW: number;
    totalConnectedKW: number;
  };
}

const STORAGE_KEY_DEFAULT = 'electrical_load_default_template_v3';
const STORAGE_KEY_USER_TEMPLATES = 'electrical_load_user_templates_v2';

/**
 * Calculates summary stats for a template card display
 */
export function computeTemplateStats(proj: ElectricalProject) {
  const totalDemand =
    proj.msbs && proj.msbs.length > 0
      ? proj.msbs.reduce((acc, m) => acc + (m.totalPlantMaximumDemandKW || 0), 0)
      : (proj.msb?.totalPlantMaximumDemandKW || 0);

  const totalConnected =
    proj.msbs && proj.msbs.length > 0
      ? proj.msbs.reduce((acc, m) => acc + (m.connectedLoadKW || 0), 0)
      : (proj.msb?.connectedLoadKW || 0);

  return {
    voltageLabel: proj.voltageSystem?.label || '400V / 230V 50Hz (IEC)',
    msbCount: proj.msbs && proj.msbs.length > 0 ? proj.msbs.length : 1,
    subDbCount: proj.subDbs?.length || 0,
    dbCount: proj.dbs?.length || 0,
    totalDemandKW: Math.round(totalDemand * 10) / 10,
    totalConnectedKW: Math.round(totalConnected * 10) / 10,
  };
}

/**
 * Creates the initial baseline project configuration named "Default"
 */
export function getFactoryDefaultProject(): ElectricalProject {
  const initial = createBlankProject();
  return {
    ...initial,
    name: 'Blank Project (Clean Slate)',
    description: 'Clean starter design.',
  };
}

/**
 * Creates the "Default" template object
 */
export function getFactoryDefaultTemplate(): SavedProjectTemplate {
  const defaultProj = getFactoryDefaultProject();
  return {
    id: 'preset-blank',
    name: 'Blank Project (Clean Slate)',
    description: 'Clean starter design.',
    category: 'PRESET',
    isDefault: true,
    isCustomizedDefault: false,
    dateCreated: 'Initial Setup',
    projectData: defaultProj,
    stats: computeTemplateStats(defaultProj),
  };
}

/**
 * Loads the current "Default" template (either customized from storage or initial factory setup)
 */
export function loadDefaultTemplate(): SavedProjectTemplate {
  if (typeof window === 'undefined') return getFactoryDefaultTemplate();

  try {
    const stored = localStorage.getItem(STORAGE_KEY_DEFAULT);
    if (stored) {
      const parsed: SavedProjectTemplate = JSON.parse(stored);
      if (parsed && parsed.projectData) {
        return {
          ...parsed,
          name: 'Default',
          category: 'DEFAULT',
          isDefault: true,
          isCustomizedDefault: true,
          stats: computeTemplateStats(parsed.projectData),
        };
      }
    }
  } catch (err) {
    console.warn('Failed to parse stored default template from localStorage', err);
  }

  return getFactoryDefaultTemplate();
}

/**
 * Saves the current application project configuration as the "Default" template
 */
export function saveCurrentAsDefaultTemplate(project: ElectricalProject): SavedProjectTemplate {
  // Clone project data
  const clonedData: ElectricalProject = JSON.parse(JSON.stringify(project));
  clonedData.lastModified = new Date().toISOString();

  const template: SavedProjectTemplate = {
    id: 'template-default',
    name: 'Default',
    description: `User-saved Default configuration (${project.name}). Saved on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    category: 'DEFAULT',
    isDefault: true,
    isCustomizedDefault: true,
    dateCreated: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    projectData: clonedData,
    stats: computeTemplateStats(clonedData),
  };

  try {
    localStorage.setItem(STORAGE_KEY_DEFAULT, JSON.stringify(template));
  } catch (err) {
    console.error('Failed to save default template to localStorage', err);
  }

  return template;
}

/**
 * Resets the "Default" template back to the initial factory configuration
 */
export function resetDefaultTemplateToFactory(): SavedProjectTemplate {
  try {
    localStorage.removeItem(STORAGE_KEY_DEFAULT);
  } catch (err) {
    console.warn('Failed to clear stored default template', err);
  }
  return getFactoryDefaultTemplate();
}

/**
 * Returns the built-in industry standard preset templates
 */
export function getStandardPresets(): SavedProjectTemplate[] {
  const blank = createBlankProject();
  const comm = createCommercialOfficeProject();
  const res = createResidentialTowerProject();
  const mgmt = createBuildingManagementProject();

  return [
    {
      id: 'preset-blank',
      name: 'Blank Project (Clean Slate)',
      description: 'Clean starter design.',
      category: 'PRESET',
      dateCreated: 'Built-in',
      projectData: blank,
      stats: computeTemplateStats(blank),
    },
    {
      id: 'preset-building-management',
      name: 'Building Management',
      description: 'C11 Medini - Building Management for High-Rise Condominium',
      category: 'PRESET',
      dateCreated: '2026-11-05',
      projectData: mgmt,
      stats: computeTemplateStats(mgmt),
    },
    {
      id: 'preset-residential',
      name: 'Residential Tower',
      description: 'C11 Medini - Residential Tower for High-Rise Condominium',
      category: 'PRESET',
      dateCreated: '2026-11-06',
      projectData: res,
      stats: computeTemplateStats(res),
    },
    {
      id: 'preset-commercial',
      name: 'Residential Tower (Busduct Design)',
      description: 'C11 Medini - Residential Tower with Busduct Design',
      category: 'PRESET',
      dateCreated: '2026-11-06',
      projectData: comm,
      stats: computeTemplateStats(comm),
    },
  ];
}

/**
 * Loads all user-saved custom templates from localStorage
 */
export function loadUserTemplates(): SavedProjectTemplate[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_TEMPLATES);
    if (!raw) return [];
    const list: SavedProjectTemplate[] = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((item) => ({
        ...item,
        category: 'USER' as const,
        stats: computeTemplateStats(item.projectData),
      }));
    }
  } catch (err) {
    console.warn('Failed to load user templates from localStorage', err);
  }
  return [];
}

/**
 * Saves a new custom template from the current project configuration
 */
export function saveNewUserTemplate(
  name: string,
  description: string,
  project: ElectricalProject
): SavedProjectTemplate {
  const clonedData: ElectricalProject = JSON.parse(JSON.stringify(project));
  clonedData.lastModified = new Date().toISOString();

  const newTemplate: SavedProjectTemplate = {
    id: `template-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || `Saved Template (${new Date().toLocaleDateString()})`,
    description: description.trim() || `Custom configuration saved on ${new Date().toLocaleDateString()}`,
    category: 'USER',
    dateCreated: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    projectData: clonedData,
    stats: computeTemplateStats(clonedData),
  };

  const existing = loadUserTemplates();
  const updated = [newTemplate, ...existing];

  try {
    localStorage.setItem(STORAGE_KEY_USER_TEMPLATES, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save user template to localStorage', err);
  }

  return newTemplate;
}

/**
 * Deletes a user template by id
 */
export function deleteUserTemplate(templateId: string): SavedProjectTemplate[] {
  const existing = loadUserTemplates();
  const filtered = existing.filter((t) => t.id !== templateId);

  try {
    localStorage.setItem(STORAGE_KEY_USER_TEMPLATES, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove user template from localStorage', err);
  }

  return filtered;
}

/**
 * Prepares and recalculates a template project for clean application into the app
 */
export function prepareProjectFromTemplate(template: SavedProjectTemplate): ElectricalProject {
  const rawProject = JSON.parse(JSON.stringify(template.projectData)) as ElectricalProject;
  const primaryMsb = rawProject.msb || rawProject.msbs?.[0];
  
  const sanitizedDbs = (rawProject.dbs || []).map((d) => ({
    ...d,
    name: d.name !== undefined && d.name !== null ? String(d.name).trim() : '',
    circuits: (d.circuits || []).map((c) => ({
      ...c,
      quantity:
        typeof c.quantity === 'number' && !isNaN(c.quantity)
          ? Math.max(0, Math.round(c.quantity))
          : c.quantity !== undefined && c.quantity !== null && String(c.quantity).trim() !== '' && !isNaN(Number(c.quantity))
          ? Math.max(0, Math.round(Number(c.quantity)))
          : 1,
    })),
  }));
  const sanitizedSubDbs = (rawProject.subDbs || []).map((s) => ({
    ...s,
    name: s.name !== undefined && s.name !== null ? String(s.name).trim() : '',
  }));
  const sanitizedMsbs = (rawProject.msbs && rawProject.msbs.length > 0
    ? rawProject.msbs
    : primaryMsb
    ? [primaryMsb]
    : []
  ).map((m) => ({
    ...m,
    name: m.name !== undefined && m.name !== null ? String(m.name).trim() : '',
  }));
  const sanitizedPrimaryMsb = sanitizedMsbs[0] || primaryMsb;

  const sanitizedDirectLoads = (rawProject.msbDirectLoads || []).map((l) => ({
    ...l,
    quantity:
      typeof l.quantity === 'number' && !isNaN(l.quantity)
        ? Math.max(0, Math.round(l.quantity))
        : l.quantity !== undefined && l.quantity !== null && String(l.quantity).trim() !== '' && !isNaN(Number(l.quantity))
        ? Math.max(0, Math.round(Number(l.quantity)))
        : 1,
  }));

  // Re-run electrical calculations to ensure all computed values, breakers, and voltage drops are pristine
  const calculated = recalculateAll(
    sanitizedDbs,
    sanitizedSubDbs,
    sanitizedPrimaryMsb,
    sanitizedDirectLoads,
    rawProject.voltageSystem,
    rawProject.cableSchedule || DEFAULT_CABLE_SCHEDULE,
    sanitizedMsbs,
    rawProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS
  );

  const activeMsb = calculated.msbs?.[0] || calculated.msb;

  return {
    ...rawProject,
    voltageSystem: rawProject.voltageSystem,
    cableSchedule: rawProject.cableSchedule || DEFAULT_CABLE_SCHEDULE,
    cableDefinitions: rawProject.cableDefinitions || DEFAULT_CABLE_DEFINITIONS,
    circuitPresets: rawProject.circuitPresets || DEFAULT_CIRCUIT_PRESETS,
    dbs: calculated.dbs,
    subDbs: calculated.subDbs,
    msb: activeMsb,
    msbs: calculated.msbs,
    msbDirectLoads: calculated.directLoads,
    lastModified: new Date().toISOString(),
  };
}
