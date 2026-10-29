import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator } from "next-intl";
import ru from "../messages/ru.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { catalog } from "../entities/planet/catalog.ts";
import { getPlanetPosition } from "../entities/planet/position.ts";

function keys(value, prefix = "") {
  return Object.entries(value)
    .flatMap(([key, entry]) =>
      typeof entry === "string"
        ? [`${prefix}${key}`]
        : keys(entry, `${prefix}${key}.`),
    )
    .sort();
}

test("RU and EN catalogs contain the same complete translation keys", () => {
  assert.deepEqual(keys(ru), keys(en));
  for (const messages of [ru, en])
    for (const id of catalog.map((planet) => planet.id)) {
      const story = messages.planets[id];
      assert.ok(story.name && story.introduction && story.discovery);
      assert.equal(Object.keys(story.chapters).length, 3);
      for (const chapter of Object.values(story.chapters))
        assert.ok(chapter.title && chapter.text);
    }
});

test("ICU messages render without missing keys and respect Russian plural forms", () => {
  for (const [locale, messages] of [
    ["ru", ru],
    ["en", en],
  ]) {
    const t = createTranslator({
      locale,
      messages,
      onError(error) {
        throw error;
      },
    });
    for (const key of keys(messages))
      if (key !== "ui.modelStatus") assert.ok(t(key));
    for (const count of [0, 1, 2, 4, 5, 8])
      assert.ok(t("ui.modelStatus", { count }).includes(String(count)));
  }
  const t = createTranslator({ locale: "ru", messages: ru });
  assert.match(t("ui.modelStatus", { count: 1 }), /1 планета/);
  assert.match(t("ui.modelStatus", { count: 2 }), /2 планеты/);
  assert.match(t("ui.modelStatus", { count: 5 }), /5 планет/);
});

test("all eight planets have numeric, sourced, comparable characteristics", () => {
  assert.equal(catalog.length, 8);
  assert.equal(new Set(catalog.map((planet) => planet.id)).size, 8);
  for (const planet of catalog) {
    for (const key of [
      "diameterKm",
      "massKg",
      "distanceMillionKm",
      "orbitDays",
      "axialTilt",
    ])
      assert.ok(
        Number.isFinite(planet[key]) && planet[key] > 0,
        `${planet.id}.${key}`,
      );
    assert.ok(
      Number.isFinite(planet.rotationHours) && planet.rotationHours !== 0,
    );
    assert.match(planet.source, /^https:\/\/science\.nasa\.gov\//);
    assert.equal(
      "story" in planet,
      false,
      "translations must remain outside the data catalog",
    );
  }
  assert.deepEqual(
    catalog
      .filter((planet) => planet.rotationHours < 0)
      .map((planet) => planet.id),
    ["venus", "uranus"],
  );
});

test("date-driven positions are finite, heliocentric and change over time", () => {
  const date = new Date("2026-10-29T12:00:00Z");
  for (const planet of catalog) {
    const position = getPlanetPosition(planet.id, date);
    assert.ok(position.distanceAu > 0 && position.distanceAu < 32);
    assert.ok(position.longitude >= 0 && position.longitude < 360);
    assert.ok(Math.abs(position.latitude) < 10);
    assert.equal(position.timestamp, date.toISOString());
    assert.equal(position.id, planet.id);
  }
  const earth = getPlanetPosition("earth", date);
  assert.ok(earth.distanceAu > 0.97 && earth.distanceAu < 1.02);
  const mercury = getPlanetPosition("mercury", date);
  const later = getPlanetPosition("mercury", new Date("2026-11-29T12:00:00Z"));
  assert.ok(Math.abs(mercury.longitude - later.longitude) > 1);
});
