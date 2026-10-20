import { useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import CameraControls from "./CameraControls";
import { DoubleSide, Quaternion, Vector3 } from "three";
import { FACE_COLORS, faceletGeometry } from "../lib/facelets";
export default function FaceletCube({ value, color, disabled, onChange, transparent = false, resetView = 0, children }: {
  value: string;
  color: string;
  disabled: boolean;
  onChange: (value: string) => void;
  transparent?: boolean;
  resetView?: number;
  children?: ReactNode;
}) {
  const stickers = useMemo(() => faceletGeometry.map(sticker => ({
    position: sticker.position.clone().addScaledVector(sticker.normal, 0.51),
    rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), sticker.normal),
  })), []);
  return (
    <div className={`cube-stage ${transparent ? "is-see-through" : ""}`} aria-label="3D cube input: drag to orbit, select a sticker to paint">
      <Canvas camera={{ position: [5, 4.3, 5], fov: 38 }} dpr={[1, 2]}
        fallback={<p>3D needs WebGL. Use the 2D or Text view to edit your cube.</p>}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[4, 8, 5]} intensity={2.5} />
        {!transparent && <mesh><boxGeometry args={[2.98, 2.98, 2.98]} /><meshStandardMaterial color="#202c29" /></mesh>}
        {stickers.map((sticker, index) => (
          <mesh key={index} position={sticker.position} quaternion={sticker.rotation}
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled && index % 9 !== 4 && event.delta < 5)
                onChange(value.padEnd(54, "?").slice(0, index) + color + value.padEnd(54, "?").slice(index + 1));
            }}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshStandardMaterial color={FACE_COLORS[value[index]] ?? "#ccc"} roughness={0.36}
              side={DoubleSide} transparent={transparent} opacity={transparent ? 0.35 : 1} depthWrite={!transparent} />
          </mesh>
        ))}
        <CameraControls resetView={resetView} />
      </Canvas>
      {children}
    </div>
  );
}
