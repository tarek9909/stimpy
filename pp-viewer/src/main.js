import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const status = document.getElementById('status');
const colors = document.getElementById('colors');
const customColor = document.getElementById('custom-color');

const SWATCHES = [
  ['White', '#d1d1d1'],
  ['Black', '#1c1c1e'],
  ['Grey', '#7d7f82'],
  ['Navy', '#1f2d4d'],
  ['Red', '#a8201f'],
  ['Forest', '#2c4a35'],
  ['Sand', '#c2ab86'],
];

function setupColors(model) {
  const materials = new Set();
  model.traverse((node) => {
    if (node.isMesh) materials.add(node.material);
  });

  const select = (hex, active) => {
    for (const material of materials) material.color.set(hex);
    for (const button of colors.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button === active));
    }
    customColor.parentElement.classList.toggle('active', active === customColor);
  };

  for (const [name, hex] of SWATCHES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = name;
    button.setAttribute('aria-label', name);
    button.style.background = hex;
    button.addEventListener('click', () => select(hex, button));
    customColor.parentElement.before(button);
  }
  customColor.addEventListener('input', () => select(customColor.value, customColor));

  select(SWATCHES[0][1], colors.querySelector('button'));
  colors.hidden = false;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8d8c88);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

// Soft lights on both sides so the white fleece keeps its folds from every angle.
for (const [x, y, z] of [[2, 3, 4], [-2, 3, -4]]) {
  const light = new THREE.DirectionalLight(0xffffff, 0.45);
  light.position.set(x, y, z);
  scene.add(light);
}

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;
controls.addEventListener('start', () => { controls.autoRotate = false; });

new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .load(
    '/pp.glb',
    ({ scene: model }) => {
      // Center on the origin and frame the camera to the model's size.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(box.getCenter(new THREE.Vector3()));
      scene.add(model);
      setupColors(model);

      const fit = Math.max(size.y, size.x / camera.aspect) / 2;
      const distance = (fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.25;
      // The hoodie's front faces -Z.
      camera.position.set(0, size.y * 0.1, -distance);
      controls.minDistance = distance * 0.2;
      controls.maxDistance = distance * 3;
      controls.update();
      status.remove();
    },
    (event) => {
      if (event.total) status.textContent = `Loading model… ${Math.round((event.loaded / event.total) * 100)}%`;
    },
    (error) => {
      console.error(error);
      status.textContent = 'Could not load the model. Run "npm run convert" first.';
    },
  );

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // Passing the delta keeps the auto-rotate speed the same on any refresh rate.
  controls.update(timer.getDelta());
  renderer.render(scene, camera);
});
