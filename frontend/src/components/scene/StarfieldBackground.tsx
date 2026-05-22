import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { SKY_TEXTURE_URL } from "../../lib/planetAssets";
import { useOptionalTexture } from "../../lib/planetTexture";

const FALLBACK_BG = "#030312";

export default function StarfieldBackground() {
  const texture = useOptionalTexture(SKY_TEXTURE_URL);
  const { scene } = useThree();

  useEffect(() => {
    const previous = scene.background;

    if (texture) {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 16;
      scene.background = texture;
    } else {
      scene.background = new THREE.Color(FALLBACK_BG);
    }

    return () => {
      scene.background = previous;
    };
  }, [scene, texture]);

  return null;
}