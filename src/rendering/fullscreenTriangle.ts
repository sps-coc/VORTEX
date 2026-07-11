import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Material,
  Mesh,
  OrthographicCamera
} from "three";

export const fullscreenCamera: Camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

export function createFullscreenTriangle(material: Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  return new Mesh(geometry, material);
}
