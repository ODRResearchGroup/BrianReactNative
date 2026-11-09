import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { GRAPH_HEIGHT, SAMPLE_MS } from '../consts';
import { ChartLine } from '../types';
import { agoLabel } from '../utils';
import { COLORS } from '../../../../consts';

export default function LineGraph({
  lines,
  windowSize,
  filled,
  summary,
}: {
  lines: ChartLine[];
  windowSize: number;
  filled: boolean;
  summary: string;
}) {
  const [w, setW] = useState(0);
  const padY = 16;
  const height = GRAPH_HEIGHT;

  const toSegments = (values: (number | null)[]) => {
    const n = values.length;
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];

    values.forEach((v, i) => {
      if (v === null || w === 0) {
        if (current.length) {
          segments.push(current);
          current = [];
        }
        return;
      }
      const x = windowSize <= 1 ? w : w - ((n - 1 - i) / (windowSize - 1)) * w;
      const y = padY + (1 - v) * (height - padY * 2);
      current.push({ x, y });
    });
    if (current.length) {
      segments.push(current);
    }
    return segments;
  };

  const linePath = (seg: { x: number; y: number }[]) =>
    seg
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(' ');

  const areaPath = (seg: { x: number; y: number }[]) =>
    `${linePath(seg)} L${seg[seg.length - 1].x.toFixed(1)} ${
      height - padY
    } L${seg[0].x.toFixed(1)} ${height - padY} Z`;

  return (
    <View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={styles.graph}
        onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {[0, 0.5, 1].map(f => (
              <Line
                key={f}
                x1={0}
                x2={w}
                y1={padY + (1 - f) * (height - padY * 2)}
                y2={padY + (1 - f) * (height - padY * 2)}
                stroke={COLORS.grid}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

            {lines.map(line =>
              toSegments(line.values).map((seg, i) =>
                seg.length > 1 ? (
                  <React.Fragment key={`${line.key}-${i}`}>
                    {filled && (
                      <Path
                        d={areaPath(seg)}
                        fill={line.color}
                        fillOpacity={0.1}
                      />
                    )}
                    <Path
                      d={linePath(seg)}
                      stroke={line.color}
                      strokeWidth={filled ? 2.5 : 1.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </React.Fragment>
                ) : null,
              ),
            )}
          </Svg>
        )}

        <Text style={[styles.axisLabel, styles.axisTop]}>High</Text>
        <Text style={[styles.axisLabel, styles.axisBottom]}>Low</Text>
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.caption}>
          {agoLabel((Math.max(windowSize, 2) - 1) * (SAMPLE_MS / 1000))}
        </Text>
        <Text style={styles.caption}>Now</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 13, lineHeight: 18, color: COLORS.muted },

  graph: {
    width: '100%',
    height: GRAPH_HEIGHT,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    overflow: 'hidden',
  },

  axisLabel: {
    position: 'absolute',
    left: 10,
    fontSize: 12,
    color: COLORS.muted,
  },
  axisTop: { top: 2 },
  axisBottom: { bottom: 2 },

  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
