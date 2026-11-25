/**
 * Selbst erstellte, schematische Strichfiguren-Illustrationen.
 * Sie zeigen nur die ungefähre Körperposition/Bewegungsrichtung (blass = Ausgangs-,
 * kräftig = Endposition). Das betroffene Bein ist farbig hervorgehoben.
 * Es werden keine medizinischen Aussagen aus den Bildern abgeleitet.
 */
type Pt = [number, number];
interface Pose {
  head: Pt;
  neck: Pt;
  hip: Pt;
  lElbow: Pt;
  lHand: Pt;
  rElbow: Pt;
  rHand: Pt;
  lKnee: Pt;
  lAnkle: Pt;
  lToe: Pt;
  rKnee: Pt;
  rAnkle: Pt;
  rToe: Pt;
}
type Prop = 'floor' | 'chair' | 'wall' | 'wallLeft' | 'step' | 'stepLow' | 'band' | 'mat' | 'bike' | 'ball' | 'cones' | 'weight' | 'pad' | 'arrowUp' | 'hoop' | 'bandAnkle';
interface Ill {
  poses: Pose[];
  props: Prop[];
}

const STAND: Pose = {
  head: [100, 24], neck: [100, 35], hip: [100, 66],
  lElbow: [97, 50], lHand: [96, 64], rElbow: [103, 50], rHand: [104, 64],
  lKnee: [98, 87], lAnkle: [98, 107], lToe: [106, 109],
  rKnee: [102, 87], rAnkle: [102, 107], rToe: [110, 109]
};
const mv = (p: Pose, patch: Partial<Pose>): Pose => ({ ...p, ...patch });
const shift = (p: Pose, dx: number, dy: number): Pose =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [v[0] + dx, v[1] + dy]])) as unknown as Pose;

const SEATED: Pose = {
  head: [88, 33], neck: [89, 44], hip: [92, 75],
  lElbow: [96, 60], lHand: [106, 72], rElbow: [98, 60], rHand: [108, 73],
  lKnee: [114, 74], lAnkle: [114, 104], lToe: [122, 108],
  rKnee: [117, 76], rAnkle: [118, 104], rToe: [126, 108]
};
const CALF_UP = mv(STAND, { lAnkle: [99, 100], lToe: [106, 109], rAnkle: [103, 100], rToe: [110, 109], lElbow: [112, 46], lHand: [124, 44], rElbow: [113, 48], rHand: [125, 46] });
const CALF_DOWN = mv(CALF_UP, { lAnkle: [98, 107], lToe: [106, 109], rAnkle: [102, 107], rToe: [110, 109], head: [100, 31], neck: [100, 42], hip: [100, 72] });

