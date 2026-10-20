import { useLayoutEffect, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";

export default function CameraControls({ resetView }: { resetView: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    // Flush drag momentum before reset so damping cannot shift the saved view.
    const damping = orbit.enableDamping;
    orbit.enableDamping = false;
    orbit.update();
    orbit.reset();
    orbit.enableDamping = damping;
  }, [resetView]);
  return (
    <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={5} maxDistance={14} />
  );
}
