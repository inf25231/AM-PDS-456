import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CameraEffectsState } from '$lib/camera/effects';
import {
  FACE_OVAL_INDICES,
  computeCoverTransform,
  averagePoint,
  getBBox,
  computeDownscaledSize
} from 'camera-core';
import type { FaceLandmarkerResult } from '$lib/camera/tracking';

type Landmark = { x: number; y: number; z: number };

/**
 * Head rotation from MediaPipe's own solved face-transform matrix
 * (`facialTransformationMatrixes`, requested via
 * `outputFacialTransformationMatrixes: true` in tracking.ts). MediaPipe
 * already solves full 3D head pose from its face geometry model -- this
 * reuses that directly instead of re-deriving pitch/yaw/roll from landmark
 * positions by hand.
 *
 * The matrix is column-major (matches `THREE.Matrix4.fromArray` directly --
 * no transpose needed). Yaw, pitch, and roll are used as-is (no axis
 * flipping needed -- verified against our scene's rotation convention by
 * live testing on a real device).
 */
function extractHeadRotationFromMatrix(
  matrix: { rows: number; columns: number; data: number[] } | undefined
): THREE.Euler | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length !== 16) {
    return null;
  }

  const transform = new THREE.Matrix4().fromArray(matrix.data);
  const rotation = new THREE.Quaternion();
  transform.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());

  const euler = new THREE.Euler().setFromQuaternion(rotation, 'YXZ');
  return new THREE.Euler(euler.x, euler.y, euler.z);
}

// Face-oval landmarks measure cheek-to-cheek width, not full head width (no
// ears/hair/volume), so the model is scaled up from the raw face bbox to
// read as "head sized" rather than "face sized". This is an approximation:
// it assumes the uploaded .glb's bounding box is roughly head-only. Models
// that include extra geometry in their bounding box (shoulders, a wide
// base/stand, long hair) will end up UNDER-scaled, since their measured
// width is wider than their actual visible head — the manual "Scale" slider
// in the effects panel exists specifically to correct for this per model.
const FACE_TO_HEAD_WIDTH_FACTOR = 2.6;

function normalizeBlendshapeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Rendering the mask at the camera's full native resolution (up to 1920x1080
// for the "1080p" quality preset) with antialiasing is unnecessarily
// expensive on mobile GPUs that are already busy running MediaPipe's
// face-landmark inference concurrently -- but on desktop, where GPU headroom
// isn't the bottleneck, the same downscale + no-antialias trade-off is a
// pure (and visible) quality regression with no perf benefit. So both are
// gated behind `lowPower` (mobile viewport), decided by the caller.
//
// When capping resolution, the orthographic camera's projection stays
// mapped to the full logical video-pixel space (see `resize()`), so this
// only affects the actual pixel density of the render target, not the
// mask's position/scale math.
const MAX_RENDER_DIMENSION_LOW_POWER = 640;

export interface ThreeMaskRendererOptions {
  /** Trade visual quality for GPU headroom (mobile viewports). */
  lowPower?: boolean;
}

