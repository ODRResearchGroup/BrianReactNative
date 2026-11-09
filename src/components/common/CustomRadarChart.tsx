import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Polygon,
  Line,
  Text as SvgText,
  G,
  Circle,
} from 'react-native-svg';
import {
  GAS_SENSOR_DEFINITIONS,
  SensorValues,
  readSensor,
} from '../../sensors';
import { CHANNEL_COLORS } from '../../consts';

export type RadarPoint = { x: string; y: number };
export type RadarSeries = {
  key: string;
  title: string;
  values: RadarPoint[];
  color: { fill: string; stroke: string };
};

export const LIVE_COLOR = {
  fill: `${CHANNEL_COLORS[6]}33`,
  stroke: CHANNEL_COLORS[6],
};

export const seriesColor = (index: number) => {
  const stroke = CHANNEL_COLORS[index % 10];
  return {
    fill: `${stroke}33`,
    stroke,
  };
};

export const radarSeries = (
  key: string,
  title: string,
  values: RadarPoint[],
  color = LIVE_COLOR,
): RadarSeries[] => [{ key, title, values, color }];

export const gasSeries = (
  key: string,
  title: string,
  values: SensorValues,
  color = LIVE_COLOR,
): RadarSeries[] =>
  radarSeries(
    key,
    title,
    GAS_SENSOR_DEFINITIONS.map(s => ({
      x: s.chartLabel,
      y: readSensor(values, s) ?? 0,
    })),
    color,
  );

export const radarMax = (series: RadarSeries[], floor = 1) =>
  Math.max(floor, ...series.flatMap(s => s.values.map(v => v.y)));

type Props = {
  data: RadarSeries[];
  size?: number;
  maxValue?: number;
  gridLevels?: number;
  variant?: 'full' | 'compact';
};

export default function CustomRadarChart({
  data,
  size = 300,
  maxValue,
  gridLevels,
  variant = 'full',
}: Props) {
  const compact = variant === 'compact';
  const axes = data[0]?.values ?? [];
  const n = axes.length;
  if (n < 3) {
    return null;
  }

  const max = maxValue && maxValue > 0 ? maxValue : radarMax(data);
  const levels = gridLevels ?? (compact ? 2 : 4);
  const c = size / 2;
  const maxR = c * (compact ? 0.92 : 0.75);
  const step = (2 * Math.PI) / n;

  const polar = (r: number, i: number) => {
    const a = i * step - Math.PI / 2;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const ring = (r: number) =>
    axes
      .map((_, i) => {
        const p = polar(r, i);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  const radiusOf = (v: number) => (Math.min(Math.max(v, 0), max) / max) * maxR;

  return (
    <View style={styles.chart}>
      <Svg width={size} height={size}>
        <G>
          {Array.from({ length: levels }, (_, l) => (
            <Polygon
              key={`grid-${l}`}
              points={ring((maxR / levels) * (l + 1))}
              fill="none"
              stroke={compact ? '#e1e3de' : '#e0e0e0'}
              strokeWidth={1}
            />
          ))}

          {axes.map((_, i) => {
            const p = polar(maxR, i);
            return (
              <Line
                key={`axis-${i}`}
                x1={c}
                y1={c}
                x2={p.x}
                y2={p.y}
                stroke={compact ? '#e1e3de' : '#d0d0d0'}
                strokeWidth={compact ? 0.8 : 1}
              />
            );
          })}

          {data
            .slice()
            .reverse()
            .map(s => (
              <G key={s.key}>
                <Polygon
                  points={s.values
                    .map((v, i) => {
                      const p = polar(radiusOf(v.y), i);
                      return `${p.x},${p.y}`;
                    })
                    .join(' ')}
                  fill={s.color.fill}
                  stroke={s.color.stroke}
                  strokeWidth={compact ? 1.5 : 2}
                  strokeLinejoin="round"
                />
                {!compact &&
                  s.values.map((v, i) => {
                    const p = polar(radiusOf(v.y), i);
                    return (
                      <Circle
                        key={`pt-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={3}
                        fill={s.color.stroke}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  })}
              </G>
            ))}

          {!compact &&
            axes.map((a, i) => {
              const p = polar(maxR + 25, i);
              return (
                <SvgText
                  key={`label-${i}`}
                  x={p.x}
                  y={p.y}
                  fill="#333"
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                  alignmentBaseline="middle">
                  {a.x}
                </SvgText>
              );
            })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { alignItems: 'center', justifyContent: 'center' },
});