const ILL: Record<string, Ill> = {
  standing: { poses: [shift(STAND, -6, 0), STAND], props: ['floor', 'chair'] },
  seated_ankle: { poses: [mv(SEATED, { rToe: [124, 96] }), mv(SEATED, { rToe: [125, 110], rAnkle: [118, 102] })], props: ['floor', 'chair'] },
  seated_band: { poses: [mv(SEATED, { rToe: [124, 97] }), mv(SEATED, { rToe: [126, 110] })], props: ['floor', 'chair', 'band'] },
  seated_calf: { poses: [SEATED, mv(SEATED, { lAnkle: [114, 97], rAnkle: [118, 97] })], props: ['floor', 'chair'] },
  long_sit: {
    poses: [{ head: [62, 62], neck: [66, 72], hip: [72, 104], lElbow: [70, 88], lHand: [76, 102], rElbow: [72, 88], rHand: [78, 102], lKnee: [98, 101], lAnkle: [124, 104], lToe: [126, 96], rKnee: [98, 103], rAnkle: [124, 106], rToe: [127, 98] }],
    props: ['floor', 'mat']
  },
  calf_raise: { poses: [CALF_DOWN, CALF_UP], props: ['floor', 'wall'] },
  calf_raise_weight: { poses: [mv(CALF_DOWN, { lElbow: [96, 50], lHand: [94, 66] }), mv(CALF_UP, { lElbow: [96, 50], lHand: [94, 66] })], props: ['floor', 'wall', 'weight'] },
  calf_raise_single: {
    poses: [mv(CALF_DOWN, { lKnee: [96, 87], lAnkle: [86, 96], lToe: [86, 104] }), mv(CALF_UP, { lKnee: [96, 82], lAnkle: [86, 92], lToe: [86, 99] })],
    props: ['floor', 'wall']
  },
  step_calf: {
    poses: [
      shift(mv(CALF_DOWN, { lAnkle: [98, 101], lToe: [106, 95], rAnkle: [102, 101], rToe: [110, 95] }), 0, -10),
      shift(mv(CALF_UP, { lAnkle: [99, 86], lToe: [106, 95], rAnkle: [103, 86], rToe: [110, 95] }), 0, -10)
    ],
    props: ['floor', 'wall', 'stepLow']
  },
  knee_to_wall: {
    poses: [
      { head: [108, 25], neck: [110, 36], hip: [104, 66], lElbow: [122, 44], lHand: [136, 44], rElbow: [124, 46], rHand: [137, 47], lKnee: [96, 87], lAnkle: [86, 103], lToe: [94, 109], rKnee: [122, 86], rAnkle: [118, 107], rToe: [126, 109] },
      { head: [112, 25], neck: [114, 36], hip: [108, 66], lElbow: [124, 44], lHand: [136, 44], rElbow: [126, 46], rHand: [137, 47], lKnee: [98, 87], lAnkle: [86, 103], lToe: [94, 109], rKnee: [132, 84], rAnkle: [118, 107], rToe: [126, 109] }
    ],
    props: ['floor', 'wall']
  },
  walking: {
    poses: [{ head: [101, 24], neck: [100, 35], hip: [100, 66], lElbow: [106, 50], lHand: [112, 60], rElbow: [93, 50], rHand: [88, 62], lKnee: [94, 87], lAnkle: [84, 104], lToe: [91, 109], rKnee: [110, 86], rAnkle: [116, 106], rToe: [124, 106] }],
    props: ['floor']
  },
  running: {
    poses: [{ head: [108, 26], neck: [105, 37], hip: [98, 66], lElbow: [114, 48], lHand: [119, 38], rElbow: [93, 52], rHand: [100, 60], lKnee: [92, 88], lAnkle: [76, 96], lToe: [74, 103], rKnee: [116, 77], rAnkle: [112, 95], rToe: [121, 97] }],
    props: ['floor']
  },
  cod: {
    poses: [{ head: [108, 26], neck: [105, 37], hip: [98, 66], lElbow: [114, 48], lHand: [119, 38], rElbow: [93, 52], rHand: [100, 60], lKnee: [92, 88], lAnkle: [76, 96], lToe: [74, 103], rKnee: [116, 77], rAnkle: [112, 95], rToe: [121, 97] }],
    props: ['floor', 'cones']
  },
  sit_to_stand: { poses: [shift(SEATED, -6, 0), mv(shift(STAND, 4, 0), { lElbow: [112, 48], lHand: [124, 48], rElbow: [112, 50], rHand: [124, 50] })], props: ['floor', 'chair'] },
  squat: {
    poses: [
      mv(STAND, { lElbow: [112, 48], lHand: [124, 48], rElbow: [112, 50], rHand: [124, 50] }),
      { head: [106, 44], neck: [102, 54], hip: [86, 82], lElbow: [114, 58], lHand: [126, 58], rElbow: [114, 60], rHand: [126, 60], lKnee: [104, 87], lAnkle: [98, 107], lToe: [106, 109], rKnee: [108, 89], rAnkle: [102, 107], rToe: [110, 109] }
    ],
    props: ['floor']
  },
  squat_weight: {
    poses: [{ head: [106, 44], neck: [102, 54], hip: [86, 82], lElbow: [108, 66], lHand: [106, 58], rElbow: [110, 66], rHand: [108, 58], lKnee: [104, 87], lAnkle: [98, 107], lToe: [106, 109], rKnee: [108, 89], rAnkle: [102, 107], rToe: [110, 109] }],
    props: ['floor', 'weight']
  },
  wall_sit: {
    poses: [{ head: [75, 42], neck: [75, 53], hip: [75, 84], lElbow: [82, 68], lHand: [90, 80], rElbow: [84, 70], rHand: [92, 82], lKnee: [99, 83], lAnkle: [99, 107], lToe: [107, 109], rKnee: [101, 85], rAnkle: [101, 107], rToe: [109, 109] }],
    props: ['floor', 'wallLeft']
  },
  step_up: {
    poses: [
      shift(STAND, -12, 0),
      { head: [106, 16], neck: [106, 27], hip: [106, 58], lElbow: [102, 42], lHand: [100, 56], rElbow: [110, 42], rHand: [112, 56], lKnee: [100, 79], lAnkle: [94, 96], lToe: [100, 101], rKnee: [116, 74], rAnkle: [118, 91], rToe: [126, 93] }
    ],
    props: ['floor', 'step']
  },
  step_down: {
    poses: [{ head: [120, 18], neck: [120, 29], hip: [122, 58], lElbow: [112, 40], lHand: [100, 44], rElbow: [128, 40], rHand: [140, 44], lKnee: [112, 76], lAnkle: [104, 100], lToe: [112, 104], rKnee: [128, 76], rAnkle: [124, 91], rToe: [132, 93] }],
    props: ['floor', 'step']
  },
  lunge: {
    poses: [{ head: [100, 36], neck: [100, 47], hip: [100, 78], lElbow: [93, 62], lHand: [98, 74], rElbow: [107, 62], rHand: [103, 74], lKnee: [86, 104], lAnkle: [70, 104], lToe: [68, 110], rKnee: [122, 82], rAnkle: [122, 107], rToe: [130, 109] }],
    props: ['floor']
  },
  bridge: {
    poses: [
      { head: [40, 103], neck: [50, 104], hip: [88, 104], lElbow: [62, 108], lHand: [76, 108], rElbow: [62, 108], rHand: [76, 108], lKnee: [110, 84], lAnkle: [122, 107], lToe: [130, 109], rKnee: [112, 85], rAnkle: [124, 107], rToe: [132, 109] },
      { head: [40, 103], neck: [50, 103], hip: [90, 84], lElbow: [62, 108], lHand: [76, 108], rElbow: [62, 108], rHand: [76, 108], lKnee: [114, 76], lAnkle: [122, 107], lToe: [130, 109], rKnee: [116, 77], rAnkle: [124, 107], rToe: [132, 109] }
    ],
    props: ['floor', 'mat']
  },
  side_lying: {
    poses: [
      { head: [40, 95], neck: [50, 98], hip: [92, 100], lElbow: [56, 84], lHand: [44, 86], rElbow: [70, 94], rHand: [84, 94], lKnee: [120, 104], lAnkle: [148, 106], lToe: [152, 101], rKnee: [120, 99], rAnkle: [148, 100], rToe: [152, 95] },
      { head: [40, 95], neck: [50, 98], hip: [92, 100], lElbow: [56, 84], lHand: [44, 86], rElbow: [70, 94], rHand: [84, 94], lKnee: [120, 104], lAnkle: [148, 106], lToe: [152, 101], rKnee: [119, 88], rAnkle: [145, 76], rToe: [149, 71] }
    ],
    props: ['floor', 'mat']
  },
  prone_curl: {
    poses: [
      { head: [40, 98], neck: [50, 100], hip: [92, 102], lElbow: [44, 108], lHand: [32, 108], rElbow: [46, 108], rHand: [34, 108], lKnee: [120, 104], lAnkle: [148, 104], lToe: [152, 108], rKnee: [120, 103], rAnkle: [148, 102], rToe: [152, 106] },
      { head: [40, 98], neck: [50, 100], hip: [92, 102], lElbow: [44, 108], lHand: [32, 108], rElbow: [46, 108], rHand: [34, 108], lKnee: [120, 104], lAnkle: [148, 104], lToe: [152, 108], rKnee: [120, 103], rAnkle: [132, 76], rToe: [138, 72] }
    ],
    props: ['floor', 'mat', 'bandAnkle']
  },
  quadruped: {
    poses: [
      { head: [60, 63], neck: [70, 70], hip: [112, 72], lElbow: [70, 88], lHand: [70, 106], rElbow: [72, 88], rHand: [72, 106], lKnee: [114, 106], lAnkle: [140, 108], lToe: [144, 104], rKnee: [116, 104], rAnkle: [142, 106], rToe: [146, 102] },
      { head: [60, 63], neck: [70, 70], hip: [112, 72], lElbow: [70, 88], lHand: [70, 106], rElbow: [72, 88], rHand: [72, 106], lKnee: [114, 106], lAnkle: [140, 108], lToe: [144, 104], rKnee: [138, 68], rAnkle: [142, 44], rToe: [150, 42] }
    ],
    props: ['floor', 'mat']
  },
  side_plank: {
    poses: [{ head: [48, 76], neck: [57, 84], hip: [96, 94], lElbow: [56, 106], lHand: [70, 106], rElbow: [70, 88], rHand: [82, 92], lKnee: [124, 106], lAnkle: [140, 100], lToe: [144, 95], rKnee: [124, 104], rAnkle: [141, 98], rToe: [145, 93] }],
    props: ['floor', 'mat']
  },
  standing_abduction: {
    poses: [
      { ...STAND, lKnee: [96, 87], lAnkle: [94, 107], lToe: [88, 109], rKnee: [104, 87], rAnkle: [106, 107], rToe: [112, 109] },
      { ...STAND, lElbow: [88, 50], lHand: [78, 58], lKnee: [96, 87], lAnkle: [94, 107], lToe: [88, 109], rKnee: [112, 85], rAnkle: [124, 102], rToe: [130, 104] }
    ],
    props: ['floor', 'bandAnkle']
  },
  single_leg_stand: {
    poses: [{ ...STAND, lElbow: [88, 46], lHand: [76, 52], rElbow: [112, 46], rHand: [124, 52], lKnee: [92, 82], lAnkle: [94, 97], lToe: [100, 99], rKnee: [101, 87], rAnkle: [101, 107], rToe: [108, 109] }],
    props: ['floor', 'pad']
  },
  star_reach: {
    poses: [{ head: [106, 32], neck: [104, 43], hip: [100, 72], lElbow: [90, 52], lHand: [80, 56], rElbow: [114, 52], rHand: [124, 56], lKnee: [80, 88], lAnkle: [62, 104], lToe: [56, 108], rKnee: [108, 89], rAnkle: [102, 107], rToe: [110, 109] }],
    props: ['floor']
  },
  bike: {
    poses: [{ head: [124, 26], neck: [118, 35], hip: [96, 60], lElbow: [124, 46], lHand: [130, 54], rElbow: [125, 47], rHand: [131, 55], lKnee: [110, 74], lAnkle: [102, 96], lToe: [110, 98], rKnee: [118, 62], rAnkle: [112, 86], rToe: [120, 88] }],
    props: ['floor', 'bike']
  },
  jump: {
    poses: [
      mv(STAND, { lKnee: [104, 87], rKnee: [108, 87], hip: [98, 68] }),
      shift(mv(STAND, { lAnkle: [99, 103], lToe: [104, 110], rAnkle: [103, 103], rToe: [108, 110] }), 0, -12)
    ],
    props: ['floor', 'arrowUp']
  },
  jump_single: {
    poses: [shift({ ...STAND, lElbow: [88, 46], lHand: [80, 56], rElbow: [112, 46], rHand: [120, 56], lKnee: [92, 80], lAnkle: [92, 95], lToe: [98, 97], rAnkle: [103, 103], rToe: [109, 110] }, 0, -12)],
    props: ['floor', 'arrowUp']
  },
  ball: {
    poses: [{ head: [94, 26], neck: [96, 37], hip: [98, 68], lElbow: [86, 50], lHand: [78, 60], rElbow: [106, 50], rHand: [114, 58], lKnee: [96, 88], lAnkle: [94, 107], lToe: [101, 109], rKnee: [114, 82], rAnkle: [130, 96], rToe: [136, 94] }],
    props: ['floor', 'ball']
  }
};

