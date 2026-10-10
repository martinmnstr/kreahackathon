// Hazard illustration adapter.
// Swap the body of `hazardIllustrationSvg` to plug in your third-party illustration
// library — the card renderer only needs an SVG string per hazard.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Bug, Flame, Hammer, Nut, Pill, ShieldAlert, Skull, Baby, TriangleAlert, type LucideIcon,
} from "lucide-react";
import type { Hazard } from "./recall-parse";

const ICONS: Record<Hazard, LucideIcon> = {
  allergen: Nut,
  bacteria: Bug,
  foreign_object: Hammer,
  choking: Baby,
  fire: Flame,
  injury: TriangleAlert,
  chemical: Skull,
  drug: Pill,
  other: ShieldAlert,
};

export function hazardIcon(hazard: string): LucideIcon {
  return ICONS[hazard as Hazard] ?? ShieldAlert;
}

export function hazardIllustrationSvg(hazard: string, color: string): string {
  return renderToStaticMarkup(
    createElement(hazardIcon(hazard), { size: 512, color, strokeWidth: 1.6, xmlns: "http://www.w3.org/2000/svg" }),
  );
}

export function loadHazardIllustration(hazard: string, color: string): Promise<HTMLImageElement> {
  const svg = hazardIllustrationSvg(hazard, color);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
