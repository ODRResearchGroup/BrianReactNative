import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Polygon,
  Line,
  Text as SvgText,
  G,
  Circle,
} from 'react-native-svg';

type RadarDataPoint = {
  x: string;
  y: number;
};

type RadarChartProps = {
  data: Array<{
    key: string;
    title: string;
    values: RadarDataPoint[];
    color: { fill: string; stroke: string };
  }>;
  size?: number;
  maxValue?: number;
  zoomLevel?: number; // <-- ADD THIS
  gridLevels?: number;
};

const CustomRadarChart: React.FC<RadarChartProps> = ({
  data,
  size = 300,
  maxValue = 5,
  gridLevels = 4,
  zoomLevel = 1,
}) => {
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = (size / 2) * 0.75; // Leave space for labels
  const numAxes = data[0]?.values.length || 8;
  const angleStep = (2 * Math.PI) / numAxes;

  // Convert polar coordinates to cartesian
  const polarToCartesian = (
    radius: number,
    angleIndex: number,
  ): { x: number; y: number } => {
    const angle = angleIndex * angleStep - Math.PI / 2; // Start from top
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  // Generate grid circles (concentric polygons)
  const generateGridPolygons = () => {
    const polygons = [];
    for (let level = 1; level <= gridLevels; level++) {
      const radius = (maxRadius / gridLevels) * level;
      const points: string[] = [];

      for (let i = 0; i < numAxes; i++) {
        const point = polarToCartesian(radius, i);
        points.push(`${point.x},${point.y}`);
      }

      polygons.push(
        <Polygon
          key={`grid-${level}`}
          points={points.join(' ')}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth="1"
        />,
      );
    }
    return polygons;
  };

  // Generate axes lines
  const generateAxes = () => {
    const axes = [];
    for (let i = 0; i < numAxes; i++) {
      const endPoint = polarToCartesian(maxRadius, i);
      axes.push(
        <Line
          key={`axis-${i}`}
          x1={centerX}
          y1={centerY}
          x2={endPoint.x}
          y2={endPoint.y}
          stroke="#d0d0d0"
          strokeWidth="1"
        />,
      );
    }
    return axes;
  };

  // Generate axis labels
  const generateLabels = () => {
    const labels = [];
    const labelOffset = 25;

    for (let i = 0; i < numAxes; i++) {
      const labelPos = polarToCartesian(maxRadius + labelOffset, i);
      const labelText = data[0]?.values[i]?.x || '';

      labels.push(
        <SvgText
          key={`label-${i}`}
          x={labelPos.x}
          y={labelPos.y}
          fill="#333"
          fontSize="10"
          fontWeight="600"
          textAnchor="middle"
          alignmentBaseline="middle">
          {labelText}
        </SvgText>,
      );
    }
    return labels;
  };

  // Convert data values to polygon points
  const generateDataPolygon = (values: RadarDataPoint[]) => {
    const points: string[] = [];

    values.forEach((dataPoint, index) => {
      const normalizedValue = Math.min(dataPoint.y, maxValue);
      const radius = (normalizedValue / maxValue) * maxRadius * zoomLevel; // <-- FIX
      const point = polarToCartesian(radius, index);
      points.push(`${point.x},${point.y}`);
    });

    return points.join(' ');
  };

  // Generate data point circles (optional - for interactive highlighting)
  const generateDataPoints = (values: RadarDataPoint[], color: string) => {
    return values.map((dataPoint, index) => {
      const normalizedValue = Math.min(dataPoint.y, maxValue);
      const radius = (normalizedValue / maxValue) * maxRadius * zoomLevel;

      const point = polarToCartesian(radius, index);

      return (
        <Circle
          key={`point-${index}`}
          cx={point.x}
          cy={point.y}
          r="3"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      );
    });
  };

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <G>
          {/* Background grid */}
          {generateGridPolygons()}

          {/* Axes */}
          {generateAxes()}

          {/* Data overlays - render in reverse so first item is on top */}
          {data
            .slice()
            .reverse()
            .map(dataset => (
              <G key={dataset.key}>
                <Polygon
                  points={generateDataPolygon(dataset.values)}
                  fill={dataset.color.fill}
                  stroke={dataset.color.stroke}
                  strokeWidth="2"
                />
                {generateDataPoints(dataset.values, dataset.color.stroke)}
              </G>
            ))}

          {/* Labels on top */}
          {generateLabels()}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomRadarChart;
