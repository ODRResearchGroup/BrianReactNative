# npm dependency audit

Last reviewed: 1 October 2026 (issue #42). Re-check with `npm audit` after
changing dependencies.

## Fixed

### `fast-xml-parser` (moderate, GHSA-gh4j-gqv2-49f6)

`XMLBuilder` did not escape comment and CDATA delimiters. This affected
versions below 5.7.0. The package came in through
`@react-native-community/cli-config-android` and `cli-platform-apple` (CLI
18.x), which pin `^4.4.1`, and no 4.x release has the fix. This one
advisory was behind 7 of the 8 audit warnings, because every
`@react-native-community/cli*` package that depends on it was flagged as well.

Fixed with an `overrides` entry in `package.json`
(`"fast-xml-parser": "^5.7.0"`). The CLI only uses `XMLParser` and
`XMLValidator`, and both have the same API in 5.x. With the override in place,
`npx react-native config` (the autolinking input that Gradle reads) gives
output identical to before, `mainActivity` is still read from
`AndroidManifest.xml`, and the iOS `.xcworkspace` and `.xcscheme` files parse
to the same values.

Remove the override once the React Native CLI is upgraded to a version that
depends on `fast-xml-parser` 5.x itself (CLI 20+).

## Not fixed

### `image-size` 1.2.1 (high, GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr)

Specially crafted JXL, HEIF or ICNS images can make the parser loop forever,
a denial of service. Versions up to 2.0.2 are affected.

- Path: `@react-native/metro-config` → `metro-config` → `metro` →
  `image-size@^1.0.2`.
- 1.2.1 is the last 1.x release; the fix is only in 2.0.3+.
- Metro 0.82 to 0.86 all require `^1.0.2`. Metro 0.87 no longer depends
  on `image-size`, but React Native 0.79 pins Metro 0.82, so getting 0.87
  means upgrading React Native.
- An override to 2.x breaks Metro: `metro/src/Assets.js` calls
  `require('image-size')(...)` as a function, but in 2.x the CommonJS export is
  an object, so asset bundling throws.
- `npm audit` says this can be fixed with `npm audit fix`, but running that
  changes nothing, because Metro's `^1.0.2` range rules out 2.x.

**Risk:** low. `image-size` only runs inside Metro at build time, on the
project's own image assets. It is not part of the APK or IPA, so an attacker
would need to commit a malicious image to the repository.

**Plan:** this should be fixed by upgrading React Native to a version that uses
Metro 0.87 or later. That upgrade is a separate piece of work: it needs
Android and iOS builds and on-device testing, so it should not be combined
with walk-critical changes.
