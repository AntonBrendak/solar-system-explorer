import { BackSide, GLSL3, ShaderMaterial, Vector2, type Texture } from "three";

/** Hardware sRGB sampling supplies linear RGB. OutputPass performs the only output transform. */
export function createSkyShader(
  base: Texture,
  pages: Texture,
  table: Texture,
  core: number,
  tableSize: Vector2,
  projection: "uv" | "direction" = "direction",
) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: BackSide,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      viewportSize: { value: new Vector2(1, 1) },
      focusUV: { value: new Vector2(0.5, 0.5) },
      zoneScale: { value: 1 },
      coverageFloor: { value: 8 },
      previousCoverageFloor: { value: 8 },
      skyBase: { value: base },
      skyPages: { value: pages },
      previousTable: { value: table },
      nextTable: { value: table },
      pageCore: { value: core },
      tableSize: { value: tableSize },
      transition: { value: 0 },
      detailsEnabled: { value: 0 },
      detailLimit: { value: 64 },
      previousDetailLimit: { value: 64 },
      coverageBlend: { value: 1 },
    },
    vertexShader: `
      out vec2 atlasUV;
      ${projection === "direction" ? "out vec3 atlasDirection;" : ""}
      void main() {
        atlasUV = vec2(uv.x, 1.0 - uv.y);
        ${projection === "direction" ? "atlasDirection = position;" : ""}
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp sampler2DArray;
      uniform sampler2D skyBase;
      uniform sampler2DArray skyPages;
      uniform vec2 viewportSize;
      uniform vec2 focusUV;
      uniform float zoneScale;
      uniform float coverageFloor;
      uniform float previousCoverageFloor;
      uniform sampler2D previousTable;
      uniform sampler2D nextTable;
      uniform vec2 tableSize;
      uniform float pageCore;
      uniform float transition;
      uniform float detailsEnabled;
      uniform float detailLimit;
      uniform float previousDetailLimit;
      uniform float coverageBlend;
      in vec2 atlasUV;
      ${projection === "direction" ? "in vec3 atlasDirection;" : ""}
      layout(location = 0) out vec4 skyColor;
      vec3 samplePage(vec2 uv, float layer) { return texture(skyPages, vec3(uv, layer)).rgb; }
      vec3 sampleLevel(sampler2D pages, vec2 uv, int level, vec3 fallback) {
        uv = vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0));
        float columns = (8192.0 * exp2(float(level))) / pageCore;
        vec2 grid = vec2(columns, columns * 0.5);
        float offset = (exp2(float(level)) - 1.0) * tableSize.x / 16.0;
        vec2 cell = clamp(floor(uv * grid), vec2(0.0), grid - 1.0);
        float layer = texelFetch(pages, ivec2(cell + vec2(0.0, offset)), 0).r - 1.0;
        if (layer < 0.0) return fallback;
        vec2 local = clamp(uv * grid - cell, 0.0, 1.0);
        return samplePage((vec2(2.0) + local * pageCore) / (pageCore + 4.0), layer);
      }
      vec2 integrationTap(int index, float span) {
        if (span <= 1.0) return index == 0 ? vec2(0.0, 1.0) : vec2(0.0);
        float four = smoothstep(1.75, 2.5, span);
        bool outer = index == 0 || index == 3;
        float offset = outer ? 0.375 : mix(0.25, 0.125, four);
        float weight = outer ? 0.25 * four : 0.5 - 0.25 * four;
        return vec2((index < 2 ? -offset : offset) * smoothstep(1.0, 2.0, span), weight);
      }
      vec3 resolve(sampler2D pages, vec2 uv, vec2 dx, vec2 dy, float limit, float floorLevel) {
        vec3 colour = textureGrad(skyBase, uv, dx, dy).rgb;
        float ancestorEnvelope = 1.0;
        vec2 screen = (gl_FragCoord.xy / viewportSize - focusUV) * vec2(viewportSize.x / viewportSize.y, 1.0);
        float radius = length(screen) / max(zoneScale, 0.1);
        int minimumLevel = clamp(int(floor(log2(max(8.0, floorLevel) / 8.0) + 0.5)), 0, 3);
        float minimumLod = float(minimumLevel);
        float spatialLod = mix(3.0, minimumLod, smoothstep(0.10, 0.90, radius));
        if (detailsEnabled > 0.5) {
          for (int level = 0; level < 4; level++) {
            if (8.0 * exp2(float(level)) > limit) continue;
            float columns = (8192.0 * exp2(float(level))) / pageCore;
            vec2 grid = vec2(columns, columns * 0.5);
            float rowOffset = (exp2(float(level)) - 1.0) * tableSize.x / 16.0;
            vec2 cell = floor(uv * grid);
            cell = clamp(cell, vec2(0.0), grid - 1.0);
            vec4 entry = texelFetch(pages, ivec2(cell + vec2(0.0, rowOffset)), 0);
            float layer = entry.r - 1.0;
            if (layer >= 0.0) {
              vec2 local = clamp(uv * grid - cell, 0.0, 1.0);
              vec2 sampleUV = (vec2(2.0) + local * pageCore) / (pageCore + 4.0);
              float distance = 1e6;
              int mask = int(entry.g);
              for (int bit = 0; bit < 9; bit++) {
                if (bit == 4 || (mask & (1 << bit)) == 0) continue;
                vec2 neighbour = vec2(float(bit % 3) - 1.0, float(bit / 3) - 1.0);
                vec2 delta = max(max(neighbour - local, local - neighbour - 1.0), vec2(0.0));
                distance = min(distance, length(delta) * pageCore);
              }
              float footprint = max(length(dx * grid), length(dy * grid)) * pageCore;
              float weight = smoothstep(0.0, min(256.0, max(2.0, footprint * 96.0)), distance);
              float edgeEnvelope = weight;
              weight *= ancestorEnvelope;
              ancestorEnvelope *= edgeEnvelope;
              weight *= clamp(spatialLod - float(level) + 1.0, 0.0, 1.0);
              if (level > minimumLevel)
                weight *= clamp(1.0 - log2(max(footprint, 1.0)), 0.0, 1.0);
              if (weight > 0.0) {
                vec3 detail = samplePage(sampleUV, layer);
                if (level == minimumLevel && footprint > 1.0) {
                  float spanX = length(dx * grid) * pageCore;
                  float spanY = length(dy * grid) * pageCore;
                  detail = vec3(0.0);
                  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
                    vec2 tapX = integrationTap(x, spanX), tapY = integrationTap(y, spanY);
                    float contribution = tapX.y * tapY.y;
                    if (contribution <= 0.0) continue;
                    detail += sampleLevel(pages, uv + dx * tapX.x + dy * tapY.x, level, colour) * contribution;
                  }
                }
                colour = mix(colour, detail, weight);
              }
            }
          }
        }
        return colour;
      }
      void main() {
        vec2 projectedUV = atlasUV;
        ${
          projection === "direction"
            ? `
        vec3 direction = normalize(atlasDirection);
        projectedUV = vec2(atan(direction.z, -direction.x) / 6.283185307179586,
                           atan(length(direction.xz), direction.y) / 3.141592653589793);
        `
            : ""
        }
        vec2 uv = vec2(fract(projectedUV.x), clamp(projectedUV.y, 0.0, 1.0));
        vec2 dx = dFdx(projectedUV), dy = dFdy(projectedUV);
        dx.x -= round(dx.x); dy.x -= round(dy.x);
        vec3 current = resolve(previousTable, uv, dx, dy, detailLimit, coverageFloor);
        vec3 next = transition > 0.0 ? resolve(nextTable, uv, dx, dy, detailLimit, coverageFloor) : current;
        vec3 colour = mix(current, next, transition);
        if (coverageBlend < 1.0)
          colour = mix(resolve(previousTable, uv, dx, dy, previousDetailLimit, previousCoverageFloor), colour, coverageBlend);
        skyColor = vec4(colour, 1.0);
      }
    `,
  });
}
