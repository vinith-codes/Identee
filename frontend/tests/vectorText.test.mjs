// The vector print file's sums (studio/vectorText.js): Google's font list, which file has a letter, letter outlines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { barToSvg, faceFor, fakeBoldWidth, hexToRgb, multiply, outlineToSvg, parseFontFaces, useOwnFiles } from "../src/studio/vectorText.js";

const CSS = `
/* latin-ext */
@font-face { font-family: 'Oswald'; font-style: normal; font-weight: 400; src: url(https://f.test/oswald-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+1E00-1E9F; }
/* latin */
@font-face { font-family: 'Oswald'; font-style: normal; font-weight: 400; src: url(https://f.test/oswald.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2122; }
@font-face { font-family: 'Oswald'; font-style: normal; font-weight: 700; src: url(https://f.test/oswald.woff2) format('woff2'); unicode-range: U+0000-00FF, U+2122; }
@font-face { font-family: 'Anton'; font-style: normal; font-weight: 400; src: url(https://f.test/anton.woff2) format('woff2'); unicode-range: U+0000-00FF; }
`;
const faces = parseFontFaces(CSS);

test("Google's font list is read: family, weight, file, alphabet", () => {
  assert.equal(faces.length, 4);
  assert.deepEqual(faces[1], { family: "Oswald", weight: 400, style: "normal", url: "https://f.test/oswald.woff2", ranges: [[0, 0xff], [0x2122, 0x2122]] });
});

test("the right file is found for a letter", () => {
  assert.equal(faceFor(faces, "Oswald", false, 65).url, "https://f.test/oswald.woff2");
  assert.equal(faceFor(faces, "Oswald", false, 0x101).url, "https://f.test/oswald-ext.woff2");
});

test("a bold of its own is used; a font without one is thickened", () => {
  assert.deepEqual(faceFor(faces, "Oswald", true, 65), { url: "https://f.test/oswald.woff2", weight: 700, fakeBold: false });
  assert.deepEqual(faceFor(faces, "Anton", true, 65), { url: "https://f.test/anton.woff2", weight: 400, fakeBold: true });
  assert.deepEqual(faceFor(faces, "Anton", false, 65), { url: "https://f.test/anton.woff2", weight: 400, fakeBold: false });
});

test("a letter the font doesn't have (Tamil) or an unknown font finds no file", () => {
  assert.equal(faceFor(faces, "Anton", false, 0x0b85), null);
  assert.equal(faceFor(faces, "Arial", false, 65), null);
});

test("our own copy replaces the English file by weight; its other alphabets drop out", () => {
  const swapped = useOwnFiles(faces, { Oswald: { 400: "/o400.woff2", 700: "/o700.woff2" } });
  assert.equal(faceFor(swapped, "Oswald", false, 65).url, "/o400.woff2");
  assert.equal(faceFor(swapped, "Oswald", true, 65).url, "/o700.woff2");
  assert.equal(faceFor(swapped, "Oswald", false, 0x101), null);
  assert.equal(faceFor(swapped, "Anton", false, 65).url, "https://f.test/anton.woff2");
});

test("thickening follows the browser's share", () => {
  assert.equal(fakeBoldWidth(320), 10);
  assert.equal(fakeBoldWidth(9), 9 / 24);
});

test("transforms join in the canvas order", () => {
  const move = [1, 0, 0, 1, 10, 20];
  const double = [2, 0, 0, 2, 0, 0];
  assert.deepEqual(multiply(move, double), [2, 0, 0, 2, 10, 20]); // doubled first, then moved
  assert.deepEqual(multiply(double, move), [2, 0, 0, 2, 20, 40]);
});

test("an outline becomes path data, moved by the transform", () => {
  const commands = [
    { command: "moveTo", args: [0, 0] },
    { command: "lineTo", args: [1, 0] },
    { command: "quadraticCurveTo", args: [1, 1, 0, 1] },
    { command: "bezierCurveTo", args: [0, 2, 1, 2, 1.5, 1] },
    { command: "closePath", args: [] },
  ];
  assert.equal(outlineToSvg(commands, [2, 0, 0, -2, 10, 100]), "M10 100L12 100Q12 98 10 98C10 96 12 96 13 98Z");
});

test("an underline is a bar of the right thickness", () => {
  assert.equal(barToSvg(0, 10, 5, 2, [1, 0, 0, 1, 0, 0]), "M0 4L10 4L10 6L0 6Z");
});

test("colours: hex only, a see-through colour is refused", () => {
  assert.deepEqual(hexToRgb("#fff"), { r: 1, g: 1, b: 1 });
  assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
  assert.equal(hexToRgb("rgba(0,0,0,.5)"), null);
});
