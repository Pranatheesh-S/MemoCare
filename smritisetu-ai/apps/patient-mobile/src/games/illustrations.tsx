import React from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { colors } from "../theme/colors";

/**
 * Culturally familiar objects for the matching game.
 *
 * Everything here is drawn from everyday life in Assam and the wider North
 * East: tea, bamboo, the gamosa, traditional food, the state flower, festival
 * instruments and household items. Flat shapes, strong outlines and no fine
 * detail, so they read clearly at a glance and at any size.
 */

export type IllustrationProps = { size?: number };

const OUTLINE = colors.deepForest;

/** Tea leaves — the two-leaves-and-a-bud of an Assam tea garden. */
export function TeaLeaves({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 88V46" stroke={colors.mediumGreen} strokeWidth={5} strokeLinecap="round" />
      <Path
        d="M50 50C50 30 34 16 18 20c-4 18 10 34 32 30z"
        fill={colors.sage}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M50 50c0-20 16-34 32-30 4 18-10 34-32 30z"
        fill={colors.mediumGreen}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M50 44c0-12 6-20 6-26-6-4-14 6-14 14 0 5 3 9 8 12z"
        fill={colors.mint}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Bamboo basket — the woven khorahi used in every household. */
export function BambooBasket({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M20 38h60l-8 44a4 4 0 01-4 4H32a4 4 0 01-4-4z"
        fill="#C79A5B"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path d="M30 50h40M32 62h36M34 74h32" stroke={OUTLINE} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M44 38v48M56 38v48" stroke={OUTLINE} strokeWidth={2} opacity={0.6} />
      <Ellipse cx={50} cy={38} rx={32} ry={9} fill="#E0B978" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M30 38c0-14 40-14 40 0" stroke={OUTLINE} strokeWidth={3} fill="none" />
    </Svg>
  );
}

/** Gamosa — the white cloth with red woven borders, given as a mark of respect. */
export function Gamosa({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={22} y={14} width={56} height={72} rx={4} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Rect x={22} y={14} width={56} height={12} fill="#C0392B" stroke={OUTLINE} strokeWidth={2} />
      <Rect x={22} y={74} width={56} height={12} fill="#C0392B" stroke={OUTLINE} strokeWidth={2} />
      <Path d="M34 40l8 8-8 8M50 40l8 8-8 8" stroke="#C0392B" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M22 32h56M22 68h56" stroke="#C0392B" strokeWidth={2.5} />
    </Svg>
  );
}

/** Pitha — the rice cake made at Bihu. */
export function Pitha({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={62} rx={34} ry={22} fill="#E8D3A9" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M20 58c8-10 52-10 60 0" stroke={OUTLINE} strokeWidth={2.5} fill="none" />
      <Path
        d="M34 46c0-10 8-18 16-18s16 8 16 18"
        fill="#D8B77A"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Circle cx={42} cy={62} r={3.5} fill="#8B5E34" />
      <Circle cx={58} cy={66} r={3.5} fill="#8B5E34" />
      <Circle cx={50} cy={56} r={3} fill="#8B5E34" />
    </Svg>
  );
}

/** Kopou phul — the foxtail orchid, Assam's state flower and the sign of Bihu. */
export function KopouFlower({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 88V54" stroke={colors.mediumGreen} strokeWidth={5} strokeLinecap="round" />
      <G>
        <Ellipse cx={50} cy={30} rx={11} ry={16} fill="#E8A0C0" stroke={OUTLINE} strokeWidth={2.5} />
        <Ellipse cx={32} cy={44} rx={11} ry={15} fill="#F0B8D0" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(-40 32 44)" />
        <Ellipse cx={68} cy={44} rx={11} ry={15} fill="#F0B8D0" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(40 68 44)" />
        <Ellipse cx={40} cy={60} rx={10} ry={13} fill="#E8A0C0" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(-70 40 60)" />
        <Ellipse cx={60} cy={60} rx={10} ry={13} fill="#E8A0C0" stroke={OUTLINE} strokeWidth={2.5} transform="rotate(70 60 60)" />
      </G>
      <Circle cx={50} cy={46} r={8} fill="#F5E07A" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

/** Dhol — the drum that opens every Bihu. */
export function Dhol({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M18 34c0-6 8-10 14-10h36c6 0 14 4 14 10v32c0 6-8 10-14 10H32c-6 0-14-4-14-10z"
        fill="#B5763F"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Ellipse cx={20} cy={50} rx={9} ry={17} fill="#E8D3A9" stroke={OUTLINE} strokeWidth={3} />
      <Ellipse cx={80} cy={50} rx={9} ry={17} fill="#E8D3A9" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M30 34l10 32M46 32l8 36M62 32l8 34" stroke="#F0E0C0" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Kalah — the brass water pot. */
export function WaterPot({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M38 26h24l-2 10c12 5 20 15 20 26 0 13-14 22-30 22s-30-9-30-22c0-11 8-21 20-26z"
        fill="#D4A24C"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Rect x={34} y={18} width={32} height={10} rx={4} fill="#E8C170" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M26 60c14 6 34 6 48 0" stroke={OUTLINE} strokeWidth={2.5} fill="none" />
      <Ellipse cx={40} cy={54} rx={5} ry={8} fill="#F0DCA0" opacity={0.8} />
    </Svg>
  );
}

/** Jaapi — the woven bamboo sun hat. */
export function Jaapi({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M10 68c0-24 18-40 40-40s40 16 40 40z"
        fill="#E0B978"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path d="M50 28v40M24 44l26 24M76 44L50 68" stroke={OUTLINE} strokeWidth={2} opacity={0.7} />
      <Path d="M20 60c18-8 42-8 60 0" stroke={OUTLINE} strokeWidth={2.5} fill="none" />
      <Circle cx={50} cy={30} r={7} fill="#C0392B" stroke={OUTLINE} strokeWidth={2.5} />
      <Rect x={8} y={66} width={84} height={8} rx={4} fill="#C79A5B" stroke={OUTLINE} strokeWidth={3} />
    </Svg>
  );
}

/** A simple house — used by Memory Lane and the routine cards. */
export function House({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M12 48L50 18l38 30" fill="#C0392B" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={22} y={46} width={56} height={38} fill={colors.mint} stroke={OUTLINE} strokeWidth={3} />
      <Rect x={42} y={60} width={16} height={24} fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} />
      <Rect x={28} y={54} width={10} height={10} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
      <Rect x={62} y={54} width={10} height={10} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Routine step illustrations                                                */
/* -------------------------------------------------------------------------- */

export function SunRise({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={54} r={18} fill="#F5C542" stroke={OUTLINE} strokeWidth={3} />
      <Path
        d="M50 24v-10M26 34l-7-7M74 34l7-7M18 54H8M82 54h10"
        stroke="#F5C542"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Path d="M10 74h80" stroke={OUTLINE} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function Toothbrush({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={44} y={34} width={12} height={50} rx={6} fill={colors.sage} stroke={OUTLINE} strokeWidth={3} />
      <Rect x={38} y={18} width={24} height={20} rx={6} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M42 18v-6M50 18v-6M58 18v-6" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function Plate({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={52} r={32} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={50} cy={52} r={20} fill={colors.mint} stroke={OUTLINE} strokeWidth={2.5} />
      <Circle cx={44} cy={48} r={5} fill="#E8C170" />
      <Circle cx={56} cy={56} r={5} fill={colors.mediumGreen} />
    </Svg>
  );
}

export function MedicineTablet({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={22} y={26} width={56} height={48} rx={10} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={38} cy={42} r={7} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
      <Circle cx={62} cy={42} r={7} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
      <Circle cx={38} cy={60} r={7} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
      <Circle cx={62} cy={60} r={7} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

export function WaterGlass({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M32 22h36l-5 60a4 4 0 01-4 4H41a4 4 0 01-4-4z" fill="#D6ECF5" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M34 48h32l-3 34a4 4 0 01-4 4H41a4 4 0 01-4-4z" fill="#7FC4DE" />
      <Path d="M34 48h32" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

export function Moon({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M62 18a34 34 0 100 64 28 28 0 010-64z"
        fill="#F5E07A"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Circle cx={78} cy={30} r={3} fill="#F5E07A" />
      <Circle cx={86} cy={46} r={2.5} fill="#F5E07A" />
    </Svg>
  );
}

export function Walking({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={54} cy={20} r={9} fill={colors.sage} stroke={OUTLINE} strokeWidth={3} />
      <Path
        d="M54 30v26M54 40l-14 8M54 40l16 6M54 56l-10 26M54 56l12 24"
        stroke={colors.mediumGreen}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function FamilyTogether({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={34} cy={32} r={12} fill={colors.sage} stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={66} cy={32} r={12} fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} />
      <Path d="M14 84c0-14 9-24 20-24s20 10 20 24z" fill={colors.sage} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M46 84c0-14 9-24 20-24s20 10 20 24z" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
    </Svg>
  );
}

export function Phone({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M26 16c6-4 12-2 15 4l5 10c2 5 1 8-3 11l-5 4c3 9 11 17 20 20l4-5c3-4 6-5 11-3l10 5c6 3 8 9 4 15-5 8-15 11-25 8C48 79 30 61 22 41c-3-10 0-20 4-25z"
        fill={colors.mediumGreen}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HelpHand({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M38 52V24a7 7 0 1114 0v22V18a7 7 0 1114 0v28V28a7 7 0 1114 0v34c0 14-10 24-24 24H50c-12 0-20-8-24-18l-6-14a7 7 0 0111-8l7 6z"
        fill="#FFFFFF"
        stroke={colors.emergency}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PhotoFrame({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={14} y={20} width={72} height={60} rx={6} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M20 70l18-20 12 12 12-16 18 24z" fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={34} cy={38} r={6} fill="#F5C542" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

export function GameCards({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={14} y={26} width={34} height={48} rx={6} fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} />
      <Rect x={52} y={26} width={34} height={48} rx={6} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={69} cy={50} r={10} fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} />
      <Path d="M24 40h14M24 50h14M24 60h14" stroke={colors.mint} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function Calendar({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={14} y={24} width={72} height={62} rx={8} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} />
      <Rect x={14} y={24} width={72} height={18} rx={8} fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} />
      <Path d="M32 24V14M68 24V14" stroke={OUTLINE} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={34} cy={58} r={5} fill={colors.sage} />
      <Circle cx={50} cy={58} r={5} fill={colors.sage} />
      <Circle cx={66} cy={58} r={5} fill={colors.sage} />
      <Circle cx={34} cy={74} r={5} fill={colors.sage} />
      <Circle cx={50} cy={74} r={5} fill={colors.mediumGreen} />
    </Svg>
  );
}

export function CompanionFace({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={42} fill={colors.mint} stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={50} cy={42} r={18} fill="#FFFFFF" stroke={OUTLINE} strokeWidth={2.5} />
      <Circle cx={44} cy={40} r={3} fill={colors.deepForest} />
      <Circle cx={56} cy={40} r={3} fill={colors.deepForest} />
      <Path
        d="M44 48c3 4 9 4 12 0"
        stroke={colors.deepForest}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M26 78c4-12 14-18 24-18s20 6 24 18"
        stroke={OUTLINE}
        strokeWidth={3}
        fill={colors.mediumGreen}
      />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Regional content packs                                                    */
/*                                                                            */
/*  Three signature shapes per North Eastern state, in the same flat, strong- */
/*  outlined style. The remaining cards in each pack reuse the shared shapes   */
/*  above. Ids are listed in illustrationCatalog.ts and registered in         */
/*  illustrationMap.tsx — all three must agree.                               */
/* -------------------------------------------------------------------------- */

/* --- Assam --------------------------------------------------------------- */

/** One-horned rhino — Kaziranga. */
export function Rhino({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M14 66c0-14 12-24 30-24h16c14 0 26 8 26 20 0 8-4 12-4 12h-10l-3-8H37l-3 8H16s-2-4-2-8z" fill="#9AA6A0" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M20 44c-4-6-4-14 2-16 4 6 4 12 0 16z" fill="#9AA6A0" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M16 50l-6-6c-2 6 0 10 6 10z" fill="#C7CFC9" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={24} cy={52} r={2.5} fill={OUTLINE} />
    </Svg>
  );
}

/** Namghar — the village prayer house, a familiar landmark. */
export function Namghar({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M12 46L50 20l38 26z" fill="#C0392B" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={20} y={44} width={60} height={40} fill="#F0E6D2" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M44 84V58a6 6 0 0112 0v26" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} />
      <Path d="M50 12v10M46 16h8" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" />
      <Path d="M28 84V60M72 84V60" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

/** Xorai — the bell-metal offering tray with a lid. */
export function Xorai({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M30 84h40M34 84c0-6-6-8-6-16h44c0 8-6 10-6 16" fill="#D4A24C" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Ellipse cx={50} cy={52} rx={26} ry={8} fill="#E8C170" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M28 50c0-14 44-14 44 0" fill="#D4A24C" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M50 22l6 14H44z" fill="#E8C170" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx={50} cy={20} r={4} fill="#D4A24C" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

/* --- Arunachal Pradesh ------------------------------------------------------ */

/** Layered mountains. */
export function Mountains({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M6 80l26-40 18 26 12-16 22 30z" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M24 52l8-12 8 12-4 6-8 2z" fill="#FFFFFF" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M74 50l6 8-9 2-3-6z" fill="#FFFFFF" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** Mithun — the semi-wild cattle that mark wealth. */
export function Mithun({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M18 60c0-10 8-16 20-16h22c12 0 20 6 20 16v16h-10V64H28v12H18z" fill="#3B3330" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M22 44c-8-2-12-10-8-16 6 0 12 6 12 14z" fill="#F0E6D2" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M40 44c8-2 12-10 8-16-6 0-12 6-12 14z" fill="#F0E6D2" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M20 46h22v14a11 7 0 01-22 0z" fill="#5A4F49" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx={26} cy={52} r={2} fill={OUTLINE} />
    </Svg>
  );
}

/** Handloom shawl with woven bands. */
export function HandloomShawl({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M22 20h56v60l-10-6-10 6-8-6-8 6-10-6-10 6z" fill="#E7E0D3" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={22} y={30} width={56} height={7} fill="#C0392B" />
      <Rect x={22} y={44} width={56} height={5} fill={colors.mediumGreen} />
      <Rect x={22} y={56} width={56} height={7} fill="#D69E2E" />
      <Path d="M30 44v12M42 44v12M54 44v12M66 44v12" stroke={OUTLINE} strokeWidth={1.5} opacity={0.5} />
    </Svg>
  );
}

/* --- Manipur ------------------------------------------------------------- */

/** Loktak hut on a floating phumdi. */
export function LoktakHut({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M24 44L44 30l20 14z" fill="#C79A5B" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={30} y={42} width={28} height={22} fill="#E0B978" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M30 64v6M40 64v6M50 64v6" stroke={OUTLINE} strokeWidth={2.5} strokeLinecap="round" />
      <Ellipse cx={50} cy={78} rx={40} ry={10} fill={colors.sage} stroke={OUTLINE} strokeWidth={3} />
      <Path d="M16 78c14 6 54 6 68 0" stroke={colors.mediumGreen} strokeWidth={2.5} fill="none" />
    </Svg>
  );
}

/** Shirui lily. */
export function ShiruiLily({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 86V50" stroke={colors.mediumGreen} strokeWidth={5} strokeLinecap="round" />
      <Path d="M50 50c-6-16-2-30 0-34 2 4 6 18 0 34z" fill="#E4B7E0" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M50 50c-16-6-24-18-26-22 6-2 20 2 26 22z" fill="#EFD3EC" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M50 50c16-6 24-18 26-22-6-2-20 2-26 22z" fill="#EFD3EC" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={50} cy={46} r={5} fill="#F5E07A" stroke={OUTLINE} strokeWidth={2} />
    </Svg>
  );
}

/** Phanek — the Manipuri wrap skirt, bold horizontal bands. */
export function Phanek({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={22} y={22} width={56} height={56} rx={3} fill="#7A2E2E" stroke={OUTLINE} strokeWidth={3} />
      <Rect x={22} y={30} width={56} height={8} fill="#E8C170" />
      <Rect x={22} y={46} width={56} height={10} fill="#DAF1DE" />
      <Rect x={22} y={64} width={56} height={8} fill="#E8C170" />
      <Path d="M22 56h56" stroke={OUTLINE} strokeWidth={1.5} opacity={0.5} />
    </Svg>
  );
}

/* --- Meghalaya --------------------------------------------------------- */

/** Living root bridge. */
export function RootBridge({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M8 34c24 0 24 26 42 26S68 34 92 34" stroke="#6B4B2A" strokeWidth={7} fill="none" strokeLinecap="round" />
      <Path d="M8 46c24 0 22 24 42 24s18-24 42-24" stroke="#8B5E34" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d="M18 40v14M30 47v12M50 58v10M70 47v12M82 40v14" stroke="#6B4B2A" strokeWidth={3} strokeLinecap="round" />
      <Path d="M6 74h88" stroke={colors.mediumGreen} strokeWidth={5} strokeLinecap="round" />
      <Path d="M14 80c14-6 58-6 72 0" stroke="#7FC4DE" strokeWidth={3} fill="none" />
    </Svg>
  );
}

/** Knup — the full-body cane rain shield. */
export function RainShield({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 16c22 0 34 20 34 44H16c0-24 12-44 34-44z" fill="#C9A15C" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M30 60c0-20 8-34 20-34s20 14 20 34" stroke={OUTLINE} strokeWidth={2} fill="none" opacity={0.6} />
      <Path d="M22 46c8-4 48-4 56 0M18 56c10-5 54-5 64 0" stroke={OUTLINE} strokeWidth={2} fill="none" opacity={0.6} />
      <Path d="M16 60h68l-4 8H20z" fill="#8B5E34" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
    </Svg>
  );
}

/** Pine hill. */
export function PineHill({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M8 82c14-18 30-18 44 0z" fill={colors.sage} stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M40 74L54 22l14 52z" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M44 58h20M42 66h24" stroke={colors.forest} strokeWidth={2.5} />
      <Rect x={51} y={74} width={6} height={10} fill="#6B4B2A" stroke={OUTLINE} strokeWidth={2} />
    </Svg>
  );
}

/* --- Mizoram ------------------------------------------------------------- */

/** Puan — the Mizo cloth, dark ground with bright warp bands. */
export function PuanCloth({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={20} y={20} width={60} height={60} rx={3} fill="#12100F" stroke={OUTLINE} strokeWidth={3} />
      <Rect x={30} y={20} width={6} height={60} fill="#C0392B" />
      <Rect x={44} y={20} width={4} height={60} fill="#FFFFFF" />
      <Rect x={54} y={20} width={6} height={60} fill="#D69E2E" />
      <Rect x={66} y={20} width={4} height={60} fill="#FFFFFF" />
      <Path d="M20 50h60" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.4} />
    </Svg>
  );
}

/** Cheraw — the crossed bamboo poles of the bamboo dance. */
export function CherawBamboo({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M12 74L60 30M20 78L70 34" stroke="#C9A15C" strokeWidth={6} strokeLinecap="round" />
      <Path d="M88 74L40 30M80 78L30 34" stroke="#E0B978" strokeWidth={6} strokeLinecap="round" />
      <Path d="M30 34c4 3 4 6 0 9M70 34c-4 3-4 6 0 9" stroke={OUTLINE} strokeWidth={2} fill="none" />
      <Path d="M10 80h80" stroke={colors.mediumGreen} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

/** Passion fruit, cut. */
export function PassionFruit({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={40} cy={56} r={24} fill="#6B3F86" stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={68} cy={44} r={18} fill="#F0C868" stroke={OUTLINE} strokeWidth={3} />
      <Circle cx={68} cy={44} r={10} fill="#F6E3A8" />
      <Circle cx={66} cy={42} r={2} fill="#6B4B2A" />
      <Circle cx={72} cy={46} r={2} fill="#6B4B2A" />
      <Circle cx={68} cy={48} r={2} fill="#6B4B2A" />
    </Svg>
  );
}

/* --- Nagaland ---------------------------------------------------------- */

/** Naga shawl — black ground with red and white warrior bands. */
export function NagaShawl({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M20 22h60v56l-12-5-9 5-9-5-9 5-12-5z" fill="#141414" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={20} y={40} width={60} height={9} fill="#C0392B" />
      <Rect x={20} y={33} width={60} height={4} fill="#FFFFFF" />
      <Rect x={20} y={52} width={60} height={4} fill="#FFFFFF" />
      <Path d="M34 40l6 4-6 4M50 40l6 4-6 4M66 40l-6 4 6 4" stroke="#FFFFFF" strokeWidth={2} fill="none" />
    </Svg>
  );
}

/** Log drum — the hollowed tree-trunk drum of the morung. */
export function LogDrum({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M14 58c0-8 6-14 14-14h52c6 0 6 12 0 12H30c-4 0-4 6 0 6h50c6 0 6 12 0 12H28c-8 0-14-6-14-16z" fill="#8B5E34" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M30 44l-6-8M40 44l-4-8M52 44l-2-8" stroke="#6B4B2A" strokeWidth={3} strokeLinecap="round" />
      <Ellipse cx={80} cy={50} rx={4} ry={6} fill="#E8D3A9" stroke={OUTLINE} strokeWidth={2.5} />
    </Svg>
  );
}

/** Hornbill head. */
export function Hornbill({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M30 40c0-14 12-22 26-22 14 0 22 8 22 20 0 16-12 28-28 28-14 0-24-10-24-24z" fill="#1A1A1A" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M56 40c6 0 30 2 34 8-4 6-24 8-34 8z" fill="#F0E6D2" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M58 34c6-2 24-2 30 2-2 4-6 5-6 5s-14-2-24-1z" fill="#D69E2E" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={44} cy={38} r={3} fill="#FFFFFF" />
      <Circle cx={44} cy={38} r={1.5} fill={OUTLINE} />
    </Svg>
  );
}

/* --- Sikkim ------------------------------------------------------------- */

/** Snow peak — Kanchenjunga. */
export function SnowPeak({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M6 82L38 26l16 26 10-14 24 44z" fill="#8FA9C2" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M30 42l8-16 10 18-6 8-8-2-6 4z" fill="#FFFFFF" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M64 38l8 14-10 2-4-8z" fill="#FFFFFF" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M6 82h88" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Chorten — a Buddhist stupa; a familiar landmark, shown with care. */
export function Chorten({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M34 84h32l-4-14H38z" fill="#E7E0D3" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M30 70h40l-6-12H36z" fill="#FFFFFF" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M38 58c0-14 24-14 24 0z" fill="#F0E6D2" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={44} y={34} width={12} height={12} fill="#D69E2E" stroke={OUTLINE} strokeWidth={2.5} />
      <Path d="M50 34V22M46 24c4-6 4 0 8-2" stroke={OUTLINE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={50} cy={18} r={3} fill="#D69E2E" stroke={OUTLINE} strokeWidth={2} />
    </Svg>
  );
}

/** Prayer flags on a line. */
export function PrayerFlags({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M10 24c26 14 54 14 80 0" stroke={OUTLINE} strokeWidth={2.5} fill="none" />
      <Path d="M20 27l-2 14 12-3z" fill="#C0392B" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M36 31l-1 14 12-4z" fill="#DAF1DE" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M52 32l0 14 12-4z" fill="#D69E2E" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M68 31l2 14 11-6z" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M50 46v34" stroke="#6B4B2A" strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

/* --- Tripura ----------------------------------------------------------- */

/** Risa — the Tripuri woven scarf. */
export function RisaCloth({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M14 40h72l-6 14H20z" fill="#B5202B" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M20 54h60l-4 10H24z" fill="#E8C170" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M26 40l6-10M42 40l4-10M58 40l0-10M74 40l-4-10" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Path d="M30 47h40M28 59h44" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.7} />
    </Svg>
  );
}

/** Garia pole — bamboo dressed with flowers for the puja. */
export function GariaPole({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 88V22" stroke="#C9A15C" strokeWidth={6} strokeLinecap="round" />
      <Path d="M50 30c-10 0-16-6-16-6s6-6 16-6 16 6 16 6-6 6-16 6z" fill={colors.mint} stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Circle cx={38} cy={40} r={5} fill="#E4B7E0" stroke={OUTLINE} strokeWidth={2} />
      <Circle cx={62} cy={44} r={5} fill="#F0C868" stroke={OUTLINE} strokeWidth={2} />
      <Circle cx={40} cy={54} r={5} fill="#F0C868" stroke={OUTLINE} strokeWidth={2} />
      <Circle cx={60} cy={58} r={5} fill="#E4B7E0" stroke={OUTLINE} strokeWidth={2} />
      <Path d="M50 22l0-8" stroke="#C0392B" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Pineapple — also used for jackfruit in the Tripura pack. */
export function Pineapple({ size = 72 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 30c14 0 22 12 22 28s-8 26-22 26-22-10-22-26 8-28 22-28z" fill="#E0A83C" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M36 40l28 28M64 40L36 68M44 34l14 46M56 34L42 80" stroke="#8B5E34" strokeWidth={2} opacity={0.7} />
      <Path d="M50 30c-2-10 4-16 4-16s2 8-4 16zM50 30c2-10-4-16-4-16s-2 8 4 16zM50 28c0-8 8-12 8-12s-2 10-8 12z" fill={colors.mediumGreen} stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
    </Svg>
  );
}
