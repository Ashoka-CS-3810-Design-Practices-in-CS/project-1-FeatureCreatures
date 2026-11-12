import { CATEGORY_PALETTE, DEFAULT_CATEGORIES, RESERVED_COLOURS } from './constants';
import { colourDistance, contrastRatio } from './colours';
import { parseCategoryInput } from './schemas';

describe('T49: category colours and shared validation (D-11)', () => {
  it('offers twelve distinct usable swatches including every seeded category', () => {
    expect(CATEGORY_PALETTE).toHaveLength(12);
    expect(new Set(CATEGORY_PALETTE).size).toBe(12);
    expect(DEFAULT_CATEGORIES.every((category) => CATEGORY_PALETTE.includes(category.colour))).toBe(
      true,
    );
    CATEGORY_PALETTE.forEach((colour, index) => {
      expect(parseCategoryInput({ name: `Colour ${index}`, colour }, []), colour).toMatchObject({
        ok: true,
      });
      const others = CATEGORY_PALETTE.filter((candidate) => candidate !== colour).map(
        (candidate) => ({ id: candidate, name: candidate, colour: candidate, createdAt: 0 }),
      );
      expect(parseCategoryInput({ name: 'New', colour }, others), colour).toMatchObject({
        ok: true,
      });
    });
  });

  it.each(RESERVED_COLOURS)('rejects the reserved colour %s', (colour) => {
    expect(parseCategoryInput({ name: 'Reserved', colour }, [])).toMatchObject({
      ok: false,
      error: { code: 'InvalidInput', issues: [{ path: 'colour' }] },
    });
  });

  it.each(['#ffffff', '#000000', '#gggggg', '#123', 'blue'])(
    'rejects insufficient contrast or malformed %s',
    (colour) => {
      expect(parseCategoryInput({ name: 'Bad colour', colour }, [])).toMatchObject({
        ok: false,
        error: { code: 'InvalidInput', issues: [{ path: 'colour' }] },
      });
    },
  );

  it('rejects empty and overlong names through the shared schema', () => {
    ['', ' '.repeat(2), 'x'.repeat(41)].forEach((name) => {
      expect(parseCategoryInput({ name, colour: '#577d35' }, [])).toMatchObject({
        ok: false,
        error: { code: 'InvalidInput', issues: [{ path: 'name' }] },
      });
    });
  });

  it('computes known contrast ratios and symmetric perceptual distances', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#577d35', '#577d35')).toBe(1);
    expect(colourDistance('#577d35', '#577d35')).toBe(0);
    expect(colourDistance('#577d35', '#7e6ac0')).toBeCloseTo(colourDistance('#7e6ac0', '#577d35'));
    expect(colourDistance('#000000', '#ffffff')).toBeCloseTo(1);
  });
});
