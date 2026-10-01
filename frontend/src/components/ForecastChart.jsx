import { useState, useMemo, useCallback } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const COLORS = {
  history: "#94a3b8", // slate-400
  actual: "#e2e8f0", // ink equivalent in dark mode
  forecast: "#14b8a6", // teal-500
  forecastArea: "rgba(20, 184, 166, 0.15)", // translucent teal
  grid: "#2d313a",
  text: "#8b949e",
};

export default function ForecastChart({
  history = [],
  values = [],
  label = "value",
  onHorizonChange = null,
}) {
  const [activeSignals, setActiveSignals] = useState({
    consumption: true,
    temperature: false,
    wind: false,
    rainfall: false,
  });

  const [localHorizon, setLocalHorizon] = useState(values.length);
  const [isDragging, setIsDragging] = useState(false);

  // Combine and format data for Recharts
  const data = useMemo(() => {
    // Trim history to a reasonable window (e.g. 2x forecast horizon or at least 48)
    const historyWindow = Math.max(values.length * 2, 48);
    const recentHistory = history.slice(-historyWindow);

    const merged = [];
    
    // Process history points
    recentHistory.forEach((h) => {
      merged.push({
        timestamp: h.timestamp,
        time: new Date(h.timestamp).getTime(),
        historical: h.value,
        isHistory: true,
      });
    });

    // Process forecast points
    values.forEach((v) => {
      // Create upper and lower bounds for the tunnel (future placeholder if backend adds uncertainty)
      // Since backend doesn't provide it, we don't fabricate it, we just don't set upper/lower.
      // But we structure it so it can be added.
      merged.push({
        timestamp: v.timestamp,
        time: new Date(v.timestamp).getTime(),
        predicted: v.predicted,
        actual: v.actual,
        isForecast: true,
        // tunnelUpper: v.predicted * 1.05, // Example of how it would be structured if data existed
        // tunnelLower: v.predicted * 0.95,
      });
    });

    return merged;
  }, [history, values]);

  const originTime = useMemo(() => {
    if (history.length > 0) {
      return new Date(history[history.length - 1].timestamp).getTime();
    }
    return data[0]?.time;
  }, [history, data]);

  const toggleSignal = (signal) => {
    setActiveSignals((prev) => ({ ...prev, [signal]: !prev[signal] }));
  };

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (onHorizonChange && localHorizon !== values.length) {
      onHorizonChange(localHorizon);
    }
  }, [localHorizon, values.length, onHorizonChange]);

  const hasActual = values.some((v) => v.actual != null);

  if (!data.length) return <p className="text-sm text-muted">No data to chart.</p>;

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Multi-layer Signal Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <SignalToggle 
            label="Consumption" 
            color={COLORS.forecast} 
            active={activeSignals.consumption} 
            onClick={() => toggleSignal("consumption")} 
          />
          {/* Graceful fallback: show disabled toggles for missing backend signals */}
          <SignalToggle 
            label="Temperature" 
            color="#f59e0b" 
            active={activeSignals.temperature} 
            disabled={true} 
            title="Temperature data not provided by backend"
          />
          <SignalToggle 
            label="Wind" 
            color="#3b82f6" 
            active={activeSignals.wind} 
            disabled={true} 
            title="Wind data not provided by backend"
          />
          <SignalToggle 
            label="Rainfall" 
            color="#8b5cf6" 
            active={activeSignals.rainfall} 
            disabled={true} 
            title="Rainfall data not provided by backend"
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium text-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted" /> Historical
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-accent" /> Prediction
          </div>
          {hasActual && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-ink" /> Actual
            </div>
          )}
        </div>
      </div>

      <div 
        className="relative h-[400px] w-full bg-[#11131a] rounded-lg border border-line p-4 shadow-inner"
        style={{ cursor: isDragging ? 'ew-resize' : 'default' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="time" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t) => {
                const d = new Date(t);
                return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
              }}
              stroke={COLORS.text}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            <YAxis 
              stroke={COLORS.text}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val.toLocaleString()}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Today Boundary */}
            {originTime && (
              <ReferenceLine 
                x={originTime} 
                stroke="#ef4444" 
                strokeDasharray="4 4" 
                label={{ position: 'top', value: 'TODAY', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} 
              />
            )}

            {/* Historical Line */}
            {activeSignals.consumption && (
              <Line 
                type="monotone" 
                dataKey="historical" 
                stroke={COLORS.history} 
                strokeWidth={1.5} 
                dot={false}
                activeDot={{ r: 4, fill: COLORS.history, stroke: '#11131a' }}
                isAnimationActive={false}
              />
            )}

            {/* Actual Values (Backtest) */}
            {activeSignals.consumption && hasActual && (
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke={COLORS.actual} 
                strokeWidth={1.5} 
                dot={false}
                activeDot={{ r: 4, fill: COLORS.actual, stroke: '#11131a' }}
                isAnimationActive={false}
              />
            )}

            {/* Forecast Tunnel (Area) - placeholder for uncertainty */}
            {/* If upper/lower bounds exist in data, this would render them */}
            {activeSignals.consumption && (
              <Area 
                type="monotone" 
                dataKey="tunnelUpper" // Backend doesn't provide this yet
                stroke="none" 
                fill={COLORS.forecastArea} 
                isAnimationActive={false}
              />
            )}

            {/* Forecast Prediction Curve */}
            {activeSignals.consumption && (
              <Line 
                type="monotone" 
                dataKey="predicted" 
                stroke={COLORS.forecast} 
                strokeWidth={2.5} 
                dot={false}
                activeDot={{ r: 5, fill: COLORS.forecast, stroke: '#11131a', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={800}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Time Machine Horizon Control */}
      {onHorizonChange && (
        <div className="bg-surface border border-line rounded-lg p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium text-accent">Forecast Time Machine</span>
            <span className="text-muted font-mono bg-[#090a0f] px-2 py-1 rounded">Horizon: {localHorizon} steps</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="168" // arbitrary max or could be passed as prop
            value={localHorizon}
            onChange={(e) => setLocalHorizon(parseInt(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={handleDragEnd}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={handleDragEnd}
            className="w-full h-1 bg-[#2d313a] rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>+1 Step</span>
            <span>Drag to travel through time and regenerate forecast</span>
            <span>+168 Steps</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom Tooltip for the multi-layer graph
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const dateStr = new Date(label).toLocaleString();
    
    return (
      <div className="bg-[#090a0f]/95 border border-[#2d313a] p-3 rounded shadow-xl backdrop-blur-sm min-w-[200px]">
        <p className="text-xs text-muted mb-2 font-mono border-b border-[#2d313a] pb-1">{dateStr}</p>
        
        {data.isHistory && data.historical != null && (
          <div className="flex justify-between items-center text-sm py-1">
            <span className="flex items-center gap-1.5 text-muted">
              <div className="w-2 h-2 rounded-full bg-muted" /> Historical
            </span>
            <span className="font-mono text-[#e2e8f0]">{data.historical.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
          </div>
        )}
        
        {data.isForecast && data.predicted != null && (
          <div className="flex justify-between items-center text-sm py-1">
            <span className="flex items-center gap-1.5 text-accent">
              <div className="w-2 h-2 rounded-full bg-accent" /> Prediction
            </span>
            <span className="font-mono text-accent font-bold">{data.predicted.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
          </div>
        )}
        
        {data.isForecast && data.actual != null && (
          <div className="flex justify-between items-center text-sm py-1">
            <span className="flex items-center gap-1.5 text-[#e2e8f0]">
              <div className="w-2 h-2 rounded-full bg-[#e2e8f0]" /> Actual
            </span>
            <span className="font-mono text-[#e2e8f0]">{data.actual.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
          </div>
        )}
        
        {/* If uncertainty existed, we would show it here */}
        {data.tunnelUpper && (
          <div className="text-xs text-muted mt-1 pt-1 border-t border-[#2d313a]">
            95% CI: [{data.tunnelLower?.toFixed(1)}, {data.tunnelUpper?.toFixed(1)}]
          </div>
        )}
      </div>
    );
  }
  return null;
}

function SignalToggle({ label, color, active, onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border
        ${disabled ? 'opacity-30 cursor-not-allowed border-transparent bg-transparent' : 
          active ? 'bg-surface border-line shadow-sm' : 'bg-transparent border-transparent text-muted hover:bg-surface/50'}
      `}
    >
      <div 
        className="w-2 h-2 rounded-full transition-all duration-200" 
        style={{ 
          backgroundColor: color,
          opacity: active ? 1 : 0.3,
          boxShadow: active && !disabled ? `0 0 8px ${color}` : 'none'
        }} 
      />
      <span style={{ color: active && !disabled ? '#e2e8f0' : 'inherit' }}>{label}</span>
    </button>
  );
}
