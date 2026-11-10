import { Vector3 } from "three";

export type CameraBody = {
  id: string;
  center: Vector3;
  radius: number;
  framingRadius: number;
  ring?: { normal: Vector3; inner: number; outer: number; thickness: number };
};
type Hit = { t: number; normal: Vector3 };
export type CameraPath = {
  points: Vector3[];
  lengths: number[];
  length: number;
  cursor: number;
};

/** Fit a bounding sphere in both axes, using the unobstructed part of the viewport. */
export function framingDistance(
  radius: number,
  fov: number,
  width: number,
  height: number,
  bottomInset: number,
  sideInset = 0,
  topInset = 0,
) {
  const tangent = Math.tan((fov * Math.PI) / 360);
  const vertical = Math.atan(
    tangent *
      Math.max(0.08, (height - bottomInset - topInset) / Math.max(height, 1)),
  );
  const horizontal = Math.atan(
    (tangent * Math.max(width * 0.2, width - sideInset)) / Math.max(height, 1),
  );
  return (
    (radius * 1.18) / Math.sin(Math.max(0.02, Math.min(vertical, horizontal)))
  );
}

export function cinematicEase(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function sphereEntry(
  from: Vector3,
  to: Vector3,
  body: CameraBody,
): number | null {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  const mx = from.x - body.center.x,
    my = from.y - body.center.y,
    mz = from.z - body.center.z;
  const length2 = dx * dx + dy * dy + dz * dz;
  if (length2 < 1e-24) return null;
  const middle = -(mx * dx + my * dy + mz * dz) / length2;
  const cx = mx + dx * middle,
    cy = my + dy * middle,
    cz = mz + dz * middle;
  const gap = body.radius * body.radius - (cx * cx + cy * cy + cz * cz);
  if (gap <= 0) return null;
  const t = middle - Math.sqrt(gap / length2);
  return t >= 0 && t < 1 ? t : null;
}

function insideRing(point: Vector3, body: CameraBody) {
  const ring = body.ring;
  if (!ring) return false;
  const relative = point.clone().sub(body.center);
  const height = relative.dot(ring.normal);
  const radial2 = Math.max(0, relative.lengthSq() - height * height);
  return (
    Math.abs(height) < ring.thickness &&
    radial2 > ring.inner ** 2 &&
    radial2 < ring.outer ** 2
  );
}

/** Sweep the slab faces and both cylindrical edges of Saturn's annular ring. */
function ringHit(from: Vector3, to: Vector3, body: CameraBody): Hit | null {
  const ring = body.ring;
  if (!ring) return null;
  const relative = from.clone().sub(body.center);
  const move = to.clone().sub(from);
  const height = relative.dot(ring.normal),
    vertical = move.dot(ring.normal);
  const radial = relative.clone().addScaledVector(ring.normal, -height);
  const planar = move.clone().addScaledVector(ring.normal, -vertical);
  const candidates: Hit[] = [];
  if (Math.abs(vertical) > 1e-15) {
    for (const side of [-1, 1]) {
      const t = (side * ring.thickness - height) / vertical;
      if (t >= 0 && t <= 1) {
        const r2 = radial.clone().addScaledVector(planar, t).lengthSq();
        if (
          r2 >= ring.inner ** 2 &&
          r2 <= ring.outer ** 2 &&
          vertical * side < 0
        )
          candidates.push({
            t,
            normal: ring.normal.clone().multiplyScalar(side),
          });
      }
    }
  }
  const a = planar.lengthSq(),
    b = radial.dot(planar);
  if (a > 1e-24)
    for (const [radius, side] of [
      [ring.inner, -1],
      [ring.outer, 1],
    ]) {
      const discriminant = b * b - a * (radial.lengthSq() - radius * radius);
      if (discriminant < 0) continue;
      for (const sign of [-1, 1]) {
        const t = (-b + sign * Math.sqrt(discriminant)) / a;
        if (t < 0 || t > 1 || Math.abs(height + vertical * t) > ring.thickness)
          continue;
        const normal = radial
          .clone()
          .addScaledVector(planar, t)
          .normalize()
          .multiplyScalar(side);
        if (move.dot(normal) < 0) candidates.push({ t, normal });
      }
    }
  return candidates.sort((a, b) => a.t - b.t)[0] ?? null;
}

function separate(point: Vector3, bodies: readonly CameraBody[]) {
  for (const body of bodies) {
    const offset = point.clone().sub(body.center);
    if (offset.lengthSq() < body.radius ** 2) {
      if (offset.lengthSq() < 1e-24) offset.set(0, 1, 0);
      point
        .copy(body.center)
        .add(offset.normalize().multiplyScalar(body.radius * 1.0001));
    }
    if (insideRing(point, body)) {
      const ring = body.ring!;
      const h = point.clone().sub(body.center).dot(ring.normal);
      point.addScaledVector(
        ring.normal,
        (h >= 0 ? 1 : -1) * ring.thickness * 1.001 - h,
      );
    }
  }
}

/** Continuous collision, followed by tangential sliding; large steps cannot tunnel through a globe. */
export function constrainCamera(
  from: Vector3,
  desired: Vector3,
  bodies: readonly CameraBody[],
) {
  const position = from.clone();
  separate(position, bodies);
  let goal = desired.clone();
  for (let pass = 0; pass < 4; pass++) {
    let hit: Hit | null = null;
    for (const body of bodies) {
      const t = sphereEntry(position, goal, body);
      if (t !== null && (!hit || t < hit.t))
        hit = {
          t,
          normal: position.clone().lerp(goal, t).sub(body.center).normalize(),
        };
      const ring = ringHit(position, goal, body);
      if (ring && (!hit || ring.t < hit.t)) hit = ring;
    }
    if (!hit) {
      position.copy(goal);
      break;
    }
    const movement = goal.clone().sub(position);
    position.addScaledVector(movement, hit.t).addScaledVector(hit.normal, 1e-7);
    movement.multiplyScalar(1 - hit.t);
    const inward = movement.dot(hit.normal);
    if (inward < 0) movement.addScaledVector(hit.normal, -inward);
    goal = position.clone().add(movement);
  }
  separate(position, bodies);
  return position;
}

function clearSegment(a: Vector3, b: Vector3, bodies: readonly CameraBody[]) {
  return bodies.every(
    (body) => sphereEntry(a, b, body) === null && ringHit(a, b, body) === null,
  );
}

/** Visibility graph gives a direct route when possible and a local detour around intervening bodies. */
export function cameraPath(
  from: Vector3,
  desired: Vector3,
  bodies: readonly CameraBody[],
): CameraPath {
  const end = desired.clone();
  separate(end, bodies);
  let points = [from.clone(), end];
  if (!clearSegment(from, end, bodies)) {
    const nodes = [...points];
    for (const body of bodies) {
      const extent = Math.max(body.radius, body.ring?.outer ?? 0) * 1.9;
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++)
          for (let z = -1; z <= 1; z++) {
            const axes = Number(x !== 0) + Number(y !== 0) + Number(z !== 0);
            if (axes !== 1 && axes !== 3) continue;
            const point = new Vector3(x, y, z)
              .normalize()
              .multiplyScalar(extent)
              .add(body.center);
            if (
              bodies.every(
                (other) =>
                  point.distanceToSquared(other.center) > other.radius ** 2 &&
                  !insideRing(point, other),
              )
            )
              nodes.push(point);
          }
    }
    const costs = nodes.map(() => Infinity),
      previous = nodes.map(() => -1),
      visited = new Set<number>();
    costs[0] = 0;
    for (let step = 0; step < nodes.length; step++) {
      let current = -1;
      for (let i = 0; i < nodes.length; i++)
        if (!visited.has(i) && (current < 0 || costs[i] < costs[current]))
          current = i;
      if (current < 0 || !Number.isFinite(costs[current]) || current === 1)
        break;
      visited.add(current);
      for (let i = 0; i < nodes.length; i++) {
        if (visited.has(i)) continue;
        const cost = costs[current] + nodes[current].distanceTo(nodes[i]);
        if (cost < costs[i] && clearSegment(nodes[current], nodes[i], bodies)) {
          costs[i] = cost;
          previous[i] = current;
        }
      }
    }
    if (previous[1] >= 0) {
      const indices = [1];
      while (indices[0] !== 0) indices.unshift(previous[indices[0]]);
      points = indices.map((index) => nodes[index]);
    }
  }
  // Round safe corners. Retain every sampled waypoint so even a fast frame follows the detour.
  const rounded = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    let distance = Math.min(a.distanceTo(b), b.distanceTo(c)) * 0.3;
    let samples: Vector3[] = [b];
    for (let attempt = 0; attempt < 6; attempt++, distance *= 0.5) {
      const entry = b
        .clone()
        .addScaledVector(a.clone().sub(b).normalize(), distance);
      const exit = b
        .clone()
        .addScaledVector(c.clone().sub(b).normalize(), distance);
      const curve = Array.from({ length: 17 }, (_, j) => {
        const t = j / 16;
        return entry
          .clone()
          .multiplyScalar((1 - t) ** 2)
          .addScaledVector(b, 2 * t * (1 - t))
          .addScaledVector(exit, t * t);
      });
      if (
        clearSegment(rounded[rounded.length - 1], entry, bodies) &&
        curve
          .slice(1)
          .every((point, j) => clearSegment(curve[j], point, bodies))
      ) {
        samples = curve;
        break;
      }
    }
    rounded.push(...samples);
  }
  rounded.push(points[points.length - 1]);
  const lengths = [0];
  for (let i = 1; i < rounded.length; i++)
    lengths.push(lengths[i - 1] + rounded[i].distanceTo(rounded[i - 1]));
  return {
    points: rounded,
    lengths,
    length: lengths[lengths.length - 1],
    cursor: 1,
  };
}

/** Advance through crossed corners instead of jumping across their collision-safe route. */
export function advancePath(
  path: CameraPath,
  distance: number,
  current: Vector3,
  bodies: readonly CameraBody[],
) {
  let position = current.clone();
  while (
    path.cursor < path.points.length &&
    path.lengths[path.cursor] <= distance
  ) {
    position = constrainCamera(position, path.points[path.cursor], bodies);
    path.cursor++;
  }
  if (path.cursor < path.points.length) {
    const before = path.cursor - 1;
    const t =
      (distance - path.lengths[before]) /
      Math.max(1e-12, path.lengths[path.cursor] - path.lengths[before]);
    position = constrainCamera(
      position,
      path.points[before]
        .clone()
        .lerp(path.points[path.cursor], Math.max(0, Math.min(1, t))),
      bodies,
    );
  }
  return position;
}