function PropShape({ p }: { p: Prop }) {
  const s = { stroke: 'var(--text-faint)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (p) {
    case 'floor':
      return <line x1={20} y1={111} x2={180} y2={111} {...s} />;
    case 'chair':
      return <path d="M70 40 L72 78 L100 78 M74 78 L74 110 M98 78 L98 110" {...s} />;
    case 'wall':
      return <line x1={140} y1={14} x2={140} y2={111} {...s} strokeWidth={3} />;
    case 'wallLeft':
      return <line x1={66} y1={14} x2={66} y2={111} {...s} strokeWidth={3} />;
    case 'step':
      return <rect x={108} y={93} width={42} height={18} rx={2} {...s} />;
    case 'stepLow':
      return <rect x={96} y={95} width={30} height={16} rx={2} {...s} />;
    case 'band':
      return <path d="M126 104 Q150 102 168 106" {...s} stroke="var(--series-2)" />;
    case 'bandAnkle':
      return <path d="M100 104 Q115 98 126 100" {...s} stroke="var(--series-2)" />;
    case 'mat':
      return <rect x={28} y={109} width={136} height={3} rx={1.5} fill="var(--surface-3)" />;
    case 'weight':
      return <rect x={86} y={62} width={16} height={8} rx={2} fill="var(--text-faint)" />;
    case 'pad':
      return <rect x={92} y={107} width={22} height={4} rx={2} fill="var(--surface-3)" />;
    case 'ball':
      return <circle cx={144} cy={102} r={8} {...s} />;
    case 'cones':
      return (
        <g {...s}>
          <path d="M140 111 L145 99 L150 111 Z" />
          <path d="M160 111 L165 99 L170 111 Z" />
          <path d="M128 90 q14 -14 30 -4" strokeDasharray="3 3" />
        </g>
      );
    case 'bike':
      return (
        <g {...s}>
          <circle cx={74} cy={95} r={14} />
          <circle cx={142} cy={95} r={14} />
          <path d="M74 95 L96 62 L132 56 L142 95 M96 62 L108 92 L132 56 M90 60 L104 60 M128 50 L134 54" />
        </g>
      );
    case 'arrowUp':
      return <path d="M150 90 L150 60 M144 66 L150 60 L156 66" {...s} />;
    case 'hoop':
      return null;
  }
}