export class ThreeMaskRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly root: THREE.Group;
  private readonly loader: GLTFLoader;
  private readonly lowPower: boolean;
  private modelObject: THREE.Object3D | null = null;
  private modelUrl: string | null = null;
  private width = 1;
  private height = 1;
  /** Model's real width after being normalized to a unit max-dimension at load time. */
  private modelWidthNormalized = 1;
  private lastRequestedWidth = 0;
  private lastRequestedHeight = 0;
  private morphMeshes: THREE.Mesh[] = [];
  private morphNormalizedDicts = new Map<THREE.Mesh, Map<string, number>>();
  private blendshapeSmooth = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, options: ThreeMaskRendererOptions = {}) {
    this.lowPower = options.lowPower ?? false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      // Antialiasing roughly doubles fragment-shader cost for a marginal
      // visual gain on what's ultimately a small, video-composited overlay --
      // only worth skipping on GPU-constrained mobile devices.
      antialias: !this.lowPower
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(120, 240, 320);
    const fillLight = new THREE.DirectionalLight(0x99c7ff, 0.45);
    fillLight.position.set(-180, -80, 200);

    this.scene.add(ambientLight);
    this.scene.add(keyLight);
    this.scene.add(fillLight);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.loader = new GLTFLoader();
  }

  resize(width: number, height: number) {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));

    if (nextWidth === this.lastRequestedWidth && nextHeight === this.lastRequestedHeight) {
      return;
    }

    this.lastRequestedWidth = nextWidth;
    this.lastRequestedHeight = nextHeight;
    this.width = nextWidth;
    this.height = nextHeight;

    // Keep the camera's projection mapped to the full logical (video-pixel)
    // space so all the mask position/scale math elsewhere stays in those
    // coordinates. On low-power (mobile) devices, cap the actual WebGL
    // render-buffer resolution -- aspect ratio preserved so nothing looks
    // stretched, it's just fewer pixels for the fragment shader to fill.
    // On desktop, render at full resolution (no perf need, and downscaling
    // here would just be a visible quality regression for no benefit).
    const { width: renderWidth, height: renderHeight } = this.lowPower
      ? computeDownscaledSize(this.width, this.height, MAX_RENDER_DIMENSION_LOW_POWER)
      : { width: this.width, height: this.height };

    this.renderer.setSize(renderWidth, renderHeight, false);
    this.camera.left = 0;
    this.camera.right = this.width;
    this.camera.top = this.height;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Loads (or clears) the active model.
   *
   * @returns the number of UNIQUE blendshape (morph target) names found
   *   across all meshes of the model. Returns 0 when the URL is unchanged,
   *   cleared, or the model exposes no morph targets.
   */
  async setModelUrl(url: string | null): Promise<number> {
    if (url === this.modelUrl) {
      return 0;
    }

    this.modelUrl = url;

    if (this.modelObject) {
      this.root.remove(this.modelObject);
      this.disposeObject(this.modelObject);
      this.modelObject = null;
    }

    if (!url) {
      return 0;
    }

    const gltf = await this.loader.loadAsync(url);
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    model.position.sub(center);

    const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);
    const normalizeScale = 1 / maxDimension;
    model.scale.setScalar(normalizeScale);
    this.modelWidthNormalized = Math.max(size.x * normalizeScale, 0.0001);
    model.rotation.y = 0;

    this.modelObject = model;

    // Collect meshes that expose ARKit-style morph targets, and gather the
    // set of UNIQUE blendshape names across all of them (a model may split
    // morph targets over several meshes, e.g. head + eyes).
    this.morphMeshes = [];
    this.morphNormalizedDicts.clear();
    this.blendshapeSmooth.clear();
    const blendshapeNames = new Set<string>();
    model.traverse((node) => {
      if (node instanceof THREE.Mesh && node.morphTargetDictionary && node.morphTargetInfluences) {
        this.morphMeshes.push(node);

        // Precompute a normalized-name -> morph index map ONCE per mesh at
        // load time, instead of re-normalizing + linearly scanning the
        // dictionary for every blendshape category on every render frame.
        const normDict = new Map<string, number>();
        for (const [name, idx] of Object.entries(node.morphTargetDictionary)) {
          blendshapeNames.add(name);
          normDict.set(normalizeBlendshapeName(name), idx);
        }
        this.morphNormalizedDicts.set(node, normDict);
      }
    });

    this.root.add(model);

    // Opacity is always fully visible and never changes at runtime, so set
    // it once here rather than traversing + touching materials every frame.
    this.setObjectOpacity(model, 1);

    return blendshapeNames.size;
  }

  clear() {
    this.renderer.clear();
  }

  render(
    result: FaceLandmarkerResult | null,
    videoEl: HTMLVideoElement,
    effects: CameraEffectsState
  ) {
    if (!videoEl.videoWidth || !videoEl.videoHeight) {
      this.clear();
      return;
    }

    if (!result?.faceLandmarks?.length || !this.modelObject || !effects.model.enabled) {
      this.clear();
      return;
    }

    // MediaPipe already solves full 3D head rotation for us -- if it's
    // missing for this frame, skip rendering rather than guessing.
    const headRotation = extractHeadRotationFromMatrix(result.facialTransformationMatrixes?.[0]);
    if (!headRotation) {
      this.clear();
      return;
    }

    const points = result.faceLandmarks[0] as Landmark[];
    if (!points?.length) {
      this.clear();
      return;
    }

    const { scale, offsetX, offsetY } = computeCoverTransform(
      videoEl.videoWidth,
      videoEl.videoHeight,
      this.width,
      this.height
    );

    const mapped = points.map((point) => {
      const x = point.x * videoEl.videoWidth * scale + offsetX;
      const y = point.y * videoEl.videoHeight * scale + offsetY;
      const z = point.z * videoEl.videoWidth * scale;
      return [x, y, z] as const;
    });

    const faceBBox = getBBox(mapped, FACE_OVAL_INDICES);
    const faceWidth = Math.max(1, faceBBox.maxX - faceBBox.minX);
    const faceHeight = Math.max(1, faceBBox.maxY - faceBBox.minY);
    const nose = mapped[1] ?? averagePoint(mapped, FACE_OVAL_INDICES);

    const yawOffset = THREE.MathUtils.degToRad(effects.model.rotationY || 0);
    const centerX = nose[0] + faceWidth * effects.model.offsetX;
    const centerY = nose[1] + faceHeight * effects.model.offsetY;

    // Auto-fit: scale the model so its OWN real width (measured from the
    // loaded GLTF's bounding box at load time) matches the detected face
    // width, instead of guessing a generic size.
    const targetHeadWidth = faceWidth * FACE_TO_HEAD_WIDTH_FACTOR;
    const scaleValue = (targetHeadWidth / this.modelWidthNormalized) * effects.model.scale;

    this.root.position.set(centerX, this.height - centerY, 0);
    this.root.scale.set(scaleValue, scaleValue, scaleValue);
    this.root.rotation.set(headRotation.x, headRotation.y + yawOffset, headRotation.z);

    this.applyBlendshapes(result);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.modelObject) {
      this.disposeObject(this.modelObject);
      this.modelObject = null;
      this.morphMeshes = [];
      this.morphNormalizedDicts.clear();
      this.blendshapeSmooth.clear();
    }
    this.renderer.dispose();
  }

  private setObjectOpacity(object: THREE.Object3D, opacity: number) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }

      const material = node.material;
      const apply = (mat: THREE.Material) => {
        const withOpacity = mat as THREE.Material & {
          opacity?: number;
          transparent?: boolean;
          needsUpdate?: boolean;
        };
        withOpacity.opacity = opacity;
        withOpacity.transparent = opacity < 1;
        withOpacity.needsUpdate = true;
      };

      if (Array.isArray(material)) {
        for (const item of material) {
          apply(item);
        }
        return;
      }

      if (material) {
        apply(material);
      }
    });
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }

      node.geometry?.dispose();

      const material = node.material;
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
        return;
      }

      material?.dispose();
    });
  }

  private applyBlendshapes(result: FaceLandmarkerResult) {
    const categories = result.faceBlendshapes?.[0]?.categories;
    if (!categories || this.morphMeshes.length === 0) return;

    const SMOOTH = 0.5;

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary!;
      const normDict = this.morphNormalizedDicts.get(mesh);
      const influences = mesh.morphTargetInfluences!;

      for (const cat of categories) {
        const name = cat.categoryName || cat.displayName;
        if (!name) continue;

        // Fast path: exact key match. Fallback: O(1) lookup in the
        // precomputed normalized-name map (built once at model load)
        // instead of a per-frame linear scan over the whole dictionary.
        let idx: number | undefined = dict[name];
        if (idx === undefined && normDict) {
          idx = normDict.get(normalizeBlendshapeName(name));
        }
        if (idx === undefined) continue;

        const prev = this.blendshapeSmooth.get(name) ?? 0;
        const next = prev + (cat.score - prev) * (1 - SMOOTH);
        this.blendshapeSmooth.set(name, next);

        influences[idx] = next;
      }
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
