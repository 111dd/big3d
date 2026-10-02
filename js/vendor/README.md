# Vendored libraries

Self-hosted so the home page needs no third-party script host. Files are copied unchanged from npm (only the lenis source-map comment was removed).

| File | Package | License |
| --- | --- | --- |
| gsap-3.15.0.min.js | gsap@3.15.0 `dist/gsap.min.js` | GSAP Standard "no charge" license, https://gsap.com/standard-license |
| ScrollTrigger-3.15.0.min.js | gsap@3.15.0 `dist/ScrollTrigger.min.js` | same as above |
| lenis-1.3.26.min.js | lenis@1.3.26 `dist/lenis.min.js` | MIT, see LICENSE-lenis |

The version is in the file name because `/js/*` is served with a one-year immutable cache.
