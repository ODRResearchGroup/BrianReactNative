import Svg, { Circle } from 'react-native-svg';

export default function ChevronUpIcon({
  color,
  size = 10,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
    </Svg>
  );
}
