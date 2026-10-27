import { useMemo } from "react";
import { FrontSide, type Vector3 } from "three";

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vSunDirection;

  uniform vec3 uSunDirection;

  void main() {
    // Положение вершины относительно камеры
    vec4 viewPosition =
      modelViewMatrix * vec4(position, 1.0);

    // Нормаль поверхности в координатах камеры
    vNormal = normalize(normalMatrix * normal);

    // Направление от вершины к камере
    vViewDirection = normalize(-viewPosition.xyz);

    // Переводим направление Солнца
    // в те же координаты
    vSunDirection = normalize(
      (viewMatrix * vec4(uSunDirection, 0.0)).xyz
    );

    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying vec3 vSunDirection;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);
    vec3 sunDir = normalize(vSunDirection);

    // 1. Угол между поверхностью и камерой
    float viewAngle = max(
      dot(normal, viewDir),
      0.0
    );

    // 2. Усиливаем атмосферу у горизонта
    float fresnel = pow(
      1.0 - viewAngle,
      3.0
    );

    // 3. Плавно убираем жёсткую внешнюю границу
    float edgeFade = smoothstep(
      0.0,
      0.18,
      viewAngle
    );

    // 4. Освещённость атмосферы Солнцем
    float sunAngle = dot(normal, sunDir);

    float sunlight = smoothstep(
      -0.15,
      0.5,
      sunAngle
    );

    // 5. Цвет атмосферы
    vec3 deepBlue = vec3(0.04, 0.12, 0.45);
    vec3 skyBlue = vec3(0.18, 0.53, 0.95);

    float colorMix = smoothstep(
      -0.1,
      0.7,
      sunAngle
    );

    vec3 atmosphereColor = mix(
      deepBlue,
      skyBlue,
      colorMix
    );

    // 6. Итоговая прозрачность
    float alpha =
      fresnel *
      edgeFade *
      sunlight *
      0.65;

    gl_FragColor = vec4(
      atmosphereColor,
      alpha
    );
  }
`;

export default function EarthAtmosphere({
  sunDirection,
}: {
  sunDirection: Vector3;
}) {
  const uniforms = useMemo(
    () => ({ uSunDirection: { value: sunDirection } }),
    [sunDirection],
  );
  return (
    <mesh>
      <sphereGeometry args={[2.055, 128, 128]} />

      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={FrontSide}
      />
    </mesh>
  );
}
