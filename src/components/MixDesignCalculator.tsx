"use client";

import { useMemo, useState } from "react";

type MixDesignCalculatorProps = {
  isDarkMode: boolean;
};

type ExposureLimits = {
  maxWaterBinderRatio: number;
  minCementitiousContent: number;
  minGrade: number | null;
};

type MixResult = {
  targetStrength: number;

  characteristicStrength: number;
  standardDeviation: number;
  xFactor: number;

  preliminaryWaterBinderRatio: number;
  durabilityMaximumWaterBinderRatio: number;
  adoptedWaterBinderRatio: number;
  actualWaterBinderRatio: number;

  baseWaterContent: number;
  shapeAdjustedWaterContent: number;
  slumpAdjustedWaterContent: number;
  admixtureWaterReduction: number;
  freeWaterContent: number;

  cementitiousContent: number;
  cementContent: number;
  mineralAdmixtureContent: number;
  chemicalAdmixtureContent: number;

  entrappedAir: number;

  baseCoarseAggregateFraction: number;
  correctedCoarseAggregateFraction: number;
  fineAggregateFraction: number;

  totalAggregateVolume: number;
  coarseAggregateVolume: number;
  fineAggregateVolume: number;

  coarseAggregateSSD: number;
  fineAggregateSSD: number;

  coarseAggregateDry: number;
  fineAggregateDry: number;

  waterToAdd: number;

  mixRatio: string;

  yield: number;

  cementCheckPassed: boolean;
  maximumCementCheckPassed: boolean;
  durabilityCheckPassed: boolean;
  minimumGradeCheckPassed: boolean;

  warnings: string[];
};

// ============================================================
// IS 10262:2019 TABLE VALUES
// ============================================================

const WATER_CONTENT_TABLE: Record<
  10 | 20 | 40,
  number
> = {
  10: 208,
  20: 186,
  40: 165,
};

const ENTRAPPED_AIR_TABLE: Record<
  10 | 20 | 40,
  number
> = {
  10: 1.5,
  20: 1.0,
  40: 0.8,
};

/*
 * Table 5:
 *
 * Volume of coarse aggregate per unit volume of total aggregate
 * at water-cement/water-cementitious-material ratio = 0.50.
 *
 * IS 10262:2019
 *
 * The code table is:
 *
 *             Zone I   Zone II   Zone III   Zone IV
 * 10 mm        0.48      0.50      0.52       0.54
 * 20 mm        0.60      0.62      0.64       0.66
 * 40 mm        0.69      0.71      0.72       0.73
 */

const COARSE_AGGREGATE_TABLE: Record<
  10 | 20 | 40,
  Record<
    "Zone I" |
      "Zone II" |
      "Zone III" |
      "Zone IV",
    number
  >
> = {
  10: {
    "Zone I": 0.48,
    "Zone II": 0.50,
    "Zone III": 0.52,
    "Zone IV": 0.54,
  },

  20: {
    "Zone I": 0.60,
    "Zone II": 0.62,
    "Zone III": 0.64,
    "Zone IV": 0.66,
  },

  40: {
    "Zone I": 0.69,
    "Zone II": 0.71,
    "Zone III": 0.72,
    "Zone IV": 0.73,
  },
};

// ============================================================
// IS 10262:2019 TABLE 1 — X FACTOR
// ============================================================

function getXFactor(
  grade: number
): number {
  if (grade <= 15) {
    return 5.0;
  }

  if (grade <= 25) {
    return 5.5;
  }

  if (grade <= 60) {
    return 6.5;
  }

  return 8.0;
}

// ============================================================
// IS 10262:2019 TABLE 2 — ASSUMED STANDARD DEVIATION
// ============================================================

function getAssumedStandardDeviation(
  grade: number,
  siteControl: "Good" | "Fair"
): number {
  let sd: number;

  if (grade <= 15) {
    sd = 3.5;
  } else if (grade <= 25) {
    sd = 4.0;
  } else if (grade <= 60) {
    sd = 5.0;
  } else {
    sd = 6.0;
  }

  if (siteControl === "Fair") {
    sd += 1.0;
  }

  return sd;
}

// ============================================================
// IS 456 TABLE 5 DURABILITY LIMITS
// USED BY IS 10262
// ============================================================

function getExposureLimits(
  exposure: string,
  concreteType:
    | "Reinforced Concrete"
    | "Plain Concrete"
): ExposureLimits {
  const reinforced: Record<
    string,
    ExposureLimits
  > = {
    Mild: {
      maxWaterBinderRatio: 0.55,
      minCementitiousContent: 300,
      minGrade: 20,
    },

    Moderate: {
      maxWaterBinderRatio: 0.50,
      minCementitiousContent: 300,
      minGrade: 25,
    },

    Severe: {
      maxWaterBinderRatio: 0.45,
      minCementitiousContent: 320,
      minGrade: 30,
    },

    "Very Severe": {
      maxWaterBinderRatio: 0.45,
      minCementitiousContent: 340,
      minGrade: 35,
    },

    Extreme: {
      maxWaterBinderRatio: 0.40,
      minCementitiousContent: 360,
      minGrade: 40,
    },
  };

  const plain: Record<
    string,
    ExposureLimits
  > = {
    Mild: {
      maxWaterBinderRatio: 0.60,
      minCementitiousContent: 220,
      minGrade: null,
    },

    Moderate: {
      maxWaterBinderRatio: 0.60,
      minCementitiousContent: 240,
      minGrade: 15,
    },

    Severe: {
      maxWaterBinderRatio: 0.50,
      minCementitiousContent: 250,
      minGrade: 20,
    },

    "Very Severe": {
      maxWaterBinderRatio: 0.45,
      minCementitiousContent: 260,
      minGrade: 20,
    },

    Extreme: {
      maxWaterBinderRatio: 0.40,
      minCementitiousContent: 280,
      minGrade: 25,
    },
  };

  return concreteType ===
    "Reinforced Concrete"
    ? reinforced[exposure]
    : plain[exposure];
}

