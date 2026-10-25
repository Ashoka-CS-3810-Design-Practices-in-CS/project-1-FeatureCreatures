// Guards the assumption the DST tests make: `npm run test:dst` runs in America/New_York.
describe('DST toolchain', () => {
  it('runs tests in America/New_York', () => {
    const EST_OFFSET_MINUTES = 300;
    const EDT_OFFSET_MINUTES = 240;

    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(EST_OFFSET_MINUTES);
    expect(new Date('2026-07-15T12:00:00Z').getTimezoneOffset()).toBe(EDT_OFFSET_MINUTES);
  });
});
