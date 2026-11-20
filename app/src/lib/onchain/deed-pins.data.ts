/**
 * The deeds the repository recorded: height → canonical inscription id.
 *
 * Source: packages/bitmap-resolver/test/vectors/heights/*.json, each vector's
 * `expected.canonicalId` (rule `liveoci-alpha@0c18b83c+bg1`, recorded through
 * ord on 2026-10-15). __tests__/lib/deed-pins.test.ts holds this table equal to
 * those files.
 *
 * The deed for these heights rests on the recorded resolver answers of
 * 2026-10-15; the holder is always asked live from two sources.
 */

export const DEED_PINS_RULE_ID = 'liveoci-alpha@0c18b83c+bg1';
export const DEED_PINS_RECORDED_AT = '2026-10-15T23:41:48.686Z';

export const DEED_PINS: Readonly<Record<number, string>> = Object.freeze({
  0: '86539aff946c437af8088955827b7e6ff48fc6192836d4071b697b5359b7a732i0',
  208: 'bac3a61c49f9f4c7c914f6e2d3c5f57d1c5e27c4e8df16e574ff8c736728bf8di0',
  95238: '214d0dd9b55162b584b664afdccb03c099426cd382fac091abbe135e108485b9i0',
  275798: 'd98e14628284e7ca993ba15dec8492f952d63b4dbc1aaeffc527b1be2b097dd2i0',
  433445: 'e16820142ec10fa1e61fbbcba6037a52fbe01704bfd7a19ab6a188f9a15b0fa1i0',
  528999: '820d0fa16b32e9e0506f06db59a31a435c45f331ef480772a57134be5beb2e58i0',
  563851: 'e7dec6deaf7bf579f8f0cf8788437674846d9b099561ba73a34e93a70b4f11b1i0',
  612888: 'daf63d78f6e4cbf8cc5d0b375978c9c707849b5ee0dac909813cef7db66da2d9i0',
  614347: '6b91079d99a80312e8cbae1effb5ac15d610d4d28d81580ee8cee18b3d18f3d9i0',
  640860: 'a1bdd3f2722668816e482c48f2f8c9cdc35c5ecaaa4e5c8f9fcf83a16a0d69c5i0',
  718222: '64798e516f347e983ff22e03c5289d8696f5dd206c365a220a8056976e1f90d8i0',
  718840: 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0',
  720143: '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0',
  738505: 'd5ba7c3282c250c0e8833483eced097660d4a9e940e770563968597e2df37605i0',
  745506: '6168ba458d997ec874135f6c1a5a70ae5e14844f745f7ab1b29377f2b47469d3i0',
  745966: '80ae7d3e42c4e57f96bbddb66794544736013fea9fed177ac104aaea378901d7i0',
  840000: '05f8584cf4dbe34ef677f8f316fcac9e6e4ccb0e298d53fd21edaac7787660eei0',
  935550: '2c3ed0f170276e4bb9897f2dececc2383bed5369ef58949cbeb07794aae9453di0',
});
