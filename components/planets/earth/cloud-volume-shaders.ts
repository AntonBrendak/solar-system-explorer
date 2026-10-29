import { cloudCoverShader } from "./cloud-cover-shader";

export const CLOUD_BASE_RADIUS = 2.002;
export const CLOUD_TOP_RADIUS = 2.012;
export const MAX_CLOUD_FLASHES = 4;

export const cloudVolumeVertex = /* glsl */ `
  varying vec3 vCloudPosition;
  void main() {
    vCloudPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudVolumeFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uCloudTexture;
  uniform sampler2D uCloudNext;
  uniform sampler2D uPrecipitationMask;
  uniform float uCloudBlend;
  uniform float uCloudPhase;
  uniform mat4 uWorldToCloud;
  uniform vec3 uSunLocal;
  uniform vec4 uLightning[4];
  varying vec3 vCloudPosition;

  const float PI = 3.14159265359;
  const float BASE = ${CLOUD_BASE_RADIUS};
  const float TOP = ${CLOUD_TOP_RADIUS};
  const int MAX_STEPS = 64;

  vec2 sphereUv(vec3 p) {
    vec3 n = normalize(p);
    return vec2(atan(-n.z, n.x) / (2.0 * PI) + 0.5,
                asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
  }

  ${cloudCoverShader}

  // Relief follows the satellite mask. No procedural grid is added to the cloud
  // tops: low-frequency noise looked like corrugated terrain near the horizon.
  float densityAt(vec3 p) {
    float radius = length(p);
    if (radius <= BASE || radius >= TOP) return 0.0;
    vec2 uv = sphereUv(p);
    float cover = cloudCover(uv);
    if (cover < 0.025) return 0.0;
    float rain = textureLod(uPrecipitationMask, uv, 0.0).r;
    float height = BASE + mix(0.0025, TOP - BASE, clamp(cover * 0.85 + rain * 0.35, 0.0, 1.0));
    float h = (radius - BASE) / (height - BASE);
    float profile = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.55, 1.0, h));
    return max(0.0, cover - 0.025) * profile;
  }

  vec2 intersectSphere(vec3 eye, vec3 ray, float radius) {
    float b = dot(eye, ray);
    float h = b * b - dot(eye, eye) + radius * radius;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 eye = (uWorldToCloud * vec4(cameraPosition, 1.0)).xyz;
    vec3 ray = normalize(vCloudPosition - eye);
    vec2 shell = intersectSphere(eye, ray, TOP);
    if (shell.y <= 0.0) discard;
    float nearT = max(0.0, shell.x);
    float farT = shell.y;
    vec2 ground = intersectSphere(eye, ray, 2.0);
    if (ground.x > 0.0) farT = min(farT, ground.x);
    if (farT <= nearT) discard;
    // Grazing rays travel farther through a thin shell. More samples at the limb
    // prevent the horizontal bands produced by under-sampling that long segment.
    float viewCosine = abs(dot(normalize(eye + ray * nearT), -ray));
    int sampleCount = int(mix(32.0, float(MAX_STEPS), pow(1.0 - viewCosine, 3.0)));
    float stepSize = (farT - nearT) / float(sampleCount);
    vec3 sun = normalize(uSunLocal);
    float forward = clamp(dot(ray, sun), -1.0, 1.0);
    float phase = 0.6975 / pow(max(0.16, 1.3025 - 1.1 * forward), 1.5);
    vec3 accumulated = vec3(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= sampleCount) break;
      vec3 p = eye + ray * (nearT + (float(i) + 0.5) * stepSize);
      float density = densityAt(p);
      if (density < 0.002) continue;
      vec3 n = normalize(p);
      float daylight = smoothstep(-0.15, 0.10, dot(n, sun));
      // Sample toward the sun for soft, spatially coherent self-shadowing.
      float shadowDensity = densityAt(p + sun * 0.0035) + densityAt(p + sun * 0.007);
      float sunTransmission = exp(-shadowDensity * 2.8);
      float heightLight = mix(0.55, 1.0, smoothstep(BASE, TOP, length(p)));
      float rain = textureLod(uPrecipitationMask, sphereUv(p), 0.0).r;
      float stormStrength = smoothstep(0.05, 0.68, rain);
      vec3 ambient = vec3(0.018, 0.026, 0.045) + daylight * vec3(0.18, 0.21, 0.26);
      vec3 litWhite = mix(vec3(1.04, 1.025, 0.99), vec3(0.91, 0.95, 1.0), 1.0 - heightLight);
      vec3 direct = litWhite * daylight * sunTransmission
          * heightLight * (0.5 + min(phase, 2.8) * 0.3);
      // Change only reflected color: density, geometry and opacity stay intact.
      float denseCloud = smoothstep(0.08, 0.72, density);
      float interiorShade = 1.0 - sunTransmission;
      // Dense, shielded interiors become cool gray; illuminated edges stay white.
      float densityShade = denseCloud * (0.2 + 0.8 * interiorShade);
      vec3 densityTone = mix(vec3(1.0, 0.997, 0.99), vec3(0.84, 0.86, 0.89), densityShade);
      // The measured rain mask darkens dense cloud bodies, not clear sky or wisps.
      float rainShade = stormStrength * denseCloud * mix(0.55, 1.0, interiorShade);
      vec3 rainTone = mix(vec3(1.0), vec3(0.53, 0.57, 0.63), rainShade * 0.7);
      vec3 lighting = (ambient + direct) * densityTone * rainTone;
      for (int flash = 0; flash < 4; flash++) {
        vec3 difference = p - uLightning[flash].xyz;
        lighting += vec3(2.5, 2.9, 3.6) * uLightning[flash].w
          * exp(-dot(difference, difference) / 0.0007) * mix(1.0, 0.1, daylight);
      }
      float opacity = 1.0 - exp(-density * stepSize * (340.0 + stormStrength * 240.0));
      accumulated += transmittance * opacity * lighting;
      transmittance *= 1.0 - opacity;
      if (transmittance < 0.015) break;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(accumulated / max(alpha, 0.00001), alpha * 0.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
