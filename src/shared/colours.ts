import {
  COLOUR_CHANNEL_DIGITS,
  COLOUR_CHANNEL_MAX,
  COLOUR_CHANNEL_OFFSETS,
  COLOUR_HEX_RADIX,
  CONTRAST_LUMINANCE_OFFSET,
  LUMINANCE_WEIGHTS,
  OKLAB_LMS_MATRIX,
  OKLAB_MATRIX,
  SRGB_GAMMA,
  SRGB_GAMMA_OFFSET,
  SRGB_LINEAR_SLOPE,
  SRGB_LINEAR_THRESHOLD,
} from './constants';

// PRE:  hex is a six-digit hex colour
// POST: returns its three linear sRGB channels
function linearChannels(hex: string): number[] {
  return COLOUR_CHANNEL_OFFSETS.map((offset) => {
    const channel =
      parseInt(hex.slice(offset, offset + COLOUR_CHANNEL_DIGITS), COLOUR_HEX_RADIX) /
      COLOUR_CHANNEL_MAX;
    return channel <= SRGB_LINEAR_THRESHOLD
      ? channel / SRGB_LINEAR_SLOPE
      : ((channel + SRGB_GAMMA_OFFSET) / (1 + SRGB_GAMMA_OFFSET)) ** SRGB_GAMMA;
  });
}

// PRE:  weights and channels each contain three coordinates
// POST: returns their dot product
function dot(weights: readonly number[], channels: readonly number[]): number {
  return weights.reduce((total, weight, index) => total + weight * (channels[index] ?? 0), 0);
}

// PRE:  first and second are six-digit hex colours
// POST: returns their WCAG contrast ratio in [1, 21]
export function contrastRatio(first: string, second: string): number {
  const firstLuminance = dot(LUMINANCE_WEIGHTS, linearChannels(first));
  const secondLuminance = dot(LUMINANCE_WEIGHTS, linearChannels(second));
  return (
    (Math.max(firstLuminance, secondLuminance) + CONTRAST_LUMINANCE_OFFSET) /
    (Math.min(firstLuminance, secondLuminance) + CONTRAST_LUMINANCE_OFFSET)
  );
}

// PRE:  hex is a six-digit hex colour
// POST: returns its OKLab coordinates
function toOklab(hex: string): number[] {
  const channels = linearChannels(hex);
  const roots = OKLAB_LMS_MATRIX.map((weights) => Math.cbrt(dot(weights, channels)));
  return OKLAB_MATRIX.map((weights) => dot(weights, roots));
}

// PRE:  first and second are six-digit hex colours
// POST: returns their Euclidean distance in OKLab
export function colourDistance(first: string, second: string): number {
  const firstLab = toOklab(first);
  const secondLab = toOklab(second);
  return Math.hypot(...firstLab.map((coordinate, index) => coordinate - (secondLab[index] ?? 0)));
}
