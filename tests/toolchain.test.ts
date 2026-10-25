// Guards the assumption every time-based test makes: `npm test` runs with TZ=UTC.
describe('toolchain', () => {
  it('runs tests in UTC', () => {
    const UTC_OFFSET_MINUTES = 0;

    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(UTC_OFFSET_MINUTES);
    expect(new Date('2026-07-15T12:00:00Z').getTimezoneOffset()).toBe(UTC_OFFSET_MINUTES);
  });
});
