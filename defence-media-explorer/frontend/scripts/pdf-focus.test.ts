import assert from "node:assert/strict";
import test from "node:test";
import { passageFocus, type PdfGlyph } from "../src/lib/pdf-focus.ts";

function line(str: string, x: number, y: number, width: number, size = 8): PdfGlyph {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size };
}

test("frames the lines that contain the passage and marks only the matched words", () => {
  const items = [
    line("masthead della rivista", 40, 700, 200),
    line("rno come truffatori incompetenti e il parlamento Israeliano discute", 60, 400, 420),
    line("la legge di bilancio in aula", 60, 388, 280),
  ];
  const found = passageFocus(items, "parlamento Israeliano discute la legge", 612, 792);
  assert.ok(found);
  assert.ok(found.focus.y < 400);
  assert.ok(found.focus.y + found.focus.height > 408);
  assert.ok(found.focus.y + found.focus.height < 500);
  assert.ok(found.focus.width > 400);
  assert.ok(found.focus.width < 560);
  const mark = found.marks[0];
  assert.ok(mark.x > 120, "highlight starts at the matched words, not the line start");
  assert.ok(mark.x + mark.width <= 60 + 420 + 1);
  assert.equal(found.marks.length, 2);
});

test("a query frames the matching line instead of the start of the chunk", () => {
  const items = [
    line("L'ECONOMIA D'ORO ISRAELIANA in apertura del pezzo", 60, 640, 460),
    line("rno come truffatori e il parlamento Israeliano discute", 60, 400, 420),
    line("la seduta prosegue senza altri interventi", 60, 388, 300),
  ];
  const transcript = "L'ECONOMIA D'ORO ISRAELIANA in apertura del pezzo. rno come truffatori e il parlamento Israeliano discute";
  const found = passageFocus(items, transcript, 612, 792, "parlamento Israeliano");
  assert.ok(found);
  assert.ok(found.focus.y + found.focus.height < 560);
  assert.ok(found.marks[0].x > 120);
  assert.ok(found.marks.length >= 1);
});

test("returns nothing when the passage is not on the page", () => {
  const items = [line("harbour patrol note", 40, 100, 180, 12)];
  assert.equal(passageFocus(items, "parlamento Israeliano", 612, 792), null);
  assert.equal(passageFocus(items, "breve", 612, 792), null);
});
