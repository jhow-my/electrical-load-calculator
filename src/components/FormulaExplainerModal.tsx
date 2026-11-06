import React from 'react';
import { X, BookOpen, Layers, ShieldCheck, Zap } from 'lucide-react';

interface FormulaExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormulaExplainerModal: React.FC<FormulaExplainerModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Electrical Maximum Demand & Sizing Methodology
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Standard Engineering Hierarchy: DB → Sub-DB → MSB Plant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: DB Level */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-mono">
              1
            </span>
            <span>Level 1: Final Distribution Board (DB) Calculation</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5 font-mono">
            <p className="text-slate-700 font-sans">
              <strong>Process:</strong> Group final sub-circuits (lighting, socket outlets, HVAC,
              appliances), apply circuit-specific diversity factor (DF), and aggregate to obtain DB
              Maximum Demand.
            </p>

            <div className="bg-white p-3 rounded border border-slate-200/80 space-y-1.5 text-slate-800">
              <div>
                <span className="text-slate-500">Connected Load (CL):</span>{' '}
                <code>CL_kW = (Quantity × Unit_Watts) / 1000</code>
              </div>
              <div>
                <span className="text-slate-500">Circuit Maximum Demand:</span>{' '}
                <code>MD_circuit_kW = CL_kW × DF_circuit</code>
              </div>
              <div>
                <span className="text-slate-500">Circuit Design Current (Ib):</span>
                <br />
                <span className="pl-4 text-slate-600">
                  1-Phase: <code>Ib = (MD_kVA × 1000) / V_LN</code>
                </span>
                <br />
                <span className="pl-4 text-slate-600">
                  3-Phase: <code>Ib = (MD_kVA × 1000) / (√3 × V_LL)</code>
                </span>
              </div>
              <div>
                <span className="text-slate-500">Automatic Breaker Sizing Rule:</span>{' '}
                <code>In ≥ Ib</code> (Nearest standard rating e.g., 10A, 16A, 20A, 32A).
              </div>
              <div>
                <span className="text-slate-500">DB Maximum Demand & Design Current (Ib):</span>{' '}
                <code>DB_MD_kW = (∑ MD_circuit_kW) × DF_board</code>
                <span className="block text-[11px] text-slate-500 font-sans mt-0.5">
                  Design Current (Ib) strictly represents diversified operational demand without artificial inflation.
                </span>
              </div>
              <div>
                <span className="text-slate-500">Overcurrent Protective Device (Breaker) Sizing:</span>{' '}
                <code>Required Breaker Capacity ≥ Ib / Utilization</code>
                <span className="block text-[11px] text-slate-500 font-sans mt-0.5">
                  Utilization factor (e.g., 80% = 0.80) ensures protective devices operate safely within continuous capacity without nuisance tripping while allowing controlled headroom.
                </span>
              </div>
              <div>
                <span className="text-slate-500">DB Incomer Sizing (3-Phase vs 1-Phase Option):</span>
                <br />
                <span className="pl-4 text-slate-600">
                  3-Phase DB: <code>I_incomer = max(I_balanced, max(I_R, I_Y, I_B))</code> where <code>I_balanced = (DB_MD_kVA × 1000) / (√3 × V_LL)</code>. Sized to accommodate the heaviest loaded phase to prevent individual breaker poles from tripping.
                </span>
                <br />
                <span className="pl-4 text-slate-600">
                  1-Phase DB: <code>I_incomer = (DB_MD_kVA × 1000) / V_LN</code> → 2-Pole Incomer (Phase + Neutral) & 3-Core Cable.
                </span>
              </div>
              <div>
                <span className="text-slate-500">Phase Unbalance % (3-Phase Boards):</span>{' '}
                <code>Unbalance = [(I_max - I_min) / I_avg] × 100%</code>
              </div>
              <div className="pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-bold text-amber-700">Cable Voltage Drop (ΔV) Calculation (BS 7671 Appendix 4 / IEC 60364-5-52):</span>
                <br />
                <span className="pl-4 text-slate-700">
                  Absolute Drop: <code>ΔV (Volts) = (mV/A/m × Ib × L) / 1000</code>
                </span>
                <br />
                <span className="pl-4 text-slate-700">
                  Percentage Drop: <code>% Drop = (ΔV / V_system) × 100%</code>
                </span>
                <div className="mt-2 pl-4 text-[11px] text-slate-600 font-sans space-y-1 bg-amber-50/60 p-2.5 rounded border border-amber-200/60">
                  <span className="font-semibold text-amber-900 block font-mono text-xs">
                    Hierarchical Upstream Voltage Drop Validation (≤ 4.0% Overall Budget from MSB):
                  </span>
                  <div>
                    • <strong>Sub-DBs (fed directly from MSB):</strong> Maximum allowable voltage drop check figure remains <code>≤ 4.0% OK</code>.
                  </div>
                  <div>
                    • <strong>DBs fed directly from MSB:</strong> Maximum allowable voltage drop check figure remains <code>≤ 4.0% OK</code>.
                  </div>
                  <div>
                    • <strong>DBs fed from Sub-DBs:</strong> Maximum allowable check figure is dynamically adjusted:
                    <code className="block mt-0.5 ml-2 font-mono text-slate-800">
                      Allowable DB Limit = 4.0% - (Parent Sub-DB % Voltage Drop)
                    </code>
                    <span className="text-slate-500 text-[10.5px] block mt-0.5 ml-2">
                      e.g., if parent Sub-DB drop is 1.20%, DB allowable limit is <strong>≤ 2.80% OK</strong>, ensuring cumulative drop (1.20% + 2.80%) ≤ 4.00% from MSB.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Sub-DB Level */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-mono">
              2
            </span>
            <span>Level 2: Sub-Distribution Board (SB / Sub-DB) Calculation</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5 font-mono">
            <p className="text-slate-700 font-sans">
              <strong>Process:</strong> Sum all linked DB Maximum Demands, then apply the Sub-DB group
              diversity factor (typically 0.75 to 0.90) to account for non-coincident peak hours
              between different floor areas or tenant zones.
            </p>

            <div className="bg-white p-3 rounded border border-slate-200/80 space-y-1.5 text-slate-800">
              <div>
                <span className="text-slate-500">Sub-DB Maximum Demand:</span>{' '}
                <code>SubDB_MD_kW = (∑ DB_MD_kW) × DF_group</code>
              </div>
              <div>
                <span className="text-slate-500">Sub-DB Incomer Current (Ib):</span>{' '}
                <code>I_SB = (SubDB_MD_kVA × 1000) / (√3 × V_LL)</code>
              </div>
              <div>
                <span className="text-slate-500">Sub-DB Incomer Breaker Sizing:</span>{' '}
                <code>Required Breaker Capacity ≥ I_SB / Utilization</code>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: MSB Level */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-mono">
              3
            </span>
            <span>Level 3: Main Switch Board (MSB) & Plant Sizing</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5 font-mono">
            <p className="text-slate-700 font-sans">
              <strong>Process:</strong> Sum Sub-DB Maximum Demands + Add Direct Major Equipment (Central
              Chillers, Elevators, Fire Pumps) → Apply Overall Building Diversity Factor → Total Plant
              Maximum Demand.
            </p>

            <div className="bg-white p-3 rounded border border-slate-200/80 space-y-2 text-slate-800">
              <div>
                <span className="text-slate-500">Total Plant Maximum Demand:</span>{' '}
                <code>Plant_MD_kW = (∑ SubDB_MD_kW + ∑ MajorLoads_MD_kW) × DF_building</code>
              </div>
              <div>
                <span className="text-slate-500">Main Busbar Current:</span>{' '}
                <code>I_MSB = (Plant_MD_kVA × 1000) / (√3 × V_LL)</code>
              </div>
              <div>
                <span className="text-slate-500">Main Incomer Breaker Sizing:</span>{' '}
                <code>Required Breaker Capacity ≥ I_MSB / TX_Utilization</code> (e.g., at 80% utilization, sized In ≥ I_MSB / 0.80 across MCB, MCCB, ACB range).
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500">Main Busbar Sizing & Thermal Withstand (IEC 61439 & IEC 60865):</span>
                </div>
                <div className="pl-4 text-slate-600">
                  Step 1 (Continuous Ampacity): <code>A_req = I_D / J</code> (Target Current Density: Cu = 1.4 A/mm², Al = 0.7 A/mm²).
                </div>
                <div className="pl-4 text-slate-600">
                  Step 2 (Short-Circuit Thermal Withstand): <code>A_min ≥ (I_cw × √t) / k</code> (Default I_cw = 65 kA, t = 1.0 s, k_Cu = 143, k_Al = 110).
                </div>
                <div className="pl-4 text-slate-600">
                  Step 3 (Sizing Selection): <code>A_design = max(A_req, A_min)</code>. Sized to standard busbar reference table (e.g. 1200 mm² = 2 × 100 × 6mm). Thinner parallel bars enhance heat dissipation and mitigate skin effect at 50/60 Hz.
                </div>
              </div>
              <div>
                <span className="text-slate-500">Transformer Sizing (IEC 60076):</span>{' '}
                <code>kVA_target = Plant_MD_kVA / TX_Utilization</code>. Sized to standard ratings
                [500, 630, 800, 1000, 1250, 1600, 2000, 2500 kVA] operating at target utilization.
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500 font-semibold">Emergency Diesel Generator Sizing (ISO 8528 / NFPA 110):</span>
                </div>
                <div className="pl-4 text-slate-600">
                  Step 1 (Basis Load S_basis across Scopes):
                  <div className="pl-3 space-y-0.5 mt-0.5 text-[11px]">
                    <div>• <b>Scope A (Fire Lift-Safety + Essential):</b> <code>S_basis = Σ(Fire Lift-Safety Feeders) + Σ(Essential Feeders) + Σ(Essential Major Loads)</code>.</div>
                    <div>• <b>Scope B (Fire Lift-Safety Load ONLY):</b> <code>S_basis = Σ(Fire Lift-Safety Feeders & Fire Pump/Elevator Loads)</code>.</div>
                    <div>• <b>Scope C (Essential Load ONLY):</b> <code>S_basis = Σ(Essential Feeders & Essential Facility Loads)</code>.</div>
                    <div>• <b>Scope D (100% Full Plant Standby):</b> <code>S_basis = Total Plant Maximum Demand kVA</code>.</div>
                  </div>
                </div>
                <div className="pl-4 text-slate-600">
                  Step 2 (Motor Inrush & Headroom): <code>S_required = S_basis × 1.25</code> (+25% safety margin accommodates motor DOL/soft starting inrush currents and Class G2/G3 step-load voltage dip mitigation).
                </div>
                <div className="pl-4 text-slate-600">
                  Step 3 (Standard Commercial Rating): <code>S_prime = min&#123; r ∈ STANDARD_RATINGS | r ≥ S_required &#125;</code> from standard commercial ratings [50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 650, 800, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500 kVA].
                </div>
                <div className="pl-4 text-slate-600">
                  Step 4 (Standby Rating): <code>S_standby = round(S_prime × 1.10)</code> (Standby power ESP rating provides 10% emergency overload capacity).
                </div>
                <div className="pl-4 text-slate-600">
                  Step 5 (Full Load Current): <code>I_FLC = (S_prime × 1000) / (√3 × V_LL)</code>.
                </div>
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500">Capacitor Bank (PFC) Base Reactive Sizing:</span>{' '}
                  <code>Q_supply (kVAr) = Plant_MD_kW × [tan(θ1) - tan(θ2)]</code> where <code>θ1 = arccos(PF_initial)</code>, <code>θ2 = arccos(PF_target)</code>.
                </div>
                <div>
                  <span className="text-slate-500">Voltage De-rating & Rated Nameplate Rating:</span>{' '}
                  <code>Q_rated = Q_supply × (V_rated / V_supply)²</code> (e.g. at V_rated = 525V & V_supply = 420V, Ratio = 0.64, so 525V capacitors require 1.5625x nameplate rating).
                </div>
                <div>
                  <span className="text-slate-500">Automatic APFC Step Ladder (Binary Stepping):</span>{' '}
                  Configures 5, 10, 20, 40, 80, 160, 320, 640 kVAr stages according to controller steps (default 12 steps) with fine-tuning stages and bulk stages.
                </div>
                <div>
                  <span className="text-slate-500">Step & Main Incomer Breaker Sizing (IEC 60831):</span>{' '}
                  <code>I_cap = (V_supply / V_rated)² × [Q_rated × 1000 / (√3 × V_supply)] × 1.5</code> (1.5x safety factor accounts for harmonics, tolerance, and inrush). MCCBs selected to standard ratings [15, 30, 60, 125, 250, 500, 1600 A].
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
