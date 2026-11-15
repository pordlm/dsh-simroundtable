# t33 evidence index (repair-round-2, attempt f323a656-2f03-415d-83a0-a093a1ec849a)

- `t33-test.log` — full `npm test` output: 164 tests, 164 pass, 0 fail, 0 skipped, ~4.5s. Run with current (guarded) `lib/client.js`.
- `t33-check.log` — full `npm run check` output: node --check passed for all 24 files under lib/.
- `t33-c2-excerpt.md` — C2 test source excerpt with line numbers, `test/client.test.mjs:1812` onward (~95 lines). Deferred pattern: `const gate = armedPost; await gate.promise;` captured per call site as `aPost2/bPost2`, `aPost3/bPost3` so A's and B's POSTs get independent gates (a shared `armedPost` reference would cross-resolve and leave a pending promise).
- `t33-c2-guard-removed-red.log` — guard-removal self-proof: `lib/client.js` savePersona's 4 `stillValid` guards — success path after POST (line 826), after `loadPersonas()` (829), catch (832), finally busy-clear (835) — temporarily replaced with `false && ...` / `true || ...` → `node test/client.test.mjs` exit 1, `not ok 4 - C2` with `failureType: 'testCodeFailure'`, first assertion failure "A's late failure does not write B's error". Guards restored afterward; final `npm test` re-run 164/164 pass (see t33-test.log tail).
- `t33-stillvalid-lines.txt` — every `stillValid` call site in lib/client.js with line numbers. savePersona starts at line 807; its guards are 826, 829, 832, 835 (an earlier draft of this index wrongly cited 740/762/773/788 — those belong to preceding load actions, not savePersona; the removed-and-restored conditions were exactly the four at 826/829/832/835).

Final state after restoration: `npm test` → 1..164, pass 164, fail 0, skipped 0.
