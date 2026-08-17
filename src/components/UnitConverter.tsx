"use client";

import { useState, useEffect } from 'react';

type UnitCategory = 'Force' | 'Stress/Pressure' | 'Length' | 'Area' | 'Volume';

const unitData: Record<UnitCategory, { base: string; rates: Record<string, number> }> = {
  'Force': {
    base: 'kN',
    rates: { 'kN': 1, 'N': 1000, 'kgf': 101.9716, 'lbf': 224.8089, 'kips': 0.2248 }
  },
  'Stress/Pressure': {
    base: 'MPa',
    rates: { 'MPa': 1, 'N/mm²': 1, 'Pa': 1000000, 'kPa': 1000, 'psi': 145.0377, 'ksi': 0.145038, 'ksf': 20.8854 }
  },
  'Length': {
    base: 'm',
    rates: { 'm': 1, 'mm': 1000, 'cm': 100, 'in': 39.3701, 'ft': 3.28084, 'yd': 1.09361 }
  },
  'Area': {
    base: 'm²',
    rates: { 'm²': 1, 'mm²': 1000000, 'cm²': 10000, 'sq in': 1550.003, 'sq ft': 10.7639 }
  },
  'Volume': {
    base: 'm³',
    rates: { 'm³': 1, 'liters': 1000, 'cu in': 61023.7, 'cu ft': 35.3147, 'gallons (US)': 264.172 }
  }
};

export default function UnitConverter({ isDark }: { isDark: boolean }) {
  const [category, setCategory] = useState<UnitCategory>('Length');
  const [fromUnit, setFromUnit] = useState(Object.keys(unitData['Length'].rates)[0]);
  const [toUnit, setToUnit] = useState(Object.keys(unitData['Length'].rates)[1]);
  const [inputValue, setInputValue] = useState<string>("1");
  const [outputValue, setOutputValue] = useState<string>("");

  // Update available units when category changes
  useEffect(() => {
    const units = Object.keys(unitData[category].rates);
    setFromUnit(units[0]);
    setToUnit(units[1]);
  }, [category]);

  // Calculate conversion
  useEffect(() => {
    const val = parseFloat(inputValue);
    if (isNaN(val)) {
      setOutputValue("");
      return;
    }

    const rates = unitData[category].rates;
    // Convert input to base unit, then from base unit to output unit
    const inBase = val / rates[fromUnit];
    const outVal = inBase * rates[toUnit];

    // Format to avoid long decimals on clean numbers
    setOutputValue(parseFloat(outVal.toFixed(6)).toString());
  }, [inputValue, fromUnit, toUnit, category]);

  const handleSwap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
    setInputValue(outputValue || "0");
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-12 h-full">
      <div className="max-w-3xl mx-auto w-full">
        <div className={`border rounded-[32px] p-8 md:p-10 shadow-sm mt-8 md:mt-2 transition-colors ${isDark ? 'bg-[#1e1f20] border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="mb-8">
            <h2 className={`text-3xl font-medium tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>Engineering Converter</h2>
            <p className={`mt-2 text-[15px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Quick conversions for structural calculations.</p>
          </div>

          {/* Category Selector */}
          <div className="mb-8 flex flex-wrap gap-2">
            {(Object.keys(unitData) as UnitCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  category === cat
                    ? (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-white')
                    : (isDark ? 'bg-[#131314] text-slate-400 hover:bg-[#333537]' : 'bg-[#f0f4f9] text-slate-600 hover:bg-slate-200')
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Conversion Interface */}
          <div className={`p-6 rounded-[24px] border ${isDark ? 'bg-[#131314] border-slate-800' : 'bg-[#f0f4f9] border-transparent'}`}>
            <div className="flex flex-col md:flex-row items-center gap-4">
              
              {/* FROM Input */}
              <div className="flex-1 w-full space-y-3">
                <label className={`block text-[12px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>From</label>
                <div className={`flex items-center rounded-[16px] border transition-colors ${isDark ? 'bg-[#1e1f20] border-slate-700 focus-within:border-slate-500' : 'bg-white border-slate-200 focus-within:border-slate-400'}`}>
                  <input 
                    type="number" 
                    value={inputValue} 
                    onChange={(e) => setInputValue(e.target.value)}
                    className={`w-full p-4 bg-transparent outline-none text-lg font-medium ${isDark ? 'text-white' : 'text-slate-800'}`}
                  />
                  <select 
                    value={fromUnit} 
                    onChange={(e) => setFromUnit(e.target.value)}
                    className={`p-4 bg-transparent outline-none text-[15px] font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    {Object.keys(unitData[category].rates).map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap Button */}
              <button 
                onClick={handleSwap}
                className={`p-3 rounded-full shrink-0 transition-colors mt-6 md:mt-8 ${isDark ? 'bg-[#333537] text-slate-300 hover:text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </button>

              {/* TO Input (Read-only) */}
              <div className="flex-1 w-full space-y-3">
                <label className={`block text-[12px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>To</label>
                <div className={`flex items-center rounded-[16px] border transition-colors ${isDark ? 'bg-[#1e1f20] border-slate-700' : 'bg-white border-slate-200'}`}>
                  <input 
                    type="text" 
                    readOnly 
                    value={outputValue} 
                    className={`w-full p-4 bg-transparent outline-none text-lg font-medium ${isDark ? 'text-amber-400' : 'text-slate-800'}`}
                  />
                  <select 
                    value={toUnit} 
                    onChange={(e) => setToUnit(e.target.value)}
                    className={`p-4 bg-transparent outline-none text-[15px] font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    {Object.keys(unitData[category].rates).map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}