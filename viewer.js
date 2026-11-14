import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const get = id => document.getElementById(id);
const stage = get('stage');
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
stage.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, 1, 0.01, 150);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enablePan = false;
orbit.minDistance = 0.12;
orbit.maxDistance = 100;
const surface = new THREE.MeshStandardMaterial({
  color: 0xe5a986, roughness: 0.64, side: THREE.DoubleSide,
});
const fill = new THREE.HemisphereLight(0xfff3e9, 0x8a829d);
const key = new THREE.DirectionalLight(0xffe2d1);
const rim = new THREE.DirectionalLight(0xccddff);
rim.position.set(-3, 2, -4);
scene.add(fill, key, rim);
const presets = {
  studio: { fill: 1.25, key: 2.4, rim: 1.2, height: 4 },
  side: { fill: 0.5, key: 3.1, rim: 0.45, height: 0.7 },
  soft: { fill: 2.25, key: 0.95, rim: 0.7, height: 6 },
};
let model;
let radius = 1;
let loadId = 0;

function draw() {
  renderer.render(scene, camera);
}

function updateLighting() {
  const setup = presets[get('preset').value];
  const brightness = Number(get('strength').value);
  const degrees = Number(get('angle').value);
  const radians = THREE.MathUtils.degToRad(degrees);
  const factor = brightness / 100;
  fill.intensity = setup.fill * factor;
  key.intensity = setup.key * factor;
  rim.intensity = setup.rim * factor;
  key.position.set(Math.sin(radians) * 5, setup.height, Math.cos(radians) * 5);
  get('percent').value = brightness + '%';
  get('degrees').value = degrees + '°';
  draw();
}

function fit() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = 1.10 * radius / Math.sin(Math.min(vertical, horizontal));
  orbit.maxDistance = Math.max(100, 2 * distance);
  camera.far = orbit.maxDistance + 10;
  camera.updateProjectionMatrix();
  camera.position.set(1, 0.65, 1.5).setLength(distance);
  orbit.target.set(0, 0, 0);
  orbit.update();
  draw();
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  draw();
}

function dispose(object) {
  const geometries = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
  });
  geometries.forEach(geometry => geometry.dispose());
}

function show(object, name) {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (box.isEmpty() || !Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    dispose(object);
    throw new Error('Модель пуста или содержит некорректные координаты.');
  }
  const wrapper = new THREE.Group();
  object.position.sub(sphere.center);
  wrapper.add(object);
  wrapper.scale.setScalar(1 / sphere.radius);
  radius = 1;
  if (model) {
    scene.remove(model);
    dispose(model);
  }
  model = wrapper;
  scene.add(model);
  get('model-name').textContent = name;
  get('status').textContent = '';
  fit();
}

function demo() {
  loadId++;
  const sample = new THREE.Mesh(new THREE.TorusKnotGeometry(0.75, 0.26, 160, 24), surface);
  show(sample, 'Демонстрационная модель');
}

async function load(file) {
  if (!file) return;
  const current = ++loadId;
  const type = file.name.split('.').pop().toLowerCase();
  const status = get('status');
  if (!['stl', 'obj'].includes(type)) {
    status.textContent = 'Выберите файл STL или OBJ.';
    return;
  }
  status.textContent = 'Открывается ' + file.name + '…';
  try {
    const data = type === 'stl' ? await file.arrayBuffer() : await file.text();
    if (current !== loadId) return;
    let object;
    if (type === 'stl') {
      object = new THREE.Mesh(new STLLoader().parse(data), surface);
    } else {
      object = new OBJLoader().parse(data);
      const materials = new Set();
      let hasFaces = false;
      object.traverse(node => {
        if (!node.material) return;
        for (const material of [node.material].flat()) materials.add(material);
        if (node.isMesh && node.geometry.getAttribute('position')?.count >= 3) {
          node.material = surface;
          hasFaces = true;
        } else {
          node.visible = false;
          node.material = undefined;
        }
      });
      materials.forEach(material => material.dispose());
      if (!hasFaces) {
        dispose(object);
        throw new Error('В файле OBJ не найдены поверхности.');
      }
      const hidden = object.children.filter(node => !node.visible);
      hidden.forEach(node => { object.remove(node); dispose(node); });
    }
    show(object, file.name);
  } catch (error) {
    console.error(error);
    status.textContent = 'Не удалось открыть модель. Проверьте, что файл содержит корректную геометрию.';
  }
}

function zoom(factor) {
  const distance = THREE.MathUtils.clamp(camera.position.length() * factor, orbit.minDistance, orbit.maxDistance);
  camera.position.setLength(distance);
  orbit.update();
  draw();
}

orbit.addEventListener('change', draw);
new ResizeObserver(resize).observe(stage);
for (const id of ['preset', 'strength', 'angle']) get(id).addEventListener('input', updateLighting);
get('open').addEventListener('click', () => get('file').click());
get('file').addEventListener('change', event => {
  load(event.target.files[0]);
  event.target.value = '';
});
get('demo').addEventListener('click', demo);
get('fit').addEventListener('click', fit);
get('plus').addEventListener('click', () => zoom(0.8));
get('minus').addEventListener('click', () => zoom(1.25));
window.addEventListener('dragover', event => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
window.addEventListener('drop', event => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
stage.addEventListener('dragover', event => {
  if (event.dataTransfer.types.includes('Files')) stage.classList.add('drag');
});
stage.addEventListener('dragleave', event => {
  if (!stage.contains(event.relatedTarget)) stage.classList.remove('drag');
});
stage.addEventListener('drop', event => {
  event.preventDefault();
  stage.classList.remove('drag');
  load(event.dataTransfer.files[0]);
});
resize();
updateLighting();
demo();
get('open').disabled = false;
get('demo').disabled = false;
