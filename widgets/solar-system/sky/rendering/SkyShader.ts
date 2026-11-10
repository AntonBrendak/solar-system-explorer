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
      in vec2 atlasUV;
      layout(location = 0) out vec4 skyColor;
      vec3 resolve(sampler2D pages, vec2 uv) {
        if (detailsEnabled > 0.5) {
          for (int level = 2; level >= 0; level--) {
            float columns = (16384.0 * exp2(float(level))) / pageCore;
            vec2 grid = vec2(columns, columns * 0.5);
            float rowOffset = level == 0 ? 0.0 : (level == 1 ? tableSize.x * 0.125 : tableSize.x * 0.375);
            vec2 cell = floor(uv * grid);
            cell = clamp(cell, vec2(0.0), grid - 1.0);
            float layer = texelFetch(pages, ivec2(cell + vec2(0.0, rowOffset)), 0).r - 1.0;
            if (layer >= 0.0) {
              vec2 local = clamp(uv * grid - cell, 0.0, 1.0);
              vec2 sampleUV = (vec2(2.0) + local * pageCore) / (pageCore + 4.0);
              return texture(skyPages, vec3(sampleUV, layer)).rgb;
            }
          }
        }
        return texture(skyBase, uv).rgb;
      }
      void main() {
        vec2 uv = vec2(fract(atlasUV.x), clamp(atlasUV.y, 0.0, 1.0));
        vec3 current = resolve(previousTable, uv);
        vec3 next = transition > 0.0 ? resolve(nextTable, uv) : current;
        skyColor = vec4(mix(current, next, transition), 1.0);
      }
    `,
  });
}
