/**
 * PDF Generation Utility for Electrical Load Schedule Report
 * Synchronized with the Interactive Report Preview Template
 * Generates an engineering-grade, publication-ready multi-page PDF using jsPDF and jsPDF-AutoTable.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ElectricalProject } from '../types/electrical';
import { getGeneratorScopeShortLabel } from './electricalCalculations';

export function generatePdfReport(project: ElectricalProject): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 12; // 12mm
  const contentWidth = pageWidth - margin * 2; // 186mm
  let currentY = margin;

  // Design Theme Palette (Aligned with Report Preview UI)
  const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const accentColor: [number, number, number] = [217, 119, 6]; // Amber 600
  const amberTextColor: [number, number, number] = [180, 83, 9]; // Amber 700
  const emeraldTextColor: [number, number, number] = [4, 120, 87]; // Emerald 700
  const roseTextColor: [number, number, number] = [190, 18, 60]; // Rose 700
  const blueTextColor: [number, number, number] = [29, 78, 216]; // Blue 700
  const slateTextColor: [number, number, number] = [71, 85, 105]; // Slate 600
  const slateMutedColor: [number, number, number] = [148, 163, 184]; // Slate 400
  const cardBorderColor: [number, number, number] = [203, 213, 225]; // Slate 300
  const tableHeaderColor: [number, number, number] = [30, 41, 59]; // Slate 800

  const { msb, voltageSystem } = project;
  const allMsbs = project.msbs && project.msbs.length > 0 ? project.msbs : [msb];
  const primaryMsbId = allMsbs[0]?.id || msb.id;
  const isPrimaryMsb = msb.id === primaryMsbId;

  // Filter Sub-DBs connected downstream to this specific MSB
  const subDbs = (project.subDbs || []).filter(
    (sb) =>
      sb.msbId === msb.id ||
      sb.msbId === msb.code ||
      (!sb.msbId && isPrimaryMsb)
  );

  // Direct DBs fed directly from this MSB (bypassing Sub-DBs)
  const directDbs = (project.dbs || []).filter(
    (d) =>
      d.subDbId === msb.id ||
      d.subDbId === msb.code ||
      (isPrimaryMsb && (d.subDbId === 'MSB' || d.subDbId === 'msb' || d.subDbId === 'msb-main'))
  );

  // Sub-DB ID & Code sets for downstream DB matching
  const subDbIdSet = new Set(subDbs.map((sb) => sb.id));
  const subDbCodeSet = new Set(subDbs.map((sb) => sb.code?.toLowerCase()));

  // Distribution boards connected downstream to this MSB (either directly or via this MSB's Sub-DBs)
  const dbs = (project.dbs || []).filter((db) => {
    // 1. Directly fed from this MSB
    if (
      db.subDbId === msb.id ||
      db.subDbId === msb.code ||
      (isPrimaryMsb && (db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === 'msb-main'))
    ) {
      return true;
    }
    // 2. Fed from a Sub-DB connected to this MSB
    if (subDbIdSet.has(db.subDbId) || (db.subDbId && subDbCodeSet.has(db.subDbId.toLowerCase()))) {
      return true;
    }
    return false;
  });

  // Direct Major Equipment connected to this MSB
  const msbDirectLoads = (project.msbDirectLoads || []).filter(
    (l) =>
      l.msbId === msb.id ||
      l.msbId === msb.code ||
      (!l.msbId && isPrimaryMsb)
  );

  // Compute load categories matching ReportModal.tsx
  const totalFireSafetyKW = (() => {
    const subDbsVal = subDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);
    const majorVal = (msbDirectLoads || [])
      .filter(
        (l) =>
          l.equipmentType === 'FIRE_PUMP' ||
          (l.isEssential && (l.code?.toLowerCase().includes('fire') || l.name?.toLowerCase().includes('fire')))
      )
      .reduce((sum, l) => sum + l.maximumDemandKW, 0);
    return subDbsVal + directDbsVal + majorVal;
  })();

  const totalFireSafetyKVA = (() => {
    const subDbsVal = subDbs
      .filter((sb) => sb.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'FIRE_LIFT_SAFETY')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);
    const majorVal = (msbDirectLoads || [])
      .filter(
        (l) =>
          l.equipmentType === 'FIRE_PUMP' ||
          (l.isEssential && (l.code?.toLowerCase().includes('fire') || l.name?.toLowerCase().includes('fire')))
      )
      .reduce((sum, l) => sum + l.maximumDemandKVA, 0);
    return subDbsVal + directDbsVal + majorVal;
  })();

  const totalEssentialKW = (() => {
    const subDbsVal = subDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKW, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKW, 0);
    const majorVal = (msbDirectLoads || [])
      .filter(
        (l) =>
          l.isEssential &&
          l.equipmentType !== 'FIRE_PUMP' &&
          !l.code?.toLowerCase().includes('fire') &&
          !l.name?.toLowerCase().includes('fire')
      )
      .reduce((sum, l) => sum + l.maximumDemandKW, 0);
    return subDbsVal + directDbsVal + majorVal;
  })();

  const totalEssentialKVA = (() => {
    const subDbsVal = subDbs
      .filter((sb) => sb.essentialGenset === 'ESSENTIAL')
      .reduce((sum, sb) => sum + sb.maximumDemandKVA, 0);
    const directDbsVal = directDbs
      .filter((db) => db.essentialGenset === 'ESSENTIAL')
      .reduce((sum, db) => sum + db.maximumDemandKVA, 0);
    const majorVal = (msbDirectLoads || [])
      .filter(
        (l) =>
          l.isEssential &&
          l.equipmentType !== 'FIRE_PUMP' &&
          !l.code?.toLowerCase().includes('fire') &&
          !l.name?.toLowerCase().includes('fire')
      )
      .reduce((sum, l) => sum + l.maximumDemandKVA, 0);
    return subDbsVal + directDbsVal + majorVal;
  })();

  // Helper: check page overflow and add new page if needed
  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 14) {
      doc.addPage();
      currentY = margin;
    }
  };

  // =========================================================================
  // 1. HEADER TITLE & 4-CELL METADATA STRIP (Exact Live Preview Layout)
  // =========================================================================
  const headerCardHeight = 31;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, currentY, contentWidth, headerCardHeight, 1.5, 1.5, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(margin, currentY, contentWidth, headerCardHeight, 1.5, 1.5, 'S');

  // Top sub-header background
  doc.setFillColor(248, 250, 252);
  doc.rect(margin + 0.3, currentY + 0.3, contentWidth - 0.6, 17.7, 'F');

  // Title section (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...accentColor);
  doc.text('ELECTRICAL MAXIMUM DEMAND & LOAD SCHEDULE REPORT', margin + 3.5, currentY + 5);

  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text(project.name || 'Residential Tower (Busduct Design)', margin + 3.5, currentY + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...slateTextColor);
  const subtitle = project.description
    ? project.description.length > 90
      ? project.description.substring(0, 90) + '...'
      : project.description
    : 'Comprehensive electrical hierarchy calculations across MSB, Sub-DBs, and Final DBs.';
  doc.text(subtitle, margin + 3.5, currentY + 15);

  // Top Right metadata (Engineer & Submittal Date)
  const rightX = pageWidth - margin - 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text(`Engineer: ${project.engineer || 'Senior Electrical PE'}`, rightX, currentY + 6.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...slateTextColor);
  const submittalDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Submittal Date: ${submittalDate}`, rightX, currentY + 12.5, { align: 'right' });

  // Divider line
  doc.setDrawColor(...cardBorderColor);
  doc.line(margin, currentY + 18, margin + contentWidth, currentY + 18);

  // Bottom 4-Cell Metadata Strip
  const cellWidth = contentWidth / 4;
  const stripY = currentY + 18;

  // Vertical cell dividers
  doc.line(margin + cellWidth, stripY, margin + cellWidth, stripY + 13);
  doc.line(margin + cellWidth * 2, stripY, margin + cellWidth * 2, stripY + 13);
  doc.line(margin + cellWidth * 3, stripY, margin + cellWidth * 3, stripY + 13);

  // Cell 1: Electrical Supply
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(...slateMutedColor);
  doc.text('ELECTRICAL SUPPLY', margin + 3, stripY + 4.5);
  doc.setFontSize(7);
  doc.setTextColor(...primaryColor);
  doc.text(`3P 4-Wire · ${voltageSystem.Vll}V / ${voltageSystem.Vln}V · ${voltageSystem.frequency}Hz`, margin + 3, stripY + 9.5);

  // Cell 2: Design Standard
  doc.setFontSize(5.8);
  doc.setTextColor(...slateMutedColor);
  doc.text('DESIGN STANDARD', margin + cellWidth + 3, stripY + 4.5);
  doc.setFontSize(7);
  doc.setTextColor(...primaryColor);
  doc.text('IEC 60364 / BS 7671 Verification', margin + cellWidth + 3, stripY + 9.5);

  // Cell 3: Total Plant MD
  doc.setFontSize(5.8);
  doc.setTextColor(...slateMutedColor);
  doc.text('TOTAL PLANT MD', margin + cellWidth * 2 + 3, stripY + 4.5);
  doc.setFontSize(7.2);
  doc.setTextColor(...amberTextColor);
  doc.text(`${msb.totalPlantMaximumDemandKW.toFixed(1)} kW (${msb.totalPlantMaximumDemandKVA.toFixed(1)} kVA)`, margin + cellWidth * 2 + 3, stripY + 9.5);

  // Cell 4: Main Incomer & Ib
  doc.setFontSize(5.8);
  doc.setTextColor(...slateMutedColor);
  doc.text('MAIN INCOMER & IB', margin + cellWidth * 3 + 3, stripY + 4.5);
  doc.setFontSize(7.2);
  doc.setTextColor(...emeraldTextColor);
  doc.text(`${msb.mainIncomerBreaker.description} (${msb.totalPlantCurrentAmps.toFixed(0)}A)`, margin + cellWidth * 3 + 3, stripY + 9.5);

  currentY += headerCardHeight + 5;

  // =========================================================================
  // 2. SECTION 1: MAIN SWITCH BOARD (MSB) 3-COLUMN OVERVIEW
  // =========================================================================
  checkPageBreak(50);

  // Section 1 Header Ribbon
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, contentWidth, 6, 1, 1, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(margin, currentY, contentWidth, 6, 1, 1, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text(`1. MAIN SWITCH BOARD (MSB): ${msb.code} — ${msb.name}`, margin + 3, currentY + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...slateTextColor);
  doc.text(
    `Building Diversity: ${(msb.overallBuildingDiversityFactor * 100).toFixed(0)}% · Target PF: ${msb.targetPowerFactor ?? 0.99}`,
    pageWidth - margin - 3,
    currentY + 4.2,
    { align: 'right' }
  );

  currentY += 8;

  // 3-Column Card Architecture
  const colGap = 3;
  const colWidth = (contentWidth - colGap * 2) / 3; // 60mm each
  const cardHeight = 35;

  // Column 1: Switchboard Parameters
  const col1X = margin;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(col1X, currentY, colWidth, cardHeight, 1.2, 1.2, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(col1X, currentY, colWidth, cardHeight, 1.2, 1.2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primaryColor);
  doc.text(msb.code, col1X + 3, currentY + 5.5);

  // 3-Phase Badge
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(col1X + colWidth - 25, currentY + 2.5, 22, 4.2, 0.8, 0.8, 'F');
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(col1X + colWidth - 25, currentY + 2.5, 22, 4.2, 0.8, 0.8, 'S');
  doc.setFontSize(5.8);
  doc.setTextColor(146, 64, 14);
  doc.text('3-Phase (4-Wire)', col1X + colWidth - 14, currentY + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...slateTextColor);
  doc.text(msb.name, col1X + 3, currentY + 10);

  doc.setDrawColor(...cardBorderColor);
  doc.line(col1X + 2, currentY + 12.5, col1X + colWidth - 2, currentY + 12.5);

  // Column 1 Parameter Rows
  const drawParamRow = (label: string, val: string, yPos: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...slateTextColor);
    doc.text(label, col1X + 3, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...primaryColor);
    doc.text(val, col1X + colWidth - 3, yPos, { align: 'right' });
  };
  drawParamRow('Overall Diversity:', `${msb.overallBuildingDiversityFactor ?? 0.8} (${((msb.overallBuildingDiversityFactor ?? 0.8) * 100).toFixed(0)}%)`, currentY + 17);
  drawParamRow('Target Power Factor:', `${msb.targetPowerFactor ?? 0.99}`, currentY + 22);
  drawParamRow('Transformer Margin:', `+${msb.safetyMarginPercent ?? 25}%`, currentY + 27);
  drawParamRow('Emergency Generator:', getGeneratorScopeShortLabel(msb.generatorSizingScope), currentY + 32);

  // Column 2: Calculated Incomer & Loads
  const col2X = margin + colWidth + colGap;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col2X, currentY, colWidth, cardHeight, 1.2, 1.2, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(col2X, currentY, colWidth, cardHeight, 1.2, 1.2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...primaryColor);
  doc.text('Calculated Incomer & Loads', col2X + 3, currentY + 5);

  doc.setDrawColor(...cardBorderColor);
  doc.line(col2X + 2, currentY + 7.5, col2X + colWidth - 2, currentY + 7.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...emeraldTextColor);
  doc.text(`Incomer: ${msb.mainIncomerBreaker.description}`, col2X + 3, currentY + 11.5);

  doc.setTextColor(...primaryColor);
  doc.text(`Busbar: ${msb.busbarSizing?.formattedDescription || `${msb.totalPlantCurrentAmps.toFixed(0)} A`}`, col2X + 3, currentY + 16);

  doc.setTextColor(...amberTextColor);
  doc.text(`Transformer: ${msb.transformerSizing.recommendedKVA} kVA (${msb.transformerSizing.loadingPercent.toFixed(1)}%)`, col2X + 3, currentY + 20.5);

  doc.setTextColor(...roseTextColor);
  doc.text(`Generator: ${msb.generatorSizing.recommendedPrimeKVA} kVA Prime (${msb.generatorSizing.loadingPercent.toFixed(1)}%)`, col2X + 3, currentY + 25);

  doc.setTextColor(...blueTextColor);
  doc.text(`Cap. Bank: ${msb.capacitorBankSizing.recommendedBankKVAr} kVAr@${msb.vRated ?? 525}V / ${Math.round(msb.capacitorBankSizing.totalConfiguredKVArSupply ?? 0)} kVAr@${msb.vSupply ?? 420}V`, col2X + 3, currentY + 29.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...slateTextColor);
  doc.text(msb.capacitorBankSizing.recommendedSteps || '0 steps configured', col2X + 3, currentY + 33.5);

  // Column 3: Phase Balance (R-Y-B) & Load Breakdown
  const col3X = margin + (colWidth + colGap) * 2;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col3X, currentY, colWidth, cardHeight, 1.2, 1.2, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(col3X, currentY, colWidth, cardHeight, 1.2, 1.2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...primaryColor);
  doc.text('Phase Balance (R-Y-B)', col3X + 3, currentY + 5);

  // Unbalance Badge
  const pb = msb.phaseBalance || {
    phaseR: { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 },
    phaseY: { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 },
    phaseB: { connectedKW: 0, connectedKVA: 0, demandKW: 0, demandKVA: 0, currentAmps: 0 },
    neutralCurrentAmps: 0,
    unbalancePercent: 0,
    status: 'OPTIMAL',
  };
  const unbalanceColor = pb.unbalancePercent <= 10 ? emeraldTextColor : pb.unbalancePercent <= 20 ? amberTextColor : roseTextColor;
  doc.setFillColor(pb.unbalancePercent <= 10 ? 236 : 254, pb.unbalancePercent <= 10 ? 253 : 243, pb.unbalancePercent <= 10 ? 245 : 199);
  doc.roundedRect(col3X + colWidth - 25, currentY + 2.5, 22, 4.2, 0.8, 0.8, 'F');
  doc.setFontSize(5.8);
  doc.setTextColor(...unbalanceColor);
  doc.text(`${pb.unbalancePercent.toFixed(1)}% (${pb.status})`, col3X + colWidth - 14, currentY + 5.5, { align: 'center' });

  // 3 Phase Graphical Progress Bars
  const pR = pb.phaseR.currentAmps;
  const pY = pb.phaseY.currentAmps;
  const pB = pb.phaseB.currentAmps;
  const maxPhaseAmps = Math.max(1, pR, pY, pB);
  const barTrackWidth = 24;
  const barStartX = col3X + 8;

  // Bar R
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(220, 38, 38);
  doc.text('R', col3X + 3, currentY + 9.5);
  doc.setFillColor(226, 232, 240);
  doc.rect(barStartX, currentY + 8, barTrackWidth, 1.8, 'F');
  doc.setFillColor(239, 68, 68);
  doc.rect(barStartX, currentY + 8, (pR / maxPhaseAmps) * barTrackWidth, 1.8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(...primaryColor);
  doc.text(`${pR.toFixed(1)} A`, col3X + colWidth - 3, currentY + 9.5, { align: 'right' });

  // Bar Y
  doc.setTextColor(202, 138, 4);
  doc.text('Y', col3X + 3, currentY + 12.5);
  doc.setFillColor(226, 232, 240);
  doc.rect(barStartX, currentY + 11, barTrackWidth, 1.8, 'F');
  doc.setFillColor(234, 179, 8);
  doc.rect(barStartX, currentY + 11, (pY / maxPhaseAmps) * barTrackWidth, 1.8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(...primaryColor);
  doc.text(`${pY.toFixed(1)} A`, col3X + colWidth - 3, currentY + 12.5, { align: 'right' });

  // Bar B
  doc.setTextColor(37, 99, 235);
  doc.text('B', col3X + 3, currentY + 15.5);
  doc.setFillColor(226, 232, 240);
  doc.rect(barStartX, currentY + 14, barTrackWidth, 1.8, 'F');
  doc.setFillColor(59, 130, 246);
  doc.rect(barStartX, currentY + 14, (pB / maxPhaseAmps) * barTrackWidth, 1.8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(...primaryColor);
  doc.text(`${pB.toFixed(1)} A`, col3X + colWidth - 3, currentY + 15.5, { align: 'right' });

  // Divider line
  doc.setDrawColor(...cardBorderColor);
  doc.line(col3X + 2, currentY + 17.5, col3X + colWidth - 2, currentY + 17.5);

  // 4 Load categories rows
  const drawLoadRow = (label: string, kw: number, kva: number, color: [number, number, number], yPos: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...slateTextColor);
    doc.text(label, col3X + 3, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...color);
    doc.text(`${kw.toFixed(1)} kW / ${kva.toFixed(1)} kVA`, col3X + colWidth - 3, yPos, { align: 'right' });
  };
  drawLoadRow('Total MD (Diversified):', msb.totalPlantMaximumDemandKW, msb.totalPlantMaximumDemandKVA, amberTextColor, currentY + 21.5);
  drawLoadRow('Total Essential Load:', totalEssentialKW, totalEssentialKVA, emeraldTextColor, currentY + 25.5);
  drawLoadRow('Total Fire Life-Safety:', totalFireSafetyKW, totalFireSafetyKVA, roseTextColor, currentY + 29.5);
  drawLoadRow('Total Connected Load:', msb.connectedLoadKW, msb.connectedLoadKVA, primaryColor, currentY + 33.5);

  currentY += cardHeight + 4;

  // =========================================================================
  // 3. MSB PHASE BALANCE TABLE (Exact Live Preview Format)
  // =========================================================================
  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [['MSB PHASE SYSTEM', 'CONNECTED (kW)', 'CONNECTED (kVA)', 'DEMAND (kW)', 'DEMAND (kVA)', 'CURRENT (A)', 'NEUTRAL CURRENT & SYMMETRY']],
    body: [
      ['Phase R (Red Line)', pb.phaseR.connectedKW.toFixed(1), pb.phaseR.connectedKVA.toFixed(1), pb.phaseR.demandKW.toFixed(1), pb.phaseR.demandKVA.toFixed(1), `${pb.phaseR.currentAmps.toFixed(1)} A`, 'Supply Line 1'],
      ['Phase Y (Yellow Line)', pb.phaseY.connectedKW.toFixed(1), pb.phaseY.connectedKVA.toFixed(1), pb.phaseY.demandKW.toFixed(1), pb.phaseY.demandKVA.toFixed(1), `${pb.phaseY.currentAmps.toFixed(1)} A`, `Neutral Current: ${pb.neutralCurrentAmps.toFixed(1)} A`],
      ['Phase B (Blue Line)', pb.phaseB.connectedKW.toFixed(1), pb.phaseB.connectedKVA.toFixed(1), pb.phaseB.demandKW.toFixed(1), pb.phaseB.demandKVA.toFixed(1), `${pb.phaseB.currentAmps.toFixed(1)} A`, `Unbalance: ${pb.unbalancePercent.toFixed(1)}% (${pb.status})`],
    ],
    styles: { fontSize: 6.8, cellPadding: 1.3 },
    headStyles: { fillColor: tableHeaderColor, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold', textColor: amberTextColor },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.row.index === 0 && data.column.index === 0) data.cell.styles.textColor = [220, 38, 38];
        if (data.row.index === 1 && data.column.index === 0) data.cell.styles.textColor = [202, 138, 4];
        if (data.row.index === 2 && data.column.index === 0) data.cell.styles.textColor = [37, 99, 235];
      }
    },
    margin: { left: margin, right: margin },
  });
  currentY = (doc as any).lastAutoTable.finalY + 5;

  // =========================================================================
  // 4. PFC CAPACITOR BANK SIZING & STEP LADDER SCHEDULE (With Specs Ribbon)
  // =========================================================================
  if (msb.capacitorBankSizing) {
    const cb = msb.capacitorBankSizing;
    checkPageBreak(42);

    // Header Strip
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'FD');
    doc.setDrawColor(...cardBorderColor);
    doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...primaryColor);
    doc.text(`PFC CAPACITOR BANK ENGINEERING & STEP LADDER SCHEDULE (${msb.code})`, margin + 3, currentY + 3.8);

    doc.setTextColor(...blueTextColor);
    doc.text(
      `${cb.recommendedBankKVAr} kVAr Bank · Main Incomer: ${cb.mainIncomerBreakerRating}A ACB/MCCB`,
      pageWidth - margin - 3,
      currentY + 3.8,
      { align: 'right' }
    );
    currentY += 7;

    // 6-Cell Technical Specifications Ribbon
    const ribbonHeight = 8.5;
    const ribbonCellW = contentWidth / 6;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, currentY, contentWidth, ribbonHeight, 1, 1, 'FD');
    doc.setDrawColor(...cardBorderColor);
    doc.roundedRect(margin, currentY, contentWidth, ribbonHeight, 1, 1, 'S');

    // Dividers
    for (let c = 1; c < 6; c++) {
      doc.line(margin + ribbonCellW * c, currentY, margin + ribbonCellW * c, currentY + ribbonHeight);
    }

    const drawRibbonCell = (idx: number, label: string, val: string, isColored?: boolean) => {
      const cellX = margin + ribbonCellW * idx + 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      doc.setTextColor(...slateMutedColor);
      doc.text(label, cellX, currentY + 3);
      doc.setFontSize(6.2);
      doc.setTextColor(...(isColored ? emeraldTextColor : primaryColor));
      doc.text(val, cellX, currentY + 6.8);
    };

    drawRibbonCell(0, 'VSUPPLY (OPERATING)', `${msb.vSupply ?? 420} V (50Hz)`);
    drawRibbonCell(1, 'VRATED (CAPACITOR)', `${msb.vRated ?? 525} V`);
    drawRibbonCell(2, 'DE-RATING RATIO', `(Vsup/Vrat)^2 = ${cb.ratio.toFixed(2)}`);
    drawRibbonCell(3, 'TARGET COS THETA', `${msb.initialPowerFactor ?? 0.8} -> ${msb.targetPowerFactor ?? 0.99}`);
    drawRibbonCell(4, 'REQUIRED Q', `${cb.requiredKVArSupply.toFixed(1)} kVAr @ ${msb.vSupply ?? 420}V`);
    drawRibbonCell(5, 'CONFIGURED LADDER', `${cb.totalConfiguredSteps ?? 0} of ${msb.capacitorStepsCount ?? 12} Steps Active`, true);

    currentY += ribbonHeight + 2;

    // Step Ladder Table
    const activeSteps = cb.steps.filter((s) => s.quantity > 0);
    const stepRows = (activeSteps.length > 0 ? activeSteps : cb.steps).map((s, idx) => [
      String(idx + 1),
      `${s.sizeKVAr} kVAr`,
      `${(s.sizeKVAr * cb.ratio).toFixed(1)} kVAr`,
      `${s.quantity} ${s.quantity === 1 ? 'unit' : 'units'}`,
      `${s.totalKVArRated} kVAr`,
      `${s.effectiveKVArSupply.toFixed(1)} kVAr`,
      `${s.operatingCurrentAmps.toFixed(2)} A`,
      `${s.proposedMCCBRating}A 3-Pole MCCB`,
    ]);

    stepRows.push([
      '',
      'TOTAL PFC CAPACITOR BANK:',
      '',
      `${cb.totalConfiguredSteps ?? 0} active steps`,
      `${cb.totalConfiguredKVArRated} kVAr`,
      `${Math.round(cb.totalConfiguredKVArSupply)} kVAr`,
      `FLC @ ${msb.vSupply ?? 420}V`,
      `${cb.mainIncomerBreakerRating}A 3-Pole ACB/MCCB`,
    ]);

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [
        [
          '#',
          `CAP. SIZE Q (@${msb.vRated ?? 525}V)`,
          `EFFECTIVE Q (@${msb.vSupply ?? 420}V)`,
          'CONFIGURED QTY',
          `TOTAL Q RATED (@${msb.vRated ?? 525}V)`,
          `EFFECTIVE Q (@${msb.vSupply ?? 420}V)`,
          'OPERATING CURRENT (1.5x FLC)',
          'PROPOSED STEP MCCB BREAKER',
        ],
      ],
      body: stepRows,
      styles: { fontSize: 6.2, cellPadding: 1.2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'right', fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'center' },
        4: { halign: 'right', fontStyle: 'bold', textColor: amberTextColor },
        5: { halign: 'right', fontStyle: 'bold', textColor: emeraldTextColor },
        6: { halign: 'right' },
        7: { halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === stepRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
          if (data.column.index === 7) data.cell.styles.textColor = blueTextColor;
        }
      },
      margin: { left: margin, right: margin },
    });
    currentY = (doc as any).lastAutoTable.finalY + 5;
  }

  // Direct Major Equipment Fed From MSB (if any)
  if (msbDirectLoads && msbDirectLoads.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primaryColor);
    doc.text(`Direct Major Equipment Connected to ${msb.code}`, margin, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['#', 'EQUIPMENT', 'CATEGORY', 'GENSET', 'QTY', 'UNIT (kW)', 'CL (kW)', 'PF', 'DF', 'MD (kW)', 'IB (A)', 'PROTECTIVE BREAKER']],
      body: msbDirectLoads.map((l, idx) => [
        String(idx + 1),
        `${l.code || ''} ${l.name}`,
        l.equipmentType,
        l.isEssential ? 'Essential' : 'Normal',
        String(l.quantity),
        (l.unitWatts / 1000).toFixed(1),
        l.connectedLoadKW.toFixed(1),
        l.powerFactor.toFixed(2),
        l.diversityFactor.toFixed(2),
        l.maximumDemandKW.toFixed(1),
        `${l.currentIb.toFixed(1)} A`,
        l.recommendedBreaker.description,
      ]),
      styles: { fontSize: 6.2, cellPadding: 1.1 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right', fontStyle: 'bold', textColor: amberTextColor },
        10: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });
    currentY = (doc as any).lastAutoTable.finalY + 5;
  }

  // =========================================================================
  // 5. SECTION 2: SUB-DISTRIBUTION BOARDS & DIRECT FEEDERS SCHEDULE
  // =========================================================================
  const totalFeedersCount = subDbs.length + directDbs.length;
  checkPageBreak(35);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text(`2. SUB-DISTRIBUTION BOARDS (SB) & DIRECT FEEDERS SCHEDULE (${totalFeedersCount} FEEDERS)`, margin + 3, currentY + 3.8);

  currentY += 7.5;

  // Build combined feeder rows: Sub-DBs + Direct MSB DBs
  const feederRows: string[][] = [
    ...subDbs.map((sb, idx) => [
      String(idx + 1),
      `${sb.code} (Sub-DB)`,
      sb.name,
      sb.msbId || msb.code,
      sb.connectedLoadKW.toFixed(1),
      sb.groupDiversityFactor.toFixed(2),
      sb.maximumDemandKW.toFixed(1),
      sb.maximumDemandKVA.toFixed(1),
      `${sb.incomerCurrentAmps.toFixed(1)} A`,
      sb.incomerBreaker?.description || 'N/A',
      sb.essentialGenset === 'FIRE_LIFT_SAFETY' ? 'Fire' : sb.essentialGenset === 'ESSENTIAL' ? 'Essential' : 'Normal',
      `${sb.incomerCable || 'N/A'}\n(${sb.cableLengthMeters ?? 35}m, ${(sb.voltageDropPercent ?? 0).toFixed(2)}% · ${(sb.voltageDropPercent ?? 0) <= 4.0 ? '<= 4% OK' : '> 4% High'})`,
    ]),
    ...directDbs.map((db, idx) => [
      String(subDbs.length + idx + 1),
      `${db.code} (Direct DB)`,
      db.name,
      `Direct (${msb.code})`,
      db.connectedLoadKW.toFixed(1),
      db.boardDiversityFactor.toFixed(2),
      db.maximumDemandKW.toFixed(1),
      db.maximumDemandKVA.toFixed(1),
      `${db.incomerCurrentAmps.toFixed(1)} A`,
      db.incomerBreaker.description,
      db.essentialGenset === 'FIRE_LIFT_SAFETY' ? 'Fire' : db.essentialGenset === 'ESSENTIAL' ? 'Essential' : 'Normal',
      `${db.incomerCable}\n(${db.cableLengthMeters ?? 25}m, ${(db.voltageDropPercent ?? 0).toFixed(2)}% · ${(db.voltageDropPercent ?? 0) <= 4.0 ? '<= 4% OK' : '> 4% High'})`,
    ]),
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    head: [
      [
        '#',
        'FEEDER CODE',
        'DESCRIPTION / ZONE',
        'SUPPLY SOURCE',
        'SUMMED CL (kW)',
        'DF',
        'MD (kW)',
        'MD (kVA)',
        'IB (A)',
        'INCOMER BREAKER',
        'ESSENTIAL',
        'FEEDER CABLE & VOLTAGE DROP',
      ],
    ],
    body: feederRows,
    styles: { fontSize: 6.2, cellPadding: 1.3 },
    headStyles: { fillColor: tableHeaderColor, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center' },
      1: { fontStyle: 'bold' },
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold', textColor: amberTextColor },
      7: { halign: 'right' },
      8: { halign: 'right' },
      10: { halign: 'center' },
    },
    didParseCell: (data) => {
      // Highlight direct DB rows
      if (data.row.index >= subDbs.length) {
        data.cell.styles.fillColor = [255, 251, 235]; // Light amber background
      }
    },
    margin: { left: margin, right: margin },
  });
  currentY = (doc as any).lastAutoTable.finalY + 6;

  // =========================================================================
  // 6. SECTION 3: FINAL DISTRIBUTION BOARDS & CIRCUIT SCHEDULES
  // =========================================================================
  checkPageBreak(30);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'FD');
  doc.setDrawColor(...cardBorderColor);
  doc.roundedRect(margin, currentY, contentWidth, 5.5, 1, 1, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text(`3. FINAL DISTRIBUTION BOARDS & CIRCUIT SCHEDULES (${dbs.length} BOARDS)`, margin + 3, currentY + 3.8);

  currentY += 7.5;

  dbs.forEach((db, dbIdx) => {
    // 1. Resolve upstream source label
    const isDirectMsb =
      db.subDbId === msb.id ||
      db.subDbId === msb.code ||
      (isPrimaryMsb && (db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === 'msb-main')) ||
      db.upstreamSourceType === 'MSB';
    const parentSubDb = !isDirectMsb ? subDbs.find((s) => s.id === db.subDbId || s.code === db.subDbId) : undefined;
    const sourceLabel = isDirectMsb ? `Direct MSB (${msb.code})` : parentSubDb?.code || db.subDbId;

    // 2. Voltage drop metrics
    const isSubDbFed = db.upstreamSourceType === 'SUBDB' && db.allowableVoltageDropPercent !== undefined;
    const allowableLimit = db.allowableVoltageDropPercent ?? 4.0;
    const dbVd = db.voltageDropPercent ?? 0;
    const dbVdV = db.voltageDropV ?? 0;
    const isVdOk = dbVd <= allowableLimit;
    const allowableShortText = isSubDbFed
      ? `<= ${allowableLimit.toFixed(2)}% ${isVdOk ? 'OK' : 'High'}`
      : `<= 4% ${isVdOk ? 'OK' : 'High'}`;

    // 3. Balance text
    const balanceText = db.isThreePhase
      ? `Unbalance: ${(db.phaseBalance?.unbalancePercent ?? 0).toFixed(1)}% (${db.phaseBalance?.status || 'OPTIMAL'})`
      : `L-N @ ${voltageSystem.Vln}V`;

    // 4. Badges (Phase & Genset)
    const phaseLabel = db.isThreePhase ? '3-Phase (4W)' : `1-Phase (Phase ${db.phase || 'R'} + N)`;
    const essentialLabel =
      db.essentialGenset && db.essentialGenset !== 'NORMAL'
        ? db.essentialGenset === 'FIRE_LIFT_SAFETY'
          ? 'Fire Life-Safety'
          : 'Essential Standby'
        : '';

    // =========================================================================
    // Integrated Board Header Bar (Matching Live Preview Layout)
    // Left: Code, Name, Badges + Feed info
    // Right: 2 Distinct Stat Blocks (MD/Incomer | Cable/VD)
    // =========================================================================
    const rightStatWidth = 72; // Width allocated to the 2 right stat blocks
    const leftWidth = contentWidth - rightStatWidth - 4; // Width for left titles & feed info

    const line1LeftText = `${dbIdx + 1}. ${db.code}  ${db.name}  [${phaseLabel}]${essentialLabel ? `  [${essentialLabel}]` : ''}`;
    const line2LeftText = `Fed by: ${sourceLabel}  ·  Board DF: ${(db.boardDiversityFactor * 100).toFixed(0)}%  ·  Margin: +${db.safetyMarginPercent ?? 10}%  ·  ${balanceText}`;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const leftLine1Wrapped: string[] = doc.splitTextToSize(line1LeftText, leftWidth);
    const leftLine2Wrapped: string[] = doc.splitTextToSize(line2LeftText, leftWidth);

    const leftTotalLines = leftLine1Wrapped.length + leftLine2Wrapped.length;
    const boxHeight = Math.max(12.5, 3.8 + leftTotalLines * 3.4 + 2);

    checkPageBreak(boxHeight + 22);

    // Draw Board Banner Container
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.2, 1.2, 'FD');
    doc.setDrawColor(...cardBorderColor);
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.2, 1.2, 'S');

    // --- Left Side: Title & Badges & Feed Info ---
    let leftY = currentY + 4.2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primaryColor);
    leftLine1Wrapped.forEach((line) => {
      doc.text(line, margin + 3, leftY);
      leftY += 3.5;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...slateTextColor);
    leftLine2Wrapped.forEach((line) => {
      doc.text(line, margin + 3, leftY);
      leftY += 3.3;
    });

    // --- Right Side: Integrated 2-Column Stats Block with Vertical Divider ---
    const rightStartX = margin + contentWidth - rightStatWidth;

    // Vertical Divider Line between Left and Right
    doc.setDrawColor(...cardBorderColor);
    doc.line(rightStartX - 2, currentY + 2, rightStartX - 2, currentY + boxHeight - 2);

    // Stat Column A: MD & Incomer
    const statAWidth = 34;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...amberTextColor);
    doc.text(`MD: ${db.maximumDemandKW.toFixed(2)} kW`, rightStartX + statAWidth - 2, currentY + 4.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...primaryColor);
    doc.text(`(${db.incomerCurrentAmps.toFixed(1)}A)`, rightStartX + statAWidth - 2, currentY + 8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...primaryColor);
    const incomerStr = `Incomer: ${db.incomerBreaker.description}`;
    const truncatedIncomer = doc.getTextWidth(incomerStr) > statAWidth ? db.incomerBreaker.description : incomerStr;
    doc.text(truncatedIncomer, rightStartX + statAWidth - 2, currentY + 11.5, { align: 'right' });

    // Vertical Divider between Stat A and Stat B
    const statBStartX = rightStartX + statAWidth + 2;
    doc.setDrawColor(...cardBorderColor);
    doc.line(statBStartX - 1, currentY + 2.5, statBStartX - 1, currentY + boxHeight - 2.5);

    // Stat Column B: Feeder Cable & Voltage Drop
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...primaryColor);
    let cableText = db.incomerCable;
    if (doc.getTextWidth(cableText) > 34) {
      while (doc.getTextWidth(cableText + '...') > 34 && cableText.length > 8) {
        cableText = cableText.slice(0, -1);
      }
      cableText += '...';
    }
    doc.text(cableText, rightStartX + rightStatWidth - 2, currentY + 4.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...slateTextColor);
    doc.text(
      `${db.cableLengthMeters ?? 25}m · VD: ${dbVd.toFixed(2)}% (${dbVdV.toFixed(2)}V)`,
      rightStartX + rightStatWidth - 2,
      currentY + 8,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...(isVdOk ? emeraldTextColor : roseTextColor));
    doc.text(allowableShortText, rightStartX + rightStatWidth - 2, currentY + 11.5, { align: 'right' });

    currentY += boxHeight + 2;

    // Circuit Schedule Table (Matching Live Preview Headers & Columns)
    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [
        [
          '#',
          'CIRCUIT DESCRIPTION',
          'CATEGORY',
          'PHASE',
          'QTY',
          'LOAD (W)',
          'PF',
          'DF',
          'CL (kW)',
          'MD (kW)',
          'IB (A)',
          'PROTECTIVE BREAKER',
          'CABLE SIZE',
        ],
      ],
      body: [
        ...db.circuits.map((c, cIdx) => [
          String(cIdx + 1),
          c.name,
          c.category,
          !db.isThreePhase ? '1P' : c.phase,
          String(c.quantity),
          String(c.unitWatts),
          c.powerFactor.toFixed(2),
          c.diversityFactor.toFixed(2),
          c.connectedLoadKW.toFixed(2),
          c.maximumDemandKW.toFixed(2),
          `${c.currentIb.toFixed(1)} A`,
          c.recommendedBreaker?.description || 'N/A',
          c.recommendedCable || 'N/A',
        ]),
        // Subtotal row
        [
          '',
          `TOTAL FOR ${db.code}:`,
          '',
          '',
          '',
          '',
          '',
          '',
          db.connectedLoadKW.toFixed(2),
          db.maximumDemandKW.toFixed(2),
          `${db.incomerCurrentAmps.toFixed(1)} A`,
          db.incomerBreaker.description,
          db.incomerCable,
        ],
      ],
      styles: { fontSize: 6, cellPadding: 1.1 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right', fontStyle: 'bold', textColor: amberTextColor },
        10: { halign: 'right' },
      },
      didParseCell: (data) => {
        // Highlight total row
        if (data.row.index === db.circuits.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
          if (data.column.index === 9) data.cell.styles.textColor = amberTextColor;
        }
      },
      margin: { left: margin, right: margin },
    });

    currentY = (doc as any).lastAutoTable.finalY + 5;
  });

  // =========================================================================
  // 7. FOOTERS: Page Numbers & Standard Disclaimer (Every Page)
  // =========================================================================
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);

    // Left footer: Standard & Timestamp
    doc.text(
      `Electric Load Calculator · IEC 60364 / BS 7671 · Generated ${new Date().toLocaleDateString()}`,
      margin,
      pageHeight - 6
    );

    // Right footer: Page count
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }

  // Trigger Save / Download
  const sanitizedName = (project.name || 'Load_Schedule_Report')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40);
  const msbTag = msb?.code ? `_${msb.code.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  doc.save(`${sanitizedName}${msbTag}_Load_Schedule.pdf`);
}
