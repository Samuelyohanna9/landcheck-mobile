import Svg, { G, Path } from "react-native-svg";

type LeafDecorProps = {
  variant?: "leaf" | "leafyGreen" | "sprout";
  color?: string;
  opacity?: number;
  strokeWidth?: number;
};

// Decorative paths adapted from Lucide icons:
// https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/leaf.svg
// https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/leafy-green.svg
// https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/sprout.svg
export const LeafDecor = ({ variant = "leaf", color = "#0d6a44", opacity = 0.18, strokeWidth = 1.8 }: LeafDecorProps) => {
  const paths =
    variant === "leafyGreen"
      ? [
          "M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22",
          "M2 22 17 7",
        ]
      : variant === "sprout"
        ? [
            "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
            "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4",
            "M5 21h14",
          ]
        : [
            "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
            "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
          ];

  return (
    <Svg width="100%" height="100%" viewBox="0 0 24 24">
      <G opacity={opacity}>
        {paths.map((d) => (
          <Path key={d} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </G>
    </Svg>
  );
};
