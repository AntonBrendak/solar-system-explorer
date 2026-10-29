/** Shared by the cloud volume and its lightning so both see the same coverage. */
export const cloudCoverShader = /* glsl */ `
  uniform sampler2D uCloudFallback;

  float cloudCover(vec2 uv) {
    const float pi = 3.14159265359;
    vec2 drift = sin(uCloudPhase) * sin(uv.y * pi)
      * vec2(0.002, 0.0006 * sin(uv.x * 2.0 * pi));
    vec2 a = vec2(fract(uv.x + drift.x), clamp(uv.y + drift.y, 0.0, 1.0));
    vec2 b = vec2(fract(uv.x - drift.x), clamp(uv.y - drift.y, 0.0, 1.0));

    // This IR-derived feed has a bright high-latitude background and mirrored
    // poles, not measured cloud coverage there. Blend to the local artistic map
    // between 40 and 60 degrees instead of turning that background into fog.
    float latitude = abs(uv.y - 0.5) * 180.0;
    float fallbackWeight = smoothstep(40.0, 60.0, latitude);
    float fallback = textureLod(uCloudFallback, a, 0.75).g;
    if (fallbackWeight >= 1.0) return fallback;

    // Explicit mip sampling is stable inside the divergent volume march.
    float live = mix(textureLod(uCloudTexture, a, 0.75).a,
                     textureLod(uCloudNext, b, 0.75).a, uCloudBlend);
    return mix(live, fallback, fallbackWeight);
  }
`;
