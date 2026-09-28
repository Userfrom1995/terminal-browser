import path from "node:path";

import { LOGS_DIR } from "pixel-store";
import { z } from "zod";

import type { SettingGroup } from "../ui/types";
import { AUTO, DISPLAY_FPS, UNCAPPED, UNLIMITED } from "./render";
import { SEARCH_ENGINES, SUGGESTIONS_OFF } from "./search";

export interface SettingChoice {
  value: string;
  name: string;
  logo: string | null;
}

interface SettingDef<S extends z.ZodType> {
  group: SettingGroup;
  label: string;
  hint?: string;
  link?: string;
  schema: S;
  default: z.infer<S>;
  choices?: SettingChoice[];
}

function setting<S extends z.ZodType>(def: SettingDef<S>): SettingDef<S> {
  return def;
}

const plain = (value: string, name = value): SettingChoice => ({ value, name, logo: null });

const onOff = [plain("on", "on"), plain("off", "off")];

const NEXT_SESSION = "applies to windows opened after this one";

export const ENGINE_LOG_FILE = path.join(LOGS_DIR, "engine.jsonl");

export const SETTINGS = {
  "search.engine": setting({
    group: "general",
    label: "search engine",
    hint: "%s is replaced with search text",
    schema: z.string(),
    default: SEARCH_ENGINES[0].search,
    choices: SEARCH_ENGINES.map(({ search, name, logo }) => ({ value: search, name, logo })),
  }),
  "search.suggestions": setting({
    group: "general",
    label: "search suggestions",
    hint: "%s is replaced with search text",
    link: "https://github.com/dewitt/opensearch/blob/master/mediawiki/Specifications/OpenSearch/Extensions/Suggestions/1.1/Draft%201.wiki",
    schema: z.string(),
    default: SEARCH_ENGINES[0].suggest!,
    choices: [
      ...SEARCH_ENGINES.filter((engine) => engine.suggest).map(({ suggest, name, logo }) => ({
        value: suggest!,
        name,
        logo,
      })),
      { value: SUGGESTIONS_OFF, name: "off", logo: null },
    ],
  }),
  "render.fps": setting({
    group: "performance",
    label: "frame rate cap",
    hint: "most frames sent to the terminal per second; display follows the monitor's refresh rate",
    schema: z.coerce
      .string()
      .regex(
        /^(display|uncapped|[1-9]\d*(\.\d+)?)$/,
        "expected display, uncapped, or a number of frames per second",
      ),
    default: DISPLAY_FPS,
    choices: [
      plain(DISPLAY_FPS, "display"),
      plain("30"),
      plain("60"),
      plain(UNCAPPED, "uncapped"),
    ],
  }),
  "render.presenter": setting({
    group: "performance",
    label: "frame updates",
    hint: `how changed pixels reach the terminal; ${NEXT_SESSION}`,
    schema: z.enum([AUTO, "full", "patched", "animation"]),
    default: AUTO,
    choices: [
      plain(AUTO, "automatic"),
      plain("full", "whole frame"),
      plain("patched", "patches"),
      plain("animation", "kitty animation"),
    ],
  }),
  "render.transport": setting({
    group: "performance",
    label: "frame transport",
    hint: `how frame pixels get to the terminal; ${NEXT_SESSION}`,
    schema: z.enum([AUTO, "shared", "file", "inline"]),
    default: AUTO,
    choices: [
      plain(AUTO, "automatic"),
      plain("shared", "shared memory"),
      plain("file", "file"),
      plain("inline", "inline"),
    ],
  }),
  "render.bandwidth": setting({
    group: "performance",
    label: "inline bandwidth (MB/s)",
    hint: "caps pixel bytes per second when frames travel inline, such as over ssh or tmux",
    schema: z.coerce
      .string()
      .regex(/^(unlimited|\d+(\.\d+)?)$/, "expected unlimited or megabytes per second"),
    default: "3",
    choices: [plain("1"), plain("3"), plain("10"), plain(UNLIMITED, "unlimited")],
  }),
  "render.compareFrames": setting({
    group: "performance",
    label: "compare browser frames",
    hint: "compares each browser frame with the previous one and sends only the pixels that changed; off trusts the browser's dirty rect, which is usually the whole viewport, and sends all of it",
    schema: z.enum(["on", "off"]),
    default: "on",
    choices: onOff,
  }),
  "render.frameEvents": setting({
    group: "performance",
    label: "[placeholder copy: show what the presenter is doing]",
    hint: "[placeholder copy: prints a note on screen whenever whole frames or folded patches go out, with a status line showing what the terminal is holding]",
    schema: z.enum(["on", "off"]),
    default: "off",
    choices: onOff,
  }),
  "render.transmitOutlines": setting({
    group: "performance",
    label: "outline sent images",
    hint: "flashes a border around every image sent to the terminal, to see what is being redrawn",
    schema: z.enum(["on", "off"]),
    default: "off",
    choices: onOff,
  }),
  "debug.logFile": setting({
    group: "performance",
    label: "[placeholder copy: write engine logs to a file]",
    hint: `[placeholder copy: appends what the engine is doing to ${ENGINE_LOG_FILE}, kept under 8 MB; off writes nothing]`,
    schema: z.enum(["on", "off"]),
    default: "off",
    choices: onOff,
  }),
};

export type SettingKey = keyof typeof SETTINGS;

export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS)[K]["schema"]> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, value);
}

export function defaultSettings(): Settings {
  const out = {} as Record<string, unknown>;
  for (const key of SETTING_KEYS) out[key] = SETTINGS[key].default;
  return out as Settings;
}
