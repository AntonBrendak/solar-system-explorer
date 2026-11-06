
const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) {
  return x - floor(x / 289.0) * 289.0;
}
vec4 mod289(vec4 x) {
  return x - floor(x / 289.0) * 289.0;
}
vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}
vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod289(i);
  vec4 p = permute(
    permute(
      permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0)
    ) + i.x + vec4(0.0, i1.x, i2.x, 1.0)
  );

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(
    vec4(
      dot(p0,p0), dot(p1,p1),
      dot(p2,p2), dot(p3,p3)
    )
  );
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(
    0.6 - vec4(
      dot(x0,x0), dot(x1,x1),
      dot(x2,x2), dot(x3,x3)
    ),
    0.0
  );
  m = m * m;

  return 42.0 * dot(
    m * m,
    vec4(
      dot(p0,x0), dot(p1,x1),
      dot(p2,x2), dot(p3,x3)
    )
  );
}
`;

export const SUN_VERTEX = /* glsl */ `
varying vec3 vLocalPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

void main() {
  vLocalPosition = position;
  vViewNormal = normalize(normalMatrix * normal);

  vec4 viewPosition =
    modelViewMatrix * vec4(position, 1.0);

  vViewPosition = viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`;

export const SUN_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uSolarDays;
uniform float uGranuleTime;

varying vec3 vLocalPosition;
varying vec3 vViewNormal;
varying vec3 vViewPosition;

${simplexNoise}

const float TAU = 6.28318530718;

vec3 spinY(vec3 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);

  return vec3(
    c * p.x + s * p.z,
    p.y,
    -s * p.x + c * p.z
  );
}

vec3 spotCenter(
  float latitude,
  float longitude,
  float days
) {
  float lat = radians(latitude);
  float differential = sin(lat) * sin(lat);
  float period = mix(25.0, 36.0, differential);

  float angle =
    longitude + TAU * fract(days / period);

  return vec3(
    cos(lat) * cos(angle),
    sin(lat),
    cos(lat) * sin(angle)
  );
}

float solarSpot(
  vec3 p,
  vec3 center,
  float radius
) {
  float d = distance(p, center);

  return 1.0 - smoothstep(
    radius * 0.45,
    radius,
    d
  );
}

void main() {
  vec3 p = normalize(vLocalPosition);

  vec3 normalView = normalize(vViewNormal);
  vec3 viewDirection = normalize(-vViewPosition);

  float facing = clamp(
    dot(normalView, viewDirection),
    0.0,
    1.0
  );

  // Stable rotational field without latitude shear.
  vec3 surface = spinY(
    p,
    TAU * fract(uSolarDays / 25.0)
  );

  // Reduce small-scale noise when the Sun is distant.
  float pixelFootprint = max(
    length(dFdx(p)),
    length(dFdy(p))
  );

  float microWeight =
    1.0 - smoothstep(
      0.18,
      0.48,
      pixelFootprint * 16.0
    );

  float t = uGranuleTime;

  vec3 slowFlow = vec3(
    t * 0.12,
    -t * 0.085,
    t * 0.055
  );

  vec3 fastFlow = vec3(
    -t * 0.23,
    t * 0.16,
    -t * 0.10
  );

  float coarse = snoise(
    surface * 7.5 + slowFlow
  );

  float fine = snoise(
    surface * 16.0 + fastFlow
  ) * microWeight;

  float granulation = clamp(
    0.5 + 0.5 * (
      coarse * 0.77 +
      fine * 0.23
    ),
    0.0,
    1.0
  );

  float convection = snoise(
    surface * 4.2 + slowFlow * 0.55
  );

  float warmCells = smoothstep(
    0.30,
    0.76,
    convection * 0.5 + 0.5
  );

  // Coherent illustrative active regions.
  float spots = 0.0;

  spots = max(
    spots,
    solarSpot(
      p,
      spotCenter(14.0, 0.3, uSolarDays),
      0.095
    )
  );

  spots = max(
    spots,
    solarSpot(
      p,
      spotCenter(-22.0, 2.4, uSolarDays),
      0.075
    )
  );

  spots = max(
    spots,
    solarSpot(
      p,
      spotCenter(9.0, 4.8, uSolarDays),
      0.063
    )
  );

  // Warm, detailed surface without white clipping.
  vec3 darkOrange = vec3(
    0.75, 0.23, 0.018
  );

  vec3 warmYellow = vec3(
    1.12, 0.64, 0.085
  );

  vec3 brightYellow = vec3(
    1.38, 1.04, 0.28
  );

  vec3 color = mix(
    darkOrange,
    warmYellow,
    granulation
  );

  color = mix(
    color,
    brightYellow,
    0.34 * warmCells +
    0.31 * granulation
  );

  color *= 0.98 + 0.06 * warmCells;

  color = mix(
    color,
    vec3(0.31, 0.075, 0.014),
    spots * 0.72
  );

  float rim = pow(
    1.0 - facing,
    2.5
  );

  color += vec3(
    0.21, 0.09, 0.01
  ) * rim;

  color *= mix(
    0.89,
    1.0,
    pow(facing, 0.35)
  );

  gl_FragColor = vec4(color, 1.0);
}
`;