// ============================================================
// AGGREGATE-SHAPE WATER CORRECTION
// IS 10262:2019 CLAUSE 5.3
// ============================================================

function getAggregateShapeWaterAdjustment(
  aggregateType: string
): number {
  switch (aggregateType) {
    case "Crushed Angular":
      return 0;

    case "Sub-angular":
      return -10;

    case "Gravel with some crushed particles":
      return -15;

    case "Rounded Gravel":
      return -20;

    default:
      return 0;
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function MixDesignCalculator({
  isDarkMode,
}: MixDesignCalculatorProps) {
  // ============================================================
  // DESIGN STIPULATIONS
  // ============================================================

  const [fck, setFck] =
    useState<number>(40);

  const [cementType, setCementType] =
    useState<string>("PPC");

  const [cementStrengthCurve, setCementStrengthCurve] =
    useState<string>("Curve 2");

  const [concreteType, setConcreteType] =
    useState<
      "Reinforced Concrete" |
        "Plain Concrete"
    >("Reinforced Concrete");

  const [maxAggregateSize, setMaxAggregateSize] =
    useState<10 | 20 | 40>(20);

  const [exposureCondition, setExposureCondition] =
    useState<string>("Severe");

  const [slump, setSlump] =
    useState<number>(75);

  const [transportationTime, setTransportationTime] =
    useState<number>(0);

  const [placingMethod, setPlacingMethod] =
    useState<
      "Chute / Non-pumpable" |
        "Pumping"
    >("Chute / Non-pumpable");

  const [siteControl, setSiteControl] =
    useState<"Good" | "Fair">("Good");

  const [coarseAggregateType, setCoarseAggregateType] =
    useState<string>(
      "Crushed Angular"
    );

  const [fineAggregateType, setFineAggregateType] =
    useState<string>(
      "Natural Sand"
    );

  const [fineAggregateZone, setFineAggregateZone] =
    useState<
      "Zone I" |
        "Zone II" |
        "Zone III" |
        "Zone IV"
    >("Zone II");

  // ============================================================
  // ADMIXTURES
  // ============================================================

  const [chemicalAdmixture, setChemicalAdmixture] =
    useState<string>(
      "Superplasticizer"
    );

  const [chemicalAdmixtureSG, setChemicalAdmixtureSG] =
    useState<number>(1.145);

  const [chemicalAdmixtureDosage, setChemicalAdmixtureDosage] =
    useState<number>(1.0);

  /*
   * IMPORTANT:
   * The code gives typical ranges for water reduction.
   * The Annex A benchmark specifically uses 23% reduction
   * for its selected superplasticizer at 1% dosage.
   *
   * Therefore this is explicitly labelled as a trial/material
   * value, not as a universal code-prescribed number.
   */
  const [trialWaterReduction, setTrialWaterReduction] =
    useState<number>(23);

  const [mineralAdmixture, setMineralAdmixture] =
    useState<string>("None");

  const [mineralAdmixtureSG, setMineralAdmixtureSG] =
    useState<number>(2.90);

  /*
   * For mineral admixtures this represents percentage of
   * total cementitious material.
   *
   * The exact replacement percentage must be selected based
   * on project/material requirements and applicable standards.
   */
  const [mineralAdmixtureReplacement, setMineralAdmixtureReplacement] =
    useState<number>(0);

  // ============================================================
  // MATERIAL PROPERTIES
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

  // ============================================================
  // WATER-CEMENT / CEMENTITIOUS RATIO
  // ============================================================

  /*
   * This is intentionally an INPUT.
   *
   * IS 10262 says preliminary w/c should preferably be obtained
   * from actual material strength relationship; otherwise
   * Figure 1 may be used.
   *
   * We do not fabricate a mathematical approximation of Figure 1.
   */
  const [preliminaryWaterBinderRatio, setPreliminaryWaterBinderRatio] =
    useState<number>(0.36);

  // ============================================================
  // STANDARD DEVIATION
  // ============================================================

  const [useAssumedStandardDeviation, setUseAssumedStandardDeviation] =
    useState<boolean>(true);

  const [actualStandardDeviation, setActualStandardDeviation] =
    useState<number>(5.0);

  // ============================================================
  // CALCULATION RESULT
  // ============================================================

  const [mixResult, setMixResult] =
    useState<MixResult | null>(
      null
    );

  // ============================================================
  // DERIVED CODE VALUES
  // ============================================================

  const assumedStandardDeviation =
    useMemo(
      () =>
        getAssumedStandardDeviation(
          fck,
          siteControl
        ),
      [
        fck,
        siteControl,
      ]
    );

  const standardDeviation =
    useAssumedStandardDeviation
      ? assumedStandardDeviation
      : actualStandardDeviation;

  const xFactor =
    getXFactor(fck);

  const targetMeanStrength =
    Math.max(
      fck +
        1.65 *
          standardDeviation,
      fck + xFactor
    );

  const durabilityLimits =
    getExposureLimits(
      exposureCondition,
      concreteType
    );

  const adoptedWaterBinderRatio =
    Math.min(
      preliminaryWaterBinderRatio,
      durabilityLimits.maxWaterBinderRatio
    );

  // ============================================================
  // CALCULATION
  // ============================================================

  const calculateMix = () => {
    const warnings: string[] = [];

    // ----------------------------------------------------------
    // BASIC VALIDATION
    // ----------------------------------------------------------

    if (
      sgCement <= 0 ||
      sgFA <= 0 ||
      sgCA <= 0
    ) {
      setMixResult(null);
      return;
    }

    if (
      preliminaryWaterBinderRatio <= 0
    ) {
      setMixResult(null);
      return;
    }

    if (
      chemicalAdmixtureDosage < 0 ||
      trialWaterReduction < 0 ||
      trialWaterReduction >= 100
    ) {
      setMixResult(null);
      return;
    }

    if (
      mineralAdmixtureReplacement <
        0 ||
      mineralAdmixtureReplacement >=
        100
    ) {
      setMixResult(null);
      return;
    }

    // ----------------------------------------------------------
    // STEP 1 — TARGET STRENGTH
    // ----------------------------------------------------------

    const targetStrength =
      targetMeanStrength;

    // ----------------------------------------------------------
    // STEP 2 — DURABILITY W/C CHECK
    // ----------------------------------------------------------

    if (
      preliminaryWaterBinderRatio >
      durabilityLimits.maxWaterBinderRatio
    ) {
      warnings.push(
        `The preliminary water-binder ratio of ${preliminaryWaterBinderRatio.toFixed(
          2
        )} exceeds the durability limit of ${durabilityLimits.maxWaterBinderRatio.toFixed(
          2
        )}. The lower adopted ratio of ${adoptedWaterBinderRatio.toFixed(
          2
        )} is being used.`
      );
    }

    // ----------------------------------------------------------
    // STEP 3 — AIR CONTENT FROM TABLE 3
    // ----------------------------------------------------------

    const entrappedAir =
      ENTRAPPED_AIR_TABLE[
        maxAggregateSize
      ];

    // ----------------------------------------------------------
    // STEP 4 — WATER FROM TABLE 4
    // ----------------------------------------------------------

    const tableWater =
      WATER_CONTENT_TABLE[
        maxAggregateSize
      ];

    // Aggregate shape adjustment.
    const shapeWaterAdjustment =
      getAggregateShapeWaterAdjustment(
        coarseAggregateType
      );

    const shapeAdjustedWater =
      tableWater +
      shapeWaterAdjustment;

    // Slump adjustment.
    //
    // The code permits approximately ±3% for every
    // 25 mm deviation from 50 mm slump.
    const slumpSteps =
      (slump - 50) /
      25;

    const slumpAdjustedWater =
      shapeAdjustedWater *
      (1 +
        0.03 *
          slumpSteps);

    // ----------------------------------------------------------
    // STEP 5 — CHEMICAL ADMIXTURE WATER REDUCTION
    // ----------------------------------------------------------

    const effectiveWaterReduction =
      chemicalAdmixture ===
      "None"
        ? 0
        : trialWaterReduction;

    const calculatedFreeWater =
      slumpAdjustedWater *
      (1 -
        effectiveWaterReduction /
          100);

    /*
     * The published Annex A benchmark rounds 147.52 kg to
     * 148 kg before calculating cement.
     */
    const freeWaterContent =
      Math.round(
        calculatedFreeWater
      );

    // ----------------------------------------------------------
    // STEP 6 — CEMENTITIOUS MATERIAL CONTENT
    // ----------------------------------------------------------

    const calculatedCementitiousContent =
      freeWaterContent /
      adoptedWaterBinderRatio;

    /*
     * IS 456 durability minimum is checked against calculated
     * cementitious content.
     *
     * We use the greater of calculated and minimum required.
     */
    const cementitiousContent =
      Math.max(
        Math.ceil(
          calculatedCementitiousContent
        ),
        durabilityLimits.minCementitiousContent
      );

    const actualWaterBinderRatio =
      freeWaterContent /
      cementitiousContent;

    // ----------------------------------------------------------
    // STEP 7 — MINERAL ADMIXTURE SPLIT
    // ----------------------------------------------------------

    const mineralReplacement =
      mineralAdmixture ===
      "None"
        ? 0
        : mineralAdmixtureReplacement;

    const mineralAdmixtureContent =
      Math.round(
        cementitiousContent *
          (mineralReplacement /
            100)
      );

    const cementContent =
      Math.round(
        cementitiousContent -
          mineralAdmixtureContent
      );

    // ----------------------------------------------------------
    // STEP 8 — CHEMICAL ADMIXTURE
    // ----------------------------------------------------------

    const chemicalAdmixtureContent =
      chemicalAdmixture ===
      "None"
        ? 0
        : Number(
            (
              cementitiousContent *
              (chemicalAdmixtureDosage /
                100)
            ).toFixed(2)
          );

    // ----------------------------------------------------------
    // STEP 9 — CEMENT LIMIT CHECK
    // ----------------------------------------------------------

    const cementCheckPassed =
      cementitiousContent >=
      durabilityLimits.minCementitiousContent;

    const maximumCementCheckPassed =
      cementContent <= 450;

    if (
      !maximumCementCheckPassed
    ) {
      warnings.push(
        `Calculated cement content is ${cementContent} kg/m³, which exceeds the commonly specified 450 kg/m³ maximum used for normal concrete. Reconsider the design using appropriate admixture/SCM strategy and trial data rather than simply capping cement.`
      );
    }

    if (
      cementitiousContent <
      durabilityLimits.minCementitiousContent
    ) {
      warnings.push(
        "The calculated cementitious content is below the durability minimum."
      );
    }

    // ----------------------------------------------------------
    // STEP 10 — MINIMUM GRADE CHECK
    // ----------------------------------------------------------

    const minimumGradeCheckPassed =
      durabilityLimits.minGrade ===
        null ||
      fck >=
        durabilityLimits.minGrade;

    if (
      !minimumGradeCheckPassed
    ) {
      warnings.push(
        `Selected grade M${fck} is below the minimum M${durabilityLimits.minGrade} required for ${concreteType} under ${exposureCondition} exposure.`
      );
    }

    // ----------------------------------------------------------
    // STEP 11 — TABLE 5 COARSE AGGREGATE PROPORTION
    // ----------------------------------------------------------

    const baseCoarseAggregateFraction =
      COARSE_AGGREGATE_TABLE[
        maxAggregateSize
      ][fineAggregateZone];

    /*
     * IS 10262 Table 5 is based on w/c or w/cm = 0.50.
     *
     * +0.01 CA volume for every 0.05 decrease in ratio.
     * -0.01 CA volume for every 0.05 increase.
     */
    const waterBinderDifference =
      0.50 -
      actualWaterBinderRatio;

    const ratioAdjustment =
      (waterBinderDifference /
        0.05) *
      0.01;

    let correctedCoarseAggregateFraction =
      baseCoarseAggregateFraction +
      ratioAdjustment;

    // ----------------------------------------------------------
    // PUMPABLE / CONGESTED CONCRETE ADJUSTMENT
    // ----------------------------------------------------------

    if (
      placingMethod ===
      "Pumping"
    ) {
      correctedCoarseAggregateFraction *=
        0.90;

      warnings.push(
        "Pumping selected: coarse aggregate proportion has been reduced by 10% as a preliminary Table 5 adjustment. Trial batches are required to confirm workability and performance."
      );
    }

    /*
     * Prevent impossible proportions.
     */
    correctedCoarseAggregateFraction =
      Math.min(
        Math.max(
          correctedCoarseAggregateFraction,
          0
        ),
        0.90
      );

    const fineAggregateFraction =
      1 -
      correctedCoarseAggregateFraction;

    // ----------------------------------------------------------
    // SHAPE / SOURCE WARNINGS
    // ----------------------------------------------------------

    if (
      coarseAggregateType !==
      "Crushed Angular"
    ) {
      warnings.push(
        "Table 5 values are based on crushed angular aggregate. IS 10262 permits suitable adjustment for other aggregate shapes, but does not prescribe a universal numerical correction; final adjustment must be established by trials."
      );
    }

    if (
      fineAggregateType !==
      "Natural Sand"
    ) {
      warnings.push(
        "IS 10262 notes that crushed or mixed fine aggregate may need lower fine-aggregate content and corresponding increase in coarse aggregate. No arbitrary fixed correction has been applied; final adjustment should be established by trials."
      );
    }

    if (
      fineAggregateZone ===
        "Zone IV" &&
      concreteType ===
        "Reinforced Concrete"
    ) {
      warnings.push(
        "IS 10262 recommends that Zone IV fine aggregate should not be used in reinforced concrete unless tests establish suitability."
      );
    }

    // ----------------------------------------------------------
    // STEP 12 — ABSOLUTE VOLUME CALCULATION
    // ----------------------------------------------------------

    const cementVolume =
      cementContent /
      (sgCement * 1000);

    const mineralAdmixtureVolume =
      mineralAdmixtureContent /
      (mineralAdmixtureSG *
        1000);

    const waterVolume =
      freeWaterContent /
      1000;

    const chemicalAdmixtureVolume =
      chemicalAdmixtureContent /
      (chemicalAdmixtureSG *
        1000);

    const airVolume =
      entrappedAir /
      100;

    const totalAggregateVolume =
      1 -
      (
        cementVolume +
        mineralAdmixtureVolume +
        waterVolume +
        chemicalAdmixtureVolume +
        airVolume
      );

    if (
      totalAggregateVolume <=
      0
    ) {
      setMixResult(null);
      return;
    }

    const coarseAggregateVolume =
      totalAggregateVolume *
      correctedCoarseAggregateFraction;

    const fineAggregateVolume =
      totalAggregateVolume *
      fineAggregateFraction;

    const coarseAggregateSSD =
      coarseAggregateVolume *
      sgCA *
      1000;

    const fineAggregateSSD =
      fineAggregateVolume *
      sgFA *
      1000;

    // ----------------------------------------------------------
    // STEP 13 — MOISTURE / ABSORPTION CORRECTION
    // ----------------------------------------------------------

    /*
     * SSD → dry mass:
     *
     * Dry mass = SSD mass / (1 + absorption %)
     */
    const coarseAggregateDry =
      coarseAggregateSSD /
      (1 +
        caAbsorption /
          100);

    const fineAggregateDry =
      fineAggregateSSD /
      (1 +
        faAbsorption /
          100);

    /*
     * Surface/free water contribution:
     *
     * dry mass × (moisture - absorption) / 100
     *
     * Positive = aggregate contributes water.
     * Negative = aggregate consumes water.
     */
    const coarseAggregateWaterContribution =
      coarseAggregateDry *
      (
        (caMoisture -
          caAbsorption) /
        100
      );

    const fineAggregateWaterContribution =
      fineAggregateDry *
      (
        (faMoisture -
          faAbsorption) /
        100
      );

    /*
     * Water to add at batching:
     *
     * Required free water
     * minus water contributed by aggregates.
     */
    const waterToAdd =
      Math.max(
        0,
        freeWaterContent -
          (
            coarseAggregateWaterContribution +
            fineAggregateWaterContribution
          )
      );

    // ----------------------------------------------------------
    // STEP 14 — MIX RATIO
    // ----------------------------------------------------------

    /*
     * For normal cement-only mixes, show:
     *
     * 1 : FA/Cement : CA/Cement
     *
     * If mineral admixture is present, show binder ratio:
     *
     * 1 : FA/Binder : CA/Binder
     */
    const binderMass =
      cementitiousContent;

    const mixRatio =
      `1 : ${(fineAggregateSSD / binderMass).toFixed(
        2
      )} : ${(coarseAggregateSSD / binderMass).toFixed(
        2
      )}`;

    // ----------------------------------------------------------
    // YIELD CHECK
    // ----------------------------------------------------------

    const yield =
      cementVolume +
      mineralAdmixtureVolume +
      waterVolume +
      chemicalAdmixtureVolume +
      airVolume +
      coarseAggregateVolume +
      fineAggregateVolume;

    // ----------------------------------------------------------
    // RETURN RESULT
    // ----------------------------------------------------------

    setMixResult({
      targetStrength,

      characteristicStrength:
        fck,

      standardDeviation,

      xFactor,

      preliminaryWaterBinderRatio,

      durabilityMaximumWaterBinderRatio:
        durabilityLimits.maxWaterBinderRatio,

      adoptedWaterBinderRatio,

      actualWaterBinderRatio,

      baseWaterContent:
        tableWater,

      shapeAdjustedWaterContent:
        shapeAdjustedWater,

      slumpAdjustedWaterContent:
        slumpAdjustedWater,

      admixtureWaterReduction:
        effectiveWaterReduction,

      freeWaterContent,

      cementitiousContent,

      cementContent,

      mineralAdmixtureContent,

      chemicalAdmixtureContent,

      entrappedAir,

      baseCoarseAggregateFraction,

      correctedCoarseAggregateFraction,

      fineAggregateFraction,

      totalAggregateVolume,

      coarseAggregateVolume,

      fineAggregateVolume,

      coarseAggregateSSD,

      fineAggregateSSD,

      coarseAggregateDry,

      fineAggregateDry,

      waterToAdd,

      mixRatio,

      yield,

      cementCheckPassed,

      maximumCementCheckPassed,

      durabilityCheckPassed:
        actualWaterBinderRatio <=
        durabilityLimits.maxWaterBinderRatio,

      minimumGradeCheckPassed,

      warnings,
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
      <div className="max-w-6xl mx-auto w-full">

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
              IS 10262:2019 Concrete Mix
              Proportioning
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
                  {[
                    10,
                    15,
                    20,
                    25,
                    30,
                    35,
                    40,
                    45,
                    50,
                    55,
                    60,
                  ].map(
                    (grade) => (
                      <option
                        key={grade}
                        value={grade}
                      >
                        M{grade}
                      </option>
                    )
                  )}
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
                  Cement Strength Curve
                </label>

                <select
                  value={
                    cementStrengthCurve
                  }
                  onChange={(e) =>
                    setCementStrengthCurve(
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="Curve 1">
                    Curve 1 — 33 to &lt;43 MPa
                  </option>

                  <option value="Curve 2">
                    Curve 2 — 43 to &lt;53 MPa
                  </option>

                  <option value="Curve 3">
                    Curve 3 — 53 MPa and above
                  </option>
                </select>

                <p
                  className={`mt-1.5 text-[10px] ${
                    isDarkMode
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  Used as the Figure 1 reference;
                  preliminary w/b ratio is still
                  entered explicitly.
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Concrete Type
                </label>

                <select
                  value={
                    concreteType
                  }
                  onChange={(e) =>
                    setConcreteType(
                      e.target
                        .value as
                        | "Reinforced Concrete"
                        | "Plain Concrete"
                    )
                  }
                  className={inputClass}
                >
                  <option value="Reinforced Concrete">
                    Reinforced Concrete
                  </option>

                  <option value="Plain Concrete">
                    Plain Concrete
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
                      ) as
                        | 10
                        | 20
                        | 40
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

                <p
                  className={`mt-1.5 text-[10px] ${
                    isDarkMode
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  Recorded for design reporting;
                  transport-related initial slump is
                  established from project conditions.
                </p>
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
                      e.target
                        .value as
                        | "Chute / Non-pumpable"
                        | "Pumping"
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
                      e.target
                        .value as
                        | "Good"
                        | "Fair"
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
                    coarseAggregateType
                  }
                  onChange={(e) =>
                    setCoarseAggregateType(
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

                  <option value="Crushed Sand">
                    Crushed Sand
                  </option>

                  <option value="Mixed Sand">
                    Mixed Sand
                  </option>
                </select>
              </div>

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
                      e.target.value as
                        | "Zone I"
                        | "Zone II"
                        | "Zone III"
                        | "Zone IV"
                    )
                  }
                  className={inputClass}
                >
                  <option value="Zone I">
                    Zone I
                  </option>

                  <option value="Zone II">
                    Zone II
                  </option>

                  <option value="Zone III">
                    Zone III
                  </option>

                  <option value="Zone IV">
                    Zone IV
                  </option>
                </select>
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

                  <option value="Water Reducer">
                    Water Reducer / Plasticizer
                  </option>

                  <option value="Superplasticizer">
                    Superplasticizer
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
                  Trial Water Reduction (%)
                </label>

                <input
                  type="number"
                  step="0.5"
                  value={
                    trialWaterReduction
                  }
                  onChange={(e) =>
                    setTrialWaterReduction(
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
                  Material/trial value. The Annex A
                  benchmark uses 23% with its selected
                  superplasticizer.
                </p>
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
                  Mineral Admixture Replacement (%)
                </label>

                <input
                  type="number"
                  step="0.5"
                  value={
                    mineralAdmixtureReplacement
                  }
                  onChange={(e) =>
                    setMineralAdmixtureReplacement(
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
          {/* STRENGTH / WATER-BINDER RATIO                      */}
          {/* ================================================== */}

          <div className="mb-6">
            <h3 className={sectionTitleClass}>
              3. Strength & Water-Binder Ratio
            </h3>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${sectionClass}`}
            >
              <div>
                <label className={labelClass}>
                  Preliminary W/B Ratio
                </label>

                <input
                  type="number"
                  step="0.01"
                  min="0.10"
                  max="1.00"
                  value={
                    preliminaryWaterBinderRatio
                  }
                  onChange={(e) =>
                    setPreliminaryWaterBinderRatio(
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
                  Enter from Fig. 1 / actual material
                  strength relationship. The calculator
                  checks it against durability.
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Standard Deviation
                </label>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={
                      useAssumedStandardDeviation
                        ? assumedStandardDeviation
                        : actualStandardDeviation
                    }
                    disabled={
                      useAssumedStandardDeviation
                    }
                    onChange={(e) =>
                      setActualStandardDeviation(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={inputClass}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setUseAssumedStandardDeviation(
                        !useAssumedStandardDeviation
                      )
                    }
                    className={`px-3 rounded-[16px] border text-[12px] whitespace-nowrap ${
                      useAssumedStandardDeviation
                        ? isDarkMode
                          ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                          : "bg-amber-50 border-amber-200 text-amber-700"
                        : isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-300"
                        : "bg-slate-100 border-slate-200 text-slate-600"
                    }`}
                  >
                    {useAssumedStandardDeviation
                      ? "IS Assumed"
                      : "Actual"}
                  </button>
                </div>

                <p
                  className={`mt-1.5 text-[10px] ${
                    isDarkMode
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  Assumed:{" "}
                  {assumedStandardDeviation.toFixed(
                    1
                  )}{" "}
                  N/mm² for current grade/control.
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Target Mean Strength
                </label>

                <div
                  className={`p-3 rounded-[16px] border text-[14px] ${
                    isDarkMode
                      ? "bg-[#0f1011] border-slate-800 text-amber-400"
                      : "bg-amber-50 border-amber-100 text-amber-700"
                  }`}
                >
                  {targetMeanStrength.toFixed(
                    2
                  )}{" "}
                  N/mm²
                </div>

                <p
                  className={`mt-1.5 text-[10px] ${
                    isDarkMode
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  max(fck + 1.65S, fck + X)
                </p>
              </div>
            </div>
          </div>

          {/* ================================================== */}
          {/* DURABILITY                                          */}
          {/* ================================================== */}

          <div className="mb-8">
            <h3 className={sectionTitleClass}>
              4. Durability Limits
            </h3>

            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${sectionClass}`}
            >
              <div>
                <label className={labelClass}>
                  Maximum W/B Ratio
                </label>

                <div
                  className={`p-3 rounded-[16px] border text-[14px] ${
                    isDarkMode
                      ? "bg-[#0f1011] border-slate-800 text-slate-200"
                      : "bg-white border-slate-200 text-slate-800"
                  }`}
                >
                  {durabilityLimits.maxWaterBinderRatio.toFixed(
                    2
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Minimum Cementitious Content
                </label>

                <div
                  className={`p-3 rounded-[16px] border text-[14px] ${
                    isDarkMode
                      ? "bg-[#0f1011] border-slate-800 text-slate-200"
                      : "bg-white border-slate-200 text-slate-800"
                  }`}
                >
                  {
                    durabilityLimits.minCementitiousContent
                  }{" "}
                  kg/m³
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Minimum Grade
                </label>

                <div
                  className={`p-3 rounded-[16px] border text-[14px] ${
                    isDarkMode
                      ? "bg-[#0f1011] border-slate-800 text-slate-200"
                      : "bg-white border-slate-200 text-slate-800"
                  }`}
                >
                  {durabilityLimits.minGrade ===
                  null
                    ? "Not specified"
                    : `M${durabilityLimits.minGrade}`}
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Adopted W/B Ratio
                </label>

                <div
                  className={`p-3 rounded-[16px] border text-[14px] font-medium ${
                    isDarkMode
                      ? "bg-emerald-900/20 border-emerald-900/30 text-emerald-400"
                      : "bg-emerald-50 border-emerald-100 text-emerald-700"
                  }`}
                >
                  {adoptedWaterBinderRatio.toFixed(
                    3
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ================================================== */}
          {/* CALCULATE BUTTON                                   */}
          {/* ================================================== */}

          <button
            onClick={
              calculateMix
            }
            className={`w-full py-4 rounded-[24px] font-medium text-[14px] transition-colors shadow-sm mb-8 ${
              isDarkMode
                ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                : "bg-slate-800 text-white hover:bg-slate-700"
            }`}
          >
            Calculate IS 10262 Mix
          </button>

          {/* ================================================== */}
          {/* RESULTS                                             */}
          {/* ================================================== */}

          {mixResult && (
            <div className="space-y-6">

              {/* ------------------------------------------------ */}
              {/* STATUS                                            */}
              {/* ------------------------------------------------ */}

              <div>
                <h3
                  className={sectionTitleClass}
                >
                  5. Design Checks
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    [
                      "Durability W/B",
                      mixResult.durabilityCheckPassed,
                    ],
                    [
                      "Minimum Grade",
                      mixResult.minimumGradeCheckPassed,
                    ],
                    [
                      "Minimum Cement",
                      mixResult.cementCheckPassed,
                    ],
                    [
                      "Maximum Cement",
                      mixResult.maximumCementCheckPassed,
                    ],
                  ].map(
                    (item) => (
                      <div
                        key={
                          item[0] as string
                        }
                        className={`rounded-[18px] border p-4 ${
                          item[1]
                            ? isDarkMode
                              ? "bg-emerald-900/20 border-emerald-900/30"
                              : "bg-emerald-50 border-emerald-100"
                            : isDarkMode
                            ? "bg-red-900/20 border-red-900/30"
                            : "bg-red-50 border-red-100"
                        }`}
                      >
                        <p
                          className={`text-[11px] font-medium ${
                            item[1]
                              ? isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-700"
                              : isDarkMode
                              ? "text-red-400"
                              : "text-red-700"
                          }`}
                        >
                          {
                            item[0]
                          }
                        </p>

                        <p
                          className={`mt-1 text-[14px] font-medium ${
                            item[1]
                              ? isDarkMode
                                ? "text-emerald-300"
                                : "text-emerald-800"
                              : isDarkMode
                              ? "text-red-300"
                              : "text-red-800"
                          }`}
                        >
                          {item[1]
                            ? "PASS"
                            : "REVIEW"}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* WARNINGS                                          */}
              {/* ------------------------------------------------ */}

              {mixResult.warnings.length >
                0 && (
                <div
                  className={`rounded-[22px] border p-5 ${
                    isDarkMode
                      ? "bg-amber-900/20 border-amber-900/30"
                      : "bg-amber-50 border-amber-100"
                  }`}
                >
                  <p
                    className={`text-[12px] font-semibold uppercase tracking-wider ${
                      isDarkMode
                        ? "text-amber-400"
                        : "text-amber-700"
                    }`}
                  >
                    Design Notes / Trial Requirements
                  </p>

                  <div className="mt-3 space-y-2">
                    {mixResult.warnings.map(
                      (
                        warning,
                        index
                      ) => (
                        <p
                          key={
                            index
                          }
                          className={`text-[13px] leading-relaxed ${
                            isDarkMode
                              ? "text-amber-200/80"
                              : "text-amber-900"
                          }`}
                        >
                          •{" "}
                          {
                            warning
                          }
                        </p>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------ */}
              {/* MAIN RESULT                                       */}
              {/* ------------------------------------------------ */}

              <div>
                <h3
                  className={sectionTitleClass}
                >
                  6. Calculated Mix — Per m³
                </h3>

                <div
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-6`}
                >
                  <div
                    className={`rounded-[24px] border p-7 ${
                      isDarkMode
                        ? "bg-[#131314] border-slate-800"
                        : "bg-[#f8fafc] border-slate-200"
                    }`}
                  >
                    <div className="space-y-4">

                      <ResultRow
                        label="Target Mean Strength"
                        value={`${mixResult.targetStrength.toFixed(
                          2
                        )} N/mm²`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Adopted W/B Ratio"
                        value={mixResult.adoptedWaterBinderRatio.toFixed(
                          3
                        )}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Actual W/B Ratio"
                        value={mixResult.actualWaterBinderRatio.toFixed(
                          3
                        )}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Free Water"
                        value={`${mixResult.freeWaterContent.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Cement"
                        value={`${mixResult.cementContent.toFixed(
                          0
                        )} kg`}
                        highlight
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Mineral Admixture"
                        value={`${mixResult.mineralAdmixtureContent.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Chemical Admixture"
                        value={`${mixResult.chemicalAdmixtureContent.toFixed(
                          2
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Fine Aggregate — SSD"
                        value={`${mixResult.fineAggregateSSD.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Coarse Aggregate — SSD"
                        value={`${mixResult.coarseAggregateSSD.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Fine Aggregate — Dry"
                        value={`${mixResult.fineAggregateDry.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Coarse Aggregate — Dry"
                        value={`${mixResult.coarseAggregateDry.toFixed(
                          0
                        )} kg`}
                        isDarkMode={
                          isDarkMode
                        }
                      />

                      <ResultRow
                        label="Water to Add at Batching"
                        value={`${mixResult.waterToAdd.toFixed(
                          0
                        )} kg`}
                        highlight
                        isDarkMode={
                          isDarkMode
                        }
                      />

                    </div>
                  </div>

                  {/* ------------------------------------------------ */}
                  {/* AGGREGATE / RATIO DETAIL                         */}
                  {/* ------------------------------------------------ */}

                  <div
                    className={`rounded-[24px] border p-7 ${
                      isDarkMode
                        ? "bg-[#131314] border-slate-800"
                        : "bg-[#f8fafc] border-slate-200"
                    }`}
                  >
                    <div className="space-y-5">

                      <div>
                        <p
                          className={`text-[11px] uppercase tracking-wider font-medium ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Aggregate Proportion
                        </p>

                        <p
                          className={`mt-2 text-3xl font-medium ${
                            isDarkMode
                              ? "text-white"
                              : "text-slate-800"
                          }`}
                        >
                          {
                            mixResult.correctedCoarseAggregateFraction.toFixed(
                              3
                            )
                          }{" "}
                          CA
                        </p>

                        <p
                          className={`mt-1 text-[13px] ${
                            isDarkMode
                              ? "text-slate-400"
                              : "text-slate-500"
                          }`}
                        >
                          CA / total aggregate volume
                        </p>

                        <div
                          className={`mt-3 text-[13px] ${
                            isDarkMode
                              ? "text-slate-400"
                              : "text-slate-600"
                          }`}
                        >
                          FA proportion ={" "}
                          <span className="font-medium">
                            {
                              mixResult.fineAggregateFraction.toFixed(
                                3
                              )
                            }
                          </span>
                        </div>
                      </div>

                      <div
                        className={`border-t pt-5 ${
                          isDarkMode
                            ? "border-slate-800"
                            : "border-slate-200"
                        }`}
                      >
                        <p
                          className={`text-[11px] uppercase tracking-wider font-medium ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Table 5 Basis
                        </p>

                        <div
                          className={`mt-3 p-4 rounded-[16px] ${
                            isDarkMode
                              ? "bg-[#1e1f20]"
                              : "bg-white"
                          }`}
                        >
                          <p
                            className={`text-[13px] ${
                              isDarkMode
                                ? "text-slate-300"
                                : "text-slate-700"
                            }`}
                          >
                            {maxAggregateSize} mm,
                            {" "}
                            {fineAggregateZone},
                            {" "}
                            base CA fraction{" "}
                            {mixResult.baseCoarseAggregateFraction.toFixed(
                              2
                            )}
                          </p>

                          <p
                            className={`mt-1 text-[12px] ${
                              isDarkMode
                                ? "text-slate-500"
                                : "text-slate-500"
                            }`}
                          >
                            Corrected using adopted W/B
                            ratio and placing condition.
                          </p>
                        </div>
                      </div>

                      <div
                        className={`border-t pt-5 ${
                          isDarkMode
                            ? "border-slate-800"
                            : "border-slate-200"
                        }`}
                      >
                        <p
                          className={`text-[11px] uppercase tracking-wider font-medium ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Mix Ratio
                        </p>

                        <p
                          className={`mt-2 text-3xl font-medium ${
                            isDarkMode
                              ? "text-white"
                              : "text-slate-800"
                          }`}
                        >
                          1 :{" "}
                          {
                            (
                              mixResult.fineAggregateSSD /
                              mixResult.cementitiousContent
                            ).toFixed(
                              2
                            )
                          }{" "}
                          :{" "}
                          {
                            (
                              mixResult.coarseAggregateSSD /
                              mixResult.cementitiousContent
                            ).toFixed(
                              2
                            )
                          }
                        </p>

                        <p
                          className={`mt-1 text-[12px] ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Binder : FA : CA
                        </p>
                      </div>

                      <div
                        className={`border-t pt-5 ${
                          isDarkMode
                            ? "border-slate-800"
                            : "border-slate-200"
                        }`}
                      >
                        <p
                          className={`text-[11px] uppercase tracking-wider font-medium ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Absolute Volume Check
                        </p>

                        <p
                          className={`mt-2 text-lg font-medium ${
                            Math.abs(
                              mixResult.yield -
                                1
                            ) <
                            0.005
                              ? isDarkMode
                                ? "text-emerald-400"
                                : "text-emerald-600"
                              : isDarkMode
                              ? "text-amber-400"
                              : "text-amber-600"
                          }`}
                        >
                          {
                            mixResult.yield.toFixed(
                              4
                            )
                          } m³
                        </p>

                        <p
                          className={`mt-1 text-[12px] ${
                            isDarkMode
                              ? "text-slate-500"
                              : "text-slate-500"
                          }`}
                        >
                          Target unit volume = 1.0000
                          m³
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* TRIAL MIX NOTICE                                 */}
              {/* ------------------------------------------------ */}

              <div
                className={`rounded-[22px] border p-5 ${
                  isDarkMode
                    ? "bg-[#1e1f20] border-slate-800"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <p
                  className={`text-[12px] font-semibold uppercase tracking-wider ${
                    isDarkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  Trial Mix Requirement
                </p>

                <p
                  className={`mt-2 text-[13px] leading-relaxed ${
                    isDarkMode
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  This calculation produces the
                  preliminary calculated mix. IS 10262
                  requires the calculated proportions to
                  be checked by trial batches and adjusted
                  based on workability, segregation,
                  bleeding, strength and durability
                  performance before finalizing the mix.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RESULT ROW
// ============================================================

function ResultRow({
  label,
  value,
  highlight = false,
  isDarkMode,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isDarkMode: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-end border-b pb-3 ${
        isDarkMode
          ? "border-slate-800"
          : "border-slate-200"
      }`}
    >
      <span
        className={`text-[13px] ${
          isDarkMode
            ? "text-slate-400"
            : "text-slate-600"
        }`}
      >
        {label}
      </span>

      <span
        className={`text-[15px] font-medium ${
          highlight
            ? isDarkMode
              ? "text-amber-400"
              : "text-slate-900"
            : isDarkMode
            ? "text-slate-200"
            : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}