import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import CameraControls from "./CameraControls";
import { DoubleSide, Group, Quaternion } from "three";
import { algorithmStates, moveInfo, isInMove, type Cubie, type CubeSize } from "../lib/cube";
import { isRelevantSticker, type StickerFocus } from "../lib/stickerFocus";
const colors = [
  "#65b99a",
  "#6297ed",
  "#f5d54f",
  "#f5f5eb",
  "#e9574e",
  "#ff9c39",
];
// Box face order: right, left, up, down, front, back.
const faces = [
  { position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0] },
  { position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0] },
  { position: [0, 0, 0.501], rotation: [0, 0, 0] },
  { position: [0, 0, -0.501], rotation: [0, Math.PI, 0] },
] satisfies {
  position: [number, number, number];
  rotation: [number, number, number];
}[];
function Model({
  moves,
  step,
  transparent,
  maskIrrelevant,
  focus,
  initialState,
  size = 3,
}: {
  moves: string[];
  step: number;
  transparent: boolean;
  maskIrrelevant: boolean;
  focus: StickerFocus;
  initialState?: Cubie[];
  size?: CubeSize;
}) {
  const states = useMemo(
    () => algorithmStates(moves, initialState, size),
    [moves, initialState, size],
  );
  const refs = useRef<(Group | null)[]>([]),
    progress = useRef(0);
  useLayoutEffect(() => {
    progress.current = 0;
  }, [states]);
  useLayoutEffect(() => {
    // Long reduction solutions must seek directly rather than replay every skipped move.
    if (Math.abs(step - progress.current) > 2) progress.current = step;
  }, [step]);
  useFrame((_, dt) => {
    const delta = step - progress.current;
    progress.current =
      Math.abs(delta) < 0.008
        ? step
        : progress.current +
          Math.sign(delta) * Math.min(Math.abs(delta), dt * 2.8);
    const base = Math.min(Math.floor(progress.current), moves.length),
      fraction = progress.current - base;
    const info = base < moves.length ? moveInfo(moves[base], size) : null;
    const q = info
      ? new Quaternion().setFromAxisAngle(info.vector, info.angle * fraction)
      : new Quaternion();
    states[base].forEach((c, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.position.copy(c.position);
      mesh.quaternion.copy(c.rotation);
      if (info && isInMove(c, info)) {
        mesh.position.applyQuaternion(q);
        mesh.quaternion.premultiply(q);
      }
    });
  });
  return (
    <group scale={3 / size}>
      {states[0].map((c, i) => (
        <group
          key={c.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          scale={0.94}
        >
          {!transparent && (
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#202c29" roughness={0.5} />
            </mesh>
          )}
          {colors.map((color, face) => {
            const exterior = [
              c.home[0] === (size - 1) / 2,
              c.home[0] === -(size - 1) / 2,
              c.home[1] === (size - 1) / 2,
              c.home[1] === -(size - 1) / 2,
              c.home[2] === (size - 1) / 2,
              c.home[2] === -(size - 1) / 2,
            ][face];
            if (!exterior) return null;
            return (
              <mesh
                key={face}
                position={faces[face].position}
                rotation={faces[face].rotation}
              >
                <planeGeometry args={[0.9, 0.9]} />
                <meshStandardMaterial
                  color={
                    maskIrrelevant && !isRelevantSticker(c.home, face, focus, size)
                      ? "#000000"
                      : color
                  }
                  roughness={0.36}
                  metalness={0.05}
                  side={DoubleSide}
                  transparent={transparent}
                  opacity={transparent ? 0.35 : 1}
                  depthWrite={!transparent}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
const defaultView: [number, number, number] = [5, 4.3, 5];
export default function Cube({
  moves,
  step,
  transparent,
  resetView,
  maskIrrelevant,
  focus,
  initialState,
  size = 3,
}: {
  moves: string[];
  step: number;
  transparent: boolean;
  resetView: number;
  maskIrrelevant: boolean;
  focus: StickerFocus;
  initialState?: Cubie[];
  size?: CubeSize;
}) {
  return (
    <Canvas
      camera={{ position: defaultView, fov: 38 }}
      dpr={[1, 2]}
      fallback={<p>3D needs a browser with WebGL support.</p>}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 8, 5]} intensity={2.5} />
      <Suspense fallback={null}>
        <Model
          {...{ moves, step, transparent, maskIrrelevant, focus, initialState, size }}
        />
      </Suspense>
      <CameraControls resetView={resetView} />
    </Canvas>
  );
}
