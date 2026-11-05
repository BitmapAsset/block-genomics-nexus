# Vendored: ordpool-parser `src/bitmap/mondrian-layout.ts`

`mondrian-layout.ts` in this folder is copied unchanged (apart from a four-line
provenance header) from
[ordpool-space/ordpool-parser](https://github.com/ordpool-space/ordpool-parser)
at commit `f987829fd58d4868f3870d54d19a958a867c66a7`.

It is the conformance oracle for the Bitmap layout: the tests hold our runtime
packer (`lib/square-packing.ts`) equal to it, slot for slot. Nothing in
production imports it.

## Upstream attribution (from ordpool-parser `src/bitmap/NOTICE.md`)

`mondrian-layout.ts` is a TypeScript port of:

- [`bitlodo/bitmap-utils`](https://github.com/bitlodo/bitmap-utils) — MIT, Copyright © 2024 bitlodo.
  Source: [`utils/MondrianLayout.js`](https://github.com/bitlodo/bitmap-utils/blob/main/utils/MondrianLayout.js).

bitlodo's file in turn credits:

- [Bitfeed](https://github.com/bitfeed-project/bitfeed) by mononaut — MIT.
  Source: [`client/src/models/TxMondrianPoolScene.js`](https://github.com/bitfeed-project/bitfeed/blob/master/client/src/models/TxMondrianPoolScene.js).

## Licence (ordpool-parser)

MIT License

Copyright (c) 2024-2026 Ordpool by HAUS HOPPE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
