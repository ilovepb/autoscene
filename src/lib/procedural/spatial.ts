import type { LayerMeta } from "@/lib/procedural/engine";

interface AxisGap {
  gap: number;
  axis: "X" | "Y" | "Z";
}

interface LayerRelationship {
  id: string;
  description: string;
  overlaps: boolean;
  /** Present only when overlaps === false */
  gap?: AxisGap;
  /** Present only when overlaps === true — minimum penetration depth and its axis */
  penetration?: AxisGap;
  centerDistance: number;
}

interface SpatialAnalysis {
  relationships: LayerRelationship[];
  nearestId: string;
  nearestDescription: string;
}

/** Check if two AABBs overlap on all three axes. */
function aabbOverlaps(a: LayerMeta["bounds"], b: LayerMeta["bounds"]): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/**
 * For two non-overlapping AABBs, compute the smallest gap and
 * the axis on which it occurs.
 */
function computeGap(a: LayerMeta["bounds"], b: LayerMeta["bounds"]): AxisGap {
  // Per-axis separation (negative means overlap on that axis)
  const gaps: [number, "X" | "Y" | "Z"][] = [
    [Math.max(0, Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0])), "X"],
    [Math.max(0, Math.max(a.min[1] - b.max[1], b.min[1] - a.max[1])), "Y"],
    [Math.max(0, Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2])), "Z"],
  ];

  // Pick the axis with the largest positive gap (the separating axis)
  let best = gaps[0];
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i][0] > best[0]) best = gaps[i];
  }
  return { gap: best[0], axis: best[1] };
}

/**
 * For two overlapping AABBs, compute the smallest overlap (penetration depth)
 * and the axis on which it occurs.
 */
function computePenetration(
  a: LayerMeta["bounds"],
  b: LayerMeta["bounds"],
): AxisGap {
  // Per-axis overlap extent
  const overlaps: [number, "X" | "Y" | "Z"][] = [
    [Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]), "X"],
    [Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]), "Y"],
    [Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]), "Z"],
  ];

  // Minimum overlap axis = shallowest penetration
  let best = overlaps[0];
  for (let i = 1; i < overlaps.length; i++) {
    if (overlaps[i][0] < best[0]) best = overlaps[i];
  }
  return { gap: best[0], axis: best[1] };
}

/** Euclidean distance between two 3D points. */
function distance3D(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compare a newly generated layer's AABB against all existing layers.
 * Returns null if there are no existing layers to compare against.
 */
export function analyzeSpatialRelationships(
  newLayer: LayerMeta,
  existingLayers: LayerMeta[],
): SpatialAnalysis | null {
  if (existingLayers.length === 0) return null;

  let nearestDist = Number.POSITIVE_INFINITY;
  let nearestId = "";
  let nearestDescription = "";

  const relationships: LayerRelationship[] = existingLayers.map((existing) => {
    const overlaps = aabbOverlaps(newLayer.bounds, existing.bounds);
    const centerDist = distance3D(
      newLayer.bounds.center,
      existing.bounds.center,
    );

    if (centerDist < nearestDist) {
      nearestDist = centerDist;
      nearestId = existing.id;
      nearestDescription = existing.description;
    }

    const rel: LayerRelationship = {
      id: existing.id,
      description: existing.description,
      overlaps,
      centerDistance: centerDist,
    };

    if (overlaps) {
      rel.penetration = computePenetration(newLayer.bounds, existing.bounds);
    } else {
      rel.gap = computeGap(newLayer.bounds, existing.bounds);
    }

    return rel;
  });

  return { relationships, nearestId, nearestDescription };
}

/** Format spatial analysis as a human-readable string for tool output. */
export function formatSpatialAnalysis(analysis: SpatialAnalysis): string {
  const fmt = (n: number) => n.toFixed(2);
  const lines = analysis.relationships.map((rel) => {
    const label = rel.description ? ` (${rel.description})` : "";
    if (rel.overlaps) {
      const p = rel.penetration;
      return `  - ${rel.id}${label}: overlaps ${fmt(p!.gap)} on ${p!.axis} axis`;
    }
    const g = rel.gap;
    return `  - ${rel.id}${label}: no overlap, gap ${fmt(g!.gap)} on ${g!.axis} axis`;
  });

  if (analysis.relationships.length > 1) {
    const nearLabel = analysis.nearestDescription
      ? ` (${analysis.nearestDescription})`
      : "";
    lines.push(`  - nearest: ${analysis.nearestId}${nearLabel}`);
  }

  return `\n  spatial relationships:\n${lines.join("\n")}`;
}
