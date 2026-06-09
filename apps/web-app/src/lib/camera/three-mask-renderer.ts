import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CameraEffectsState } from "$lib/camera/effects";
import { FACE_OVAL_INDICES, LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from "$lib/camera/face-region-indices";
import type { FaceLandmarkerResult } from "$lib/camera/tracking";

type Landmark = { x: number; y: number; z: number };

type MappedPoint = readonly [x: number, y: number, z: number];

function computeCoverTransform(
    videoWidth: number,
    videoHeight: number,
    displayWidth: number,
    displayHeight: number,
) {
    if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
        return { scale: 1, offsetX: 0, offsetY: 0 };
    }

    const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
    return {
        scale,
        offsetX: (displayWidth - videoWidth * scale) / 2,
        offsetY: (displayHeight - videoHeight * scale) / 2,
    };
}

function averagePoint(points: MappedPoint[], indices: readonly number[]) {
    let count = 0;
    let totalX = 0;
    let totalY = 0;
    let totalZ = 0;

    for (const index of indices) {
        const point = points[index];
        if (!point) {
            continue;
        }
        count += 1;
        totalX += point[0];
        totalY += point[1];
        totalZ += point[2];
    }

    if (count === 0) {
        return [0, 0, 0] as const;
    }

    return [totalX / count, totalY / count, totalZ / count] as const;
}

function getBBox(points: MappedPoint[], indices: readonly number[]) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const index of indices) {
        const point = points[index];
        if (!point) {
            continue;
        }
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
    }

    if (!Number.isFinite(minX)) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
}

export class ThreeMaskRenderer {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.OrthographicCamera;
    private readonly root: THREE.Group;
    private readonly loader: GLTFLoader;
    private modelObject: THREE.Object3D | null = null;
    private modelUrl: string | null = null;
    private width = 1;
    private height = 1;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: false,
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);

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
        this.width = Math.max(1, Math.round(width));
        this.height = Math.max(1, Math.round(height));

        this.renderer.setSize(this.width, this.height, false);
        this.camera.left = 0;
        this.camera.right = this.width;
        this.camera.top = this.height;
        this.camera.bottom = 0;
        this.camera.updateProjectionMatrix();
    }

    async setModelUrl(url: string | null) {
        if (url === this.modelUrl) {
            return;
        }

        this.modelUrl = url;

        if (this.modelObject) {
            this.root.remove(this.modelObject);
            this.disposeObject(this.modelObject);
            this.modelObject = null;
        }

        if (!url) {
            return;
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

        this.modelObject = model;
        this.root.add(model);
    }

    clear() {
        this.renderer.clear();
    }

    render(
        result: FaceLandmarkerResult | null,
        videoEl: HTMLVideoElement,
        effects: CameraEffectsState,
    ) {
        if (!result?.faceLandmarks?.length || !this.modelObject || effects.mode !== "mask-3d") {
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
            this.height,
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

        const leftEye = averagePoint(mapped, LEFT_EYE_INDICES);
        const rightEye = averagePoint(mapped, RIGHT_EYE_INDICES);
        const nose = mapped[1] ?? averagePoint(mapped, FACE_OVAL_INDICES);

        const eyeCenterX = (leftEye[0] + rightEye[0]) * 0.5;
        const eyeCenterY = (leftEye[1] + rightEye[1]) * 0.5;
        const eyeSpread = Math.max(1, rightEye[0] - leftEye[0]);

        const roll = Math.atan2(rightEye[1] - leftEye[1], eyeSpread);
        const yaw = THREE.MathUtils.clamp((nose[0] - eyeCenterX) / eyeSpread, -1, 1) * 0.85;
        const pitch = THREE.MathUtils.clamp((nose[1] - eyeCenterY) / faceHeight - 0.18, -1, 1) * 0.9;

        const centerX = nose[0] + faceWidth * effects.mask3d.offsetX;
        const centerY = nose[1] + faceHeight * effects.mask3d.offsetY;
        const scaleValue = faceWidth * effects.mask3d.scale;

        this.root.position.set(centerX, this.height - centerY, 0);
        this.root.scale.set(scaleValue, scaleValue, scaleValue);
        this.root.rotation.set(pitch, yaw, -roll);

        this.setObjectOpacity(this.root, effects.mask3d.opacity);

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        if (this.modelObject) {
            this.disposeObject(this.modelObject);
            this.modelObject = null;
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
}