function Figure({ pose, ghost }: { pose: Pose; ghost?: boolean }) {
  const line = (pts: Pt[], color: string, w = 5) => (
    <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  );
  const body = 'var(--text-dim)';
  const affected = 'var(--accent)';
  return (
    <g opacity={ghost ? 0.25 : 1}>
      {line([pose.neck, pose.lElbow, pose.lHand], body, 4)}
      {line([pose.hip, pose.lKnee, pose.lAnkle, pose.lToe], body)}
      {line([pose.neck, pose.hip], body, 6)}
      {line([pose.hip, pose.rKnee, pose.rAnkle, pose.rToe], affected)}
      {line([pose.neck, pose.rElbow, pose.rHand], body, 4)}
      <circle cx={pose.head[0]} cy={pose.head[1]} r={8} fill={body} />
    </g>
  );
}

export function ExerciseIllustration({ illustration, title }: { illustration: string; title?: string }) {
  const ill = ILL[illustration] ?? ILL.standing;
  return (
    <svg viewBox="10 4 180 112" role="img" aria-label={title ? `Schematische Darstellung: ${title}` : 'Schematische Übungsdarstellung'}>
      {ill.props.map((p) => (
        <PropShape key={p} p={p} />
      ))}
      {ill.poses.map((p, i) => (
        <Figure key={i} pose={p} ghost={ill.poses.length > 1 && i < ill.poses.length - 1} />
      ))}
    </svg>
  );
}

export const ILLUSTRATION_KEYS = Object.keys(ILL);
