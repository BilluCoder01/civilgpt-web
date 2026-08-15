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
  // 1. DESIGN STIPULATIONS
  // Defaults are based on the IS 10262:2019 Annex A M40
  // illustrative example.
  // ============================================================

  const [fck, setFck] =
    useState<number>(40);

  const [cementType, setCementType] =
    useState<string>("PPC");

  const [cementGrade, setCementGrade] =
    useState<string>("Actual strength / Curve 2");

  const [maxAggregateSize, setMaxAggregateSize] =
    useState<number>(20);

  const [exposureCondition, setExposureCondition] =
    useState<string>("Severe");

  const [slump, setSlump] =
    useState<number>(75);

  const [transportationTime, setTransportationTime] =
    useState<number>(0);

  const [placingMethod, setPlacingMethod] =
    useState<string>("Chute / Non-pumpable");

  const [siteControl, setSiteControl] =
    useState<string>("Good");

  const [aggregateType, setAggregateType] =
    useState<string>("Crushed Angular");

  // Fine aggregate type is separate from fine aggregate
  // grading zone.
  const [fineAggregateType, setFineAggregateType] =
    useState<string>("Natural Sand");

  // ------------------------------------------------------------
  // IMPORTANT:
  // This is the grading zone of the FINE AGGREGATE according
  // to IS 383, which is used by Table 5 of IS 10262.
  // ------------------------------------------------------------

  const [fineAggregateZone, setFineAggregateZone] =
    useState<string>("Zone II");

  const [chemicalAdmixture, setChemicalAdmixture] =
    useState<string>("Superplasticizer - Normal");

  const [mineralAdmixture, setMineralAdmixture] =
    useState<string>("None");

  const [earlyAgeRequirement, setEarlyAgeRequirement] =
    useState<string>("None");

  // ============================================================
  // 2. MATERIAL PROPERTIES
  // ============================================================

  const [sgCement, setSgCement] =
    useState<number>(2.88);

  const [sgFA, setSgFA] =
    useState<number>(2.65);

  const [sgCA, setSgCA] =
    useState<number>(2.74);

  const [faAbsorption, setFaAbsorption] =
    useState<number>(1.0);

  const [caAbsorption, setCaAbsorption] =
    useState<number>(0.5);

  const [faMoisture, setFaMoisture] =
    useState<number>(0);

  const [caMoisture, setCaMoisture] =
    useState<number>(0);

  const [chemicalAdmixtureSG, setChemicalAdmixtureSG] =
    useState<number>(1.145);

  const [chemicalAdmixtureDosage, setChemicalAdmixtureDosage] =
    useState<number>(1.0);

  const [mineralAdmixtureSG, setMineralAdmixtureSG] =
    useState<number>(2.90);

  const [mineralAdmixtureDosage, setMineralAdmixtureDosage] =
    useState<number>(0);

  // ============================================================
  // 3. DURABILITY / DESIGN LIMITS
  // ============================================================

  // For the Annex A benchmark this is initially the selected
  // free water-cement ratio.
  const [waterCementRatio, setWaterCementRatio] =
    useState<number>(0.36);

  const [maximumWaterCementRatio, setMaximumWaterCementRatio] =
    useState<number>(0.45);

  const [minimumCementContent, setMinimumCementContent] =
    useState<number>(320);

  const [maximumCementContent, setMaximumCementContent] =
    useState<number>(450);

  // IS 10262 Table 3 gives 1.0% entrapped air for 20 mm
  // nominal maximum size under normal non-air-entrained
  // conditions.
  const [entrappedAir, setEntrappedAir] =
    useState<number>(1.0);

  // ============================================================
  // 4. CURRENT CALCULATION VALUES
  //
  // These are retained temporarily so we do not silently change
  // the calculation engine before the next implementation stage.
  // ============================================================

  const [standardDeviation, setStandardDeviation] =
    useState<number>(5.0);

  const [waterContent, setWaterContent] =
    useState<number>(148);

  const [mixResult, setMixResult] =
    useState<MixResult | null>(null);

  // ============================================================
  // CALCULATE
  // ============================================================
  // IMPORTANT:
  // This calculation is still the transitional calculation.
  //
  // The next stage will replace it with the actual IS 10262
  // procedure, including:
  //
  // - Table 1 target-strength factor
  // - Table 2 assumed standard deviation
  // - Table 3 entrapped air
  // - Fig. 1 preliminary w/c selection
  // - IS 456 durability check
  // - Table 4 water content
  // - admixture-based water reduction
  // - Table 5 zone-based CA proportion
  // - absolute-volume aggregate calculation
  // - moisture/absorption correction
  // - SSD/dry aggregate reporting
  // ============================================================

  const calculateMix = () => {
    if (
      waterCementRatio <= 0 ||
      sgCement <= 0 ||
      sgFA <= 0 ||
      sgCA <= 0 ||
      waterContent <= 0
    ) {
      setMixResult(null);
      return;
    }

    const targetStrength =
      fck +
      1.65 *
        standardDeviation;

    const cement =
      waterContent /
      waterCementRatio;

    const cementVolume =
      cement /
      (sgCement * 1000);

    const waterVolume =
      waterContent /
      1000;

    const airVolume =
      entrappedAir / 100;

    const aggregateVolume =
      1 -
      (
        cementVolume +
        waterVolume +
        airVolume
      );

    // Temporary calculation only.
    // The final implementation will use Table 5 and the
    // selected fine aggregate zone.
    const coarseAggregateVolume =
      aggregateVolume * 0.60;

    const fineAggregateVolume =
      aggregateVolume *
      0.40;

    const coarseAggregateMass =
      coarseAggregateVolume *
      sgCA *
      1000;

    const fineAggregateMass =
      fineAggregateVolume *
      sgFA *
      1000;

    setMixResult({
      targetStrength:
        targetStrength.toFixed(2),

      cement:
        cement.toFixed(2),

      water:
        waterContent.toFixed(2),

      fa:
        fineAggregateMass.toFixed(2),

      ca:
        coarseAggregateMass.toFixed(2),

      ratio:
        `1 : ${(fineAggregateMass / cement).toFixed(
          2
        )} : ${(coarseAggregateMass / cement).toFixed(
          2
        )}`,
    });
  };

  // ============================================================
  // STYLES
  // ============================================================

  const labelClass =
    `block text-[13px] font-medium mb-1.5 ${
      isDarkMode
        ? "text-slate-300"
        : "text-slate-700"
    }`;

  const inputClass =
    `w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
      isDarkMode
        ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
        : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
    }`;

  const sectionTitleClass =
    `text-[12px] font-semibold uppercase tracking-wider mb-4 ${
      isDarkMode
        ? "text-slate-500"
        : "text-slate-500"
    }`;

  const sectionClass =
    `rounded-[24px] border p-6 ${
      isDarkMode
        ? "bg-[#131314] border-slate-800"
        : "bg-[#f8fafc] border-slate-200"
    }`;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
      <div className="max-w-5xl mx-auto w-full">

        {/* ================================================== */}
        {/* HEADER                                            */}
        {/* ================================================== */}

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

              <div>
                <label className={labelClass}>
                  Cement Type
                </label>

                <select
                  value={
                    cementType
                  }
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
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Cement Strength Basis
                </label>

                <select
                  value={
                    cementGrade
                  }
                  onChange={(e) =>
                    setCementGrade(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Actual strength / Curve 2">
                    Actual strength / Curve 2
                  </option>

                  <option value="OPC 33">
                    OPC 33
                  </option>

                  <option value="OPC 43">
                    OPC 43
                  </option>

                  <option value="OPC 53">
                    OPC 53
                  </option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Maximum Aggregate Size
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

                  <option value={20}>
                    20 mm
                  </option>

                  <option value={40}>
                    40 mm
                  </option>
                </select>
              </div>

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

              <div>
                <label className={labelClass}>
                  Slump at Placement (mm)
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

              <div>
                <label className={labelClass}>
                  Transportation Time (min)
                </label>

                <input
                  type="number"
                  min="0"
                  value={
                    transportationTime
                  }
                  onChange={(e) =>
                    setTransportationTime(
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
                  Method of Placing
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
                  <option value="Chute / Non-pumpable">
                    Chute / Non-pumpable
                  </option>

                  <option value="Pumping">
                    Pumping
                  </option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Degree of Site Control
                </label>

                <select
                  value={
                    siteControl
                  }
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
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Coarse Aggregate Type
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

                  <option value="Sub-angular">
                    Sub-angular
                  </option>

                  <option value="Gravel with some crushed particles">
                    Gravel with some crushed particles
                  </option>

                  <option value="Rounded Gravel">
                    Rounded Gravel
                  </option>

                  <option value="Manufactured / Other">
                    Manufactured / Other
                  </option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Fine Aggregate Type
                </label>

                <select
                  value={
                    fineAggregateType
                  }
                  onChange={(e) =>
                    setFineAggregateType(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Natural Sand">
                    Natural Sand
                  </option>

                  <option value="Crushed Stone Sand">
                    Crushed Stone Sand
                  </option>

                  <option value="Gravel Sand">
                    Gravel Sand
                  </option>

                  <option value="Manufactured Sand">
                    Manufactured Sand
                  </option>

                  <option value="Mixed Sand">
                    Mixed Sand
                  </option>
                </select>
              </div>

              {/* ------------------------------------------------ */}
              {/* NEW: FINE AGGREGATE GRADING ZONE                */}
              {/* ------------------------------------------------ */}

              <div>
                <label className={labelClass}>
                  Fine Aggregate Grading Zone
                </label>

                <select
                  value={
                    fineAggregateZone
                  }
                  onChange={(e) =>
                    setFineAggregateZone(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Zone I">
                    Zone I — Coarse
                  </option>

                  <option value="Zone II">
                    Zone II — Medium
                  </option>

                  <option value="Zone III">
                    Zone III — Fine
                  </option>

                  <option value="Zone IV">
                    Zone IV — Very Fine
                  </option>
                </select>

                <p
                  className={`mt-1.5 text-[10px] ${
                    isDarkMode
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  Based on fine aggregate grading
                  under IS 383; used with Table 5.
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Chemical Admixture
                </label>

                <select
                  value={
                    chemicalAdmixture
                  }
                  onChange={(e) =>
                    setChemicalAdmixture(
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

                  <option value="Superplasticizer - Normal">
                    Superplasticizer - Normal
                  </option>

                  <option value="Superplasticizer - High">
                    Superplasticizer - High
                  </option>
                </select>
              </div>

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

              <div>
                <label className={labelClass}>
                  Early Age Requirement
                </label>

                <select
                  value={
                    earlyAgeRequirement
                  }
                  onChange={(e) =>
                    setEarlyAgeRequirement(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="None">
                    None
                  </option>

                  <option value="Early Strength Required">
                    Early Strength Required
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
              <div>
                <label className={labelClass}>
                  Cement Specific Gravity
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    sgCement
                  }
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

              <div>
                <label className={labelClass}>
                  Fine Aggregate SG (SSD)
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    sgFA
                  }
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

              <div>
                <label className={labelClass}>
                  Coarse Aggregate SG (SSD)
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    sgCA
                  }
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

              <div>
                <label className={labelClass}>
                  FA Moisture Content (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    faMoisture
                  }
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

              <div>
                <label className={labelClass}>
                  CA Moisture Content (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    caMoisture
                  }
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

              <div>
                <label className={labelClass}>
                  Chemical Admixture SG
                </label>

                <input
                  type="number"
                  step="0.001"
                  value={
                    chemicalAdmixtureSG
                  }
                  onChange={(e) =>
                    setChemicalAdmixtureSG(
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
                  Chemical Admixture Dosage (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    chemicalAdmixtureDosage
                  }
                  onChange={(e) =>
                    setChemicalAdmixtureDosage(
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
              <div>
                <label className={labelClass}>
                  Selected W/C Ratio
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    waterCementRatio
                  }
                  onChange={(e) =>
                    setWaterCementRatio(
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
                  Maximum W/C Ratio
                </label>

                <input
                  type="number"
                  step="0.01"
                  value={
                    maximumWaterCementRatio
                  }
                  onChange={(e) =>
                    setMaximumWaterCementRatio(
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
                  Minimum Cement (kg/m³)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    minimumCementContent
                  }
                  onChange={(e) =>
                    setMinimumCementContent(
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
                  Maximum Cement (kg/m³)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    maximumCementContent
                  }
                  onChange={(e) =>
                    setMaximumCementContent(
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
                  Entrapped Air (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={
                    entrappedAir
                  }
                  onChange={(e) =>
                    setEntrappedAir(
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
          {/* CURRENT OUTPUT                                     */}
          {/* ================================================== */}

          <div
            className={`border-t pt-8 ${
              isDarkMode
                ? "border-slate-800"
                : "border-slate-200"
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">

              <div className="space-y-5">

                <div>
                  <label className={labelClass}>
                    Assumed Standard Deviation
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      standardDeviation
                    }
                    onChange={(e) =>
                      setStandardDeviation(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={inputClass}
                  />

                  <p
                    className={`mt-1.5 text-[10px] ${
                      isDarkMode
                        ? "text-slate-600"
                        : "text-slate-400"
                    }`}
                  >
                    Replace with actual established
                    standard deviation when sufficient
                    test data are available.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>
                    Working Water Content (kg/m³)
                  </label>

                  <input
                    type="number"
                    step="0.1"
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

                  <p
                    className={`mt-1.5 text-[10px] ${
                      isDarkMode
                        ? "text-slate-600"
                        : "text-slate-400"
                    }`}
                  >
                    Default value is from the selected
                    Annex A benchmark; final water demand
                    is to be verified by trials.
                  </p>
                </div>

                <div
                  className={`rounded-[18px] border border-dashed p-4 text-[12px] leading-relaxed ${
                    isDarkMode
                      ? "border-slate-700 text-slate-500"
                      : "border-slate-300 text-slate-500"
                  }`}
                >
                  <p>
                    <strong>
                      Calculation engine status:
                    </strong>
                  </p>

                  <p className="mt-1">
                    The input structure now follows
                    the data required for IS 10262:2019.
                    The next stage will connect these
                    values to the standard's calculation
                    sequence.
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

              {/* OUTPUT */}

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
                        {
                          mixResult.cement
                        }{" "}
                        kg
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
                        {
                          mixResult.water
                        }{" "}
                        kg
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
                        {
                          mixResult.fa
                        }{" "}
                        kg
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
                        {
                          mixResult.ca
                        }{" "}
                        kg
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
                        {
                          mixResult.ratio
                        }
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
                      Enter the design parameters
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