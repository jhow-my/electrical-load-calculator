import React, { useState } from 'react';
import {
  MainSwitchBoard,
  SubDistributionBoard,
  DistributionBoard,
  MsbDirectLoad,
  VoltageSystem,
} from '../types/electrical';
import {
  Zap,
  ArrowRight,
  ShieldCheck,
  Flame,
  BatteryCharging,
  Cpu,
  GitMerge,
  LayoutGrid,
} from 'lucide-react';

interface SingleLineDiagramProps {
  msb: MainSwitchBoard;
  subDbs: SubDistributionBoard[];
  dbs: DistributionBoard[];
  directLoads: MsbDirectLoad[];
  onNavigateToDb: (dbId: string) => void;
  onNavigateToSubDb: (subDbId: string) => void;
  onNavigateToMsb: () => void;
  voltageSystem: VoltageSystem;
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  msb,
  subDbs,
  dbs,
  directLoads,
  onNavigateToDb,
  onNavigateToSubDb,
  onNavigateToMsb,
  voltageSystem,
}) => {
  // Mobile/Tablet layout toggle: 'schematic' (standard busbar) or 'compact' (vertical stacked cards)
  const [viewMode, setViewMode] = useState<'schematic' | 'compact'>('schematic');
  const directDbs = dbs.filter(
    (db) => db.subDbId === 'MSB' || db.subDbId === 'msb' || db.subDbId === msb.id
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Title & Legend Bar - Bright Theme */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 fill-amber-500/20" />
            Interactive Single Line Diagram (SLD) & Power Flow
          </h2>
          <p className="text-xs text-slate-500">
            Click any board to edit its parameters or circuit schedule.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Mobile/Tablet View Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('schematic')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'schematic'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Busbar Schematic Layout"
            >
              <GitMerge className="w-3.5 h-3.5 text-amber-600" />
              <span>Schematic</span>
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'compact'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Responsive Tree Layout (Mobile Friendly)"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
              <span>Tree View</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-3 font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span className="text-slate-600">MSB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              <span className="text-slate-600">Sub-DB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-slate-600">Final DB</span>
            </div>
          </div>
        </div>
      </div>

      {/* SCHEMATIC VIEW (Horizontal Electrical Drawing Canvas) */}
      {viewMode === 'schematic' && (
        <div className="bg-slate-50/70 rounded-2xl p-4 sm:p-6 text-slate-900 border border-slate-200/90 shadow-xs overflow-x-auto">
          <div className="min-w-[820px] space-y-6">
            {/* LEVEL 3: MSB ROOT CARD */}
            <div className="flex justify-center">
              <div className="relative w-full max-w-2xl bg-white border-2 border-amber-500 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shadow-2xs">
                      <Zap className="w-5 h-5 fill-amber-500/20" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-amber-700 uppercase tracking-widest font-bold block">
                        Level 3 Main Intake
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 font-mono">
                        {msb.code}
                      </h3>
                      <p className="text-xs text-slate-500">{msb.name}</p>
                    </div>
                  </div>

                  <button
                    onClick={onNavigateToMsb}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <span>Edit MSB</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {/* MSB Metrics */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-4 pt-3 border-t border-slate-100 text-xs font-mono">
                  <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/60">
                    <span className="text-slate-500 block text-[11px]">Total Plant MD</span>
                    <span className="text-sm sm:text-base font-bold text-amber-800 block mt-0.5">
                      {msb.totalPlantMaximumDemandKW.toFixed(1)} kW
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {msb.totalPlantMaximumDemandKVA.toFixed(1)} kVA
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Main Busbar Current</span>
                    <span className="text-sm sm:text-base font-bold text-slate-900 block mt-0.5">
                      {msb.totalPlantCurrentAmps.toFixed(0)} A
                    </span>
                    <span className="text-[11px] text-slate-500">
                      3P @ {voltageSystem.Vll}V
                    </span>
                  </div>

                  <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200/60">
                    <span className="text-slate-500 block text-[11px]">Incomer ACB</span>
                    <span className="text-xs sm:text-sm font-bold text-emerald-800 block mt-0.5 truncate">
                      {msb.mainIncomerBreaker?.description || `${msb.mainIncomerBreaker?.rating}A 4-Pole ACB`}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      4-Pole Main Incomer
                    </span>
                  </div>
                </div>

                {/* Equipment Chips */}
                <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px] font-mono text-slate-600 flex-wrap">
                  <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-600" />
                    Tx: {msb.transformerSizing?.recommendedKVA} kVA (
                    {msb.transformerSizing?.loadingPercent.toFixed(0)}% load)
                  </span>
                  <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-rose-600" />
                    Gen: {msb.generatorSizing?.recommendedPrimeKVA} kVA Prime
                  </span>
                  <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1" title={`${msb.capacitorBankSizing?.recommendedSteps} (${msb.capacitorBankSizing?.totalConfiguredKVArSupply?.toFixed(1)} kVAr effective @ ${msb.vSupply ?? 420}V)`}>
                    <BatteryCharging className="w-3 h-3 text-blue-600" />
                    Cap: {msb.capacitorBankSizing?.recommendedBankKVAr} kVAr ({msb.capacitorBankSizing?.totalConfiguredSteps || msb.capacitorStepsCount || 12}S @ {msb.vRated ?? 525}V)
                  </span>
                  <span className="bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-800 font-semibold">
                    DF: ×{msb.overallBuildingDiversityFactor.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Vertical Busbar Trunk Line */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-amber-500" />
            </div>

            {/* MAIN HORIZONTAL BUSBAR */}
            <div className="relative border-t-2 border-amber-500 mx-6">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white border border-amber-300 px-3 py-0.5 rounded-full text-[10px] font-mono text-amber-800 font-bold tracking-wider shadow-2xs">
                MAIN {voltageSystem.Vll}V DISTRIBUTION BUSBAR
              </span>
            </div>

            {/* LEVEL 2 & MAJOR LOADS FAN-OUT GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
              {/* SUB-DB BRANCHES */}
              {subDbs.map((sb) => {
                const linkedDbs = dbs.filter((d) => d.subDbId === sb.id);
                return (
                  <div
                    key={sb.id}
                    className="bg-white border border-blue-200 hover:border-blue-400 rounded-xl p-4 transition-all duration-200 shadow-xs flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-blue-600 uppercase tracking-wider block font-semibold">
                              Level 2 Sub-Board
                            </span>
                            <h4 className="text-sm sm:text-base font-bold font-mono text-slate-900">
                              {sb.code}
                            </h4>
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigateToSubDb(sb.id)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                          title="View Sub-DB"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-slate-500">{sb.name}</p>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Sub-DB MD:</span>
                          <span className="font-bold text-amber-700">
                            {sb.maximumDemandKW.toFixed(1)} kW ({sb.maximumDemandKVA.toFixed(1)} kVA)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Feeder Current:</span>
                          <span className="text-slate-900 font-semibold">
                            {sb.incomerCurrentAmps.toFixed(1)} A
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Incomer Breaker:</span>
                          <span className="text-emerald-700 font-semibold truncate max-w-[170px]">
                            {sb.incomerBreaker?.description || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                          <span>Group Diversity:</span>
                          <span className="text-blue-700 font-semibold">
                            ×{sb.groupDiversityFactor.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Voltage Drop (from MSB):</span>
                          <span className="text-slate-800 font-semibold">
                            {(sb.voltageDropPercent ?? 0).toFixed(2)}% (≤ 4% OK)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* LEVEL 1: Connected Final DBs */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                      <span className="text-[10px] font-mono text-emerald-700 uppercase tracking-wider block font-semibold">
                        Fed Final DBs ({linkedDbs.length}):
                      </span>

                      <div className="space-y-1.5">
                        {linkedDbs.map((db) => {
                          const allowableLimit = Math.max(0, 4.0 - (sb.voltageDropPercent ?? 0));
                          const dbVd = db.voltageDropPercent ?? 0;
                          const isExceeded = dbVd + (sb.voltageDropPercent ?? 0) > 4.0 || dbVd > allowableLimit;
                          return (
                            <button
                              key={db.id}
                              onClick={() => onNavigateToDb(db.id)}
                              className="w-full text-left bg-slate-50 hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded p-2 transition-colors flex items-center justify-between text-xs font-mono group"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                                    {db.code}
                                  </span>
                                  <span
                                    className={`px-1 py-0.2 rounded text-[9px] font-sans font-bold border ${
                                      db.isThreePhase
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : (db.phase || 'R') === 'R'
                                        ? 'bg-red-50 text-red-800 border-red-200'
                                        : db.phase === 'Y'
                                        ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                                        : 'bg-blue-50 text-blue-800 border-blue-200'
                                    }`}
                                  >
                                    {db.isThreePhase ? '3P' : `1P-${db.phase || 'R'}`}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-sans block truncate max-w-[150px]">
                                  {db.name}
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-amber-700 font-bold block">
                                  {db.maximumDemandKW.toFixed(1)} kW
                                </span>
                                <span className={`text-[10px] block ${isExceeded ? 'text-rose-600 font-bold' : 'text-slate-500'}`} title={`Dynamic allowable limit: 4% - ${(sb.voltageDropPercent ?? 0).toFixed(2)}% (Sub-DB) = ≤ ${allowableLimit.toFixed(2)}% OK`}>
                                  ΔV: {dbVd.toFixed(2)}% ({isExceeded ? `> ${allowableLimit.toFixed(2)}% High` : `≤ ${allowableLimit.toFixed(2)}% OK`})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* DIRECT MAJOR LOADS FEEDER COLUMN (IF ANY) */}
              {directLoads.length > 0 && (
                <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-8 h-8 rounded bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-amber-700 uppercase tracking-wider block font-semibold">
                          Direct MSB Feeders
                        </span>
                        <h4 className="text-sm sm:text-base font-bold font-mono text-slate-900">
                          Major Plant Equipment
                        </h4>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mt-2 mb-3">
                      Connected directly to main busbar without intermediate sub-boards.
                    </p>

                    <div className="space-y-2">
                      {directLoads.map((load) => (
                        <div
                          key={load.id}
                          className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-mono"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <span className="font-bold text-slate-900 block">{load.name}</span>
                              <span className="text-[11px] text-slate-500 font-sans">
                                {load.equipmentType}
                              </span>
                            </div>
                            {load.isEssential && (
                              <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-sans font-medium">
                                Fire Lift-Safety
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center mt-2 pt-1.5 border-t border-slate-200 text-[11px]">
                            <span className="text-amber-700 font-bold">
                              {load.maximumDemandKW.toFixed(1)} kW ({load.currentIb.toFixed(0)} A)
                            </span>
                            <span className="text-slate-600 truncate max-w-[120px]">
                              {load.recommendedBreaker?.description || 'N/A'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DIRECT FINAL DBS FEEDER COLUMN (IF ANY DIRECTLY FED FROM MSB) */}
              {directDbs.length > 0 && (
                <div className="bg-white border border-emerald-300 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-8 h-8 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-emerald-700 uppercase tracking-wider block font-semibold">
                          Direct MSB Feeders
                        </span>
                        <h4 className="text-sm sm:text-base font-bold font-mono text-slate-900">
                          Final DBs ({directDbs.length})
                        </h4>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mt-2 mb-3">
                      Distribution boards fed directly from the MSB main busbar without intermediate Sub-DBs.
                    </p>

                    <div className="space-y-2">
                      {directDbs.map((db) => (
                        <button
                          key={db.id}
                          onClick={() => onNavigateToDb(db.id)}
                          className="w-full text-left bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-lg p-2.5 transition-colors flex items-center justify-between text-xs font-mono group"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                                {db.code}
                              </span>
                              <span className="px-1 py-0.2 rounded text-[9px] font-sans font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {db.isThreePhase ? '3P' : `1P-${db.phase || 'R'}`}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-sans block truncate max-w-[150px]">
                              {db.name}
                            </span>
                          </div>

                            <div className="text-right">
                              <span className="text-amber-700 font-bold block">
                                {db.maximumDemandKW.toFixed(1)} kW
                              </span>
                              <span className="text-[10px] text-slate-500 block" title="Direct from MSB: Allowable voltage drop is ≤ 4.00%">
                                {db.incomerCurrentAmps.toFixed(0)}A · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}% (≤ 4% OK)
                              </span>
                            </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPACT / MOBILE RESPONSIVE TREE VIEW (100% width on mobile/tablet without side scrolling) */}
      {viewMode === 'compact' && (
        <div className="space-y-4">
          {/* MSB Card */}
          <div className="bg-white border-2 border-amber-500 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <Zap className="w-4 h-4 fill-amber-500/20" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-amber-700 uppercase font-bold block">
                    Level 3 MSB Plant
                  </span>
                  <h3 className="text-sm font-bold font-mono text-slate-900">{msb.code}</h3>
                </div>
              </div>
              <button
                onClick={onNavigateToMsb}
                className="px-2.5 py-1 bg-amber-500 text-slate-950 font-semibold rounded text-xs flex items-center gap-1"
              >
                <span>Edit</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs font-mono">
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">MD</span>
                <span className="font-bold text-amber-700">{msb.totalPlantMaximumDemandKW.toFixed(1)} kW</span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">I</span>
                <span className="font-bold text-slate-900">{msb.totalPlantCurrentAmps.toFixed(0)} A</span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">ACB</span>
                <span className="font-bold text-emerald-700">{msb.mainIncomerBreaker.rating}A</span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Tx</span>
                <span className="font-bold text-slate-900">{msb.transformerSizing.recommendedKVA} kVA</span>
              </div>
            </div>
          </div>

          {/* Sub-DBs List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold font-mono text-slate-700 uppercase tracking-wider">
              Level 2 Sub-Distribution Boards ({subDbs.length}):
            </h4>

            {subDbs.map((sb) => {
              const linkedDbs = dbs.filter((d) => d.subDbId === sb.id);
              return (
                <div key={sb.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-blue-700">{sb.code}</span>
                      <span className="text-xs text-slate-700 font-sans block">{sb.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-amber-700 block">
                        {sb.maximumDemandKW.toFixed(1)} kW
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 block">
                        {sb.incomerBreaker.description || `${sb.incomerBreaker.rating}A ${sb.incomerBreaker.type}`}
                      </span>
                    </div>
                  </div>

                  {/* Connected DBs */}
                  <div className="pl-3 border-l-2 border-amber-400 space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block">
                      Connected DBs:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {linkedDbs.map((db) => {
                        const allowableLimit = Math.max(0, 4.0 - (sb.voltageDropPercent ?? 0));
                        const dbVd = db.voltageDropPercent ?? 0;
                        const isExceeded = dbVd + (sb.voltageDropPercent ?? 0) > 4.0 || dbVd > allowableLimit;
                        return (
                          <button
                            key={db.id}
                            onClick={() => onNavigateToDb(db.id)}
                            className="text-left bg-slate-50 hover:bg-amber-50/50 border border-slate-200 rounded p-2 text-xs flex justify-between items-center transition-colors"
                          >
                            <div>
                              <span className="font-bold text-slate-900 font-mono block">{db.code}</span>
                              <span className="text-[11px] text-slate-500 truncate max-w-[140px] block">
                                {db.name}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-amber-700 font-semibold block">
                                {db.maximumDemandKW.toFixed(1)} kW
                              </span>
                              <span className={`text-[10px] font-mono ${isExceeded ? 'text-rose-600 font-bold' : 'text-slate-500'}`} title={`Dynamic allowable limit: 4% - ${(sb.voltageDropPercent ?? 0).toFixed(2)}% (Sub-DB) = ≤ ${allowableLimit.toFixed(2)}% OK`}>
                                ΔV: {dbVd.toFixed(2)}% ({isExceeded ? `> ${allowableLimit.toFixed(2)}% High` : `≤ ${allowableLimit.toFixed(2)}% OK`})
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Directly Fed DBs from MSB (Tree View) */}
            {directDbs.length > 0 && (
              <div className="bg-white border border-emerald-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-emerald-800 uppercase tracking-wider">
                    Directly-Fed Final DBs ({directDbs.length}):
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {directDbs.map((db) => (
                    <button
                      key={db.id}
                      onClick={() => onNavigateToDb(db.id)}
                      className="text-left bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 rounded p-2 text-xs flex justify-between items-center transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{db.code}</span>
                          <span className="text-[10px] font-sans font-bold text-emerald-700">
                            {db.isThreePhase ? '3P' : `1P-${db.phase || 'R'}`}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 truncate max-w-[140px] block">
                          {db.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-amber-700 font-semibold block">
                          {db.maximumDemandKW.toFixed(1)} kW
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block" title="Direct from MSB: Allowable voltage drop is ≤ 4.00%">
                          {db.incomerCurrentAmps.toFixed(0)}A · ΔV: {(db.voltageDropPercent ?? 0).toFixed(2)}% (≤ 4% OK)
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Direct Major Loads */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-2">
            <h4 className="text-xs font-bold font-mono text-slate-700 uppercase tracking-wider">
              Direct Major Equipment ({directLoads.length}):
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              {directLoads.map((load) => (
                <div key={load.id} className="bg-slate-50 p-2 rounded border border-slate-200 flex justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">{load.name}</span>
                    <span className="text-[10px] text-slate-500">{load.equipmentType}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-700">{load.maximumDemandKW.toFixed(1)} kW</span>
                    <span className="text-[10px] text-slate-500 block">{load.recommendedBreaker.rating}A</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
