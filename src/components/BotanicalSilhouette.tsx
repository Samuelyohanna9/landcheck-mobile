import Svg, { Ellipse, G, Path } from "react-native-svg";

type BotanicalSilhouetteProps = {
  color?: string;
  opacity?: number;
};

export const BotanicalSilhouette = ({ color = "#1d7f4f", opacity = 0.12 }: BotanicalSilhouetteProps) => (
  <Svg width="100%" height="100%" viewBox="0 0 220 260">
    <G opacity={opacity}>
      <Path d="M111 240C108 220 107 198 107 178C107 143 110 108 118 75C123 54 130 36 140 18" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" />
      <Path d="M108 182C90 166 73 150 58 132" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Path d="M112 142C132 129 149 114 166 96" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Path d="M112 104C95 89 82 72 71 54" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Ellipse cx="154" cy="45" rx="28" ry="58" fill={color} transform="rotate(28 154 45)" />
      <Ellipse cx="175" cy="105" rx="22" ry="46" fill={color} transform="rotate(24 175 105)" />
      <Ellipse cx="67" cy="115" rx="24" ry="52" fill={color} transform="rotate(-28 67 115)" />
      <Ellipse cx="48" cy="70" rx="18" ry="39" fill={color} transform="rotate(-32 48 70)" />
      <Ellipse cx="88" cy="194" rx="22" ry="46" fill={color} transform="rotate(-18 88 194)" />
      <Ellipse cx="148" cy="176" rx="18" ry="40" fill={color} transform="rotate(18 148 176)" />
    </G>
  </Svg>
);
