// Renders small three.js models into 2D sprites for the canvas map.
//
// Every model is lit and viewed the same way: an orthographic camera looking
// down from the south-south-east, with the sun in the north-west to match the
// lighting painted into the terrain. A bake is three images composited into
// one canvas: the shadow the model casts on the ground, a dark outline so the
// model reads on busy terrain, and the model itself.

import * as THREE from 'three';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** pixel position of the model's origin (its ground point) in the canvas */
  ox: number;
  oy: number;
  /** canvas pixels per model unit */
  ppu: number;
}

/** Extent of a bake around the origin, in model units on screen. */
export interface Frame {
  /** half width */
  r: number;
  /** above the origin */
  up: number;
  /** below the origin */
  down: number;
}

const DEG = Math.PI / 180;
/** Camera height above the horizon. */
const ELEVATION = 42 * DEG;
/** Camera swung this far east of due south, so models show a three-quarter view. */
const AZIMUTH = 24 * DEG;

const MODEL_LAYER = 1;
const OUTLINE = 'rgba(16,12,8,0.78)';

export class Baker {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private holder = new THREE.Group();
  private ground: THREE.Mesh;
  private sun: THREE.DirectionalLight;

  constructor() {
    const canvas = document.createElement('canvas');
    this.gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(1);
    this.gl.setClearColor(0x000000, 0);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x3a3024, 1.55);
    hemi.layers.enableAll();
    this.scene.add(hemi);

    // the sun, from the north-west (the terrain's lit faces point that way)
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.position.set(-40, 70, -30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.radius = 3;
    this.sun.shadow.bias = -0.002;
    const sc = this.sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 220;
    sc.layers.set(MODEL_LAYER);
    this.sun.layers.enableAll();
    this.scene.add(this.sun);

    // a soft fill from the camera side so faces turned away from the sun aren't black
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55);
    fill.position.set(30, 20, 60);
    fill.layers.enableAll();
    this.scene.add(fill);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ opacity: 0.42, color: 0x10140a }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.scene.add(this.holder);

    const d = 200;
    this.camera.position.set(Math.sin(AZIMUTH) * Math.cos(ELEVATION) * d, Math.sin(ELEVATION) * d, Math.cos(AZIMUTH) * Math.cos(ELEVATION) * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = 1;
    this.camera.far = 500;
  }

  /** Render `model` at `ppu` pixels per model unit. The model is not kept. */
  bake(model: THREE.Object3D, ppu: number, frame: Frame, opts: { outline?: boolean; shadow?: boolean } = {}): Sprite {
    const outline = opts.outline ?? true;
    const shadow = opts.shadow ?? true;
    const pad = outline ? 2 : 0;
    const w = Math.ceil(frame.r * 2 * ppu) + pad * 2;
    const h = Math.ceil((frame.up + frame.down) * ppu) + pad * 2;
    const ox = pad + frame.r * ppu;
    const oy = pad + frame.up * ppu;

    // a frustum that maps the origin to (ox, oy)
    const cam = this.camera;
    cam.left = -ox / ppu;
    cam.right = (w - ox) / ppu;
    cam.top = oy / ppu;
    cam.bottom = -(h - oy) / ppu;
    cam.updateProjectionMatrix();

    model.traverse((o) => {
      o.layers.set(MODEL_LAYER);
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.holder.add(model);
    this.gl.setSize(w, h, false);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;

    if (shadow) {
      cam.layers.set(0);
      this.gl.render(this.scene, cam);
      ctx.drawImage(this.gl.domElement, 0, 0);
    }

    cam.layers.set(MODEL_LAYER);
    this.gl.render(this.scene, cam);
    if (outline) {
      // dilate the silhouette by a pixel or so, in a dark ink
      const sil = document.createElement('canvas');
      sil.width = w;
      sil.height = h;
      const sctx = sil.getContext('2d')!;
      const r = Math.max(1, Math.min(2, ppu * 0.28));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        sctx.drawImage(this.gl.domElement, Math.cos(a) * r, Math.sin(a) * r);
      }
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = OUTLINE;
      sctx.fillRect(0, 0, w, h);
      ctx.drawImage(sil, 0, 0);
    }
    ctx.drawImage(this.gl.domElement, 0, 0);

    this.holder.remove(model);
    return { canvas: out, ox, oy, ppu };
  }
}
