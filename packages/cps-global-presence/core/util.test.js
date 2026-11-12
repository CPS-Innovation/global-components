var h = require("../test-harness");

var CCPUtil = h.load(["core/util.js"], ["CCPUtil"]).CCPUtil;

h.describe("CCPUtil");

h.test("indexOf finds by identity", function () {
  h.assertEqual(CCPUtil.indexOf(["a", "b"], "b"), 1);
  h.assertEqual(CCPUtil.indexOf(["a"], "c"), -1);
  h.assertEqual(CCPUtil.indexOf([], "a"), -1);
});

h.test("find returns the first match on a property", function () {
  var list = [{ kind: "CASE", n: 1 }, { kind: "DEFENDANT", n: 2 }, { kind: "CASE", n: 3 }];
  h.assertEqual(CCPUtil.find(list, "kind", "CASE").n, 1);
  h.assertEqual(CCPUtil.find(list, "kind", "X"), null);
});

h.test("hasSuffix", function () {
  h.assertTrue(CCPUtil.hasSuffix("CASE_CIN3", "_CIN3"));
  h.assertTrue(!CCPUtil.hasSuffix("CIN3", "_CIN3"));
  h.assertTrue(CCPUtil.hasSuffix("x", ""));
});

h.test("pad", function () {
  h.assertEqual(CCPUtil.pad(7, 3), "007");
  h.assertEqual(CCPUtil.pad(1234, 2), "1234");
});

h.test("stamp is ISO-8601 UTC with milliseconds", function () {
  h.assertEqual(CCPUtil.stamp(new Date(Date.UTC(2026, 10, 4, 9, 3, 7, 45))), "2026-11-04T09:03:07.045Z");
});
