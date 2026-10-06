export type EyeShape = 'normal' | 'happyArc' | 'heart' | 'star' | 'spiral' | 'x' | 'line'

export type EyeParams = {
  openness: number // 0 closed .. 1 wide open (upper lid)
  squint: number // 0 .. 1 lower lid pushed up
  pupilX: number // -1 .. 1, screen right is +
  pupilY: number // -1 .. 1, up is +
  pupilScale: number
  shape: EyeShape
  browAngle: number // + = angry (inner end down), - = worried (inner end up)
  browHeight: number // -1 .. 1
}

export type ExpressionName =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'surprised'
  | 'sleepy'
  | 'suspicious'
  | 'love'
  | 'dizzy'
  | 'proud'
  | 'shy'
  | 'thinking'
  | 'wink'
  | 'focused'
  | 'angry'
  | 'sad'
  | 'yawn'
  | 'asleep'

export type Expression = {
  L: EyeParams
  R: EyeParams
  blush: number
  // How much the pupils follow the cursor (0 = fixed gaze, e.g. thinking looks up).
  gazeFollow: number
  cassette: { scale: number; squash: number; bounce: number; bounceSpeed: number }
  head: { pitch: number; roll: number }
}

const eye = (p: Partial<EyeParams> = {}): EyeParams => ({
  openness: 1,
  squint: 0,
  pupilX: 0,
  pupilY: 0,
  pupilScale: 1,
  shape: 'normal',
  browAngle: 0,
  browHeight: 0,
  ...p,
})

type Def = {
  both?: Partial<EyeParams>
  L?: Partial<EyeParams>
  R?: Partial<EyeParams>
  blush?: number
  gazeFollow?: number
  cassette?: Partial<Expression['cassette']>
  head?: Partial<Expression['head']>
}

const def = (d: Def): Expression => ({
  L: eye({ ...d.both, ...d.L }),
  R: eye({ ...d.both, ...d.R }),
  blush: d.blush ?? 0,
  gazeFollow: d.gazeFollow ?? 1,
  cassette: { scale: 1, squash: 1, bounce: 0, bounceSpeed: 6, ...d.cassette },
  head: { pitch: 0, roll: 0, ...d.head },
})

export const EXPRESSIONS: Record<ExpressionName, Expression> = {
  neutral: def({}),
  happy: def({
    both: { shape: 'happyArc', browAngle: -0.15, browHeight: 0.35 },
    cassette: { bounce: 0.004, bounceSpeed: 9 },
    head: { roll: 0.05 },
  }),
  excited: def({
    both: { shape: 'star', openness: 1, pupilScale: 1.15, browAngle: -0.2, browHeight: 0.7 },
    cassette: { scale: 1.3, bounce: 0.006, bounceSpeed: 16 },
    head: { pitch: -0.06 },
  }),
  surprised: def({
    both: { openness: 1, pupilScale: 0.5, browAngle: -0.1, browHeight: 1 },
    cassette: { scale: 1.4, squash: 1.15 },
    head: { pitch: -0.05 },
  }),
  sleepy: def({
    both: { openness: 0.45, squint: 0.15, pupilY: -0.6, pupilScale: 0.95, browAngle: -0.25, browHeight: -0.3 },
    gazeFollow: 0.2,
    cassette: { squash: 0.35 },
    head: { pitch: 0.1, roll: -0.06 },
  }),
  suspicious: def({
    L: { openness: 0.55, squint: 0.3, pupilX: 0.7, pupilY: -0.15, browAngle: 0.4, browHeight: -0.35 },
    R: { openness: 0.72, squint: 0.2, pupilX: 0.7, browAngle: -0.15, browHeight: 0.45 },
    gazeFollow: 0.3,
    cassette: { squash: 0.6 },
    head: { roll: -0.05 },
  }),
  love: def({
    both: { shape: 'heart', openness: 1, pupilScale: 1.25, browAngle: -0.3, browHeight: 0.45 },
    blush: 0.7,
    cassette: { scale: 1.15, bounce: 0.003, bounceSpeed: 5 },
    head: { roll: 0.08 },
  }),
  dizzy: def({
    both: { shape: 'spiral', openness: 1, pupilScale: 1.1 },
    L: { browAngle: 0.25, browHeight: -0.1 },
    R: { browAngle: -0.35, browHeight: 0.4 },
    gazeFollow: 0,
    cassette: { scale: 0.9, bounce: 0.004, bounceSpeed: 3 },
    head: { roll: 0.1 },
  }),
  proud: def({
    both: { openness: 0.5, squint: 0.45, pupilY: 0.15, browAngle: 0.08, browHeight: 0.3 },
    gazeFollow: 0.4,
    cassette: { scale: 1.1 },
    head: { pitch: -0.1 },
  }),
  shy: def({
    both: { openness: 0.7, pupilX: -0.55, pupilY: -0.55, pupilScale: 0.9, browAngle: -0.35, browHeight: 0.15 },
    blush: 1,
    gazeFollow: 0.1,
    cassette: { scale: 0.85, squash: 0.85 },
    head: { pitch: 0.1, roll: -0.08 },
  }),
  thinking: def({
    both: { openness: 0.8, pupilX: 0.55, pupilY: 0.7, pupilScale: 0.9 },
    L: { browAngle: -0.1, browHeight: 0.55 },
    R: { browAngle: 0.25, browHeight: -0.15 },
    gazeFollow: 0.15,
    cassette: { squash: 0.8 },
    head: { roll: 0.09, pitch: -0.04 },
  }),
  wink: def({
    L: { shape: 'happyArc', browAngle: 0.15, browHeight: -0.15 },
    R: { openness: 1, browAngle: -0.1, browHeight: 0.4 },
    cassette: { bounce: 0.003, bounceSpeed: 8 },
    head: { roll: 0.08 },
  }),
  focused: def({
    both: { openness: 0.6, squint: 0.3, pupilScale: 0.85, browAngle: 0.3, browHeight: -0.25 },
    cassette: { squash: 0.75 },
    head: { pitch: 0.04 },
  }),
  angry: def({
    both: { openness: 0.75, squint: 0.2, pupilScale: 0.75, browAngle: 0.65, browHeight: -0.4 },
    cassette: { scale: 0.9, squash: 0.7, bounce: 0.002, bounceSpeed: 24 },
    head: { pitch: 0.06 },
  }),
  sad: def({
    both: { openness: 0.75, pupilY: -0.3, pupilScale: 1.15, browAngle: -0.55, browHeight: 0.2 },
    gazeFollow: 0.4,
    cassette: { squash: 0.8 },
    head: { pitch: 0.12 },
  }),
  yawn: def({
    both: { openness: 0.12, squint: 0.5, browAngle: -0.35, browHeight: 0.9 },
    gazeFollow: 0,
    cassette: { scale: 1.2, squash: 1.4 },
    head: { pitch: -0.16 },
  }),
  asleep: def({
    both: { shape: 'line', browAngle: -0.15, browHeight: -0.4 },
    gazeFollow: 0,
    cassette: { squash: 0.2 },
    head: { pitch: 0.18, roll: -0.08 },
  }),
}

export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS) as ExpressionName[]
