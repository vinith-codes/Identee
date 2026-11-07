// The spelling check on made pieces (services/wordCheck.js, round 4, 8 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { expectedWords, missingWords, normWord } from "../services/wordCheck.js";

test("expected words: quoted words and CAPITALS, no lone letters, no repeats", () => {
  assert.deepEqual(expectedWords('AVENGERS in bold red comic lettering with "Earth\'s Mightiest" under it'), ["Earth's Mightiest", "AVENGERS"]);
  assert.deepEqual(expectedWords("a small left-chest badge with the cafe name “Brew & Co” and CLASS OF 2026 on the back"), ["Brew & Co", "CLASS OF 2026"]);
  assert.deepEqual(expectedWords("A lion with a cricket bat, no words"), []);
  assert.deepEqual(expectedWords(null), []);
});

test("missing words: compared by letters only, a phrase may be read as separate words", () => {
  assert.deepEqual(missingWords(["AVENGERS", "VINITH"], ["AVENGERS", "Vinith"]), []);
  assert.deepEqual(missingWords(["AVENGERS"], ["AVENGRES"]), ["AVENGERS"]);
  assert.deepEqual(missingWords(["Brew & Co"], ["BREW", "&", "CO."]), []);
  assert.deepEqual(missingWords(["CLASS OF 2026"], ["Class", "of", "2026"]), []);
  assert.deepEqual(missingWords(["CLASS OF 2026"], ["Class", "of", "2062"]), ["CLASS OF 2026"]);
  assert.deepEqual(missingWords(["AVENGERS"], []), ["AVENGERS"]);
  assert.equal(normWord("Brew & Co."), "BREWCO");
});
