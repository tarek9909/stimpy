// The 3D avatar: a stylized character already wearing a hoodie, hair and sneakers
// ("Hoodie Character" from Quaternius' Ultimate Modular Men pack, CC0), restyled in
// the brand colours. The Stimpie is a curved panel on its back with four snap studs.
// Posed and rendered deterministically from song time, then drawn into the 2D frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cardCanvas, CARD_ASPECT } from './cards';
import type { HoodieOpts } from './hoodie';
import { BEAT } from './song';

const W = 1080, H = 1920;
const PPM1 = 900; // screen pixels per metre at s = 1
const FOV = 30;
const TARGET_H = 1.78; // metres
const BEND = 1.2; // card curvature (hugs the back)
const WIDE = 1.16, DEEP = 1.08; // a broader build than the stock character

// brand restyle, by the model's material names
const RESTYLE: Record<string, { color: number; roughness: number; sheen?: number }> = {
  Purple: { color: 0x1c1c20, roughness: 0.88, sheen: 1 }, // the hoodie
  LightBlue: { color: 0x2f4666, roughness: 0.9 }, // jeans
  Red_Dark: { color: 0x151515, roughness: 0.6 }, // sneaker trim
  White: { color: 0xf1ede6, roughness: 0.6 }, // sneakers, socks
  Hair: { color: 0x1d1510, roughness: 0.55 },
  Skin: { color: 0xd9a47f, roughness: 0.7 },
  Eyebrows: { color: 0x1d1510, roughness: 0.7 },
  Eye: { color: 0x151515, roughness: 0.3 },
};

