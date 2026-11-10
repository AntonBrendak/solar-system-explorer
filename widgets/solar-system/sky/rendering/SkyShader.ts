import { BackSide, GLSL3, ShaderMaterial, Vector2, type Texture } from "three";

/** Hardware sRGB sampling supplies linear RGB. OutputPass performs the only output transform. */
export function createSkyShader(
  base: Texture,
  pages: Texture,
  table: Texture,
  core: number,
  tableSize: Vector2,
) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: BackSide,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
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
      void main() {
        atlasUV = vec2(uv.x, 1.0 - uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp sampler2DArray;
      uniform sampler2D skyBase;
      uniform sampler2DArray skyPages;
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
      layout(location = 0) out vec4 skyColor;
      vec3 resolve(sampler2D pages, vec2 uv, vec2 dx, vec2 dy, float limit) {
        vec3 colour = textureGrad(skyBase, uv, dx, dy).rgb;
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
              float weight = smoothstep(0.0, max(64.0, footprint * 24.0), distance);
              colour = mix(colour, texture(skyPages, vec3(sampleUV, layer)).rgb, weight);
            }
          }
        }
        return colour;
      }
      void main() {
        vec2 uv = vec2(fract(atlasUV.x), clamp(atlasUV.y, 0.0, 1.0));
        vec2 dx = dFdx(atlasUV), dy = dFdy(atlasUV);
        dx.x -= round(dx.x); dy.x -= round(dy.x);
        vec3 current = resolve(previousTable, uv, dx, dy, detailLimit);
        vec3 next = transition > 0.0 ? resolve(nextTable, uv, dx, dy, detailLimit) : current;
        vec3 colour = mix(current, next, transition);
        if (coverageBlend < 1.0)
          colour = mix(resolve(previousTable, uv, dx, dy, previousDetailLimit), colour, coverageBlend);
        skyColor = vec4(colour, 1.0);
      }
    `,
  });
}
