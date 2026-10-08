// components/Garment3DViewer.jsx
//
// Real 3D t-shirt viewer — loads the .glb model, paints your Front/Back
// design elements onto it as decals, and lets the user click+drag to
// rotate (with gentle auto-rotate when idle), like a car configurator.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Decal } from "@react-three/drei";
import * as THREE from "three";
import { imageUrl } from "../utils/imageUrl";

const CANVAS_SIZE = 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws one side's text/image elements onto a square canvas, using the
// same x/y/width/height percentages as the flat 2D editor — so the
// design lines up the same way in 3D as it did while editing.
async function drawElementsToCanvas(elements) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  for (const el of sorted) {
    const x = (el.x / 100) * CANVAS_SIZE;
    const y = (el.y / 100) * CANVAS_SIZE;
    const w = (el.width / 100) * CANVAS_SIZE;
    const h = el.type === "image" ? (el.height / 100) * CANVAS_SIZE : w * 0.3;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(((el.rotation || 0) * Math.PI) / 180);

    if (el.type === "image") {
      try {
        const src = el.src.startsWith("http")
          ? el.src
          : imageUrl(el.src);
        const img = await loadImage(src);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } catch {
        // image failed to load — skip silently, don't break the whole render
      }
    } else {
      const fontSizePx = (el.fontSizePct / 100) * CANVAS_SIZE;
      ctx.font = `${el.bold ? "700" : "400"} ${el.italic ? "italic" : ""} ${fontSizePx}px "${el.fontFamily}", serif`;
      ctx.fillStyle = el.color || "#000";
      ctx.textAlign =
        el.align === "center"
          ? "center"
          : el.align === "right"
            ? "right"
            : "left";
      ctx.textBaseline = "middle";
      const textX =
        el.align === "center" ? 0 : el.align === "right" ? w / 2 : -w / 2;
      ctx.fillText(el.text, textX, 0);
    }
    ctx.restore();
  }

  return canvas;
}

