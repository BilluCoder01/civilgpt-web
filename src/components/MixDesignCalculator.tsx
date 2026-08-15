"use client";

import { useState } from "react";

type MixResult = {
  targetStrength: string;
  cement: string;
  water: string;
  fa: string;
  ca: string;
  ratio: string;
};

type MixDesignCalculatorProps = {
  isDarkMode: boolean;
};

export default function MixDesignCalculator({
  isDarkMode,
}: MixDesignCalculatorProps) {
  // ============================================================
  // EXISTING CALCULATOR VALUES
  // ============================================================

  const [fck, setFck] = useState<number>(25);
  const [stdDev, setStdDev] = useState<number>(4);
  const [wcRatio, setWcRatio] = useState<number>(0.5);

  const [sgCement, setSgCement] =
    useState<number>(3.15);

  const [sgFA, setSgFA] =
    useState<number>(2.74);

  const [sgCA, setSgCA] =
    useState<number>(2.74);

  const [waterContent, setWaterContent] =
    useState<number>(186);

  // ============================================================
  // NEW DESIGN STIPULATION INPUTS
  // ============================================================

  const [cementType, setCementType] =
    useState<string>("OPC");

  const [maxAggregateSize, setMaxAggregateSize] =
    useState<number>(20);

  const [exposureCondition, setExposureCondition] =
    useState<string>("Moderate");

  const [slump, setSlump] =
    useState<number>(75);

  const [placingMethod, setPlacingMethod] =
    useState<string>("Normal");

  const [siteControl, setSiteControl] =
    useState<string>("Good");

  const [aggregateType, setAggregateType] =
    useState<string>("Crushed Angular");

  const [admixtureType, setAdmixtureType] =
    useState<string>("None");

  const [mineralAdmixture, setMineralAdmixture] =
    useState<string>("None");

  // ============================================================
  // NEW MATERIAL PROPERTY INPUTS
  // ============================================================

  const [faAbsorption, setFaAbsorption] =
    useState<number>(1.0);

  const [caAbsorption, setCaAbsorption] =
    useState<number>(0.5);

  const [faMoisture, setFaMoisture] =
    useState<number>(0);

  const [caMoisture, setCaMoisture] =
    useState<number>(0);

  const [admixtureSG, setAdmixtureSG] =
    useState<number>(1.10);

  const [admixtureDosage, setAdmixtureDosage] =
    useState<number>(0);

  const [mineralAdmixtureSG, setMineralAdmixtureSG] =
    useState<number>(2.90);

  const [mineralAdmixtureDosage, setMineralAdmixtureDosage] =
    useState<number>(0);

  // ============================================================
  // NEW DURABILITY / LIMIT INPUTS
  // ============================================================

  const [maxWcRatio, setMaxWcRatio] =
    useState<number>(0.50);

  const [minCementContent, setMinCementContent] =
    useState<number>(300);

  const [maxCementContent, setMaxCementContent] =
    useState<number>(450);

  const [airContent, setAirContent] =
    useState<number>(2);

  // ============================================================
  // RESULT
  // ============================================================

  const [mixResult, setMixResult] =
    useState<MixResult | null>(null);

  // ============================================================
  // CURRENT CALCULATION
  // ============================================================
  // IMPORTANT:
  // These calculations are intentionally kept compatible with
  // the existing calculator for now.
  //
  // The newly-added inputs are UI/data fields only at this stage.
  // We will connect them to the actual IS 10262 workflow next.
  // ============================================================

  const calculateMix = () => {
    if (
      wcRatio <= 0 ||
      sgCement <= 0 ||
      sgFA <= 0 ||
      sgCA <= 0 ||
      waterContent < 0
    ) {
      setMixResult(null);
      return;
    }

    const targetStrength =
      fck + 1.65 * stdDev;

    const cement =
      waterContent / wcRatio;

    const volCement =
      cement /
      (sgCement * 1000);

    const volWater =
      waterContent / 1000;

    const volAir =
      airContent / 100;

    const volAggregates =
      1 -
      (volCement +
        volWater +
        volAir);

    const volCA =
      volAggregates * 0.60;

    const volFA =
      volAggregates * 0.40;

    const massCA =
      volCA * sgCA * 1000;

    const massFA =
      volFA * sgFA * 1000;

    setMixResult({
      targetStrength:
        targetStrength.toFixed(2),

      cement:
        cement.toFixed(2),

      water:
        waterContent.toFixed(2),

      fa:
        massFA.toFixed(2),

      ca:
        massCA.toFixed(2),

      ratio:
        `1 : ${(massFA / cement).toFixed(
          2
        )} : ${(massCA / cement).toFixed(
          2
        )}`,
    });
  };

  // ============================================================
  // COMMON STYLES
  // ============================================================

  const labelClass = `block text-[13px] font-medium mb-1.5 ${
    isDarkMode
      ? "text-slate-300"
      : "text-slate-700"
  }`;

  const inputClass = `w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
    isDarkMode
      ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
      : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
  }`;

  const sectionTitleClass = `text-[12px] font-semibold uppercase tracking-wider mb-4 ${
    isDarkMode
      ? "text-slate-500"
      : "text-slate-500"
  }`;

  const sectionClass = `rounded-[24px] border p-6 ${
    isDarkMode
      ? "bg-[#131314] border-slate-800"
      : "bg-[#f8fafc] border-slate-200"
  }`;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
      <div className="max-w-5xl mx-auto w-full">

        {/* ==================================================== */}
        {/* HEADER                                                */}
        {/* ==================================================== */}

        <div
          className={`border rounded-[32px] p-8 md:p-10 shadow-sm mt-8 md:mt-2 transition-colors ${
            isDarkMode
              ? "bg-[#1e1f20] border-slate-800"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="mb-8">
            <h2
              className={`text-3xl font-medium tracking-tight ${
                isDarkMode
                  ? "text-white"
                  : "text-slate-800"
              }`}
            >
              Mix Design Calculator
            </h2>

            <p
              className={`mt-2 text-[15px] ${
                isDarkMode
                  ? "text-slate-400"
                  : "text-slate-500"
              }`}
            >
              IS 10262:2019 Concrete Mix Design
            </p>
          </div>

          {/* ================================================== */}
          {/* DESIGN STIPULATIONS                                */}
          {/* ================================================== */}

          <div className="mb-6">
            <h3 className={sectionTitleClass}>
              1. Design Stipulations
            </h3>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${sectionClass}`}
            >
              {/* Grade */}
              <div>
                <label className={labelClass}>
                  Concrete Grade
                </label>

                <select
                  value={fck}
                  onChange={(e) =>
                    setFck(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                >
                  <option value={20}>
                    M20
                  </option>
                  <option value={25}>
                    M25
                  </option>
                  <option value={30}>
                    M30
                  </option>
                  <option value={35}>
                    M35
                  </option>
                  <option value={40}>
                    M40
                  </option>
                  <option value={45}>
                    M45
                  </option>
                  <option value={50}>
                    M50
                  </option>
                </select>
              </div>

              {/* Cement */}
              <div>
                <label className={labelClass}>
                  Cement Type
                </label>

                <select
                  value={cementType}
                  onChange={(e) =>
                    setCementType(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="OPC">
                    OPC
                  </option>
                  <option value="PPC">
                    PPC
                  </option>
                  <option value="PSC">
                    PSC
                  </option>
                  <option value="Other">
                    Other
                  </option>
                </select>
              </div>

              {/* Aggregate Size */}
              <div>
                <label className={labelClass}>
                  Max Aggregate Size
                </label>

                <select
                  value={
                    maxAggregateSize
                  }
                  onChange={(e) =>
                    setMaxAggregateSize(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                >
                  <option value={10}>
                    10 mm
                  </option>
                  <option value={12.5}>
                    12.5 mm
                  </option>
                  <option value={20}>
                    20 mm
                  </option>
                  <option value={40}>
                    40 mm
                  </option>
                </select>
              </div>

              {/* Exposure */}
              <div>
                <label className={labelClass}>
                  Exposure Condition
                </label>

                <select
                  value={
                    exposureCondition
                  }
                  onChange={(e) =>
                    setExposureCondition(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Mild">
                    Mild
                  </option>
                  <option value="Moderate">
                    Moderate
                  </option>
                  <option value="Severe">
                    Severe
                  </option>
                  <option value="Very Severe">
                    Very Severe
                  </option>
                  <option value="Extreme">
                    Extreme
                  </option>
                </select>
              </div>

              {/* Slump */}
              <div>
                <label className={labelClass}>
                  Slump / Workability (mm)
                </label>

                <input
                  type="number"
                  min="0"
                  value={slump}
                  onChange={(e) =>
                    setSlump(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Placing Method */}
              <div>
                <label className={labelClass}>
                  Placing Method
                </label>

                <select
                  value={
                    placingMethod
                  }
                  onChange={(e) =>
                    setPlacingMethod(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Normal">
                    Normal
                  </option>
                  <option value="Pump">
                    Pumped
                  </option>
                  <option value="Trunk">
                    Chute / Trunk
                  </option>
                  <option value="Manual">
                    Manual
                  </option>
                </select>
              </div>

              {/* Site Control */}
              <div>
                <label className={labelClass}>
                  Degree of Site Control
                </label>

                <select
                  value={siteControl}
                  onChange={(e) =>
                    setSiteControl(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Good">
                    Good
                  </option>
                  <option value="Fair">
                    Fair
                  </option>
                  <option value="Poor">
                    Poor
                  </option>
                </select>
              </div>

              {/* Aggregate Type */}
              <div>
                <label className={labelClass}>
                  Aggregate Type
                </label>

                <select
                  value={
                    aggregateType
                  }
                  onChange={(e) =>
                    setAggregateType(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Crushed Angular">
                    Crushed Angular
                  </option>
                  <option value="Crushed Rounded">
                    Crushed Rounded
                  </option>
                  <option value="Natural Rounded">
                    Natural Rounded
                  </option>
                </select>
              </div>

              {/* Chemical Admixture */}
              <div>
                <label className={labelClass}>
                  Chemical Admixture
                </label>

                <select
                  value={
                    admixtureType
                  }
                  onChange={(e) =>
                    setAdmixtureType(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="None">
                    None
                  </option>
                  <option value="Plasticizer">
                    Plasticizer
                  </option>
                  <option value="Superplasticizer">
                    Superplasticizer
                  </option>
                  <option value="Retarder">
                    Retarder
                  </option>
                  <option value="Accelerator">
                    Accelerator
                  </option>
                </select>
              </div>

              {/* Mineral Admixture */}
              <div>
                <label className={labelClass}>
                  Mineral Admixture
                </label>

                <select
                  value={
                    mineralAdmixture
                  }
                  onChange={(e) =>
                    setMineralAdmixture(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="None">
                    None
                  </option>
                  <option value="Fly Ash">
                    Fly Ash
                  </option>
                  <option value="GGBS">
                    GGBS
                  </option>
                  <option value="Silica Fume">
                    Silica Fume
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* ================================================== */}
          {/* MATERIAL PROPERTIES                                */}
          {/* ================================================== */}

          <div className="mb-6">
            <h3 className={sectionTitleClass}>
              2. Material Properties
            </h3>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${sectionClass}`}
            >
              {/* Cement SG */}
              <div>
                <label className={labelClass}>
                  Cement Specific Gravity
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={sgCement}
                  onChange={(e) =>
                    setSgCement(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* FA SG */}
              <div>
                <label className={labelClass}>
                  Fine Aggregate SG
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={sgFA}
                  onChange={(e) =>
                    setSgFA(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* CA SG */}
              <div>
                <label className={labelClass}>
                  Coarse Aggregate SG
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={sgCA}
                  onChange={(e) =>
                    setSgCA(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* FA Absorption */}
              <div>
                <label className={labelClass}>
                  FA Water Absorption (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    faAbsorption
                  }
                  onChange={(e) =>
                    setFaAbsorption(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* CA Absorption */}
              <div>
                <label className={labelClass}>
                  CA Water Absorption (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    caAbsorption
                  }
                  onChange={(e) =>
                    setCaAbsorption(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* FA Moisture */}
              <div>
                <label className={labelClass}>
                  FA Moisture Content (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={faMoisture}
                  onChange={(e) =>
                    setFaMoisture(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* CA Moisture */}
              <div>
                <label className={labelClass}>
                  CA Moisture Content (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={caMoisture}
                  onChange={(e) =>
                    setCaMoisture(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Chemical Admixture SG */}
              <div>
                <label className={labelClass}>
                  Chemical Admixture SG
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    admixtureSG
                  }
                  onChange={(e) =>
                    setAdmixtureSG(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Chemical Admixture Dosage */}
              <div>
                <label className={labelClass}>
                  Chemical Admixture Dosage (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    admixtureDosage
                  }
                  onChange={(e) =>
                    setAdmixtureDosage(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Mineral Admixture SG */}
              <div>
                <label className={labelClass}>
                  Mineral Admixture SG
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    mineralAdmixtureSG
                  }
                  onChange={(e) =>
                    setMineralAdmixtureSG(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Mineral Admixture Dosage */}
              <div>
                <label className={labelClass}>
                  Mineral Admixture Dosage (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    mineralAdmixtureDosage
                  }
                  onChange={(e) =>
                    setMineralAdmixtureDosage(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* ================================================== */}
          {/* DURABILITY / DESIGN LIMITS                         */}
          {/* ================================================== */}

          <div className="mb-8">
            <h3 className={sectionTitleClass}>
              3. Durability & Design Limits
            </h3>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${sectionClass}`}
            >
              {/* Max W/C */}
              <div>
                <label className={labelClass}>
                  Maximum W/C Ratio
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={maxWcRatio}
                  onChange={(e) =>
                    setMaxWcRatio(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Min Cement */}
              <div>
                <label className={labelClass}>
                  Minimum Cement (kg/m³)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    minCementContent
                  }
                  onChange={(e) =>
                    setMinCementContent(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Max Cement */}
              <div>
                <label className={labelClass}>
                  Maximum Cement (kg/m³)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    maxCementContent
                  }
                  onChange={(e) =>
                    setMaxCementContent(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>

              {/* Air */}
              <div>
                <label className={labelClass}>
                  Entrapped Air (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={airContent}
                  onChange={(e) =>
                    setAirContent(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* ================================================== */}
          {/* CURRENT CALCULATION AREA                          */}
          {/* ================================================== */}

          <div
            className={`border-t pt-8 ${
              isDarkMode
                ? "border-slate-800"
                : "border-slate-200"
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">

              {/* CURRENT CALCULATION INPUTS */}

              <div className="space-y-5">
                <div>
                  <label className={labelClass}>
                    Standard Deviation (s) - N/mm²
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={stdDev}
                    onChange={(e) =>
                      setStdDev(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Current Design W/C Ratio
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={wcRatio}
                    onChange={(e) =>
                      setWcRatio(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Current Water Content (kg/m³)
                  </label>

                  <input
                    type="number"
                    value={
                      waterContent
                    }
                    onChange={(e) =>
                      setWaterContent(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={inputClass}
                  />
                </div>

                <div className="rounded-[18px] border border-dashed p-4 text-[12px] leading-relaxed">
                  <p
                    className={
                      isDarkMode
                        ? "text-slate-500"
                        : "text-slate-500"
                    }
                  >
                    The new design inputs above are
                    currently stored but are not yet
                    connected to the calculation engine.
                    The calculation logic will be upgraded
                    in the next stage.
                  </p>
                </div>

                <button
                  onClick={
                    calculateMix
                  }
                  className={`w-full py-3.5 mt-2 rounded-[24px] font-medium text-[14px] transition-colors shadow-sm ${
                    isDarkMode
                      ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                      : "bg-slate-800 text-white hover:bg-slate-700"
                  }`}
                >
                  Calculate
                </button>
              </div>

              {/* RESULTS */}

              <div
                className={`rounded-[24px] p-8 h-full transition-colors border ${
                  isDarkMode
                    ? "bg-[#131314] border-slate-800"
                    : "bg-[#f0f4f9] border-transparent"
                }`}
              >
                <h3
                  className={`text-[12px] font-medium uppercase tracking-wider mb-5 ${
                    isDarkMode
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  Current Output per m³
                </h3>

                {mixResult ? (
                  <div className="space-y-4">

                    <div
                      className={`flex justify-between items-end border-b pb-2.5 ${
                        isDarkMode
                          ? "border-slate-700/50"
                          : "border-slate-200/60"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${
                          isDarkMode
                            ? "text-slate-400"
                            : "text-slate-600"
                        }`}
                      >
                        Target Mean Strength
                      </span>

                      <span
                        className={`text-[16px] font-medium ${
                          isDarkMode
                            ? "text-slate-200"
                            : "text-slate-800"
                        }`}
                      >
                        {
                          mixResult.targetStrength
                        }{" "}
                        N/mm²
                      </span>
                    </div>

                    <div
                      className={`flex justify-between items-end border-b pb-2.5 ${
                        isDarkMode
                          ? "border-slate-700/50"
                          : "border-slate-200/60"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${
                          isDarkMode
                            ? "text-slate-400"
                            : "text-slate-600"
                        }`}
                      >
                        Cement
                      </span>

                      <span
                        className={`text-[16px] font-medium ${
                          isDarkMode
                            ? "text-amber-400"
                            : "text-slate-800"
                        }`}
                      >
                        {mixResult.cement} kg
                      </span>
                    </div>

                    <div
                      className={`flex justify-between items-end border-b pb-2.5 ${
                        isDarkMode
                          ? "border-slate-700/50"
                          : "border-slate-200/60"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${
                          isDarkMode
                            ? "text-slate-400"
                            : "text-slate-600"
                        }`}
                      >
                        Water
                      </span>

                      <span
                        className={`text-[16px] font-medium ${
                          isDarkMode
                            ? "text-slate-200"
                            : "text-slate-800"
                        }`}
                      >
                        {mixResult.water} kg
                      </span>
                    </div>

                    <div
                      className={`flex justify-between items-end border-b pb-2.5 ${
                        isDarkMode
                          ? "border-slate-700/50"
                          : "border-slate-200/60"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${
                          isDarkMode
                            ? "text-slate-400"
                            : "text-slate-600"
                        }`}
                      >
                        Fine Aggregate
                      </span>

                      <span
                        className={`text-[16px] font-medium ${
                          isDarkMode
                            ? "text-slate-200"
                            : "text-slate-800"
                        }`}
                      >
                        {mixResult.fa} kg
                      </span>
                    </div>

                    <div
                      className={`flex justify-between items-end border-b pb-2.5 ${
                        isDarkMode
                          ? "border-slate-700/50"
                          : "border-slate-200/60"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${
                          isDarkMode
                            ? "text-slate-400"
                            : "text-slate-600"
                        }`}
                      >
                        Coarse Aggregate
                      </span>

                      <span
                        className={`text-[16px] font-medium ${
                          isDarkMode
                            ? "text-slate-200"
                            : "text-slate-800"
                        }`}
                      >
                        {mixResult.ca} kg
                      </span>
                    </div>

                    <div className="pt-4 mt-4">
                      <p
                        className={`text-[12px] mb-1 font-medium ${
                          isDarkMode
                            ? "text-slate-500"
                            : "text-slate-500"
                        }`}
                      >
                        Current Mix Ratio
                      </p>

                      <p
                        className={`text-[26px] font-medium tracking-tight ${
                          isDarkMode
                            ? "text-white"
                            : "text-slate-800"
                        }`}
                      >
                        {mixResult.ratio}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`h-full flex flex-col items-center justify-center text-center space-y-3 pb-12 ${
                      isDarkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    <p className="text-[14px]">
                      Enter your design parameters
                      and click Calculate.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}