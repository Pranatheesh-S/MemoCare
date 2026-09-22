import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { palette } from "./theme";

type Point = { label: string; value: number };

const PAD_L = 30;
const PAD_B = 18;
const PAD_T = 8;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const m = step * mag;
    if (m >= v) return m;
  }
  return 10 * mag;
}

/** Thins x-axis labels so they never overlap. */
function tickEvery(n: number): number {
  if (n <= 8) return 1;
  if (n <= 16) return 2;
  if (n <= 24) return 4;
  return Math.ceil(n / 8);
}

export function BarChart({
  data,
  color = palette.primary,
  height = 150,
  width = 320,
  unit = "",
}: {
  data: Point[];
  color?: string;
  height?: number;
  width?: number;
  unit?: string;
}) {
  const values = data.map((d) => Math.max(0, d.value));
  const max = niceMax(Math.max(1, ...values));
  const chartW = width - PAD_L;
  const chartH = height - PAD_B - PAD_T;
  const step = chartW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(22, step * 0.6));
  const every = tickEvery(data.length);

  return (
    <Svg width={width} height={height}>
      {[0, 0.5, 1].map((f) => {
        const y = PAD_T + chartH * (1 - f);
        return (
          <React.Fragment key={f}>
            <Line x1={PAD_L} y1={y} x2={width} y2={y} stroke={palette.line} strokeWidth={1} />
            <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={palette.faint} textAnchor="end">
              {Math.round(max * f)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {data.map((d, i) => {
        const v = Math.max(0, d.value);
        const h = (v / max) * chartH;
        const x = PAD_L + step * i + (step - barW) / 2;
        return (
          <Rect
            key={i}
            x={x}
            y={PAD_T + chartH - h}
            width={barW}
            height={Math.max(v > 0 ? 2 : 0, h)}
            rx={2}
            fill={v > 0 ? color : palette.line}
          />
        );
      })}
      {data.map((d, i) =>
        i % every === 0 ? (
          <SvgText
            key={`l${i}`}
            x={PAD_L + step * i + step / 2}
            y={height - 4}
            fontSize={9}
            fill={palette.faint}
            textAnchor="middle"
          >
            {d.label}
          </SvgText>
        ) : null,
      )}
      {unit ? (
        <SvgText x={width} y={10} fontSize={9} fill={palette.faint} textAnchor="end">
          {unit}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export function LineChart({
  data, // value < 0 = no data for that point (gap)
  color = palette.primary,
  height = 150,
  width = 320,
  unit = "",
  fixedMax,
}: {
  data: Point[];
  color?: string;
  height?: number;
  width?: number;
  unit?: string;
  fixedMax?: number;
}) {
  const present = data.map((d, i) => ({ ...d, i })).filter((d) => d.value >= 0);
  const max = fixedMax ?? niceMax(Math.max(1, ...present.map((d) => d.value)));
  const chartW = width - PAD_L;
  const chartH = height - PAD_B - PAD_T;
  const step = chartW / Math.max(1, data.length - 1);
  const every = tickEvery(data.length);
  const xy = (i: number, v: number) => ({
    x: PAD_L + step * i,
    y: PAD_T + chartH * (1 - Math.min(1, v / max)),
  });

  // build path across present points only (breaks on gaps)
  let path = "";
  let started = false;
  for (const p of present) {
    const { x, y } = xy(p.i, p.value);
    path += `${started ? "L" : "M"}${x},${y} `;
    started = true;
  }

  return (
    <Svg width={width} height={height}>
      {[0, 0.5, 1].map((f) => {
        const y = PAD_T + chartH * (1 - f);
        return (
          <React.Fragment key={f}>
            <Line x1={PAD_L} y1={y} x2={width} y2={y} stroke={palette.line} strokeWidth={1} />
            <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={palette.faint} textAnchor="end">
              {Math.round(max * f)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {path ? <Path d={path.trim()} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" /> : null}
      {present.map((p) => {
        const { x, y } = xy(p.i, p.value);
        return <Circle key={p.i} cx={x} cy={y} r={3} fill={color} />;
      })}
      {data.map((d, i) =>
        i % every === 0 ? (
          <SvgText key={`l${i}`} x={PAD_L + step * i} y={height - 4} fontSize={9} fill={palette.faint} textAnchor="middle">
            {d.label}
          </SvgText>
        ) : null,
      )}
      {unit ? (
        <SvgText x={width} y={10} fontSize={9} fill={palette.faint} textAnchor="end">
          {unit}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export function RingProgress({
  value, // 0..1
  size = 96,
  color = palette.primary,
  label,
}: {
  value: number;
  size?: number;
  color?: string;
  label?: string;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <SvgText x={size / 2} y={size / 2 + 6} fontSize={18} fontWeight="800" fill={palette.ink} textAnchor="middle">
          {Math.round(pct * 100)}%
        </SvgText>
      </Svg>
      {label ? <Text style={{ color: palette.inkSoft, fontSize: 12, marginTop: 4 }}>{label}</Text> : null}
    </View>
  );
}

/** Horizontal bar row — for "by game" comparisons. */
export function HBar({
  label,
  value,
  max,
  caption,
  color = palette.primary,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: palette.ink, fontSize: 13, fontWeight: "700" }}>{label}</Text>
        {caption ? <Text style={{ color: palette.inkSoft, fontSize: 12 }}>{caption}</Text> : null}
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: palette.paperDim, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color, borderRadius: 5 }} />
      </View>
    </View>
  );
}
