import { Rotation_EQJ_ECT } from "astronomy-engine";
import { Matrix4, type Quaternion } from "three";

const basis = new Matrix4();

/** NASA UVs: RA=0 at centre, RA increases left. Atlas local axes are (EQJ x,z,y).
 * The sky group reflects local Z; this proper rotation then maps into (ECT x,z,-y).
 * See https://svs.gsfc.nasa.gov/4851/ and Astronomy Engine Rotation_EQJ_ECT.
 */
export function updateCelestialRotation(date: Date, target: Quaternion) {
  const r = Rotation_EQJ_ECT(date).rot;
  basis.set(
    r[0][0],
    r[2][0],
    -r[1][0],
    0,
    r[0][2],
    r[2][2],
    -r[1][2],
    0,
    -r[0][1],
    -r[2][1],
    r[1][1],
    0,
    0,
    0,
    0,
    1,
  );
  return target.setFromRotationMatrix(basis);
}
