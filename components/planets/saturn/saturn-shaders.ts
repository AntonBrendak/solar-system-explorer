
import type {
  Material,
  Texture,
  Vector3,
} from "three";

type Shader = Parameters<
  Material["onBeforeCompile"]
>[0];

// ============================================
// SHARED GLSL
// ============================================

const COMMON = /* glsl */ `
  varying vec3 vSaturnPosition;

  uniform vec3 uSaturnSun;

  const float SATURN_RADIUS = 2.0;
  const float SATURN_POLAR_RADIUS = 1.804;

  const float RING_INNER = 2.48;
  const float RING_OUTER = 4.54;
`;

// ============================================
// LOCAL POSITION
// ============================================

function addLocalPosition(shader: Shader) {
  shader.vertexShader =
    shader.vertexShader.replace(
      "#include <common>",
      `
      #include <common>

      varying vec3 vSaturnPosition;
      `
    );

  shader.vertexShader =
    shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>

      vSaturnPosition = position;
      `
    );

  shader.fragmentShader =
    shader.fragmentShader.replace(
      "#include <common>",
      `
      #include <common>

      ${COMMON}
      `
    );
}

// ============================================
// RING SHADOW ON SATURN
// ============================================

export function patchSaturnSurface(
  shader: Shader,
  sun: Vector3,
  ringTexture: Texture
) {
  shader.uniforms.uSaturnSun = {
    value: sun,
  };

  shader.uniforms.uSaturnRingMap = {
    value: ringTexture,
  };

  addLocalPosition(shader);

  shader.fragmentShader =
    shader.fragmentShader.replace(
      "const float RING_OUTER = 4.54;",
      `
      const float RING_OUTER = 4.54;

      uniform sampler2D uSaturnRingMap;
      `
    );

  shader.fragmentShader =
    shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      /* glsl */ `
      #include <lights_fragment_end>

      vec3 sun = normalize(uSaturnSun);

      float ringShadow = 0.0;

      // Ray from the atmosphere toward the Sun.
      if (abs(sun.y) > 0.001) {
        float t = -vSaturnPosition.y / sun.y;

        if (t > 0.0) {
          vec3 hit =
            vSaturnPosition + t * sun;

          float radius = length(hit.xz);

          float radial =
            (radius - RING_INNER) /
            (RING_OUTER - RING_INNER);

          float inRing =
            smoothstep(
              RING_INNER,
              RING_INNER + 0.012,
              radius
            ) *
            (
              1.0 -
              smoothstep(
                RING_OUTER - 0.012,
                RING_OUTER,
                radius
              )
            );

          if (inRing > 0.0) {
            float alpha = texture2D(
              uSaturnRingMap,
              vec2(
                clamp(radial, 0.0, 1.0),
                0.5
              )
            ).a;

            float obstruction =
              1.0 - pow(
                max(1.0 - alpha, 0.001),
                1.0 / max(abs(sun.y), 0.12)
              );

            ringShadow =
              obstruction * inRing;
          }
        }
      }

      // Only direct sunlight is blocked.
      reflectedLight.directDiffuse *=
        1.0 - 0.96 * ringShadow;

      reflectedLight.directSpecular *=
        1.0 - 0.96 * ringShadow;
      `
    );
}

// ============================================
// SATURN SHADOW ON RINGS
// ============================================

export function patchSaturnRings(
  shader: Shader,
  sun: Vector3
) {
  shader.uniforms.uSaturnSun = {
    value: sun,
  };

  addLocalPosition(shader);

  shader.fragmentShader =
    shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      /* glsl */ `
      #include <lights_fragment_end>

      vec3 sun = normalize(uSaturnSun);

      // Saturn is an oblate spheroid.
      vec3 ellipsoid = vec3(
        SATURN_RADIUS,
        SATURN_POLAR_RADIUS,
        SATURN_RADIUS
      );

      vec3 p =
        vSaturnPosition / ellipsoid;

      vec3 ray =
        sun / ellipsoid;

      float aa = dot(ray, ray);
      float bb = dot(p, ray);

      float impact2 = max(
        0.0,
        dot(p, p) -
        bb * bb / aa
      );

      float impact = sqrt(impact2);

      // The planet blocks sunlight only
      // when the ray points toward it.
      float planetShadow =
        (bb < 0.0)
          ? (
              1.0 -
              smoothstep(
                0.987,
                1.013,
                impact
              )
            )
          : 0.0;

      reflectedLight.directDiffuse *=
        1.0 - 0.98 * planetShadow;

      reflectedLight.directSpecular *=
        1.0 - 0.98 * planetShadow;
      `
    );
}