function textTexture(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Avatar {
  ready = false;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 100);
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  bones: Record<string, THREE.Bone> = {};
  slot = new THREE.Group();
  card!: THREE.Mesh;
  cardMat!: THREE.MeshStandardMaterial;
  studs: THREE.Mesh[] = [];
  outline!: THREE.LineLoop;
  textures = new Map<number, THREE.Texture>();
  backY = 1.1;
  partsFrom = '';
  hoodUp = true;
  cardW = 0.3;
  cardH = 0.3 / CARD_ASPECT;
  key = new THREE.DirectionalLight(0xffffff, 2.3);
  rimL = new THREE.DirectionalLight(0xffffff, 0);
  rimR = new THREE.DirectionalLight(0xffffff, 0);
  hemi = new THREE.HemisphereLight(0x9a9aa2, 0x111112, 0.8);
  shadowMat = new THREE.ShadowMaterial({ opacity: 0.22 });

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  async load(url: string) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    this.model = model;
    if (this.partsFrom) {
      // wardrobe swap: jeans + sneakers from another character on the same skeleton
      const donor = (await loader.loadAsync(this.partsFrom)).scene;
      const byName: Record<string, THREE.Bone> = {};
      model.traverse((o) => { if ((o as THREE.Bone).isBone) byName[o.name] = o as THREE.Bone; });
      const drop: THREE.Object3D[] = [];
      model.traverse((o) => { if (/_Legs$|_Feet$/.test(o.name)) drop.push(o); });
      const parent = drop[0]?.parent ?? model;
      drop.forEach((o) => o.removeFromParent());
      const take: THREE.Object3D[] = [];
      donor.traverse((o) => { if (/_Legs$|_Feet$/.test(o.name)) take.push(o); });
      for (const part of take) {
        part.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (!m.isSkinnedMesh) return;
          const skel = new THREE.Skeleton(m.skeleton.bones.map((b) => byName[b.name]), m.skeleton.boneInverses);
          m.bind(skel, m.bindMatrix);
        });
        parent.add(part);
      }
    }

    // stand him on the floor at a human height
    model.updateMatrixWorld(true);
    const box0 = new THREE.Box3().setFromObject(model, true);
    const k = TARGET_H / (box0.max.y - box0.min.y);
    model.scale.multiplyScalar(k);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    model.position.y -= box.min.y;
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.scale.x *= WIDE;
    model.scale.z *= DEEP;
    model.updateMatrixWorld(true);

    // restyle + collect the hoodie surface
    const hoodieMeshes: THREE.SkinnedMesh[] = [];
    const headMeshes: THREE.SkinnedMesh[] = [];
    const hairMeshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const r = RESTYLE[src.name];
      if (src.name !== 'Hair' && src.name !== 'Eye' && src.name !== 'Eyebrows') {
        // soften the low-poly facets: weld and re-smooth the normals
        const g = m.geometry.clone();
        g.deleteAttribute('normal');
        const merged = mergeVertices(g, 1e-4);
        merged.computeVertexNormals();
        m.geometry = merged;
      }
      if (r) {
        m.material = r.sheen
          ? new THREE.MeshPhysicalMaterial({ color: r.color, roughness: r.roughness, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x5a5a64) })
          : new THREE.MeshStandardMaterial({ color: r.color, roughness: r.roughness });
      }
      if (m.isSkinnedMesh && (m.parent?.name.includes('Head') || m.name.includes('Head'))) headMeshes.push(m);
      if (src.name === 'Hair') hairMeshes.push(m);
      if (src.name === 'Purple' && m.isSkinnedMesh && (m.parent?.name.includes('Body') || m.name.includes('Body'))) hoodieMeshes.push(m);
    });

    // oversized: inflate the hoodie along its normals (roomier body, baggy sleeves,
    // longer hem). Distances in metres, converted to each mesh's own units.
    const v = new THREE.Vector3();
    for (const m of hoodieMeshes) {
      const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
      const world: THREE.Vector3[] = [];
      for (let i = 0; i < P.count; i++) {
        m.getVertexPosition(i, v);
        world.push(v.clone().applyMatrix4(m.matrixWorld));
      }
      const wb = new THREE.Box3().setFromPoints(world);
      const gb = new THREE.Box3().setFromBufferAttribute(P as THREE.BufferAttribute);
      const unit = (gb.max.y - gb.min.y) / (wb.max.y - wb.min.y); // mesh units per metre (up axis)
      const upAxis = gb.max.y - gb.min.y > gb.max.z - gb.min.z ? 1 : 2;
      const halfTorso = (wb.max.x - wb.min.x) * 0.2;
      for (let i = 0; i < P.count; i++) {
        const p = world[i];
        const low = (wb.max.y - p.y) / (wb.max.y - wb.min.y); // 0 at the collar, 1 at the hem
        const sleeve = Math.abs(p.x) > halfTorso;
        let d = sleeve ? 0.03 : 0.028 + 0.03 * low;
        if (sleeve && p.y < wb.min.y + 0.12) d *= 0.6; // cuffs gather
        let dx = N.getX(i) * d, dy = N.getY(i) * d, dz = N.getZ(i) * d;
        if (!sleeve && low > 0.9) {
          // longer hem
          const drop = 0.05 * (low - 0.9) / 0.1;
          if (upAxis === 1) dy -= drop; else dz -= drop;
        }
        P.setXYZ(i, P.getX(i) + dx * unit, P.getY(i) + dy * unit, P.getZ(i) + dz * unit);
      }
      P.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }

    // measure the hoodie (bind pose, world units)
    const pts: THREE.Vector3[] = [];
    for (const m of hoodieMeshes) {
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, v);
        pts.push(v.clone().applyMatrix4(m.matrixWorld));
      }
    }
    const hb = new THREE.Box3().setFromPoints(pts);
    const torso = pts.filter((p) => Math.abs(p.x) < (hb.max.x - hb.min.x) * 0.2);
    const tb = new THREE.Box3().setFromPoints(torso);
    const hemY = tb.min.y, neckY = tb.max.y;
    // the hood hangs from the collar; the stimpie sits below it
    const hoodTop = neckY - 0.015, hoodH = 0.19, hoodBot = hoodTop - hoodH;
    const cardTop = this.hoodUp ? neckY - 0.07 : hoodBot - 0.02;
    this.cardH = Math.min(cardTop - (hemY + 0.05), (neckY - hemY) * 0.62);
    this.cardW = this.cardH * CARD_ASPECT;
    this.backY = cardTop - this.cardH / 2;
    // centre on the spine, not on the bounding box
    const spineX = (this.bones['Torso'] ?? this.bones['Chest']).getWorldPosition(new THREE.Vector3()).x;
    const yT = this.backY + this.cardH / 2, yB = this.backY - this.cardH / 2;
    let zBack = 0, zFront = 0;
    for (const p of torso) {
      if (Math.abs(p.x - spineX) < this.cardW / 2 && p.y > yB - 0.02 && p.y < yT + 0.02) zBack = Math.min(zBack, p.z);
      if (Math.abs(p.x - 0.08) < 0.05 && Math.abs(p.y - (neckY - 0.13)) < 0.05) zFront = Math.max(zFront, p.z);
    }

    // the stimpie: curved to hug the back
    const CW = this.cardW, CH = this.cardH;
    const geo = new THREE.PlaneGeometry(CW, CH, 24, 8);
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setZ(i, -BEND * gp.getX(i) * gp.getX(i));
    geo.computeVertexNormals();
    this.cardMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
    this.card = new THREE.Mesh(geo, this.cardMat);
    this.card.castShadow = true;
    this.slot.add(this.card);
    const studMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa0, metalness: 0.9, roughness: 0.3, emissive: 0xff2a1a, emissiveIntensity: 0 });
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const x = sx * (CW / 2 - 0.013), y = sy * (CH / 2 - 0.013);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), studMat);
      s.position.set(x, y, -BEND * x * x + 0.003);
      s.scale.z = 0.5;
      this.slot.add(s);
      this.studs.push(s);
    }
    const ol = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
      const x = (sx * CW) / 2;
      return new THREE.Vector3(x, (sy * CH) / 2, -BEND * x * x + 0.002);
    });
    this.outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ol),
      new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0 }),
    );
    this.slot.add(this.outline);
    this.slot.position.set(spineX, this.backY, zBack - 0.012);
    this.slot.rotation.y = Math.PI;

    // the hood, down: a rounded pouch hanging from the collar with a point and a centre seam
    let zHood = 0;
    for (const p of torso) if (p.y > hoodBot - 0.02 && p.y < hoodTop + 0.02 && Math.abs(p.x) < 0.15) zHood = Math.min(zHood, p.z);
    const hood = new THREE.BufferGeometry();
    const HU = 28, HV = 18, hp: number[] = [], hi: number[] = [];
    const hoodPt = (u: number, vv: number) => {
      const halfW = 0.165 * (1 - Math.pow(vv, 2.2) * 0.86);
      const x = u * halfW;
      const y = hoodTop - vv * hoodH;
      const bulge = 0.05 * (1 - u * u) * Math.sin(Math.PI * (0.12 + 0.8 * vv));
      const tuck = Math.pow(1 - vv, 3) * 0.045; // top edge folds into the collar
      return [x, y, zHood - 0.008 - bulge + tuck];
    };
    for (let j = 0; j <= HV; j++) for (let i = 0; i <= HU; i++) hp.push(...hoodPt((i / HU) * 2 - 1, j / HV));
    for (let j = 0; j < HV; j++) for (let i = 0; i < HU; i++) {
      const a = j * (HU + 1) + i, b = a + 1, c = a + HU + 1, d2 = c + 1;
      hi.push(a, c, b, b, c, d2);
    }
    hood.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    hood.setIndex(hi);
    hood.computeVertexNormals();
    const fabric = new THREE.MeshPhysicalMaterial({ color: RESTYLE.Purple.color, roughness: 0.88, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x5a5a64), side: THREE.DoubleSide });
    const hoodMesh = new THREE.Mesh(hood, fabric);
    hoodMesh.castShadow = true;
    const seamPts: THREE.Vector3[] = [];
    for (let j = 0; j <= HV; j++) {
      const [x, y, z] = hoodPt(0, j / HV);
      seamPts.push(new THREE.Vector3(x, y, z - 0.002));
    }
    const seam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seamPts), new THREE.LineBasicMaterial({ color: 0x050506 }));
    const rimPts: THREE.Vector3[] = [];
    for (let i = 0; i <= HU; i++) {
      const [x, y, z] = hoodPt((i / HU) * 2 - 1, 0.04);
      rimPts.push(new THREE.Vector3(x, y, z - 0.003));
    }
    const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: 0x3a3a40 }));

    // hood up: rings around the head sized from the head + hair, face opening at the front
    const hv = new THREE.Vector3();
    const headPts: THREE.Vector3[] = [];
    for (const m of headMeshes) {
      if (hairMeshes.includes(m)) continue; // size to the head, not the spikes
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        m.getVertexPosition(i, hv);
        headPts.push(hv.clone().applyMatrix4(m.matrixWorld));
      }
    }
    const hbx = new THREE.Box3().setFromPoints(headPts);
    const hcx = (hbx.min.x + hbx.max.x) / 2, hcz = (hbx.min.z + hbx.max.z) / 2;
    const upGeo = new THREE.BufferGeometry();
    {
      const NR = 22, NA = 48, y0 = neckY - 0.03, y1 = hbx.max.y + 0.03;
      const rows: number[][] = [];
      const P: number[] = [];
      let prev: number[] | null = null;
      for (let r = 0; r < NR; r++) {
        const u = r / (NR - 1);
        const y = y0 + (y1 - y0) * u;
        const rad = new Array(NA).fill(0);
        for (const p of headPts) {
          if (Math.abs(p.y - y) > 0.025) continue;
          const a = Math.atan2(p.z - hcz, p.x - hcx);
          const b = Math.floor((a / (Math.PI * 2) + 0.5) * NA) % NA;
          rad[b] = Math.max(rad[b], Math.hypot(p.x - hcx, p.z - hcz));
        }
        for (let it = 0; it < NA && rad.some((q) => q === 0); it++) {
          const c = rad.slice();
          for (let a = 0; a < NA; a++) if (!c[a]) rad[a] = Math.max(c[(a + 1) % NA], c[(a + NA - 1) % NA]) || (prev ? prev[a] : 0.1);
        }
        // a clean rounded shell: heavy smoothing around the ring, blended toward its mean
        for (let pass = 0; pass < 6; pass++) {
          const c = rad.slice();
          for (let a = 0; a < NA; a++) rad[a] = (c[(a + NA - 1) % NA] + 2 * c[a] + c[(a + 1) % NA]) / 4;
        }
        const mean = rad.reduce((x, y) => x + y, 0) / NA;
        for (let a = 0; a < NA; a++) rad[a] = mean * 0.55 + rad[a] * 0.45;
        const base = rad.slice();
        const crown = Math.max(0, (u - 0.72) / 0.28);
        const row: number[] = [];
        for (let a = 0; a < NA; a++) {
          const ang = (a / NA - 0.5) * Math.PI * 2;
          const back = Math.max(0, -Math.sin(ang));
          let rr = rad[a] + 0.035 + back * 0.03;
          rr = Math.max(rr, u < 0.25 ? 0.12 - u * 0.1 : 0); // drapes onto the collar
          rr *= Math.sqrt(Math.max(0.02, 1 - crown * crown * 0.94));
          rad[a] = rr;
          row.push(P.length / 3);
          P.push(hcx + Math.cos(ang) * rr, y, hcz + Math.sin(ang) * rr - crown * 0.03);
        }
        // smooth around the ring
        prev = base; // raw head size, so margins never compound ring to ring
        rows.push(row);
      }
      // close the crown
      const top = P.length / 3;
      P.push(hcx, y1 + 0.005, hcz - 0.035);
      const idx: number[] = [];
      const faceLo = hbx.min.y + 0.035, faceHi = hbx.max.y - 0.055;
      for (let r = 0; r < NR - 1; r++) {
        const yA = y0 + (y1 - y0) * ((r + 0.5) / (NR - 1));
        for (let a = 0; a < NA; a++) {
          const ang = ((a + 0.5) / NA - 0.5) * Math.PI * 2;
          if (Math.sin(ang) > 0.42 && yA > faceLo && yA < faceHi) continue; // the face opening
          const a2 = (a + 1) % NA;
          idx.push(rows[r][a], rows[r + 1][a], rows[r + 1][a2], rows[r][a], rows[r + 1][a2], rows[r][a2]);
        }
      }
      for (let a = 0; a < NA; a++) idx.push(rows[NR - 1][a], top, rows[NR - 1][(a + 1) % NA]);
      upGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      upGeo.setIndex(idx);
      upGeo.computeVertexNormals();
    }
    const hoodUpMesh = new THREE.Mesh(upGeo, fabric);
    hoodUpMesh.castShadow = true;
    const upSeamPts: THREE.Vector3[] = [];
    {
      // centre seam over the crown, from the forehead to the nape
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const ang = Math.PI * (0.5 + t); // front (+z) over the top to the back (-z)
        const ry = (hbx.max.y - hbx.min.y) * 0.5 + 0.035;
        const rz = (hbx.max.z - hbx.min.z) * 0.5 + 0.04;
        const cy = (hbx.min.y + hbx.max.y) / 2 + 0.01;
        upSeamPts.push(new THREE.Vector3(hcx, cy + Math.sin(ang - Math.PI / 2) * -ry * Math.sin(Math.PI * t) + (1 - Math.sin(Math.PI * t)) * 0, hcz));
      }
    }

    // chest print (front = brand)
    const print = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.0275),
      new THREE.MeshStandardMaterial({
        transparent: true, roughness: 0.8,
        map: textTexture((c, w, h) => {
          c.fillStyle = '#ece6da';
          c.font = '900 76px ArchivoX';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('STIMPY', w / 2, h / 2 - 4);
        }, 512, 128),
      }),
    );
    print.position.set(0.08, neckY - 0.13, zFront + 0.006);

    const chest = this.bones['Chest'] ?? this.bones['Torso'];
    this.scene.add(model);
    model.updateMatrixWorld(true);
    const mid = this.bones['Torso'] ?? chest;
    this.scene.add(this.slot);
    mid.attach(this.slot);
    for (const o of this.hoodUp ? [print] : [print, hoodMesh, seam, rim]) {
      this.scene.add(o);
      chest.attach(o);
    }
    if (this.hoodUp) {
      const head = this.bones['Head'] ?? chest;
      this.scene.add(hoodUpMesh);
      head.attach(hoodUpMesh);
      hairMeshes.forEach((h) => (h.visible = false)); // tucked inside the hood
    }

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.split('|').pop()!;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      this.actions[name] = a;
    }

    // stage
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.shadowMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor, this.hemi, this.key, this.rimL, this.rimR, this.key.target);
    this.key.position.set(-0.9, 4.2, -2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -1.5;
    this.key.shadow.camera.right = 1.5;
    this.key.shadow.camera.top = 2.2;
    this.key.shadow.camera.bottom = -0.5;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.radius = 6;
    this.rimL.position.set(-2.4, 2.4, 2.6);
    this.rimR.position.set(2.4, 2.0, 2.6);
    this.ready = true;
  }

  private tex(n: number) {
    let t = this.textures.get(n);
    if (!t) {
      t = new THREE.CanvasTexture(cardCanvas(n));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.textures.set(n, t);
    }
    return t;
  }

  private lastKey = '';
  pose(o: HoodieOpts) {
    const key = JSON.stringify([o.t, o.x, o.y, o.s, o.walkAmt, o.turn, o.sad]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const A = this.actions;
    const walkW = Math.min(1, o.walkAmt);
    const idleW = 1 - walkW;
    const set = (name: string, w: number, time: number) => {
      const a = A[name];
      if (!a) return;
      a.enabled = true;
      a.setEffectiveWeight(w);
      a.time = time;
    };
    const dw = A.Walk?.getClip().duration ?? 1;
    set('Walk', walkW, ((((o.t / (2 * BEAT)) % 1) + 1) % 1) * dw); // two steps per two beats: on the beat
    set('Idle_Neutral', idleW, o.t % (A.Idle_Neutral?.getClip().duration ?? 1));
    this.mixer.update(0);
    // sad: head hangs, shoulders slump
    const sad = o.sad ?? 0;
    if (sad > 0) {
      const b = this.bones;
      b.Neck?.rotateX(0.45 * sad);
      b.Head?.rotateX(0.25 * sad);
      b.Chest?.rotateX(0.12 * sad);
    }
    this.model.rotation.y = o.turn ?? 0;
    this.model.updateMatrixWorld(true);

    const ppm = PPM1 * o.s;
    const d = H / (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * ppm);
    const cx = (o.x - W / 2) / ppm, cy = this.backY + (o.y - H / 2) / ppm;
    this.camera.position.set(cx, cy, -d);
    this.camera.lookAt(cx, cy, 0);
    this.camera.updateMatrixWorld(true);
  }

  slotRect(o: HoodieOpts) {
    this.pose(o);
    const pts = [[-1, 1], [1, 1], [-1, -1]].map(([sx, sy]) => {
      const x = (sx * this.cardW) / 2;
      const v = new THREE.Vector3(x, (sy * this.cardH) / 2, -BEND * x * x);
      this.slot.localToWorld(v);
      v.project(this.camera);
      return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
    });
    const [tl, tr, bl] = pts;
    const w = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
    const h = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
    let rot = Math.atan2(tl[1] - tr[1], tl[0] - tr[0]);
    if (Math.abs(rot) > Math.PI / 2) rot = Math.atan2(tr[1] - tl[1], tr[0] - tl[0]);
    return { cx: (tr[0] + bl[0]) / 2, cy: (tr[1] + bl[1]) / 2, w, h, rot };
  }

  draw(ctx: CanvasRenderingContext2D, o: HoodieOpts) {
    this.pose(o);
    const rimCol = new THREE.Color(o.rim ?? '#ffffff');
    const rim = o.rimAmt ?? 0;
    this.rimL.color.copy(rimCol);
    this.rimR.color.copy(rimCol);
    this.rimL.intensity = rim * 6;
    this.rimR.intensity = rim * 4.5;
    this.hemi.color.set(o.tint ?? '#9a9aa2');
    this.hemi.intensity = 0.8 + (o.tintAmt ?? 0) * 4;

    const on = o.card != null;
    this.card.visible = on;
    if (on) {
      const t = this.tex(o.card!);
      if (this.cardMat.map !== t) {
        this.cardMat.map = t;
        this.cardMat.needsUpdate = true;
      }
    }
    const settle = 1 + 0.05 * (o.cardSettle ?? 0);
    this.card.scale.set(settle, settle, 1);
    (this.outline.material as THREE.LineBasicMaterial).opacity = on ? 0 : Math.max(0.25, o.slotGlow ?? 0);
    const studMat = this.studs[0].material as THREE.MeshStandardMaterial;
    studMat.emissiveIntensity = Math.max(o.snapFlash ?? 0, (o.slotGlow ?? 0) * 0.6) * 3;

    this.renderer.render(this.scene, this.camera);
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
    ctx.restore();
  }
}

export const avatar = new Avatar();
