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
  const [fck, setFck] =
    useState<number>(25);

  const [stdDev, setStdDev] =
    useState<number>(4);

  const [wcRatio, setWcRatio] =
    useState<number>(0.5);

  const [sgCement, setSgCement] =
    useState<number>(3.15);

  const [sgFA, setSgFA] =
    useState<number>(2.74);

  const [sgCA, setSgCA] =
    useState<number>(2.74);

  const [waterContent, setWaterContent] =
    useState<number>(186);

  const [mixResult, setMixResult] =
    useState<MixResult | null>(null);

  const calculateMix = () => {
    // Avoid division by zero / invalid calculator states.
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

    const airVolume = 0.02;

    const volAggregates =
      1 -
      (volCement +
        volWater +
        airVolume);

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

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
      <div className="max-w-4xl mx-auto w-full">
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
              IS 10262:2019 Absolute Volume
              Method
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {/* INPUTS */}
            <div className="space-y-5">
              {/* Target Grade */}
              <div>
                <label
                  className={`block text-[13px] font-medium mb-1.5 ${
                    isDarkMode
                      ? "text-slate-300"
                      : "text-slate-700"
                  }`}
                >
                  Target Grade (fck)
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
                  className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                    isDarkMode
                      ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                      : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                  }`}
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

                  <option value={40}>
                    M40
                  </option>
                </select>
              </div>

              {/* Standard Deviation */}
              <div>
                <label
                  className={`block text-[13px] font-medium mb-1.5 ${
                    isDarkMode
                      ? "text-slate-300"
                      : "text-slate-700"
                  }`}
                >
                  Standard Deviation (s) -
                  N/mm²
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
                  className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                    isDarkMode
                      ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                      : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                  }`}
                />
              </div>

              {/* W/C Ratio */}
              <div>
                <label
                  className={`block text-[13px] font-medium mb-1.5 ${
                    isDarkMode
                      ? "text-slate-300"
                      : "text-slate-700"
                  }`}
                >
                  Water-Cement Ratio
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
                  className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                    isDarkMode
                      ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                      : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                  }`}
                />
              </div>

              {/* Specific Gravity + Water */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className={`block text-[13px] font-medium mb-1.5 ${
                      isDarkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    Sp. Gravity (Cement)
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
                    className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                      isDarkMode
                        ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                        : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[13px] font-medium mb-1.5 ${
                      isDarkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    Max Water (kg/m³)
                  </label>

                  <input
                    type="number"
                    value={waterContent}
                    onChange={(e) =>
                      setWaterContent(
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className={`w-full p-3 rounded-[16px] border outline-none text-[14px] transition-colors ${
                      isDarkMode
                        ? "bg-[#131314] border-slate-700 text-slate-200 focus:border-slate-500"
                        : "bg-[#f0f4f9] border-slate-200 text-slate-800 focus:bg-white focus:border-slate-300"
                    }`}
                  />
                </div>
              </div>

              {/* Calculate */}
              <button
                onClick={calculateMix}
                className={`w-full py-3.5 mt-2 rounded-[24px] font-medium text-[14px] transition-colors shadow-sm ${
                  isDarkMode
                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                    : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
              >
                Calculate Proportions
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
                Output per m³
              </h3>

              {mixResult ? (
                <div className="space-y-4">
                  {/* Target Strength */}
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
                      ($f_m$)
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

                  {/* Cement */}
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

                  {/* Water */}
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

                  {/* FA */}
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
                      Fine Aggregate (FA)
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

                  {/* CA */}
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
                      Coarse Aggregate (CA)
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

                  {/* Ratio */}
                  <div className="pt-4 mt-4">
                    <p
                      className={`text-[12px] mb-1 font-medium ${
                        isDarkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      Mix Ratio (C : FA : CA)
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
                    Adjust your parameters
                    and click calculate to
                    view the mix proportions.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}