function ShirtModel({
  color,
  frontCanvas,
  backCanvas,
  rightCanvas,
  leftCanvas,
  modelPath,
}) {
  const { nodes } = useGLTF(modelPath);

  const frontTexture = useMemo(() => {
    if (!frontCanvas) return null;
    const tex = new THREE.CanvasTexture(frontCanvas);
    tex.needsUpdate = true;
    return tex;
  }, [frontCanvas]);

  const backTexture = useMemo(() => {
    if (!backCanvas) return null;
    const tex = new THREE.CanvasTexture(backCanvas);
    tex.needsUpdate = true;
    return tex;
  }, [backCanvas]);

  const rightTexture = useMemo(() => {
    if (!rightCanvas) return null;
    const tex = new THREE.CanvasTexture(rightCanvas);
    tex.needsUpdate = true;
    return tex;
  }, [rightCanvas]);

  const leftTexture = useMemo(() => {
    if (!leftCanvas) return null;
    const tex = new THREE.CanvasTexture(leftCanvas);
    tex.needsUpdate = true;
    return tex;
  }, [leftCanvas]);

  // Works regardless of the exact mesh node name inside the .glb —
  // just grabs the first mesh it finds.
  const meshNode = useMemo(() => {
    const key = Object.keys(nodes).find((k) => nodes[k].isMesh);
    return nodes[key];
  }, [nodes]);

  // Measure the model's actual bounding box so decal positions/scale
  // adapt to THIS model's real dimensions instead of guessed numbers —
  // guessed numbers only "happen" to land on the surface for some
  // models and land off-surface (invisible) for others, which is why
  // right/left were missing entirely.
  const bounds = useMemo(() => {
    if (!meshNode) return null;
    meshNode.geometry.computeBoundingBox();
    return meshNode.geometry.boundingBox;
  }, [meshNode]);

  if (!meshNode || !bounds) return null;

  console.log("DEBUG bounds:", {
    sizeX: bounds.max.x - bounds.min.x,
    sizeY: bounds.max.y - bounds.min.y,
    sizeZ: bounds.max.z - bounds.min.z,
  });
  console.log(
    "DEBUG rightTexture:",
    !!rightTexture,
    "leftTexture:",
    !!leftTexture,
  );

  const sizeX = bounds.max.x - bounds.min.x;
  const sizeY = bounds.max.y - bounds.min.y;
  const sizeZ = bounds.max.z - bounds.min.z;
  const centerX = (bounds.max.x + bounds.min.x) / 2;
  const centerY = bounds.min.y + sizeY * 0.62; // chest height — a bit above vertical center
  const centerZ = (bounds.max.z + bounds.min.z) / 2;

  // Nudge just inside the surface (0.97 of the way to the edge) so the
  // Decal projector reliably lands ON the mesh instead of floating past it.
  const frontZ = centerZ + (sizeZ / 2) * 0.97;
  const backZ = centerZ - (sizeZ / 2) * 0.97;
  const rightX = centerX + (sizeX / 2) * 0.97;
  const leftX = centerX - (sizeX / 2) * 0.97;

  const frontBackScale = Math.min(sizeX, sizeY) * 0.55;
  const sideScale = Math.min(sizeZ, sizeY) * 0.45;

  return (
    <mesh geometry={meshNode.geometry} castShadow receiveShadow dispose={null}>
      <meshStandardMaterial color={color} roughness={1} metalness={0} />

      {frontTexture && (
        <Decal
          position={[centerX, centerY, frontZ]}
          rotation={[0, 0, 0]}
          scale={frontBackScale}
        >
          <meshStandardMaterial
            map={frontTexture}
            transparent
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </Decal>
      )}
      {backTexture && (
        <Decal
          position={[centerX, centerY, backZ]}
          rotation={[0, Math.PI, 0]}
          scale={frontBackScale}
        >
          <meshStandardMaterial
            map={backTexture}
            transparent
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </Decal>
      )}

      {rightTexture && (
        <Decal
          position={[rightX, centerY, centerZ]}
          rotation={[0, Math.PI / 2, 0]}
          scale={sideScale}
        >
          <meshStandardMaterial
            map={rightTexture}
            transparent
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </Decal>
      )}

      {leftTexture && (
        <Decal
          position={[leftX, centerY, centerZ]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={sideScale}
        >
          <meshStandardMaterial
            map={leftTexture}
            transparent
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </Decal>
      )}
    </mesh>
  );
}

export default function Garment3DViewer({
  frontElements,
  backElements,
  rightElements,
  leftElements,
  color = "#1B1B1B",
  modelPath,
}) {
  const [frontCanvas, setFrontCanvas] = useState(null);
  const [backCanvas, setBackCanvas] = useState(null);
  const [rightCanvas, setRightCanvas] = useState(null);
  const [leftCanvas, setLeftCanvas] = useState(null);

  useEffect(() => {
    let cancelled = false;
    drawElementsToCanvas(frontElements).then((c) => {
      if (!cancelled) setFrontCanvas(c);
    });
    return () => {
      cancelled = true;
    };
  }, [frontElements]);

  useEffect(() => {
    let cancelled = false;
    drawElementsToCanvas(backElements).then((c) => {
      if (!cancelled) setBackCanvas(c);
    });
    return () => {
      cancelled = true;
    };
  }, [backElements]);

  useEffect(() => {
    let cancelled = false;
    drawElementsToCanvas(rightElements).then((c) => {
      if (!cancelled) setRightCanvas(c);
    });
    return () => {
      cancelled = true;
    };
  }, [rightElements]);

  useEffect(() => {
    let cancelled = false;
    drawElementsToCanvas(leftElements).then((c) => {
      if (!cancelled) setLeftCanvas(c);
    });
    return () => {
      cancelled = true;
    };
  }, [leftElements]);

  return (
    <Canvas camera={{ position: [0, 0, 2.4], fov: 30 }} shadows>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 3]} intensity={1} castShadow />
      <directionalLight position={[-2, -1, -3]} intensity={0.3} />
      <Suspense fallback={null}>
        <ShirtModel
          color={color}
          frontCanvas={frontCanvas}
          backCanvas={backCanvas}
          rightCanvas={rightCanvas}
          leftCanvas={leftCanvas}
          modelPath={modelPath}
        />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={2.5}
        minPolarAngle={Math.PI / 2.2}
        maxPolarAngle={Math.PI / 2.2}
      />
    </Canvas>
  );
}
